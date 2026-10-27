import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export async function ensureDir(dir) {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

export async function saveFile(filePath, data) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, data);
}

export function parseStickerPackUrl(url) {
  const patterns = [
    /t\.me\/addstickers\/(\w+)/,
    /t\.me\/(\w+)\?start=/,
    /t\.me\/(\w+)$/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  if (/^\w+$/.test(url)) return url;

  return null;
}

export function getMimeType(ext) {
  const mimeTypes = {
    '.webp': 'image/webp',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.tgs': 'application/x-tgsticker',
    '.webm': 'video/webm'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
