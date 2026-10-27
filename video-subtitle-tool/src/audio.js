import ffmpeg from 'fluent-ffmpeg';
import { join, dirname } from 'path';

export function extractAudio(videoPath) {
  return new Promise((resolve, reject) => {
    const dir = dirname(videoPath);
    const audioPath = join(dir, 'audio.mp3');

    console.log(`🎵  Đang trích xuất audio...`);

    ffmpeg(videoPath)
      .output(audioPath)
      .audioCodec('libmp3lame')
      .audioBitrate('128k')
      .audioChannels(1)
      .audioFrequency(16000)
      .format('mp3')
      .on('end', () => {
        console.log(`✅  Đã trích xuất audio: ${audioPath}`);
        resolve(audioPath);
      })
      .on('error', (err) => {
        reject(new Error(`Lỗi trích xuất audio: ${err.message}`));
      })
      .run();
  });
}
