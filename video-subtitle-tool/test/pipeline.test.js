import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import axios from 'axios';
import { generateSRT } from '../src/subtitle.js';
import { transcribeAudio } from '../src/transcriber.js';
import { translateSegments } from '../src/translator.js';

const dir = mkdtempSync(join(tmpdir(), 'subtitle-test-'));
const audio = join(dir, 'audio.mp3');
writeFileSync(audio, 'test audio');
test.after(() => rmSync(dir, { recursive: true, force: true }));
const segment = { id: 0, start: 0, end: 2, original: 'Hello', translated: 'Xin chào' };

test('SRT carries rounded milliseconds into the next minute', () => {
  const path = join(dir, 'rounding.srt');
  generateSRT([{ ...segment, start: 59.9999, end: 61 }], path);
  assert.match(readFileSync(path, 'utf8'), /00:01:00,000 --> 00:01:01,000/);
});
test('SRT avoids duplicate lines when translation equals original', () => {
  const path = join(dir, 'same.srt');
  generateSRT([{ ...segment, translated: 'Hello' }], path);
  assert.equal(readFileSync(path, 'utf8').split('Hello').length - 1, 1);
});
test('SRT rejects zero-duration cues', () => {
  assert.throws(() => generateSRT([{ ...segment, end: 0 }], join(dir, 'bad.srt')));
});
test('SRT validates output mode', () => {
  assert.throws(() => generateSRT([segment], join(dir, 'mode.srt'), 'typo'));
});
test('ASR reads key at request time, requests timestamps, sends base64 JSON', async (t) => {
  process.env.HF_API_KEY = 'hf_test_only';
  let request;
  t.mock.method(axios, 'post', async (...args) => {
    request = args;
    return { data: { chunks: [{ timestamp: [0, 2], text: ' Hello ' }], language: 'en' } };
  });
  const result = await transcribeAudio(audio);
  assert.equal(request[2].headers.Authorization, 'Bearer hf_test_only');
  assert.equal(request[1].inputs, Buffer.from('test audio').toString('base64'));
  assert.equal(request[1].parameters.return_timestamps, true);
  assert.equal(result.segments[0].text, 'Hello');
});
test('ASR refuses missing timestamps instead of silently emitting 0 to 0', async (t) => {
  t.mock.method(axios, 'post', async () => ({ data: { text: 'Hello' } }));
  await assert.rejects(transcribeAudio(audio), /timestamp|thời gian/i);
});
test('translation uses translation_text from translation API', async (t) => {
  t.mock.method(axios, 'post', async () => ({ data: [{ translation_text: 'Xin chào' }] }));
  const result = await translateSegments({ language: 'en', segments: [{ id: 0, start: 0, end: 2, text: 'Hello' }] }, 'vi', audio);
  assert.equal(result[0].translated, 'Xin chào');
});
test('original and translated SRT modes select the correct text', () => {
  for (const mode of ['original', 'translated']) {
    const path = join(dir, `${mode}.srt`);
    generateSRT([segment], path, mode);
    const content = readFileSync(path, 'utf8');
    assert.ok(content.includes(segment[mode]));
    assert.ok(!content.includes(mode === 'original' ? segment.translated : segment.original));
  }
});

test('ASR fails before making a request when the key is missing', async (t) => {
  const saved = process.env.HF_API_KEY;
  delete process.env.HF_API_KEY;
  const call = t.mock.method(axios, 'post', async () => { throw new Error('must not call'); });
  try {
    await assert.rejects(transcribeAudio(audio), /HF_API_KEY/);
    assert.equal(call.mock.callCount(), 0);
  } finally { if (saved !== undefined) process.env.HF_API_KEY = saved; }
});

test('ASR rejects null or reversed timestamp boundaries', async (t) => {
  for (const timestamp of [[0, null], [3, 2]]) {
    t.mock.method(axios, 'post', async () => ({ data: { chunks: [{ timestamp, text: 'Hello' }] } }));
    await assert.rejects(transcribeAudio(audio), /timestamp/);
  }
});
