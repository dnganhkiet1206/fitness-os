/*
  Bốn glyph macro đến từ `lucide`, và protein nói cùng một chuyện ở mọi màn.

  ── lịch sử ──

  Chỗ này từng có `macro-icons.tsx`: bốn hình SVG vẽ tay, một công cụ xem trước,
  và một bộ luật giữ chúng khỏi lệch nhau. Tệp mở đầu bằng "the set has no
  drumstick, no wheat ear and no avocado".

  Câu đó sai. Lucide có `drumstick`, `wheat`, `beef`, `egg`, `nut`,
  `leafy-green`, `salad`, `sprout` — và có sẵn trong `node_modules` suốt thời
  gian đó. Cả công trình dựng trên một tiền đề chưa ai kiểm.

  Hậu quả không chỉ là công thừa: hai lần vẽ tay đều đọc SAI ở kích thước thật.
  Lần đầu ra một cái chìa khoá và một củ lạc có lỗ; lần sau ra một bầu dục vô
  nghĩa và một cây thông. Bốn hình do người vẽ icon chuyên nghiệp làm thì không
  cần vòng thứ ba.

  ── luật giữ lại điều gì ──

  1. Không dựng lại một bộ macro vẽ tay. Nếu lucide thiếu thật thì hãy kiểm tra
     trước, đừng khẳng định.
  2. Protein phải là CÙNG một glyph ở dashboard và ở quick-stats. Trước đây là
     hai — `ProteinIcon` tự vẽ ở một nơi, `Beef` ở nơi kia — tức app có hai câu
     trả lời cho một khái niệm và không có gì bắt được.
*/
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');
const problems = [];

if (existsSync(path.join(NATIVE, 'src/components/ascnd/macro-icons.tsx'))) {
  problems.push(
    'macro-icons.tsx quay lại — lucide có egg/wheat/beef/nut/leafy-green/salad/sprout/drumstick, ' +
      'nên một bộ vẽ tay là công thừa và đã đọc sai ở kích thước thật hai lần',
  );
}

const CARD = 'src/components/ascnd/dashboard-cards.tsx';
const card = read(CARD);

/* ── mỗi macro phải chỉ tới một glyph lucide ĐÃ ĐƯỢC IMPORT ── */
const imported = new Set(
  (/import \{([^}]*)\} from 'lucide-react-native';/.exec(card)?.[1] ?? '')
    .split(',')
    .map((n) => n.trim().replace(/^type /, '')),
);
const picks = {};
for (const m of card.matchAll(/label: '(Protein|Carbs|Fat|Fiber)',[^}]*?icon: (\w+),/g)) {
  picks[m[1]] = m[2];
}
for (const macro of ['Protein', 'Carbs', 'Fat', 'Fiber']) {
  const g = picks[macro];
  if (!g) problems.push(`${CARD}: ${macro} không chỉ tới glyph nào`);
  else if (!imported.has(g)) {
    problems.push(`${CARD}: ${macro} dùng \`${g}\`, không phải một icon lucide được import — bộ vẽ tay đang quay lại`);
  }
}
/* Bốn hình phải KHÁC nhau: hai macro cùng glyph là hai dòng không phân biệt được. */
const used = Object.values(picks);
if (new Set(used).size !== used.length) {
  problems.push(`${CARD}: hai macro dùng chung một glyph (${used.join(', ')})`);
}

/* ── protein phải thống nhất giữa hai màn ── */
const quick = read('src/components/ascnd/quick-stats.tsx');
const qProtein = /key: 'protein',\s*\n\s*icon: (\w+),/.exec(quick)?.[1];
if (!qProtein) {
  problems.push('quick-stats.tsx: không đọc được glyph protein');
} else if (picks.Protein && qProtein !== picks.Protein) {
  problems.push(
    `protein có HAI glyph: \`${picks.Protein}\` ở dashboard-cards, \`${qProtein}\` ở quick-stats — ` +
      'một khái niệm, hai câu trả lời',
  );
}

/* ── và không ai được truyền màu bề mặt vào icon ──
   Bộ cũ vẽ vết khoét bằng chính màu nền; nó chỉ đúng khi phía sau đúng bằng màu
   đó, mà trang dinh dưỡng giờ có gradient. */
if (/<Glyph[^>]*\b(cut|bg|surface)=/.test(card)) {
  problems.push(`${CARD}: truyền màu bề mặt vào icon — vết khoét giả sẽ sai ngay khi nền đổi`);
}

if (problems.length) {
  console.log('glyph macro CÓ LỖI:\n');
  for (const p of problems.slice(0, 10)) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  `glyph macro OK — bốn icon lucide khác nhau (${used.join(', ')}), không bộ vẽ tay nào quay lại, ` +
    `protein nói cùng một chuyện ở dashboard và quick-stats (${qProtein}), và không icon nào được ` +
    'truyền màu bề mặt vào',
);
