import { createRequire } from 'node:module'; const require = createRequire(import.meta.url); const { chromium } = require(process.env.PLAYWRIGHT_PATH || require('node:child_process').execSync('npm root -g').toString().trim() + '/playwright');
import { mkdirSync } from 'node:fs';
import path from 'node:path';
const dir = path.dirname(new URL(import.meta.url).pathname);
const times = process.argv[2] === 'all' ? Array.from({ length: 450 }, (_, i) => i * 1000 / 30) : process.argv.slice(2).map(Number);
const out = path.join(dir, process.argv[2] === 'all' ? 'frames' : 'probe');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await page.goto('file://' + path.join(dir, process.env.PAGE || 'index.html'));
await page.evaluate(() => window.ready);
for (const [i, t] of times.entries()) {
  await page.evaluate(async (t) => { await window.render(t); }, t);
  const name = process.argv[2] === 'all' ? String(i).padStart(4, '0') + '.png' : `t${Math.round(t)}.png`;
  await page.screenshot({ path: path.join(out, name) });
}
await browser.close();
console.log('xong', times.length, 'khung');
