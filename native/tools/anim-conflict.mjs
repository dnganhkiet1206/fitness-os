/*
  Một view không được để layout animation và useAnimatedStyle cùng ghi transform.

  ── lỗi này trông như thế nào ──

  `entering`/`exiting` của Reanimated chạy trên luồng UI và ghi thẳng transform
  của view. `useAnimatedStyle` cũng chạy trên luồng UI và cũng ghi transform của
  view. Đặt cả hai lên CÙNG một view thì mỗi khung hình chúng đè lên nhau, và
  view nhảy qua lại giữa hai giá trị suốt thời gian hiệu ứng vào còn chạy.

  Người dùng báo: "ring cứ giật giật ngay khi mở app". Nguyên nhân là
  `style={[styles.heroFull, heroSlide]}` cộng
  `entering={FadeInDown.springify()}` trên cùng một `Animated.View` — heroSlide
  ghi `translateY` theo cuộn, FadeInDown ghi `translateY` theo lò xo.

  ── vì sao cần một luật tĩnh ──

  Đây là rung do TRANH CHẤP, không phải do đo đạc, nên mọi phép đo chiều cao đều
  sạch trong khi mắt vẫn thấy giật. Và Reanimated không chạy layout animation
  trên web như trên máy: trace 489 khung hình từ lúc khởi động báo vị trí không
  đổi lần nào. Harness mù hoàn toàn với lớp lỗi này — đây là lỗi thứ ba trong
  một phiên truy về `entering`, và cả ba đều vô hình với nó.

  Cách sửa luôn là tách hai lớp: một view giữ style động, một view con giữ hiệu
  ứng vào. Không thuộc tính nào bị hai bên cùng ghi.
*/
import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = globSync('src/**/*.tsx', { cwd: NATIVE }).sort();
/* Hiệu ứng có DỜI CHỖ. `FadeIn`/`FadeOut` thuần chỉ đụng opacity nên vô hại. */
const MOVES = /\b(FadeInDown|FadeInUp|FadeInLeft|FadeInRight|FadeOutDown|FadeOutUp|FadeOutLeft|FadeOutRight|SlideIn\w+|SlideOut\w+|ZoomIn\w*|ZoomOut\w*|BounceIn\w*|BounceOut\w*|FlipIn\w*|FlipOut\w*|PinwheelIn|RotateIn\w*|RotateOut\w*|LightSpeedIn\w*|LightSpeedOut\w*)\b/;
const problems = [];

for (const f of files) {
  const src = readFileSync(path.join(NATIVE, f), 'utf8');
  if (!/entering=|exiting=/.test(src)) continue;

  /* Tên các useAnimatedStyle trong tệp có ghi transform. */
  const moving = new Set();
  for (const m of src.matchAll(/const (\w+) = useAnimatedStyle\(\(\) => \{?([\s\S]*?)\n  \}\);/g)) {
    if (/transform:/.test(m[2])) moving.add(m[1]);
  }
  if (!moving.size) continue;

  /* Mỗi thẻ mở: gom thuộc tính tới dấu `>` đầu tiên ở cuối dòng. */
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!/<Animated\.\w+/.test(lines[i])) continue;
    let tag = '';
    for (let j = i; j < Math.min(lines.length, i + 14); j++) {
      tag += lines[j] + '\n';
      if (/>\s*$/.test(lines[j])) break;
    }
    const anim = /(entering|exiting)=\{([^}]*)\}/.exec(tag);
    if (!anim || !MOVES.test(anim[2])) continue;
    for (const name of moving) {
      if (new RegExp(`[\\[,]\\s*${name}\\s*[\\],]`).test(tag)) {
        problems.push(
          `${f}:${i + 1}: view mang cả \`${anim[1]}={${anim[2].trim().slice(0, 34)}}\` lẫn style động \`${name}\` ` +
            '— hai bên cùng ghi transform mỗi khung hình, view sẽ rung',
        );
      }
    }
  }
}

if (problems.length) {
  console.log('tranh chấp hiệu ứng CÓ LỖI:\n');
  for (const p of [...new Set(problems)].slice(0, 10)) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'tranh chấp hiệu ứng OK — không view nào vừa mang một layout animation CÓ DỜI CHỖ vừa mang một ' +
    'useAnimatedStyle ghi transform. Hai thứ đó cùng chạy trên luồng UI và cùng ghi một thuộc tính của ' +
    'một view, nên đặt chung là rung mỗi khung hình cho tới khi hiệu ứng vào chạy xong — thứ mà mọi ' +
    'phép đo chiều cao đều báo sạch, và harness web thì mù hẳn vì nó không chạy layout animation',
);
