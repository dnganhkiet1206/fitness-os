/**
 * That the hero deck says it can be swiped, and lands where it should.
 *
 * ── the two failures this is built around ──
 *
 * **A gesture nobody can see is a feature nobody has.** This screen has been
 * corrected on that twice already in its own comments — `today-meals.tsx`
 * refusing a swipe because "both are invisible until guessed", and the progress
 * strip on the routine card being rebuilt because a small outlined badge "read
 * as a huy hiệu" rather than a control. A deck whose pages fill the whole width
 * is a card that happens to be swipeable, which on a phone is a card that is
 * not. The sliver of the next card is what says otherwise; the pips alone
 * cannot, because a row of dots reads as decoration until something moves.
 *
 * **A slot that changes height moves the page under your thumb.** The whole of
 * `widget-heights.ts` exists because swapping a 100pt placeholder for a 208pt
 * gauge did that once. Two hero cards became one deck, so the skeleton has one
 * block to draw — and if it still drew two, the fix would have re-created the
 * exact bug it was written for.
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

/* ── 1. the next card shows, and the snap accounts for it ── */
{
  const num = (name) => {
    const m = src.match(new RegExp(`const ${name}\\s*=\\s*(\\d+)`));
    return m ? Number(m[1]) : null;
  };
  const peek = num('PEEK');
  const gap = num('GAP');
  if (peek === null || gap === null) {
    problems.push(`${DECK}: không đọc được PEEK/GAP`);
  } else {
    if (peek <= 0) {
      problems.push(
        `${DECK}: PEEK = ${peek} — trang rộng bằng cả deck thì không thấy thẻ kế bên, ` +
          'và thứ duy nhất nói rằng vuốt được là chính cái mẩu thẻ đó',
      );
    }
    if (peek < 12) {
      problems.push(`${DECK}: PEEK = ${peek} quá mỏng để đọc ra là một thẻ khác chứ không phải viền`);
    }
  }
  /* The width the finger travels per page must be the page plus the gap. Snap
     on the page alone and every card lands one gap further left than the last —
     a drift that looks fine on page two and broken on page five. */
  if (!/const step = pageW \+ GAP;/.test(src)) {
    problems.push(`${DECK}: bước snap không phải pageW + GAP — trang sau sẽ lệch dần mỗi lần vuốt`);
  }
  if (!/snapToInterval=\{step/.test(src)) {
    problems.push(`${DECK}: ScrollView không dùng snapToInterval={step}`);
  }
  if (/pagingEnabled/.test(src)) {
    problems.push(
      `${DECK}: dùng pagingEnabled — nó snap đúng bằng bề rộng ScrollView, tức là bề rộng ` +
        'DUY NHẤT không dùng được ở đây, vì phần chênh chính là chỗ thẻ kế bên hiện ra',
    );
  }
}

/* ── 2. the pips follow the finger ──

   An indicator driven by a settled page index reports the OUTCOME of a gesture;
   one driven by the offset reports the gesture. `swipe-row.tsx` made the same
   call and wrote down why — only the second reads as direct manipulation. */
{
  if (!/useAnimatedScrollHandler/.test(src)) {
    problems.push(`${DECK}: không có useAnimatedScrollHandler — pip sẽ chạy theo trạng thái, trễ hơn ngón tay`);
  }
  const pip = src.slice(src.indexOf('function Pip'));
  if (!/x\.value/.test(pip)) {
    problems.push(`${DECK}: Pip không đọc x.value — nó đang chờ trang dừng lại rồi mới đổi`);
  }
  if (/useState[^\n]*page|setPage\(/.test(src)) {
    problems.push(`${DECK}: có state trang — pip phải suy ra từ offset, không phải từ một chỉ số đã chốt`);
  }
}

/* ── 3b. a short page fills its slot ──

   The deck is as tall as its tallest page, so every other page has slack. Left
   top-aligned, the shorter card ends partway down and the rest is background —
   measured on the shipped build at 150pt of black between the activity card and
   the pips, which reads as a card that failed rather than a card that is
   shorter. The page has to fill the slot and centre what it holds. */
{
  const page = src.match(/page:\s*\{([^}]*)\}/);
  if (!page) problems.push(`${DECK}: không tìm thấy style \`page\``);
  else {
    if (/alignSelf:\s*'flex-start'/.test(page[1])) {
      problems.push(
        `${DECK}: page căn trên trong một ô cao bằng trang CAO NHẤT — trang ngắn hơn sẽ kết thúc ` +
          'giữa chừng và để lại một mảng nền bên dưới, đọc ra như thẻ hỏng chứ không phải thẻ ngắn',
      );
    }
    if (!/justifyContent:\s*'center'/.test(page[1])) {
      problems.push(`${DECK}: page không căn giữa nội dung theo chiều dọc — phần dôi ra sẽ dồn về một phía`);
    }
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
  'deck thẻ OK — các thẻ ring ở đầu Today gom vào MỘT ô vuốt ngang: trang hẹp hơn deck nên thẻ ' +
    'kế bên luôn ló ra (thứ duy nhất nói rằng vuốt được — một hàng chấm thì đọc ra là trang trí), ' +
    'bước snap tính cả khoảng cách nên trang không lệch dần, không dùng pagingEnabled vốn snap ' +
    'đúng bề rộng không dùng được ở đây, pip chạy theo OFFSET nên bám ngón tay chứ không đợi trang ' +
    'dừng, và skeleton vẽ MỘT khối cho cả deck — vẽ hai khối ở chỗ sắp hiện một deck chính là cú ' +
    'nhảy trang mà widget-heights.ts tồn tại để chặn. Không key mới trong WidgetKey, không migration',
);
