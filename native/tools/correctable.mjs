/**
 * That anything a person can type in, they can take back.
 *
 * ── the bug this generalises ──
 *
 * Two tables in this app could be written by hand and never corrected:
 * `sleep_logs` and `biometric_samples`. Both feed the readiness score, and the
 * biometric one feeds its largest term — HRV, scored as a robust z-score
 * against a **28-day** baseline. Typing 450 where 45 was meant therefore did
 * not produce one wrong day; it dragged the app's headline number for four
 * weeks, and because the score still came out between 0 and 100, no screen
 * looked broken. The person simply stopped recognising themselves in it.
 *
 * `sleep_logs` was worse in one specific way: `daily-log-service` reads the
 * *latest* night ending on a day, so a mistaken entry logged afterwards
 * **hides** the correct one rather than sitting beside it.
 *
 * ── why a rule and not two fixes ──
 *
 * The gap was invisible from inside either screen. Both looked complete: the
 * sleep screen charted a week, the biometrics screen charted a fortnight, and
 * neither had a row anybody could touch. It took listing every table the app
 * inserts into and asking which of them had a matching delete to see that three
 * of twelve did not.
 *
 * That question is worth asking on every future table, which is what this file
 * is. A logging app whose logs cannot be corrected is one typo away from
 * telling somebody a wrong thing about their body every morning, indefinitely.
 */
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const problems = [];

const files = globSync('src/**/*.{ts,tsx}', { cwd: NATIVE }).sort();
const code = new Map(files.map((f) => [f, strip(readFileSync(path.join(NATIVE, f), 'utf8'))]));
const all = [...code.values()].join('\n');

/**
 * Tables the app writes rows into on a person's behalf.
 *
 * Excluded, with reasons, because "insert" alone is not the test:
 *
 *   - `ai_conversations` / `ai_messages` — a transcript, deleted whole from the
 *     history panel rather than a row at a time.
 *   - `mascot_transactions` — an append-only ledger; correcting it is what the
 *     server-side RPCs exist to prevent.
 *   - `coach_memory` — deletable, and checked in detail by `coach-memory.mjs`.
 *   - `entitlements` — written by the store, never by a person.
 */
const HAND_WRITTEN = [
  'sleep_logs',
  'biometric_samples',
  'body_measurements',
  'weight_logs',
  'water_logs',
  'meal_entries',
  'workout_sessions',
  'supplement_intake_logs',
  'grocery_items',
  'progress_photos',
  'food_items',
  'workout_templates',
];

/**
 * Tables whose rows feed `daily_logs`, and therefore the readiness score.
 *
 * Deleting one of these has to rebuild the affected day *and today*, because
 * several readiness inputs are windows anchored at `new Date()` rather than at
 * the day being rebuilt — the 28-day HRV baseline, the 7-night sleep average,
 * the 7- and 28-day training loads. Rebuilding only the row's own day leaves
 * the Today screen showing a score derived from data that no longer exists,
 * and nothing about that looks wrong.
 */
const FEEDS_READINESS = ['sleep_logs', 'biometric_samples', 'workout_sessions'];

for (const table of HAND_WRITTEN) {
  const inserts = files.filter((f) => new RegExp(`from\\('${table}'\\)[\\s\\S]{0,60}?\\.insert`).test(code.get(f)));
  if (inserts.length === 0) continue; // nothing writes it by hand any more

  const deletes = files.filter((f) => new RegExp(`from\\('${table}'\\)[\\s\\S]{0,60}?\\.delete`).test(code.get(f)));
  if (deletes.length === 0) {
    problems.push(
      `${table}: app ghi vào được nhưng không xoá được — ` +
        'một lần gõ nhầm là vĩnh viễn, và người dùng không có cách nào sửa',
    );
    continue;
  }

  if (FEEDS_READINESS.includes(table)) {
    /* The delete and the rebuild have to be in the same function, or the row
       goes and the score it poisoned stays. */
    const withRebuild = deletes.filter((f) => /recomputeDailyLog/.test(code.get(f)));
    if (withRebuild.length === 0) {
      problems.push(
        `${table}: xoá được nhưng không gọi recomputeDailyLog — ` +
          'dòng dữ liệu biến mất còn điểm sẵn sàng tính từ nó thì ở lại',
      );
    }
  }
}

/*
  ── a delete somebody can actually reach ──

  The rule above asks whether a delete *exists in the codebase*. That is not the
  same question as whether a person can correct a mistake, and the gap between
  the two hid a real one: `useDeleteBodyMeasurement` was written, exported,
  correct — and called by no screen. `body_measurements` passed every check here
  while a waist typed as 800 instead of 80 stayed in the history table and in
  the trend chart above it for good.

  Which is the same shape as two other bugs found the same week: the coach's
  memory extractor that only ran from a button almost nobody presses, and the
  Health sync that only ran from three buttons. Machinery that is correct and
  unreachable looks exactly like machinery that works, from every angle except
  using the app.

  So every `useDelete*` hook has to be named by something under `app/` or
  `components/`. Hooks are the unit because that is how this app exposes a
  delete to a screen; a hook nothing imports is a feature nobody has.
*/
{
  const SCREENS = files.filter((f) => f.startsWith('src/app/') || f.startsWith('src/components/'));

  for (const [f, c] of code) {
    for (const m of c.matchAll(/export function (useDelete\w+)\(/g)) {
      const name = m[1];
      const used = SCREENS.some((g) => g !== f && new RegExp(`\\b${name}\\b`).test(code.get(g)));
      if (!used) {
        problems.push(
          `${name} (${f}): không màn hình nào gọi — ` +
            'hàm xoá có tồn tại nhưng người dùng không có nút nào để bấm, ' +
            'nên một lần gõ nhầm vẫn là vĩnh viễn',
        );
      }
    }
  }
}

/*
  ── a rebuild that could not read must not write ──

  `recomputeDailyLog` fires eleven queries and writes one row to `daily_logs` —
  the table the dashboard, the readiness score and the coach all read. Every
  result was destructured as `{ data: x }` with the `error` dropped, and every
  consumer reads `x ?? 0` or `x ?? []`. So a failed query did not fail. It
  became "there is none of that", and the day was written with the missing parts
  zeroed.

  That reached a person: sleep and biometrics logged and not appearing on the
  dashboard. Four of those selects name columns added by an unapplied migration,
  so on that database they failed every time — the insert succeeded, the rebuild
  "succeeded", and the day was stored as one with nothing in it. Nothing about
  that surfaces as an error, and nothing later corrects it.

  The rule is not "check every error everywhere". It is narrower: this one
  function persists a derived row, so it has to be able to refuse.
*/
{
  const svc = code.get('src/lib/daily-log-service.ts') ?? '';
  const fn = svc.slice(svc.indexOf('export async function recomputeDailyLog'));
  const body = fn.slice(0, fn.indexOf('\nexport ') === -1 ? fn.length : fn.indexOf('\nexport '));

  /* Any Error class, not the literal `new Error`. The rebuild's throws are a
     named `DailyLogRebuildError` now, so that callers can tell "the write
     failed" from "the summary failed" and stop rolling back rows the server
     really did delete — and a rule pinned to the exact constructor turned that
     fix into a red step while the behaviour it cares about was untouched. */
  if (!/\.error\)/.test(body) || !/throw new \w*Error\(/.test(body)) {
    problems.push(
      'daily-log-service.ts: recomputeDailyLog không kiểm lỗi truy vấn trước khi ghi — ' +
        'một truy vấn hỏng sẽ thành "không có dữ liệu loại đó", và ngày bị ghi đè với phần thiếu bằng 0 ' +
        'vào đúng bảng mà dashboard, điểm sẵn sàng và coach đều đọc',
    );
  }
  /* Destructuring the data straight out of Promise.all is the shape that makes
     the error unreachable — it is how the bug was written the first time. */
  if (/\[\s*\{ data:/.test(body)) {
    problems.push(
      'daily-log-service.ts: vẫn bóc thẳng { data: … } từ Promise.all — ' +
        'bóc như vậy thì trường error không còn chỗ nào để kiểm, và truy vấn hỏng trở nên vô hình',
    );
  }
}

/*
  ── signing out takes the notifications with it ──

  Reminders are scheduled a horizon ahead — around fifty of them across seven
  days. Signing out dropped the cached data and cancelled none of them, so a
  phone handed on, or signed into by somebody else, went on firing the previous
  account's schedule until the horizon ran out.

  Not a data bug and not visible from inside the app, which is why it sat there:
  everything on screen was correct for whoever was signed in. The wrongness only
  existed on the lock screen of a person who was not.
*/
{
  const auth = code.get('src/hooks/use-auth.tsx') ?? '';
  const signOut = auth.slice(auth.indexOf('const signOut'));
  if (!/cancelAllReminders\(\)/.test(signOut.slice(0, signOut.indexOf('};') + 2))) {
    problems.push(
      'use-auth.tsx: đăng xuất không huỷ thông báo đã hẹn — ' +
        'máy vẫn nhắc theo lịch của tài khoản cũ tới hết chân trời 7 ngày, ' +
        'kể cả khi người khác đã đăng nhập vào',
    );
  }
}

/*
  ── the rebuild covers today, not just the row's own day ──

  Checked on the shape rather than by name, because there are three of these
  hooks now and a fourth will be written the same way. Two `recomputeDailyLog`
  calls with a `day !== today` guard between them is that shape.
*/
{
  /*
    Only the files that delete from a readiness-feeding table.

    The first version asked this of anything that deleted and recomputed, and
    fired on `use-nutrition` — which is correct as written: meals feed
    `daily_logs.kcal` and nothing else, and none of readiness's inputs is a
    nutrition window anchored at today. A rule that demands a second rebuild
    where no window exists is asking for a query that can never change anything.
  */
  const hooks = files.filter((f) => {
    const c = code.get(f);
    if (!/recomputeDailyLog/.test(c) || !/\.delete\(\)/.test(c)) return false;
    return FEEDS_READINESS.some((t) => new RegExp(`from\\('${t}'\\)[\\s\\S]{0,60}?\\.delete`).test(c));
  });
  /*
    Per delete-hook, not per file.

    The first version counted `recomputeDailyLog` calls across the whole file,
    and `use-fitness-data.ts` holds three of these hooks. Removing the second
    rebuild from the sleep one therefore passed on the strength of the workout
    one sitting below it — the same shape of miss as counting a function's own
    declaration as a call site, which this project has now made twice.
  */
  for (const f of hooks) {
    const c = code.get(f);
    for (const m of c.matchAll(/export function (useDelete\w+)\(/g)) {
      const name = m[1];
      const rest = c.slice(m.index);
      const next = rest.slice(1).search(/\nexport (function|const) /);
      const fn = next < 0 ? rest : rest.slice(0, next + 1);
      if (!/\.delete\(\)/.test(fn)) continue;
      const table = fn.match(/from\('(\w+)'\)/)?.[1] ?? '';
      if (!FEEDS_READINESS.includes(table)) continue;

      const calls = [...fn.matchAll(/recomputeDailyLog\(/g)].length;
      if (calls < 2) {
        problems.push(
          `${f}: ${name} chỉ dựng lại một ngày sau khi xoá — ` +
            'các cửa sổ 7/28 ngày neo vào hôm nay, nên hôm nay cũng phải được dựng lại',
        );
      } else if (!/day !== today/.test(fn)) {
        problems.push(
          `${f}: ${name} không kiểm \`day !== today\` trước lần dựng thứ hai`,
        );
      }
    }
  }
}

/*
  ── a delete needs somewhere to be pressed ──

  A hook nobody calls is the same as no hook. This is how the gap survived: the
  data layer was not the problem, the screens simply never listed a row.
*/
for (const [table, screen, hook] of [
  ['sleep_logs', 'src/app/sleep-insights.tsx', 'useDeleteSleepLog'],
  ['biometric_samples', 'src/app/biometrics.tsx', 'useDeleteBiometricSample'],
]) {
  const s = code.get(screen);
  if (!s) {
    problems.push(`${screen}: không còn tồn tại — luật này cần sửa lại chứ không phải bỏ đi`);
    continue;
  }
  if (!new RegExp(hook).test(s)) {
    problems.push(`${screen}: không dùng ${hook} — ${table} lại không sửa được từ giao diện`);
  }
  if (!/Alert\.alert/.test(s)) {
    problems.push(`${screen}: xoá không hỏi lại — mất một đêm hoặc một lần đo vì chạm nhầm là không lấy lại được`);
  }
}

/**
 * The self-test.
 *
 * The insert-without-delete rule is the one worth proving, because the state it
 * catches is the state this app was in: perfectly working screens, no error
 * anywhere, and a mistake nobody could undo.
 */
const SELF = [
  /*
    The reachability rules. Both rebuild a version that shipped, and both of
    those versions passed every other check in this file — which is the point:
    "a delete exists" and "somebody can delete" are different questions, and
    only the first one was ever being asked.
  */
  ['hàm xoá không màn nào gọi — bị bắt', () => {
    const lib = 'export function useDeleteBodyMeasurement() {}';
    const screens = ['export default function Progress() { const { data } = useBodyMeasurements(); }'];
    const name = lib.match(/export function (useDelete\w+)\(/)[1];
    return !screens.some((g) => new RegExp(`\\b${name}\\b`).test(g));
  }],
  ['hàm xoá có màn gọi — không báo oan', () => {
    const lib = 'export function useDeleteBodyMeasurement() {}';
    const screens = ['const removeMeasurement = useDeleteBodyMeasurement();'];
    const name = lib.match(/export function (useDelete\w+)\(/)[1];
    return screens.some((g) => new RegExp(`\\b${name}\\b`).test(g));
  }],
  ['dựng lại ngày mà không kiểm lỗi — bị bắt', () => {
    const bad = 'const [{ data: meals }, { data: sleeps }] = await Promise.all([...]);\nconst kcal = meals?.reduce(f) ?? 0;';
    return /\[\s*\{ data:/.test(bad) && !/throw new Error/.test(bad);
  }],
  ['có kiểm lỗi rồi ném — không báo oan', () => {
    const good = 'const [mealsRes] = await Promise.all([...]);\nif (failed.length > 0) { throw new Error("x"); }\nconst meals = mealsRes.data;';
    return !/\[\s*\{ data:/.test(good) && /throw new Error/.test(good) && /\.error\)/.test('failed.filter(([, r]) => r.error)');
  }],
  ['đăng xuất không huỷ nhắc nhở — bị bắt', () => {
    const bad = 'const signOut = async () => {\n  await supabase.auth.signOut();\n  await clearPersistedCache();\n};';
    return !/cancelAllReminders\(\)/.test(bad);
  }],
  ['ghi mà không xoá — bị bắt', () => {
    const f = "await supabase.from('sleep_logs').insert({ x: 1 });";
    return /from\('sleep_logs'\)[\s\S]{0,60}?\.insert/.test(f) && !/from\('sleep_logs'\)[\s\S]{0,60}?\.delete/.test(f);
  }],
  ['có cả hai — không bị bắt', () => {
    const f = "supabase.from('sleep_logs').insert({});\nsupabase.from('sleep_logs').delete().eq('id', id);";
    return /from\('sleep_logs'\)[\s\S]{0,60}?\.delete/.test(f);
  }],
  ['file không đụng bảng readiness thì không bị đòi dựng lại hôm nay', () => {
    const c = "supabase.from('meal_entry_items').delete();\nawait recomputeDailyLog(u, localDateStr());";
    return !['sleep_logs', 'biometric_samples', 'workout_sessions']
      .some((t) => new RegExp(`from\\('${t}'\\)[\\s\\S]{0,60}?\\.delete`).test(c));
  }],
  ['xoá một ngày — bị bắt', () => {
    const f = "await supabase.from('x').delete();\nawait recomputeDailyLog(u, day);";
    return [...f.matchAll(/recomputeDailyLog\(/g)].length < 2;
  }],
  ['hook bên cạnh không cứu được hook thiếu', () => {
    const file =
      "export function useDeleteA() {\n supabase.from('sleep_logs').delete();\n recomputeDailyLog(u, day);\n}\n" +
      "export function useDeleteB() {\n supabase.from('workout_sessions').delete();\n recomputeDailyLog(u, day);\n if (day !== today) recomputeDailyLog(u, today);\n}";
    const first = file.slice(file.indexOf('export function useDeleteA'));
    const cut = first.slice(1).search(/\nexport (function|const) /);
    const body = cut < 0 ? first : first.slice(0, cut + 1);
    return [...body.matchAll(/recomputeDailyLog\(/g)].length < 2;
  }],
];
const missed = SELF.filter(([, fn]) => !fn()).map(([l]) => l);
if (missed.length) {
  console.error(`phép tự kiểm hỏng — không bắt được: ${missed.join('; ')}; đừng tin kết quả`);
  process.exit(2);
}

if (problems.length) {
  console.log('sửa sai được hay không:\n');
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}

const counted = HAND_WRITTEN.filter((t) =>
  files.some((f) => new RegExp(`from\\('${t}'\\)[\\s\\S]{0,60}?\\.insert`).test(code.get(f))),
).length;
console.log(
  `sửa sai được OK — ${counted} bảng người dùng tự ghi, bảng nào cũng xoá được; ` +
    'ba bảng nuôi điểm sẵn sàng đều dựng lại cả ngày của dòng đó lẫn hôm nay; ' +
    'giấc ngủ và sinh trắc có danh sách bấm được, và xoá thì hỏi lại; ' +
    'mọi hàm useDelete* đều có ít nhất một màn hình gọi tới (hàm xoá không ai bấm được thì không phải là sửa được); ' +
    'đăng xuất huỷ luôn thông báo đã hẹn; ' +
    'và recomputeDailyLog từ chối ghi một ngày mà nó không đọc được đủ dữ liệu',
);
