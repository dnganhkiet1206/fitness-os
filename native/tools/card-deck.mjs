/**
 * That the deck's pages stay separate, and that the page's colour comes with
 * them.
 *
 * ── the measurement that decided the design ──
 *
 * This was a stack: cards layered, each hiding the ones behind, which meant
 * every card needed an opaque backing. Once the deck moved to the top of Today
 * with the readiness aura behind it, that backing covered the aura. Measured on
 * the shipped build: the day's colour survived in a 55px strip above the card,
 * and from y=150 down the page read `rgb(44,44,46)` — flat grey, R−B = −2, on
 * an amber day.
 *
 * An opaque card and a coloured page are exclusive. So the pages are separate
 * now, side by side and clipped: nothing has to hide anything, so nothing has
 * to be opaque, so the colour reaches the glass. The rules below are what keeps
 * that true.
 *
 * ── and the colour has to follow the finger ──
 *
 * `progress` is owned by Today, not by the deck, so the background can be
 * cross-faded from the same value that moves the pages. An `onPage` callback
 * would change the colour after the swipe SETTLED, and a background that
 * catches up is worse than one that never moved.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');
const DECK = 'src/components/ascnd/card-deck.tsx';

/* Comments stripped before anything is judged.

   The first run of an earlier version of this rule failed on its own
   documentation: the file explained why a mechanism was wrong, and the rule
   found that sentence and reported the bug the sentence exists to prevent.
   Matching the spelling of a thing instead of the thing — the same mistake, for
   the fourth time in this repository, which is why it lives in the helper
   rather than in someone's memory. */
const code = (t) =>
  t
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

/* ── 1. pages are separated by CLIPPING, not by paint ── */
{
  const stage = src.match(/stage:\s*\{([^}]*)\}/);
  if (!stage || !/overflow:\s*'hidden'/.test(stage[1])) {
    problems.push(
      `${DECK}: sân khấu không clip — trang kế bên nằm cách một bề rộng sẽ tràn ra ngoài thay vì ` +
        'bị cắt, và khi đó trang này lại phải TÔ ĐÈ lên trang kia',
    );
  }
  if (/backgroundColor:\s*colors\.card/.test(src)) {
    problems.push(
      `${DECK}: thẻ có nền ĐỤC — đã đo trên bản ship: nó phủ mất lớp aura, trang đọc ra ` +
        'rgb(44,44,46) từ y=150 xuống, R−B = −2 trong một ngày hổ phách. Thẻ đục và nền có màu ' +
        'là hai thứ loại trừ nhau',
    );
  }
  if (!/position:\s*'absolute'/.test(src)) {
    problems.push(`${DECK}: trang không xếp tuyệt đối — chúng sẽ nằm nối tiếp nhau theo chiều dọc`);
  }
}

/* ── 2. màu nền chạy theo cùng một giá trị với các trang ── */
{
  if (!/progress\?:\s*SharedValue<number>/.test(src)) {
    problems.push(`${DECK}: không nhận \`progress\` từ bên ngoài — không gì khác có thể chạy theo cú vuốt`);
  }
  if (!/const at = progress \?\? own/.test(src)) {
    problems.push(`${DECK}: không dùng giá trị được truyền vào — deck và nền sẽ đi theo hai con số khác nhau`);
  }
  const today = code(read('src/app/(tabs)/index.tsx'));
  if (!/<CardDeck progress=\{deckAt\}/.test(today)) {
    problems.push('index.tsx: không truyền deckAt vào CardDeck — nền sẽ đứng yên khi vuốt');
  }
  const auraBlock = today.slice(today.indexOf('heroTints.length > 1'), today.indexOf('heroTints.length > 1') + 400);
  if (!/AuraLayer[\s\S]*at=\{deckAt\}/.test(auraBlock)) {
    problems.push('index.tsx: lớp nền không đọc deckAt — màu sẽ NHẢY khi cú vuốt dừng thay vì bám ngón tay');
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

/* ── 4. no animated layout property ── */
{
  if (/zIndex/.test(src)) {
    problems.push(`${DECK}: dùng zIndex — các trang không chồng nhau nữa nên không cần, và nó là thuộc tính layout`);
  }
}

/* ── 5. chiều cao đo THEO TỪNG TRANG ──

   Luật cũ ở đây đòi chiều cao chỉ-tăng, và nó đúng chừng nào chiều cao một
   trang là cố định: một thẻ render ngắn một frame trong lúc dữ liệu về sẽ kéo
   cả deck lên và thả mọi thứ bên dưới xuống.

   Rồi các trang biết bung ra. Bấm mũi tên là mở một khối chỉ số phụ, và một
   `max` không bao giờ đi xuống nghĩa là ĐÓNG nó lại để deck đứng nguyên ở chiều
   cao đã mở suốt phiên — một khoảng trống cao bằng cả trang dưới vòng tròn mà
   không gì lấp vào.

   Giữ chiều cao của TỪNG trang rồi lấy max của các giá trị hiện tại thì được cả
   hai: deck theo được một lần bung thật ở cả hai chiều, và một trang tạm báo
   ngắn không kéo được deck xuống dưới một trang khác đang cao. */
{
  if (!/setHeights|const \[heights/.test(src)) {
    problems.push(
      `${DECK}: chiều cao không đo theo từng trang — nếu giữ một con số max chung thì đóng phần chi ` +
        'tiết lại sẽ để deck đứng nguyên ở chiều cao đã mở, chừa một khoảng trống không gì lấp vào',
    );
  }
  if (!/Math\.max\(/.test(src)) {
    problems.push(`${DECK}: không lấy max các chiều cao — trang cao hơn sẽ bị cắt`);
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
  if (!/<CardDeck[\s>]/.test(today)) {
    problems.push('index.tsx: khu hero không dùng <CardDeck> — các thẻ ring lại xếp chồng');
  }
  /* One recording for the slot. Recording each hero again would leave keys the
     skeleton no longer reads, and `use-widget-config.ts` is explicit about what
     a key nobody prunes costs. */
  const rec = [...today.matchAll(/recordHeight\(([^,]+),/g)].map((m) => m[1].trim());
  if (!rec.includes('HERO_DECK')) {
    problems.push('index.tsx: không ghi lại chiều cao của deck dưới HERO_DECK');
  }
  const heroInsideDeck = today.slice(today.indexOf('<CardDeck'), today.indexOf('</CardDeck>'));
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
  'deck thẻ OK — các trang ring TÁCH RỜI: xếp tuyệt đối cạnh nhau và bị CLIP, nên không trang nào ' +
    'phải tô đè lên trang nào và không trang nào cần nền đục. Đó là điều kiện để lớp aura đọc được ' +
    'qua kính — bản stack trước đó đã đo: màu của ngày chỉ sống trong một dải 55px, từ y=150 xuống ' +
    'trang là rgb(44,44,46), R−B = −2 giữa một ngày hổ phách. Màu nền chạy theo CÙNG shared value ' +
    'với các trang (Today sở hữu nó, deck nhận vào), nên nền bám ngón tay chứ không nhảy khi cú ' +
    'vuốt dừng; Pan phải đi ngang mới giành quyền và bỏ cuộc nếu ngón tay đi dọc; chiều cao chỉ ' +
    'TĂNG; và skeleton vẽ MỘT khối cho cả deck, đúng chỗ deck sắp hiện ra',
);
