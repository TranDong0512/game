/* Dịch — port từ server.js, gọi thẳng Google/MyMemory qua http adapter. */
import { UA, cjkCount } from './util.js';

const BROWSER_HEADERS = {
  'User-Agent': UA,
  Accept: '*/*',
  'Accept-Language': 'zh-CN,zh;q=0.9,vi;q=0.8,en;q=0.6',
  'sec-ch-ua': '"Chromium";v="126", "Not)A;Brand";v="24"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'cross-site',
};

const GOOGLE_CLIENTS = ['dict-chrome-ex', 'at', 'gtx'];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function textOf(res) {
  if (res.text != null) return res.text;
  const b = res.bytes;
  return new TextDecoder('utf-8').decode(b instanceof Uint8Array ? b : new Uint8Array(b || []));
}

async function googleTranslate(http, q, sl, tl, method = 'GET') {
  let lastErr = new Error('Google không phản hồi');
  for (const client of GOOGLE_CLIENTS) {
    try {
      const base =
        `https://translate.googleapis.com/translate_a/single?client=${client}` +
        `&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&dt=t`;
      const url = method === 'GET' ? `${base}&q=${encodeURIComponent(q)}` : base;
      const opts =
        method === 'GET'
          ? { headers: BROWSER_HEADERS, timeoutMs: 20000 }
          : {
              method: 'POST',
              headers: { ...BROWSER_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
              body: new URLSearchParams({ q }).toString(),
              timeoutMs: 20000,
            };
      const res = await http.request(url, opts);
      if (!res.ok) {
        lastErr = new Error('Google HTTP ' + res.status + ' (' + client + ')');
        continue;
      }
      const data = JSON.parse(textOf(res));
      if (Array.isArray(data) && Array.isArray(data[0])) {
        const text = data[0].map((seg) => (Array.isArray(seg) ? seg[0] : '')).join('');
        if (text.trim()) return text;
      }
      lastErr = new Error('Phản hồi Google rỗng (' + client + ')');
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

async function googleBatch(http, q, sl, tl) {
  const url =
    'https://clients5.google.com/translate_a/t?client=dict-chrome-ex' +
    `&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&q=${encodeURIComponent(q)}`;
  const res = await http.request(url, { headers: BROWSER_HEADERS, timeoutMs: 20000 });
  if (!res.ok) throw new Error('Google batch HTTP ' + res.status);
  const data = JSON.parse(textOf(res));
  if (Array.isArray(data) && typeof data[0] === 'string' && data[0].trim()) return data[0];
  throw new Error('Phản hồi Google batch rỗng');
}

function splitForMyMemory(text, limit) {
  const parts = [];
  let buf = '';
  const pieces = text.split(/(?<=[。！？…；])/).filter(Boolean);
  for (const p of pieces) {
    if ((buf + p).length > limit && buf) {
      parts.push(buf);
      buf = '';
    }
    if (p.length > limit) {
      if (buf) {
        parts.push(buf);
        buf = '';
      }
      for (let i = 0; i < p.length; i += limit) parts.push(p.slice(i, i + limit));
    } else {
      buf += p;
    }
  }
  if (buf) parts.push(buf);
  return parts;
}

async function myMemoryTranslate(http, q, sl, tl) {
  // dịch từng dòng để giữ nguyên ngắt đoạn
  const outLines = [];
  for (const line of q.split('\n')) {
    if (!line.trim()) continue;
    const out = [];
    for (const p of splitForMyMemory(line, 140)) {
      const res = await http.request(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(p)}&langpair=${encodeURIComponent(sl + '|' + tl)}`,
        { timeoutMs: 20000 }
      );
      if (!res.ok) throw new Error('MyMemory HTTP ' + res.status);
      const j = JSON.parse(textOf(res));
      const t = j?.responseData?.translatedText;
      // hết hạn mức MyMemory vẫn trả HTTP 200 kèm câu cảnh báo → không được coi là bản dịch
      if (Number(j?.responseStatus) !== 200 || !t || /MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(t)) {
        throw new Error('MyMemory: ' + (j?.responseDetails || t || 'trả về rỗng'));
      }
      out.push(t);
      await sleep(200);
    }
    outLines.push(out.join(' '));
  }
  return outLines.join('\n');
}

/* Bản dịch có đủ không? còn nhiều chữ Hán hoặc ngắn bất thường → coi như thiếu */
export function checkTranslation(src, out) {
  const srcCjk = cjkCount(src);
  const outCjk = cjkCount(out || '');
  if (!out || !out.trim()) return 'rỗng';
  if (srcCjk >= 20 && outCjk > srcCjk * 0.2) return `còn ${outCjk} chữ Hán chưa dịch`;
  if (srcCjk >= 20 && out.trim().length < srcCjk * 0.9) return 'bản dịch ngắn bất thường (có thể bị cắt)';
  return '';
}

export async function translateChunk(http, q, sl = 'zh-CN', tl = 'vi') {
  const engines = [
    ['google', () => googleTranslate(http, q, sl, tl, 'GET')],
    ['google', () => googleTranslate(http, q, sl, tl, 'POST')],
    ['google', () => googleBatch(http, q, sl, tl)],
    ['mymemory', () => myMemoryTranslate(http, q, sl, tl)],
  ];
  let lastErr;
  let best = null;
  for (const [name, fn] of engines) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const text = await fn();
        const problem = checkTranslation(q, text);
        if (!problem) return { text, engine: name };
        lastErr = new Error('Bản dịch thiếu: ' + problem);
        if (text && text.trim() && (!best || cjkCount(text) < cjkCount(best.text))) best = { text, engine: name };
        await sleep(600);
      } catch (e) {
        lastErr = e;
        await sleep(600);
      }
    }
  }
  // mọi engine đều chưa đạt → trả bản tốt nhất nhưng đánh dấu để app cảnh báo
  if (best) return { ...best, partial: true, warning: lastErr && lastErr.message };
  throw lastErr || new Error('Không dịch được');
}
