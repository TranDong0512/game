#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { StickerDownloader } from './src/sticker-downloader.js';
import { parseStickerPackUrl } from './src/utils.js';
import { createInterface } from 'readline';

const program = new Command();

program
  .name('telegram-sticker-downloader')
  .description('Download Telegram stickers by pack link or search')
  .version('1.0.0')
  .requiredOption('-t, --token <token>', 'Telegram Bot Token')
  .option('-o, --output <dir>', 'Output directory', './stickers')
  .option('-p, --pack <url>', 'Sticker pack URL or name')
  .option('-s, --search <query>', 'Search for sticker packs')
  .option('-f, --format <format>', 'Output format: png, gif, webp', 'png')
  .option('-i, --interactive', 'Interactive mode');

program.parse();

const options = program.opts();

async function main() {
  console.log(chalk.bold.cyan('\n  Telegram Sticker Downloader\n'));

  const downloader = new StickerDownloader(options.token, options.format);

  if (options.interactive) {
    await interactiveMode(downloader, options.output, options.format);
    return;
  }

  if (options.search) {
    const spinner = ora('Searching...').start();
    try {
      const packs = await downloader.searchPacks(options.search);
      spinner.stop();

      if (packs.length === 0) {
        console.log(chalk.yellow('No packs found.'));
        return;
      }

      console.log(chalk.green(`\nFound ${packs.length} pack(s):\n`));
      packs.forEach((pack, i) => {
        console.log(chalk.white(`  ${i + 1}. ${pack.title || pack.name}`));
        console.log(chalk.gray(`     Name: ${pack.name} | Stickers: ${pack.count}`));
      });

      console.log(chalk.cyan('\nTo download, run with -p <pack_name>'));
    } catch (error) {
      spinner.fail(error.message);
    }
    return;
  }

  if (options.pack) {
    const packName = parseStickerPackUrl(options.pack);
    if (!packName) {
      console.error(chalk.red('Invalid sticker pack URL or name'));
      process.exit(1);
    }

    const spinner = ora(`Downloading pack: ${packName}`).start();
    try {
      const result = await downloader.downloadPack(options.pack, options.output);
      spinner.succeed(`Downloaded ${result.downloaded}/${result.total} stickers`);

      if (result.failed > 0) {
        console.log(chalk.yellow(`  ${result.failed} stickers failed to download`));
      }

      console.log(chalk.green(`\n  Saved to: ${result.packDir}\n`));
    } catch (error) {
      spinner.fail(error.message);
    }
    return;
  }

  console.log(chalk.yellow('No action specified. Use -p <pack_url>, -s <query>, or -i for interactive mode.\n'));
  console.log(chalk.white('Examples:'));
  console.log(chalk.gray('  node index.js -t YOUR_TOKEN -p https://t.me/addstickers/DonutTheDog'));
  console.log(chalk.gray('  node index.js -t YOUR_TOKEN -s "cat stickers"'));
  console.log(chalk.gray('  node index.js -t YOUR_TOKEN -i'));
}

async function interactiveMode(downloader, outputDir, format) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (q) => new Promise(resolve => rl.question(q, resolve));

  console.log(chalk.cyan('\n  Interactive Mode\n'));
  console.log(chalk.white('  Commands:'));
  console.log(chalk.gray('  - Paste a sticker pack URL or name to download'));
  console.log(chalk.gray('  - Type "search <query>" to search for packs'));
  console.log(chalk.gray('  - Type "quit" or "exit" to exit\n'));

  while (true) {
    const input = await question(chalk.cyan('  > '));

    if (!input.trim()) continue;
    if (input.toLowerCase() === 'quit' || input.toLowerCase() === 'exit') break;

    if (input.toLowerCase().startsWith('search ')) {
      const query = input.slice(7).trim();
      const spinner = ora('Searching...').start();

      try {
        const packs = await downloader.searchPacks(query);
        spinner.stop();

        if (packs.length === 0) {
          console.log(chalk.yellow('  No packs found.'));
          continue;
        }

        console.log(chalk.green(`\n  Found ${packs.length} pack(s):\n`));
        packs.forEach((pack, i) => {
          console.log(chalk.white(`  ${i + 1}. ${pack.title || pack.name}`));
          console.log(chalk.gray(`     Name: ${pack.name} | Stickers: ${pack.count}`));
        });
        console.log('');
      } catch (error) {
        spinner.fail(error.message);
      }
      continue;
    }

    const packName = parseStickerPackUrl(input);
    if (!packName) {
      console.log(chalk.yellow('  Invalid URL or pack name. Try again.'));
      continue;
    }

    const spinner =ora(`Downloading: ${packName}`).start();
    try {
      const result = await downloader.downloadPack(input, outputDir);
      spinner.succeed(`Downloaded ${result.downloaded}/${result.total} stickers`);

      if (result.failed > 0) {
        console.log(chalk.yellow(`  ${result.failed} stickers failed`));
      }

      console.log(chalk.green(`  Saved to: ${result.packDir}\n`));
    } catch (error) {
      spinner.fail(error.message);
    }
  }

  rl.close();
  console.log(chalk.cyan('\n  Goodbye!\n'));
}

main().catch(error => {
  console.error(chalk.red(`\nError: ${error.message}\n`));
  process.exit(1);
});
