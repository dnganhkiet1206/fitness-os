/**
 * Signing out leaves nothing of the person behind — and nothing of the phone
 * either.
 *
 * ── the bug this was written for ──
 *
 * `signOut` cleared exactly **one** of the app's seventeen AsyncStorage keys.
 * Sixteen survived, and three of them do not merely go stale, they make the app
 * behave incorrectly for whoever signs in next:
 *
 *   · `ascnd_personal_model_v1` — the learned daily rhythm and the bandit
 *     state. Koa asks person B at person A's training hour, having "learned" it
 *     from a stranger's weeks.
 *   · `ascnd_reminder_plan` — the signature of the notification schedule last
 *     written to the OS. `use-reminders.ts` returns early when the signature
 *     matches, so a second account whose plan hashes to the same string gets
 *     **no reminder scheduled, ever**, while every switch on the settings
 *     screen still reads as on.
 *   · `ascnd-weight-goal-kg` and `ascnd-steps-goal` — one person's targets
 *     drawn across another person's charts.
 *
 * ── and the opposite mistake, which would be worse ──
 *
 * The obvious fix is to sweep every key starting `ascnd`. That takes the
 * *device* preferences with it: language, units, the app lock. Somebody lends a
 * friend their phone for one sign-in and gets it back in English, in kilograms,
 * with the lock off. A privacy fix that resets a stranger's handset is not a
 * fix.
 *
 * So there are two named lists, and this file's real job is to make sure they
 * stay complete: every key the app writes belongs to exactly one of them. A key
 * added later and forgotten is the bug coming back, and it comes back silently,
 * because nothing about a leftover preference looks wrong.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const strip = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/* ── 1. the two lists, read from the app rather than retyped ── */
const out = mkdtempSync(path.join(tmpdir(), 'signedout-'));
try {
  execFileSync(
    'npx',
    ['tsc', 'src/lib/query-client.ts', '--ignoreConfig', '--outDir', out,
     '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
  );
} catch {
  /* `@/` is unmapped without the project tsconfig; it emits anyway */
}

/* The emitted module requires react-query and AsyncStorage at load time, which
   is a lot of native surface to drag into a checker for the sake of two arrays.
   The arrays are literals, so they are read out of the emitted JS directly. */
const js = readFileSync(path.join(out, 'query-client.js'), 'utf8');
const listOf = (name) => {
  const m = js.match(new RegExp(`${name}\\s*=\\s*\\[([\\s\\S]*?)\\]`));
  return m ? [...m[1].matchAll(/'([^']+)'|"([^"]+)"/g)].map((x) => x[1] ?? x[2]) : null;
};
const device = listOf('DEVICE_KEYS');
const user = listOf('USER_KEYS');

if (!device || !user) {
  problems.push('không đọc được DEVICE_KEYS/USER_KEYS từ query-client.ts — luật này đang không kiểm gì cả');
}

/* ── 2. every key the app actually writes is classified ── */
const KNOWN_ELSEWHERE = new Map([
  /* Cleared by `clearPersistedCache()`, which runs beside this on sign-out. */
  ['ascnd_rq_cache', 'clearPersistedCache'],
  /* Module-scope state as well as a file — `resetPersonalModel()` owns it,
     because deleting the file alone leaves the previous person's model live in
     memory and it gets written straight back. */
  ['ascnd_personal_model_v1', 'resetPersonalModel'],
]);

if (device && user) {
  const files = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', 'src'],
    { cwd: NATIVE, encoding: 'utf8' },
  )
    .split('\n')
    .filter((f) => /\.tsx?$/.test(f));

  const found = new Set();
  for (const f of files) {
    let src;
    try {
      src = strip(readFileSync(path.join(NATIVE, f), 'utf8'));
    } catch {
      continue; // listed in the index, gone from disk
    }
    /* Only keys handed to AsyncStorage — a string that merely looks like one is
       not a stored key, and the point is what the app writes. */
    for (const m of src.matchAll(
      /AsyncStorage\.(?:getItem|setItem|removeItem)\(\s*['"]([^'"]+)['"]/g,
    )) {
      found.add(m[1]);
    }
    /* And the ones held in a constant, which is how most of them are written. */
    for (const m of src.matchAll(/(?:const|let)\s+\w*(?:KEY|Key)\w*\s*=\s*['"]((?:ascnd|health:)[^'"]+)['"]/g)) {
      found.add(m[1]);
    }
  }

  if (found.size < 8) {
    problems.push(`chỉ tìm thấy ${found.size} khoá AsyncStorage — bộ quét hỏng, đừng tin kết quả`);
  }

  const classified = new Set([...device, ...user, ...KNOWN_ELSEWHERE.keys()]);
  for (const key of [...found].sort()) {
    if (!classified.has(key)) {
      problems.push(
        `khoá '${key}' không nằm trong DEVICE_KEYS lẫn USER_KEYS — ` +
          'đăng xuất sẽ để nó lại cho tài khoản sau, và không ai quyết định điều đó',
      );
    }
  }

  /* ── 3. the two lists never overlap ── */
  for (const k of device) {
    if (user.includes(k)) {
      problems.push(`khoá '${k}' vừa là tuỳ chọn thiết bị vừa bị xoá khi đăng xuất — mâu thuẫn`);
    }
  }

  /* ── 4. the device list keeps the three things that must survive ── */
  for (const k of ['ascnd_lang', 'ascnd-volume-unit', 'ascnd_app_lock']) {
    if (!device.includes(k)) {
      problems.push(
        `'${k}' không còn được giữ lại — cho mượn máy đăng nhập một lần là ngôn ngữ/đơn vị/khoá app của chủ máy bị reset`,
      );
    }
    if (user.includes(k)) {
      problems.push(`'${k}' bị xoá khi đăng xuất — đây là tuỳ chọn của MÁY, không phải của tài khoản`);
    }
  }
}

/* ── 5. sign-out actually calls it ── */
{
  const auth = strip(readFileSync(path.join(NATIVE, 'src/hooks/use-auth.tsx'), 'utf8'));
  const at = auth.indexOf('const signOut');
  const body = at < 0 ? '' : auth.slice(at, auth.indexOf('\n  };', at));
  if (!body.includes('clearUserScopedStorage(')) {
    problems.push(
      'signOut không gọi clearUserScopedStorage — hai danh sách kia chỉ là hai mảng không ai dùng',
    );
  }
  if (!body.includes('clearPersistedCache(')) {
    problems.push('signOut không gọi clearPersistedCache');
  }
}

/* ── 6. resetting the model clears the load guard, not just the value ── */
{
  const pm = strip(readFileSync(path.join(NATIVE, 'src/lib/personal-model.ts'), 'utf8'));
  const at = pm.indexOf('export function resetPersonalModel');
  const body = at < 0 ? '' : pm.slice(at, pm.indexOf('\n}', at));
  if (!body) {
    problems.push('không tìm thấy resetPersonalModel — luật này đã lạc mục tiêu');
  } else if (!/loaded\s*=\s*false/.test(body)) {
    problems.push(
      'resetPersonalModel không đặt lại `loaded` — mô hình đã học được xoá khỏi bộ nhớ, ' +
        'nhưng cổng đọc-một-lần vẫn bật, nên tài khoản ĐĂNG NHẬP SAU không bao giờ được đọc mô hình ' +
        'của chính họ: hàng tuần nhịp sinh hoạt đã học của người quay lại bị vứt lặng lẽ',
    );
  }
}

/* ── 7. a weigh-in reaches the number every target is computed from ──

   Not strictly about signing out, but the same family and it has nowhere better
   to live: a value the app holds about the person that stops matching them.

   `useLogWeight` wrote `weight_logs` and stopped there, while every target —
   calories, protein, water — plus the BMI band and the protein reference weight
   are computed from `profiles.weight_kg`, a column written only at onboarding
   and in the Edit profile sheet. Somebody weighing in daily for six months was
   still being fed targets derived from the weight they started at, and the only
   cure was to know, unprompted, to open a settings sheet and press
   *Recalculate*.

   Both writers have to do it: the online mutation and the offline replay. A fix
   on one path only means it works until somebody logs their weight in a gym
   basement. */
{
  const shared = 'syncProfileWeight';
  for (const [file, what] of [
    ['src/hooks/use-fitness-data.ts', 'đường ghi trực tiếp'],
    ['src/lib/offline-write.ts', 'đường phát lại khi có mạng lại'],
  ]) {
    const src = strip(readFileSync(path.join(NATIVE, file), 'utf8'));
    if (!src.includes(`${shared}(`)) {
      problems.push(
        `${file}: ${what} ghi cân nặng mà không cập nhật profiles.weight_kg — ` +
          'mọi mục tiêu calo/đạm/nước vẫn tính từ cân nặng lúc bắt đầu, ' +
          'và người dùng không có cách nào biết là phải tự bấm "Tính lại"',
      );
    }
  }

  /* And it must stay a forward-only update, or a queued Tuesday weight replayed
     on Friday drags the profile backwards. */
  const sync = strip(readFileSync(path.join(NATIVE, 'src/lib/weight-sync.ts'), 'utf8'));
  if (!/\.gt\(\s*['"]date['"]/.test(sync)) {
    problems.push(
      'weight-sync.ts: không kiểm có lần cân nào MỚI HƠN chưa — ' +
        'một lần cân offline phát lại muộn sẽ ghi đè cân nặng hiện tại bằng số cũ',
    );
  }
}

if (problems.length) {
  console.log('đăng xuất còn sót:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  `đăng xuất OK — ${user.length} khoá của người dùng bị xoá và ${device.length} tuỳ chọn của MÁY ` +
    '(ngôn ngữ, đơn vị, khoá app) được giữ lại có chủ đích: quét sạch mọi khoá `ascnd*` sẽ khiến ' +
    'cho mượn máy đăng nhập một lần là chủ máy nhận lại máy ở tiếng Anh và kilogram; ' +
    'mọi khoá AsyncStorage tìm thấy trong src đều được phân loại vào đúng một danh sách, ' +
    'hai danh sách không giao nhau, và một khoá mới quên phân loại sẽ làm hỏng bước này; ' +
    'signOut gọi cả hai hàm dọn; và resetPersonalModel đặt lại cả cổng `loaded` — ' +
    'bản chỉ xoá giá trị khiến tài khoản đăng nhập sau không bao giờ đọc được mô hình của chính họ ' +
    '(bản đã ship để lại 16/17 khoá, trong đó chữ ký lịch nhắc làm người kế tiếp KHÔNG BAO GIỜ ' +
    'được đặt một thông báo nào trong khi giao diện vẫn bật hết). ' +
    'Kèm một giá trị khác cũng thôi khớp với người dùng: cả hai đường ghi cân nặng ' +
    '(trực tiếp và phát lại offline) đều cập nhật profiles.weight_kg — bản cũ chỉ ghi weight_logs, ' +
    'nên người cân mỗi ngày suốt sáu tháng vẫn ăn theo mục tiêu tính từ cân nặng lúc bắt đầu — ' +
    'và cập nhật chỉ đi tới, không để lần cân offline phát lại muộn kéo ngược con số',
);
