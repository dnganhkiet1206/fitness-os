/**
 * Ghi lại một số đo trong cùng ngày là SỬA, không phải ghi thêm.
 *
 * ── quyết định sản phẩm, nói bằng lời của người dùng ──
 *
 * *"nếu chưa qua ngày mới thì dữ liệu nhập lại sẽ thay thế cho dữ liệu nhập
 * trước đó trong cùng một ngày"*.
 *
 * ── lỗi nó sửa ──
 *
 * `sleep_logs` không có ràng buộc duy nhất nào cho hàng nhập tay và màn ghi làm
 * một `INSERT` thuần, nên ghi nhầm một đêm rồi ghi lại là HAI hàng cho một đêm.
 * Hậu quả không dừng ở một dòng thừa:
 *
 *     sleepDebt7d = mục tiêu − (tổng phút / SỐ HÀNG)
 *
 * Đêm sai ghi hai lần kéo trung bình bảy ngày xuống gấp đôi mức đáng lẽ, im
 * lặng, suốt một tuần. Với sinh trắc, hàng thừa làm lệch median và MAD của nền
 * 28 ngày — chính cái nền mà điểm HRV/nhịp nghỉ được chấm so với nó.
 *
 * ── ranh giới mà tệp này canh, và vì sao nó khó ──
 *
 * Luật KHÔNG được là "mỗi ngày một hàng giấc ngủ". `sleep_logs` cố ý cho hai
 * hàng trong một ngày vì giấc trưa có thật, và một luật cùng-ngày sẽ khiến ghi
 * giấc trưa XOÁ mất đêm hôm đó — mất dữ liệu, tệ hơn hẳn cái nó sửa.
 *
 * Nên phép so là CHỒNG LẤN THỜI GIAN. Đó đúng là ranh giới giữa "tôi gõ nhầm"
 * và "tôi ngủ thêm", và nó là thứ duy nhất trong bản sửa này có thể sai theo
 * kiểu không ai nhìn thấy. Nên nó được CHẠY THẬT ở đây, không phải được đọc.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(NATIVE, rel), 'utf8');
const OUT = path.join(NATIVE, 'node_modules', '.cache', 'same-day-entry');

/**
 * Một shim hình dạng PostgREST trên một mảng hàng trong bộ nhớ.
 *
 * Đủ để chạy ĐÚNG hai hàm thật: cùng chuỗi `.from().select().eq().gte().lt()`
 * mà chúng gọi, cùng hình dạng `{ data, error }` mà chúng đọc. Bộ lọc được áp
 * thật, nên một hàm quên `.eq('user_id')` hay quên chặn cửa sổ ngày sẽ lộ ra ở
 * đây chứ không phải trên máy người dùng.
 */
const SHIM = `
let ROWS = [];
let FAIL = null;
function builder(table) {
  const preds = [];
  const api = {
    select: () => api,
    eq: (c, v) => { preds.push((r) => String(r[c]) === String(v)); return api; },
    gte: (c, v) => { preds.push((r) => String(r[c]) >= String(v)); return api; },
    lt: (c, v) => { preds.push((r) => String(r[c]) < String(v)); return api; },
    order: (c, o) => {
      api._sort = (a, b) => (o && o.ascending === false
        ? String(b[c]).localeCompare(String(a[c]))
        : String(a[c]).localeCompare(String(b[c])));
      return api;
    },
    limit: (n) => { api._limit = n; return api; },
    then: (res) => {
      if (FAIL) return res({ data: null, error: { message: FAIL } });
      let out = ROWS.filter((r) => r.__table === table && preds.every((p) => p(r)));
      if (api._sort) out = out.slice().sort(api._sort);
      if (api._limit != null) out = out.slice(0, api._limit);
      return res({ data: out, error: null });
    },
  };
  return api;
}
module.exports = {
  supabase: { from: (t) => builder(t) },
  _rows: (r) => { ROWS = r; },
  _fail: (m) => { FAIL = m; },
};
`;

function build() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const LIB = readdirSync(path.join(NATIVE, 'src/lib'))
    .filter((f) => f.endsWith('.ts'))
    .map((f) => `src/lib/${f}`);
  try {
    execFileSync(
      'npx',
      ['tsc', ...LIB, '--ignoreConfig', '--outDir', OUT, '--rootDir', 'src', '--module', 'commonjs',
        '--target', 'es2020', '--skipLibCheck', '--lib', 'es2020,dom'],
      { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch { /* alias `@/` không phân giải ngoài bundler; bản emit vẫn được ghi */ }
  const js = path.join(OUT, 'lib/same-day-entry.js');
  writeFileSync(
    js,
    readFileSync(js, 'utf8').replace(/require\("@\/integrations\/supabase\/client"\)/g, 'require("../sb.cjs")'),
  );
  writeFileSync(path.join(OUT, 'sb.cjs'), SHIM);
  return js;
}

const js = build();
const req = createRequire(import.meta.url);
const sb = req(path.join(OUT, 'sb.cjs'));
const { sleepRowToReplace, biometricRowToReplace } = req(js);

const problems = [];
const U = 'user-1';
const OTHER = 'user-2';

/** Giờ địa phương → ISO, để các ca đọc được như người ta ngủ. */
const at = (day, hh, mm = 0) => new Date(2026, 7, day, hh, mm).toISOString();

const sleepRow = (id, user, bedtime, waketime) => ({ __table: 'sleep_logs', id, user_id: user, bedtime, waketime });

/* ── giấc ngủ ────────────────────────────────────────────────────────────── */
const SLEEP = [
  {
    name: 'ghi LẠI đúng đêm ấy (23:00–07:00 → 23:30–07:15) thì SỬA hàng cũ',
    rows: [sleepRow('night', U, at(10, 23), at(11, 7))],
    call: [U, at(10, 23, 30), at(11, 7, 15)],
    want: 'night',
  },
  {
    name: 'ghi GIẤC TRƯA 14:00–16:00 thì KHÔNG đụng vào đêm cùng ngày',
    rows: [sleepRow('night', U, at(10, 23), at(11, 7))],
    call: [U, at(11, 14), at(11, 16)],
    want: null,
  },
  {
    name: 'ghi đêm HÔM SAU thì không sửa đêm hôm trước',
    rows: [sleepRow('night', U, at(10, 23), at(11, 7))],
    call: [U, at(11, 23), at(12, 7)],
    want: null,
  },
  {
    name: 'đêm của NGƯỜI KHÁC không bao giờ bị sửa',
    rows: [sleepRow('night', OTHER, at(10, 23), at(11, 7))],
    call: [U, at(10, 23, 30), at(11, 7, 15)],
    want: null,
  },
  {
    name: 'đã có giấc trưa, giờ ghi LẠI chính giấc trưa ấy thì sửa nó',
    rows: [sleepRow('night', U, at(10, 23), at(11, 7)), sleepRow('nap', U, at(11, 14), at(11, 16))],
    call: [U, at(11, 14, 15), at(11, 15, 45)],
    want: 'nap',
  },
  {
    name: 'chạm mép nhau nhưng KHÔNG chồng (dậy 07:00, giấc sau bắt đầu 07:00)',
    rows: [sleepRow('night', U, at(10, 23), at(11, 7))],
    call: [U, at(11, 7), at(11, 9)],
    want: null,
  },
];

for (const c of SLEEP) {
  sb._fail(null);
  sb._rows(c.rows);
  const got = await sleepRowToReplace(...c.call);
  if (got !== c.want) {
    problems.push(`giấc ngủ — "${c.name}": trả về ${JSON.stringify(got)}, phải là ${JSON.stringify(c.want)}`);
  }
}

/* Truy vấn hỏng thì ghi như một hàng MỚI: thà thừa một hàng người dùng xoá được
   còn hơn nuốt mất một lần ghi vì một truy vấn phụ hỏng. */
sb._rows([sleepRow('night', U, at(10, 23), at(11, 7))]);
sb._fail('mạng hỏng');
if ((await sleepRowToReplace(U, at(10, 23, 30), at(11, 7, 15))) !== null) {
  problems.push('giấc ngủ — truy vấn hỏng mà vẫn trả về một id để ghi đè: một lỗi mạng không được phép xoá dữ liệu');
}
sb._fail(null);

/* ── sinh trắc ───────────────────────────────────────────────────────────── */
const bioRow = (id, user, source, dt) => ({ __table: 'biometric_samples', id, user_id: user, source, date_time: dt });
const BIO = [
  {
    name: 'nhập lại trong cùng ngày thì SỬA ảnh chụp của ngày đó',
    rows: [bioRow('m1', U, 'manual', at(11, 7))],
    call: [U, at(11, 20)],
    want: 'm1',
  },
  {
    name: 'hàng của HÔM QUA không bị sửa',
    rows: [bioRow('m1', U, 'manual', at(10, 7))],
    call: [U, at(11, 7)],
    want: null,
  },
  {
    name: 'hàng đồng bộ từ Apple Health KHÔNG bị số gõ tay ghi đè',
    rows: [bioRow('watch', U, 'apple_health', at(11, 6))],
    call: [U, at(11, 20)],
    want: null,
  },
  {
    name: 'có cả hàng đồng hồ lẫn hàng nhập tay thì chỉ sửa hàng nhập tay',
    rows: [bioRow('watch', U, 'apple_health', at(11, 6)), bioRow('m1', U, 'manual', at(11, 7))],
    call: [U, at(11, 20)],
    want: 'm1',
  },
  {
    name: 'hàng của người khác không bao giờ bị sửa',
    rows: [bioRow('m1', OTHER, 'manual', at(11, 7))],
    call: [U, at(11, 20)],
    want: null,
  },
];

for (const c of BIO) {
  sb._fail(null);
  sb._rows(c.rows);
  const got = await biometricRowToReplace(...c.call);
  if (got !== c.want) {
    problems.push(`sinh trắc — "${c.name}": trả về ${JSON.stringify(got)}, phải là ${JSON.stringify(c.want)}`);
  }
}

/* ── mọi đường ghi đều phải đi qua luật ──────────────────────────────────── */
const SITES = [
  ['src/app/log-sleep.tsx', /sleepRowToReplace\(/, 'màn ghi giấc ngủ (đường online)'],
  ['src/lib/offline-write.ts', /sleepRowToReplace\(/, 'phát lại giấc ngủ từ hàng đợi'],
  ['src/lib/offline-write.ts', /biometricRowToReplace\(/, 'phát lại sinh trắc (mọi lần ghi sinh trắc đi lối này)'],
];
for (const [file, re, what] of SITES) {
  if (!re.test(read(file))) {
    problems.push(`${file}: ${what} không đi qua luật "ghi lại là SỬA" — một đường ghi bỏ qua nó là hàng trùng quay lại`);
  }
}
/* Và màn ghi giấc ngủ không được quay lại `insert` trần. */
if (/from\('sleep_logs'\)\.insert\(\{/.test(read('src/app/log-sleep.tsx'))) {
  problems.push('src/app/log-sleep.tsx: còn một `insert` thẳng vào sleep_logs không qua luật');
}

/* ── phép tự kiểm ────────────────────────────────────────────────────────── */
const SELF = [
  {
    name: 'đổi phép so thành CÙNG NGÀY thay vì chồng lấn (bản dễ viết sai nhất)',
    /* Cho `overlaps` luôn đúng = mọi hàng trong ngày đều khớp, tức đúng bản
       "mỗi ngày một hàng" mà luật này tồn tại để chặn. */
    mutate: (src) => src.replace('return aStart < bEnd && bStart < aEnd;', 'return true;'),
    expect: /GI\u1ea4C TR\u01afA.*KHÔNG đụng vào đêm/i,
  },
  {
    name: 'bỏ chốt source = manual ở sinh trắc',
    mutate: (src) => src.replace(".eq('source', 'manual')\n", ''),
    expect: /Apple Health KHÔNG bị số gõ tay ghi đè/,
  },
];

const selfFail = [];
for (const [i, s] of SELF.entries()) {
  /*
    Bản hỏng ghi vào ĐÚNG thư mục của bản thật, chỉ khác tên tệp.

    Đặt nó ở một thư mục riêng thì `require('./local-date')` bên trong không
    phân giải được và bản dựng chết vì đường dẫn — mà một bản không chạy được
    thì không chứng minh được luật biết đỏ.
  */
  const brokenPath = path.join(OUT, 'lib', `__break-${i}.js`);
  const original = readFileSync(js, 'utf8');
  const broken = s.mutate(original);
  if (broken === original) {
    selfFail.push(`${s.name}: không đổi được gì — phép thử ngược đang thử một bản y hệt bản thật`);
    continue;
  }
  writeFileSync(brokenPath, broken);
  const mod = req(brokenPath);
  const found = [];
  for (const c of [...SLEEP.map((x) => ({ ...x, fn: mod.sleepRowToReplace })), ...BIO.map((x) => ({ ...x, fn: mod.biometricRowToReplace }))]) {
    sb._fail(null);
    sb._rows(c.rows);
    const got = await c.fn(...c.call);
    if (got !== c.want) found.push(c.name);
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
  console.log('luật "ghi lại là sửa" sai:\n');
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}

console.log(
  `ghi lại là SỬA OK — CHẠY THẬT hai hàm quyết định qua một shim hình dạng PostgREST áp bộ lọc thật: ` +
    `${SLEEP.length} ca giấc ngủ và ${BIO.length} ca sinh trắc. Ranh giới quan trọng nhất được canh bằng số: ghi LẠI ` +
    'đúng đêm ấy thì sửa hàng cũ, còn ghi một GIẤC TRƯA cùng ngày thì không đụng vào đêm — phép so là chồng lấn thời ' +
    'gian, vì một luật "mỗi ngày một hàng" sẽ xoá mất đêm khi người ta ghi giấc trưa, tức mất dữ liệu, tệ hơn cái nó ' +
    'sửa. Hai giấc chạm mép nhau mà không chồng vẫn là hai hàng; hàng của người khác không bao giờ bị đụng; và một ' +
    'truy vấn hỏng thì ghi như hàng mới chứ không ghi đè, vì một lỗi mạng không được phép xoá dữ liệu. Sinh trắc chỉ ' +
    'thay hàng NHẬP TAY — số đo từ Apple Health không bị một con số gõ tay ghi đè. Cả ba đường ghi (màn giấc ngủ ' +
    'online, phát lại giấc ngủ, phát lại sinh trắc) đều đi qua luật, và màn ghi không còn `insert` trần. ' +
    `${SELF.length} phép thử ngược — đổi phép so thành cùng-ngày, và bỏ chốt source=manual — đều đỏ đúng ca đã dự đoán`,
);
