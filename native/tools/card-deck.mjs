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

/* ── 1b. trang không được vay chiều cao của sân khấu ──

   Đặt cả `top` lẫn `bottom` trên trang làm chiều cao trang lấy từ sân khấu,
   trong khi chiều cao sân khấu lại đo từ nội dung trang. Vòng lặp chết: sân
   khấu 0 → trang 0 → đo ra 0 → sân khấu vẫn 0. Trên máy thật nó ra một khoảng
   trống với mấy cái pip nằm dưới, và tsc sạch, và bộ chạy web báo OK vì màn
   không TRẮNG — nó chỉ rỗng ở đúng một chỗ.

   Các trang bằng nhau vì chúng dùng chung một vỏ (`hero-panel.tsx`), không vì
   một ràng buộc bố cục. */
{
  const page = src.match(/page:\s*\{([^}]*)\}/);
  if (page && /\bbottom:/.test(page[1])) {
    problems.push(
      `${DECK}: style \`page\` đặt bottom cùng với top — chiều cao trang sẽ lấy từ sân khấu, mà sân ` +
        'khấu lại đo từ trang. Deck sẽ không vẽ ra gì. Các trang bằng nhau nhờ hero-panel.tsx',
    );
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
  /* Cho phép xuống dòng giữa thẻ và thuộc tính.

     Luật này khớp `<CardDeck progress={deckAt}` nguyên văn, nên nó đỏ ngay khi
     lời gọi được xuống dòng cho dễ đọc — một thay đổi không chạm tới hành vi.
     Lần thứ mười một trong repo này. */
  if (!/<CardDeck[\s\S]{0,200}?progress=\{deckAt\}/.test(today)) {
    problems.push('index.tsx: không truyền deckAt vào CardDeck — nền sẽ đứng yên khi vuốt');
  }
  const auraBlock = today.slice(today.indexOf('heroTints.length > 1'), today.indexOf('heroTints.length > 1') + 400);
  if (!/AuraLayer[\s\S]*at=\{deckAt\}/.test(auraBlock)) {
    problems.push('index.tsx: lớp nền không đọc deckAt — màu sẽ NHẢY khi cú vuốt dừng thay vì bám ngón tay');
  }
}

/* ── 3. ngưỡng của pan ──

   Luật "pan phải có failOffsetY" từng ở đây và đã bị GỠ, không phải nới lỏng.

   Nó ra đời để deck không cướp cú cuộn dọc của cả trang. Nhưng nhường cú dọc
   chính là thứ làm "vuốt sang thẻ" và "cuộn trang" tranh nhau cùng một cử chỉ,
   và một cú vuốt ngang của người thật thì luôn võng xuống — nên deck bây giờ
   NUỐT cả cú dọc khi đang thu lại, có chủ ý. Thông điệp cũ của luật này mô tả
   đúng hành vi hiện tại, chỉ là nó gọi đó là lỗi.

   Nửa an toàn thì vẫn còn và đã chuyển sang `hero-scroll.mjs`: khoá chỉ được áp
   khi thu lại, `enabled(!locked)` phải trả mọi cử chỉ về ScrollView khi chi
   tiết mở. Một bất biến, một chỗ canh — hai chỗ canh cùng một thứ là hai chỗ sẽ
   bất đồng, và lần này chúng đã bất đồng thật.
*/
{
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

/*
  Handler đo đạc phải ỔN ĐỊNH.

  `onLayout={measure(i)}` — một factory gọi ngay trong JSX — sinh một hàm khác ở
  mỗi lần render. React thấy prop đổi nên gắn lại handler và React Native phát
  lại `onLayout`; ghép với một `setState` ghi chính chiều cao vừa đo, đó là một
  đường phản hồi render → đo → render.

  Trên máy nó đọc ra là thanh ring giật khi vuốt, và Koa với các nút ghi không
  kịp hiện ra vì hiệu ứng vào của chúng bị bắt đầu lại ở mỗi khung hình.

  Luật đọc HÀNH VI chứ không đọc chữ: mọi handler `onLayout` trong tệp này phải
  là một tên đã qua `useCallback`, không phải lời gọi hàm và không phải closure
  viết thẳng tại chỗ.
*/
{
  const inline = [...src.matchAll(/onLayout=\{(\(|[a-zA-Z_$][\w$]*\()/g)];
  if (inline.length) {
    problems.push(
      `card-deck.tsx: ${inline.length} handler onLayout tạo mới tại chỗ — mỗi render một danh tính khác, đó là đường phản hồi layout`,
    );
  }
  for (const m of src.matchAll(/onLayout=\{([a-zA-Z_$][\w$]*)\}/g)) {
    const name = m[1];
    if (!new RegExp(`const ${name} = useCallback\\(`).test(src)) {
      problems.push(`card-deck.tsx: onLayout={${name}} nhưng ${name} không qua useCallback — danh tính đổi mỗi render`);
    }
  }
}

/*
  Không lớp mờ nào được có mép NGANG bên trong deck.

  ── lỗi ──

  Deck từng mang một `TRAIL`: dải blur cao 72 điểm vẽ giữa sân khấu và hàng
  chấm, sinh ra để nối dài KÍNH CỦA THẺ xuống dưới mép thẻ rồi tắt dần. Mask của
  nó chạy từ độ đục 1 ở mép TRÊN xuống 0 ở đáy — nghĩa là mép trên nó là một
  đường ngang đầy đủ cường độ vắt qua màn hình.

  Rồi kính của thẻ bị bỏ đi ("hero không được phép có mép — nó là phần trên cùng
  của trang, không phải một tấm đặt lên trang"). Dải nối đuôi thì ở lại, và mép
  trên đầy đủ cường độ của nó từ đó đâm thẳng vào nền trần. Chú thích của chính
  nó vẫn nói "cùng cường độ với kính của trang" — với một tấm kính không còn tồn
  tại.

  ── vì sao luật này cần thiết ──

  Nó nằm sau `Platform.OS === 'ios'`, nên harness web KHÔNG BAO GIỜ vẽ nó. Mọi
  phép quét điểm ảnh chạy trên harness đều báo "không có vết cắt" trong khi trên
  máy thật vết cắt vẫn ở đó — công cụ mù đúng cái thứ đang bị báo lỗi, và lỗi
  này vì thế sống sót qua nhiều vòng sửa.

  Luật đọc CẤU TRÚC chứ không đọc điểm ảnh: trong deck không được có lớp phủ nào
  neo bằng `top:` một chiều cao đo được. Một lớp như thế bắt đầu ở một hàng xác
  định, và một hàng xác định là một đường kẻ.
*/
{
  if (/\btop: shown\b/.test(src)) {
    problems.push(
      'card-deck.tsx: có lớp phủ neo tại `top: shown` — nó bắt đầu ở một hàng xác định, và đó là một đường kẻ ngang dưới vòng tròn',
    );
  }
  for (const tag of ['BlurView', 'MaskedView']) {
    if (new RegExp(`<${tag}\\b`).test(src)) {
      problems.push(`card-deck.tsx: deck lại dựng <${tag}> — hero không có thẻ, nên không có kính nào để nối đuôi`);
    }
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
    'vuốt dừng; Pan phải đi ngang mới giành quyền và bỏ cuộc nếu ngón tay đi dọc; chiều cao là ' +
    'của ĐÚNG trang đang xem chứ không phải trang cao nhất; handler đo đạc ổn định qua useCallback ' +
    'nên không có đường phản hồi render→đo→render; và skeleton vẽ MỘT khối cho cả deck, đúng chỗ ' +
    'deck sắp hiện ra',
);
