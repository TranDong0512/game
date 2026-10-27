package vn.personal.subtitle;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.*;
import android.text.InputType;
import android.view.*;
import android.widget.*;
import java.io.*;
import java.nio.file.Files;

public class MainActivity extends Activity {
    private EditText url, apiKey, model;
    private Spinner mode, language;
    private TextView status, selection;
    private Button start, save, pick, useUrl;
    private ProgressBar progress;
    private String selectedUri = "", exportPath = "";
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable refresh = new Runnable() {
        @Override public void run() {
            if (status == null) return;
            android.content.SharedPreferences state = getSharedPreferences("state", 0);
            status.setText(state.getString("status", "Sẵn sàng. Chọn video hoặc dán đường dẫn để bắt đầu."));
            boolean busy = SubtitleService.running;
            start.setText(busy ? "Hủy tác vụ" : "Tạo phụ đề");
            progress.setVisibility(busy ? View.VISIBLE : View.GONE);
            pick.setEnabled(!busy); useUrl.setEnabled(!busy); url.setEnabled(!busy);
            apiKey.setEnabled(!busy); mode.setEnabled(!busy); language.setEnabled(!busy); model.setEnabled(!busy);
            String result = state.getString("result", "");
            save.setEnabled(!busy && !result.isEmpty() && new File(result).isFile());
            handler.postDelayed(this, 700);
        }
    };
    private int dp(int value) { return (int) (value * getResources().getDisplayMetrics().density); }
    private TextView label(LinearLayout parent, String text, int size) {
        TextView view = new TextView(this); view.setText(text); view.setTextSize(size); view.setTextColor(Color.rgb(30, 48, 46));
        view.setPadding(0, dp(12), 0, dp(6)); parent.addView(view); return view;
    }
    private EditText edit(LinearLayout parent, String hint, int type) {
        EditText view = new EditText(this); view.setHint(hint); view.setInputType(type); view.setSingleLine(true);
        view.setTextSize(15); view.setPadding(dp(10), dp(10), dp(10), dp(10));
        parent.addView(view, new LinearLayout.LayoutParams(-1, dp(52))); return view;
    }
    private Button button(LinearLayout parent, String text) {
        Button view = new Button(this); view.setText(text); view.setAllCaps(false);
        parent.addView(view, new LinearLayout.LayoutParams(-1, dp(52))); return view;
    }
    private Spinner spinner(LinearLayout parent, String[] labels) {
        Spinner view = new Spinner(this);
        ArrayAdapter<String> adapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, labels);
        view.setAdapter(adapter); parent.addView(view, new LinearLayout.LayoutParams(-1, dp(48))); return view;
    }
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().setStatusBarColor(Color.rgb(240, 247, 245));
        getWindow().setNavigationBarColor(Color.rgb(240, 247, 245));
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true); scroll.setBackgroundColor(Color.rgb(240, 247, 245));
        scroll.setOnApplyWindowInsetsListener((v, insets) -> {
            v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
        LinearLayout layout = new LinearLayout(this); layout.setOrientation(LinearLayout.VERTICAL); layout.setPadding(dp(22), dp(12), dp(22), dp(28));
        scroll.addView(layout); setContentView(scroll);
        label(layout, "PHỤ ĐỀ VIDEO", 12).setLetterSpacing(0.16f);
        label(layout, "Nghe. Dịch. Lưu lại.", 28).setTypeface(null, Typeface.BOLD);
        label(layout, "Tạo phụ đề ngay trên điện thoại. Không cần máy tính.", 15);
        label(layout, "1  ·  Chọn nguồn video", 18).setTypeface(null, Typeface.BOLD);
        url = edit(layout, "https://youtube.com/watch?v=…", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        url.setId(R.id.video_url);
        pick = button(layout, "Chọn video / âm thanh trong máy");
        pick.setOnClickListener(v -> {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE);
            intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"video/*", "audio/*"});
            startActivityForResult(intent, 10);
        });
        selection = label(layout, "Đang dùng đường dẫn URL", 13);
        useUrl = button(layout, "Dùng URL thay cho file đã chọn");
        useUrl.setOnClickListener(v -> { selectedUri = ""; selection.setText("Đang dùng đường dẫn URL"); });
        label(layout, "2  ·  Cài đặt phụ đề", 18).setTypeface(null, Typeface.BOLD);
        mode = spinner(layout, new String[]{"Song ngữ — bản dịch + bản gốc", "Chỉ bản dịch", "Chỉ bản gốc — không dịch"});
        language = spinner(layout, new String[]{"Tiếng Việt", "English", "日本語", "한국어", "中文"});
        label(layout, "3  ·  Kết nối Groq", 18).setTypeface(null, Typeface.BOLD);
        apiKey = edit(layout, "Groq API key (gsk_…)", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        apiKey.setSaveEnabled(false); apiKey.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO);
        try { if (!KeyStoreHelper.load(this).isEmpty()) apiKey.setHint("Đã lưu key • để trống để dùng lại"); }
        catch (Exception ex) { apiKey.setHint("Nhập lại Groq API key"); }
        Button token = button(layout, "Mở trang lấy Groq API key");
        token.setOnClickListener(v -> startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://console.groq.com/keys"))));
        label(layout, "Model dịch (có thể đổi khi nhà cung cấp thay đổi)", 13);
        model = edit(layout, "Model dịch", InputType.TYPE_CLASS_TEXT);
        model.setId(R.id.translation_model); model.setText(getPreferences(0).getString("model", "llama-3.3-70b-versatile"));
        mode.setSelection(getPreferences(0).getInt("mode", 0)); language.setSelection(getPreferences(0).getInt("language", 0));
        label(layout, "Âm thanh và văn bản được gửi đến Groq khi bạn nhấn Tạo phụ đề. Cần Internet và hạn mức API. Key được mã hóa trên điện thoại; không nhúng trong APK.", 13);
        start = button(layout, "Tạo phụ đề");
        start.setTextColor(Color.WHITE); start.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(18, 107, 96)));
        start.setOnClickListener(v -> begin());
        progress = new ProgressBar(this); layout.addView(progress); progress.setVisibility(View.GONE);
        status = label(layout, "Sẵn sàng", 15); status.setTextIsSelectable(true);
        save = button(layout, "Lưu SRT vào điện thoại"); save.setEnabled(false);
        save.setOnClickListener(v -> {
            exportPath = getSharedPreferences("state", 0).getString("result", "");
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/x-subrip");
            intent.putExtra(Intent.EXTRA_TITLE, new File(exportPath).getName()); startActivityForResult(intent, 11);
        });
        label(layout, "Video từ URL chỉ tải phần âm thanh để tiết kiệm dung lượng. SRT là file phụ đề riêng, chưa ghép chữ vào video. Tác vụ chạy nền có thông báo và có thể hủy.", 13);
        if (saved != null) {
            selectedUri = saved.getString("source", ""); exportPath = saved.getString("export", "");
            mode.setSelection(saved.getInt("mode", 0)); language.setSelection(saved.getInt("language", 0));
            if (!selectedUri.isEmpty()) selection.setText("Đã chọn file trên điện thoại");
        }
        if (!SubtitleService.running && getSharedPreferences("state", 0).getBoolean("busy", false)) {
            getSharedPreferences("state", 0).edit().putBoolean("busy", false).putString("status", "Tác vụ trước bị hệ thống dừng. Hãy chọn video và chạy lại.").apply();
        }
    }
    private void begin() {
        if (SubtitleService.running) { startService(new Intent(this, SubtitleService.class).setAction("cancel")); return; }
        try {
            String key = apiKey.getText().toString().trim();
            if (key.isEmpty()) key = KeyStoreHelper.load(this);
            if (key.isEmpty()) throw new IllegalArgumentException("Nhập Groq API key trước khi chạy.");
            String source = selectedUri.isEmpty() ? url.getText().toString().trim() : selectedUri;
            if (source.isEmpty()) throw new IllegalArgumentException("Chọn video hoặc nhập URL.");
            if (selectedUri.isEmpty()) {
                Uri parsed = Uri.parse(source);
                if (!("https".equals(parsed.getScheme()) || "http".equals(parsed.getScheme())) || parsed.getHost() == null)
                    throw new IllegalArgumentException("URL phải bắt đầu bằng http:// hoặc https://.");
            }
            String selectedModel = model.getText().toString().trim();
            if (selectedModel.isEmpty() && mode.getSelectedItemPosition() != 2) throw new IllegalArgumentException("Nhập model dịch.");
            KeyStoreHelper.save(this, key); apiKey.setText(""); apiKey.setHint("Đã lưu key • để trống để dùng lại");
            getPreferences(0).edit().putString("model", selectedModel).putInt("mode", mode.getSelectedItemPosition()).putInt("language", language.getSelectedItemPosition()).apply();
            if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED)
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 20);
            startForegroundService(new Intent(this, SubtitleService.class)
                .putExtra("source", source).putExtra("local", !selectedUri.isEmpty())
                .putExtra("mode", new String[]{"both", "translated", "original"}[mode.getSelectedItemPosition()])
                .putExtra("language", new String[]{"vi", "en", "ja", "ko", "zh"}[language.getSelectedItemPosition()])
                .putExtra("model", selectedModel));
        } catch (Exception ex) { new AlertDialog.Builder(this).setTitle("Chưa thể bắt đầu").setMessage(ex.getMessage()).setPositiveButton("Đóng", null).show(); }
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (result != RESULT_OK || data == null || data.getData() == null) return;
        try {
            if (request == 10) {
                selectedUri = data.getData().toString();
                getContentResolver().takePersistableUriPermission(data.getData(), Intent.FLAG_GRANT_READ_URI_PERMISSION);
                selection.setText("Đã chọn file trên điện thoại");
            } else if (request == 11) {
                try (OutputStream out = getContentResolver().openOutputStream(data.getData(), "wt")) {
                    if (out == null) throw new IOException("Không mở được nơi lưu.");
                    Files.copy(new File(exportPath).toPath(), out);
                }
                Toast.makeText(this, "Đã lưu file SRT", Toast.LENGTH_LONG).show();
            }
        } catch (Exception ex) { new AlertDialog.Builder(this).setMessage("Lỗi: " + ex.getMessage()).setPositiveButton("Đóng", null).show(); }
    }
    @Override protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state); state.putString("source", selectedUri); state.putString("export", exportPath);
        state.putInt("mode", mode.getSelectedItemPosition()); state.putInt("language", language.getSelectedItemPosition());
    }
    @Override protected void onResume() { super.onResume(); handler.post(refresh); }
    @Override protected void onPause() { handler.removeCallbacks(refresh); super.onPause(); }
}
