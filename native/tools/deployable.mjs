/**
 * That every function the app calls exists, is declared, and — for the one that
 * deletes an account — deletes what it says it deletes.
 *
 * ── the gap this closes ──
 *
 * `delete-account` was referenced from Settings, listed in `EDGE_FUNCTIONS`,
 * described in the docs, and **did not exist**. The button worked: it called
 * the URL, got a 404, and told people the server had not been set up. Correct
 * behaviour, and a shipping blocker nobody would notice from inside the app,
 * because nothing was broken — the feature simply was not there.
 *
 * App Store Review Guideline 5.1.1(v) makes account deletion a condition of
 * shipping, not a nicety: *"If your app supports account creation, you must
 * also offer account deletion within the app."*
 *
 * ── the three ways this function goes wrong ──
 *
 * 1. **Taking the user id from the request body.** Then anybody can delete
 *    anybody. This is the only endpoint in the project where a mistake is
 *    unrecoverable for the person it lands on.
 * 2. **Forgetting Storage.** `deleteUser` cascades through foreign keys, and a
 *    bucket object is not a row. Progress photos would outlive the account,
 *    still stored and still billed — pictures of somebody who asked to be
 *    forgotten. Order matters too: after the auth row is gone there is no id
 *    left to enumerate their folder with.
 * 3. **Answering 200 after a partial failure.** The app signs out and clears
 *    its cache on 2xx and says *nothing has been deleted* on anything else. A
 *    optimistic 200 turns that sentence into a lie on the one screen where a
 *    lie is least recoverable.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(NATIVE, '..');
const FUNCS = path.join(REPO, 'supabase', 'functions');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const problems = [];

/*
  ── 1: the checklist, the folders and the config agree ──

  Three lists that drift apart silently. A function in `EDGE_FUNCTIONS` with no
  folder is a feature that 404s in production; a folder with no `config.toml`
  entry deploys with the platform's JWT gate on, which rejects the requests
  these functions are built to authenticate themselves.
*/
const listed = [
  ...strip(readFileSync(path.join(NATIVE, 'src/lib/backend.ts'), 'utf8'))
    .matchAll(/^\s*\w+: '([a-z-]+)',$/gm),
].map((m) => m[1]);

const folders = readdirSync(FUNCS, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
  .map((d) => d.name);

const config = readFileSync(path.join(REPO, 'supabase', 'config.toml'), 'utf8');
const declared = [...config.matchAll(/^\[functions\.([a-z-]+)\]/gm)].map((m) => m[1]);

for (const fn of listed) {
  if (!folders.includes(fn)) {
    problems.push(`EDGE_FUNCTIONS liệt kê "${fn}" nhưng không có supabase/functions/${fn} — tính năng đó sẽ 404`);
  }
}
for (const fn of folders) {
  if (!declared.includes(fn)) {
    problems.push(
      `supabase/functions/${fn} không có mục trong config.toml — ` +
        'deploy xong sẽ bật cổng JWT của nền tảng và chặn chính request mà hàm này tự xác thực',
    );
  }
  if (!existsSync(path.join(FUNCS, fn, 'index.ts'))) {
    problems.push(`supabase/functions/${fn} không có index.ts`);
  }
}

/*
  ── 2: deleting an account ──

  Checked in detail rather than by existence, because "there is a file called
  delete-account" is exactly the thing that would have been true while the
  function deleted nothing.
*/
{
  const p = path.join(FUNCS, 'delete-account', 'index.ts');
  if (!existsSync(p)) {
    problems.push(
      'delete-account chưa tồn tại — App Store Guideline 5.1.1(v) bắt buộc phải xoá được tài khoản trong app',
    );
  } else {
    const code = strip(readFileSync(p, 'utf8'));

    if (!/requireUser\(req\)/.test(code)) {
      problems.push('delete-account: không lấy danh tính từ token — id trong body là id ai cũng gửi được');
    }
    /* An id read out of the body is the failure; `userId` must come from the
       caller object and nowhere else. */
    if (/body[\s\S]{0,40}?userId|body\?\.\s*user_id/.test(code)) {
      problems.push('delete-account: đọc user id từ body request — đó là cách xoá nhầm tài khoản người khác');
    }

    /* Both halves of emptying a folder, not just the word "storage".

       The first version searched for `.storage` anywhere, so deleting the
       `list` call still passed on the strength of the `remove` call below it —
       a folder that is never enumerated is a folder nothing is removed from. */
    const listsBucket = /\.storage[\s\S]{0,60}?\.list\(/.test(code);
    const removesFiles = /\.storage[\s\S]{0,60}?\.remove\(/.test(code);
    const storage = code.search(/\.storage/);
    const deleteUser = code.indexOf('admin.auth.admin.deleteUser');
    if (!listsBucket || !removesFiles) {
      problems.push(
        `delete-account: thiếu ${!listsBucket ? 'list' : 'remove'} trên bucket — ` +
          'phải liệt kê được thư mục thì mới xoá được nó',
      );
    }
    if (storage < 0) {
      problems.push(
        'delete-account: không xoá file trong Storage — cascade không với tới object trong bucket, ' +
          'ảnh của người đã xoá tài khoản sẽ ở lại và vẫn bị tính tiền',
      );
    } else if (deleteUser >= 0 && storage > deleteUser) {
      problems.push(
        'delete-account: xoá Storage sau khi xoá auth user — lúc đó không còn id nào để liệt kê thư mục của họ',
      );
    }
    if (deleteUser < 0) {
      problems.push('delete-account: không gọi auth.admin.deleteUser — không có gì thực sự bị xoá');
    }
    /* Paging: `list` defaults to 100 and somebody with two years of weekly
       photos has more. Deleting the first page looks identical from outside. */
    if (!/for \(;;\)|while \(/.test(code)) {
      problems.push(
        'delete-account: liệt kê Storage không lặp qua từng trang — ' +
          'list mặc định 100 file, người dùng lâu năm sẽ còn sót lại phần sau',
      );
    }
    /* A hand-written table list is the thing that rots. */
    if (/from\(["'](daily_logs|meal_entries|workout_sessions)["']\)[\s\S]{0,40}?\.delete/.test(code)) {
      problems.push(
        'delete-account: xoá tay từng bảng — cả 31 bảng đã cascade về auth.users, ' +
          'danh sách tay là thứ sẽ mục ruỗng khi thêm bảng mới',
      );
    }
    /*
      ── every failure branch, not merely some branch ──

      The first version asked whether the file contained *a* 5xx return, which
      it always will while any one branch still has one. So a sabotage that
      turned the `deleteUser` failure into `return json({ ok: true })` passed:
      the storage branches were still answering 500 on its behalf.

      Each `const { error: x } = await …` is now paired with its own `if (x)`
      block, and that block has to leave with a non-2xx. The app signs out on
      2xx and says *nothing has been deleted* otherwise; one branch getting this
      wrong is one way to delete somebody's session and keep their data.
    */
    for (const m of code.matchAll(/const \{[^}]*error: (\w+)[^}]*\} = await [\s\S]{0,160}?;/g)) {
      const err = m[1];
      /* `\n\s*}` rather than a fixed indent: the storage guard sits inside the
         paging loop and closes two levels in, which a hard-coded four spaces
         read as "never checked at all". */
      const guard = code.slice(m.index).match(new RegExp(`if \\(${err}\\)\\s*\\{([\\s\\S]{0,300}?)\\n\\s*\\}`));
      if (!guard) {
        problems.push(`delete-account: lỗi "${err}" không được kiểm — bước hỏng mà hàm vẫn đi tiếp`);
      } else if (!/, (4|5)\d\d\)/.test(guard[1])) {
        problems.push(
          `delete-account: nhánh lỗi "${err}" không trả 4xx/5xx — ` +
            'app chỉ đăng xuất khi nhận 2xx, nên trả 200 sau khi hỏng là nói dối đúng chỗ không sửa được',
        );
      }
    }
  }
}

/**
 * The self-test.
 *
 * The ordering rule is the one worth proving: both statements are present in
 * the wrong version, both look right on their own, and only their order decides
 * whether anybody's photos survive them.
 */
const SELF = [
  ['thiếu hẳn Storage — bị bắt', () => {
    const bad = 'const c = await requireUser(req);\nawait admin.auth.admin.deleteUser(userId);';
    return bad.indexOf('.storage') < 0;
  }],
  ['Storage sau deleteUser — bị bắt', () => {
    const bad = 'await admin.auth.admin.deleteUser(userId);\nawait admin.storage.from(B).list(userId);';
    return bad.indexOf('.storage') > bad.indexOf('admin.auth.admin.deleteUser');
  }],
  ['đúng thứ tự — không bị bắt', () => {
    const good = 'await admin.storage.from(B).list(userId);\nawait admin.auth.admin.deleteUser(userId);';
    return good.indexOf('.storage') < good.indexOf('admin.auth.admin.deleteUser');
  }],
  ['folder thiếu config — bị bắt', () => !['ai-coach'].includes('delete-account')],
  ['còn remove nhưng mất list — bị bắt', () => {
    const bad = 'await admin.storage.from(B).remove(paths);';
    return !/\.storage[\s\S]{0,60}?\.list\(/.test(bad);
  }],
  ['một nhánh lỗi trả 200 — bị bắt', () => {
    const bad = 'if (delErr) {\n      console.error("x");\n      return json({ ok: true });\n    }';
    const g = bad.match(/if \(delErr\)\s*\{([\s\S]{0,300}?)\n    \}/);
    return !!g && !/, (4|5)\d\d\)/.test(g[1]);
  }],
];
const missed = SELF.filter(([, fn]) => !fn()).map(([l]) => l);
if (missed.length) {
  console.error(`phép tự kiểm hỏng — không bắt được: ${missed.join('; ')}; đừng tin kết quả`);
  process.exit(2);
}

if (problems.length) {
  console.log('sẵn sàng deploy hay chưa:\n');
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}

console.log(
  `sẵn sàng deploy OK — ${folders.length} edge function, mỗi cái đều có thư mục, index.ts và mục trong config.toml; ` +
    'delete-account lấy danh tính từ token, xoá Storage theo từng trang TRƯỚC khi xoá auth user, ' +
    'không xoá tay bảng nào, và chỉ trả 2xx khi mọi bước xong',
);
