package com.duydon.truyen;

import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Collection;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

@CapacitorPlugin(name = "Tts")
public class TtsPlugin extends Plugin {

    private TextToSpeech tts;
    private boolean ready = false;
    private boolean viOk = false;
    private final Map<String, PluginCall> pending = new HashMap<>();
    private int seq = 0;

    @Override
    public void load() {
        tts = new TextToSpeech(getContext(), status -> {
            if (status == TextToSpeech.SUCCESS) {
                ready = true;
                int lang = tts.setLanguage(new Locale("vi", "VN"));
                viOk = lang != TextToSpeech.LANG_MISSING_DATA && lang != TextToSpeech.LANG_NOT_SUPPORTED;
                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override
                    public void onStart(String utteranceId) { }

                    @Override
                    public void onDone(String utteranceId) {
                        finish(utteranceId, true);
                    }

                    @Override
                    public void onError(String utteranceId) {
                        finish(utteranceId, false);
                    }

                    @Override
                    public void onError(String utteranceId, int errorCode) {
                        finish(utteranceId, false);
                    }
                });
            }
        });
        tts.setSpeechRate(1.0f);
    }

    // onDone/onError chạy trên thread của engine TTS → đồng bộ truy cập `pending`
    private synchronized void finish(String utteranceId, boolean ok) {
        PluginCall call = pending.remove(utteranceId);
        if (call == null) return;
        if (ok) call.resolve();
        else call.reject("TTS lỗi khi đọc");
    }

    @PluginMethod
    public synchronized void speak(PluginCall call) {
        String text = call.getString("text", "");
        if (text == null || text.isEmpty()) {
            call.resolve();
            return;
        }
        if (tts == null || !ready) {
            call.reject("TTS chưa sẵn sàng");
            return;
        }

        String voiceName = call.getString("voice", "");
        boolean langOk;
        if (voiceName != null && !voiceName.isEmpty()) {
            Voice found = null;
            Collection<Voice> vs = tts.getVoices();
            if (vs != null) {
                for (Voice v : vs) {
                    if (voiceName.equals(v.getName())) {
                        found = v;
                        break;
                    }
                }
            }
            if (found != null) {
                tts.setVoice(found);
                langOk = true;
            } else {
                langOk = viOk;
            }
        } else {
            tts.setLanguage(new Locale("vi", "VN"));
            langOk = viOk;
        }
        if (!langOk) {
            call.reject("thieu-goi-tieng-viet");
            return;
        }

        Double rateObj = call.getDouble("rate", 1.0);
        float rate = rateObj != null ? rateObj.floatValue() : 1.0f;
        tts.setSpeechRate(rate);

        // bỏ câu đang chờ (QUEUE_FLUSH sẽ thay câu đang đọc)
        for (PluginCall old : pending.values()) {
            old.reject("thay-câu");
        }
        pending.clear();

        String id = "utt-" + (seq++);
        // giữ tham chiếu trong `pending` là đủ — saveCall() mà không releaseCall() làm rò rỉ mỗi câu một call
        pending.put(id, call);
        int q = tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, id);
        if (q != TextToSpeech.SUCCESS) {
            pending.remove(id);
            call.reject("TTS không phát được");
        }
    }

    @PluginMethod
    public void getVoices(PluginCall call) {
        if (tts == null || !ready) {
            call.reject("TTS chưa sẵn sàng");
            return;
        }
        JSArray arr = new JSArray();
        Collection<Voice> vs = tts.getVoices();
        if (vs != null) {
            for (Voice v : vs) {
                JSObject o = new JSObject();
                o.put("name", v.getName());
                Locale loc = v.getLocale();
                o.put("locale", loc != null ? loc.toString() : "");
                o.put("quality", v.getQuality());
                arr.put(o);
            }
        }
        JSObject out = new JSObject();
        out.put("voices", arr);
        call.resolve(out);
    }

    @PluginMethod
    public synchronized void stop(PluginCall call) {
        for (PluginCall c : pending.values()) {
            c.reject("dừng");
        }
        pending.clear();
        if (tts != null) tts.stop();
        call.resolve();
    }

    @Override
    protected synchronized void handleOnDestroy() {
        if (tts != null) {
            tts.stop();
            tts.shutdown();
            tts = null;
        }
        pending.clear();
    }
}
