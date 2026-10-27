import { create as fontkitCreate } from 'fontkit';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(ROOT, '.cache');
const FONT_DIR = path.join(CACHE_DIR, 'fonts');
const MAP_DIR = path.join(CACHE_DIR, 'maps');

const SOURCE_FONTS = [
  {
    id: 'SourceHanSansSCNormal-2.002',
    file: path.join(FONT_DIR, 'SHS-Normal-2.002.otf'),
    url: 'https://raw.githubusercontent.com/adobe-fonts/source-han-sans/2.002R/OTF/SimplifiedChinese/SourceHanSansSC-Normal.otf',
  },
];

const PUA_GLOBAL = /[\uE000-\uF8FF]/g;

let sourceMapCache = null; // Map<quantKey, codepoint>

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function quantKey(cs) {
  const parts = [];
  for (const c of cs) {
    if (c.command === 'closePath') parts.push('z');
    else parts.push(c.command + (c.args || []).map((v) => Math.round(v)).join(','));
  }
  return parts.join('|');
}

function glyphCommands(glyph) {
  try {
    const cs = glyph.path.commands;
    if (!cs || !cs.length) return null;
    return cs.map((c) => ({ command: c.command, args: c.args || [] }));
  } catch {
    return null;
  }
}

async function ensureSourceFont(src) {
  if (fs.existsSync(src.file)) return src.file;
  ensureDir(FONT_DIR);
  console.log('[deob] tải font nguồn', src.id, '...');
  const res = await fetch(src.url, { signal: AbortSignal.timeout(300000) });
  if (!res.ok) throw new Error('tải font nguồn HTTP ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(src.file + '.tmp', buf);
  fs.renameSync(src.file + '.tmp', src.file);
  return src.file;
}

function buildSourceMap(font) {
  const map = new Map();
  for (const cp of font.characterSet) {
    const cs = glyphCommands(font.glyphForCodePoint(cp));
    if (!cs) continue;
    const k = quantKey(cs);
    if (!map.has(k)) map.set(k, cp);
  }
  return map;
}

async function getSourceMap() {
  if (sourceMapCache) return sourceMapCache;
  for (const src of SOURCE_FONTS) {
    try {
      const file = await ensureSourceFont(src);
      const font = fontkitCreate(fs.readFileSync(file));
      sourceMapCache = buildSourceMap(font);
      console.log('[deob] nạp font nguồn', src.id, '-', sourceMapCache.size, 'outline');
      return sourceMapCache;
    } catch (e) {
      console.log('[deob] lỗi font nguồn', src.id + ':', e.message);
    }
  }
  return null;
}

function sha1(s) {
  return crypto.createHash('sha1').update(s).digest('hex');
}

function mapCachePath(fontUrl) {
  return path.join(MAP_DIR, sha1(fontUrl) + '.json');
}

async function downloadFont(fontUrl) {
  ensureDir(FONT_DIR);
  const file = path.join(FONT_DIR, sha1(fontUrl) + (fontUrl.endsWith('.woff2') ? '.woff2' : '.woff'));
  if (fs.existsSync(file)) return fs.readFileSync(file);
  const res = await fetch(fontUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0' },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(file, buf);
  return buf;
}

async function buildMapForFont(fontUrl, srcMap) {
  const buf = await downloadFont(fontUrl);
  let font;
  try {
    font = fontkitCreate(buf);
  } catch (e) {
    throw new Error('không mở được font: ' + e.message);
  }
  const map = {};
  let total = 0;
  let hit = 0;
  for (const cp of font.characterSet) {
    total++;
    const cs = glyphCommands(font.glyphForCodePoint(cp));
    if (!cs) continue;
    const srcCp = srcMap.get(quantKey(cs));
    if (srcCp !== undefined) {
      map[cp.toString(16)] = String.fromCodePoint(srcCp);
      hit++;
    }
  }
  return { map, total, hit, rate: total ? hit / total : 0 };
}

function loadCachedMap(fontUrl) {
  try {
    const p = mapCachePath(fontUrl);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {}
  return null;
}

function saveMap(fontUrl, map) {
  try {
    ensureDir(MAP_DIR);
    fs.writeFileSync(mapCachePath(fontUrl), JSON.stringify(map));
  } catch {}
}

function collectFontUrls(html) {
  const norm = html.replace(/\\u002F/g, '/');
  const urls = [...new Set(norm.match(/https?:\/\/[^)"'\s<>]+?\.woff2?/g) || [])];
  const score = (u) => (/-\d+\.woff2?$/.test(u) ? 2 : 0) + (u.endsWith('.woff') ? 0 : 1);
  return urls.sort((a, b) => score(a) - score(b));
}

export async function decodeObfuscatedFonts(html) {
  const pua = html.match(PUA_GLOBAL) || [];
  const unique = new Set(pua);
  if (unique.size < 5) return { html, obfuscated: false, decoded: null };

  const urls = collectFontUrls(html);
  if (!urls.length) return { html, obfuscated: true, decoded: false };

  let srcMap = null;
  for (const u of urls) {
    const cached = loadCachedMap(u);
    if (cached && Object.keys(cached).length) {
      return { html: applyMap(html, cached), obfuscated: true, decoded: true, font: u };
    }
  }

  srcMap = await getSourceMap();
  if (!srcMap) return { html, obfuscated: true, decoded: false };

  for (const u of urls) {
    try {
      const { map, total, hit, rate } = await buildMapForFont(u, srcMap);
      console.log(`[deob] ${u.split('/').pop()} → khớp ${hit}/${total} (${(rate * 100).toFixed(0)}%)`);
      if (rate >= 0.5 && Object.keys(map).length) {
        saveMap(u, map);
        return { html: applyMap(html, map), obfuscated: true, decoded: true, font: u };
      }
    } catch (e) {
      console.log('[deob] lỗi font', u.split('/').pop() + ':', e.message);
    }
  }
  return { html, obfuscated: true, decoded: false };
}

function applyMap(html, map) {
  return html.replace(PUA_GLOBAL, (ch) => map[ch.codePointAt(0).toString(16)] ?? ch);
}
