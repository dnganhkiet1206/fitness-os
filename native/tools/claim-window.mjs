/**
 * Cửa sổ nhận thưởng: con số 7 ở client và ở SQL là MỘT con số (#60).
 *
 * ── vì sao ──
 *
 * `community_challenges_overview` giữ thử thách thêm N ngày sau hạn
 * (`c.ends_on >= current_date - N`). Lời nhắc trong hộp thư (#60) tính "còn
 * mấy ngày để nhận" bằng `CLAIM_WINDOW_DAYS` trong `lib/challenge-reminders.ts`.
 * Hai con số ở hai ngôn ngữ, hai thư mục, và không có gì nối chúng: đổi SQL
 * thành 14 thì lời nhắc nói "hôm nay là ngày cuối" một tuần trước ngày cuối
 * thật; đổi thành 3 thì nó hứa bốn ngày không tồn tại, và thử thách biến mất
 * khi màn hình còn nói "còn 4 ngày".
 *
 * ── cái được kiểm ──
 *
 *   1. N trong migration SAU CÙNG định nghĩa tổng quan == `CLAIM_WINDOW_DAYS`.
 *   2. `pendingClaims` THẬT (biên dịch từ nguồn) trên các ca biên: hết hạn N
 *      ngày trước còn (ngày cuối, `daysLeft` 0); N + 1 ngày thì không — cùng
 *      ranh giới với `>=` của SQL; còn mở, đã nhận, chưa đạt, không tham gia
 *      thì không; sắp xếp gần hạn trước.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIG = path.join(NATIVE, '..', 'supabase', 'migrations');
const LIB = 'src/lib/challenge-reminders.ts';
const problems = [];

/* N của tổng quan, trong migration SAU CÙNG định nghĩa nó. */
export function sqlWindow(migrations) {
  for (const [f, sql] of [...migrations].sort((a, b) => (a[0] < b[0] ? 1 : -1))) {
    const at = sql.indexOf('FUNCTION public.community_challenges_overview(');
    if (at < 0) continue;
    const body = sql.slice(at, sql.indexOf('$$;', at));
    const m = body.match(/c\.ends_on\s*>=\s*current_date\s*-\s*(\d+)/);
    return m ? { file: f, n: Number(m[1]) } : { file: f, n: null };
  }
  return null;
}
export const clientWindow = (src) => {
  const m = src.match(/export const CLAIM_WINDOW_DAYS\s*=\s*(\d+)/);
  return m ? Number(m[1]) : null;
};

const migrations = new Map(readdirSync(MIG).filter((f) => f.endsWith('.sql')).map((f) => [f, readFileSync(path.join(MIG, f), 'utf8')]));
const libSrc = readFileSync(path.join(NATIVE, LIB), 'utf8');

function compare(migs, lib) {
  const out = [];
  const s = sqlWindow(migs);
  const c = clientWindow(lib);
  if (!s) out.push('không migration nào định nghĩa community_challenges_overview');
  else if (s.n == null) out.push(`${s.file}: không đọc được "c.ends_on >= current_date - N" trong tổng quan`);
  if (c == null) out.push(`${LIB}: không đọc được CLAIM_WINDOW_DAYS`);
  if (s?.n != null && c != null && s.n !== c) {
    out.push(
      `tổng quan giữ thử thách ${s.n} ngày sau hạn (${s.file}) mà lời nhắc tính ${c} (${LIB}) — ` +
        `lời nhắc sẽ nói sai ngày cuối để nhận thưởng`,
    );
  }
  return out;
}
problems.push(...compare(migrations, libSrc));

/* ── thử ngược cho vế 1 ── */
{
  const [f, sql] = [...migrations].filter(([, s]) => s.includes('FUNCTION public.community_challenges_overview(')).sort().at(-1);
  const bent = new Map(migrations).set(f, sql.replace(/(c\.ends_on\s*>=\s*current_date\s*-\s*)\d+/, '$114'));
  if (compare(bent, libSrc).length === 0) problems.push('thử ngược hỏng: SQL đổi 7 → 14 mà luật vẫn xanh');
  if (compare(migrations, libSrc.replace(/(CLAIM_WINDOW_DAYS\s*=\s*)\d+/, '$13')).length === 0) {
    problems.push('thử ngược hỏng: client đổi 7 → 3 mà luật vẫn xanh');
  }
}

/* ── vế 2: chạy pendingClaims thật ── */
const out = mkdtempSync(path.join(tmpdir(), 'claim-window-'));
try {
  writeFileSync(path.join(out, 'local-date.ts'), readFileSync(path.join(NATIVE, 'src/lib/local-date.ts'), 'utf8'));
  /* `claimLine` điền câu bằng `fillCopy` (#67), import tương đối — chép cùng. */
  writeFileSync(path.join(out, 'copy-fill.ts'), readFileSync(path.join(NATIVE, 'src/lib/copy-fill.ts'), 'utf8'));
  writeFileSync(path.join(out, 'challenge-reminders.ts'), libSrc.replace("'@/lib/local-date'", "'./local-date'"));
  try {
    execFileSync('npx', ['tsc', 'challenge-reminders.ts', 'local-date.ts', 'copy-fill.ts', '--ignoreConfig', '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'], { cwd: out, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch { /* emit is what matters */ }
  const { pendingClaims, CLAIM_WINDOW_DAYS: N } = createRequire(import.meta.url)(path.join(out, 'challenge-reminders.js'));
  if (typeof pendingClaims !== 'function') {
    problems.push('tự kiểm hỏng: không nạp được pendingClaims thật — đừng tin kết quả');
  } else {
    const today = '2026-09-25';
    const back = (d) => { const x = new Date(2026, 8, 25 - d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
    const ch = (id, endsAgo, extra = {}) => ({ id, title: id, ends_on: back(endsAgo), target: 3, progress: 3, joined: true, claimed: false, reward_coins: 100, ...extra });
    const got = pendingClaims([
      ch('ba-ngay', 3),
      ch('ngay-cuoi', N),
      ch('qua-han', N + 1),
      ch('con-mo', 0),
      ch('da-nhan', 2, { claimed: true }),
      ch('chua-dat', 2, { progress: 2 }),
      ch('khong-tham-gia', 2, { joined: false }),
    ], today);
    const ids = got.map((x) => `${x.id}:${x.daysLeft}`).join(', ');
    const want = `ngay-cuoi:0, ba-ngay:${N - 3}`;
    if (ids !== want) {
      problems.push(
        `pendingClaims ra [${ids}], phải [${want}]: hết hạn ${N} ngày là NGÀY CUỐI (tổng quan dùng >=), ${N + 1} ngày là ` +
          'đã mất; còn mở, đã nhận, chưa đạt, không tham gia thì không nhắc; gần hạn đứng trước',
      );
    }
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}

if (problems.length) {
  console.log('cửa sổ nhận thưởng lệch:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}
const s = sqlWindow(migrations);
console.log(
  `cửa sổ nhận thưởng OK — tổng quan giữ thử thách ${s.n} ngày sau hạn (${s.file}) và lời nhắc trong hộp thư ` +
    `tính đúng ${s.n} ngày (CLAIM_WINDOW_DAYS). pendingClaims THẬT trên 7 ca biên: hết hạn ${s.n} ngày là ngày cuối ` +
    `(còn 0 ngày), ${s.n + 1} ngày là đã mất — cùng ranh giới với >= của SQL; còn mở, đã nhận, chưa đạt, không tham ` +
    'gia thì không nhắc; gần hạn đứng trước. Thử ngược: đổi SQL 7 → 14 hay client 7 → 3 thì luật đỏ',
);
