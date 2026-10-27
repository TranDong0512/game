/* Pipeline scrape — port từ handleApi trong server.js. */
import {
  UA, decodeHtml, stripNoise, extractContent, extractTitle, extractChapters,
  extractPrevNext, extractFanqieState, extractFanqieChapterList, extractFanqieChapters,
  cleanFragment, cjkCount,
} from './util.js';

const MAX_PAGES = 15;
const CHAP_NUM_RE = /第\s*[0-9０-９零一二三四五六七八九十百千万两]+\s*[章节回卷]/;
const chapNumOf = (s) => ((s || '').match(CHAP_NUM_RE) || [''])[0].replace(/\s+/g, '');

const PAGE_HEADERS = (url) => ({
  'User-Agent': UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,vi;q=0.8,en;q=0.6',
  Referer: new URL(url).origin + '/',
  'Cache-Control': 'no-cache',
});

async function fetchPage(http, url, cookie) {
  const headers = PAGE_HEADERS(url);
  if (cookie) headers.Cookie = cookie;
  const res = await http.request(url, { headers, timeoutMs: 25000 });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const html = decodeHtml(res.bytes, res.contentType);
  return { html, finalUrl: res.url || url };
}

/* Chương bị khóa (isChapterLock) → SSR chỉ preview ~200 chữ.
   Trang thật gọi /api/reader/full để lấy bản đầy đủ — thử lại bằng HTTP
   kèm cookie đăng nhập (nếu có). Bị captcha → body rỗng → trả null. */
async function fetchFanqieFull(http, itemId, cookie, decodeObfuscatedFonts, fontUrls) {
  const url = `https://fanqienovel.com/api/reader/full?itemId=${itemId}`;
  const headers = {
    'User-Agent': UA,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,vi;q=0.8',
    Referer: `https://fanqienovel.com/reader/${itemId}`,
    ismobile: '0',
  };
  if (cookie) headers.Cookie = cookie;
  let res;
  try {
    res = await http.request(url, { headers, timeoutMs: 20000 });
  } catch {
    return null;
  }
  const text =
    res.text != null
      ? res.text
      : new TextDecoder('utf-8').decode(res.bytes instanceof Uint8Array ? res.bytes : new Uint8Array(res.bytes || []));
  if (!res.ok || !text || !text.trim()) return null; // captcha anti-bot → body rỗng
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    return null;
  }
  const ch = j && j.data && j.data.chapterData;
  if (!ch || !ch.content || j.code !== 0) return null;
  let contentHtml = ch.content;
  // content API cũng PUA-obfuscated → giải bằng font URL lấy từ trang
  if (/[-]/.test(contentHtml) && fontUrls.length && decodeObfuscatedFonts) {
    const fake = fontUrls.map((u) => `@font-face{src:url(${u})}`).join('') + contentHtml;
    try {
      const deob = await decodeObfuscatedFonts(fake);
      contentHtml = deob.html.slice(fake.length - contentHtml.length);
    } catch {
      /* giữ nguyên nếu deob lỗi */
    }
  }
  return { contentHtml, title: ch.title || '' };
}

export function createScrape(http, decodeObfuscatedFonts) {
  return async function scrape(target, opts = {}) {
    const cookie = opts.cookie || '';
    const { html, finalUrl } = await fetchPage(http, target, cookie);
    const deob = await decodeObfuscatedFonts(html);
    const doc = stripNoise(deob.html);
    const state = extractFanqieState(deob.html);
    let content = state && state.contentHtml ? cleanFragment(state.contentHtml) : extractContent(doc);
    const { chapterTitle: baseChapTitle, bookTitle: baseBookTitle, h1Raw } = extractTitle(doc);
    let chapterTitle = baseChapTitle;
    let bookTitle = baseBookTitle;
    if (state) {
      if (state.title) chapterTitle = state.title;
      if (state.bookName) bookTitle = state.bookName;
    }

    // Chương bị khóa (isChapterLock) → SSR chỉ preview ~200 chữ.
    // Thử lấy bản đầy đủ qua /api/reader/full (cần cookie đăng nhập để qua captcha).
    let truncated = false;
    const wordNumber = (state && state.chapterWordNumber) || 0;
    if (state && state.isChapterLock && state.itemId) {
      const fontUrls = [...new Set(html.match(/https?:\/\/[^)"'\s<>]+?\.woff2?/g) || [])];
      const full = await fetchFanqieFull(http, state.itemId, cookie, decodeObfuscatedFonts, fontUrls);
      if (full && full.contentHtml) {
        const fullText = cleanFragment(full.contentHtml);
        if (cjkCount(fullText) > cjkCount(content) * 1.3) content = fullText;
        else truncated = true;
      } else {
        truncated = true;
      }
    } else if (wordNumber > 0 && cjkCount(content) < wordNumber * 0.5) {
      // không phải isChapterLock nhưng nội dung vẫn quá ngắn so với số chữ khai báo → có thể bị cắt
      truncated = true;
    }

    let chapters = extractChapters(doc, finalUrl);
    const { prev: prev0, next: next0, toc: toc0, pageNext: pageNext0 } = extractPrevNext(doc, finalUrl);
    let prev = prev0;
    let next = next0;
    let toc = toc0;

    // Chương chia nhiều trang (下一页) → tải nối tiếp các trang để có ĐỦ cả chương
    let pages = 1;
    let pageNext = state ? null : pageNext0;
    const seenPages = new Set([finalUrl]);
    const firstNum = chapNumOf(chapterTitle);
    while (pageNext && pages < MAX_PAGES && !seenPages.has(pageNext)) {
      seenPages.add(pageNext);
      let pg;
      try {
        pg = await fetchPage(http, pageNext);
      } catch {
        break;
      }
      const pgDeob = await decodeObfuscatedFonts(pg.html);
      const pgDoc = stripNoise(pgDeob.html);
      const pgNum = chapNumOf(extractTitle(pgDoc).chapterTitle);
      if (firstNum && pgNum && pgNum !== firstNum) {
        // thực ra là chương khác → dùng làm "chương sau", không ghép
        if (!next) next = pageNext;
        break;
      }
      // bỏ dòng tiêu đề lặp lại ở đầu mỗi trang ("第5章 xxx（2/3）")
      const pgLines = extractContent(pgDoc).split('\n');
      while (pgLines.length && pgLines[0].length < 60 && firstNum && chapNumOf(pgLines[0]) === firstNum) pgLines.shift();
      const pgContent = pgLines.join('\n').trim();
      if (!pgContent) break;
      content += '\n' + pgContent;
      pages++;
      const nav = extractPrevNext(pgDoc, pg.finalUrl);
      if (nav.next) next = nav.next;
      pageNext = nav.pageNext;
    }

    if (/fanqienovel\.com/.test(finalUrl)) {
      if (state) {
        const readerBase = 'https://fanqienovel.com/reader/';
        if (state.preItemId && !prev) prev = readerBase + state.preItemId;
        if (state.nextItemId && !next) next = readerBase + state.nextItemId;
      }
      const jsonList = extractFanqieChapterList(deob.html);
      if (jsonList.length) chapters = jsonList;
      if (!chapters.length) {
        const bookId = (state && state.bookId) || (deob.html.match(/"bookId":"(\d+)"/) || [])[1];
        if (bookId) {
          try {
            const bookUrl = 'https://fanqienovel.com/page/' + bookId;
            const p2 = await fetchPage(http, bookUrl);
            const d2 = (await decodeObfuscatedFonts(p2.html)).html;
            chapters = extractFanqieChapterList(d2);
            if (!chapters.length) chapters = extractFanqieChapters(d2, p2.finalUrl);
            if (chapters.length && !toc) toc = bookUrl;
          } catch {
            /* bỏ qua lỗi tải mục lục */
          }
        }
      }
    } else if (chapters.length < 30 && toc) {
      try {
        const p2 = await fetchPage(http, toc);
        const c2 = extractChapters(stripNoise(p2.html), p2.finalUrl);
        if (c2.length > chapters.length) chapters = c2;
      } catch {
        /* bỏ qua lỗi tải mục lục */
      }
    }

    // chương cuối: "下一章" trỏ về mục lục → không có chương sau
    if (next && toc && next === toc) next = null;

    const norm = (s) => (s || '').replace(/\s+/g, '');
    const chapNum = (s) => norm((s.match(/第\s*[0-9０-９零一二三四五六七八九十百千万两]+\s*[章节回卷]/) || [''])[0]);
    const lines = content.split('\n');
    for (let i = 0; i < Math.min(3, lines.length); i++) {
      const fl = (lines[i] || '').trim();
      if (
        norm(fl) &&
        (norm(fl) === norm(h1Raw) ||
          norm(fl) === norm(chapterTitle) ||
          (chapNum(fl) && chapNum(fl) === chapNum(chapterTitle)))
      ) {
        lines.splice(i, 1);
        i -= 1;
      } else if (norm(fl)) {
        break;
      }
    }
    content = lines.join('\n');

    return {
      ok: true,
      url: finalUrl,
      bookTitle,
      chapterTitle,
      content,
      chapters,
      prev,
      next,
      toc,
      obfuscated: deob.obfuscated,
      decoded: deob.decoded,
      htmlSize: html.length,
      pages,
      truncated,
      wordNumber,
      chapterLock: !!(state && state.isChapterLock),
    };
  };
}
