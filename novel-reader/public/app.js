/* ============ tiện ích ============ */
const $ = (s) => document.querySelector(s);
const DB_KEY = 'truyen_db_v1';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function keyOf(url) {
  try { const u = new URL(url); u.hash = ''; return u.href; } catch { return url; }
}

function loadDb() {
  try {
    const d = JSON.parse(localStorage.getItem(DB_KEY));
    if (d && typeof d === 'object') return { chapters: d.chapters || {}, queue: d.queue || [], lastUrl: d.lastUrl || '' };
  } catch {}
  return { chapters: {}, queue: [], lastUrl: '' };
}

let db = loadDb();
let saveTimer = null;

function saveDb() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(db));
    } catch {
      try {
        for (const k in db.chapters) {
          const e = db.chapters[k];
          if (!e.saved) { delete e.zh; delete e.vi; delete e.chunkCache; }
          else { delete e.chunkCache; }
        }
        localStorage.setItem(DB_KEY, JSON.stringify(db));
        toast('Bộ nhớ đầy — đã dọn bản dịch tạm');
      } catch {
        toast('Không lưu được: bộ nhớ trình duyệt đầy');
      }
    }
  }, 250);
}

function pruneDb(keepKey) {
  const keys = Object.keys(db.chapters);
  if (keys.length <= 500) return;
  const sorted = keys.sort((a, b) => (db.chapters[a].at || 0) - (db.chapters[b].at || 0));
  let count = keys.length;
  for (const k of sorted) {
    if (count <= 500) break;
    if (k === keepKey) continue;
    if (!db.chapters[k].saved) { delete db.chapters[k]; count--; }
  }
}

function ensureEntry(key, meta) {
  let e = db.chapters[key];
  if (!e) { e = db.chapters[key] = { at: Date.now() }; pruneDb(key); }
  if (meta) {
    if (meta.url) e.url = meta.url;
    if (meta.book) e.book = meta.book;
    if (meta.chapter) e.chapter = meta.chapter;
    if (meta.zh) e.zh = meta.zh;
    if (meta.vi) e.vi = meta.vi;
  }
  e.at = Date.now();
  return e;
}

function toast(text, ms = 2200) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.remove('hidden');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.add('hidden'), ms);
}

function showMsg(text, type = '') {
  const el = $('#msg');
  el.textContent = text;
  el.className = 'msg ' + type;
}

function fmtDate(ts) {
  if (!ts) return '';
  try { return new Date(ts).toLocaleString('vi-VN'); } catch { return ''; }
}

async function api(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  return res.json();
}

/* ============ native (APK) vs server (web) ============ */
const NATIVE = !!(
  window.Capacitor &&
  typeof window.Capacitor.isNativePlatform === 'function' &&
  window.Capacitor.isNativePlatform()
);
const FANQIE_COOKIE_KEY = 'fanqie_cookie_v1';
function getFanqieCookie() {
  try { return localStorage.getItem(FANQIE_COOKIE_KEY) || ''; } catch { return ''; }
}
let _engineMod = null;
async function getEngine() {
  if (!_engineMod) _engineMod = await import('./engine/app-entry.js');
  return _engineMod;
}
async function scrapeUrl(url) {
  if (NATIVE) {
    try {
      return await (await getEngine()).scrape(url);
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
  }
  const headers = {};
  const cookie = getFanqieCookie();
  if (cookie) headers['x-fanqie-cookie'] = cookie;
  const res = await fetch('/api/scrape?url=' + encodeURIComponent(url), { headers });
  return res.json();
}
async function trChunk(q) {
  if (NATIVE) {
    try {
      return await (await getEngine()).translate(q);
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
  }
  return api('/api/t', { q });
}

/* ============ tách câu / chia khối ============ */
function splitZhSent(s) { return s.split(/(?<=[。！？…；])/).filter(Boolean); }

function chunkZh(zh) {
  const LIMIT = 650;
  const lines = zh.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const chunks = [];
  let cur = '';
  const push = () => { if (cur) { chunks.push(cur); cur = ''; } };
  for (const line of lines) {
    if (line.length > LIMIT) {
      push();
      for (const s of splitZhSent(line)) {
        if (s.length > LIMIT) {
          push();
          for (let i = 0; i < s.length; i += LIMIT) chunks.push(s.slice(i, i + LIMIT));
        } else {
          if (cur && cur.length + s.length > LIMIT) push();
          cur += s;
        }
      }
      push();
      continue;
    }
    if (cur && cur.length + line.length + 1 > LIMIT) push();
    cur = cur ? cur + '\n' + line : line;
  }
  push();
  return chunks.length ? chunks : [zh];
}

function splitSentences(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return [];
  const out = [];
  let buf = '';
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    buf += c;
    if ('.!?…。！？'.includes(c)) {
      const prev = t[i - 1] || '';
      const next = t[i + 1] || '';
      if (/\d/.test(prev) && /\d/.test(next)) continue;
      let j = i + 1;
      while (j < t.length && '"”’\')]}>'.includes(t[j])) { buf += t[j]; j++; }
      const s = buf.trim();
      if (s) out.push(s);
      buf = '';
      i = j - 1;
    }
  }
  if (buf.trim()) out.push(buf.trim());
  const res = (out.length ? out : [t]).flatMap((s) => breakLong(s));
  return res;
}

/* câu > 220 ký tự → chia ở dấu phẩy / khoảng trắng gần nhất */
function breakLong(s, max = 220) {
  const out = [];
  while (s.length > max) {
    let cut = Math.max(s.lastIndexOf(', ', max), s.lastIndexOf('; ', max), s.lastIndexOf('，', max), s.lastIndexOf('、', max));
    if (cut < max * 0.4) cut = s.lastIndexOf(' ', max);
    if (cut < max * 0.4) cut = max - 1;
    out.push(s.slice(0, cut + 1).trim());
    s = s.slice(cut + 1).trim();
  }
  if (s) out.push(s);
  return out;
}

function renderParagraphs(el, text, cls = '') {
  el.innerHTML = '';
  const lines = String(text || '').split(/\n+/).filter((l) => l.trim());
  for (const l of lines) {
    const p = document.createElement('p');
    p.textContent = l;
    if (cls) p.className = cls;
    el.appendChild(p);
  }
}

/* ============ chuyển tab ============ */
document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tabpage').forEach((p) => p.classList.add('hidden'));
    $('#tab-' + btn.dataset.tab).classList.remove('hidden');
    if (btn.dataset.tab === 'library') renderLibrary();
    if (btn.dataset.tab === 'queue') renderQueue();
  });
});

/* ============ trạng thái hiện tại ============ */
let cur = {
  url: '', key: '', book: '', chapter: '',
  content: '', chapters: [], prev: null, next: null, toc: null, vi: '',
};
let lastLoadError = '';

function updateBadges() {
  const saved = Object.values(db.chapters).filter((e) => e.saved).length;
  const pending = db.queue.filter((q) => q.status === 'pending' || q.status === 'running').length;
  $('#libBadge').textContent = saved;
  $('#qBadge').textContent = pending;
}

/* ============ tải chương ============ */
async function loadChapter(url, quiet = false) {
  if (!/^https?:\/\//i.test(url)) {
    showMsg('URL không hợp lệ — cần bắt đầu bằng http:// hoặc https://', 'error');
    return false;
  }
  ttsCancel();
  lastLoadError = '';
  $('#loadBtn').disabled = true;
  if (!quiet) showMsg('Đang tải trang...');
  try {
    const d = await scrapeUrl(url);
    if (!d.ok) throw new Error(d.error || 'Lỗi không rõ');

    const prevEntry = db.chapters[keyOf(d.url)];
    // bản dịch cũ dịch từ nội dung KHÁC (lần trước tải thiếu / trang đổi) → không dùng lại
    const viOk = prevEntry?.vi && (!prevEntry.zh || prevEntry.zh === (d.content || '')) && !prevEntry.partial;
    cur = {
      url: d.url,
      key: keyOf(d.url),
      book: d.bookTitle || prevEntry?.book || 'Truyện',
      chapter: d.chapterTitle || prevEntry?.chapter || 'Chương',
      content: d.content || '',
      chapters: d.chapters || [],
      prev: d.prev || null,
      next: d.next || null,
      toc: d.toc || null,
      pages: d.pages || 1,
      vi: viOk ? prevEntry.vi : '',
    };
    db.lastUrl = d.url;
    saveDb();
    $('#urlInput').value = d.url;
    renderCurrent();
    if (!quiet) {
      const deobNote = d.obfuscated
        ? d.decoded
          ? ' (đã giải mã font chống scrape)'
          : ''
        : '';
      if (d.content) {
        const pageNote = d.pages > 1 ? ` (ghép ${d.pages} trang)` : '';
        showMsg('Đã tải: ' + cur.chapter + deobNote + pageNote, 'ok');
        if (d.truncated) {
          const wn = d.wordNumber ? `/${d.wordNumber} chữ gốc` : '';
          setTimeout(
            () =>
              showMsg(
                `⚠ Chương này trang nguồn chỉ cho xem trước ~${d.content.length} ký tự${wn} (chương bị khóa). ` +
                  `Bản dịch sẽ chỉ gồm đoạn trích. ` +
                  (getFanqieCookie()
                    ? 'Cookie hiện tại không lấy được bản đầy đủ — thử cookie mới.'
                    : 'Đăng nhập fanqienovel.com trên trình duyệt rồi dán cookie vào Cài đặt bên dưới để đọc đủ.'),
                'error'
              ),
            200
          );
        }
        if (d.obfuscated && !d.decoded) {
          setTimeout(
            () => showMsg('Trang này dùng font chống scrape và không giải mã được → chữ □ là ký tự giả từ trang gốc, không phải lỗi tải.', 'error'),
            200
          );
        }
      } else {
        showMsg('Không trích được nội dung — trang có thể dựng bằng JavaScript hoặc chặn tải máy chủ.', 'error');
      }
    }
    return true;
  } catch (e) {
    lastLoadError = e.message || String(e);
    if (!quiet) showMsg('Lỗi khi tải: ' + e.message, 'error');
    return false;
  } finally {
    $('#loadBtn').disabled = false;
  }
}

$('#loadBtn').addEventListener('click', () => loadChapter($('#urlInput').value.trim()));
$('#urlInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadChapter($('#urlInput').value.trim()); });

/* ============ hiển thị chương hiện tại ============ */
function renderCurrent() {
  const has = !!cur.url;
  $('#meta').classList.toggle('hidden', !has);
  $('#cols').classList.toggle('hidden', !has);
  $('#chaplistBox').classList.toggle('hidden', !has);
  if (!has) return;

  $('#metaBook').textContent = '📚 ' + cur.book;
  $('#metaChapter').textContent = '📖 ' + cur.chapter;

  renderParagraphs($('#zhText'), cur.content);
  $('#zhStat').textContent = cur.content
    ? cur.content.length.toLocaleString('vi-VN') + ' ký tự'
    : 'trống';

  const viText = $('#viText');
  if (cur.vi) {
    renderParagraphs(viText, cur.vi);
    viText.classList.remove('muted');
    $('#viStat').textContent = 'đã dịch';
  } else {
    viText.classList.add('muted');
    viText.textContent = 'Chưa có bản dịch. Bấm “Dịch chương”.';
    $('#viStat').textContent = '';
  }

  const entry = db.chapters[cur.key];
  $('#translateBtn').classList.toggle('hidden', !!cur.vi);
  $('#retranslateBtn').classList.toggle('hidden', !cur.vi);
  $('#saveBtn').textContent = entry?.saved ? 'Đã lưu ★' : 'Lưu chương ★';
  $('#readBtn').disabled = !(cur.vi || cur.content);

  $('#prevBtn').disabled = !cur.prev;
  $('#nextBtn').disabled = !cur.next;

  const sel = $('#chapSelect');
  sel.innerHTML = '';
  if (cur.chapters.length) {
    for (const c of cur.chapters) {
      const o = document.createElement('option');
      o.value = c.url;
      o.textContent = c.title;
      if (keyOf(c.url) === cur.key) o.selected = true;
      sel.appendChild(o);
    }
  } else {
    const o = document.createElement('option');
    o.textContent = cur.chapter;
    o.selected = true;
    sel.appendChild(o);
  }
  sel.disabled = cur.chapters.length === 0;

  renderChapterList();
}

function chapterStatus(key) {
  const e = db.chapters[key];
  if (!e) return {};
  return { saved: !!e.saved, vi: !!e.vi, pos: e.pos || 0 };
}

function renderChapterList() {
  const box = $('#chapters');
  box.innerHTML = '';
  $('#chCount').textContent = cur.chapters.length;
  for (const c of cur.chapters) {
    const k = keyOf(c.url);
    const st = chapterStatus(k);
    const item = document.createElement('div');
    item.className = 'chap-item' + (k === cur.key ? ' current' : '');

    const title = document.createElement('span');
    title.className = 'ctitle';
    title.textContent = c.title;
    title.addEventListener('click', () => { loadChapter(c.url); window.scrollTo({ top: 0, behavior: 'smooth' }); });

    const tags = document.createElement('span');
    if (st.vi) { const t = document.createElement('span'); t.className = 'tag done'; t.textContent = 'đã dịch'; tags.appendChild(t); }
    if (st.saved) { const t = document.createElement('span'); t.className = 'tag saved'; t.textContent = '★ đã lưu'; tags.appendChild(t); }

    const qbtn = document.createElement('button');
    qbtn.className = 'btn small';
    qbtn.textContent = '+ Treo';
    qbtn.title = 'Thêm vào hàng đợi dịch nền';
    qbtn.addEventListener('click', () => { addToQueue(c.url, c.title); });

    item.append(title, tags, qbtn);
    box.appendChild(item);
  }
}

$('#chapSelect').addEventListener('change', (e) => loadChapter(e.target.value));
$('#prevBtn').addEventListener('click', () => cur.prev && loadChapter(cur.prev));
$('#nextBtn').addEventListener('click', () => cur.next && loadChapter(cur.next));

/* ============ dịch ============ */
async function translateText(zh, key, meta, onProgress) {
  const chunks = chunkZh(zh);
  const entry = ensureEntry(key, meta);
  if (!entry.chunkCache) entry.chunkCache = {};
  const cache = entry.chunkCache;
  const out = [];
  let partial = 0;
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const hit = cache[i];
    let text;
    if (hit && hit.src === c) {
      text = hit.out;
    } else {
      await sleep(250);
      const r = await trChunk(c);
      if (!r.ok) throw new Error(r.error || 'Lỗi dịch');
      text = r.text;
      if (r.partial) partial++;
      else cache[i] = { src: c, out: text }; // khối dịch thiếu không cache → lần sau dịch lại
      saveDb();
    }
    out[i] = text;
    onProgress?.(i + 1, chunks.length, out.join('\n'));
  }
  const e = db.chapters[key];
  if (e) e.partial = partial;
  if (partial) toast(`⚠ ${partial}/${chunks.length} khối dịch chưa trọn vẹn — bấm "Dịch lại" sau ít phút`, 5000);
  return out.join('\n');
}

function setProgress(i, n) {
  const pct = Math.round((i / n) * 100);
  $('#progressFill').style.width = pct + '%';
  $('#progressText').textContent = `${i}/${n} khối · ${pct}%`;
}

async function doTranslate(force = false) {
  if (!cur.content) return;
  if (force) {
    const e = db.chapters[cur.key];
    // giữ các khối đã dịch tốt nếu lần trước bị thiếu → chỉ dịch lại phần thiếu
    if (e) { if (!e.partial) delete e.chunkCache; delete e.vi; e.pos = 0; saveDb(); }
    cur.vi = '';
  }
  $('#translateBtn').disabled = true;
  $('#retranslateBtn').disabled = true;
  $('#progressWrap').classList.remove('hidden');
  setProgress(0, 1);
  const viText = $('#viText');
  viText.classList.remove('muted');
  try {
    const meta = { url: cur.url, book: cur.book, chapter: cur.chapter, zh: cur.content };
    const vi = await translateText(cur.content, cur.key, meta, (i, n, partial) => {
      setProgress(i, n);
      renderParagraphs(viText, partial);
    });
    cur.vi = vi;
    const e = ensureEntry(cur.key, meta);
    e.vi = vi;
    if (!e.partial) delete e.chunkCache;
    saveDb();
    renderParagraphs(viText, vi);
    $('#viStat').textContent = 'đã dịch';
    $('#translateBtn').classList.add('hidden');
    $('#retranslateBtn').classList.remove('hidden');
    $('#readBtn').disabled = false;
    if (!e.partial) toast('Dịch xong ✓');
  } catch (e) {
    showMsg('Dịch lỗi: ' + e.message + ' — thử lại sau ít giây.', 'error');
  } finally {
    $('#translateBtn').disabled = false;
    $('#retranslateBtn').disabled = false;
    $('#progressWrap').classList.add('hidden');
  }
}

$('#translateBtn').addEventListener('click', () => doTranslate(false));
$('#retranslateBtn').addEventListener('click', () => doTranslate(true));

/* ============ lưu chương ============ */
$('#saveBtn').addEventListener('click', () => {
  if (!cur.url) return;
  const e = ensureEntry(cur.key, { url: cur.url, book: cur.book, chapter: cur.chapter, zh: cur.content, vi: cur.vi });
  e.saved = true;
  e.savedAt = Date.now();
  saveDb();
  $('#saveBtn').textContent = 'Đã lưu ★';
  renderChapterList();
  updateBadges();
  toast('Đã lưu vào thư viện ★');
});

/* ============ thư viện ============ */
function openFromEntry(key, e) {
  ttsCancel();
  cur = {
    url: e.url || '',
    key,
    book: e.book || 'Truyện',
    chapter: e.chapter || 'Chương',
    content: e.zh || '',
    chapters: cur.key === key ? cur.chapters : [],
    prev: cur.key === key ? cur.prev : null,
    next: cur.key === key ? cur.next : null,
    vi: e.vi || '',
  };
  if (e.url) $('#urlInput').value = e.url;
  renderCurrent();
}

function renderLibrary() {
  const onlySaved = $('#libOnlySaved').checked;
  const list = $('#libList');
  list.innerHTML = '';
  let entries = Object.entries(db.chapters)
    .filter(([, e]) => (onlySaved ? e.saved : true))
    .filter(([, e]) => e.url)
    .sort((a, b) => (b[1].savedAt || b[1].at || 0) - (a[1].savedAt || a[1].at || 0));

  $('#libEmpty').classList.toggle('hidden', entries.length > 0);

  for (const [key, e] of entries) {
    const card = document.createElement('div');
    card.className = 'card';

    const h = document.createElement('h4');
    h.textContent = (e.saved ? '★ ' : '') + (e.chapter || 'Chương');
    const sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = (e.book || 'Truyện') + ' · ' + (e.url || '');

    const bar = document.createElement('div');
    bar.className = 'bar';
    const fill = document.createElement('div');
    const total = e.total || 0;
    const pos = e.pos || 0;
    const pct = total ? Math.min(100, Math.round(((pos + 1) / total) * 100)) : (e.vi ? 100 : 0);
    fill.style.width = pct + '%';
    bar.appendChild(fill);

    const row = document.createElement('div');
    row.className = 'row';
    const info = document.createElement('span');
    info.className = 'date';
    info.textContent = (total ? `Câu ${pos + 1}/${total} · ${pct}% · ` : '') + (e.vi ? 'đã dịch · ' : 'chưa dịch · ') + fmtDate(e.savedAt || e.at);

    const btns = document.createElement('span');
    btns.className = 'btns';

    const readBtn = document.createElement('button');
    readBtn.className = 'btn small success';
    readBtn.textContent = 'Đọc';
    readBtn.addEventListener('click', async () => {
      const ok = await loadChapter(e.url, true);
      if (ok) { openReader(); return; }
      // không tải lại được (mất mạng / trang lỗi) → mở bản đã lưu trong máy
      if (e.zh || e.vi) {
        openFromEntry(key, e);
        openReader();
        toast('Không tải được trang — đang mở bản đã lưu');
      } else {
        toast('Không tải lại được chương');
      }
    });

    const reBtn = document.createElement('button');
    reBtn.className = 'btn small';
    reBtn.textContent = e.vi ? 'Dịch lại' : 'Dịch';
    reBtn.addEventListener('click', async () => {
      const ok = await loadChapter(e.url, true);
      if (ok) { await doTranslate(true); renderLibrary(); }
      else toast('Không tải được chương');
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'btn small danger';
    delBtn.textContent = 'Xóa';
    delBtn.addEventListener('click', () => {
      delete db.chapters[key];
      saveDb();
      renderLibrary();
      updateBadges();
      if (cur.key === key) renderCurrent();
    });

    btns.append(readBtn, reBtn, delBtn);
    row.append(info, btns);
    card.append(h, sub, bar, row);
    list.appendChild(card);
  }
  updateBadges();
}

$('#libOnlySaved').addEventListener('change', renderLibrary);
$('#clearLibBtn').addEventListener('click', () => {
  let n = 0;
  for (const k in db.chapters) {
    const e = db.chapters[k];
    if (!e.saved) { delete db.chapters[k]; n++; }
  }
  saveDb();
  renderLibrary();
  toast(`Đã dọn ${n} bản dịch tạm`);
});

/* ============ hàng đợi (treo) ============ */
function addToQueue(url, name) {
  if (!/^https?:\/\//i.test(url)) return;
  const k = keyOf(url);
  if (db.queue.some((q) => keyOf(q.url) === k && q.status !== 'done')) {
    toast('Chương này đã có trong hàng đợi');
    return;
  }
  db.queue.push({ url, name: name || url, status: 'pending', progress: '', at: Date.now() });
  saveDb();
  updateBadges();
  renderQueue();
  toast('Đã thêm vào hàng đợi');
}

function renderQueue() {
  const list = $('#qList');
  list.innerHTML = '';
  $('#qEmpty').classList.toggle('hidden', db.queue.length > 0);
  const labels = { pending: 'chờ', running: 'đang dịch', done: 'xong', error: 'lỗi' };
  for (let i = 0; i < db.queue.length; i++) {
    const q = db.queue[i];
    const item = document.createElement('div');
    item.className = 'qitem';

    const tag = document.createElement('span');
    tag.className = 'tag ' + (q.status === 'done' ? 'done' : q.status === 'running' ? 'busy' : q.status === 'error' ? 'err' : '');
    tag.textContent = labels[q.status] || q.status;

    const name = document.createElement('span');
    name.className = 'qname';
    name.textContent = q.name || q.url;

    const url = document.createElement('span');
    url.className = 'qurl';
    url.textContent = (q.progress ? q.progress + ' · ' : '') + (q.error ? q.error + ' · ' : '') + q.url;

    const del = document.createElement('button');
    del.className = 'btn small danger';
    del.textContent = '✕';
    del.title = 'Xóa khỏi hàng đợi';
    del.disabled = q.status === 'running';
    del.addEventListener('click', () => {
      db.queue.splice(i, 1);
      saveDb();
      renderQueue();
      updateBadges();
    });

    item.append(tag, name, url, del);
    list.appendChild(item);
  }
  updateBadges();
}

$('#qAddBtn').addEventListener('click', () => {
  const v = $('#qUrlInput').value.trim();
  if (!v) return;
  addToQueue(v);
  $('#qUrlInput').value = '';
});

let queueRunning = false;

async function processQueue() {
  if (queueRunning) return;
  queueRunning = true;
  $('#qStartBtn').disabled = true;
  $('#qPauseBtn').disabled = false;
  while (queueRunning) {
    const item = db.queue.find((q) => q.status === 'pending');
    if (!item) break;
    item.status = 'running';
    item.progress = 'đang tải';
    saveDb();
    renderQueue();
    try {
      const d = await scrapeUrl(item.url);
      if (!d.ok) throw new Error(d.error || 'tải lỗi');
      const key = keyOf(d.url);
      item.name = (d.bookTitle ? d.bookTitle + ' · ' : '') + (d.chapterTitle || '');
      item.url = d.url;
      if (!d.content) throw new Error('không trích được nội dung');
      const meta = { url: d.url, book: d.bookTitle, chapter: d.chapterTitle, zh: d.content };
      const vi = await translateText(d.content, key, meta, (i, n) => {
        item.progress = `dịch ${i}/${n}`;
        saveDb();
        const node = document.querySelectorAll('.qitem')[db.queue.indexOf(item)];
        if (node) node.children[2].textContent = item.progress + ' · ' + item.url;
      });
      const e = ensureEntry(key, meta);
      e.vi = vi;
      if (!e.partial) delete e.chunkCache;
      if (item.name) e.chapter = item.name.split('·').pop().trim() || e.chapter;
      item.status = 'done';
      item.progress = e.partial ? `xong nhưng ${e.partial} khối dịch thiếu — mở chương bấm "Dịch lại"` : 'hoàn tất';
      if (!e.partial) toast('Đã dịch xong: ' + (item.name || item.url));
    } catch (err) {
      item.status = 'error';
      item.error = err.message || String(err);
      item.progress = '';
    }
    saveDb();
    renderQueue();
    await sleep(900);
  }
  queueRunning = false;
  $('#qStartBtn').disabled = false;
  $('#qPauseBtn').disabled = true;
  saveDb();
  renderQueue();
}

$('#qStartBtn').addEventListener('click', processQueue);
$('#qPauseBtn').addEventListener('click', () => { queueRunning = false; });
$('#qClearBtn').addEventListener('click', () => {
  db.queue = db.queue.filter((q) => q.status !== 'done' && q.status !== 'error');
  saveDb();
  renderQueue();
});

/* ============ trình đọc ngắt quãng ============ */
const reader = { sentences: [], idx: 0, timer: null, speed: 3, full: false, key: '', advancing: false, retryTranslate: false, ttsFails: 0, ttsStall: 0, ttsFast: 0 };

/* ---- đọc thành tiếng (TTS) ---- */
const TTS = {
  on: localStorage.getItem('truyen_sound_v1') !== '0',
  rate: (() => { const v = Number(localStorage.getItem('truyen_tts_rate')); return v >= 0.5 && v <= 3 ? v : 1; })(),
  voiceName: localStorage.getItem('truyen_tts_voice') || '',
  voice: null,
  cur: null,
  warned: false,
};

let nativeTts = null;
if (NATIVE && window.Capacitor && typeof window.Capacitor.registerPlugin === 'function') {
  try { nativeTts = window.Capacitor.registerPlugin('Tts'); } catch { nativeTts = null; }
}

function ttsAvailable() {
  return 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

function ttsActive() {
  return TTS.on && (nativeTts || ttsAvailable());
}

function ttsPickVoice() {
  if (!ttsAvailable()) return null;
  const vs = speechSynthesis.getVoices();
  return vs.find((v) => v.lang.replace('_', '-').toLowerCase().startsWith('vi')) || null;
}

function ttsWarn(msg) {
  if (TTS.warned) return;
  TTS.warned = true;
  toast(msg);
}

function ttsCancel() {
  TTS.cur = null;
  if (nativeTts) nativeTts.stop().catch(() => {});
  if (ttsAvailable()) {
    try { speechSynthesis.cancel(); } catch {}
  }
}

/* thêm tên dấu câu để TTS đọc thành tiếng (giữ số: 3.5, 12:30) */
function speakable(t) {
  let out = String(t);
  out = out.replace(/…/g, ' chấm chấm chấm ');
  out = out.replace(/。/g, ' chấm ').replace(/！/g, ' chấm than ').replace(/？/g, ' chấm hỏi ');
  out = out.replace(/、/g, ' phẩy ').replace(/；/g, ' chấm phẩy ').replace(/：/g, ' hai chấm ');
  out = out.replace(/!/g, ' chấm than ').replace(/\?/g, ' chấm hỏi ');
  out = out.replace(/(?<!\d);(?!\d)/g, ' chấm phẩy ').replace(/(?<!\d):(?!\d)/g, ' hai chấm ');
  out = out.replace(/(?<!\d),(?!\d)/g, ' phẩy ');
  out = out.replace(/(?<!\d)\.(?!\d)/g, ' chấm ');
  out = out.replace(/\s+/g, ' ').trim();
  return out || String(t);
}

/* thời gian tối đa cho 1 câu trước khi coi là engine treo (đủ rộng cho giọng chậm, tốc độ 0.5x) */
function ttsBudgetMs(s) {
  return Math.min(180000, Math.max(6000, (s.length * 160 + 6000) / (TTS.rate || 1)));
}

function speakCurrent() {
  if (!TTS.on) return;
  const raw = reader.sentences[reader.idx];
  if (!raw) return;
  const s = speakable(raw);
  const done = (u) => {
    if (TTS.cur !== u) return;
    if (u.timer) clearTimeout(u.timer);
    TTS.cur = null;
    reader.ttsFails = 0;
    reader.ttsStall = 0;
    // kết thúc bất thường nhanh (engine "ảo") → tạm dừng thay vì tua nhanh
    if (u.t0 && Date.now() - u.t0 < 500 && s.length > 12) {
      reader.ttsFast++;
      if (reader.ttsFast >= 3) {
        reader.ttsFast = 0;
        ttsWarn('Bộ đọc có vẻ lỗi — Tạm dừng để tránh tua nhanh.');
        stopAuto();
        return;
      }
    } else {
      reader.ttsFast = 0;
    }
    if (reader.timer) nextSentence(true);
  };
  if (nativeTts) {
    const u = { t0: Date.now() };
    TTS.cur = u;
    // bộ đếm dự phòng: engine chết không báo onDone → vẫn tự sang câu sau
    const est = ttsBudgetMs(s);
    u.timer = setTimeout(() => {
      if (TTS.cur !== u) return;
      reader.ttsStall++;
      TTS.cur = null;
      nativeTts.stop().catch(() => {});
      if (reader.ttsStall >= 3) {
        reader.ttsStall = 0;
        ttsWarn('Bộ đọc treo — Tạm dừng.');
        stopAuto();
        return;
      }
      if (reader.timer) nextSentence(true);
    }, est);
    const req = { text: s, rate: TTS.rate };
    if (TTS.voiceName) req.voice = TTS.voiceName;
    nativeTts
      .speak(req)
      .then(() => done(u))
      .catch((err) => {
        if (TTS.cur !== u) return;
        const m = String((err && err.message) || err || '');
        if (/not implemented|unavailable/i.test(m)) {
          if (u.timer) clearTimeout(u.timer);
          nativeTts = null;
          TTS.cur = null;
          speakCurrent();
          return;
        }
        if (m.includes('thieu-goi')) {
          if (u.timer) clearTimeout(u.timer);
          TTS.cur = null;
          ttsWarn('Máy thiếu gói tiếng Việt — tải tiếng Việt ở Cài đặt → Giọng nói, hoặc chọn giọng khác ở menu giọng đọc.');
          if (reader.timer) stopAuto();
          return;
        }
        // lỗi tạm thời: thử lại tối đa 2 lần rồi TẠM DỪNG (không được tua nhanh qua câu)
        reader.ttsFails++;
        if (reader.ttsFails <= 2) {
          if (u.timer) clearTimeout(u.timer);
          TTS.cur = null;
          setTimeout(() => {
            if (reader.idx < reader.sentences.length) speakCurrent();
          }, 800);
          return;
        }
        reader.ttsFails = 0;
        if (u.timer) clearTimeout(u.timer);
        TTS.cur = null;
        ttsWarn('Lỗi đọc: ' + m + ' — Tạm dừng.');
        if (reader.timer) stopAuto();
      });
    return;
  }
  if (!ttsAvailable()) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(s);
    u.lang = 'vi-VN';
    u.voice = TTS.voice || ttsPickVoice();
    u.rate = TTS.rate;
    u.t0 = Date.now();
    TTS.cur = u;
    u.onend = () => done(u);
    u.onerror = () => done(u);
    // trình duyệt đôi khi không bắn onend với câu dài → tự sang câu sau thay vì đứng im
    u.timer = setTimeout(() => {
      if (TTS.cur !== u) return;
      TTS.cur = null;
      try { speechSynthesis.cancel(); } catch {}
      if (reader.timer) nextSentence(true);
    }, ttsBudgetMs(s));
    speechSynthesis.speak(u);
  } catch {}
}

async function loadVoices() {
  if (!nativeTts) return;
  for (let i = 0; i < 4; i++) {
    try {
      const r = await nativeTts.getVoices();
      const list = (r && r.voices) || [];
      list.sort((a, b) => {
        const va = String(a.locale || '').toLowerCase().startsWith('vi') ? 0 : 1;
        const vb = String(b.locale || '').toLowerCase().startsWith('vi') ? 0 : 1;
        return va - vb || (b.quality || 0) - (a.quality || 0);
      });
      const sel = $('#voiceSel');
      sel.innerHTML = '';
      const o0 = document.createElement('option');
      o0.value = '';
      o0.textContent = 'Giọng đọc: mặc định';
      sel.appendChild(o0);
      for (const v of list) {
        const o = document.createElement('option');
        o.value = v.name;
        o.textContent = (v.locale || '') + ' · ' + v.name;
        sel.appendChild(o);
      }
      sel.value = TTS.voiceName;
      return;
    } catch {
      await sleep(1200);
    }
  }
}

function syncSpeedSlider() {
  const r = $('#speedRange');
  if (ttsActive()) {
    r.min = '0.5';
    r.max = '3';
    r.step = '0.25';
    r.value = String(TTS.rate);
    $('#speedVal').textContent = TTS.rate + 'x';
  } else {
    r.min = '0.5';
    r.max = '8';
    r.step = '0.5';
    r.value = String(reader.speed);
    $('#speedVal').textContent = reader.speed + 's';
  }
}

if (ttsAvailable()) {
  TTS.voice = ttsPickVoice();
  speechSynthesis.onvoiceschanged = () => { TTS.voice = ttsPickVoice(); };
}

function nextChapterUrl() {
  if (cur.next && cur.next !== cur.toc && keyOf(cur.next) !== cur.key) return cur.next;
  const i = cur.chapters.findIndex((c) => keyOf(c.url) === cur.key);
  if (i >= 0 && i + 1 < cur.chapters.length) return cur.chapters[i + 1].url;
  return '';
}

/* dịch sẵn chương kế khi đọc gần hết → chuyển chương liền mạch */
let prefetching = '';
let prefetchJob = null; // { keys: Set, promise }
const prefetchFail = {};
function maybePrefetchNext() {
  if (!$('#autoNextChk').checked) return;
  const n = reader.sentences.length;
  if (!n || reader.idx < Math.max(3, Math.floor(n * 0.7))) return;
  const url = nextChapterUrl();
  if (!url || keyOf(url) === cur.key) return;
  const k = keyOf(url);
  const en = db.chapters[k];
  if (en && en.vi && !en.partial) return;
  if (prefetching === k) return;
  // lần dịch sẵn trước bị lỗi/thiếu → chờ 60s mới thử lại (tránh gọi dịch liên tục mỗi câu)
  if (prefetchFail[k] && Date.now() - prefetchFail[k] < 60000) return;
  prefetching = k;
  const job = { keys: new Set([k]), promise: null };
  prefetchJob = job;
  job.promise = (async () => {
    try {
      const d = await scrapeUrl(url);
      if (!d.ok || !d.content) throw new Error(d.error || 'không có nội dung');
      const key = keyOf(d.url);
      job.keys.add(key);
      const meta = { url: d.url, book: d.bookTitle || cur.book, chapter: d.chapterTitle || 'Chương', zh: d.content };
      const old = db.chapters[key];
      const fresh = old && old.vi && old.zh === d.content && !old.partial;
      const entry = ensureEntry(key, meta);
      if (!fresh) {
        delete entry.vi;
        const vi = await translateText(d.content, key, meta);
        entry.vi = vi;
        if (!entry.partial) delete entry.chunkCache;
      }
      if (entry.partial) prefetchFail[k] = Date.now();
      else delete prefetchFail[k];
      saveDb();
      prefetching = '';
    } catch {
      prefetchFail[k] = Date.now();
      prefetching = '';
    }
  })();
}

/* chương hiện tại đang được dịch sẵn ở nền → chờ xong rồi dùng, khỏi dịch 2 lần */
async function takePrefetched() {
  const job = prefetchJob;
  if (!job || !job.keys.has(cur.key)) return false;
  setReaderEnd(`Đang hoàn tất bản dịch "${cur.chapter}"...`, false);
  await job.promise;
  const en = db.chapters[cur.key];
  if (en && en.vi && en.zh === cur.content && !en.partial) {
    cur.vi = en.vi;
    return true;
  }
  return false;
}

function setReaderEnd(text, showBtn = true) {
  $('#readerSentence').classList.add('hidden');
  $('#readerFull').classList.add('hidden');
  $('#readerEnd').classList.remove('hidden');
  $('#readerEndText').textContent = text;
  $('#nextChapBtn').style.display = showBtn ? '' : 'none';
}

async function finishAndPlay(retry = 2) {
  if (reader.advancing) return;
  reader.advancing = true;
  reader.retryTranslate = false;
  $('#nextChapBtn').disabled = true;
  try {
    if (!cur.vi) await takePrefetched();
    if (!cur.vi) {
      const meta = { url: cur.url, book: cur.book, chapter: cur.chapter, zh: cur.content };
      const vi = await translateText(cur.content, cur.key, meta, (i, n) => {
        setReaderEnd(`Đang dịch "${cur.chapter}" — khối ${i}/${n}...`, false);
      });
      cur.vi = vi;
      const e = ensureEntry(cur.key, meta);
      e.vi = vi;
      if (!e.partial) delete e.chunkCache;
      saveDb();
    }
    const en = db.chapters[cur.key];
    if (en) {
      en.pos = 0;
      en.total = 0;
    }
    const stillOpen = !$('#reader').classList.contains('hidden');
    reader.advancing = false;
    $('#nextChapBtn').disabled = false;
    if (stillOpen) {
      openReader();
      stopAuto();
      startAuto();
      if (!(en && en.partial)) toast('▶ ' + cur.chapter);
    } else {
      toast('Đã dịch xong: ' + cur.chapter);
    }
  } catch (err) {
    reader.advancing = false;
    $('#nextChapBtn').disabled = false;
    const msg = err.message || String(err);
    if (retry > 0) {
      setReaderEnd(`Lỗi dịch (${msg}) — đang thử lại...`, false);
      setTimeout(() => finishAndPlay(retry - 1), 3000);
      return;
    }
    reader.retryTranslate = true;
    setReaderEnd('Lỗi dịch: ' + msg + ' — bấm ▶ Chương tiếp để thử lại.', true);
    showMsg('Lỗi: ' + msg, 'error');
  }
}

async function advanceChapter(retry = 2) {
  if (reader.advancing) return;
  const nextUrl = nextChapterUrl();
  if (!nextUrl) {
    setReaderEnd('🎉 Đã hết truyện — không còn chương tiếp theo.', false);
    return;
  }
  reader.advancing = true;
  $('#nextChapBtn').disabled = true;
  setReaderEnd('Hết chương — đang tải chương kế tiếp...', false);
  let ok = false;
  let errMsg = '';
  const prevLen = cur.content.length;
  try {
    ok = await loadChapter(nextUrl, true);
    if (!ok) errMsg = lastLoadError || 'không tải được trang';
    if (ok && !cur.content) {
      ok = false;
      errMsg = 'không trích được nội dung chương này';
    }
    if (ok && prevLen > 1500 && cur.content.length < prevLen * 0.35) {
      toast(`⚠ "${cur.chapter}" chỉ có ${cur.content.length} ký tự (chương trước ${prevLen}) — trang nguồn có thể chỉ hiện một phần chương.`, 6000);
    }
  } catch (err) {
    errMsg = err.message || String(err);
  }
  reader.advancing = false;
  $('#nextChapBtn').disabled = false;
  if (!ok) {
    if (retry > 0) {
      setReaderEnd(`Lỗi tải (${errMsg}) — đang thử lại...`, false);
      setTimeout(() => advanceChapter(retry - 1), 3000);
      return;
    }
    setReaderEnd('Lỗi tải: ' + errMsg + ' — bấm ▶ Chương tiếp để thử lại.', true);
    showMsg('Lỗi: ' + errMsg, 'error');
    return;
  }
  await finishAndPlay(retry);
}

function openReader() {
  const text = cur.vi || cur.content;
  if (!text) { toast('Chưa có nội dung để đọc'); return; }
  reader.sentences = splitSentences(text);
  reader.key = cur.key;
  const entry = db.chapters[cur.key];
  if (entry && entry.saved) {
    entry.url = entry.url || cur.url;
    entry.book = entry.book || cur.book;
    entry.chapter = entry.chapter || cur.chapter;
    entry.zh = entry.zh || cur.content;
    entry.vi = entry.vi || cur.vi;
  }
  const savedPos = entry?.pos || 0;
  reader.idx = Math.min(savedPos, Math.max(0, reader.sentences.length - 1));
  if (reader.sentences.length > 1 && savedPos >= reader.sentences.length - 1) reader.idx = 0;
  reader.full = false;

  const meta = ensureEntry(cur.key, {
    url: cur.url, book: cur.book, chapter: cur.chapter,
    zh: cur.content, vi: cur.vi,
  });
  meta.saved = true;
  meta.savedAt = meta.savedAt || Date.now();
  meta.total = reader.sentences.length;
  saveDb();
  updateBadges();

  $('#readerBook').textContent = cur.book;
  $('#readerChapter').textContent = cur.chapter;
  $('#reader').classList.remove('hidden');
  $('#readerFull').classList.add('hidden');
  $('#readerSentence').classList.remove('hidden');
  $('#readerEnd').classList.add('hidden');
  $('#fullBtn').textContent = 'Toàn văn';
  renderReaderFull();
  paintReader();
  document.body.style.overflow = 'hidden';
}

function closeReader() {
  stopAuto();
  $('#reader').classList.add('hidden');
  document.body.style.overflow = '';
  renderCurrent();
  renderLibrary();
}

function savePos() {
  const e = db.chapters[reader.key];
  if (!e) return;
  e.pos = Math.min(reader.idx, Math.max(0, reader.sentences.length - 1));
  e.total = reader.sentences.length;
  saveDb();
}

function paintReader() {
  const n = reader.sentences.length;
  if (reader.idx >= n) {
    if (!reader.advancing) {
      const hasNext = !!nextChapterUrl();
      setReaderEnd(
        hasNext
          ? 'Hết chương. Bấm ▶ Chương tiếp, hoặc bật Tự động để tự sang chương kế tiếp.'
          : 'Đã hết truyện — không còn chương tiếp theo.',
        hasNext
      );
    }
  } else {
    $('#readerEnd').classList.add('hidden');
    $('#readerSentence').classList.remove('hidden');
    $('#readerSentence').textContent = reader.sentences[reader.idx];
  }
  $('#readerPos').textContent = `${Math.min(reader.idx + 1, n)}/${n}`;
  $('#readerFill').style.width = (n ? ((reader.idx + 1) / n) * 100 : 0) + '%';
  if (reader.full) highlightFull();
  savePos();
  maybePrefetchNext();
  if (reader.idx < n) speakCurrent();
}

function nextSentence(fromAuto = false) {
  if (reader.idx >= reader.sentences.length) { stopAuto(); return; }
  reader.idx++;
  const ended = reader.idx >= reader.sentences.length;
  if (ended) stopAuto();
  paintReader();
  if (ended && fromAuto && $('#autoNextChk').checked) advanceChapter();
}

function prevSentence() {
  if (reader.idx > 0) reader.idx--;
  paintReader();
}

function toggleAuto() {
  if (reader.timer) stopAuto();
  else startAuto();
}

function startAuto() {
  if (reader.idx >= reader.sentences.length) reader.idx = 0;
  $('#autoBtn').textContent = '⏸ Tạm dừng';
  if (TTS.on && (nativeTts || ttsAvailable())) {
    reader.timer = 'sound';
    paintReader();
  } else {
    reader.timer = setInterval(() => {
      nextSentence(true);
    }, reader.speed * 1000);
  }
}

function stopAuto() {
  if (reader.timer && reader.timer !== 'sound') clearInterval(reader.timer);
  reader.timer = null;
  $('#autoBtn').textContent = '▶ Tự động';
  ttsCancel();
}

function renderReaderFull() {
  const box = $('#readerFull');
  box.innerHTML = '';
  reader.sentences.forEach((s, i) => {
    const span = document.createElement('span');
    span.className = 's';
    span.textContent = s;
    span.dataset.i = i;
    span.addEventListener('click', (ev) => {
      ev.stopPropagation();
      reader.idx = i;
      paintReader();
    });
    box.appendChild(span);
  });
}

function highlightFull() {
  const box = $('#readerFull');
  const cur = box.querySelector('.s.cur');
  if (cur) cur.classList.remove('cur');
  const el = box.querySelector(`.s[data-i="${reader.idx}"]`);
  if (el) {
    el.classList.add('cur');
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

function toggleFullMode() {
  reader.full = !reader.full;
  if (reader.full) {
    $('#readerSentence').classList.add('hidden');
    $('#readerEnd').classList.add('hidden');
    $('#readerFull').classList.remove('hidden');
    $('#fullBtn').textContent = 'Đọc từng câu';
    highlightFull();
  } else {
    $('#readerFull').classList.add('hidden');
    $('#fullBtn').textContent = 'Toàn văn';
    paintReader();
  }
}

$('#readBtn').addEventListener('click', openReader);
$('#readerClose').addEventListener('click', closeReader);
$('#nextChapBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  // chỉ dịch lại chương hiện tại khi lần dịch trước lỗi; còn lại luôn sang chương kế
  if (reader.retryTranslate && cur.content && !cur.vi) finishAndPlay();
  else advanceChapter();
});
$('#nextSentBtn').addEventListener('click', (e) => { e.stopPropagation(); nextSentence(); });
$('#prevSentBtn').addEventListener('click', (e) => { e.stopPropagation(); prevSentence(); });
$('#autoBtn').addEventListener('click', (e) => { e.stopPropagation(); toggleAuto(); });

function toggleSound() {
  TTS.on = !TTS.on;
  localStorage.setItem('truyen_sound_v1', TTS.on ? '1' : '0');
  $('#soundBtn').textContent = TTS.on ? '🔊' : '🔇';
  if (!TTS.on) ttsCancel();
  syncSpeedSlider();
  if (TTS.on && nativeTts) loadVoices();
  if (reader.timer) {
    stopAuto();
    startAuto();
  } else if (TTS.on && !$('#reader').classList.contains('hidden') && reader.idx < reader.sentences.length) {
    speakCurrent();
  }
}
$('#soundBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  toggleSound();
  toast(TTS.on ? '🔊 Bật tiếng' : '🔇 Tắt tiếng');
});
$('#voiceSel').addEventListener('click', (e) => e.stopPropagation());
$('#voiceSel').addEventListener('change', (e) => {
  e.stopPropagation();
  TTS.voiceName = e.target.value;
  localStorage.setItem('truyen_tts_voice', TTS.voiceName);
  if (!$('#reader').classList.contains('hidden') && reader.idx < reader.sentences.length && TTS.on) speakCurrent();
});
$('#firstBtn').addEventListener('click', (e) => { e.stopPropagation(); reader.idx = 0; paintReader(); });
$('#fullBtn').addEventListener('click', (e) => { e.stopPropagation(); toggleFullMode(); });
$('#readerBody').addEventListener('click', () => { if (!reader.full) nextSentence(); });

$('#speedRange').addEventListener('input', (e) => {
  const v = Number(e.target.value);
  if (ttsActive()) {
    TTS.rate = v;
    localStorage.setItem('truyen_tts_rate', String(v));
    $('#speedVal').textContent = v + 'x';
  } else {
    reader.speed = v;
    $('#speedVal').textContent = v + 's';
    if (reader.timer) { stopAuto(); startAuto(); }
  }
});
$('#speedRange').addEventListener('change', () => {
  if (ttsActive() && !$('#reader').classList.contains('hidden') && reader.idx < reader.sentences.length) speakCurrent();
});

document.addEventListener('keydown', (e) => {
  if ($('#reader').classList.contains('hidden')) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  if (e.code === 'Space') {
    e.preventDefault();
    nextSentence();
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    nextSentence();
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    prevSentence();
  } else if (e.key === 'p' || e.key === 'P') {
    e.preventDefault();
    toggleAuto();
  } else if (e.key === 'm' || e.key === 'M') {
    e.preventDefault();
    toggleSound();
    toast(TTS.on ? '🔊 Bật tiếng' : '🔇 Tắt tiếng');
  } else if (e.key === 'Escape') {
    closeReader();
  } else if (e.key === 'Home') {
    reader.idx = 0;
    paintReader();
  }
});

/* tự đọc tiếp khi quay lại app (tránh ngắt giữa chừng) */
function resumeSpeak() {
  if (document.hidden) return;
  if ($('#reader').classList.contains('hidden')) return;
  if (TTS.on && reader.timer && !TTS.cur && reader.idx < reader.sentences.length) speakCurrent();
}
document.addEventListener('visibilitychange', resumeSpeak);
document.addEventListener('resume', resumeSpeak);

/* ============ cài đặt cookie fanqie ============ */
(function initCookieSettings() {
  const input = $('#cookieInput');
  const stat = $('#cookieStat');
  function refreshStat() {
    const c = getFanqieCookie();
    stat.textContent = c
      ? '✓ Đang dùng cookie (' + c.length + ' ký tự) — chương bị khóa sẽ thử lấy bản đầy đủ.'
      : 'Chưa có cookie — chương bị khóa chỉ tải được đoạn trích ~200 chữ.';
  }
  input.value = getFanqieCookie();
  refreshStat();
  $('#cookieSaveBtn').addEventListener('click', () => {
    const v = input.value.trim();
    try {
      if (v) localStorage.setItem(FANQIE_COOKIE_KEY, v);
      else localStorage.removeItem(FANQIE_COOKIE_KEY);
    } catch { /* bỏ qua */ }
    refreshStat();
    toast(v ? 'Đã lưu cookie ✓' : 'Đã xóa cookie');
  });
  $('#cookieClearBtn').addEventListener('click', () => {
    input.value = '';
    try { localStorage.removeItem(FANQIE_COOKIE_KEY); } catch { /* bỏ qua */ }
    refreshStat();
    toast('Đã xóa cookie');
  });
})();

/* ============ khởi động ============ */
(function init() {
  // app bị đóng khi đang dịch → item kẹt "running" (không chạy lại, không xóa được)
  let fixed = false;
  for (const q of db.queue) {
    if (q.status === 'running') { q.status = 'pending'; q.progress = ''; fixed = true; }
  }
  if (fixed) saveDb();
  updateBadges();
  $('#soundBtn').textContent = TTS.on ? '🔊' : '🔇';
  syncSpeedSlider();
  if (nativeTts) loadVoices();
  else $('#voiceSel').classList.add('hidden');
  if (db.lastUrl) $('#urlInput').value = db.lastUrl;
  showMsg('Dán link chương truyện Trung Quốc rồi bấm “Tải chương”.', '');
})();
