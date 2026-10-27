package vn.personal.subtitle;

import android.app.*;
import android.content.*;
import android.os.*;
import java.io.File;

public class SubtitleService extends Service {
    static volatile boolean running;
    private Pipeline pipeline;
    private Thread worker;
    private PowerManager.WakeLock wakeLock;
    private volatile boolean cancelling;
    @Override public IBinder onBind(Intent intent) { return null; }
    private Notification notification(String message) {
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent stop = PendingIntent.getService(this, 1, new Intent(this, SubtitleService.class).setAction("cancel"), PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(this, "processing").setSmallIcon(vn.personal.subtitle.R.drawable.ic_subtitle)
            .setContentTitle("Phụ đề video").setContentText(message).setContentIntent(open).setOngoing(true)
            .addAction(new Notification.Action.Builder(null, "Hủy", stop).build()).build();
    }
    private void status(String message) {
        getSharedPreferences("state", 0).edit().putString("status", message).apply();
        getSystemService(NotificationManager.class).notify(1, notification(message));
    }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) { stopSelf(); return START_NOT_STICKY; }
        if ("cancel".equals(intent.getAction())) {
            cancelling = true;
            if (pipeline != null) pipeline.cancel();
            if (worker != null) worker.interrupt();
            if (!running) stopSelf();
            return START_NOT_STICKY;
        }
        if (running) return START_NOT_STICKY;
        getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel("processing", "Xử lý phụ đề", NotificationManager.IMPORTANCE_LOW));
        startForeground(1, notification("Đang chuẩn bị…"));
        running = true; cancelling = false;
        wakeLock = getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "subtitle:processing");
        wakeLock.acquire(6 * 60 * 60 * 1000L);
        getSharedPreferences("state", 0).edit().remove("result").putBoolean("busy", true).putString("status", "Đang chuẩn bị…").apply();
        pipeline = new Pipeline(this, this::status);
        worker = new Thread(() -> {
            try {
                File result = pipeline.run(intent.getStringExtra("source"), intent.getBooleanExtra("local", false),
                    KeyStoreHelper.load(this), intent.getStringExtra("mode"), intent.getStringExtra("language"), intent.getStringExtra("model"));
                getSharedPreferences("state", 0).edit().putString("result", result.getAbsolutePath()).apply();
                status("Hoàn thành! Nhấn Lưu SRT để chọn nơi lưu.");
            } catch (Exception ex) {
                String fallback = getSharedPreferences("state", 0).contains("result") ? " Có thể lưu phụ đề gốc đã nhận dạng." : "";
                status((cancelling ? "Đã hủy tác vụ." : "Lỗi: " + ex.getMessage()) + fallback);
            } finally {
                running = false;
                getSharedPreferences("state", 0).edit().putBoolean("busy", false).apply();
                if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
                stopForeground(STOP_FOREGROUND_REMOVE); stopSelf();
            }
        }, "subtitle-worker");
        worker.start(); return START_NOT_STICKY;
    }
    @Override public void onTimeout(int startId, int fgsType) {
        if (pipeline != null) pipeline.cancel();
        if (worker != null) worker.interrupt();
        stopSelf();
    }
    @Override public void onDestroy() {
        if (running && pipeline != null) { cancelling = true; pipeline.cancel(); }
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        super.onDestroy();
    }
}
