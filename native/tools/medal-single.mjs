/**
 * Huy chương chỉ được vẽ ở MỘT chỗ.
 *
 * ── lỗi nó bắt ──
 *
 * Màn `/awards` được vẽ lại toàn bộ: đĩa kim loại bốn lớp, dáng riêng cho từng
 * miền, con số dập lên mặt. Thẻ "Huy chương gần đây" trên Hôm nay thì KHÔNG —
 * nó giữ bảng icon riêng (tám cái, trong khi danh mục có hai mươi chín), bảng
 * màu hạng riêng, và vẽ một ô bo góc viền mảnh với một icon lucide bên trong.
 *
 * Nên bản thiết kế mới chưa bao giờ tới được cái thẻ mà đa số người dùng nhìn
 * thấy TRƯỚC. Người dùng gửi ảnh và nói đúng một câu: "thẻ này chưa hiện đúng
 * với huy chương đã được thiết kế lại".
 *
 * ── vì sao không cửa nào bắt được ──
 *
 * `tsc` xanh: hai bản vẽ đều là JSX hợp lệ.
 * Guard xanh: không luật nào nói "chỉ được có một bản vẽ huy chương".
 * Ảnh chụp: bắt được, nhưng chỉ khi có người mở HAI màn và so — và trong phiên
 * này người ấy là người dùng, không phải tôi.
 *
 * Cùng họ với `GROUP_ICONS` đi vòng qua `icon-tint.ts`, và với `AWARD_ICON` cũ:
 * một bảng tra được chép ra rồi thôi được cập nhật.
 *
 * ── luật này là CẤU TRÚC, và đó là đúng tầng ──
 *
 * Repo này chuộng luật CHẠY hơn luật dò chữ, vì dò chữ cho xanh giả. Nhưng lỗi
 * ở đây không phải một phép tính sai — nó là "tồn tại một bản vẽ thứ hai". Đó
 * là một sự thật về cấu trúc tệp, nên đo nó bằng cấu trúc tệp là đo đúng thứ.
 * Không có phép chạy nào phát hiện được một bản sao mà chính nó không biết là
 * có tồn tại.
 */
import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME = 'src/components/ascnd/medal.tsx';

const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const files = globSync('src/**/*.{ts,tsx}', { cwd: NATIVE }).sort();
const problems = [];

/* ── 1. Bảng kim loại theo hạng chỉ được có MỘT ────────────────────────── */
/*
  Dấu vân tay là bốn tên hạng cùng làm KHOÁ trong một khối, VÀ khối ấy chứa màu.

  Tên hạng thì không dò đủ: `koa-event.ts` có `TIER_MAGNITUDE` — bốn hạng ánh
  sang bốn con số, "ăn mừng to cỡ nào" — và đó là một khái niệm khác hẳn, không
  phải một bản vẽ huy chương thứ hai. Bản đầu của luật này báo đỏ đúng nó.

  Còn hex thì không dò một mình: người chép tiếp theo rất có thể đổi màu, nhưng
  không ai đổi được tên hạng — chúng là giá trị nằm trong cơ sở dữ liệu. Phải
  có CẢ HAI mới là bảng kim loại.

  Khối cho phép lồng MỘT cấp, vì mỗi hạng nay là một object bốn tông. Bản đầu
  dùng `[^{}]*` nên nó không thấy chính `TIER_CONFIG` — luật báo "medal.tsx
  không còn khai bảng kim loại", tức nó đang canh một tệp mà nó không đọc nổi.
*/
const TIERS = ['bronze', 'silver', 'gold', 'platinum'];
const HAS_COLOR = /#[0-9a-fA-F]{3,8}\b|rgba?\(/;
const metalMaps = [];
for (const rel of files) {
  const src = strip(readFileSync(path.join(NATIVE, rel), 'utf8'));
  for (const m of src.matchAll(/\{(?:[^{}]|\{[^{}]*\})*\}/g)) {
    const body = m[0];
    if (!HAS_COLOR.test(body)) continue;
    if (TIERS.every((t) => new RegExp(`(^|[\\s,{])${t}\\s*:`).test(body))) {
      metalMaps.push(rel);
      break;
    }
  }
}
const strays = metalMaps.filter((f) => f !== HOME);
if (strays.length) {
  problems.push(
    `bảng màu/kim loại theo hạng xuất hiện ngoài ${HOME}: ${strays.join(', ')} — ` +
      'hai bảng hạng là hai bản thiết kế huy chương, và bản thứ hai sẽ tụt lại sau bản thứ nhất ' +
      'ở lần đầu ai đó sửa một bên',
  );
}
if (!metalMaps.includes(HOME)) {
  problems.push(`${HOME} không còn khai bảng kim loại theo hạng — luật 1 đang không kiểm gì`);
}

/* ── 2. Ai vẽ huy chương thì phải dùng <Medal> ─────────────────────────── */
/*
  "Vẽ huy chương" = một tệp .tsx đọc `award_key` hoặc danh mục `AWARD_DEFINITIONS`
  VÀ trả về JSX. Chính `medal.tsx` được miễn: nó LÀ bản vẽ.
*/
const drawers = [];
for (const rel of files) {
  if (!rel.endsWith('.tsx') || rel === HOME) continue;
  const raw = readFileSync(path.join(NATIVE, rel), 'utf8');
  const src = strip(raw);
  if (!/\baward_key\b|\bAWARD_DEFINITIONS\b/.test(src)) continue;
  if (!/return\s*\(?\s*</.test(src)) continue;
  drawers.push(rel);
  if (!/from '@\/components\/ascnd\/medal'/.test(src)) {
    problems.push(
      `${rel}: bày huy chương ra màn hình nhưng KHÔNG nhập từ ${HOME} — nó đang tự vẽ một bản ` +
        'thứ hai, đúng thứ đã khiến thẻ "Huy chương gần đây" bỏ lỡ cả bản thiết kế mới',
    );
    continue;
  }
  if (!/<Medal[\s\n]/.test(src)) {
    problems.push(
      `${rel}: có nhập từ ${HOME} nhưng không dựng <Medal> — nhập một bảng tra rồi vẫn tự vẽ đĩa ` +
        'là đúng nửa vời đã sinh ra lỗi này',
    );
  }
}
/*
  Ba, không phải hai.

  Bản đầu của luật này viết cho hai chỗ — màn `/awards` và thẻ trên Hôm nay —
  vì đó là hai chỗ tôi biết. Chính nó chỉ ra chỗ thứ ba ngay ở lần chạy đầu:
  `award-celebration.tsx`, cái modal hiện ra đúng lúc người ta vừa nhận huy
  chương, mang đúng bảng tám icon đã cũ. Sàn được nâng lên ba để lần sau ai đó
  gỡ một chỗ ra khỏi tầm dò thì luật đỏ, chứ không âm thầm canh ít đi.
*/
if (drawers.length < 3) {
  problems.push(
    `chỉ tìm thấy ${drawers.length} chỗ bày huy chương — luật 2 được viết cho BA chỗ (màn /awards, ` +
      'thẻ trên Hôm nay, và modal ăn mừng); ít hơn thế nghĩa là bộ dò không còn thấy chúng, không ' +
      'phải là chúng đã hết',
  );
}

if (problems.length) {
  console.error('huy chương vẽ nhiều nơi:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(
  `huy chương một bản vẽ OK — bảng kim loại theo hạng chỉ khai ở ${HOME}, và cả ${drawers.length} chỗ ` +
    'bày huy chương (màn /awards, thẻ trên Hôm nay, modal ăn mừng) đều dựng <Medal> từ đó thay vì tự ' +
    'vẽ. Chỗ thứ ba do CHÍNH luật này tìm ra ở lần chạy đầu — nó chỉ hiện vài giây, đúng lúc vừa đạt ' +
    'một mốc, nên không ảnh chụp nào bắt được. Bảng icon ' +
    'cũ ở thẻ chỉ có 8 dấu trong khi danh mục có 29, nên bản thứ hai vừa cũ vừa thiếu — và không tsc, ' +
    'không guard, không ảnh chụp một màn nào thấy được, vì hai bản vẽ đều hợp lệ và đều có màu',
);
