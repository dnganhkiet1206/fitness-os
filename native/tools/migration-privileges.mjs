/**
 * That no migration asks for a privilege Supabase Cloud does not give it.
 *
 * ── the failure this is built around ──
 *
 * Moving ASCND onto a fresh Supabase project, `supabase db push` stopped at
 * `20260812120000_progress_photos_limits.sql`:
 *
 *     ERROR: must be owner of table buckets (SQLSTATE 42501)
 *
 * The statement was `COMMENT ON TABLE storage.buckets`. `storage.buckets` is
 * owned by `supabase_storage_admin`, and the role running migrations is not a
 * member of it. Since April 2025 Supabase permits exactly two kinds of change
 * on the whitelisted auth/storage/realtime tables — RLS POLICIES and TRIGGERS —
 * plus foreign keys that merely REFERENCE them. Anything requiring ownership
 * (COMMENT, ALTER TABLE, CREATE INDEX, DROP) is refused.
 *
 * ── why a rule and not just a fix ──
 *
 * The project it was written against was a Lovable-managed one, where this
 * happened to be allowed. That is the dangerous shape: a migration that works
 * on the machine it was authored on and fails on every project created after
 * it. Nothing in the file, in TypeScript, or in the app can see the difference
 * — the first evidence is a half-migrated database.
 *
 * ── what is deliberately NOT flagged ──
 *
 * DML on `storage.buckets`. Two earlier migrations INSERT and UPDATE that table
 * and both applied cleanly on the new project; the restriction covers the
 * SCHEMA MIGRATION tables, not bucket rows. Policies and triggers on the
 * whitelisted tables are likewise fine, and this repo has both.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = path.join(ROOT, 'supabase', 'migrations');
const problems = [];

/* Comments first, and that is the whole trick.

   The fix for the bug above documents itself by QUOTING the statement it
   removed. A rule that greps raw text finds that quotation and reports the bug
   it was written to prove is gone — matching the spelling of a thing instead of
   the thing. */
const strip = (sql) =>
  sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');

const SYS = '(?:storage|auth|realtime|vault|cron|extensions|graphql|supabase_functions)';
const OWNS = new RegExp(
  String.raw`\b(COMMENT\s+ON\s+(?:TABLE|COLUMN)|ALTER\s+TABLE(?:\s+ONLY)?|DROP\s+TABLE|DROP\s+INDEX|TRUNCATE|ALTER\s+SEQUENCE)\s+${SYS}\.`,
  'gi',
);
/* `CREATE INDEX [name] ON <sys>.<table>` — the name sits between, so the two
   halves cannot be required to be adjacent. */
const INDEX = new RegExp(String.raw`\bCREATE\s+(?:UNIQUE\s+)?INDEX\b[^;]{0,120}?\bON\s+(?:ONLY\s+)?${SYS}\.`, 'gis');
/* Writing to the schema-migration bookkeeping of another service is the one
   DML Supabase does call out. */
const BOOKS = new RegExp(
  String.raw`\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE)\s+(?:${SYS}\.)?(?:schema_)?migrations\b`,
  'gi',
);

const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
if (files.length === 0) problems.push('không tìm thấy migration nào — đường dẫn sai?');

for (const f of files) {
  const sql = strip(readFileSync(path.join(DIR, f), 'utf8'));
  for (const [re, why] of [
    [OWNS, 'DDL đòi quyền SỞ HỮU bảng của schema hệ thống'],
    [INDEX, 'tạo index trên bảng của schema hệ thống'],
    [BOOKS, 'ghi vào bảng schema_migrations của dịch vụ khác'],
  ]) {
    re.lastIndex = 0;
    for (const m of sql.matchAll(re)) {
      const line = sql.slice(0, m.index).split('\n').length;
      problems.push(
        `${f}:${line}: ${why} — "${m[0].replace(/\s+/g, ' ').trim()}…". ` +
          'Supabase Cloud từ 04/2025 chỉ cho POLICY và TRIGGER trên các bảng này ' +
          '(cộng khoá ngoại tham chiếu tới chúng); mọi thứ khác trả về 42501 must be owner',
      );
    }
  }
}

if (problems.length) {
  console.log('quyền của migration CÓ LỖI:\n');
  for (const p of problems.slice(0, 10)) console.log(`  • ${p}`);
  console.log(
    '\nKhông cấp ownership để lách. Nếu đó là metadata (COMMENT), hãy để nó thành chú thích ' +
      'trong chính file migration — nó mô tả MỘT DÒNG, còn COMMENT ON TABLE thì gắn vào cả bảng ' +
      'chứa mọi bucket và sẽ sai ngay khi có bucket thứ hai.',
  );
  process.exit(1);
}

console.log(
  `quyền của migration OK — ${files.length} migration, không cái nào đòi quyền sở hữu trên ` +
    'schema hệ thống (COMMENT/ALTER TABLE/CREATE INDEX/DROP trên storage, auth, realtime…), ' +
    'không cái nào ghi vào bảng schema_migrations của dịch vụ khác. Policy và trigger trên ' +
    'storage.objects/auth.users vẫn còn nguyên vì Supabase cho phép đúng hai thứ đó, và DML lên ' +
    'storage.buckets cũng vậy — hai migration cũ đã INSERT/UPDATE bucket và chạy sạch. ' +
    'Luật đọc SQL sau khi BỎ CHÚ THÍCH: bản vá cho lỗi này tự tài liệu hoá bằng cách trích lại ' +
    'câu lệnh đã gỡ, nên một luật grep thô sẽ báo đỏ chính bằng chứng rằng lỗi đã hết',
);
