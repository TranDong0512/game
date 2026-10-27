package vn.personal.subtitle;

import org.junit.Test;
import org.json.*;
import java.util.*;
import static org.junit.Assert.*;

public class SubtitleCodecTest {
    @Test public void roundsAcrossMinuteAndHour() {
        assertEquals("00:01:00,000", SubtitleCodec.time(59.9999));
        assertEquals("01:00:00,000", SubtitleCodec.time(3599.9999));
    }
    @Test public void rejectsInvalidTimes() {
        for (double end : new double[]{0, -1, Double.NaN, Double.POSITIVE_INFINITY, 0.0001}) {
            assertThrows(IllegalArgumentException.class, () -> new SubtitleCodec.Cue(0, end, "hello"));
        }
    }
    @Test public void appliesChunkOffset() throws Exception {
        JSONObject response = new JSONObject("{\"segments\":[{\"start\":1.2,\"end\":3.4,\"text\":\" hello \"}]}");
        List<SubtitleCodec.Cue> cues = SubtitleCodec.parse(response, 300);
        assertEquals(301.2, cues.get(0).start, 0.00001);
        assertEquals("hello", cues.get(0).original);
    }
    @Test public void rejectsAbsentTimestamps() {
        assertThrows(IllegalArgumentException.class, () -> SubtitleCodec.parse(new JSONObject("{\"text\":\"hello\"}"), 0));
    }
    @Test public void silentAudioYieldsNoCues() throws Exception {
        assertTrue(SubtitleCodec.parse(new JSONObject("{\"segments\":[]}"), 0).isEmpty());
    }
    @Test public void checksTranslationCountAndTypeBeforeMutation() throws Exception {
        List<SubtitleCodec.Cue> cues = Arrays.asList(new SubtitleCodec.Cue(0, 1, "hello"), new SubtitleCodec.Cue(1, 2, "world"));
        assertThrows(IllegalArgumentException.class, () -> SubtitleCodec.applyTranslations(cues, 0, 2, new JSONArray("[\"xin chào\"]")));
        assertThrows(IllegalArgumentException.class, () -> SubtitleCodec.applyTranslations(cues, 0, 2, new JSONArray("[\"xin chào\",null]")));
        assertEquals("hello", cues.get(0).translated);
    }
    @Test public void rendersModesAndDeduplicates() {
        SubtitleCodec.Cue cue = new SubtitleCodec.Cue(0, 2, "Hello");
        List<SubtitleCodec.Cue> cues = Collections.singletonList(cue);
        assertEquals("1\n00:00:00,000 --> 00:00:02,000\nHello\n\n", SubtitleCodec.srt(cues, "both"));
        cue.translated = "Xin chào";
        assertTrue(SubtitleCodec.srt(cues, "both").contains("Xin chào\nHello"));
        assertFalse(SubtitleCodec.srt(cues, "translated").contains("Hello"));
        assertFalse(SubtitleCodec.srt(cues, "original").contains("Xin chào"));
    }
    @Test public void normalizesBlankLinesToPreserveSrtStructure() {
        assertEquals("Hello world", new SubtitleCodec.Cue(0, 1, "Hello\n\nworld").original);
    }
    @Test public void rejectsEmptyOutputAndBadMode() {
        assertThrows(IllegalArgumentException.class, () -> SubtitleCodec.srt(Collections.emptyList(), "both"));
        assertThrows(IllegalArgumentException.class, () -> SubtitleCodec.srt(Collections.singletonList(new SubtitleCodec.Cue(0, 1, "hi")), "typo"));
    }
}
