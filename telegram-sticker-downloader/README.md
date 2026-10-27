# Telegram Sticker Downloader

Tool Node.js để tải sticker từ Telegram.

## Cài đặt

```bash
cd telegram-sticker-downloader
npm install
```

## Yêu cầu hệ thống

- **Node.js 18+**
- **ffmpeg** (cho chuyển đổi WebM → GIF)
- **lottie_convert.py** (cho chuyển đổi TGS → GIF, nếu có)

## Hướng dẫn lấy Bot Token

1. Mở Telegram, tìm [@BotFather](https://t.me/BotFather)
2. Gõ `/newbot` và làm theo hướng dẫn
3. Copy token nhận được

## Sử dụng

### 1. Tải sticker theo pack link

```bash
node index.js -t YOUR_BOT_TOKEN -p https://t.me/addstickers/DonutTheDog
```

### 2. Tải và chuyển đổi sang GIF

```bash
node index.js -t YOUR_BOT_TOKEN -p DonutTheDog -f gif
```

### 3. Tìm kiếm sticker pack

```bash
node index.js -t YOUR_BOT_TOKEN -s "cat stickers"
```

### 4. Chế độ tương tác (Interactive)

```bash
node index.js -t YOUR_BOT_TOKEN -i
```

Trong chế độ này, bạn có thể:
- Dán link sticker pack để tải
- Gõ `search <từ khóa>` để tìm pack
- Gõ `quit` để thoát

### 5. Chỉ định thư mục output

```bash
node index.js -t YOUR_BOT_TOKEN -p DonutTheDog -o ./my-stickers
```

## Định dạng output

| Định dạng | Mô tả |
|-----------|-------|
| `png` | Mặc định, tốt cho sticker tĩnh |
| `gif` | Hỗ trợ animated, cần ffmpeg |
| `webp` | Định dạng gốc của Telegram |

## Script trong package.json

```bash
npm run pack -- -p DonutTheDog
npm run all -- -i
```

## Lưu ý

- Bot phải là thành viên của group/channel để tải sticker từ đó
- Sticker sẽ được lưu vào thư mục `./stickers/<tên_pack>/`
- Sticker animated (TGS) và video (WebM) cần phần mềm bổ sung để convert sang GIF
- Nếu không có ffmpeg, sticker video sẽ được giữ nguyên định dạng WebM

## License

MIT
