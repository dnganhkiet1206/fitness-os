/*
  Bộ icon macro phải là một BỘ, không phải bốn bản vẽ rời.

  ── hai lỗi hệ thống bản trước mắc ──

  1. Bảy độ dày nét khác nhau trên bốn hình (3.6 / 2.2 / 1.6 / 1.2 / 1.0 / 0.9 /
     0.8). Cả app dùng `lucide` ở độ dày 2, nên bốn hình đặc với nét phụ mảnh
     nằm cạnh chúng đọc ra là bốn thứ mượn từ app khác. Một bộ icon là một bộ
     khi nó có MỘT độ dày.

  2. Nét phụ vẽ bằng MÀU NỀN ở độ mờ một phần, giả làm vết khoét — và call site
     truyền `cut={colors.background}` vào. Nó chỉ đúng khi thứ nằm sau đúng bằng
     màu đó. Trang dinh dưỡng giờ có gradient phía sau, nên vết "khoét" thành
     một vệt sai màu. Khoảng trống phải là khoảng trống THẬT.

  Cả hai đều không phải lỗi về tay nghề vẽ, và cả hai đều không có gì bắt được:
  hình vẫn dựng, vẫn có màu, chỉ là chúng nói dối về việc mình thuộc về đâu.
*/
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');
const FILE = 'src/components/ascnd/macro-icons.tsx';
const src = read(FILE);
const problems = [];

/* ── 1. một độ dày nét cho cả bộ ── */
const widths = [...src.matchAll(/strokeWidth=\{([^}]+)\}/g)].map((m) => m[1].trim());
const distinct = [...new Set(widths)];
if (!widths.length) {
  problems.push(`${FILE}: không có nét nào — bộ này phải là nét đơn, không phải khối đặc`);
} else if (distinct.length > 1) {
  problems.push(
    `${FILE}: ${distinct.length} độ dày nét khác nhau (${distinct.join(', ')}) — một bộ icon là một bộ khi nó có MỘT độ dày`,
  );
}
const wDecl = /const W = (\d+(?:\.\d+)?);/.exec(src);
if (!wDecl) {
  problems.push(`${FILE}: không có hằng số độ dày nét`);
} else if (wDecl[1] !== '2') {
  problems.push(
    `${FILE}: độ dày nét ${wDecl[1]} không khớp mặc định của Icon (2) — bộ này đứng cạnh icon lucide và sẽ lệch cân`,
  );
}

/* ── 2. không icon nào được biết màu nền ──
   Một prop tên `cut`/`bg`/`surface`, hay một màu viết thẳng, đều là cùng một
   lỗi: icon giả định thứ nằm sau nó. */
if (/\b(cut|bg|surface|background)\s*[?:]/.test(src)) {
  problems.push(`${FILE}: icon nhận màu bề mặt — vết khoét giả sẽ sai ngay khi nền đổi`);
}
const hard = [...src.matchAll(/(?:stroke|fill)=\{?['"]#[0-9a-fA-F]{3,8}['"]\}?/g)]
  .filter((m) => !/color = '#fff'/.test(m[0]));
if (hard.length) {
  problems.push(`${FILE}: ${hard.length} màu viết thẳng trong hình — icon phải nhận màu từ chỗ gọi`);
}

/* ── 3. tô đặc là ngoại lệ, không phải mặc định ──
   Đúng MỘT chỗ: hạt quả bơ, vì một vòng tròn rỗng ở 14 điểm thì bít lại. */
const fills = [...src.matchAll(/fill=\{color\}/g)];
if (fills.length > 1) {
  problems.push(
    `${FILE}: ${fills.length} hình tô đặc — bộ này là nét đơn, tô đặc chỉ được dùng ở chỗ một hình rỗng sẽ bít lại ở 14 điểm`,
  );
}
for (const m of src.matchAll(/<Svg([^>]*)>/g)) {
  if (!/fill="none"/.test(m[1])) {
    problems.push(`${FILE}: một <Svg> thiếu fill="none" — đường khép kín sẽ tự tô đặc`);
    break;
  }
}

/* ── 4. và chỗ gọi không được truyền màu bề mặt vào ── */
const card = read('src/components/ascnd/dashboard-cards.tsx');
if (/<Glyph[^>]*\b(cut|bg|surface)=/.test(card)) {
  problems.push('dashboard-cards.tsx: vẫn truyền màu bề mặt vào icon macro');
}

if (problems.length) {
  console.log('kiểu icon macro CÓ LỖI:\n');
  for (const p of problems.slice(0, 10)) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  `kiểu icon macro OK — bốn hình, một độ dày nét (${wDecl[1]}, đúng mặc định của Icon nên chúng đứng cạnh ` +
    'lucide mà không lệch cân), không hình nào biết màu nền của nó, và tô đặc chỉ dùng đúng một chỗ — hạt ' +
    'quả bơ, nơi một vòng tròn rỗng ở 14 điểm sẽ bít lại thành một chấm bẩn',
);
