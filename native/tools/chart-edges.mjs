/**
 * That a chart draws its own end points inside its own viewport.
 *
 * ── the half-dot ──
 *
 * `LineChart` marks the latest point with a circle of `r = 4.5` and a 2pt
 * stroke. It was centred at `x(n − 1)`, and with `plotW = width − padX` that is
 * exactly the right edge of the SVG — so five and a half points of it fell
 * outside and were clipped, on every chart this component draws, on four
 * screens.
 *
 * It does not look like a bug. It looks like a line that stops. Measured on the
 * exercise-insight sparkline: the series ended in a 6px vertical stub at x=364
 * and nothing after it, which reads as data running out rather than as a marker
 * being cut in half.
 *
 * ── why arithmetic and not a screenshot ──
 *
 * A screenshot shows it only where the last value happens to sit somewhere the
 * eye is drawn to, and only at one width. The relationship is exact and holds
 * at every width, so it is checked as arithmetic: the extreme points, plus the
 * radius of whatever is drawn on them, must fit.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = 'src/components/ascnd/line-chart.tsx';
const src = readFileSync(path.join(NATIVE, FILE), 'utf8');
const problems = [];

const num = (re, what) => {
  const m = src.match(re);
  if (!m) {
    problems.push(`không lấy được ${what} ra khỏi ${FILE} (${re}) — luật này đang không kiểm gì cả`);
    return null;
  }
  return Number(m[1]);
};

/* The geometry, pulled out of the source rather than restated. */
const edge = num(/const EDGE = ([\d.]+);/, 'khoảng chừa hai đầu');
const padGrid = num(/const padX = grid \? (\d+)/, 'lề trái ở chế độ lưới');
/* The marker on the last point: radius and stroke. */
const markerR = num(/cy=\{y\(values\[values\.length - 1\]\)\}\s*\n\s*r=\{([\d.]+)\}/, 'bán kính chấm cuối');
const markerStroke = num(
  /cy=\{y\(values\[values\.length - 1\]\)\}[\s\S]{0,120}?strokeWidth=\{(\d+)\}/,
  'độ dày viền chấm cuối',
);
/* The dots on every point, in grid mode. */
const dotR = num(/<Circle key=\{`p\$\{points\[i\]\.date\}-\$\{i\}`\}[^>]*r=\{(\d+)\}/, 'bán kính chấm thường');

if (edge !== null && markerR !== null && markerStroke !== null && dotR !== null && padGrid !== null) {
  const need = markerR + markerStroke / 2;
  if (edge < need) {
    problems.push(
      `khoảng chừa hai đầu là ${edge} nhưng chấm cuối chiếm ${need} (bán kính ${markerR} + nửa viền ` +
        `${markerStroke / 2}) — một nửa chấm sẽ nằm NGOÀI khung SVG và bị cắt, và nó đọc lên như một ` +
        'đường dừng lại chứ không phải một cái chấm bị cắt đôi',
    );
  }
  if (dotR > edge) {
    problems.push(`chấm thường bán kính ${dotR} lớn hơn khoảng chừa ${edge} — chấm đầu và cuối bị cắt`);
  }

  /* And the plot has to actually use it at both ends. */
  const plot = src.match(/const plotW = Math\.max\(0, ([^)]+)\);/);
  if (!plot) {
    problems.push('không tìm thấy dòng tính plotW');
  } else if (!/-\s*EDGE/.test(plot[1])) {
    problems.push(
      `plotW = ${plot[1].trim()} — không trừ khoảng chừa ở mép PHẢI, nên điểm cuối lại nằm đúng ` +
        'trên cạnh khung và chấm của nó lại bị cắt đôi',
    );
  }
  const pad = src.match(/const padX = grid \? \d+ : ([\w.]+);/);
  if (!pad) {
    problems.push('không tìm thấy dòng tính padX');
  } else if (pad[1].trim() === '0') {
    problems.push(
      'lề trái của sparkline lại là 0 — điểm ĐẦU nằm đúng trên cạnh trái và chấm của nó bị cắt, ' +
        'cùng một lỗi ở đầu kia của đường',
    );
  }
  if (padGrid < need) {
    problems.push(`lề trái ở chế độ lưới là ${padGrid}, nhỏ hơn ${need} mà chấm cuối cần`);
  }
}

if (problems.length) {
  console.log('mép biểu đồ CÓ LỖI:\n');
  for (const p of problems.slice(0, 10)) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  `mép biểu đồ OK — hình học được LẤY RA khỏi ${FILE} và tính lại: chấm cuối (bán kính ${markerR} + ` +
    `nửa viền ${markerStroke / 2}) vừa trong khoảng chừa ${edge} ở CẢ HAI đầu, và plotW thật sự trừ ` +
    'khoảng chừa ở mép phải. Trước đó điểm cuối nằm đúng trên cạnh khung SVG nên một nửa chấm bị cắt ' +
    'trên mọi biểu đồ của bốn màn — và nó không đọc ra như một lỗi, nó đọc ra như một đường dừng lại',
);
