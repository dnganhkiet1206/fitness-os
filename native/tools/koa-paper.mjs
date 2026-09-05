/**
 * Koa phải ĐỌC ĐƯỢC trên giấy — đo trên chính màu sẽ được vẽ ra.
 *
 *     node tools/koa-paper.mjs
 *
 * ── lỗi này đến từ ảnh chụp máy thật ──
 *
 * Trên nền giấy #f7f4ef, nhân vật gần như không có THÂN. Nét viền thì thấy
 * (1,96:1) nhưng khối bên trong trùng luôn với tờ giấy:
 *
 *     bụng/mặt  #f4f6f8  32 chỗ   1,01:1
 *     điểm sáng #ffffff  16 chỗ   1,10:1
 *
 * Koa đọc ra là một hình VIỀN RỖNG. 25/48 mã màu dưới sàn 3:1, tức 272/448 chỗ
 * dùng — nhưng con số ấy KHÔNG phải thứ luật này đuổi theo, xem dưới.
 *
 * ── luật đo cái gì, và cố ý KHÔNG đo cái gì ──
 *
 * Không đòi mọi mã màu trang trí đạt 3:1. Một nhân vật hoạt hình không phải một
 * biểu đồ, và ép từng mảng nhỏ qua sàn WCAG là cách chắc chắn nhất để biến nó
 * thành một con vật màu bùn. Thứ được đòi là ba tính chất mà mắt thật sự dùng
 * để nhận ra một hình in trên giấy:
 *
 *  1. VIỀN NGOÀI phải tách khỏi giấy — nếu không thì không có hình.
 *  2. KHỐI TRONG phải tách khỏi giấy — nếu không thì hình rỗng ruột.
 *  3. Viền và khối phải tách KHỎI NHAU — nếu không thì hình là một vệt phẳng.
 *
 * Và một tính chất về cách sửa, không về kết quả:
 *
 *  4. Phép đổi phải giữ H và C. Hạ độ sáng thì Koa vẫn là Koa; đổi sắc hay rút
 *     chroma thì nó thành một nhân vật khác, và bản hợp đồng cấm cả đơn sắc lẫn
 *     bóng đen.
 *
 * Màu được đọc NGƯỢC ra khỏi `koa-scene.ts` rồi chạy qua chính hàm `onPaper`
 * của `koa-light.ts` — không chép lại phép tính, nên sửa `PAPER_L` là con số ở
 * đây đổi theo.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(NATIVE, p), 'utf8');

const PAPER = '#f7f4ef';

/*
  ── phép đổi được TRÍCH ra rồi chạy, không dò bằng regex ──

  `koa-light.ts` import cả cảnh (một tệp dữ liệu rất lớn) nên biên dịch cả nó là
  chậm và thừa. Thứ cần là đúng một hàm thuần. Nó được cắt ra khỏi nguồn theo
  tên và chạy — nên nếu ai đó sửa phép tính, bước này chạy phép tính MỚI, không
  chạy một bản chép đã cũ.
*/
const src = read('src/components/ascnd/koa/koa-light.ts');
const grab = (name, kind = 'function') => {
  const start = src.indexOf(`${kind} ${name}`);
  if (start < 0) return null;
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (!depth) return src.slice(start, i + 1);
    }
  }
  return null;
};

const problems = [];
const onPaperSrc = grab('onPaper');
const helpers = [
  /const srgbEnc = [^;]+;/.exec(src)?.[0],
  /const srgbDec = [^;]+;/.exec(src)?.[0],
  /const PAPER_L = [\d.]+;/.exec(src)?.[0],
];

if (!onPaperSrc || helpers.some((h) => !h)) {
  console.log('Koa trên giấy CÓ LỖI:\n');
  console.log('  • không trích được `onPaper` / `PAPER_L` khỏi `koa-light.ts` — neo của luật này hỏng,');
  console.log('    và một luật không đọc được thứ nó kiểm thì phải ĐỔ chứ không được báo xanh');
  process.exit(1);
}

const dir = mkdtempSync(path.join(tmpdir(), 'koa-paper-'));
const mod = path.join(dir, 'p.mjs');
writeFileSync(
  mod,
  `${helpers.join('\n')}\n${onPaperSrc.replace(/^function/, 'export function')}\n`
    .replace(/: string/g, '')
    .replace(/: number/g, '')
    .replace(/<[^>]*>\(/g, '('),
);
const { onPaper } = await import(pathToFileURL(mod).href);

const lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
function lum(hex) {
  const h = hex.replace('#', '');
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map(lin);
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const r2 = (v) => Math.round(v * 100) / 100;

/* Đếm chỗ dùng, tách nét khỏi mảng: viền và khối là hai vai khác nhau. */
const scene = read('src/components/ascnd/koa/koa-scene.ts');
const tally = (kind) => {
  const out = {};
  for (const m of scene.matchAll(new RegExp(`"${kind}":"(#[0-9A-Fa-f]{6})"`, 'g'))) {
    const h = m[1].toLowerCase();
    out[h] = (out[h] ?? 0) + 1;
  }
  return out;
};
const strokes = tally('stroke');
const fills = tally('fill');
const top = (t) => Object.entries(t).sort((a, b) => b[1] - a[1])[0];

const OUTLINE = top(strokes);

/**
 * KHỐI của nhân vật: mọi mảng được dùng đủ nhiều để là cấu trúc, không phải chi tiết.
 *
 * ── vì sao không phải "mảng dùng nhiều nhất" ──
 *
 * Bản đầu lấy đúng một mảng — cái nhiều chỗ dùng nhất — và phép thử ngược đã
 * bác nó: tắt hẳn phép hạ sáng (`PAPER_L = 1`) mà luật vẫn XANH. Vì mảng đông
 * nhất là `#bfc7cf` (39 chỗ, 1,56:1), thứ vốn đã qua sàn; còn cái THẬT SỰ vô
 * hình là `#f4f6f8` (32 chỗ, **1,01:1**) — bụng và mặt. Luật đang canh đúng
 * một mảng và bỏ trống phần còn lại của thân.
 *
 * ── và `#ffffff` được loại bằng ĐỊNH NGHĨA, không bằng một ngưỡng vừa vặn ──
 *
 * Trắng thuần là giá trị SÁNG NHẤT có thể có. Trên một nhân vật lông trắng, nó
 * không thể là một khối — một khối trắng thuần thì không còn chỗ nào sáng hơn
 * để làm điểm sáng. Nó là điểm sáng: mắt, răng, ánh trên mũi. Nó đậu trong
 * vùng tối và đọc so với hàng xóm chứ không so với tờ giấy.
 *
 * Đây là một định nghĩa về vai, không phải một con số chỉnh cho vừa. Nếu một
 * ngày Koa có một mảng trắng thuần THẬT, luật này sẽ bỏ sót nó — và đó là đánh
 * đổi đã biết, ghi ra ở đây thay vì giấu trong một ngưỡng đếm.
 */
const MASS_MIN = 10;
const MASSES = Object.entries(fills)
  .filter(([hex, n]) => n >= MASS_MIN && hex !== '#ffffff')
  .sort((a, b) => b[1] - a[1]);

if (!OUTLINE || !MASSES.length) {
  problems.push('không đọc được màu nét/mảng nào từ `koa-scene.ts` — neo hỏng');
} else {
  const outline = onPaper(OUTLINE[0]);

  /* 1. đường bao phải tách khỏi giấy — không có bao thì không có hình.
     1,5:1 là ngưỡng "tìm thấy được" mà repo đã dùng cho rãnh vòng tròn
     (`tools/ring-track.mjs`), và một hình người không được mờ hơn một cái rãnh. */
  const FLOOR = 1.5;
  if (contrast(outline, PAPER) < FLOOR) {
    problems.push(
      `viền ngoài \`${OUTLINE[0]}\` → \`${outline}\` chỉ ${r2(contrast(outline, PAPER))}:1 trên giấy — ` +
        `dưới sàn ${FLOOR}:1, và không có đường bao thì không có hình`,
    );
  }

  /* 2. MỌI khối phải tách khỏi giấy — một khối chìm là một lỗ thủng trong thân. */
  for (const [hex0, n] of MASSES) {
    const hex = onPaper(hex0);
    const cr = contrast(hex, PAPER);
    if (cr < FLOOR) {
      problems.push(
        `khối \`${hex0}\` (${n} chỗ) → \`${hex}\` chỉ ${r2(cr)}:1 trên giấy — dưới sàn ${FLOOR}:1. ` +
          'Hình sẽ rỗng ruột ở đúng mảng ấy: thấy đường bao mà không thấy thân',
      );
    }
  }

  /* 3. và khối SÁNG NHẤT phải tách khỏi đường bao, nếu không hình là một vệt phẳng. */
  const lightest = MASSES.reduce((a, b) => (contrast(onPaper(b[0]), PAPER) < contrast(onPaper(a[0]), PAPER) ? b : a));
  const sep = contrast(outline, onPaper(lightest[0]));
  if (sep < 1.2) {
    problems.push(
      `viền (${outline}) và khối sáng nhất ${lightest[0]}→${onPaper(lightest[0])} chỉ cách nhau ${r2(sep)}× — ` +
        'dưới 1,2× thì hai vai đọc ra như một mảng phẳng, tức nhân vật mất chiều',
    );
  }
}

/* 4. phép đổi chỉ được chạm ĐỘ SÁNG. */
{
  const rgb2ok = (hex) => {
    const [r, g, b] = [0, 2, 4].map((i) => lin(parseInt(hex.replace('#', '').slice(i, i + 2), 16) / 255));
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
    const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    return { C: Math.hypot(A, B), H: (Math.atan2(B, A) * 180) / Math.PI };
  };
  const all = [...new Set([...Object.keys(fills), ...Object.keys(strokes)])];
  for (const hex of all) {
    const a = rgb2ok(hex);
    const b = rgb2ok(onPaper(hex));
    /*
      ── ngưỡng lệch sắc phải theo CHROMA, không phải một con số phẳng ──

      Góc sắc là `atan2` trên hai trục a,b: bán kính càng nhỏ thì một bước
      lượng tử 8-bit càng xoay nhiều. Đo trên chính màu gây tranh cãi,
      `#2a313b` (C = 0,0205): đổi MỘT bậc ở một kênh đã xoay sắc 2,1–3,4°, mà
      chưa có phép đổi nào cả.

      Nên một ngưỡng phẳng 3° hoặc là bỏ sót màu rực, hoặc là báo oan màu xám.
      Ngưỡng ở đây là `0,07 / C` độ — xấp xỉ chính sàn lượng tử ấy: ~3,4° ở
      C = 0,02, và siết còn ~0,5° ở C = 0,14 (vàng `#e8b23a`), tức đúng chỗ một
      độ lệch thật sự có nghĩa.
    */
    if (a.C > 0.005) {
      let dh = Math.abs(a.H - b.H);
      if (dh > 180) dh = 360 - dh;
      const tol = Math.max(0.5, 0.07 / a.C);
      if (dh > tol) {
        problems.push(
          `\`${hex}\` đổi SẮC ${r2(dh)}° khi lên giấy (ngưỡng ${r2(tol)}° ở chroma ${r2(a.C)}) — ` +
            'phép đổi chỉ được chạm độ sáng',
        );
      }
    }
    if (a.C > 0.02 && b.C / a.C < 0.8) {
      problems.push(
        `\`${hex}\` mất ${r2((1 - b.C / a.C) * 100)}% chroma khi lên giấy — ` +
          'rút chroma là đường dẫn tới một Koa đơn sắc, thứ bản hợp đồng cấm',
      );
    }
  }
}

if (problems.length) {
  console.log('Koa trên giấy CÓ LỖI:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

const outline = onPaper(OUTLINE[0]);
const lightest = MASSES.reduce((a, b) =>
  contrast(onPaper(b[0]), PAPER) < contrast(onPaper(a[0]), PAPER) ? b : a,
);
console.log(
  `Koa trên giấy OK — viền ${OUTLINE[0]}→${outline} ${r2(contrast(outline, PAPER))}:1; cả ${MASSES.length} khối ` +
    `(≥${MASS_MIN} chỗ dùng) đều trên sàn 1,5, khối nhạt nhất ${lightest[0]}→${onPaper(lightest[0])} ` +
    `${r2(contrast(onPaper(lightest[0]), PAPER))}:1 và cách đường bao ${r2(contrast(outline, onPaper(lightest[0])))}×; ` +
    'và phép đổi chỉ chạm độ sáng — không mã màu nào lệch sắc quá sàn lượng tử của chroma nó (0,07/C độ) ' +
    'hay mất quá 20% chroma, nên nhân vật không bị đẩy về đơn sắc',
);
