/**
 * Xuất premium.html ở 120 khung/giây, ghép tiếng, không ghi khung nào ra đĩa:
 * mỗi khung là một ảnh JPEG chất lượng 95 đẩy thẳng vào ffmpeg.
 *   node render120.mjs <trang.html> <âm.wav> <ra.mp4> [giây=30] [fps=120]
 */
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || execSync('npm root -g').toString().trim() + '/playwright');
const [page_, audio, out, secs = '30', fps = '120'] = process.argv.slice(2);
const FF = execSync(`python3 -c "import imageio_ffmpeg as f; print(f.get_ffmpeg_exe())"`).toString().trim();
const n = Math.round(Number(secs) * Number(fps));
const ff = spawn(FF, ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', fps, '-c:v', 'mjpeg', '-i', '-', '-i', audio,
  '-c:v', 'libx264', '-profile:v', 'high', '-level', '5.2', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', fps,
  '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await page.goto('file://' + path.join(HERE, page_));
await page.evaluate(() => window.ready);
const t0 = Date.now();
for (let i = 0; i < n; i++) {
  await page.evaluate(async (ms) => { await window.render(ms); }, (i * 1000) / Number(fps));
  const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  if (i % 600 === 0) console.log(`${i}/${n} khung · ${Math.round((Date.now() - t0) / 1000)} s`);
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await browser.close();
console.log('xong', n, 'khung →', out);
