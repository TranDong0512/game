import { randomUUID } from 'crypto';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export async function downloadVideo(url, outputDir) {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const filename = `video_${randomUUID().slice(0, 8)}`;
  const outputPath = join(outputDir, `${filename}.mp4`);

  console.log(`⬇  Đang tải video từ: ${url}`);

  try {
    await execFileAsync('yt-dlp', [
      '-o', outputPath,
      '--format', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '--merge-output-format', 'mp4',
      '--no-playlist',
      '--', url,
    ], { timeout: 300000 });

    console.log(`✅  Đã tải video: ${outputPath}`);
    return { videoPath: outputPath, filename };
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error('yt-dlp chưa được cài đặt. Cài: pip install yt-dlp');
    }
    throw new Error(`Không thể tải video: ${err.message}`);
  }
}
