/**
 * Chữ mờ đi thì vẫn phải ĐỌC ĐƯỢC.
 *
 *     node tools/ink-alpha.mjs
 *
 * ── lỗi nó sinh ra để sửa, và ai tìm ra nó ──
 *
 * `day-plan.tsx` có một chủ ý đã ghi rõ và đúng: một giá trị VẪN ĐÚNG như kế
 * hoạch thì không cần hét, để mắt bắt được cái set người ta đã sửa. Nó thực
 * hiện chủ ý ấy bằng `color: alpha(m.ink, 0.28…0.40)` — và trả cho nó bằng
 * khả năng đọc:
 *
 *     chipTextDefault  α=0,35   2,20:1 sáng · 3,17:1 tối
 *     setNoDone        α=0,28   1,84    · 2,44
 *     fieldPlan        α=0,40   2,52    · 3,79   ← con số kg và reps
 *     unitPlan         α=0,30   1,94    · 2,63
 *     times            α=0,30   1,94    · 2,63
 *     icon Timer       α=0,30   1,94    · 2,63   (vật thể đồ hoạ, sàn 3,0)
 *
 * Cả sáu trượt ở cả hai diện mạo. Chủ dự án nhìn trên máy thật và nói "tự
 * nhiên các chữ bị mờ mà không có một lý do và không thể hiện đúng chủ đích" —
 * vế sau là chẩn đoán chính xác: chủ đích có thật, nhưng thứ hiện ra là chữ
 * hỏng chứ không phải chữ khiêm tốn.
 *
 * ── vì sao không luật nào có sẵn bắt được ──
 *
 *   `tools/text-color.mjs`  hỏi chữ CÓ màu không, không hỏi màu ấy đọc được không
 *   `tools/same-color.mjs`  hỏi chữ có TRÙNG nền không — 2,20:1 thì không trùng
 *   `tools/palette.mjs`     đo các TOKEN; `alpha(m.ink, 0.35)` không phải token
 *   `tsc`                   một chuỗi màu hợp lệ
 *
 * Bốn cửa, không cửa nào có thẩm quyền với một biểu thức alpha dựng tại chỗ.
 * Đó chính là chỗ hổng: **token thì được đo, biểu thức thì không.**
 *
 * ── vì sao luật này KHÔNG cần đoán bố cục ──
 *
 * `alpha(m.ink, x)` theo định nghĩa là "mực của theme phủ lên thứ đứng sau".
 * Trong app này thứ đứng sau chỉ có hai khả năng đáng kể — mặt thẻ hoặc nền
 * trang — nên luật composite trên CẢ HAI và lấy ca xấu nhất. Không phải suy
 * đoán cha nào chứa nó; đó là lý do luật này chặt được trong khi một luật
 * tổng quát về "fill vô hình" thì không (xem chú thích ở `planAllPill`).
 *
 * ── sàn ──
 *
 * 4,5:1 cho chữ (WCAG 1.4.3), 3,0:1 cho icon và nét (1.4.11). Ranh giới giữa
 * hai sàn là CHỖ VIẾT, không phải tên — xem chú thích ở chỗ phân loại bên dưới.
 *
 * Có một ngoại lệ hợp lệ và luật KHÔNG đụng tới: `alpha(m.ink, x)` làm NỀN
 * hoặc VIỀN. Một mặt nền mờ 6% là đúng việc nó phải làm; chỉ khi nó tô chữ
 * hoặc tô một dấu hiệu thì mới có sàn để mà trượt.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { NATIVE, hex, loadPalette, overC, ratio, toHex } from './lib/stack.mjs';
import { execFileSync } from 'node:child_process';

const { palettes, materials } = loadPalette();
const problems = [];

const TEXT_FLOOR = 4.5;
const GRAPHIC_FLOOR = 3.0;

/**
 * Sàn nào áp cho chỗ nào, và vì sao ranh giới là CHỖ VIẾT chứ không phải tên.
 *
 * Bản đầu đoán "là chữ hay không" bằng cách tìm `fontSize`/`type.` trong thân
 * style. Phép thử ngược bắt nó sai ngay: `fieldPlan` chỉ ghi đè `color`, còn
 * kiểu chữ nằm ở style `field` được spread cùng trong mảng — nên luật xếp con
 * số kg vào sàn ĐỒ HOẠ 3,0. Nó vẫn đỏ ở 2,52, nhưng một giá trị nằm giữa 3,0
 * và 4,5 sẽ lọt.
 *
 * Ranh giới đúng không cần đoán: React Native chỉ tôn trọng `color` trên chữ
 * (`Text`, `TextInput`) — một `View` tô nền bằng `backgroundColor`. Nên
 * **`color:` trong một style object ⇒ chữ ⇒ 4,5**, không có ngoại lệ cần đoán.
 * Còn `color={...}` ở prop là chỗ `<Icon>` và các thanh/nét nhận màu, nên nó
 * chịu sàn đồ hoạ 3,0.
 */

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'src'], {
  cwd: NATIVE, encoding: 'utf8',
}).split('\n').filter((f) => /\.tsx?$/.test(f));

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

let checked = 0;

for (const rel of files) {
  const src = strip(readFileSync(path.join(NATIVE, rel), 'utf8'));

  /* (a) trong một style object: `name: { … color: alpha(m.ink, x) … }` */
  for (const m of src.matchAll(/(\w+):\s*\{([^{}]*)\}/g)) {
    const [, name, body] = m;
    const hit = /color:\s*alpha\(m\.ink,\s*([\d.]+)\)/.exec(body);
    if (!hit) continue;
    judge(rel, `style \`${name}\``, Number(hit[1]), true, src.slice(0, m.index).split('\n').length);
  }

  /* (b) tại chỗ vẽ: `color={… alpha(m.ink, x) …}` trên một prop — icon, nét. */
  for (const m of src.matchAll(/color=\{[^}]*alpha\(m\.ink,\s*([\d.]+)\)/g)) {
    judge(rel, 'prop `color=`', Number(m[1]), false, src.slice(0, m.index).split('\n').length);
  }
}

function judge(rel, where, a, isText, line) {
  checked++;
  const floor = isText ? TEXT_FLOOR : GRAPHIC_FLOOR;
  for (const theme of ['light', 'dark']) {
    const p = palettes[theme];
    const ink = hex(materials[theme].ink);
    /* Hai nền đáng kể; ca xấu nhất quyết định. */
    for (const [gname, ground] of [['mặt thẻ', hex(p.card)], ['nền trang', hex(p.background)]]) {
      const c = overC(ink, ground, a);
      const r = ratio(c, ground);
      if (r >= floor) continue;
      problems.push(
        `${rel}:${line} ${where} tô ${isText ? 'CHỮ' : 'một dấu hiệu'} bằng \`alpha(m.ink, ${a})\` — ` +
          `trên ${gname} ${theme} ra ${toHex(c)}, chỉ ${r.toFixed(2)}:1, dưới sàn ${floor}. ` +
          'Mờ đi là một chủ ý hợp lệ, nhưng nó không được trả bằng khả năng đọc: ' +
          `\`mutedForeground\` lùi đúng một bậc mà vẫn ở ${ratio(hex(p.mutedForeground), ground).toFixed(2)}:1`,
      );
      return;
    }
  }
}

if (problems.length) {
  console.error('chữ mờ quá mức đọc được:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  `mực mờ OK — ${checked} chỗ dựng màu bằng \`alpha(m.ink, x)\` cho chữ hoặc dấu hiệu, mỗi chỗ được ` +
    'composite trên CẢ mặt thẻ lẫn nền trang, ở CẢ hai diện mạo, và lấy ca xấu nhất: chữ ≥4,5:1 ' +
    '(WCAG 1.4.3), dấu hiệu ≥3,0 (1.4.11). Đây là chỗ hổng giữa bốn luật màu đang có — `text-color` ' +
    'hỏi chữ có màu không, `same-color` hỏi có trùng nền không, `palette` chỉ đo TOKEN, còn một biểu ' +
    'thức alpha dựng tại chỗ thì không cửa nào có thẩm quyền. `alpha(m.ink, x)` làm NỀN hoặc VIỀN ' +
    'không bị đụng tới: một mặt nền mờ là đúng việc của nó',
);
