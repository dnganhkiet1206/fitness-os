/**
 * Màu tín hiệu của bản SÁNG phải còn SẮC ĐỘ, và bốn macro phải là một GIA ĐÌNH.
 *
 *     node tools/signal-chroma.mjs
 *
 * ── lỗi này đến từ ảnh chụp máy thật ──
 *
 * Thanh carbs và vòng calo ra NÂU. Các cột "vừa phải" ở Tiến trình ra Ô-LIU.
 * Nước ra xanh xám. Nhưng protein thì đẹp. Đo chroma so với bản tối thì thứ tự
 * khớp một-một với cái mắt thấy:
 *
 *     protein −11%   tím −5%      ← đẹp
 *     fat −27%   carbs −37%   nước −49%   fiber −52%   vàng −52%   ← chết
 *
 * ── vì sao nó xảy ra, và vì sao `tools/palette.mjs` không thấy ──
 *
 * `palette.mjs` đo TƯƠNG PHẢN. Cả chín màu đều đạt sàn 4,5:1, nên nó xanh —
 * và một màu có thể đạt 4,5:1 mà vẫn là bùn. GĐ2B chọn độ sáng theo tương phản
 * rồi lấy chroma còn thừa; nhưng trần chroma của sRGB phụ thuộc mạnh vào SẮC:
 * ở L≈0,50, vàng và lục chỉ còn ~0,09 trong khi đỏ tía còn ~0,20. Ép mọi sắc
 * xuống cùng một bậc tương phản là ép vàng và lục xuống đúng chỗ gamut không
 * còn gì.
 *
 * ── và "một gia đình" là một con số, không phải một cảm giác ──
 *
 * Bản TỐI đọc ra là một hệ vì bốn chroma macro của nó gần bằng nhau: trải
 * 1,20×. Bản sáng trước phép sửa trải 1,94× — protein đậm gấp đôi fiber, và đó
 * chính là "bốn ô không thuộc cùng một bộ".
 *
 * Luật này canh hai tính chất mà tương phản không nói được:
 *
 *  1. Mỗi màu tín hiệu sáng phải giữ ít nhất một phần chroma của bản tối.
 *  2. Bốn macro phải nằm trong một dải chroma đủ hẹp để đọc ra một bộ.
 *
 * Nó KHÔNG đòi chroma bằng bản tối. Trên giấy điều đó bất khả với sắc ấm và
 * lục: xem `readinessYellow`, thứ ở mọi độ sáng đạt sàn chữ đều là ô-liu.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const out = mkdtempSync(path.join(tmpdir(), 'signal-chroma-'));
execFileSync(
  'npx',
  ['tsc', 'src/constants/palette.ts', '--ignoreConfig', '--outDir', out,
   '--module', 'esnext', '--target', 'es2020', '--moduleResolution', 'bundler', '--skipLibCheck'],
  { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
);
const { palettes } = await import(pathToFileURL(path.join(out, 'palette.js')).href);

const dec = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
function chroma(hex) {
  const [r, g, b] = [0, 2, 4].map((i) => dec(parseInt(hex.replace('#', '').slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  return Math.hypot(A, B);
}
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

const problems = [];

/**
 * Sàn: mỗi màu tín hiệu sáng giữ ≥60% chroma của bản tối.
 *
 * 60% là chỗ phép đo tự chia đôi: mọi màu máy thật gọi là bùn đều ở dưới 52%,
 * mọi màu nó gọi là đẹp đều ở trên 89%. Không có màu nào rơi vào khoảng giữa,
 * nên ngưỡng đặt ở đâu trong đó cũng cùng một kết luận — 60% chỉ là điểm giữa
 * của một khoảng trống, không phải một con số chỉnh cho vừa.
 */
const KEEP = 0.6;

/** Bốn macro — đây là bộ phải đọc ra như một gia đình. */
const MACROS = ['metricRose', 'metricOrange', 'metricBlue', 'readinessGreen'];

/**
 * Trải chroma tối đa của bốn macro.
 *
 * Bản tối đạt 1,20×. Trên giấy không thể bằng thế — trần gamut của lục ở độ
 * sáng đọc được thấp hơn hẳn của đỏ — nên ngưỡng là 1,70×, đủ chặt để bắt lại
 * tình trạng 1,94× đã bị máy thật bác, và đủ rộng để không đòi một điều gamut
 * không cho.
 */
const FAMILY = 1.7;

const SIGNALS = [
  'readinessGreen', 'readinessYellow', 'readinessRed', 'destructive',
  'metricBlue', 'metricPurple', 'metricCyan', 'metricOrange', 'metricRose',
];

for (const k of SIGNALS) {
  const d = chroma(palettes.dark[k]);
  const l = chroma(palettes.light[k]);
  if (l < d * KEEP) {
    problems.push(
      `\`${k}\`: bản sáng ${palettes.light[k]} chỉ giữ ${Math.round((l / d) * 100)}% chroma của bản tối ` +
        `(${r3(l)} so với ${r3(d)}), dưới sàn ${Math.round(KEEP * 100)}% — ở mức ấy màu đọc ra là bùn ` +
        'chứ không phải sắc. Nâng độ sáng cho tới khi gamut trả lại chroma, đừng nâng tương phản',
    );
  }
}

{
  const cs = MACROS.map((k) => chroma(palettes.light[k]));
  const spread = Math.max(...cs) / Math.min(...cs);
  if (spread > FAMILY) {
    const pairs = MACROS.map((k, i) => `${k} ${r3(cs[i])}`).join(', ');
    problems.push(
      `bốn macro trải ${r2(spread)}× chroma (${pairs}) — trên ngưỡng ${FAMILY}×. ` +
        'Đậm nhất gấp nhạt nhất chừng ấy thì bốn ô không đọc ra một bộ: một cái rực, một cái chết. ' +
        'Bản tối đạt 1,20×',
    );
  }
}

if (problems.length) {
  console.log('sắc độ màu tín hiệu CÓ LỖI:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

const cs = MACROS.map((k) => chroma(palettes.light[k]));
const worst = SIGNALS.map((k) => chroma(palettes.light[k]) / chroma(palettes.dark[k])).sort((a, b) => a - b)[0];
console.log(
  `sắc độ màu tín hiệu OK — ${SIGNALS.length} màu tín hiệu sáng đều giữ ≥${Math.round(KEEP * 100)}% chroma của ` +
    `bản tối (thấp nhất ${Math.round(worst * 100)}%), và bốn macro trải ${r2(Math.max(...cs) / Math.min(...cs))}× ` +
    `— dưới ngưỡng ${FAMILY}×, nên chúng đọc ra một bộ chứ không phải bốn màu rời`,
);
