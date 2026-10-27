/* Entry cho app Capacitor (WebView): gắn CapacitorHttp + opentify.js + cache localStorage. */
import { createScrape } from './scrape.js';
import { translateChunk } from './translate.js';
import { createDeob, createOpentypeFontApi } from './deob.js';
import { createCapHttp } from './http-cap.js';

const MAPS_KEY = 'fanqie_maps_v1';

function loadMaps() {
  try {
    return JSON.parse(localStorage.getItem(MAPS_KEY)) || {};
  } catch {
    return {};
  }
}

let maps = null;

const C = globalThis.Capacitor;
const CapacitorHttp = C?.Plugins?.CapacitorHttp || C?.CapacitorHttp;
if (!CapacitorHttp) throw new Error('CapacitorHttp không khả dụng');

const http = createCapHttp(CapacitorHttp);
const ot = globalThis.opentype;
if (!ot) throw new Error('opentype.js chưa nạp');

const deob = createDeob({
  fontApi: createOpentypeFontApi(ot),
  loadSourceBytes: async () => {
    const res = await fetch('fonts/SHS-Normal-2.002.otf');
    if (!res.ok) throw new Error('tải font nguồn HTTP ' + res.status);
    return new Uint8Array(await res.arrayBuffer());
  },
  loadFontBytes: async (u) => {
    const res = await http.request(u, { timeoutMs: 30000 });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.bytes;
  },
  cache: {
    async get(u) {
      if (!maps) maps = loadMaps();
      return maps[u] || null;
    },
    async set(u, m) {
      if (!maps) maps = loadMaps();
      maps[u] = m;
      try {
        localStorage.setItem(MAPS_KEY, JSON.stringify(maps));
      } catch {
        maps = {};
        maps[u] = m;
        try {
          localStorage.setItem(MAPS_KEY, JSON.stringify({ [u]: m }));
        } catch {
          /* bỏ qua — lần sau build lại */
        }
      }
    },
  },
});

const scrapeBase = createScrape(http, deob);

async function scrape(url, opts = {}) {
  if (!opts.cookie) {
    try { opts.cookie = localStorage.getItem('fanqie_cookie_v1') || ''; } catch { /* bỏ qua */ }
  }
  return scrapeBase(url, opts);
}

export { scrape };

export async function translate(q, sl = 'zh-CN', tl = 'vi') {
  try {
    const r = await translateChunk(http, q, sl, tl);
    return { ok: true, text: r.text, engine: r.engine, partial: !!r.partial, warning: r.warning || '' };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}
