/**
 * Hai style hoạt hoạ cùng đặt `transform` trên MỘT View thì cái sau xoá cái
 * trước — và không gì trong repo bắt được.
 *
 *     node tools/transform-merge.mjs
 *
 * ── lỗi nó sinh ra để chặn, và nó đã xảy ra thật ──
 *
 * `swipe-row.tsx` viết:
 *
 *     const grow   = useAnimatedStyle(() => ({ transform: [{ translateX: … }] }));
 *     const bounce = useAnimatedStyle(() => ({ transform: [{ scale: … }] }));
 *     <Animated.View style={[styles.actionWrap, grow, bounce]}>
 *
 * React Native gộp style theo THUỘC TÍNH, không gộp bên trong một mảng
 * `transform`. `bounce.transform` thay thế trọn vẹn `grow.transform`, nên
 * parallax của nút vuốt chết im lặng. Đo trên bản dựng, nút mép phải:
 * `matrix(0.9, 0, 0, 0.9, 0, 0)` — scale 0,9, translateX **0** — ở mọi vị trí
 * kéo VÀ cả sau khi mở hẳn.
 *
 * Nó sống sót vì không cửa nào có thẩm quyền: `tsc` thấy hai style hợp lệ;
 * `motion.mjs` canh NHỊP chứ không canh phép gộp; ảnh chụp trạng thái mở thấy
 * nút đúng chỗ (nó tới nơi bằng đường khác); và chính người viết vừa gỡ `scale`
 * ra khỏi `grow` ở lượt trước nên tin rằng hai thứ giờ độc lập. Chủ dự án báo
 * đúng bằng câu "hiệu ứng khi nút mở ra chưa rõ rệt".
 *
 * ── luật ──
 *
 * Trong một mảng `style={[…]}`, không được có HAI giá trị cùng đến từ
 * `useAnimatedStyle` mà cả hai đều viết `transform`. Gộp chúng vào MỘT worklet
 * trả về một mảng `transform` duy nhất.
 *
 * Nó chỉ nhìn các style khai bằng `const <tên> = useAnimatedStyle(...)` trong
 * cùng tệp — đủ để bắt đúng hình dạng đã gây lỗi, và không đoán xa hơn thế.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { NATIVE } from './lib/stack.mjs';

const strip = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\/[^\n]*/g, ' ');

function sources(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sources(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Thân của `const NAME = useAnimatedStyle(` … `);` — cắt theo ngoặc cân. */
function animatedStyles(code) {
  const out = new Map();
  const re = /const\s+(\w+)\s*=\s*useAnimatedStyle\s*\(/g;
  let m;
  while ((m = re.exec(code))) {
    let depth = 0;
    let k = m.index + m[0].length - 1;
    for (; k < code.length; k++) {
      if (code[k] === '(') depth++;
      else if (code[k] === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
    out.set(m[1], code.slice(m.index, k + 1));
  }
  return out;
}

const problems = [];
let scanned = 0;
let arrays = 0;

for (const file of sources(path.join(NATIVE, 'src'))) {
  const raw = readFileSync(file, 'utf8');
  if (!raw.includes('useAnimatedStyle')) continue;
  scanned++;
  const code = strip(raw);
  const styles = animatedStyles(code);
  /* Chỉ những style THẬT SỰ viết `transform` mới đáng lo — hai style, một cái
     đổi `opacity` một cái đổi `transform`, gộp với nhau hoàn toàn bình thường. */
  const movers = new Set([...styles].filter(([, body]) => /\btransform\s*:/.test(body)).map(([n]) => n));
  if (movers.size < 2) continue;

  for (const m of code.matchAll(/style=\{\[([^\]]*)\]\}/g)) {
    arrays++;
    const parts = m[1].split(',').map((x) => x.trim());
    const hit = parts.filter((p) => movers.has(p));
    if (hit.length < 2) continue;
    problems.push(
      `${path.relative(NATIVE, file)}: một \`style={[…]}\` nhận ${hit.length} style hoạt hoạ cùng viết `
        + `\`transform\` — \`${hit.join('\`, \`')}\`. React Native gộp style theo THUỘC TÍNH, nên `
        + `\`${hit[hit.length - 1]}\` xoá sạch \`transform\` của \`${hit[0]}\`; thứ bị mất chạy đúng, chỉ là `
        + 'không ai nhìn thấy nó nữa. Gộp chúng vào MỘT worklet trả về một mảng `transform` duy nhất',
    );
  }
}

if (problems.length) {
  console.error('hai style hoạt hoạ cùng đặt `transform` — cái sau xoá cái trước:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  `gộp transform OK — soi ${scanned} tệp có \`useAnimatedStyle\` và ${arrays} mảng \`style={[…]}\` trong số `
    + 'đó: không mảng nào nhận hai style hoạt hoạ cùng viết `transform`. React Native gộp style theo THUỘC '
    + 'TÍNH chứ không gộp bên trong mảng `transform`, nên cái sau xoá trọn vẹn cái trước — và thứ bị mất vẫn '
    + 'chạy đúng trên UI thread, chỉ là không ai nhìn thấy nó nữa. Lỗi ấy đã xảy ra thật ở `swipe-row.tsx` '
    + '(`grow` + `bounce`): parallax của nút vuốt đứng yên ở 0 suốt cú kéo, đo được trên bản dựng là '
    + '`matrix(0.9, 0, 0, 0.9, 0, 0)` ở mọi vị trí. Không cửa nào khác có thẩm quyền — `tsc` thấy hai style '
    + 'hợp lệ, `motion.mjs` canh nhịp chứ không canh phép gộp, và ảnh chụp trạng thái MỞ thấy nút đúng chỗ '
    + 'vì nó tới nơi bằng đường khác. Luật chỉ soi style khai bằng `const X = useAnimatedStyle(…)` trong '
    + 'cùng tệp: đủ để bắt đúng hình dạng đã gây lỗi, và không đoán xa hơn thế',
);
