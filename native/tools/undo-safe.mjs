/**
 * Hoàn tác phải LẤY LẠI ĐÚNG thứ đã mất, và nút của nó phải với tới được.
 *
 * ── hai cái bẫy của một nút Hoàn tác, và cả hai đều im lặng ──
 *
 * **Một: dựng lại thiếu cột.** `useTodayLog` — thứ vẽ ra nhật ký — select
 * chín cột, KHÔNG có `fiber_g` và KHÔNG có `food_item_id`. Dựng lại hàng từ
 * `LoggedItem` đang hiện trên màn sẽ cho ra một dòng TRÔNG giống hệt: cùng
 * tên, cùng calo, cùng ba macro. Chất xơ về 0, và chất xơ đi thẳng vào
 * `daily_logs`, nên vòng chất xơ của cả ngày tụt xuống sau một lần bấm Hoàn
 * tác. Không lỗi, không cảnh báo, và người dùng vừa bấm một nút hứa "như cũ".
 *
 * Nên luật: bộ cột được CHỤP trước khi xoá phải phủ mọi cột mà app từng GHI
 * vào bảng ấy. Thêm một cột mới vào lệnh chèn mà quên thêm vào ảnh chụp là đỏ.
 *
 * **Hai: cái nút với không tới.** `neon-toast.tsx` tự đo và ghi lại rằng thanh
 * toast *"tự gỡ sau AUTO_HIDE_MS, ngắn hơn thời gian vuốt tới nó"*, nên câu
 * chữ phải được ĐẨY ra bằng `announceForAccessibility`. Một câu chữ thì đẩy
 * được; một cái NÚT thì không. Gắn Hoàn tác vào một thanh tự biến mất là thêm
 * một điều khiển mà người dùng VoiceOver không bao giờ bấm được.
 *
 * ── và luật này CHẠY hàm thật, không dò một câu `if` ──
 *
 * `toastHideMs` được trích ra khỏi `src/lib/toast.ts`, biên dịch bằng chính
 * `tsc` của dự án rồi gọi trên cả bốn tổ hợp. Repo này đã hai lần dính bẫy
 * "luật kiểm một khai báo chứ không kiểm dây nối", nên phần dây nối được kiểm
 * riêng: component phải GỌI hàm ấy, và không được còn một `setTimeout` nào
 * cầm sẵn một con số.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');
const strip = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const problems = [];

/* ─────────────────────────────────────────────────────────────────────────
   Luật A — thời gian sống của thanh toast, CHẠY THẬT
   ───────────────────────────────────────────────────────────────────────── */
{
  const src = read('src/lib/toast.ts');
  const grab = (re, what) => {
    const m = src.match(re);
    if (!m) throw new Error(`không trích được ${what} thật từ src/lib/toast.ts — luật này đã lạc mục tiêu`);
    return m[0];
  };
  const lifted = [
    grab(/export const AUTO_HIDE_MS\s*=\s*[^;]+;/, 'AUTO_HIDE_MS'),
    grab(/export const ACTION_HIDE_MS\s*=\s*[^;]+;/, 'ACTION_HIDE_MS'),
    grab(/export function toastHideMs\([\s\S]*?\n\}/, 'toastHideMs'),
  ].join('\n\n');

  const out = mkdtempSync(path.join(os.tmpdir(), 'undo-safe-'));
  mkdirSync(path.join(out, 'src'), { recursive: true });
  writeFileSync(path.join(out, 'src', 'toast.ts'), lifted + '\n');
  execFileSync(
    process.execPath,
    [path.join(NATIVE, 'node_modules/typescript/bin/tsc'), 'src/toast.ts',
      '--ignoreConfig', '--outDir', out, '--rootDir', 'src',
      '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: out, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const mod = createRequire(path.join(out, 'x.cjs'))(path.join(out, 'toast.js'));
  const { toastHideMs, AUTO_HIDE_MS, ACTION_HIDE_MS } = mod;

  /* Bốn tổ hợp, và ca quan trọng nhất là ca cuối. */
  const cases = [
    [false, false, AUTO_HIDE_MS, 'không nút, không trình đọc màn hình'],
    [false, true, AUTO_HIDE_MS, 'không nút, có trình đọc màn hình'],
    [true, false, ACTION_HIDE_MS, 'CÓ nút, không trình đọc màn hình'],
    [true, true, null, 'CÓ nút, CÓ trình đọc màn hình'],
  ];
  for (const [act, sr, want, what] of cases) {
    const got = toastHideMs(act, sr);
    if (got !== want) {
      problems.push(
        `toastHideMs(${act}, ${sr}) ra ${got}, phải là ${want} — ${what}. ` +
          (want === null
            ? 'Một thanh có NÚT mà tự tắt khi trình đọc màn hình đang bật là một điều khiển không ai vuốt tới kịp'
            : ''),
      );
    }
  }
  if (!(ACTION_HIDE_MS > AUTO_HIDE_MS)) {
    problems.push(
      `thanh CÓ nút sống ${ACTION_HIDE_MS}ms, không dài hơn thanh không nút (${AUTO_HIDE_MS}ms) — ` +
        'thanh không nút chỉ cần được ĐỌC, thanh có nút cần được BẤM',
    );
  }

  /* Dây nối: component phải gọi hàm ấy, và thôi cầm số. */
  const host = strip(read('src/components/ascnd/neon-toast.tsx'));
  if (!/toastHideMs\s*\(/.test(host)) {
    problems.push(
      'neon-toast.tsx không gọi `toastHideMs` — hàm được kiểm ở trên không còn là thứ quyết định ' +
        'thanh sống bao lâu, nên cả luật A chứng minh một thứ không ai dùng',
    );
  }
  const literalTimer = host.match(/setTimeout\([^,]*,\s*\d+\s*\)/);
  if (literalTimer) {
    problems.push(
      `neon-toast.tsx còn một hẹn giờ cầm sẵn số: \`${literalTimer[0].replace(/\s+/g, ' ')}\` — ` +
        'một con số thứ hai là một chỗ để hai luật lệch nhau, và luật A chỉ nhìn thấy con số thứ nhất',
    );
  }
  if (!/action\b/.test(host)) {
    problems.push('neon-toast.tsx không còn đọc `action` — nút Hoàn tác không được vẽ ra ở đâu cả');
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   Luật B — ảnh chụp phải phủ mọi cột app từng ghi
   ───────────────────────────────────────────────────────────────────────── */
{
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'src'], {
    cwd: NATIVE,
    encoding: 'utf8',
  })
    .split('\n')
    .filter((f) => /\.tsx?$/.test(f));

  const nutrition = strip(read('src/hooks/use-nutrition.ts'));
  const colsOf = (name) => {
    const m = nutrition.match(new RegExp(`const ${name}\\s*=\\s*([\\s\\S]*?);`));
    if (!m) throw new Error(`không tìm thấy ${name} trong use-nutrition.ts — luật này đã lạc mục tiêu`);
    return new Set(
      m[1]
        .replace(/['"`+\n]/g, ' ')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    );
  };

  /* Cột nào app THẬT SỰ ghi vào bảng ấy, quét cả src. */
  const written = (table) => {
    const found = new Set();
    for (const f of files) {
      const src = strip(read(f));
      const re = new RegExp(`from\\(\\s*['"\`]${table}['"\`]\\s*\\)\\s*\\.\\s*(?:insert|upsert)\\s*\\(`, 'g');
      let m;
      while ((m = re.exec(src))) {
        /* thân của lời gọi, khớp ngoặc */
        let depth = 0;
        const open = m.index + m[0].length - 1;
        let end = open;
        for (let i = open; i < src.length; i++) {
          if (src[i] === '(') depth++;
          else if (src[i] === ')') { depth--; if (depth === 0) { end = i; break; } }
        }
        const body = src.slice(open, end + 1);
        /* `.upsert(item as never, …)` chèn NGUYÊN một biến — chính đường hoàn
           tác. Nó không liệt kê cột nào nên không đóng góp gì cho phép so. */
        for (const k of body.matchAll(/(^|[{,\s])([a-z_][a-z0-9_]*)\s*:/gi)) found.add(k[2]);
      }
    }
    return found;
  };

  for (const [name, table] of [['ITEM_COLS', 'meal_entry_items'], ['ENTRY_COLS', 'meal_entries']]) {
    const snap = colsOf(name);
    const writes = written(table);
    /* `onConflict`/`ignoreDuplicates` là tuỳ chọn của upsert, không phải cột. */
    for (const opt of ['onConflict', 'ignoreDuplicates', 'count', 'defaultToNull']) writes.delete(opt);
    const missing = [...writes].filter((c) => !snap.has(c));
    if (missing.length) {
      problems.push(
        `${name} không chụp lại ${missing.map((c) => `\`${c}\``).join(', ')} — app có ghi cột ấy vào ` +
          `\`${table}\`, nên hoàn tác sẽ dựng lại một hàng TRÔNG giống hệt mà thiếu đúng chỗ đó. ` +
          'Chất xơ là ví dụ đã suýt xảy ra: nó không hiện trên nhật ký nhưng đi thẳng vào daily_logs',
      );
    }
    if (snap.size < 5) {
      problems.push(`${name} chỉ có ${snap.size} cột — bộ quét lạc mục tiêu, đừng tin kết quả`);
    }
  }

  /* Và đường hoàn tác phải THẬT SỰ dùng ảnh chụp ấy, không dựng lại từ màn. */
  if (!/useRestoreMealItem/.test(nutrition)) {
    problems.push('không còn `useRestoreMealItem` — nút Hoàn tác không có gì để gọi');
  }
  if (!/ITEM_COLS/.test(nutrition) || !/ENTRY_COLS/.test(nutrition)) {
    problems.push('ITEM_COLS/ENTRY_COLS không còn được dùng — ảnh chụp trước khi xoá đã đi đâu mất');
  }
}

if (problems.length) {
  console.error('hoàn tác:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  'hoàn tác OK — `toastHideMs` được TRÍCH ra khỏi toast.ts, biên dịch và CHẠY trên cả bốn tổ hợp: ' +
    'thanh có nút sống lâu hơn thanh không nút, và khi trình đọc màn hình bật thì nó KHÔNG tự tắt ' +
    '(null), vì một câu chữ thì đẩy ra được còn một cái nút thì phải với tới được — chính neon-toast ' +
    'đã đo và ghi rằng thanh này biến mất nhanh hơn thời gian vuốt tới nó. Dây nối được kiểm riêng: ' +
    'component GỌI hàm ấy và không còn hẹn giờ nào cầm sẵn số. Và ảnh chụp trước khi xoá phủ mọi cột ' +
    'app từng ghi vào meal_entry_items / meal_entries — thêm một cột vào lệnh chèn mà quên thêm vào ' +
    'ảnh chụp là đỏ, vì hoàn tác sẽ dựng lại một hàng trông giống hệt mà thiếu đúng chỗ đó',
);
