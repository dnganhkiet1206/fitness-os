/**
 * The setup guide, checked against the thing it sets up.
 *
 * ── why this exists ──
 *
 * `docs/connecting-a-backend.md` is the file somebody reads when they have a
 * Supabase project and nothing else. It is the one document in this repository
 * whose reader has no way to check it: they do not know the codebase yet, which
 * is why they are reading it.
 *
 * It had drifted in three places at once, and every one of them would have cost
 * that reader real time:
 *
 *   · "**18 file SQL**" — there are 32. Somebody counting the folder to see
 *     whether their clone was complete would have concluded it was not.
 *   · "`delete-account` **chưa tồn tại** — không có thư mục trong
 *     `supabase/functions/`". It exists, with source, and the doc tells them to
 *     go and write it.
 *   · a deploy command listing five functions when there are nine. The four it
 *     leaves out include the App Store webhook and account deletion, both of
 *     which fail silently for weeks when undeployed — which is the exact reason
 *     `EDGE_FUNCTIONS` in `backend.ts` calls itself a checklist.
 *
 * None of that broke anything, which is the point: a document is the one place
 * in this repository where a statement has never had to be true. So the
 * countable claims are pulled back out of it and compared with the folders they
 * describe, the same way `tools/score-doc.mjs` does for the numbers in
 * `fitness-scores.md`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(NATIVE, '..');
const DOC = 'docs/connecting-a-backend.md';
const doc = readFileSync(path.join(NATIVE, DOC), 'utf8');
const problems = [];

/** Small Vietnamese numerals, because the document counts in words where a
    sentence reads better for it. */
const VN = { một: 1, hai: 2, ba: 3, bốn: 4, năm: 5, sáu: 6, bảy: 7, tám: 8, chín: 9, mười: 10 };

/** How many edge functions actually call the Lovable AI gateway. */
const aiCount = readdirSync(path.join(ROOT, 'supabase/functions'))
  .filter((f) => f !== '_shared' && statSync(path.join(ROOT, 'supabase/functions', f)).isDirectory())
  .filter((f) => {
    try {
      return /ai\.gateway\.lovable\.dev/.test(readFileSync(path.join(ROOT, 'supabase/functions', f, 'index.ts'), 'utf8'));
    } catch {
      return false;
    }
  }).length;

const migrations = readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql'));
const functions = readdirSync(path.join(ROOT, 'supabase/functions'))
  .filter((f) => f !== '_shared' && statSync(path.join(ROOT, 'supabase/functions', f)).isDirectory())
  .sort();

/* ── 1. the counts it quotes ── */
{
  const PINS = [
    ['số file migration', /đã có \*\*(\d+) file SQL\*\*/, migrations.length],
    ['số edge function', /Edge function — cả (\d+) cái đã có sẵn/, functions.length],
    /* Written as a word, so it is read as one. The map covers the range this
       document actually uses; a count outside it fails to match and this says
       so, which is the right outcome — an unpinnable claim is the one that
       drifts. */
    /* `\p{L}` and the `u` flag, not `\w`: JavaScript's `\w` is ASCII, so it does
       not match "sáu" — the first version reported the sentence as missing from
       a document it was sitting in. */
    ['số function gọi cổng AI Lovable', /\*\*(\p{L}+) function\s+AI đều gọi/u, aiCount],
  ];
  for (const [what, re, actual] of PINS) {
    const m = doc.match(re);
    if (!m) {
      problems.push(
        `${DOC} không còn nói "${what}" theo dạng bám được (${re}) — một con số bị viết mờ đi thì ` +
          'không kiểm được nữa, và một khẳng định không kiểm được chính là thứ sẽ lệch',
      );
      continue;
    }
    const said = /^\d+$/.test(m[1]) ? Number(m[1]) : VN[m[1].toLowerCase()];
    if (said === undefined) {
      problems.push(`"${what}": tài liệu ghi "${m[1]}", không đọc ra được thành số`);
      continue;
    }
    if (actual !== null && said !== actual) {
      problems.push(
        `"${what}": tài liệu ghi ${said} nhưng thực tế là ${actual} — người đọc tài liệu này chưa ` +
          'biết codebase, đó là lý do họ đang đọc nó, nên họ không có cách nào tự phát hiện',
      );
    }
  }
}

/* ── 2. the deploy command names every function that exists ──

   Not "some functions": the list in `backend.ts` is a deployment checklist, and
   a function left off it fails at the moment somebody taps the feature rather
   than at deploy time. `store-webhook` fails without anybody tapping anything. */
{
  /*
    Anchored to the start of a line, which is to say inside a fenced block.

    The first version matched anywhere and found the sentence at §1b that merely
    NAMES the command — so it captured the prose that follows and reported all
    nine functions missing from a command that lists all nine.
  */
  const cmd = doc.match(/^supabase functions deploy([\s\S]*?)```/m);
  if (!cmd) {
    problems.push(`${DOC} không còn câu lệnh \`supabase functions deploy\` nào`);
  } else {
    const named = cmd[1].replace(/\\\n/g, ' ');
    for (const f of functions) {
      if (!named.includes(f)) {
        problems.push(
          `câu lệnh deploy trong tài liệu KHÔNG nhắc \`${f}\` — nó có mã nguồn trong repo và app gọi ` +
            'tới nó, nên bỏ sót ở đây là một function không bao giờ được deploy',
        );
      }
    }
  }
}

/* ── 3. nothing it tells you to write already exists ──

   The failure that cost the most: the doc sent somebody off to write
   `delete-account` while its source sat in the repo. */
{
  for (const f of functions) {
    const re = new RegExp(`\`${f}\`[^\\n]{0,40}\\*\\*chưa tồn tại\\*\\*`);
    if (re.test(doc)) {
      problems.push(
        `tài liệu nói \`${f}\` chưa tồn tại, nhưng supabase/functions/${f}/ có thật — nó đang bảo ` +
          'người đọc đi viết lại một thứ đã có',
      );
    }
  }
}

/* ── 4. the local section's addresses are the CLI's actual ones ──

   Quoted from the CLI's own start-up output. They are worth pinning because a
   wrong port here looks exactly like "Supabase is not running". */
{
  const ADDR = [
    ['Project URL local', 'http://127.0.0.1:54321'],
    ['Studio', 'http://127.0.0.1:54323'],
    ['Mailpit', 'http://127.0.0.1:54324'],
    ['Android emulator', 'http://10.0.2.2:54321'],
  ];
  for (const [what, url] of ADDR) {
    if (!doc.includes(url)) {
      problems.push(`mục chạy local không còn ghi địa chỉ ${what} (${url})`);
    }
  }
  /* And it must not tell anybody to run `supabase init`, which would overwrite
     the `config.toml` that carries nine `verify_jwt = false` entries. */
  if (/^\s*supabase init\s*$/m.test(doc.replace(/\*\*Không chạy `supabase init`\.\*\*[\s\S]*?\n\n/, ''))) {
    problems.push(
      'tài liệu bảo chạy `supabase init` — lệnh đó ghi đè supabase/config.toml, thứ đang giữ chín ' +
        'mục verify_jwt = false cho các function gọi được',
    );
  }
}

/* ── 5. the .env keys it prints are the ones the app reads ── */
{
  const backend = readFileSync(path.join(NATIVE, 'src/lib/backend.ts'), 'utf8');
  for (const m of backend.matchAll(/process\.env\.(EXPO_PUBLIC_\w+)/g)) {
    if (!doc.includes(m[1])) {
      problems.push(
        `backend.ts đọc \`${m[1]}\` nhưng tài liệu không nhắc tên biến đó — người làm theo tài liệu ` +
          'sẽ đặt một biến app không đọc, và app âm thầm quay về project mặc định',
      );
    }
  }
}

/* ── 6. the troubleshooting section keeps its two load-bearing warnings ──

   §1c tells somebody how to move data out of the project Lovable created. Two
   sentences in it are the difference between a migration that works and one
   that silently loses things, and both are the kind of caveat that gets edited
   out for brevity:

     · `db dump` excludes `auth` and `storage`, so accounts and uploaded files
       do NOT come across. Somebody who misses this restores a database full of
       `user_id` values pointing at users that do not exist, and finds out when
       every screen is empty.
     · the default-privileges REVOKE before restoring, which is Supabase's own
       instruction on that command's reference page.

   Both are quoted from the CLI reference rather than remembered. */
{
  const MUST = [
    [/loại trừ schema `auth` và `storage`/, 'db dump bỏ qua auth và storage — tài khoản và file KHÔNG đi theo'],
    [/ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL/, 'câu REVOKE quyền mặc định trước khi restore'],
    [/npx supabase projects list/, 'phép thử dứt khoát: projects list liệt kê project tài khoản truy cập được'],
  ];
  for (const [re, what] of MUST) {
    if (!re.test(doc)) {
      problems.push(
        `mục chẩn đoán không còn nói: ${what}. Đây là loại cảnh báo bị cắt đi vì "cho gọn", và hậu quả ` +
          'của việc thiếu nó chỉ lộ ra sau khi đã chuyển xong dữ liệu',
      );
    }
  }
}

if (problems.length) {
  console.log('tài liệu nối backend CÓ LỖI:\n');
  for (const p of problems.slice(0, 12)) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  `tài liệu nối backend OK — ${migrations.length} file migration và ${functions.length} edge function ` +
    'được ĐẾM từ thư mục thật rồi so với con số tài liệu ghi (tài liệu từng ghi 18 và 5); câu lệnh ' +
    'deploy phải nhắc TÊN của cả chín function, vì đó là checklist chứ không phải ví dụ, và ' +
    'store-webhook hỏng mà không ai bấm gì cả; không function nào bị tài liệu bảo là "chưa tồn tại" ' +
    'trong khi mã nguồn đã có (delete-account từng như thế); bốn địa chỉ local của CLI được ghim; ' +
    'tài liệu không bảo ai chạy `supabase init`, thứ sẽ ghi đè config.toml; và mọi biến ' +
    'EXPO_PUBLIC_ mà backend.ts đọc đều được gọi đúng tên trong tài liệu; và mục chẩn đoán giữ được ' +
    'hai cảnh báo chịu lực của nó — db dump KHÔNG mang theo auth với storage, và câu REVOKE quyền ' +
    'mặc định trước khi restore',
);
