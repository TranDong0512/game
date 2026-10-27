import axios from 'axios';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';

export async function transcribeAudio(audioPath) {
  const HF_API_KEY = process.env.HF_API_KEY;
  if (!HF_API_KEY || HF_API_KEY.includes('xxxx')) throw new Error('Chưa cấu hình HF_API_KEY hợp lệ');
  const dir = dirname(audioPath);

  console.log(`🗣  Đang nhận dạng giọng nói (Whisper)...`);

  const audioFile = readFileSync(audioPath);

  const response = await axios.post(
    process.env.HF_ASR_URL || 'https://router.huggingface.co/hf-inference/models/openai/whisper-large-v3',
    { inputs: audioFile.toString('base64'), parameters: { return_timestamps: true } },
    {
      headers: {
        Authorization: `Bearer ${HF_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 300000,
    }
  );

  const result = response.data;

  // HuggingFace Whisper trả về { text, chunks: [{timestamp, text}] }
  if (!Array.isArray(result.chunks) || !result.chunks.length) {
    throw new Error('API không trả timestamps; không thể tạo phụ đề có thời gian chính xác');
  }
  const segments = result.chunks.map((chunk, idx) => ({
    id: idx,
    start: chunk.timestamp?.[0],
    end: chunk.timestamp?.[1],
    text: chunk.text.trim(),
    language: result.language || 'en',
  }));

  if (segments.some(s => !Number.isFinite(s.start) || !Number.isFinite(s.end) || s.start < 0 || s.end <= s.start)) {
    throw new Error('API trả timestamp không hợp lệ');
  }

  const transcription = {
    language: result.language || 'en',
    duration: segments.length > 0 ? segments[segments.length - 1].end : 0,
    segments,
  };

  const jsonPath = join(dir, 'transcription.json');
  writeFileSync(jsonPath, JSON.stringify(transcription, null, 2), 'utf-8');

  console.log(`✅  Nhận dạng xong (${segments.length} segments, ngôn ngữ: ${result.language || 'en'})`);
  return transcription;
}
