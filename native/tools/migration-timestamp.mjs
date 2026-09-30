/**
 * Thứ tự timestamp của migration mới (#183).
 *
 * ── the failure this is built around ──
 *
 * `supabase db push` dừng ở `20260930220000_community_find_posts.sql` (#182):
 *
 *     Found local migration files to be inserted before the last migration
 *     on remote database
 *
 * Tệp được đặt tên theo ngày thật (30/09), trong khi tên các migration của
 * repo đã vượt ngày thật tới tận 04/10 (`20261004120000_...`). Vì thế nó rơi
 * vào GIỮA lịch sử. Lần ấy chạy lệch thứ tự vẫn an toàn (chỉ tạo một hàm mới,
 * không bảng/policy/dữ liệu, không migration nào sau nhắc tới nó) và chủ dự án
 * đã chạy `supabase db push --include-all` — nhưng một migration tạo bảng mà
 * rơi vào giữa lịch sử thì `db push` thường không cứu được bằng cờ.
 *
 * ── the rule ──
 *
 * Trong diff so với những gì đã commit, mọi migration MỚI (chưa tracked, hoặc
 * staged-new) phải có timestamp LỚN HƠN timestamp lớn nhất trong các migration
 * đã có. Không lấy theo ngày thật: timestamp = max(hiện có) + 1 giờ.
 *
 * ── what is deliberately NOT flagged ──
 *
 * Migration đã commit bị SỬA (không phải mới): đó là luật khác của repo
 * ("không sửa migration đã commit", #183) và không thuộc phạm vi bước này.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = path.join(ROOT, 'supabase', 'migrations');
const problems = [];

const tsOf = (f) => {
  const m = path.basename(f).match(/^(\d{14})/);
  return m ? m[1] : null;
};

/* Pure core — the reverse test below calls this directly on fixtures. */
export function checkOrder(existing, fresh) {
  const out = [];
  const maxExisting = existing
    .map(tsOf)
    .filter(Boolean)
    .sort()
    .at(-1);
  if (!maxExisting) return out;
  for (const f of fresh) {
    const ts = tsOf(f);
    if (!ts) {
      out.push(`${f}: tên file không bắt đầu bằng timestamp 14 chữ số (YYYYMMDDHHMMSS)`);
    } else if (ts <= maxExisting) {
      out.push(
        `${f}: timestamp ${ts} không lớn hơn timestamp lớn nhất đã có (${maxExisting}). ` +
          'Đặt tên = max(hiện có) + 1 giờ, không lấy theo ngày thật (#183)',
      );
    }
  }
  return out;
}

const sh = (args) => {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    return null;
  }
};

/* ── real run: new = untracked + staged-new, existing = tracked ── */
const tracked = sh(['ls-files', 'supabase/migrations']);
const untracked = sh(['ls-files', '--others', '--exclude-standard', 'supabase/migrations']);
const stagedNew = sh(['diff', '--cached', '--name-only', '--diff-filter=A', '--', 'supabase/migrations']);
if (!tracked || !untracked || !stagedNew) {
  problems.push('không chạy được git để phân biệt migration mới/cũ — luật này cần git');
} else {
  const existing = tracked.filter((f) => f.endsWith('.sql'));
  const fresh = [...new Set([...untracked, ...stagedNew])].filter((f) => f.endsWith('.sql'));
  problems.push(...checkOrder(existing, fresh));
}

/* ── thử ngược: 4 ca trên fixture, luật phải đỏ đúng chỗ ── */
const reverse = [];
const t = (name, existing, fresh, wantRed) => {
  const got = checkOrder(existing, fresh);
  const red = got.length > 0;
  if (red !== wantRed) {
    reverse.push(
      `${name}: muốn ${wantRed ? 'ĐỎ' : 'xanh'} mà ra ${red ? 'ĐỎ' : 'xanh'}` +
        (red ? ` — ${got[0]}` : ''),
    );
  }
};
t('R1 timestamp cũ hơn', ['20261004120000_a.sql'], ['20260930220000_b.sql'], true);
t('R2 timestamp bằng', ['20261004120000_a.sql'], ['20261004120000_b.sql'], true);
t('R3 timestamp mới hơn', ['20261004120000_a.sql'], ['20261005120000_b.sql'], false);
t('R4 không có file mới', ['20261004120000_a.sql'], [], false);
t('R5 tên không có timestamp', ['20261004120000_a.sql'], ['them_bang_moi.sql'], true);
if (reverse.length) {
  problems.push(`thử ngược SAI ${reverse.length}/5: ` + reverse.join(' · '));
}
const tmp = mkdtempSync(path.join(tmpdir(), 'migration-ts-'));
rmSync(tmp, { recursive: true, force: true });

if (problems.length) {
  console.log('thứ tự migration CÓ LỖI:\n');
  for (const p of problems.slice(0, 10)) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'thứ tự migration OK — mọi migration mới (nếu có) đều có timestamp lớn hơn max đã commit; ' +
    '5 phép thử ngược đều đúng (cũ hơn → đỏ, bằng → đỏ, mới hơn → xanh, không file mới → xanh, ' +
    'thiếu timestamp → đỏ). Quy ước: timestamp = max(hiện có) + 1 giờ, không lấy ngày thật (#183)',
);
