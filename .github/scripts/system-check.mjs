#!/usr/bin/env node
/**
 * Bot kiểm hệ thống ASCND (Kiệt 28/10): một báo cáo cho NHÁNH, SERVER, SENTRY, POSTHOG.
 *
 * Chạy được ở hai chỗ, cùng một mã:
 *   - GitHub Actions: `.github/workflows/system-check.yml` (sau mỗi commit lên
 *     native/ios-rewrite, bấm tay, và hằng ngày khi workflow nằm trên nhánh mặc định).
 *   - Trên máy của bất kỳ agent nào: `node .github/scripts/system-check.mjs`
 *     (cần `gh` đã đăng nhập; `supabase` CLI đã đăng nhập cho phần server).
 *
 * Biến môi trường (thiếu biến nào thì phần ấy ghi "BỎ QUA", không làm hỏng cả báo cáo):
 *   GH_TOKEN / gh đã đăng nhập      — nhánh, CI, PR
 *   SUPABASE_ACCESS_TOKEN / supabase login — server (hàm, mã lệch, migration, secret, advisors)
 *   SENTRY_AUTH_TOKEN               — lỗi / crash trên Sentry (scope: project:read, event:read)
 *   POSTHOG_PERSONAL_API_KEY        — số liệu sử dụng trên PostHog (scope: query:read)
 *
 * CHỈ ĐỌC: không deploy, không ghi database, không sửa issue Sentry. Giá trị secret
 * không bao giờ được in (CLI chỉ trả tên + mã băm).
 *
 * Kết quả: Markdown ra stdout (hoặc --out <tệp>), và `--json <tệp>` cho workflow.
 * Mỗi dòng có mức: 🔴 cần xử lý · 🟡 nên xem · 🟢 ổn · ⚪ bỏ qua / không kiểm được.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REPO = process.env.GITHUB_REPOSITORY || 'dnganhkiet1206/fitness-os';
const BRANCH = process.env.CHECK_BRANCH || 'native/ios-rewrite';
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'guqmbqtgxqleuwajvwvg';
const SENTRY_ORG = process.env.SENTRY_ORG || 'ascnd-fitness';
const SENTRY_PROJECT = process.env.SENTRY_PROJECT || 'apple-ios';
const SENTRY_API = process.env.SENTRY_API || 'https://us.sentry.io/api/0';
const POSTHOG_API = process.env.POSTHOG_API || 'https://us.posthog.com';

/** Hàm có trong repo nhưng CHỦ Ý chưa deploy (mua trong app chờ tài khoản Apple; ảnh cộng đồng hoãn). */
const NOT_DEPLOYED_BY_DESIGN = new Set(['verify-purchase', 'store-webhook', 'admin-art']);
/** Secret server phải có; cái cấm có. */
const REQUIRED_SECRETS = ['ASCND_AI_KEY', 'ASCND_AI_URL', 'ASCND_AI_MODEL'];
const FORBIDDEN_SECRETS = ['LOVABLE_API_KEY'];
/** Check không chặn merge — không tính là "CI đỏ" của nhánh. */
const NON_BLOCKING_CHECKS = new Set(['e2e', 'periphery', 'analyze-swift', 'swiftlint', 'Supabase Preview', 'Devin Review']);

const sections = [];
let current;
const section = (title) => { current = { title, lines: [] }; sections.push(current); };
const line = (level, text) => current.lines.push({ level, text });
const ICON = { red: '🔴', yellow: '🟡', green: '🟢', skip: '⚪' };

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20, ...opts });
const gh = (args) => JSON.parse(run('gh', ['api', ...args]));
const has = (cmd) => { try { run('which', [cmd]); return true; } catch { return false; } };
const hoursAgo = (iso) => (Date.now() - new Date(iso).getTime()) / 36e5;

async function guard(name, fn) {
  try { await fn(); } catch (e) {
    line('skip', `${name}: không kiểm được — ${String(e.stderr || e.message || e).split('\n').find(Boolean)?.slice(0, 200)}`);
  }
}

/* ─────────────── 1. Nhánh native/ios-rewrite ─────────────── */
async function checkBranch() {
  section(`Nhánh \`${BRANCH}\``);
  if (!has('gh')) return line('skip', 'không có `gh` — bỏ qua');
  await guard('CI trên đầu nhánh', async () => {
    const head = gh([`repos/${REPO}/commits/${encodeURIComponent(BRANCH)}`]);
    const sha = head.sha;
    const runs = gh([`repos/${REPO}/commits/${sha}/check-runs?per_page=100`]).check_runs
      .filter((c) => !NON_BLOCKING_CHECKS.has(c.name));
    const fail = runs.filter((c) => c.status === 'completed' && !['success', 'skipped', 'neutral'].includes(c.conclusion));
    const pending = runs.filter((c) => c.status !== 'completed');
    const msg = head.commit.message.split('\n')[0].slice(0, 80);
    if (fail.length) line('red', `CI ĐỎ trên đầu nhánh \`${sha.slice(0, 8)}\` (${msg}): ${fail.map((c) => `${c.name}=${c.conclusion}`).join(', ')}`);
    // Đang chạy chưa phải là việc — chỉ ghi lại (workflow đã đợi CI xong trước khi kiểm).
    else if (pending.length) line('skip', `CI đang chạy trên \`${sha.slice(0, 8)}\` (${msg}): ${pending.map((c) => c.name).join(', ')}`);
    else line('green', `CI xanh trên đầu nhánh \`${sha.slice(0, 8)}\` (${msg}) — ${runs.length} check`);
  });
  await guard('PR đang mở', async () => {
    const prs = JSON.parse(run('gh', ['pr', 'list', '-R', REPO, '--base', BRANCH, '--state', 'open', '--json',
      'number,title,mergeable,updatedAt,isDraft,statusCheckRollup', '--limit', '50']));
    if (!prs.length) return line('green', 'không có PR nào đang mở vào nhánh');
    for (const pr of prs) {
      const checks = (pr.statusCheckRollup || []).filter((c) => !NON_BLOCKING_CHECKS.has(c.name));
      const failed = checks.filter((c) => ['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED'].includes(c.conclusion));
      const age = hoursAgo(pr.updatedAt);
      const tag = `#${pr.number} ${pr.title.slice(0, 60)}`;
      if (pr.mergeable === 'CONFLICTING') line('yellow', `${tag}: XUNG ĐỘT với nhánh gốc`);
      else if (failed.length) line('yellow', `${tag}: CI đỏ (${failed.map((c) => c.name).join(', ')})`);
      else if (age > 72 && !pr.isDraft) line('yellow', `${tag}: không đổi ${Math.round(age / 24)} ngày`);
      else line('green', `${tag}: ổn`);
    }
  });
}

/* ─────────────── 2. Server Supabase ─────────────── */
const supa = (args) => run('supabase', [...args, '--project-ref', PROJECT_REF], { cwd: mkdtempSync(path.join(tmpdir(), 'sc-')) });
const supaJson = (args) => {
  const out = supa([...args, '-o', 'json']);
  return JSON.parse(out.slice(out.search(/[[{]/)));
};

async function checkServer() {
  section(`Server Supabase (\`${PROJECT_REF}\`)`);
  if (!has('supabase')) return line('skip', 'không có `supabase` CLI — bỏ qua');

  const fnDir = path.join(ROOT, 'supabase/functions');
  const repoFns = readdirSync(fnDir).filter((d) => !d.startsWith('_') && statSync(path.join(fnDir, d)).isDirectory());
  let deployed = [];
  await guard('Danh sách hàm', async () => {
    deployed = supaJson(['functions', 'list']).functions ?? supaJson(['functions', 'list']);
    const bySlug = new Map(deployed.map((f) => [f.slug, f]));
    for (const f of deployed) {
      if (f.status !== 'ACTIVE') line('red', `hàm \`${f.slug}\` v${f.version}: trạng thái ${f.status}`);
      if (!repoFns.includes(f.slug)) line('yellow', `hàm \`${f.slug}\` chạy trên server nhưng KHÔNG có trong repo`);
    }
    const missing = repoFns.filter((f) => !bySlug.has(f) && !NOT_DEPLOYED_BY_DESIGN.has(f));
    if (missing.length) line('red', `hàm có trong repo mà CHƯA deploy: ${missing.join(', ')}`);
    line('green', `${deployed.length} hàm đang chạy: ${deployed.map((f) => `${f.slug} v${f.version}`).join(', ')}`);
  });

  await guard('Mã đang chạy so với repo', async () => {
    const drift = [];
    for (const f of deployed.filter((d) => repoFns.includes(d.slug))) {
      const dir = mkdtempSync(path.join(tmpdir(), `dl-${f.slug}-`));
      run('supabase', ['functions', 'download', f.slug, '--project-ref', PROJECT_REF, '--workdir', dir, '--use-api'], { cwd: dir });
      const base = path.join(dir, 'supabase/functions');
      const walk = (d) => readdirSync(d).flatMap((e) => {
        const p = path.join(d, e);
        return statSync(p).isDirectory() ? walk(p) : [p];
      });
      for (const file of walk(base)) {
        const rel = path.relative(base, file);
        const mine = path.join(fnDir, rel);
        if (!existsSync(mine)) { drift.push(`${f.slug}: ${rel} (không có trong repo)`); continue; }
        if (readFileSync(mine, 'utf8') !== readFileSync(file, 'utf8')) drift.push(`${f.slug}: ${rel}`);
      }
    }
    // Gom theo tệp: `_shared/ai.ts` lệch ở 7 hàm là MỘT việc, không phải bảy.
    const byFile = new Map();
    for (const d of drift) {
      const [fn, file] = d.split(': ');
      byFile.set(file, [...(byFile.get(file) ?? []), fn]);
    }
    if (drift.length) line('yellow', 'mã đang chạy LỆCH nhánh (deploy lại, hoặc PR đã deploy chưa merge) — ' +
      [...byFile].map(([file, fns]) => `\`${file}\` ở ${fns.length} hàm (${fns.join(', ')})`).join('; '));
    else line('green', 'mã đang chạy của mọi hàm trùng repo');
  });

  await guard('Migration', async () => {
    const q = supaJson(['db', 'query', 'select version from supabase_migrations.schema_migrations order by version', '--linked']);
    const rows = q.rows ?? q.result ?? q;
    const applied = new Set((Array.isArray(rows) ? rows : []).map((r) => String(r.version)));
    const repo = readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql'))
      .map((f) => f.split('_')[0]);
    const pending = repo.filter((v) => !applied.has(v));
    if (!applied.size) return line('skip', 'không đọc được bảng migration');
    if (pending.length) line('yellow', `${pending.length} migration có trong repo mà CHƯA áp lên server: ${pending.join(', ')}`);
    else line('green', `${applied.size} migration đã áp, khớp repo`);
  });

  await guard('Secret', async () => {
    const j = supaJson(['secrets', 'list']);
    const names = new Set((j.secrets ?? j).map((s) => s.name));
    const missing = REQUIRED_SECRETS.filter((n) => !names.has(n));
    const forbidden = FORBIDDEN_SECRETS.filter((n) => names.has(n));
    if (missing.length) line('red', `THIẾU secret: ${missing.join(', ')} — AI sẽ tắt`);
    if (forbidden.length) line('yellow', `secret cũ còn đặt: ${forbidden.join(', ')}`);
    if (!missing.length && !forbidden.length) line('green', `secret AI đủ (${REQUIRED_SECRETS.join(', ')}); không còn LOVABLE_API_KEY`);
  });

  await guard('Hàm còn trả lời', async () => {
    const dead = [];
    for (const f of deployed) {
      const r = await fetch(`https://${PROJECT_REF}.supabase.co/functions/v1/${f.slug}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
        signal: AbortSignal.timeout(20_000),
      }).catch((e) => ({ status: `lỗi mạng ${e.name}` }));
      // Không có token: hàm sống phải từ chối (401/403/400), không phải 5xx / không trả lời.
      if (typeof r.status !== 'number' || r.status >= 500) dead.push(`${f.slug} → ${r.status}`);
    }
    if (dead.length) line('red', `hàm KHÔNG trả lời đúng (gọi không token): ${dead.join(', ')}`);
    else line('green', `${deployed.length} hàm trả lời (từ chối request không token như mong đợi)`);
  });

  await guard('Advisors (bảo mật / hiệu năng)', async () => {
    const issues = supaJson(['db', 'advisors', '--linked', '--level', 'warn']);
    const list = Array.isArray(issues) ? issues : issues.lints ?? [];
    const err = list.filter((i) => i.level === 'ERROR');
    const sec = list.filter((i) => i.level === 'WARN' && i.categories?.includes('SECURITY'));
    const perf = list.filter((i) => i.level === 'WARN' && !i.categories?.includes('SECURITY'));
    const names = (xs) => [...new Set(xs.map((i) => i.name))].join(', ');
    if (err.length) line('red', `${err.length} lỗi advisor mức ERROR: ${names(err)}`);
    if (sec.length) line('yellow', `${sec.length} cảnh báo bảo mật: ${names(sec)}`);
    if (perf.length) line('yellow', `${perf.length} cảnh báo hiệu năng: ${names(perf)}`);
    if (!list.length) line('green', 'advisors không báo gì từ mức WARN trở lên');
  });
}

/* ─────────────── 3. Sentry ─────────────── */
async function checkSentry() {
  section(`Sentry (\`${SENTRY_ORG}/${SENTRY_PROJECT}\`)`);
  const token = process.env.SENTRY_AUTH_TOKEN;
  if (!token) return line('skip', 'chưa có SENTRY_AUTH_TOKEN — bỏ qua');
  const get = async (q) => {
    const u = `${SENTRY_API}/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/issues/?${new URLSearchParams(q)}`;
    const r = await fetch(u, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  };
  await guard('Lỗi mới 24 giờ', async () => {
    const fresh = await get({ query: 'is:unresolved firstSeen:-24h', statsPeriod: '24h', sort: 'freq', limit: '10' });
    for (const i of fresh) line(i.level === 'fatal' || /EXC_|crash/i.test(i.title) ? 'red' : 'yellow',
      `MỚI [${i.shortId}](${i.permalink}) ${i.title.slice(0, 100)} — ${i.count} lần, ${i.userCount} người`);
    if (!fresh.length) line('green', 'không có lỗi MỚI trong 24 giờ');
  });
  await guard('Lỗi đang mở', async () => {
    const open = await get({ query: 'is:unresolved', statsPeriod: '7d', sort: 'freq', limit: '5' });
    const all = await get({ query: 'is:unresolved', statsPeriod: '14d', limit: '100' });
    if (open.length) line('yellow', `${all.length} lỗi chưa xử lý (14 ngày); nhiều nhất 7 ngày: ` +
      open.map((i) => `[${i.shortId}](${i.permalink}) ${i.title.slice(0, 60)} (${i.count})`).join(' · '));
    else line('green', 'không có lỗi chưa xử lý');
  });
}

/* ─────────────── 4. PostHog ─────────────── */
async function checkPostHog() {
  section('PostHog (sử dụng 24 giờ qua)');
  const key = process.env.POSTHOG_PERSONAL_API_KEY;
  if (!key) return line('skip', 'chưa có POSTHOG_PERSONAL_API_KEY — bỏ qua');
  const headers = { authorization: `Bearer ${key}`, 'content-type': 'application/json' };
  await guard('Sự kiện', async () => {
    const query = async (sql) => {
      const r = await fetch(`${POSTHOG_API}/api/projects/@current/query/`, {
        method: 'POST', headers, body: JSON.stringify({ query: { kind: 'HogQLQuery', query: sql } }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()).results ?? [];
    };
    const [[events, users]] = await query(
      "select count(), count(distinct person_id) from events where timestamp > now() - interval 1 day");
    const [[prevUsers]] = await query(
      "select count(distinct person_id) from events where timestamp > now() - interval 8 day and timestamp <= now() - interval 7 day");
    const top = await query(
      "select event, count() c from events where timestamp > now() - interval 1 day group by event order by c desc limit 6");
    const ex = await query(
      "select count() from events where event = '$exception' and timestamp > now() - interval 1 day");
    line(users ? 'green' : 'yellow', `${users} người dùng, ${events} sự kiện trong 24 giờ (cùng ngày tuần trước: ${prevUsers} người)`);
    if (top.length) line('green', `sự kiện nhiều nhất: ${top.map(([e, c]) => `${e} ${c}`).join(' · ')}`);
    if (ex[0]?.[0] > 0) line('yellow', `${ex[0][0]} sự kiện \`$exception\` trong 24 giờ`);
  });
}

/* ─────────────── chạy + báo cáo ─────────────── */
await checkBranch();
await checkServer();
await checkSentry();
await checkPostHog();

const count = (lv) => sections.reduce((n, s) => n + s.lines.filter((l) => l.level === lv).length, 0);
const red = count('red'), yellow = count('yellow');
const status = red ? `🔴 ${red} việc cần xử lý` : yellow ? `🟡 ${yellow} việc nên xem` : '🟢 tất cả ổn';
const when = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
let md = `## 🤖 Bot kiểm hệ thống — ${status}\n\n_${when}${process.env.GITHUB_RUN_ID ? ` · [lượt chạy](https://github.com/${REPO}/actions/runs/${process.env.GITHUB_RUN_ID})` : ''}_\n\n`;
for (const s of sections) {
  md += `### ${s.title}\n`;
  for (const l of s.lines) md += `- ${ICON[l.level]} ${l.text}\n`;
  md += '\n';
}
md += '_Chỉ đọc — bot không deploy, không ghi database. Chạy tay: `node .github/scripts/system-check.mjs` (xem apps/ios/docs/SYSTEM_CHECK.md)._\n';

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
if (arg('--out')) writeFileSync(arg('--out'), md); else process.stdout.write(md);
if (arg('--json')) {
  const problems = sections.flatMap((s) => s.lines.filter((l) => l.level === 'red' || l.level === 'yellow').map((l) => `${s.title}: ${l.text}`));
  writeFileSync(arg('--json'), JSON.stringify({ red, yellow, status, problems }, null, 1));
}
