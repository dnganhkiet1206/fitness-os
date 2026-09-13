/**
 * Một đại lượng, một định nghĩa — và không màn nào tự tính lại nó.
 *
 * ── lỗi nó sinh ra để sửa ──
 *
 * `sleep-insights.tsx` in ra độ dài của một đêm hai lần, bằng hai phép tính
 * khác nhau, cách nhau 260 dòng trong cùng một tệp:
 *
 *   · dòng 93   `asleepMinutes(s)` — ưu tiên `asleep_min` HealthKit ghi;
 *   · dòng 353  `(wake - bed) / 60000` — thời gian trên GIƯỜNG.
 *
 * Trên một đêm HealthKit hình dạng thật, 23:00 → 06:40 là 7h40 trên giường và
 * 7h11 ngủ. Thẻ trên cùng nói 7.2h, hàng ngay dưới nói 7h40, và không gì trên
 * màn giải thích vì sao. Bộ cố định che nó suốt vì mọi đêm giả đều có
 * `asleep_min` bằng đúng hiệu hai giờ — không đêm thật nào như thế.
 *
 * Kho này đã ghi chính luật ấy ở `useKcalHistory`, bằng lời của nó: "đọc lại từ
 * bảng nguồn nghĩa là tự tính một khoảng thời gian ở đây rồi HY VỌNG nó khớp
 * với thứ đã viết ra cột kia". Và đã trả giá cho nó bốn lần: bộ máy sẵn sàng,
 * hai hàm AI, rồi màn này.
 *
 * ── vì sao luật lại hẹp thế này ──
 *
 * Nó KHÔNG cấm mọi phép trừ hai mốc thời gian. Nó cấm đúng một hình dạng: lấy
 * hiệu của một mốc tên-như-giờ-dậy và một mốc tên-như-giờ-đi-ngủ rồi chia ra
 * phút hoặc giờ. Đường GHI VÀO (`sleepSpan`) được phép, vì ở đó chưa có
 * `asleep_min` nào để đọc — chính nó sinh ra con số ấy; và bản thân
 * `asleepMinutes` được phép, vì nó là định nghĩa.
 *
 * Danh sách dưới đây là một sổ đăng ký, không phải một trường hợp: thêm một
 * đại lượng nữa là thêm một mục.
 *
 * ── một chỗ CHƯA trả lời, ghi ra để không ai tưởng đã xong ──
 *
 * Hệ số Atwater `P*4 + C*4 + F*9` nằm rải ở năm chỗ (`log-meal.tsx`,
 * `food-editor.tsx`, `macro-targets.ts` ×2, `fitness-calc.ts`) mà KHÔNG có hàm
 * nào sở hữu nó. Nó thuộc đúng họ lỗi này, nhưng chưa có định nghĩa để trỏ về
 * nên chưa thành một mục được — viết một luật đỏ ngay từ lúc sinh ra là viết
 * một việc-cần-làm, không phải một luật. Gom về một hàm trước, rồi thêm mục.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');

const REGISTRY = [
  {
    what: 'độ dài một đêm ngủ',
    /** Hàm sở hữu đại lượng này, và tệp giữ nó. */
    owner: 'src/lib/daily-log-service.ts',
    fn: 'asleepMinutes',
    /**
     * Hình dạng bị cấm: `(X - Y) / <hằng số phút|giờ>` trong đó X gợi "giờ
     * dậy" và Y gợi "giờ đi ngủ". `.getTime()` để tuỳ chọn vì cả hai cách viết
     * đều có thật trong kho — `daily-log-service` gọi `.getTime()` sớm hơn một
     * dòng, và một luật chỉ bắt một trong hai cách viết là một luật mời người
     * ta đổi cách viết.
     */
    shape: /(\w+)(?:\.getTime\(\))?\s*-\s*(\w+)(?:\.getTime\(\))?\s*\)\s*\/\s*(?:60000|6e4|3600000|36e5)/g,
    names: { left: /wake/i, right: /bed/i },
    /** Được phép tự tính, kèm lý do — lý do là thứ bắt phải nghĩ lại khi xoá. */
    allow: {
      'src/lib/sleep-window.ts':
        'đường GHI VÀO: `sleepSpan` dựng con số từ hai bộ chọn giờ, và con số ấy MỚI trở thành `asleep_min`',
    },
  },
];

/**
 * Xoá chú thích, giữ nguyên số dòng và độ dài.
 *
 * Không phải chuyện gọn gàng. Bước này suýt tự bẫy nó ngay lần chạy đầu: chú
 * thích tôi vừa viết trong `sleep-insights.tsx` có câu "Dòng này TỪNG là
 * `Math.round((wake - bed) / 60000)`" — kể lại lỗi đã sửa — và luật đọc nó
 * thành một lỗi mới. Một bộ dò đỏ vì tài liệu sẽ bị người sau tắt đi.
 *
 * Thay bằng khoảng trắng chứ không cắt bỏ, nên số dòng trong thông báo vẫn trỏ
 * đúng chỗ.
 */
const blank = (s) => s.replace(/[^\n]/g, ' ');
const stripComments = (s) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, lead) => lead + blank(m.slice(lead.length)));

const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = path.join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(p)) files.push(p);
  }
})(SRC);

const problems = [];
let scanned = 0;
let hits = 0;

for (const entry of REGISTRY) {
  const ownerPath = path.join(ROOT, entry.owner);
  const ownerSrc = readFileSync(ownerPath, 'utf8');
  if (!new RegExp(`export function ${entry.fn}\\b`).test(ownerSrc)) {
    problems.push(
      `${entry.owner} không còn export \`${entry.fn}\` — định nghĩa của "${entry.what}" đã dời hoặc đổi tên, ` +
        'sửa mục trong tools/one-definition.mjs chứ đừng để luật canh một cái tên không tồn tại',
    );
    continue;
  }

  /* Định nghĩa phải có người GỌI. Một định nghĩa duy nhất mà không ai dùng thì
     mọi màn đang tự tính, và luật này sẽ xanh trong khi không gì được thống
     nhất cả — đúng cái bẫy "khai báo có, nối thì không" của kho này. */
  const callers = files.filter(
    (f) => f !== ownerPath && new RegExp(`\\b${entry.fn}\\s*\\(`).test(readFileSync(f, 'utf8')),
  );
  if (callers.length === 0) {
    problems.push(
      `\`${entry.fn}\` là định nghĩa duy nhất của "${entry.what}" mà KHÔNG màn nào gọi — ` +
        'nó đang là mã chết, và mọi chỗ hiện con số ấy đang tự tính lấy',
    );
  }

  for (const f of files) {
    const rel = path.relative(ROOT, f).split(path.sep).join('/');
    /* Tệp định nghĩa được bỏ qua theo DANH TÍNH, không theo ngoại lệ: nó không
       phải một chỗ được miễn, nó là chỗ con số ra đời. */
    if (f === ownerPath) continue;
    const src = stripComments(readFileSync(f, 'utf8'));
    scanned++;
    for (const m of src.matchAll(entry.shape)) {
      const [, left, right] = m;
      if (!entry.names.left.test(left) || !entry.names.right.test(right)) continue;
      hits++;
      if (entry.allow[rel]) continue;
      const line = src.slice(0, m.index).split('\n').length;
      problems.push(
        `${rel}:${line} tự tính "${entry.what}" bằng \`${left} - ${right}\` thay vì gọi \`${entry.fn}\` — ` +
          'đó là thời gian TRÊN GIƯỜNG, không phải thời gian NGỦ, và hai con số ấy chênh nhau ~30 phút ' +
          'trên mọi đêm HealthKit ghi',
      );
    }
  }

  /* Chiều ngược: một ngoại lệ không còn chỗ nào dùng tới là một ngoại lệ mời
     người sau tự tính lại mà vẫn xanh. */
  for (const [rel, why] of Object.entries(entry.allow)) {
    const p = path.join(ROOT, rel);
    if (!files.includes(p)) {
      problems.push(`ngoại lệ \`${rel}\` (${why}) trỏ vào một tệp không còn tồn tại — bỏ nó khỏi tools/one-definition.mjs`);
      continue;
    }
    const s = stripComments(readFileSync(p, 'utf8'));
    const used = [...s.matchAll(entry.shape)].some(
      ([, l, r]) => entry.names.left.test(l) && entry.names.right.test(r),
    );
    if (!used) {
      problems.push(
        `ngoại lệ \`${rel}\` (${why}) không còn tự tính "${entry.what}" nữa — bỏ nó khỏi tools/one-definition.mjs, ` +
          'không thì nó là một cánh cửa mở sẵn cho lần sau',
      );
    }
  }
}

if (problems.length) {
  console.error('một đại lượng, hai định nghĩa:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  `một định nghĩa OK — ${REGISTRY.length} đại lượng trong sổ, quét ${scanned} tệp và tìm thấy ${hits} chỗ ` +
    'tự tính độ dài một đêm; mọi chỗ ấy đều nằm trong danh sách được phép kèm lý do, mỗi lý do vẫn còn ' +
    'đúng chỗ nó nói, và hàm định nghĩa vẫn có người gọi ngoài tệp của nó. ' +
    'CHƯA phủ: hệ số Atwater 4/4/9 nằm ở năm chỗ mà chưa hàm nào sở hữu — xem đầu tệp',
);
