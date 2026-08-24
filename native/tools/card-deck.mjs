/**
 * That the stacked hero deck occludes, and does not steal the page's scroll.
 *
 * ── every rule here is something a screenshot caught ──
 *
 * **The stack did not hide anything.** `GlassCard` is translucent — that is the
 * app's whole surface language — so cards laid on top of each other were not on
 * top of anything: the activity rings and their numbers read straight through
 * the readiness card, two sets of text in the same place, unreadable. `tsc` was
 * clean and the geometry was right. Only the picture said so. A stacked card
 * needs an opaque backing or it is not a stack.
 *
 * **The edges did not separate.** In the reference the cards behind are other
 * colours and separate themselves. Here every card is the same dark surface, so
 * the lift has to be tall enough to read as a card rather than as a thicker
 * border, and the backing needs the hairline the rest of the app uses between
 * surfaces.
 *
 * **A slot that changes height moves the page under your thumb.** The whole of
 * `widget-heights.ts` exists because swapping a 100pt placeholder for a 208pt
 * gauge did that once. Two hero cards became one deck, so the skeleton has one
 * block to draw — and if it still drew two, the fix would have re-created the
 * exact bug it was written for. The deck's own measured height may only GROW,
 * for the same reason: a card that renders short for a frame while its data
 * lands would otherwise pull the deck up and drop everything below it.
 *
 * **A pan near the top of a long scroll must be earned.** Today is a tall
 * vertical page. A pan that took the gesture on the first pixel would swallow
 * every flick that happened to start on a card, so it has to travel sideways
 * first and give up if the finger goes vertical.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');
const DECK = 'src/components/ascnd/card-deck.tsx';
/* Comments stripped before anything is judged.

   The first run of this rule failed on its own documentation: the file explains
   why `pagingEnabled` is wrong for a peeking deck, and the rule found that
   sentence and reported the bug the sentence exists to prevent. Matching the
   spelling of a thing instead of the thing — the same mistake, for the fourth
   time in this repository, which is why it is now written into the helper
   rather than remembered. */
const code = (sql) =>
  sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/(^|\s)\/\/.*$/, '$1'))
    .join('\n');

const src = code(read(DECK));
const problems = [];

const num = (name) => {
  const m = src.match(new RegExp(`const ${name}\\s*=\\s*([0-9.]+)`));
  return m ? Number(m[1]) : null;
};

/* ── 1. the stack occludes ── */
{
  const card = src.match(/card:\s*\{([\s\S]*?)\n  \}/);
  if (!card) problems.push(`${DECK}: không tìm thấy style \`card\``);
  else {
    const body = card[1];
    if (!/backgroundColor:\s*colors\.card/.test(body)) {
      problems.push(
        `${DECK}: thẻ trong stack không có nền ĐỤC — GlassCard trong suốt, nên thẻ sau sẽ đọc ` +
          'xuyên qua thẻ trước. Ảnh chụp đã cho thấy hai lớp chữ chồng lên nhau, không đọc được',
      );
    }
    if (!/overflow:\s*'hidden'/.test(body) || !/borderRadius:/.test(body)) {
      problems.push(`${DECK}: nền đục không được bo + clip theo bán kính thẻ — góc vuông sẽ thò ra`);
    }
    if (!/borderWidth:/.test(body)) {
      problems.push(
        `${DECK}: nền không có hairline — hai mép xếp chồng cùng màu sẽ dính thành một viền dày`,
      );
    }
  }
  if (!/position:\s*'absolute'/.test(src)) {
    problems.push(`${DECK}: thẻ không xếp chồng (thiếu position: absolute) — đây là stack, không phải danh sách`);
  }
}

/* ── 2. depth reads, and stays cheap ── */
{
  const lift = num('LIFT');
  const behind = num('BEHIND');
  const shrink = num('SHRINK');
  if (lift === null || behind === null || shrink === null) {
    problems.push(`${DECK}: không đọc được LIFT/BEHIND/SHRINK`);
  } else {
    if (lift < 12) {
      problems.push(
        `${DECK}: LIFT = ${lift} — mọi thẻ ở đây cùng một màu tối, nên mép ló ra phải đủ cao để đọc ` +
          'ra là một THẺ chứ không phải một cái viền dày hơn (11 đã thử và ảnh nói là chưa đủ)',
      );
    }
    if (behind > 3) {
      problems.push(
        `${DECK}: BEHIND = ${behind} — mép thứ tư không thêm thông tin nào, mà mỗi thẻ phía sau là ` +
          'một thẻ THẬT đang được layout và vẽ',
      );
    }
    if (shrink <= 0) {
      problems.push(`${DECK}: SHRINK = ${shrink} — không thu nhỏ thì độ nâng đọc ra là danh sách, không phải chiều sâu`);
    }
  }
}

/* ── 3. the pan is earned, not taken ── */
{
  if (!/activeOffsetX/.test(src) || !/failOffsetY/.test(src)) {
    problems.push(
      `${DECK}: Pan thiếu activeOffsetX/failOffsetY — nó sẽ giành mọi cú vuốt bắt đầu trên thẻ, ` +
        'kể cả cú cuộn dọc của cả trang',
    );
  }
  const hys = num('HYSTERESIS');
  if (hys !== null && (hys < 8 || hys > 24)) {
    problems.push(`${DECK}: HYSTERESIS = ${hys} nằm ngoài khoảng dùng được (8–24)`);
  }
  const commit = num('COMMIT');
  if (commit !== null && (commit <= 0 || commit >= 1)) {
    problems.push(`${DECK}: COMMIT = ${commit} phải là một phần của bề rộng deck (0 < x < 1)`);
  }
}

/* ── 4. paint order comes from render order ──

   Animating z-index would be a layout property changing on every frame of every
   swipe, which is what `tools/motion.mjs` bans; the stack gets its order by
   drawing the last page first instead. */
{
  if (/zIndex/.test(src)) {
    problems.push(`${DECK}: dùng zIndex — thứ tự vẽ phải đến từ thứ tự render (.reverse()), không phải một thuộc tính layout đổi theo frame`);
  }
  if (!/\.reverse\(\)/.test(src)) {
    problems.push(`${DECK}: không đảo thứ tự render — trang 0 sẽ nằm DƯỚI cùng thay vì trên cùng`);
  }
}

/* ── 5. the measured height only grows ── */
{
  const grow = src.match(/measureH[\s\S]{0,240}/);
  if (!grow || !/next > prev/.test(grow[0])) {
    problems.push(
      `${DECK}: chiều cao deck không phải chỉ-tăng — một thẻ render ngắn một frame trong lúc dữ liệu ` +
        'về sẽ kéo cả deck lên và thả mọi thứ bên dưới xuống',
    );
  }
}

/* ── 3. the deck is what the skeleton draws ── */
{
  const skel = code(read('src/components/ascnd/skeleton.tsx'));
  if (/heroWidgets\.map\(/.test(skel)) {
    problems.push(
      'skeleton.tsx: vẫn vẽ MỘT KHỐI MỖI hero — chúng là một deck rồi, nên bóng của hai thẻ ' +
        'chồng nhau ở chỗ sắp hiện một deck chính là cú nhảy trang mà widget-heights.ts sinh ra để chặn',
    );
  }
  if (!/heightFor\(HERO_DECK\)/.test(skel)) {
    problems.push('skeleton.tsx: không dùng heightFor(HERO_DECK)');
  }

  const today = code(read('src/app/(tabs)/index.tsx'));
  if (!/<CardDeck>/.test(today)) {
    problems.push('index.tsx: khu hero không dùng <CardDeck> — các thẻ ring lại xếp chồng');
  }
  /* One recording for the slot. Recording each hero again would leave keys the
     skeleton no longer reads, and `use-widget-config.ts` is explicit about what
     a key nobody prunes costs. */
  const rec = [...today.matchAll(/recordHeight\(([^,]+),/g)].map((m) => m[1].trim());
  if (!rec.includes('HERO_DECK')) {
    problems.push('index.tsx: không ghi lại chiều cao của deck dưới HERO_DECK');
  }
  const heroInsideDeck = today.slice(today.indexOf('<CardDeck>'), today.indexOf('</CardDeck>'));
  if (/recordHeight\(key/.test(heroInsideDeck)) {
    problems.push('index.tsx: vẫn ghi chiều cao TỪNG hero bên trong deck — skeleton không đọc các khoá đó nữa');
  }
}

if (problems.length) {
  console.log('deck thẻ CÓ LỖI:\n');
  for (const p of problems.slice(0, 10)) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'deck thẻ OK — các thẻ ring ở đầu Today XẾP CHỒNG: mỗi thẻ có nền ĐỤC nên nó che được thẻ sau ' +
    '(GlassCard trong suốt, và ảnh chụp đã cho thấy hai lớp chữ đọc xuyên qua nhau khi thiếu nền ' +
    'này — tsc sạch, hình học đúng, chỉ tấm ảnh nói ra); mép ló đủ cao để đọc ra là một THẺ chứ ' +
    'không phải viền dày, có hairline để hai mép cùng màu không dính vào nhau, và chỉ 2 thẻ hiện ' +
    'phía sau vì mép thứ tư không thêm thông tin mà vẫn tốn một lần layout; Pan phải đi ngang mới ' +
    'giành quyền và bỏ cuộc nếu ngón tay đi dọc, nên nó không nuốt cú cuộn của cả trang; thứ tự vẽ ' +
    'đến từ thứ tự render chứ không phải zIndex đổi theo frame; chiều cao deck chỉ TĂNG, nên một ' +
    'thẻ render ngắn một frame không kéo cả trang lên; và skeleton vẽ MỘT khối cho cả deck — vẽ ' +
    'hai khối ở chỗ sắp hiện một deck chính là cú nhảy trang mà widget-heights.ts tồn tại để chặn. ' +
    'Không key mới trong WidgetKey, không migration',
);
