import axios from 'axios';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';

async function translateText(text, srcLang, tgtLang) {
  const HF_API_KEY = process.env.HF_API_KEY;
  if (!HF_API_KEY || HF_API_KEY.includes('xxxx')) throw new Error('Chưa cấu hình HF_API_KEY hợp lệ');
  if (srcLang === tgtLang) return text;
  // Map language codes
  const langMap = { vi: 'vi', en: 'en', ja: 'ja', ko: 'ko', zh: 'zh' };
  const src = langMap[srcLang] || 'en';
  const tgt = langMap[tgtLang] || 'vi';

  // Dùng Helsinki-NLP/opus-mt cho pairs phổ biến
  const modelMap = {
    'en-vi': 'Helsinki-NLP/opus-mt-en-vi',
    'en-ja': 'Helsinki-NLP/opus-mt-en-ja',
    'en-ko': 'Helsinki-NLP/opus-mt-en-ko',
    'en-zh': 'Helsinki-NLP/opus-mt-en-zh',
  };

  const modelKey = `${src}-${tgt}`;
  const model = modelMap[modelKey];

  if (model) {
    // Dùng Helsinki-NLP model (nhanh, không cần batching)
    const response = await axios.post(
      `https://router.huggingface.co/hf-inference/models/${model}`,
      { inputs: text },
      {
        headers: { Authorization: `Bearer ${HF_API_KEY}` },
        timeout: 60000,
      }
    );

    const result = response.data;
    if (Array.isArray(result) && result[0]?.translation_text) {
      return result[0].translation_text;
    }
    if (typeof result === 'string') {
      return result;
    }
    throw new Error('API dịch không trả translation_text');
  }

  // Fallback: dùng model generative lớn hơn
  const response = await axios.post(
    'https://router.huggingface.co/hf-inference/models/mistralai/Mistral-7B-Instruct-v0.2',
    {
      inputs: `<s>[INST] Translate the following text to ${tgt}. Only return the translation, no explanation:\n\n${text} [/INST]`,
      parameters: { max_new_tokens: 1000, temperature: 0.3 },
    },
    {
      headers: { Authorization: `Bearer ${HF_API_KEY}` },
      timeout: 60000,
    }
  );

  const result = response.data;
  if (Array.isArray(result) && result[0]?.generated_text) {
    const match = result[0].generated_text.match(/\[\/INST\]\s*([\s\S]*?)$/);
    return match ? match[1].trim() : result[0].generated_text;
  }
  return text;
}

export async function translateSegments(transcription, targetLang, audioPath) {
  const dir = dirname(audioPath);

  console.log(`🌐  Đang dịch ${transcription.segments.length} segments sang ${targetLang}...`);

  const BATCH_SIZE = 5; // HuggingFace free tier cần batch nhỏ
  const translatedSegments = [];

  for (let i = 0; i < transcription.segments.length; i += BATCH_SIZE) {
    const batch = transcription.segments.slice(i, i + BATCH_SIZE);
    const progress = Math.min(i + BATCH_SIZE, transcription.segments.length);

    process.stdout.write(`\r   Đang dịch: ${progress}/${transcription.segments.length}`);

    for (const segment of batch) {
      try {
        const translated = await translateText(
          segment.text,
          transcription.language || 'en',
          targetLang
        );
        translatedSegments.push({
          id: segment.id,
          start: segment.start,
          end: segment.end,
          original: segment.text,
          translated,
        });
      } catch (err) {
        console.error(`\n   ⚠  Lỗi dịch segment ${segment.id}: ${err.message}`);
        translatedSegments.push({
          id: segment.id,
          start: segment.start,
          end: segment.end,
          original: segment.text,
          translated: segment.text,
        });
      }

      // Delay 500ms giữa mỗi request (free tier rate limit)
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  console.log('\n');

  const jsonPath = join(dir, 'translated.json');
  writeFileSync(jsonPath, JSON.stringify(translatedSegments, null, 2), 'utf-8');

  console.log(`✅  Đã dịch xong`);
  return translatedSegments;
}
