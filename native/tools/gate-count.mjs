/**
 * Cổng có bao nhiêu bước — và bốn trang tài liệu nói ra con số ấy.
 *
 *     node tools/gate-count.mjs
 *
 * ── lỗi nó sinh ra để sửa, và nó đã xảy ra HAI lần ──
 *
 * `docs/AUDIT_STATE.md` mở đầu bằng một câu tự nhận nhiệm vụ: *"Một trang, một
 * câu trả lời: hôm nay app đang đứng ở đâu. […] Ai mở repo lần đầu đọc trang
 * này trước."* Bảng đầu trang ấy ghi cổng chất lượng có **215** bước.
 *
 * Cổng có 241. Con số 215 đúng vào 2026-09-09; từ đó tới 2026-09-14 có 90
 * commit và 27 luật mới, và không có gì trong repo nối con số ở trang ấy với
 * con số thật.
 *
 * Đó là lần thứ hai. Lần đầu ghi ở chính `AUDIT_STATE.md`:
 *
 *   > Phần đầu `.github/workflows/quality-gate.yml` còn ghi *"211 bước"* […]
 *   > Cả hai nay sai (215 bước […]). Đã sửa cho khớp phép đo.
 *
 * Một lỗi được sửa bằng tay, rồi tái phát ở một tệp khác, là một lỗi chưa có
 * cửa. Đây là cửa.
 *
 * ── con số lấy ở đâu ──
 *
 * Từ chính `check.mjs`, qua `GATE_COUNT_ONLY=1`, in ra `STEPS.length` rồi thoát.
 * KHÔNG đếm lại bằng một bộ phân tích thứ hai: hai bộ đếm là hai thứ trôi khỏi
 * nhau, và cái trôi sẽ là cái không ai chạy. Cùng lý lẽ `stack.mjs` viết cho
 * việc mọi hằng phải được đọc ra khỏi nguồn chứ không gõ lại.
 *
 * ── vì sao là CHỐT chứ không phải quét cả tệp ──
 *
 * Trong hai trang này còn sáu chỗ khác nhắc một con số bước, và **cả sáu đều
 * đúng**: chúng là biên bản của một lượt đo đã xảy ra — *"runner chạy dưới
 * `runner`, và 215 bước xanh"*, *"cổng 215/215 xanh với SDK đã cài"*. Lịch sử
 * ghi đúng con số của lúc ấy là lịch sử đúng; sửa chúng thành 241 mới là làm
 * hỏng tài liệu.
 *
 * Nên luật này không hỏi "mọi số đứng trước chữ *bước* có bằng 241 không" —
 * hỏi thế là kêu oan sáu lần, và `rep-unit.mjs` đã ghi lại cái giá của một luật
 * kêu oan: nó bị tắt. Luật chốt đúng những câu nói ở THÌ HIỆN TẠI, mỗi câu một
 * cái neo, và khi câu ấy được viết lại thì luật tự khai đã mất mục tiêu.
 *
 * ── vùng mù, nói thẳng ──
 *
 * Một câu hiện tại MỚI, viết ở một trang chưa chốt, thì luật này không thấy.
 * Không có cách nào phân biệt tự động "biên bản" với "hiện trạng" trong văn
 * xuôi tiếng Việt, nên chỗ ấy vẫn là việc của người đọc. Cái luật này bảo đảm
 * là bốn câu ĐANG có sẽ không âm thầm cũ đi lần thứ ba.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { NATIVE } from './lib/stack.mjs';

const problems = [];

/*
  Hỏi chính cổng. Nếu cửa `GATE_COUNT_ONLY` biến mất thì đây hỏng, và đó đúng là
  điều phải xảy ra: không có nguồn thì không có luật.

  `timeout` không phải phòng xa. Phép thử ngược đã đo nó: gỡ cửa ấy đi thì
  `check.mjs` không in một con số rồi thoát nữa — nó chạy **cả 244 bước** ngay
  bên trong luật này, tức một bước của cổng lặng lẽ chạy trọn cổng, mất nhiều
  phút, rồi mới hỏng vì đọc ra một chữ không phải số. Hai mươi giây là thừa thãi
  cho một tiến trình chỉ phải in `STEPS.length`, và thiếu xa bước đầu tiên của
  cổng thật.
*/
let steps;
try {
  const out = execFileSync('node', ['tools/check.mjs'], {
    cwd: NATIVE,
    env: { ...process.env, GATE_COUNT_ONLY: '1' },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 20_000,
  }).trim();
  steps = Number(out);
  if (!Number.isInteger(steps) || steps <= 0) throw new Error(`đọc ra "${out}"`);
} catch (e) {
  console.error('không hỏi được số bước của cổng:');
  console.error(
    `  ✗ \`GATE_COUNT_ONLY=1 node tools/check.mjs\` phải in ra \`STEPS.length\` rồi thoát 0 — ${e.message}. ` +
      'Cửa ấy là nguồn DUY NHẤT của luật này; đếm lại bằng một bộ phân tích thứ hai là dựng một con số ' +
      'thứ hai để trôi',
  );
  process.exit(1);
}

/**
 * Những câu nói ở THÌ HIỆN TẠI về kích thước cổng.
 *
 * `anchor` là đoạn chữ đặc trưng của chỗ ấy — mất nó nghĩa là câu đã được viết
 * lại và cái chốt cần đọc lại bằng mắt. `grab` phải khớp **đúng một lần** trong
 * tệp; khớp nhiều lần nghĩa là cái neo đã hết đặc trưng, và một cái neo không
 * đặc trưng thì không phải một cái neo.
 */
const PINS = [
  {
    rel: 'docs/AUDIT_STATE.md',
    what: 'hàng cổng trong bảng "Cổng chất lượng" đầu trang',
    anchor: '| `node tools/check.mjs` | **XANH** |',
    grab: /exit 0, \*\*(\d+)\*\* bước/,
    why: 'đây là dòng người mở repo lần đầu đọc, và là chỗ đã sai 215/241',
  },
  {
    rel: 'docs/AUDIT_STATE.md',
    what: 'hàng "Đổi theme, 9 màn"',
    anchor: '`tools/theme-shape.mjs`',
    grab: /nó nằm trong (\d+) bước/,
    why: 'nó khẳng định một luật NẰM TRONG cổng hôm nay, nên nó nói về cổng hôm nay',
  },
  {
    rel: 'docs/AUDIT_STATE.md',
    what: 'hàng "Nút lồng trong nút"',
    anchor: '`tools/a11y-swallow.mjs`',
    grab: /nằm trong (\d+) bước và vẫn xanh/,
    why: 'cùng dạng khẳng định hiện tại với hàng trên',
  },
  {
    rel: 'docs/AUDIT_STATE.md',
    what: 'hàng ESLint — câu chỉ sang cổng thật',
    anchor: 'Cổng thật là',
    grab: /Cổng thật là (\d+) bước/,
    why: 'câu này tồn tại để người đọc ĐỪNG tin mã thoát 0 của `expo lint`; nó chỉ sang cổng thật, '
      + 'nên nó phải chỉ đúng cổng thật',
  },
  {
    rel: 'docs/AUDIT_STATE.md',
    what: 'phép đo của vòng rà 09/14',
    anchor: 'RÀ PHÁP Y',
    grab: /\*\*(\d+)\/(\d+) xanh\*\*/,
    why: 'đây là biên bản của vòng gần nhất, và vòng gần nhất là hiện tại cho tới khi có vòng sau',
  },
  {
    rel: 'docs/QA-MAY-THAT.md',
    what: 'câu mở đầu — lý do trang kiểm máy thật tồn tại',
    anchor: 'Trang này tồn tại vì một lý do hẹp',
    grab: /\*\*(\d+) bước kiểm tự động/,
    why: 'cả trang dựng trên câu "ngần này bước tự động vẫn KHÔNG chứng minh được app dùng được trên '
      + 'iPhone" — con số ấy là vế mạnh của lập luận',
  },
];

const seen = [];
for (const pin of PINS) {
  const src = readFileSync(path.join(NATIVE, pin.rel), 'utf8');
  if (!src.includes(pin.anchor)) {
    problems.push(
      `${pin.rel}: không còn thấy \`${pin.anchor}\` — ${pin.what} đã được viết lại, nên cái chốt này `
        + 'đang canh một câu không tồn tại. Đọc lại chỗ ấy bằng mắt rồi sửa luật, đừng để nó xanh suông',
    );
    continue;
  }
  const all = [...src.matchAll(new RegExp(pin.grab, 'g'))];
  if (all.length === 0) {
    problems.push(
      `${pin.rel}: ${pin.what} còn đó nhưng không còn khớp \`${pin.grab.source}\` — câu đã đổi cách viết `
        + 'con số. Một khẳng định không chốt được chính là thứ sẽ trôi',
    );
    continue;
  }
  if (all.length > 1) {
    problems.push(
      `${pin.rel}: \`${pin.grab.source}\` khớp ${all.length} chỗ — cái neo đã hết đặc trưng, nên luật `
        + 'không còn biết nó đang canh câu nào. Thu hẹp mẫu lại',
    );
    continue;
  }
  const nums = all[0].slice(1).map(Number);
  for (const n of nums) {
    if (n === steps) continue;
    problems.push(
      `${pin.rel}: ${pin.what} ghi **${n}** bước, cổng có **${steps}**. ${pin.why}. Con số bên phải đọc `
        + 'thẳng từ `STEPS.length` của `check.mjs`, nên nó không phải một ước lượng — sửa trang, đừng sửa luật',
    );
  }
  seen.push(`${pin.rel.replace('docs/', '')}:${nums.join('/')}`);
}

if (problems.length) {
  console.error('tài liệu nói sai cổng có bao nhiêu bước:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  `số bước trong tài liệu OK — cổng có ${steps} bước, hỏi thẳng \`STEPS.length\` qua `
    + `\`GATE_COUNT_ONLY=1\` chứ không đếm lại, và ${PINS.length} câu nói ở thì hiện tại đều khớp `
    + `(${seen.join(' · ')}). Lỗi này đã xảy ra hai lần — \`quality-gate.yml\` ghi 211 khi cổng đã 215, `
    + 'rồi bảng đầu `AUDIT_STATE.md` ghi 215 khi cổng đã 241 — và cả hai lần đều được sửa bằng tay, tức '
    + 'chưa lần nào được sửa. Đây là một CÁI CHỐT chứ không phải một định luật: sáu chỗ khác trong hai '
    + 'trang này cũng nhắc số bước và cả sáu đều ĐÚNG, vì chúng là biên bản của một lượt đo đã xảy ra. '
    + 'Một luật quét cả tệp sẽ kêu oan sáu lần, và một luật kêu oan là một luật bị tắt. Vùng mù: một câu '
    + 'hiện tại MỚI ở một trang chưa chốt thì luật này không thấy',
);
