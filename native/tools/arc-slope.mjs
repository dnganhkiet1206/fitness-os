/**
 * Cung vòng sẵn sàng của bản SÁNG phải giữ độ dốc, và phải giữ nó SO VỚI TOKEN.
 *
 *     node tools/arc-slope.mjs
 *
 * ── lỗi nó tồn tại vì nó, và lỗi ấy đã xảy ra thật ──
 *
 * `LIGHT_ARC_DEEP` là một hằng số DẪN XUẤT: mỗi giá trị là token trạng thái của
 * chính nó với `L − 0,055` trong OKLCH. GĐ2B dẫn nó đúng, ghi cả phép dẫn vào
 * chú thích, rồi GĐ2C.2 nâng chính các token lên — và bảng dẫn xuất ở nguyên.
 *
 * Không có gì đỏ. `tsc` không biết một hex nào dẫn từ hex nào; `palette.mjs` đo
 * tương phản và cả hai đầu vẫn qua sàn; `dark-frozen` chỉ canh bản tối. Cái
 * duy nhất thay đổi là thứ không ai đo: ΔL thiết kế 0,055 tụt còn 0,016, và
 * cung đọc ra PHẲNG. Phải tới ảnh chụp máy thật mới thấy.
 *
 * Một hằng số dẫn xuất không tự đi theo thứ nó được dẫn từ đó là cái bẫy. Luật
 * này dẫn LẠI từ bảng màu đang chạy rồi so — nên lần sau token đổi, bước này đỏ
 * ngay ở commit ấy chứ không đợi một vòng QA thiết bị.
 *
 * ── bốn tính chất ──
 *
 *  1. Mỗi điểm dừng sâu ĐÚNG là token của nó ở `L − 0,055` (dung sai một bước
 *     8-bit), cùng sắc.
 *  2. Đầu cung phải SÁNG HƠN đuôi cung — đo theo hình học THẬT đã dựng, không
 *     theo thứ tự mảng.
 *  3. Cả hai đầu ≥3:1 trên mặt thẻ: một cái cung là đồ hoạ, nhưng nó vẫn phải
 *     nhìn thấy được ở cả hai đầu.
 *  4. Ba trạng thái cùng một độ dốc (chênh ≤0,04×) — một trạng thái dốc hơn
 *     hai cái kia là bảng màu tự chấm điểm.
 *
 * ── vì sao tính chất 2 không đọc thứ tự mảng ──
 *
 * `x1="0%" y1="0%"` đọc như "trên-trái", nhưng `<Circle>` mang
 * `transform="rotate(-90 60 60)"` và gradient objectBoundingBox quay THEO phần
 * tử. Đo thật trong trình duyệt: offset 0% rơi vào 225°, offset 100% vào 45°,
 * và cung chạy từ 12 giờ THUẬN kim đồng hồ. Chú thích cũ trong
 * `readiness-gauge.tsx` khẳng định ngược lại suốt hai giai đoạn.
 *
 * Nên hình học ấy được ĐỌC RA khỏi nguồn ở đây (`rotate`, `x1/y1/x2/y2`, thứ
 * tự hai `<Stop>`) chứ không được chép lại: đổi một trong số đó mà quên đổi
 * giá trị thì bước này đỏ, thay vì luật vẫn xanh trên một hình học khác.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GAUGE = 'src/components/ascnd/readiness-gauge.tsx';
const src = readFileSync(path.join(NATIVE, GAUGE), 'utf8');

const out = mkdtempSync(path.join(tmpdir(), 'arc-slope-'));
execFileSync(
  'npx',
  ['tsc', 'src/constants/palette.ts', '--ignoreConfig', '--outDir', out,
   '--module', 'esnext', '--target', 'es2020', '--moduleResolution', 'bundler', '--skipLibCheck'],
  { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
);
const { palettes } = await import(pathToFileURL(path.join(out, 'palette.js')).href);

/* ── OKLCH ────────────────────────────────────────────────────────────────── */
const hex = (h) => [0, 2, 4].map((i) => parseInt(h.replace('#', '').slice(i, i + 2), 16) / 255);
const lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const gam = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
function toLCH(h) {
  const [r, g, b] = hex(h).map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  return { L, C: Math.hypot(A, B), H: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
}
function raw(L, C, H) {
  const h = (H * Math.PI) / 180;
  const A = C * Math.cos(h);
  const B = C * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}
const inG = (c) => c.every((v) => v >= -1e-4 && v <= 1 + 1e-4);
const toHex = (L, C, H) =>
  '#' + raw(L, C, H).map((v) => Math.round(Math.min(1, Math.max(0, gam(v))) * 255).toString(16).padStart(2, '0')).join('');
/** Giữ L và H, hạ C tới khi vào gamut. Hạ dọc theo sắc — kẹp kênh làm xoay sắc. */
function fit(L, C, H) {
  if (inG(raw(L, C, H))) return toHex(L, C, H);
  let lo = 0;
  let hi = C;
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    if (inG(raw(L, m, H))) lo = m;
    else hi = m;
  }
  return toHex(L, lo, H);
}
const lum = (h) => {
  const c = hex(h).map(lin);
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

const problems = [];

/** Phép dẫn được ghi trong chú thích của tệp, và đây là chỗ nó được thi hành. */
const DROP = 0.055;
const STATES = ['green', 'yellow', 'red'];
const TOKEN = { green: 'readinessGreen', yellow: 'readinessYellow', red: 'readinessRed' };
const CARD = palettes.light.card;

/* ── đọc bảng SÂU ra khỏi nguồn ─────────────────────────────────────────── */
const deep = {};
{
  const m = /const LIGHT_ARC_DEEP: Record<string, string> = \{([\s\S]*?)\};/.exec(src);
  if (!m) {
    problems.push(
      `${GAUGE}: không đọc được \`LIGHT_ARC_DEEP\` — neo của luật này hỏng, đừng tin kết quả. ` +
        'Nếu bảng đã đổi tên thì luật phải đổi theo, không được im lặng bỏ qua',
    );
  } else {
    for (const s of STATES) {
      const v = new RegExp(`${s}:\\s*'(#[0-9a-fA-F]{6})'`).exec(m[1]);
      if (v) deep[s] = v[1].toLowerCase();
      else problems.push(`${GAUGE}: \`LIGHT_ARC_DEEP\` thiếu trạng thái \`${s}\``);
    }
  }
}

/* ── 1. mỗi điểm dừng sâu vẫn ĐÚNG là token của nó ở L − 0,055 ───────────── */
for (const s of STATES) {
  if (!deep[s]) continue;
  const tok = palettes.light[TOKEN[s]];
  const t = toLCH(tok);
  const want = fit(t.L - DROP, t.C, t.H).toLowerCase();
  if (deep[s] !== want) {
    const got = toLCH(deep[s]);
    problems.push(
      `${GAUGE}: điểm dừng sâu của \`${s}\` là ${deep[s]} (L ${r3(got.L)}), nhưng dẫn lại từ ` +
        `\`${TOKEN[s]}\` = ${tok} (L ${r3(t.L)}) với L − ${DROP} phải ra ${want}. ` +
        'Một hằng số DẪN XUẤT vừa lệch khỏi thứ nó được dẫn từ đó — thường là vì token đã đổi ' +
        'và bảng này không đi theo. Đó đúng là cách cung đọc ra PHẲNG ở GĐ2C.2',
    );
  }
}

/* ── 2. hình học: đầu cung phải sáng hơn đuôi cung ───────────────────────── */
{
  /*
    Ba điều được ĐỌC RA khỏi nguồn, không chép lại — nếu một trong ba đổi thì
    kết luận "offset 100% là đầu cung" không còn đúng, và luật phải đỏ.
  */
  const rotated = /transform="rotate\(-90 60 60\)"/.test(src);
  const axis = /<LinearGradient id=\{gradId\} x1="0%" y1="0%" x2="100%" y2="100%">/.test(src);
  const order = /<Stop offset="0%" stopColor=\{g0\} \/>\s*<Stop offset="100%" stopColor=\{g1\} \/>/.test(src);
  const tuple = /return \[LIGHT_ARC_DEEP\[status\] \?\? LIGHT_ARC_DEEP\.yellow, c\[key\]\];/.test(src);

  if (!rotated || !axis || !order || !tuple) {
    problems.push(
      `${GAUGE}: hình học của cung đã đổi (` +
        `${rotated ? 'rotate ok' : 'THIẾU rotate(-90 60 60)'}, ` +
        `${axis ? 'trục ok' : 'TRỤC gradient đã đổi'}, ` +
        `${order ? 'thứ tự stop ok' : 'THỨ TỰ hai <Stop> đã đổi'}, ` +
        `${tuple ? 'tuple ok' : 'TUPLE gradientFor đã đổi'}` +
        ') — kết luận "offset 100% là ĐẦU cung" được đo trên đúng ba thứ đó. ' +
        'Đo lại trong trình duyệt trước khi tin bất kỳ giá trị nào ở đây',
    );
  } else {
    /*
      Đo được: offset 0% → 225°, offset 100% → 45°, cung chạy 12 giờ thuận kim
      đồng hồ. Nên g1 (offset 100%, tức token) là ĐẦU, g0 là ĐUÔI.
    */
    for (const s of STATES) {
      if (!deep[s]) continue;
      const head = toLCH(palettes.light[TOKEN[s]]).L;
      const tail = toLCH(deep[s]).L;
      if (!(head > tail)) {
        problems.push(
          `${GAUGE}: cung \`${s}\` không đi từ SÁNG sang SÂU — đầu cung L ${r3(head)}, ` +
            `đuôi cung L ${r3(tail)}. Đầu cung là offset 100% (45°, nơi mắt vào trước), ` +
            'đuôi là offset 0% (225°)',
        );
      }
    }
  }
}

/* ── 3. cả hai đầu vẫn nhìn thấy được trên mặt thẻ ───────────────────────── */
for (const s of STATES) {
  if (!deep[s]) continue;
  for (const [what, hexv] of [['đuôi', deep[s]], ['đầu', palettes.light[TOKEN[s]]]]) {
    const cr = contrast(hexv, CARD);
    if (cr < 3) {
      problems.push(
        `${GAUGE}: ${what} cung \`${s}\` (${hexv}) chỉ đạt ${r2(cr)}:1 trên mặt thẻ — dưới sàn đồ hoạ 3:1. ` +
          'Một cái cung không nợ 4,5:1, nhưng cả hai đầu vẫn phải nhìn thấy được',
      );
    }
  }
}

/* ── 4. ba trạng thái cùng một độ dốc ────────────────────────────────────── */
{
  const slopes = STATES.filter((s) => deep[s]).map(
    (s) => contrast(deep[s], CARD) / contrast(palettes.light[TOKEN[s]], CARD),
  );
  if (slopes.length === STATES.length) {
    const spread = Math.max(...slopes) - Math.min(...slopes);
    if (spread > 0.04) {
      problems.push(
        `độ dốc ba trạng thái lệch nhau ${r2(spread)}× (${STATES.map((s, i) => `${s} ${r2(slopes[i])}×`).join(', ')}) ` +
          '— quá 0,04×. Một trạng thái có cung dốc hơn hai cái kia là bảng màu tự chấm điểm: ' +
          'người dùng đọc độ dốc thành mức độ quan trọng',
      );
    }
  }
}

if (problems.length) {
  console.log('độ dốc cung sẵn sàng CÓ LỖI:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

const slopes = STATES.map((s) => contrast(deep[s], CARD) / contrast(palettes.light[TOKEN[s]], CARD));
console.log(
  `độ dốc cung sẵn sàng OK — ba điểm dừng sâu được DẪN LẠI từ bảng màu đang chạy (token ở L − ${DROP}) và ` +
    `khớp từng ký tự, nên một lần đổi token sẽ đỏ ở đây chứ không đợi ảnh chụp máy thật; hình học được đọc ` +
    'ra khỏi nguồn (rotate −90 + trục gradient + thứ tự hai <Stop>), và trên hình học ấy offset 100% là ĐẦU ' +
    `cung — cả ba trạng thái đi từ SÁNG sang SÂU; cả sáu giá trị ≥3:1 trên mặt thẻ; ba độ dốc ` +
    `${STATES.map((s, i) => `${s} ${r2(slopes[i])}×`).join(', ')} lệch nhau ${r2(Math.max(...slopes) - Math.min(...slopes))}×`,
);
