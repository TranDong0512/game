import { Command } from 'commander';
import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, mkdtempSync } from 'fs';

import { downloadVideo } from './downloader.js';
import { extractAudio } from './audio.js';
import { transcribeAudio } from './transcriber.js';
import { translateSegments } from './translator.js';
import { generateSRT } from './subtitle.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const OUTPUT_DIR = join(PROJECT_ROOT, 'output');

config({ path: join(PROJECT_ROOT, '.env') });

const program = new Command();

program
  .name('video-subtitle')
  .description('Tải video → tách audio → dịch → xuất phụ đề SRT')
  .argument('<url>', 'URL video cần xử lý')
  .option('-l, --lang <lang>', 'Ngôn ngữ đích dịch sang', 'vi')
  .option('-o, --output <dir>', 'Thư mục output', OUTPUT_DIR)
  .option('-m, --mode <mode>', 'Chế độ phụ đề: both | translated | original', 'both')
  .option('-s, --skip-translate', 'Bỏ qua bước dịch (chỉ nhận dạng)', false)
  .action(async (url, options) => {
    const startTime = Date.now();
    console.log('');
    console.log('═══════════════════════════════════════════════');
    console.log('  🎬  VIDEO SUBTITLE TOOL');
    console.log('═══════════════════════════════════════════════');
    console.log(`  URL:    ${url}`);
    console.log(`  Lang:   ${options.lang}`);
    console.log(`  Mode:   ${options.mode}`);
    console.log('───────────────────────────────────────────────');
    console.log('');

    try {
      if (!['both', 'original', 'translated'].includes(options.mode)) throw new Error('Mode phải là both, original hoặc translated');
      if (!['http:', 'https:'].includes(new URL(url).protocol)) throw new Error('URL phải dùng HTTP hoặc HTTPS');
      if (!process.env.HF_API_KEY || process.env.HF_API_KEY.includes('xxxx')) throw new Error('Hãy cấu hình HF_API_KEY trong .env trước khi chạy');
      mkdirSync(options.output, { recursive: true });
      options.output = mkdtempSync(join(options.output, 'job-'));
      // Step 1: Download video
      const { videoPath, filename } = await downloadVideo(url, options.output);

      // Step 2: Extract audio
      const audioPath = await extractAudio(videoPath);

      // Step 3: Transcribe
      const transcription = await transcribeAudio(audioPath);

      // Step 4: Translate (optional)
      let segments;
      if (options.skipTranslate || options.mode === 'original') {
        segments = transcription.segments.map((s) => ({
          ...s,
          original: s.text,
          translated: s.text,
        }));
      } else {
        segments = await translateSegments(transcription, options.lang, audioPath);
      }

      // Step 5: Generate SRT
      const srtPath = join(options.output, `${filename}_${options.lang}.srt`);
      generateSRT(segments, srtPath, options.mode);

      // Done
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log('');
      console.log('═══════════════════════════════════════════════');
      console.log('  ✅  HOÀN THÀNH!');
      console.log('───────────────────────────────────────────────');
      console.log(`  Video:      ${videoPath}`);
      console.log(`  Audio:      ${audioPath}`);
      console.log(`  Subtitle:   ${srtPath}`);
      console.log(`  Thời gian:  ${elapsed}s`);
      console.log('═══════════════════════════════════════════════');
    } catch (err) {
      console.error('');
      console.error(`❌  Lỗi: ${err.message}`);
      process.exit(1);
    }
  });

program.parse();
