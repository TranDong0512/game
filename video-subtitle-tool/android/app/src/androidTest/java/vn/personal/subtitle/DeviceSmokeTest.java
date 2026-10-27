package vn.personal.subtitle;

import android.content.Context;
import android.graphics.Bitmap;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.ScrollView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import com.yausername.youtubedl_android.YoutubeDL;
import com.yausername.youtubedl_android.YoutubeDLRequest;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.*;
import java.nio.*;
import java.nio.file.Files;
import java.util.Collections;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class DeviceSmokeTest {
    private Context context() { return InstrumentationRegistry.getInstrumentation().getTargetContext(); }
    @Test public void nativeDownloaderRunsOffline() throws Exception {
        YoutubeDL.getInstance().init(context());
        YoutubeDLRequest request = new YoutubeDLRequest(Collections.emptyList()); request.addOption("--version");
        String version = YoutubeDL.getInstance().execute(request, "version-test", null).getOut();
        assertTrue("yt-dlp version: " + version, version.matches("(?s).*20[0-9]{2}\\.[0-9]{2}\\.[0-9]{2}.*"));
    }
    @Test public void androidDecoderExtractsAudioAndWritesRealBoundaries() throws Exception {
        File dir = new File(context().getCacheDir(), "native-test"); dir.mkdirs();
        File wav = new File(dir, "input.wav");
        ByteBuffer bytes = ByteBuffer.allocate(44 + 32000).order(ByteOrder.LITTLE_ENDIAN);
        bytes.put("RIFF".getBytes()).putInt(32036).put("WAVEfmt ".getBytes()).putInt(16).putShort((short) 1)
            .putShort((short) 1).putInt(16000).putInt(32000).putShort((short) 2).putShort((short) 16).put("data".getBytes()).putInt(32000);
        for (int i = 0; i < 16000; i++) bytes.putShort((short) (Math.sin(2 * Math.PI * 440 * i / 16000) * 12000));
        Files.write(wav.toPath(), bytes.array());
        AudioDecoder.extract(wav, dir, () -> {});
        byte[] decoded = Files.readAllBytes(new File(dir, "chunk-00000.wav").toPath());
        assertEquals(32044, decoded.length);
        assertEquals(16000, ByteBuffer.wrap(decoded).order(ByteOrder.LITTLE_ENDIAN).getInt(24));
        assertEquals(1, Files.readAllLines(new File(dir, "segments.csv").toPath()).size());
    }
    @Test public void encryptedKeyRoundTrips() throws Exception {
        KeyStoreHelper.save(context(), "gsk_offline_test_only");
        assertEquals("gsk_offline_test_only", KeyStoreHelper.load(context()));
        String stored = context().getSharedPreferences("secure", 0).getString("key", "");
        assertFalse(stored.contains("gsk_offline_test_only"));
        KeyStoreHelper.save(context(), "");
    }
    @Test public void compressedAacIsDecodedResampledAndMixedToMono() throws Exception {
        File dir = new File(context().getCacheDir(), "aac-test"); dir.mkdirs();
        File input = new File(dir, "input.m4a");
        try (InputStream in = InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("sample.m4a")) {
            Files.copy(in, input.toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        }
        AudioDecoder.extract(input, dir, () -> {});
        byte[] result = Files.readAllBytes(new File(dir, "chunk-00000.wav").toPath());
        ByteBuffer wav = ByteBuffer.wrap(result).order(ByteOrder.LITTLE_ENDIAN);
        assertEquals(16000, wav.getInt(24)); assertEquals(1, wav.getShort(22));
        assertTrue("one second of PCM", result.length > 30000 && result.length < 36000);
        boolean audible = false;
        for (int i = 44; i < result.length; i++) if (result[i] != 0) { audible = true; break; }
        assertTrue("output is not silence", audible);
    }
    @Test public void decoderHonorsCancellation() throws Exception {
        File dir = new File(context().getCacheDir(), "cancel-test"); dir.mkdirs();
        File input = new File(dir, "input.m4a");
        try (InputStream in = InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("sample.m4a")) {
            Files.copy(in, input.toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        }
        assertThrows(InterruptedException.class, () -> AudioDecoder.extract(input, dir, () -> { throw new InterruptedException("cancel"); }));
    }
    @Test public void activityLaunchesAndRendersForm() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> {
                EditText url = activity.findViewById(R.id.video_url);
                assertNotNull(url);
                assertNotNull(activity.findViewById(R.id.translation_model));
                assertTrue(url.isEnabled());
            });
            InstrumentationRegistry.getInstrumentation().waitForIdleSync();
            screenshot("screen-top.png");
            scenario.onActivity(activity -> {
                ViewGroup content = activity.findViewById(android.R.id.content);
                ((ScrollView) content.getChildAt(0)).fullScroll(ScrollView.FOCUS_DOWN);
            });
            InstrumentationRegistry.getInstrumentation().waitForIdleSync();
            screenshot("screen-bottom.png");
        }
    }
    private void screenshot(String name) throws Exception {
        Bitmap bitmap = InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
        assertNotNull(bitmap);
        try (OutputStream out = new FileOutputStream(new File(context().getExternalFilesDir(null), name))) {
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, out);
        }
        bitmap.recycle();
    }
}
