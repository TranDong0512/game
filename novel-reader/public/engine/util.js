/* Engine port từ server.js — thuần JS, không phụ thuộc Node. */
export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Dấu hiệu quảng cáo / điều hướng của trang (KHÔNG gồm những từ hay gặp trong truyện
// như 别忘了, 广告, APP… — trước đây các từ này làm mất cả đoạn truyện).
export const AD_RE =
  /请收藏|笔趣阁|最快更新|最新网址|手机用户|一秒记住|记住本站|加入书签|投推荐票|推荐票.{0,6}(月票|收藏)|www\.|https?:\/\/|[a-z0-9-]+\.(com|net|org|cc|la|info|xyz|top|me|co)\b|更新最快|天才一秒|温馨提示|收藏本站|无弹窗|纯文字|请记住|打开支付宝|关注微信|微信公众号|章节错误|内容举报|本书首发|首发域名|上一章|下一章|返回目录|顶点小说|起点中文|最新章节|记住本书|防迷路|手机版|下载地址|点击进入|更多小说|txt下载|加载中|＋一＋本＋读|一本读|ybdu|下载.{0,8}APP|APP.{0,4}(阅读|下载)|本章未完|点击下一页/i;

// Dòng ngắn chứa dấu hiệu quảng cáo → bỏ cả dòng. Dòng dài (đoạn truyện bị chèn
// quảng cáo) → chỉ bỏ câu chứa quảng cáo, giữ phần truyện.
export function stripAdLine(line) {
  if (!AD_RE.test(line)) return line;
  if (line.length <= 60) return '';
  const parts = line.split(/(?<=[。！？!?…”」])/);
  return parts.filter((p) => !AD_RE.test(p)).join('').trim();
}

export function decodeEntities(str) {
  const named = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
    hellip: '…', mdash: '—', ndash: '–', ldquo: '“', rdquo: '”',
    lsquo: '‘', rsquo: '’', times: '×', copy: '©',
  };
  return str.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, ent) => {
    if (ent[0] === '#') {
      const code =
        ent[1] === 'x' || ent[1] === 'X' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    const v = named[ent] ?? named[ent.toLowerCase()];
    return v !== undefined ? v : m;
  });
}

export function cjkCount(s) {
  const m = s.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g);
  return m ? m.length : 0;
}

export function stripNoise(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
}

export function decodeHtml(bytes, contentType) {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  let enc = ((contentType || '').match(/charset\s*=\s*["']?([\w-]+)/i) || [])[1];
  if (!enc) {
    const head = latin1(buf.subarray(0, 4000));
    const m = head.match(/charset\s*=\s*["']?([\w-]+)/i);
    if (m) enc = m[1];
  }
  enc = (enc || '').toLowerCase();
  const tryDec = (e) => {
    try {
      return new TextDecoder(e, { fatal: false }).decode(buf);
    } catch {
      return null;
    }
  };
  let text = null;
  if (enc.includes('gb')) text = tryDec('gbk');
  else if (enc.includes('big5')) text = tryDec('big5');
  if (text === null) text = tryDec('utf-8');
  if (text === null) text = tryDec('gb18030') || tryDec('windows-1252') || '';
  const bad = (text.match(/\uFFFD/g) || []).length;
  if (bad > 30) {
    for (const e of ['gbk', 'big5']) {
      const alt = tryDec(e);
      if (alt && (alt.match(/\uFFFD/g) || []).length < bad / 2) {
        text = alt;
        break;
      }
    }
  }
  return text;
}

function latin1(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

export function extractBalanced(html, start, tag) {
  const re = new RegExp(`</?${tag}\\b[^>]*>`, 'gi');
  re.lastIndex = start;
  let depth = 0;
  let m;
  while ((m = re.exec(html))) {
    if (m[0][1] === '/') {
      depth -= 1;
      if (depth <= 0) return html.slice(start, m.index + m[0].length);
    } else if (!/\/>$/.test(m[0])) {
      depth += 1;
    }
  }
  return html.slice(start);
}

export function cleanFragment(frag) {
  let s = frag
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|h[1-6]|li|tr|blockquote)>/gi, '\n')
    .replace(/<(p|div|section|article|h[1-6]|li|tr|blockquote)[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[\u00a0\u3000]/g, ' ')
    .replace(/\uFEFF/g, '');
  s = decodeEntities(s);
  const lines = s
    .split(/\n+/)
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .map(stripAdLine)
    .filter((l) => l.length > 0)
    .filter((l) => cjkCount(l) > 0 || /[a-zA-Z]{4,}/.test(l));
  return lines.join('\n');
}

export function fallbackExtract(doc) {
  const text = decodeEntities(
    doc
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|section|article|li|h[1-6]|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[\u00a0\u3000]/g, ' ')
  );
  const lines = text
    .split(/\n+/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .map(stripAdLine)
    .filter((l) => l.length >= 8);
  let best = [];
  let run = [];
  for (const l of lines) {
    const cjk = cjkCount(l);
    if (cjk >= 6 && cjk / l.length > 0.4) {
      run.push(l);
    } else {
      if (run.join('').length > best.join('').length) best = run;
      run = [];
    }
  }
  if (run.join('').length > best.join('').length) best = run;
  return best.join('\n');
}

export function extractContent(doc) {
  const tagRe = /<(div|article|section)\b([^>]*)>/gi;
  const HINT_ID =
    /^(?:content|chaptercontent|chapter_content|chapterContent|booktxt|booktext|txt|nr1|nr|html|text_area|text|showtxt|article|articlecontent|readcontent|read_content|chapter|contentbox|bookcontent)$/i;
  const HINT_CL =
    /content|showtxt|txtnovel|readarea|read-content|box_con|novelcontent|bookcontent|article|entry-content|postcontent|the_content|txt|chapter|read/i;
  let m;
  let best = '';
  let bestScore = 0;
  while ((m = tagRe.exec(doc))) {
    const attrs = m[2];
    const idm = attrs.match(/\bid\s*=\s*["']([^"']+)["']/i);
    const clm = attrs.match(/\bclass\s*=\s*["']([^"']+)["']/i);
    const idc = idm ? idm[1] : '';
    const clc = clm ? clm[1] : '';
    const hinted = (idc && HINT_ID.test(idc)) || (clc && HINT_CL.test(clc)) || m[1] === 'article';
    if (!hinted) continue;
    const frag = extractBalanced(doc, m.index, m[1]);
    if (!frag || frag.length < 250) continue;
    const txt = cleanFragment(frag);
    const cjk = cjkCount(txt);
    const score = cjk + (/。|！|？/.test(txt) ? 400 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = txt;
    }
    tagRe.lastIndex = m.index + m[0].length;
  }
  const fb = fallbackExtract(doc);
  if (cjkCount(fb) > cjkCount(best) * 1.2) return fb;
  if (cjkCount(best) < 60 && cjkCount(fb) >= 60) return fb;
  return best || fb;
}

export function extractTitle(doc) {
  const clean = (s) =>
    decodeEntities((s || '').replace(/<[^>]+>/g, ''))
      .replace(/\s+/g, ' ')
      .trim();
  const og = clean(
    (doc.match(/<meta[^>]+property\s*=\s*["']og:title["'][^>]+content\s*=\s*["']([^"']*)["']/i) ||
      doc.match(/<meta[^>]+content\s*=\s*["']([^"']*)["'][^>]+property\s*=\s*["']og:title["']/i) ||
      [])[1]
  );
  const ogSite = clean(
    (doc.match(/<meta[^>]+property\s*=\s*["']og:site_name["'][^>]+content\s*=\s*["']([^"']*)["']/i) ||
      [])[1]
  );
  const h1Raw = clean((doc.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]);
  const h1 = cjkCount(h1Raw) >= 2 && h1Raw.length <= 120 ? h1Raw : '';
  const t = clean((doc.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);

  const CHAP_RE = /第\s*[0-9０-９零一二三四五六七八九十百千万两]+\s*[章节回卷]/;
  const isSite = (s) =>
    /文学|小说网|笔趣阁|阅读网|书屋|全本|在线看书|顶点|起点中文|无弹窗|最新更新/i.test(s) ||
    /\.(com|net|org|cc|la|co)$/i.test(s);
  const stripJunk = (s) =>
    s
      .replace(/(最新章节|章节目录|全文阅读|无弹窗|txt下载|在线阅读|笔趣阁|更新最快|纯文字).*/i, '')
      .replace(/[-–—]?\s*(番茄小说|飞卢小说网|起点中文网).*/i, '')
      .replace(/[,，。.、]+$/, '')
      .trim();

  const segs = t
    .split(/\s*[,，|·_]+\s*|\s+[-–—]\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  let bookTitle = '';
  if (ogSite && !isSite(ogSite) && cjkCount(ogSite) >= 2) bookTitle = stripJunk(ogSite);
  if (!bookTitle) {
    const cand = segs.filter((s) => !isSite(s) && cjkCount(s) >= 2 && !CHAP_RE.test(s));
    const pool = cand.length ? cand : segs.filter((s) => cjkCount(s) >= 2 && !CHAP_RE.test(s));
    if (pool.length) bookTitle = stripJunk(pool[0]);
  }
  if (!bookTitle) bookTitle = stripJunk(segs[0] || '') || 'Truyện';
  if (bookTitle.length > 40) bookTitle = bookTitle.slice(0, 40);

  let chapterTitle = '';
  if (h1) {
    chapterTitle = h1;
    const normBook = bookTitle.replace(/\s+/g, '');
    if (normBook.length >= 2 && h1.replace(/\s+/g, '').startsWith(normBook)) {
      chapterTitle = h1.slice(h1.indexOf(bookTitle) + bookTitle.length).trim() || h1;
    }
  } else {
    chapterTitle = segs.find((s) => CHAP_RE.test(s)) || og || segs[0] || 'Chương';
  }
  if (!chapterTitle) chapterTitle = 'Chương';
  if (chapterTitle.length > 90) chapterTitle = chapterTitle.slice(0, 90);
  if (chapterTitle === bookTitle) chapterTitle = segs.find((s) => CHAP_RE.test(s)) || chapterTitle;

  return { chapterTitle, bookTitle, h1Raw };
}

export function extractChapters(doc, baseUrl) {
  const out = [];
  const seenHref = new Set();
  const seenTitle = new Set();
  const re = /<a\s[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(doc))) {
    const href = m[1].trim();
    if (/^(javascript|mailto|data):/i.test(href) || href.startsWith('#')) continue;
    const title = decodeEntities(m[2].replace(/<[^>]+>/g, ''))
      .replace(/\s+/g, ' ')
      .trim();
    if (!title || title.length > 40) continue;
    if (!/第\s*[0-9０-９零一二三四五六七八九十百千万两]+\s*[章节回卷]/.test(title)) continue;
    let abs;
    try {
      abs = new URL(href, baseUrl).href;
    } catch {
      continue;
    }
    const tkey = title.replace(/\s+/g, '');
    if (seenTitle.has(tkey) || seenHref.has(abs)) continue;
    seenTitle.add(tkey);
    seenHref.add(abs);
    out.push({ title, url: abs });
    if (out.length >= 3000) break;
  }
  return out;
}

export function extractPrevNext(doc, baseUrl) {
  const re = /<a\s[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let prev = null;
  let next = null;
  let toc = null;
  let nextPage = null;
  let m;
  while ((m = re.exec(doc))) {
    const href = m[1].trim();
    if (/^(javascript|mailto|data):/i.test(href) || href.startsWith('#')) continue;
    const text = decodeEntities(m[2].replace(/<[^>]+>/g, ''))
      .replace(/\s+/g, ' ')
      .trim();
    const attrs = m[0];
    const rel = ((attrs.match(/rel\s*=\s*["']([^"']+)["']/i) || [])[1] || '').toLowerCase();
    let abs;
    try {
      abs = new URL(href, baseUrl).href;
    } catch {
      continue;
    }
    if (!prev && (rel.includes('prev') || /^(上一章|上一篇|前一章|上一节|上一回)/.test(text))) {
      prev = abs;
    }
    if (!next && /^(下一章|下一篇|下一节|下一回)/.test(text)) {
      next = abs;
    }
    if (!nextPage && (/^(下一页|下页|下一頁)/.test(text) || (rel.includes('next') && !/^(下一章|下一篇|下一节|下一回)/.test(text)))) {
      nextPage = abs;
    }
    if (!toc && /^[\(（【\[]?(目录|章节目录|返回书页|全部章节|章节列表|查看全部章节|全部章节列表)/.test(text)) {
      toc = abs;
    }
    if (prev && next && toc && nextPage) break;
  }
  // "下一页" trỏ sang trang khác của CÙNG chương → là trang tiếp; ngược lại coi là chương sau
  let pageNext = null;
  if (nextPage && nextPage !== next) {
    if (isSamePageSeries(baseUrl, nextPage)) pageNext = nextPage;
    else if (!next) next = nextPage;
  }
  if (next && isSamePageSeries(baseUrl, next) && !pageNext) {
    pageNext = next;
    next = null;
  }
  return { prev, next, toc, pageNext };
}

/* 101.html → 101_2.html → 101_3.html (hoặc 101-2.html, ?page=2): các trang của CÙNG một chương */
export function isSamePageSeries(a, b) {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    if (ua.host !== ub.host) return false;
    const parse = (u) => {
      const p = u.pathname.replace(/\.(html?|php|aspx?)$/i, '');
      const qp = u.searchParams.get('page') || u.searchParams.get('p');
      if (qp && /^\d+$/.test(qp)) return { base: p, n: Number(qp) };
      const m = p.match(/^(.*?)[_-](\d{1,2})$/);
      return m ? { base: m[1], n: Number(m[2]) } : { base: p, n: 1 };
    };
    const pa = parse(ua);
    const pb = parse(ub);
    return pa.base === pb.base && pb.n === pa.n + 1;
  } catch {
    return false;
  }
}

export function extractFanqieState(html) {
  const at = html.indexOf('"chapterData":{');
  if (at < 0) return null;
  const blk = html.slice(at);
  const g = (re) => {
    const m = blk.match(re);
    return m ? m[1] : '';
  };
  const title = g(/"title":"([^"]+)"/);
  const bookName = g(/"bookName":"([^"]+)"/);
  const bookId = g(/"bookId":"(\d+)"/);
  const itemId = g(/"itemId":"(\d+)"/);
  const preItemId = g(/"preItemId":"([^"]*)"/);
  const nextItemId = g(/"nextItemId":"([^"]*)"/);
  const chapterWordNumber = Number(g(/"chapterWordNumber":"(\d+)"/)) || 0;
  const isChapterLock = g(/"isChapterLock":(true|false)/) === 'true';
  const contentRaw = g(/"content":"((?:[^"\\]|\\.)*)"/);
  let contentHtml = '';
  if (contentRaw) {
    try {
      contentHtml = JSON.parse('"' + contentRaw + '"');
    } catch {
      /* ignore */
    }
  }
  if (!title && !contentHtml) return null;
  return {
    title, bookName, bookId, itemId, preItemId, nextItemId,
    chapterWordNumber, isChapterLock, contentHtml,
  };
}

export function extractFanqieChapterList(html) {
  const out = [];
  const seen = new Set();
  const re =
    /\{"index":(\d+),"section_name":"((?:[^"\\]|\\.)*)","chapter_name":"((?:[^"\\]|\\.)*)","chapter_link":"((?:[^"\\]|\\.)*)"\}/g;
  let m;
  while ((m = re.exec(html))) {
    let name = '';
    let link = '';
    try {
      name = JSON.parse('"' + m[3] + '"');
    } catch {
      continue;
    }
    try {
      link = JSON.parse('"' + m[4] + '"');
    } catch {
      continue;
    }
    name = name.replace(/\s+/g, ' ').trim();
    if (!name || !/\/reader\/\d+/.test(link)) continue;
    if (seen.has(link)) continue;
    seen.add(link);
    out.push({ index: Number(m[1]), title: name, url: link });
    if (out.length >= 3000) break;
  }
  out.sort((a, b) => a.index - b.index);
  return out.map(({ title, url }) => ({ title, url }));
}

export function extractFanqieChapters(doc, baseUrl) {
  const out = [];
  const seen = new Set();
  const re = /<a\s[^>]*?href\s*=\s*["']([^"']*\/reader\/\d+[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(doc))) {
    const title = decodeEntities(m[2].replace(/<[^>]+>/g, ''))
      .replace(/\s+/g, ' ')
      .trim();
    if (!title || title.length > 60) continue;
    if (/^(最近更新|最新更新|最新章节|章节目录|目录)/.test(title)) continue;
    let abs;
    try {
      abs = new URL(m[1], baseUrl).href;
    } catch {
      continue;
    }
    if (seen.has(abs)) continue;
    seen.add(abs);
    out.push({ title, url: abs });
    if (out.length >= 3000) break;
  }
  return out;
}
