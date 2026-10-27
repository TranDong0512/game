package vn.personal.subtitle;

import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public final class SubtitleCodec {
    public static final class Cue {
        public final double start, end;
        public final String original;
        public String translated;
        public Cue(double start, double end, String original) {
            if (!Double.isFinite(start) || !Double.isFinite(end) || start < 0 || Math.round(end * 1000) <= Math.round(start * 1000))
                throw new IllegalArgumentException("API trả thời gian phụ đề không hợp lệ.");
            this.start = start; this.end = end;
            this.original = clean(original); this.translated = this.original;
        }
    }
    public static String clean(String value) { return value.replaceAll("\\s+", " ").trim(); }
    public static String time(double value) {
        long ms = Math.round(value * 1000);
        return String.format(Locale.ROOT, "%02d:%02d:%02d,%03d", ms / 3600000, (ms / 60000) % 60, (ms / 1000) % 60, ms % 1000);
    }
    public static List<Cue> parse(JSONObject response, double offset) throws Exception {
        JSONArray segments = response.optJSONArray("segments");
        if (segments == null) throw new IllegalArgumentException("API không trả timestamps. Hãy dùng Whisper với verbose_json.");
        List<Cue> result = new ArrayList<>();
        for (int i = 0; i < segments.length(); i++) {
            JSONObject s = segments.getJSONObject(i);
            String text = s.getString("text");
            if (!text.trim().isEmpty()) result.add(new Cue(offset + s.getDouble("start"), offset + s.getDouble("end"), text));
        }
        return result;
    }
    public static void applyTranslations(List<Cue> cues, int from, int count, JSONArray values) throws Exception {
        if (values.length() != count) throw new IllegalArgumentException("Số câu dịch không khớp. Vui lòng thử lại.");
        List<String> checked = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            Object raw = values.get(i);
            if (!(raw instanceof String) || clean((String) raw).isEmpty()) throw new IllegalArgumentException("API trả bản dịch trống hoặc sai định dạng.");
            checked.add(clean((String) raw));
        }
        for (int i = 0; i < count; i++) cues.get(from + i).translated = checked.get(i);
    }
    public static String srt(List<Cue> cues, String mode) {
        if (!java.util.Arrays.asList("both", "original", "translated").contains(mode)) throw new IllegalArgumentException("Chế độ phụ đề không hợp lệ");
        if (cues.isEmpty()) throw new IllegalArgumentException("Không tìm thấy lời nói trong video.");
        StringBuilder out = new StringBuilder();
        int i = 1;
        for (Cue cue : cues) {
            out.append(i++).append('\n').append(time(cue.start)).append(" --> ").append(time(cue.end)).append('\n');
            if (mode.equals("original")) out.append(cue.original);
            else {
                out.append(cue.translated);
                if (mode.equals("both") && !cue.translated.equals(cue.original)) out.append('\n').append(cue.original);
            }
            out.append("\n\n");
        }
        return out.toString();
    }
}
