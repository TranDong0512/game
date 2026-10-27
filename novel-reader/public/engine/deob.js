/* Giải mã font chống scrape (PUA) — portable, fontApi/bytes do host injection. */

const PUA_GLOBAL = /[\uE000-\uF8FF]/g;

export function createDeob({ fontApi, loadSourceBytes, loadFontBytes, cache }) {
  let sourceMap = null;
  let sourceLoaded = false;

  async function getSourceMap() {
    if (sourceLoaded) return sourceMap;
    sourceLoaded = true;
    try {
      const bytes = await loadSourceBytes();
      const font = fontApi.parse(bytes);
      const map = new Map();
      for (const cp of font.codepoints) {
        const k = font.outlineKey(cp);
        if (k && !map.has(k)) map.set(k, cp);
      }
      sourceMap = map;
      console.log('[deob] nguồn:', map.size, 'outline');
    } catch (e) {
      console.log('[deob] lỗi font nguồn:', e.message);
    }
    return sourceMap;
  }

  function collectFontUrls(html) {
    const norm = html.replace(/\\u002F/g, '/');
    const urls = [...new Set(norm.match(/https?:\/\/[^)"'\s<>]+?\.woff2?/g) || [])];
    const score = (u) => (/-\d+\.woff2?$/.test(u) ? 2 : 0) + (u.endsWith('.woff') ? 0 : 1);
    return urls.sort((a, b) => score(a) - score(b));
  }

  function applyMap(html, map) {
    return html.replace(PUA_GLOBAL, (ch) => map[ch.codePointAt(0).toString(16)] ?? ch);
  }

  return async function decodeObfuscatedFonts(html) {
    const pua = html.match(PUA_GLOBAL) || [];
    if (new Set(pua).size < 5) return { html, obfuscated: false, decoded: null };

    const urls = collectFontUrls(html);
    if (!urls.length) return { html, obfuscated: true, decoded: false };

    for (const u of urls) {
      const cached = await cache.get(u);
      if (cached && Object.keys(cached).length) {
        return { html: applyMap(html, cached), obfuscated: true, decoded: true, font: u };
      }
    }

    const srcMap = await getSourceMap();
    if (!srcMap) return { html, obfuscated: true, decoded: false };

    for (const u of urls) {
      try {
        const bytes = await loadFontBytes(u);
        const font = fontApi.parse(bytes);
        const map = {};
        let total = 0;
        let hit = 0;
        for (const cp of font.codepoints) {
          total++;
          const k = font.outlineKey(cp);
          if (!k) continue;
          const srcCp = srcMap.get(k);
          if (srcCp !== undefined) {
            map[cp.toString(16)] = String.fromCodePoint(srcCp);
            hit++;
          }
        }
        const rate = total ? hit / total : 0;
        console.log(`[deob] font khớp ${hit}/${total} (${(rate * 100).toFixed(0)}%)`);
        if (rate >= 0.5 && Object.keys(map).length) {
          await cache.set(u, map);
          return { html: applyMap(html, map), obfuscated: true, decoded: true, font: u };
        }
      } catch (e) {
        console.log('[deob] lỗi font:', e.message);
      }
    }
    return { html, obfuscated: true, decoded: false };
  };
}

/* Adapter opentype.js — dùng cho cả Node test lẫn WebView. */
export function createOpentypeFontApi(ot) {
  return {
    parse(bytes) {
      const buf =
        bytes instanceof ArrayBuffer
          ? bytes
          : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const font = ot.parse(buf);
      const codepoints = [];
      for (let cp = 0x20; cp < 0x30000; cp++) {
        const ch = String.fromCodePoint(cp);
        if (font.charToGlyphIndex(ch)) codepoints.push(cp);
      }
      return {
        codepoints,
        outlineKey(cp) {
          try {
            const glyph = font.charToGlyph(String.fromCodePoint(cp));
            if (!glyph || !glyph.path || !glyph.path.commands || !glyph.path.commands.length) return null;
            const parts = [];
            for (const c of glyph.path.commands) {
              if (c.type === 'Z') parts.push('closePath');
              else if (c.type === 'M') parts.push('moveTo' + [c.x, c.y].map(Math.round).join(','));
              else if (c.type === 'L') parts.push('lineTo' + [c.x, c.y].map(Math.round).join(','));
              else if (c.type === 'C')
                parts.push('curveTo' + [c.x1, c.y1, c.x2, c.y2, c.x, c.y].map(Math.round).join(','));
              else if (c.type === 'Q')
                parts.push('quadraticCurveTo' + [c.x1, c.y1, c.x, c.y].map(Math.round).join(','));
            }
            return parts.join('|');
          } catch {
            return null;
          }
        },
      };
    },
  };
}
