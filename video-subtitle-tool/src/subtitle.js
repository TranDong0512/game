import { writeFileSync } from 'fs';

function formatTime(seconds) {
  const total = Math.round(seconds * 1000);
  const h = Math.floor(total / 3600000);
  const m = Math.floor(total / 60000) % 60;
  const s = Math.floor(total / 1000) % 60;
  const ms = total % 1000;

  return (
    String(h).padStart(2, '0') +
    ':' +
    String(m).padStart(2, '0') +
    ':' +
    String(s).padStart(2, '0') +
    ',' +
    String(ms).padStart(3, '0')
  );
}

export function generateSRT(segments, outputPath, mode = 'both') {
  if (!['both', 'original', 'translated'].includes(mode)) throw new Error('Chế độ phụ đề không hợp lệ');
  if (!segments.length) throw new Error('Không có phụ đề để xuất');
  console.log(`📝  Đang xuất file phụ đề...`);

  const lines = [];

  segments.forEach((seg, idx) => {
    if (!Number.isFinite(seg.start) || !Number.isFinite(seg.end) || seg.start < 0 ||
        Math.round(seg.end * 1000) <= Math.round(seg.start * 1000)) {
      throw new Error(`Thời gian phụ đề không hợp lệ tại đoạn ${idx + 1}`);
    }
    lines.push(String(idx + 1));
    lines.push(`${formatTime(seg.start)} --> ${formatTime(seg.end)}`);

    if (mode === 'original') {
      lines.push(seg.original);
    } else if (mode === 'translated') {
      lines.push(seg.translated);
    } else {
      lines.push(seg.translated);
      if (seg.original !== seg.translated) lines.push(seg.original);
    }

    lines.push('');
  });

  const srtContent = lines.join('\n');
  writeFileSync(outputPath, srtContent, 'utf-8');

  console.log(`✅  Đã xuất phụ đề: ${outputPath}`);
  return outputPath;
}
