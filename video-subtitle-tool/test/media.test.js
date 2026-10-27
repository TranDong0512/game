import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractAudio } from '../src/audio.js';

const exec = promisify(execFile);
test('real FFmpeg extracts a 16 kHz mono MP3 from a generated video', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'subtitle-media-'));
  try {
    const video = join(dir, 'sample.mp4');
    await exec('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=black:s=160x120:d=1', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:v', 'mpeg4', '-c:a', 'aac', '-shortest', video]);
    const audio = await extractAudio(video);
    const { stdout } = await exec('ffprobe', ['-v', 'quiet', '-show_streams', '-of', 'json', audio]);
    const stream = JSON.parse(stdout).streams[0];
    assert.equal(stream.codec_name, 'mp3');
    assert.equal(stream.sample_rate, '16000');
    assert.equal(stream.channels, 1);
    assert.ok(Number(stream.duration) >= 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
