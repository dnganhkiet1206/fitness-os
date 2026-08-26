/*
  Màu của một mặt của app phải nói cùng một chuyện ở mọi chỗ nó xuất hiện.

  ── luật này bảo vệ cái gì ──

  Bảng cặp màu từng nằm cục bộ trong `(tabs)/index.tsx`, đủ dùng khi chỉ
  dashboard đổi nền theo thẻ đang vuốt tới. Giờ trang dinh dưỡng mang đúng màu
  thẻ dinh dưỡng và trang tập luyện mang màu thẻ vận động — cùng một quyết định
  được đọc ở bốn tệp. Một bản sao là lời hứa rằng một ngày nào đó thẻ và trang
  của cùng một thứ sẽ nói hai màu khác nhau, và không có gì bắt được: cả hai vẫn
  dựng, vẫn đẹp, chỉ là chúng nói dối về việc chúng có phải cùng một thứ không.

  Nên: các mã màu chỉ được viết ra ở `PAGE_TINT`. Ở nơi khác thì phải ĐỌC nó.
*/
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');
const strip = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const CONST = 'src/constants/ascnd.ts';
const problems = [];
const src = read(CONST);

/* ── bảng phải tồn tại và mỗi mặt phải có đúng hai tông ── */
const block = /export const PAGE_TINT = \{([\s\S]*?)\n\} as const/.exec(src);
if (!block) {
  problems.push(`${CONST}: không tìm thấy PAGE_TINT`);
} else {
  const pairs = [...block[1].matchAll(/^\s*(\w+): \[([^\]]+)\],/gm)].map((m) => [
    m[1],
    m[2].split(',').map((x) => x.trim()),
  ]);
  for (const [key, tones] of pairs) {
    if (tones.length !== 2) problems.push(`PAGE_TINT.${key}: ${tones.length} tông, phải đúng 2`);
    for (const t of tones) {
      if (!t.startsWith('colors.')) {
        problems.push(`PAGE_TINT.${key}: "${t}" không phải một tông trong bảng màu — mã màu viết thẳng thì không ai đổi được ở một chỗ`);
      }
    }
  }

  /* ── không mặt nào được trùng cặp với mặt khác ──
     Hai trang cùng cặp màu là hai trang không phân biệt được bằng mắt, mà nền
     màu tồn tại đúng để làm việc phân biệt đó. */
  const seen = new Map();
  for (const [key, tones] of pairs) {
    const sig = tones.join('→');
    if (seen.has(sig)) {
      problems.push(`PAGE_TINT.${key} trùng cặp với PAGE_TINT.${seen.get(sig)} — hai mặt cùng màu là hai mặt không phân biệt được`);
    }
    seen.set(sig, key);
  }

  /* ── và không mặt nào được dùng lại tông ĐẦU của mặt khác ──
     Tông đầu là tông chiếm phần lớn diện tích; trùng nó thì hai trang đọc ra
     giống nhau ngay cả khi tông thứ hai khác. */
  const heads = new Map();
  for (const [key, tones] of pairs) {
    if (heads.has(tones[0])) {
      problems.push(`PAGE_TINT.${key} dùng lại tông đầu của PAGE_TINT.${heads.get(tones[0])} (${tones[0]}) — tông đầu chiếm phần lớn diện tích`);
    }
    heads.set(tones[0], key);
  }
}

/* ── không ai được dựng bảng riêng ──
   Một `Record<..., [string, string]>` gán thẳng `colors.metric*` ở một màn hình
   là bản sao của bảng này, dù nó tên gì. */
const SCREENS = [
  'src/app/(tabs)/index.tsx',
  'src/app/(tabs)/nutrition.tsx',
  'src/app/(tabs)/workouts.tsx',
  'src/app/(tabs)/progress.tsx',
  'src/components/ascnd/screen.tsx',
];
for (const f of SCREENS) {
  const t = strip(read(f));
  const local = [...t.matchAll(/\[colors\.(metric|readiness)\w+, colors\.(metric|readiness)\w+\]/g)];
  if (local.length) {
    problems.push(`${f}: dựng ${local.length} cặp màu tại chỗ — phải đọc PAGE_TINT`);
  }
}

/* ── ba trang phải THỰC SỰ nhận nền, không chỉ import ── */
const WIRED = [
  ['src/app/(tabs)/nutrition.tsx', 'nutrition'],
  ['src/app/(tabs)/workouts.tsx', 'activity'],
  ['src/app/(tabs)/progress.tsx', 'progress'],
];
for (const [f, key] of WIRED) {
  if (!new RegExp(`aura=\\{PAGE_TINT\\.${key}\\}`).test(read(f))) {
    problems.push(`${f}: không truyền aura={PAGE_TINT.${key}} cho <Screen>`);
  }
}

/* ── và cả BA nhánh return của Screen phải vẽ nó ──
   Thiếu một nhánh thì trang nào đi qua nhánh đó mất nền mà không có lỗi nào
   báo: `aura` vẫn được truyền, vẫn hợp kiểu, và không tới đâu cả. */
const screen = read('src/components/ascnd/screen.tsx');
const branches = (screen.match(/<AmbientLight \/>/g) ?? []).length;
const drawn = (screen.match(/\{aura \? <PageAura/g) ?? []).length;
/*
  Nền màu phải đi kèm lớp dập, và hai thứ phải viết ở MỘT chỗ.

  Thẻ ở app này là kính: `glass.bg` là trắng 6%, nên 94% thứ sau lưng nó đi
  xuyên qua. Trên nền đen đó là kính hơi sáng; trên một dải tím-cam thì chính
  tấm kính đó nhuốm tím-cam, và mọi thẻ trên trang cùng ngả một tông — màu riêng
  của từng thẻ không còn đọc ra được.

  `PageAura` gói cả hai lại nên không nhánh nào có thể vẽ nền mà quên lớp dập.
*/
if (!/const AURA_DIM = /.test(screen)) {
  problems.push('screen.tsx: nền màu không có lớp dập — wash sẽ nhuốm màu mọi tấm kính trên trang');
}
if (/<ReadinessAura[\s\S]{0,200}?\/>\s*\n\s*(?!<View)/.test(screen) && !/function PageAura/.test(screen)) {
  problems.push('screen.tsx: ReadinessAura được vẽ ngoài PageAura — nền và lớp dập tách rời thì sẽ lệch');
}

if (branches === 0) {
  problems.push('screen.tsx: không tìm thấy nhánh nào');
} else if (drawn !== branches) {
  problems.push(
    `screen.tsx: ${branches} nhánh nhưng chỉ ${drawn} nhánh vẽ aura — trang đi qua nhánh còn lại mất nền mà không có lỗi nào báo`,
  );
}

if (problems.length) {
  console.log('màu của trang CÓ LỖI:\n');
  for (const p of problems.slice(0, 10)) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'màu của trang OK — cặp màu chỉ viết ra ở PAGE_TINT và mọi nơi khác ĐỌC nó, nên thẻ dinh dưỡng ' +
    'trên dashboard và trang dinh dưỡng không thể lệch màu; không mặt nào trùng cặp hay dùng lại ' +
    'tông ĐẦU của mặt khác, vì tông đầu chiếm phần lớn diện tích và trùng nó là hai trang đọc ra ' +
    'giống nhau; ba trang thực sự nhận nền chứ không chỉ import; và cả ba nhánh return của Screen ' +
    'đều vẽ nó — thiếu một nhánh là một trang mất nền mà không có lỗi nào báo',
);
