import { Bot } from 'grammy';
import sharp from 'sharp';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { saveFile, parseStickerPackUrl, sleep } from './utils.js';

const execAsync = promisify(exec);

export class StickerDownloader {
  constructor(botToken, format = 'png') {
    this.bot = new Bot(botToken);
    this.format = format;
  }

  async downloadPack(packUrl, outputDir = './stickers') {
    const packName = parseStickerPackUrl(packUrl);
    if (!packName) {
      throw new Error('Invalid sticker pack URL or name');
    }

    console.log(`Fetching sticker pack: ${packName}...`);

    try {
      const stickers = await this.getStickersFromPack(packName);
      if (!stickers || stickers.length === 0) {
        throw new Error('No stickers found in this pack');
      }

      console.log(`Found ${stickers.length} stickers (format: ${this.format})`);

      const packDir = path.join(outputDir, packName);
      const results = [];

      for (let i = 0; i < stickers.length; i++) {
        const sticker = stickers[i];
        const fileIndex = String(i + 1).padStart(3, '0');

        try {
          const file = await this.bot.api.getFile(sticker.file_id);
          const fileBuffer = await this.downloadFile(file.file_path);

          let outputBuffer = fileBuffer;
          let ext = `.${this.format}`;

          if (sticker.is_animated) {
            if (this.format === 'gif') {
              const result = await this.convertAnimatedToGif(fileBuffer, '.tgs');
              outputBuffer = result.buffer;
              ext = '.gif';
            } else {
              ext = '.tgs';
            }
          } else if (sticker.is_video) {
            if (this.format === 'gif') {
              const result = await this.convertVideoToGif(fileBuffer);
              outputBuffer = result.buffer;
              ext = '.gif';
            } else {
              ext = '.webm';
            }
          } else {
            outputBuffer = await this.convertStaticSticker(fileBuffer, this.format);
          }

          const filename = `${fileIndex}${ext}`;
          const filePath = path.join(packDir, filename);
          await saveFile(filePath, outputBuffer);

          results.push({
            index: i + 1,
            filename,
            size: outputBuffer.length,
            success: true
          });

          console.log(`  [${i + 1}/${stickers.length}] Downloaded: ${filename}`);
        } catch (error) {
          results.push({
            index: i + 1,
            error: error.message,
            success: false
          });
          console.error(`  [${i + 1}/${stickers.length}] Failed: ${error.message}`);
        }

        await sleep(100);
      }

      return {
        packName,
        total: stickers.length,
        downloaded: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        packDir,
        results
      };
    } catch (error) {
      throw new Error(`Failed to download pack "${packName}": ${error.message}`);
    }
  }

  async getStickersFromPack(packName) {
    try {
      const response = await this.bot.api.getStickerSet(packName);
      return response.stickers || [];
    } catch (error) {
      if (error.error_code === 400) {
        throw new Error('Sticker pack not found. Make sure the pack name is correct.');
      }
      throw error;
    }
  }

  async downloadFile(filePath) {
    const url = `https://api.telegram.org/file/bot${this.bot.token}/${filePath}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async searchPacks(query) {
    console.log(`Searching for packs matching "${query}"...`);

    try {
      const response = await fetch(
        `https://api.telegram.org/bot${this.bot.token}/searchStickerSet?name=${encodeURIComponent(query)}`
      );
      const data = await response.json();

      if (!data.ok) {
        return [];
      }

      return [{
        name: data.result.name,
        title: data.result.title,
        count: data.result.stickers?.length || 0,
        isInstalled: data.result.is_installed,
        isArchived: data.result.is_archived
      }];
    } catch (error) {
      console.error('Search failed:', error.message);
      return [];
    }
  }

  async convertStaticSticker(buffer, format) {
    try {
      if (format === 'gif') {
        return await sharp(buffer)
          .gif()
          .toBuffer();
      } else if (format === 'webp') {
        return await sharp(buffer)
          .webp()
          .toBuffer();
      } else {
        return await sharp(buffer)
          .png()
          .toBuffer();
      }
    } catch (error) {
      console.error(`Conversion failed: ${error.message}`);
      return buffer;
    }
  }

  async convertAnimatedToGif(buffer, inputExt) {
    const tmpInput = `tmp_sticker_${Date.now()}${inputExt}`;
    const tmpOutput = `tmp_sticker_${Date.now()}.gif`;

    try {
      await saveFile(tmpInput, buffer);

      if (inputExt === '.tgs') {
        await execAsync(`lottie_convert.py ${tmpInput} ${tmpOutput} --loop 0`);
      } else {
        await execAsync(`convert ${tmpInput} ${tmpOutput}`);
      }

      const { readFile } = await import('fs/promises');
      const gifBuffer = await readFile(tmpOutput);

      const { unlink } = await import('fs/promises');
      await unlink(tmpInput).catch(() => {});
      await unlink(tmpOutput).catch(() => {});

      return { buffer: gifBuffer };
    } catch (error) {
      console.error(`Animated conversion failed: ${error.message}`);
      return { buffer };
    }
  }

  async convertVideoToGif(buffer) {
    const tmpInput = `tmp_sticker_${Date.now()}.webm`;
    const tmpOutput = `tmp_sticker_${Date.now()}.gif`;

    try {
      await saveFile(tmpInput, buffer);

      await execAsync(
        `ffmpeg -y -i ${tmpInput} -vf "fps=15,scale=512:512:flags=lanczos" -loop 0 ${tmpOutput}`
      );

      const { readFile } = await import('fs/promises');
      const gifBuffer = await readFile(tmpOutput);

      const { unlink } = await import('fs/promises');
      await unlink(tmpInput).catch(() => {});
      await unlink(tmpOutput).catch(() => {});

      return { buffer: gifBuffer };
    } catch (error) {
      console.error(`Video to GIF conversion failed: ${error.message}`);
      return { buffer };
    }
  }
}
