/*
  Một shared value phải được khai báo TRƯỚC worklet đọc nó.

  ── lỗi này trông như thế nào ──

  `useAnimatedScrollHandler`, `useAnimatedStyle`, `useAnimatedProps` và
  `useDerivedValue` dựng worklet NGAY lúc hook được gọi, và bắt các biến mà thân
  worklet tham chiếu. Nếu `const x = useSharedValue(...)` nằm BÊN DƯỚI lời gọi
  đó, thì lúc worklet được dựng biến còn trong vùng chết tạm thời: `ReferenceError`
  ngay trong render, và cả màn hình ra TRẮNG.

  ── vì sao cần một luật riêng ──

  TypeScript không bắt được: tham chiếu nằm trong một callback, nên nó không
  chứng minh được callback chạy lúc nào. Một thay đổi mắc đúng lỗi này đã đi qua
  `tsc` sạch và tám guard xanh, rồi dựng ra một cây DOM rỗng — canary của
  `live.mjs` là thứ duy nhất thấy, và canary chỉ chạy khi ai đó nhớ chạy nó.

  Và hỏng ở đây là hỏng TOÀN PHẦN. Không phải một thẻ lệch màu; là app không mở
  được. Đó là loại lỗi đáng có một luật tĩnh riêng dù luật ấy chỉ bắt một hình
  dạng hẹp.
*/
import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = globSync('src/**/*.{ts,tsx}', { cwd: NATIVE }).sort();
const HOOKS = ['useAnimatedScrollHandler', 'useAnimatedStyle', 'useAnimatedProps', 'useDerivedValue'];
const problems = [];

for (const f of files) {
  const src = readFileSync(path.join(NATIVE, f), 'utf8');
  if (!HOOKS.some((h) => src.includes(h))) continue;
  const lines = src.split('\n');

  /*
    Chia theo TỪNG hàm cấp cao nhất trước khi so sánh.

    Một khai báo ở component KHÁC không nằm trong phạm vi của component này, nên
    ghép chúng với nhau là báo nhầm. Bản đầu của luật này đã làm đúng như vậy:
    nó tố `ConfettiPiece` đọc `spin` khai báo ở `MascotCelebrationModal` — hai
    hàm rời nhau, không liên quan gì.
  */
  const starts = [];
  lines.forEach((l, i) => {
    if (/^(export )?(default )?function \w+/.test(l) || /^(export )?const \w+ = \(/.test(l)) starts.push(i);
  });
  if (!starts.length) starts.push(0);
  starts.push(lines.length);

  for (let b = 0; b < starts.length - 1; b++) {
    const lo = starts[b];
    const hi = starts[b + 1];

    /* Shared value khai báo trong ĐÚNG hàm này. */
    const declAt = new Map();
    for (let i = lo; i < hi; i++) {
      const m = /^\s*const (\w+) = useSharedValue\(/.exec(lines[i]);
      if (m && !declAt.has(m[1])) declAt.set(m[1], i);
    }
    if (!declAt.size) continue;

    for (let i = lo; i < hi; i++) {
      const hook = HOOKS.find((h) => lines[i].includes(`${h}(`));
      if (!hook) continue;
      let depth = 0;
      let started = false;
      for (let j = i; j < hi; j++) {
        for (const ch of lines[j]) {
          if (ch === '(') { depth++; started = true; }
          else if (ch === ')') depth--;
        }
        if (j > i) {
          for (const [name, at] of declAt) {
            if (at <= i) continue;
            /*
              Không tính khi có dấu chấm ngay trước: `piece.spin` là một THUỘC
              TÍNH trùng tên, không phải shared value. Bản đầu của luật này bắt
              đúng chỗ đó và báo nhầm.
            */
            if (new RegExp(`(^|[^.\\w])${name}\\b`).test(lines[j])) {
              problems.push(
                `${f}:${j + 1}: worklet của ${hook} (dòng ${i + 1}) đọc \`${name}\`, nhưng ` +
                  `\`${name}\` khai báo mãi ở dòng ${at + 1} — vùng chết tạm thời, app ra trắng`,
              );
            }
          }
        }
        if (started && depth <= 0) break;
      }
    }
  }
}

if (problems.length) {
  console.log('thứ tự khai báo worklet CÓ LỖI:\n');
  for (const p of [...new Set(problems)].slice(0, 10)) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'thứ tự khai báo worklet OK — mọi shared value được worklet đọc đều khai báo TRƯỚC hook dựng worklet đó. ' +
    'Reanimated dựng worklet ngay lúc gọi hook và bắt biến nó tham chiếu, nên một khai báo nằm dưới là ' +
    'ReferenceError ngay trong render và cả màn hình ra trắng — thứ mà tsc không bắt được vì tham chiếu ' +
    'nằm trong callback, và thứ đã từng đi qua tsc sạch cùng tám guard xanh trước khi canary thấy',
);
