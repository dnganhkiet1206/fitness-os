/**
 * Giấc CHÍNH của một ngày là giấc DÀI NHẤT, không phải giấc kết thúc muộn nhất.
 *
 * ── lỗi nó sửa ──
 *
 * Truy vấn lấy giấc ngủ của một ngày từng là
 * `.order('waketime', desc).limit(1)` — giấc KẾT THÚC MUỘN NHẤT. Một giấc trưa
 * dậy lúc 16:00 muộn hơn một đêm dậy lúc 07:00, nên nó thắng, và cả
 * `sleep_duration_min` lẫn `sleep_quality` của ngày đó đều lấy từ giấc trưa.
 *
 * Đo được trên chính engine, cùng một ngày, cùng một buổi tập:
 *
 *     ngủ đêm 8h, KHÔNG ghi giấc trưa       →  86/100 xanh
 *     … rồi ghi thêm giấc trưa 14:00–16:00  →  40/100 ĐỎ
 *
 * 120 phút được chấm như thể đó là cả đêm, tỉ lệ 0,25 so với mục tiêu, và trần
 * "ngủ dưới 4 tiếng" nổ. **Ghi một giấc trưa làm app bảo bạn nên nghỉ.**
 *
 * Nửa thứ hai của cùng lỗi nằm ở nợ ngủ, và nó im lặng hơn: trung bình chia
 * cho số HÀNG chứ không phải số NGÀY, nên một đêm 8 tiếng cộng một giấc trưa
 * 90 phút ra "trung bình một đêm 285 phút" — bịa ra 195 phút nợ cho một người
 * ngủ đủ, và mang theo suốt bảy ngày.
 *
 * ── quyết định sản phẩm ──
 *
 * Người dùng chọn phương án A: *"Giấc DÀI NHẤT trong ngày — giấc chính, khớp
 * với tên trường và với mục tiêu 480 phút"*. Không phải tổng mọi giấc: cộng
 * lại sẽ là một chỉ số KHÁC ("ngủ được bao nhiêu hôm nay") và làm mục tiêu 480
 * mang một nghĩa khác.
 *
 * Luật này canh cả hai nửa, vì chúng phải đồng ý với nhau về "đêm" là gì —
 * nếu không, điểm của hôm nay và nợ của tuần đang nói về hai thứ khác nhau.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(NATIVE, rel), 'utf8');
const OUT = path.join(NATIVE, 'node_modules', '.cache', 'main-sleep');
const SRC = 'src/lib/daily-log-service.ts';

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
try {
  execFileSync(
    'npx',
    ['tsc', SRC, 'src/lib/readiness-engine.ts', '--ignoreConfig', '--outDir', OUT, '--rootDir', 'src',
      '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck', '--lib', 'es2020,dom'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
  );
} catch { /* alias `@/` không phân giải ngoài bundler; emit vẫn được ghi */ }
const JS = path.join(OUT, 'lib/daily-log-service.js');
writeFileSync(
  JS,
  readFileSync(JS, 'utf8').replace(/require\("@\/integrations\/supabase\/client"\)/g, 'require("./sbstub.cjs")'),
);
writeFileSync(path.join(OUT, 'lib/sbstub.cjs'), 'module.exports = { supabase: null };');

const req = createRequire(import.meta.url);
const { mainSleep, asleepMinutes, sleepDebtFrom } = req(JS);
const { computeReadiness } = req(path.join(OUT, 'lib/readiness-engine.js'));

const problems = [];
const TARGET = 480;
/** Giờ ĐỊA PHƯƠNG → ISO, để các ca đọc được như người ta ngủ. */
const iso = (d, h, m = 0) => new Date(2026, 7, d, h, m).toISOString();
const row = (bd, bh, wd, wh, wm = 0) => ({ bedtime: iso(bd, bh), waketime: iso(wd, wh, wm) });

const NIGHT = row(10, 23, 11, 7); // 480p
const NAP = row(11, 14, 11, 16); // 120p

/* ── 1. giấc chính ───────────────────────────────────────────────────────── */
const PICK = [
  { n: 'chỉ có một đêm', rows: [NIGHT], want: 480 },
  { n: 'đêm 8h + giấc trưa 2h → lấy ĐÊM', rows: [NIGHT, NAP], want: 480 },
  { n: 'thứ tự đảo lại vẫn lấy ĐÊM', rows: [NAP, NIGHT], want: 480 },
  { n: 'chỉ có giấc trưa thì giấc trưa LÀ giấc chính', rows: [NAP], want: 120 },
  { n: 'ba giấc, lấy dài nhất', rows: [NAP, row(11, 12, 11, 12, 30), NIGHT], want: 480 },
  { n: 'không có giấc nào', rows: [], want: null },
  { n: 'null', rows: null, want: null },
];
for (const c of PICK) {
  const got = mainSleep(c.rows);
  const mins = got === null ? null : asleepMinutes(got);
  if (mins !== c.want) problems.push(`giấc chính — "${c.n}": ra ${JSON.stringify(mins)} phút, phải là ${JSON.stringify(c.want)}`);
}
/* Bằng nhau thì lấy giấc kết thúc MUỘN hơn, và điều đó phải ổn định ở CẢ HAI
   thứ tự đầu vào — nếu không, dựng lại cùng một ngày cho ra hai kết quả. */
const a = row(11, 1, 11, 3); // 120p, dậy 03:00
const b = row(11, 13, 11, 15); // 120p, dậy 15:00
if (mainSleep([a, b])?.waketime !== b.waketime || mainSleep([b, a])?.waketime !== b.waketime) {
  problems.push('giấc chính — hai giấc BẰNG NHAU không cho ra cùng một kết quả ở hai thứ tự đầu vào: phép dựng lại một ngày thôi xác định');
}

/* ── 2. hậu quả thật trên điểm, chạy qua engine ──────────────────────────── */
const B = {
  hrv_today: undefined, rhr_today: undefined, sleep_target_min: TARGET, sleep_debt_7d_min: 0,
  training_load_7d: 100, training_load_28d: 100, training_days_28d: 1, hrv_history_28d: [], rhr_history_28d: [],
};
const scoreFor = (rows) => computeReadiness({ ...B, sleep_min_lastnight: asleepMinutes(mainSleep(rows)) }).score;
const onlyNight = scoreFor([NIGHT]);
const withNap = scoreFor([NIGHT, NAP]);
if (onlyNight !== withNap) {
  problems.push(
    `ghi thêm một giấc trưa làm điểm đổi ${onlyNight} → ${withNap}: một giấc ngủ THÊM không được phép hạ điểm sẵn sàng`,
  );
}
/* Và răng của luật: nếu ngày đó CHỈ có giấc trưa thì điểm PHẢI thấp — một luật
   làm mọi thứ bằng nhau thì không canh gì cả. */
if (scoreFor([NAP]) >= onlyNight) {
  problems.push('một ngày chỉ ngủ 2 tiếng lại không bị chấm thấp hơn một đêm 8 tiếng — luật đã mất răng');
}

/* ── 3. nợ ngủ: mẫu số là NGÀY ───────────────────────────────────────────── */
const DEBT = [
  { n: 'một đêm đủ giấc → không nợ', rows: [NIGHT], want: 0 },
  { n: 'đêm đủ + giấc trưa 90p → vẫn không nợ', rows: [NIGHT, row(11, 14, 11, 15, 30)], want: 0 },
  { n: 'một đêm 6h → nợ 120 phút', rows: [row(10, 23, 11, 5)], want: 120 },
  {
    n: 'hai ngày, mỗi ngày một đêm 6h → vẫn nợ 120 phút',
    rows: [row(10, 23, 11, 5), row(11, 23, 12, 5)],
    want: 120,
  },
  {
    n: 'hai ngày, một ngày có thêm giấc trưa → giấc trưa không kéo trung bình xuống',
    rows: [row(10, 23, 11, 5), row(11, 13, 11, 14), row(11, 23, 12, 5)],
    want: 120,
  },
  { n: 'không có đêm nào → không bịa ra nợ', rows: [], want: 0 },
];
for (const c of DEBT) {
  const got = Math.round(sleepDebtFrom(c.rows, TARGET));
  if (got !== c.want) problems.push(`nợ ngủ — "${c.n}": ra ${got} phút, phải là ${c.want}`);
}

/* ── 4. truy vấn không được tự chọn giùm ─────────────────────────────────── */
/*
  Bóc chú thích TRƯỚC khi so, và khoanh đúng MỘT truy vấn.

  Bản đầu của khối này quét cả tệp và đỏ hai lần trên mã đúng: nó bắt phải
  `.limit(1)` của truy vấn sinh trắc ở cách đó hai mươi dòng, và bắt phải
  `sleepLogs7d.length >= 3` — thứ là CỔNG MỞ chứ không phải phép chia nợ ngủ.
  Cùng một lỗi "ghim chữ thay vì ghim chỗ" mà repo này đã gặp nhiều lần.

  Truy vấn ngày được nhận ra bằng cột chỉ nó mới chọn (`quality`), và chỉ đọc
  tới đầu truy vấn kế tiếp.
*/
const src = read(SRC).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');
const dayStart = src.indexOf(".select('bedtime, waketime, quality");
if (dayStart < 0) {
  problems.push(`${SRC}: không tìm thấy truy vấn giấc ngủ của ngày — luật mất chỗ bám, sửa luật chứ đừng bỏ`);
} else {
  const next = src.indexOf('supabase', dayStart);
  const block = src.slice(dayStart, next < 0 ? dayStart + 500 : next);
  if (/\.limit\(/.test(block)) {
    problems.push(
      `${SRC}: truy vấn giấc ngủ của ngày còn \`.limit()\` — nó trả về giấc kết thúc MUỘN NHẤT, ` +
        'nên một giấc trưa sẽ thay chỗ cả đêm trước khi mainSleep kịp nhìn thấy hai hàng',
    );
  }
}
if (!/mainSleep\(sleeps\)/.test(src)) {
  problems.push(`${SRC}: giấc của ngày không đi qua mainSleep`);
}
/* Nợ ngủ phải đi qua hàm thuần — đó là thứ khiến nó CHẠY được ở trên thay vì
   chỉ được đọc bằng mắt giữa thân `recomputeDailyLog`. */
if (!/sleepDebt7d = sleepDebtFrom\(/.test(src)) {
  problems.push(`${SRC}: nợ ngủ không đi qua sleepDebtFrom — mẫu số phải là số NGÀY, và phép tính phải kiểm được`);
}

/* ── phép tự kiểm ────────────────────────────────────────────────────────── */
const SELF = [
  {
    name: 'quay lại "giấc kết thúc muộn nhất" thay vì "dài nhất"',
    mutate: (s) => s.replace(
      'if (m > bestMin || (m === bestMin && best !== null && String(r.waketime) > String(best.waketime))) {',
      'if (best === null || String(r.waketime) > String(best.waketime)) {',
    ),
    expect: /lấy ĐÊM|điểm đổi/,
  },
  {
    name: 'nợ ngủ chia cho số HÀNG thay vì số NGÀY',
    /* Dựng lại đúng bản đã ship: cộng MỌI hàng, chia cho SỐ HÀNG. Ghim vào
       mẫu số chứ không vào cách xuống dòng của bản emit. */
    mutate: (s) => {
      const summed = s.replace(
        /const night = mainSleep\(day\);\s*\n\s*if \(night\)\s*\n\s*total \+= asleepMinutes\(night\);/,
        'for (const n of day) total += asleepMinutes(n);',
      );
      return summed.replace('total / byDay.size', 'total / (rows ?? []).length');
    },
    expect: /giấc trưa/,
  },
];
const selfFail = [];
for (const [i, s] of SELF.entries()) {
  const original = readFileSync(JS, 'utf8');
  const broken = s.mutate(original);
  if (broken === original) {
    selfFail.push(`${s.name}: không đổi được gì — phép thử ngược đang thử một bản y hệt bản thật`);
    continue;
  }
  const p = path.join(OUT, 'lib', `__break-${i}.js`);
  writeFileSync(p, broken);
  const m = req(p);
  const found = [];
  for (const c of PICK) {
    const got = m.mainSleep(c.rows);
    const mins = got === null ? null : m.asleepMinutes(got);
    if (mins !== c.want) found.push(`giấc chính "${c.n}"`);
  }
  const on = computeReadiness({ ...B, sleep_min_lastnight: m.asleepMinutes(m.mainSleep([NIGHT])) }).score;
  const wn = computeReadiness({ ...B, sleep_min_lastnight: m.asleepMinutes(m.mainSleep([NIGHT, NAP])) }).score;
  if (on !== wn) found.push(`điểm đổi ${on} → ${wn} khi ghi thêm giấc trưa`);
  for (const c of DEBT) {
    if (Math.round(m.sleepDebtFrom(c.rows, TARGET)) !== c.want) found.push(`nợ ngủ "${c.n}"`);
  }
  if (found.length === 0) selfFail.push(`${s.name}: bản hỏng vẫn XANH — luật này không bắt được gì`);
  else if (!found.some((f) => s.expect.test(f))) {
    selfFail.push(`${s.name}: đỏ, nhưng không đúng ca đã dự đoán (${s.expect}); thật ra hỏng ở: ${found.join('; ')}`);
  }
}
rmSync(OUT, { recursive: true, force: true });

if (selfFail.length) {
  console.error('phép tự kiểm hỏng — đừng tin kết quả:\n');
  for (const s of selfFail) console.error(`  ${s}`);
  process.exit(2);
}
if (problems.length) {
  console.log('giấc chính của ngày sai:\n');
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}

console.log(
  `giấc chính OK — CHẠY THẬT mainSleep, asleepMinutes và sleepDebtFrom: ${PICK.length} ca chọn giấc và ` +
    `${DEBT.length} ca nợ ngủ. Giấc chính của một ngày là giấc DÀI NHẤT, không phải giấc kết thúc muộn nhất — ` +
    'truy vấn cũ dùng `.order(waketime desc).limit(1)`, nên một giấc trưa dậy 16:00 thắng một đêm dậy 07:00 và ' +
    `cả thời lượng lẫn chất lượng của ngày đó đều lấy từ giấc trưa. Hậu quả được đo QUA ENGINE chứ không suy: ghi ` +
    `thêm một giấc trưa vào một ngày đã ngủ 8 tiếng không còn đổi điểm (${onlyNight}/100 ở cả hai bên; bản cũ rơi ` +
    'xuống 40 đỏ vì trần "ngủ dưới 4 tiếng" nổ) — và luật vẫn có RĂNG: một ngày chỉ ngủ 2 tiếng vẫn bị chấm thấp ' +
    'hơn hẳn. Nợ ngủ chia cho số NGÀY chứ không số HÀNG, nên một giấc trưa 90 phút cạnh một đêm đủ không còn bịa ' +
    'ra 195 phút nợ. Hai giấc bằng nhau cho cùng một kết quả ở cả hai thứ tự đầu vào, nên phép dựng lại một ngày ' +
    `vẫn xác định. ${SELF.length} phép thử ngược — khôi phục "muộn nhất", và chia lại cho số hàng — đều đỏ đúng ca đã dự đoán`,
);
