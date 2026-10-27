package vn.personal.subtitle;

import android.media.AudioFormat;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.os.SystemClock;
import java.io.*;
import java.nio.*;
import java.nio.charset.StandardCharsets;

/** Uses Android codecs, avoiding third-party FFmpeg ELF dependencies on 16 KB devices. */
final class AudioDecoder {
    interface Cancellation { void check() throws InterruptedException; }

    static void extract(File source, File directory, Cancellation cancellation) throws Exception {
        MediaExtractor extractor = new MediaExtractor();
        MediaCodec decoder = null;
        try (WavChunks sink = new WavChunks(directory)) {
            extractor.setDataSource(source.getAbsolutePath());
            MediaFormat format = null;
            for (int i = 0; i < extractor.getTrackCount(); i++) {
                MediaFormat candidate = extractor.getTrackFormat(i);
                if (candidate.getString(MediaFormat.KEY_MIME).startsWith("audio/")) {
                    extractor.selectTrack(i); format = candidate; break;
                }
            }
            if (format == null) throw new IOException("Video không có âm thanh.");
            int rate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE);
            int channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
            int encoding = pcmEncoding(format);
            String mime = format.getString(MediaFormat.KEY_MIME);
            if ("audio/raw".equals(mime)) {
                ByteBuffer data = ByteBuffer.allocateDirect(1024 * 1024).order(ByteOrder.LITTLE_ENDIAN);
                while (true) {
                    cancellation.check(); data.clear(); int size = extractor.readSampleData(data, 0);
                    if (size < 0) break;
                    data.position(0); data.limit(size);
                    sink.write(data, rate, channels, encoding, extractor.getSampleTime());
                    extractor.advance();
                }
                return;
            }
            format.setInteger(MediaFormat.KEY_PCM_ENCODING, AudioFormat.ENCODING_PCM_16BIT);
            try { decoder = MediaCodec.createDecoderByType(mime); }
            catch (IOException ex) { throw new IOException("Điện thoại chưa hỗ trợ codec " + mime + ". Hãy chọn MP4/AAC, MP3 hoặc WAV.", ex); }
            decoder.configure(format, null, null, 0); decoder.start();
            boolean inputDone = false, outputDone = false;
            MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
            long lastProgress = SystemClock.elapsedRealtime();
            while (!outputDone) {
                cancellation.check();
                if (SystemClock.elapsedRealtime() - lastProgress > 60000) throw new IOException("Bộ giải mã không phản hồi. Video có thể bị hỏng.");
                if (!inputDone) {
                    int inputIndex = decoder.dequeueInputBuffer(10000);
                    if (inputIndex >= 0) {
                        ByteBuffer buffer = decoder.getInputBuffer(inputIndex);
                        buffer.clear(); int size = extractor.readSampleData(buffer, 0);
                        if (size < 0) {
                            decoder.queueInputBuffer(inputIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM); inputDone = true;
                        } else {
                            decoder.queueInputBuffer(inputIndex, 0, size, Math.max(0, extractor.getSampleTime()), 0);
                            extractor.advance();
                        }
                        lastProgress = SystemClock.elapsedRealtime();
                    }
                }
                int outputIndex = decoder.dequeueOutputBuffer(info, 10000);
                if (outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    MediaFormat actual = decoder.getOutputFormat();
                    rate = actual.getInteger(MediaFormat.KEY_SAMPLE_RATE); channels = actual.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
                    encoding = pcmEncoding(actual);
                } else if (outputIndex >= 0) {
                    if (info.size > 0) {
                        ByteBuffer output = decoder.getOutputBuffer(outputIndex).duplicate().order(ByteOrder.LITTLE_ENDIAN);
                        output.position(info.offset); output.limit(info.offset + info.size);
                        sink.write(output, rate, channels, encoding, info.presentationTimeUs);
                    }
                    decoder.releaseOutputBuffer(outputIndex, false);
                    outputDone = (info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0;
                    lastProgress = SystemClock.elapsedRealtime();
                }
            }
        } finally {
            if (decoder != null) { try { decoder.stop(); } catch (Exception ignored) { } decoder.release(); }
            extractor.release();
        }
    }
    private static int pcmEncoding(MediaFormat format) {
        return format.containsKey(MediaFormat.KEY_PCM_ENCODING) ? format.getInteger(MediaFormat.KEY_PCM_ENCODING) : AudioFormat.ENCODING_PCM_16BIT;
    }

    private static final class WavChunks implements AutoCloseable {
        private final File directory;
        private final Writer boundaries;
        private OutputStream output;
        private File current;
        private int samples, index, accumulator, previousRate;
        private double start;
        WavChunks(File directory) throws IOException {
            this.directory = directory;
            boundaries = new OutputStreamWriter(new FileOutputStream(new File(directory, "segments.csv")), StandardCharsets.UTF_8);
        }
        void write(ByteBuffer pcm, int rate, int channels, int encoding, long timestampUs) throws IOException {
            if (rate <= 0 || channels <= 0) throw new IOException("Thông số âm thanh không hợp lệ.");
            if (rate != previousRate) { accumulator = 0; previousRate = rate; }
            int bytesPerSample = encoding == AudioFormat.ENCODING_PCM_FLOAT ? 4 : encoding == AudioFormat.ENCODING_PCM_16BIT ? 2 : 0;
            if (bytesPerSample == 0) throw new IOException("Định dạng PCM chưa hỗ trợ: " + encoding);
            int frame = 0;
            while (pcm.remaining() >= bytesPerSample * channels) {
                double sum = 0;
                for (int c = 0; c < channels; c++) sum += bytesPerSample == 4 ? pcm.getFloat() * 32767 : pcm.getShort();
                int sample = (int) Math.max(-32768, Math.min(32767, sum / channels));
                accumulator += 16000;
                while (accumulator >= rate) {
                    accumulator -= rate;
                    if (output == null) {
                        start = Math.max(0, timestampUs / 1000000.0 + frame / (double) rate);
                        current = new File(directory, String.format(java.util.Locale.ROOT, "chunk-%05d.wav", index++));
                        output = new BufferedOutputStream(new FileOutputStream(current), 65536);
                        output.write(new byte[44]); samples = 0;
                    }
                    output.write(sample & 255); output.write((sample >> 8) & 255); samples++;
                    if (samples == 16000 * 300) finishChunk();
                }
                frame++;
            }
        }
        private void finishChunk() throws IOException {
            if (output == null) return;
            output.close(); output = null;
            ByteBuffer header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN);
            int size = samples * 2;
            header.put("RIFF".getBytes(StandardCharsets.US_ASCII)).putInt(36 + size).put("WAVEfmt ".getBytes(StandardCharsets.US_ASCII))
                .putInt(16).putShort((short) 1).putShort((short) 1).putInt(16000).putInt(32000)
                .putShort((short) 2).putShort((short) 16).put("data".getBytes(StandardCharsets.US_ASCII)).putInt(size);
            try (RandomAccessFile file = new RandomAccessFile(current, "rw")) { file.write(header.array()); }
            boundaries.write(current.getName() + "," + start + "," + (start + samples / 16000.0) + "\n");
            boundaries.flush();
        }
        @Override public void close() throws IOException { try { finishChunk(); } finally { boundaries.close(); } }
    }
}
