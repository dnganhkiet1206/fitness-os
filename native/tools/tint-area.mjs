/**
 * Một màu TÍN HIỆU không được là vùng lớn nhất trong thẻ của nó.
 *
 *     node tools/tint-area.mjs
 *
 * ── luật này bảo vệ điều gì ──
 *
 * Bề mặt trung tính làm chủ bố cục; màu tín hiệu là DẤU. Icon, thanh tiến độ,
 * chấm chú giải, một ô nhỏ có nền pha loãng — đó là chỗ của màu. Khi một nền
 * tín hiệu trở thành mảng lớn nhất trong thẻ thì thẻ không còn là một thẻ có
 * một dấu màu, nó là một tấm màu; và bốn thẻ như vậy cạnh nhau là bốn tấm màu,
 * thứ mà mắt đọc thành "trang trí" chứ không thành "dữ liệu".
 *
 * Đích thiết kế là ≤15% diện tích thẻ cha.
 *
 * ── vì sao KHÔNG đo 15% thật ──
 *
 * Đo diện tích thật cần dựng cây, đo layout, biết cả kích thước máy. Thứ đó
 * chỉ có ở lúc chạy, và một luật chỉ chạy được trên máy thật là một luật không
 * ai chạy.
 *
 * Nhưng cái hỏng thì có HÌNH DẠNG TĨNH: một nền tín hiệu trở thành mảng lớn
 * nhất khi chính style ấy bảo nó chiếm hết chỗ theo CẢ HAI CHIỀU — `flex: 1`,
 * `width` và `height` cùng 100%, hay `...StyleSheet.absoluteFillObject`. Đó là
 * điều đọc được từ mã, và nó bắt đúng cái thất bại thật mà không cần biết một
 * điểm ảnh nào. Một style tô màu tín hiệu mà không khai như vậy thì có ít nhất
 * một chiều do nội dung hoặc dữ liệu quyết định — tức nó là một dấu, đúng vai.
 * Xem `FILLS` để biết vì sao đầy MỘT chiều lại không tính.
 *
 * Luật này KHÔNG thay được con mắt trên máy thật: nó bắt hình dạng, không bắt
 * tỉ lệ. Một ô 40% dựng bằng `padding` lớn vẫn lọt. Đó là giới hạn đã biết, và
 * `tools/live.mjs` cùng ảnh chụp iOS là chỗ bắt phần còn lại.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { codeMask } from './lib/code-mask.mjs';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Màu TÍN HIỆU — thứ mang một nghĩa.
 *
 * Bề mặt (`card`, `secondary`, `border`, `muted`…) và chữ (`foreground`…) cố ý
 * KHÔNG ở đây: một nền trung tính chiếm hết thẻ là chuyện bình thường, đó
 * chính là việc của nó.
 */
const SIGNAL = [
  'readinessGreen', 'readinessYellow', 'readinessRed', 'destructive',
  'metricBlue', 'metricPurple', 'metricCyan', 'metricOrange', 'metricRose', 'metricBeige',
];

/**
 * Style tự khai nó chiếm hết chỗ của cha — theo CẢ HAI CHIỀU.
 *
 * ── vì sao không phải "100% ở một chiều là đủ" ──
 *
 * Bản đầu bắt `height: '100%'` một mình, và phép thử đầu tiên trên mã thật báo
 * `sideBarFill` — phần đã chạy của một thanh tiến độ cao 4 điểm. Nó cao 100%
 * của cái RÃNH nó nằm trong, còn chiều rộng thì do dữ liệu quyết định. Đó
 * chính là chỗ màu tín hiệu ĐƯỢC dùng, không phải chỗ nó sai; luật đang cấm
 * đúng thứ nó tồn tại để bảo vệ.
 *
 * Một mảng chiếm chỗ là mảng lớn ở CẢ HAI chiều: `flex: 1` (chiếm trục chính
 * và kéo giãn trục kia), hai lần 100%, hoặc phủ tuyệt đối. Đầy MỘT chiều thì
 * chiều còn lại là dữ liệu — đó là một cái thanh, và một cái thanh là một dấu.
 */
const FILLS = [
  { re: /\bflex:\s*1\b/, name: 'flex: 1' },
  {
    re: /\bwidth:\s*'100%'[\s\S]*\bheight:\s*'100%'|\bheight:\s*'100%'[\s\S]*\bwidth:\s*'100%'/,
    name: "width+height: '100%'",
  },
  { re: /absoluteFill(Object)?\b/, name: 'absoluteFill' },
];

function tsFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) tsFiles(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/** Thân `{ … }` bắt đầu tại `open`, khớp ngoặc, bỏ qua ngoặc trong chú thích. */
function body(src, open, mask) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (!mask[i]) continue;
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (!depth) return src.slice(open, i + 1);
    }
  }
  return src.slice(open);
}

const problems = [];

for (const full of tsFiles(path.join(NATIVE, 'src'))) {
  const rel = path.relative(NATIVE, full);
  const src = readFileSync(full, 'utf8');
  if (!/makeStyles|StyleSheet\.create/.test(src)) continue;
  const mask = codeMask(src);

  /* Từng mục `tên: { … }` ở bất kỳ đâu — style nằm trong `makeStyles`, trong
     `StyleSheet.create`, hay viết thẳng vào `style={{ … }}` đều cùng một hình
     dạng, và cùng hỏng như nhau. */
  for (const m of src.matchAll(/(\w+):\s*\{/g)) {
    const open = src.indexOf('{', m.index);
    if (!mask[open]) continue;
    const b = body(src, open, mask);
    /* Chỉ style LÁ: một mục chứa mục con là một nhóm, và `flex: 1` của nó
       không nói gì về cái nền của con. */
    if (/\w+:\s*\{/.test(b.slice(1))) continue;

    const bg = /backgroundColor:\s*([^,\n}]+)/.exec(b);
    if (!bg) continue;
    const expr = bg[1].trim();

    const tok = SIGNAL.find(
      (t) =>
        new RegExp(`\\bc\\.${t}\\b`).test(expr) ||
        new RegExp(`\\bsleepRamps?\\b.*\\b${t}\\b`).test(expr),
    );
    if (!tok) continue;

    const fill = FILLS.find((f) => f.re.test(b));
    if (!fill) continue;

    const line = src.slice(0, m.index).split('\n').length;
    problems.push(
      `${rel}:${line}: \`${m[1]}\` tô nền bằng màu tín hiệu \`${tok}\` VÀ tự khai chiếm hết chỗ ` +
        `(${fill.name}) — màu tín hiệu là một DẤU, không phải mảng lớn ` +
        'nhất của thẻ. Đích là ≤15% diện tích thẻ cha: để nền trung tính giữ bố cục, và cho màu ' +
        'vào icon, thanh, hoặc một ô con có kích thước do nội dung quyết định',
    );
  }
}

if (problems.length) {
  console.log('diện tích màu tín hiệu CÓ LỖI:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  `diện tích màu tín hiệu OK — không style nào vừa tô nền bằng một trong ${SIGNAL.length} màu tín hiệu ` +
    'vừa tự khai chiếm hết chỗ của cha; bề mặt trung tính vẫn giữ bố cục',
);
