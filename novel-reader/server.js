import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeObfuscatedFonts } from './deobfuscate.js';
// Dùng CHUNG engine với app Android → sửa một chỗ, cả web lẫn APK cùng được sửa
import { createScrape } from './public/engine/scrape.js';
import { translateChunk } from './public/engine/translate.js';
import { fetchHttp } from './public/engine/http-fetch.js';

const scrape = createScrape(fetchHttp, decodeObfuscatedFonts);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT) || 8787;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 2 * 1024 * 1024) {
        reject(new Error('Body quá lớn'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handleApi(req, res, pathname, searchParams) {
  if (pathname === '/api/scrape') {
    const target = searchParams.get('url') || '';
    if (!/^https?:\/\//i.test(target)) {
      return sendJson(res, 400, { ok: false, error: 'URL không hợp lệ (cần bắt đầu bằng http/https)' });
    }
    // cookie đăng nhập fanqie (chương bị khóa mới cần) — nhận từ header hoặc env
    const cookie = (req.headers['x-fanqie-cookie'] || process.env.FANQIE_COOKIE || '').toString().slice(0, 8000);
    try {
      return sendJson(res, 200, await scrape(target, { cookie }));
    } catch (e) {
      return sendJson(res, 502, { ok: false, error: 'Không tải được trang: ' + (e.message || e) });
    }
  }

  if (pathname === '/api/t' && req.method === 'POST') {
    let body;
    try {
      body = JSON.parse((await readBody(req)) || '{}');
    } catch {
      return sendJson(res, 400, { ok: false, error: 'JSON không hợp lệ' });
    }
    const q = (body.q || '').toString();
    const sl = body.sl || 'zh-CN';
    const tl = body.tl || 'vi';
    if (!q.trim()) return sendJson(res, 400, { ok: false, error: 'Thiếu văn bản cần dịch' });
    if (q.length > 4500) return sendJson(res, 400, { ok: false, error: 'Một lần dịch tối đa 4500 ký tự' });
    try {
      const r = await translateChunk(fetchHttp, q, sl, tl);
      return sendJson(res, 200, { ok: true, text: r.text, engine: r.engine, partial: !!r.partial, warning: r.warning || '' });
    } catch (e) {
      return sendJson(res, 502, { ok: false, error: 'Dịch lỗi: ' + (e.message || e) });
    }
  }

  if (pathname === '/api/health') {
    return sendJson(res, 200, { ok: true, time: Date.now() });
  }

  return sendJson(res, 404, { ok: false, error: 'Không tìm thấy API' });
}

async function serveStatic(res, pathname) {
  let rel;
  try {
    rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('URL không hợp lệ');
    return;
  }
  rel = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
  const file = path.join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  try {
    const data = await readFile(file);
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Không tìm thấy trang');
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://localhost');
    const pathname = u.pathname;
    if (pathname.startsWith('/api/')) {
      await handleApi(req, res, pathname, u.searchParams);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405);
      res.end();
      return;
    }
    await serveStatic(res, pathname);
  } catch (e) {
    try {
      sendJson(res, 500, { ok: false, error: e.message || 'Lỗi server' });
    } catch {
      res.end();
    }
  }
});

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`Cổng ${PORT} đã có server khác đang chạy.`);
    console.error(`→ Mở http://localhost:${PORT} để dùng ngay,`);
    console.error(`→ Hoặc chạy cổng khác: $env:PORT=${PORT + 1}; npm start`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  console.log(`Server đang chạy: http://localhost:${PORT}`);
});
