# Video Subtitle Tool

## Android — chạy trực tiếp trên điện thoại

Ứng dụng native trong `android/`, không cần máy tính hoặc server riêng.
Yêu cầu Android 8.0 trở lên. APK hỗ trợ ARM64, ARMv7 và x86_64.

1. Cài `dist/video-subtitle-personal.apk` (cho phép cài từ ứng dụng bạn dùng để mở APK khi Android hỏi).
2. Mở **Phụ đề video**, chọn video/âm thanh trong máy hoặc dán URL video.
3. Chọn song ngữ, chỉ bản dịch hoặc chỉ bản gốc.
4. Tạo Groq API key tại https://console.groq.com/keys và nhập trực tiếp trên điện thoại.
5. Nhấn **Tạo phụ đề**, sau đó **Lưu SRT vào điện thoại** và chọn nơi lưu.

Ứng dụng tải âm thanh bằng yt-dlp, giải mã bằng MediaExtractor/MediaCodec của Android,
xuất WAV mono 16 kHz, chia đoạn khoảng 5 phút và giữ mốc thời gian của luồng âm thanh.
APK không dùng FFmpeg vì thư viện native hiện tại lỗi trên thiết bị dùng trang nhớ 16 KB.
Định dạng hỗ trợ phụ thuộc codec của điện thoại; ưu tiên MP4/AAC, MP3, WAV hoặc WebM/Opus.
Whisper qua Groq nhận dạng; model chat dịch theo nhóm câu và kiểm tra số lượng câu trả về.
Model dịch mặc định `llama-3.3-70b-versatile`, có thể thay trong giao diện.

**Cần Internet và API key**: âm thanh và văn bản được gửi tới Groq. Đây không phải ứng dụng AI offline.
Khả năng sử dụng/hạn mức/chi phí tùy tài khoản và model của nhà cung cấp.
API key lưu bằng Android Keystore + AES-GCM, không nằm trong APK; sao lưu/di chuyển dữ liệu app bị tắt.

Tác vụ chạy bằng foreground service, có thông báo và nút hủy. Nếu dịch lỗi, có thể lưu bản gốc
đã nhận dạng. File tạm được dọn sau tác vụ; SRT/JSON được giữ trong vùng riêng của ứng dụng.
Video URL chỉ tải âm thanh, không lưu bản video. File nguồn trên điện thoại không bị sửa.
Ứng dụng xuất SRT riêng, chưa ghi chữ trực tiếp vào video.

Giới hạn: video chọn trong máy tối đa 2 GB; tải URL giới hạn 500 MB khi yt-dlp biết kích thước.
Các trang yêu cầu đăng nhập, CAPTCHA, DRM hoặc thay đổi cơ chế tải có thể không hoạt động;
trường hợp đó có thể chọn file video đã có trên điện thoại.
Android có thể dừng tác vụ dài khi thiếu tài nguyên; khi mở lại app sẽ báo cần chạy lại.

### Build và kiểm tra Android

```powershell
.\android\build.ps1
# Hoặc khi đã có JDK, Android SDK và keystore:
cd android
.\gradlew.bat assembleRelease testDebugUnitTest lintRelease
# Có thiết bị/giả lập kết nối:
.\gradlew.bat connectedDebugAndroidTest
```

Giữ lại `.keys/personal.jks` để các APK build sau cập nhật được bản đã cài.
Đây là khóa ký dùng riêng, không đưa lên Git. Bản release tắt chế độ debug.

## CLI trên máy tính

Tải video → tách audio → nhận dạng giọng nói → dịch → xuất phụ đề SRT.

## Yêu cầu

- **Node.js** >= 18
- **ffmpeg** (phải có trong PATH)
- **yt-dlp** (phải có trong PATH)
- **HuggingFace API key** có quyền Inference Providers và hạn mức phù hợp

## Cài đặt

```bash
cd video-subtitle-tool
npm install
cp .env.example .env
# Sửa .env, thêm HF_API_KEY của bạn
```

### Lấy HuggingFace API Key

1. Vào https://huggingface.co/settings/tokens
2. Sign up / Login
3. Click **Create new token**
4. Copy token (format: `hf_xxxxxxxxxx`) → paste vào `.env`

## Sử dụng

```bash
# Cơ bản - tải video và xuất phụ đề dịch tiếng Việt
node src/index.js "https://www.youtube.com/watch?v=xxxxx"

# Chỉ nhận dạng, không dịch
node src/index.js "https://youtube.com/watch?v=xxxxx" --skip-translate

# Chỉ phụ đề dịch (không có dòng gốc)
node src/index.js "https://youtube.com/watch?v=xxxxx" --mode translated

# Chỉ phụ đề gốc (không dịch)
node src/index.js "https://youtube.com/watch?v=xxxxx" --mode original

# Thư mục output tùy chỉnh
node src/index.js "https://youtube.com/watch?v=xxxxx" -o ./my-output
```

## Output

```
output/
└── job-xxxxxx/            # Mỗi lần chạy một thư mục riêng
    ├── video_xxxxx.mp4    # Video đã tải
    ├── audio.mp3          # Audio đã trích xuất
    ├── transcription.json
    ├── translated.json   # Có khi chạy bước dịch
    └── video_xxxxx_vi.srt
```

## API Sử dụng

| Chức năng CLI | Model cấu hình |
|-----------|-------|
| Nhận dạng giọng nói | `openai/whisper-large-v3` |
| Dịch thuật EN→VI | `Helsinki-NLP/opus-mt-en-vi` |

CLI dùng router Hugging Face. Không bảo đảm các model này luôn có provider phục vụ.
Có thể đặt `HF_ASR_URL` trong `.env` cho endpoint ASR tương thích của bạn.
ASR cần trả `chunks` với timestamps hợp lệ; app sẽ báo lỗi thay vì xuất phụ đề 0 giây.
Nếu dịch một đoạn thất bại, CLI cảnh báo và giữ bản gốc ở đoạn đó.

```bash
npm test
```

Test gồm xử lý SRT, mô phỏng hợp đồng API và chạy FFmpeg/ffprobe thật trên video tổng hợp.
Test không sử dụng key thật, không xác nhận chất lượng nhận dạng/dịch từ dịch vụ đang chạy.

## Hỗ trợ

Tool hỗ trợ mọi URL mà yt-dlp hỗ trợ: YouTube, TikTok, Twitter/X, Facebook, Vimeo, ...
