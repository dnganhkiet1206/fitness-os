/**
 * What Koa is allowed to believe.
 *
 * `useKoaContext` is the one place in the app that reads several independent
 * derived states — the streak, the day's totals, the training stretch, whether
 * anybody is looking — and turns them into one object that a decision engine
 * acts on. Chains E, R and T all ended by pointing here.
 *
 * ── what it turned out to be, which is smaller than it looks ──
 *
 * It **fetches nothing**. `useKoaContext` reads `queryClient.getQueryData` for
 * two keys and calls two synchronous functions; `refreshKoaContext` re-reads
 * exactly two fields off the clock and the presence counter and is synchronous
 * throughout. Measured against the real modules, and it is why a whole family
 * of hypotheses does not apply: there is no in-flight window, so there is no
 * stale-refresh-overwrites-new, no generation counter to miss, no request that
 * can resolve after a user switch, and no read that can fail. That is a
 * property of the design, and this file states it so the next person does not
 * have to re-derive it.
 *
 * ── the user boundary, and which defence is actually load-bearing ──
 *
 * Both cache reads are keyed `[name, user.id, today]`. So BRAVO signing in
 * looks up BRAVO's key and misses; ALPHA's entry is never read even while it is
 * still in the cache. `clearPersistedCache()` also empties it on SIGNED_OUT —
 * but that call is deliberately **not awaited** (`use-auth` must return
 * promptly or sign-in deadlocks), so it races the next sign-in. The key is what
 * holds; the clear is belt and braces. Rule A proves the key by leaving ALPHA's
 * data in the cache on purpose and asking as BRAVO.
 *
 * ── unknown is not zero, and every field says so out loud ──
 *
 *   · `emptyToday` is `false` when the day is unread — never a worried face
 *     over a day nobody has read.
 *   · `state` is `UNKNOWN_STATE` with confidence `none`, and every branch that
 *     reads it is gated on `confidence !== 'none'`.
 *   · `streak` folds an unread cache to `0`, which is the safe direction: the
 *     only branch that reads it needs `>= 3` to fire.
 *
 * ── the bug this was written for ──
 *
 * `mascot-emotion.ts` documents `streakInDanger` as taking *"their own evening
 * — `riskHour` is the person's clock from `lib/user-rhythm.ts`, floored at
 * `RISK_HOUR`"*, and its header records that the held face and the event had
 * **already drifted once**, the event version having skipped the hour entirely.
 * That was fixed by making both call one function.
 *
 * They still disagreed, because they were called with different inputs. The
 * held face passes `lateHour(habitFor('meal'), RISK_HOUR)`. The event path went
 * through `useKoaContext`, which never set `riskHour` at all, and `decide` read
 * it as `{ ...ctx, riskHour: ctx.riskHour }` — a spread that assigns a field to
 * itself, which is what an intention looks like after the line that fulfilled
 * it was lost. `streakInDanger` then took `?? RISK_HOUR` and nobody saw
 * anything. For somebody who logs at one in the morning the two windows do not
 * overlap at all:
 *
 *     khuôn mặt lo (giờ của họ)  : 02:00–08:00
 *     sự kiện có lời (mặc định)  : 18:00–00:00
 *
 * so at 03:00 the face worries and the sentence never comes, and at 19:00 the
 * sentence arrives while the face is calm.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const out = mkdtempSync(path.join(tmpdir(), 'koactx-'));

try {
  const shim = (rel, body) => {
    const dir = path.join(out, 'node_modules', rel);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: rel, main: 'index.js' }));
    writeFileSync(path.join(dir, 'index.js'), body);
  };
  shim('react', `module.exports = { useMemo: (f) => f(), useRef: (v) => ({ current: v }), useEffect: (f) => { f(); }, useSyncExternalStore: (s, g) => g() };`);
  shim('@react-native-async-storage/async-storage',
    `const s = new Map();
     const A = { async getItem(k){return s.has(k)?s.get(k):null;}, async setItem(k,v){s.set(k,String(v));}, async removeItem(k){s.delete(k);} };
     module.exports = A; module.exports.default = A;`);
  /* The real QueryClient, from the real query-core the app ships. `useQueryClient`
     hands back whichever one the driver installed; `useAuth` hands back whoever
     the driver says is signed in. Nothing else about the hooks is replaced. */
  shim('@tanstack/react-query',
    `const core = require(${JSON.stringify(path.join(NATIVE, 'node_modules/@tanstack/query-core'))});
     const H = { client: null, user: null };
     module.exports = { ...core, useQueryClient: () => H.client, _h: H };`);

  const LIB = readdirSync(path.join(NATIVE, 'src/lib')).filter((f) => f.endsWith('.ts')).map((f) => `src/lib/${f}`);
  const HOOKS = ['src/hooks/use-koa-context.ts', 'src/hooks/use-user-state.ts'];
  try {
    execFileSync('npx', ['tsc', ...LIB, ...HOOKS, '--ignoreConfig', '--outDir', out, '--rootDir', 'src',
      '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck', '--lib', 'es2020,dom'],
      { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch { /* `@/` unmapped → TS2307; emits anyway */ }
  for (const rel of [...LIB, ...HOOKS]) {
    const js = path.join(out, rel.replace(/^src\//, '').replace(/\.tsx?$/, '.js'));
    const up = rel.startsWith('src/hooks/') ? '../' : '../';
    writeFileSync(js, readFileSync(js, 'utf8')
      .replace(/require\("@\/(.*?)"\)/g, (_, p) => `require("${up}${p}")`)
      /* `use-auth` is a .tsx provider full of Apple sign-in; the driver supplies
         the one field these hooks read from it. */
      .replace(/require\("\.\.\/hooks\/use-auth"\)/g, 'require("../auth.cjs")'));
  }
  writeFileSync(path.join(out, 'auth.cjs'),
    `const H = require('@tanstack/react-query')._h;
     module.exports = { useAuth: () => ({ user: H.user }) };`);
  /* `use-mascot-room` is only a type import in these two hooks; tsc erases it. */

  writeFileSync(path.join(out, 'drive.cjs'), DRIVER());
  const raw = execFileSync('node', [path.join(out, 'drive.cjs')], { cwd: out, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const r = JSON.parse(raw.trim().split('\n').filter((l) => l.startsWith('{')).pop());
  if (r.harnessError) throw new Error(r.harnessError);
  const want = (ok, m) => { if (!ok) problems.push(m); };

  /* the harness has to have built a real ALPHA context first */
  want(
    r.alphaStreak === 30 && r.alphaStateKnown && r.alphaEmptyToday === false,
    `ngữ cảnh của ALPHA không dựng được (streak=${r.alphaStreak}, state biết=${r.alphaStateKnown}) — ` +
      'bộ dò hỏng, đừng tin phần còn lại',
  );

  /* A — the user boundary */
  want(
    r.bravoStreak === 0 && !r.bravoStateKnown && r.bravoEmptyToday === false,
    `BRAVO đăng nhập và vẫn thấy giá trị của ALPHA (streak=${r.bravoStreak}, state biết=${r.bravoStateKnown}) — ` +
      'cả hai lần đọc cache đều phải khoá theo user.id; xoá cache là lớp phòng thứ hai và nó KHÔNG được await ' +
      'trong use-auth, nên nó đua với lần đăng nhập kế tiếp',
  );
  want(
    r.aliveAfterSwitch,
    'sau khi đổi tài khoản, ngữ cảnh không dựng lại được cho BRAVO — dữ liệu của BRAVO phải đọc được bình thường',
  );

  /* B — unknown is never zero */
  want(
    r.emptyCacheEmptyToday === false,
    `cache trống cho ra emptyToday=${r.emptyCacheEmptyToday} — ngày CHƯA ĐỌC không phải ngày TRỐNG, ` +
      'và nhầm hai cái đó là một khuôn mặt lo trên một ngày có thể đã ghi đủ',
  );
  want(
    r.emptyCacheStateNone,
    'cache trống không cho ra confidence=none — mọi nhánh đọc state đều gác trên đúng cờ đó',
  );
  want(
    r.unknownNeverWorries,
    'với cache trống, sự kiện streak_at_risk vẫn phát — một điều KHÔNG BIẾT không được thành một lời lo',
  );

  want(
    r.unknownNeverWelcomesBack,
    'mot trang thai "returning" voi confidence=none van duoc chao "welcome_back" — ' +
      'cau do khang dinh mot lich su chung; cong confidence !== none la thu duy nhat chan no',
  );
  want(
    r.knownStillWelcomesBack,
    'nguoi quay lai THAT (confidence cao) khong con duoc chao "welcome_back" — ' +
      'cong da di qua tay va chan ca thu no phai cho qua',
  );

  /* C — the person's own hour reaches the event, not just the face */
  want(
    r.ctxHasRiskHour,
    'useKoaContext không đặt riskHour — `decide` đọc nó, `streakInDanger` lấy `?? RISK_HOUR`, ' +
      'nên sự kiện có lời chạy trên giờ của người lạ trong khi khuôn mặt chạy trên giờ của chính họ ' +
      '(mascot-emotion.ts nói rõ hai bên đã lệch nhau một lần rồi, và bản sửa hợp nhất HÀM chứ không hợp nhất ĐẦU VÀO)',
  );
  want(
    r.nightOwlAgrees,
    `người ghi lúc 01:00: khuôn mặt lo trong khung ${r.faceWindow} còn sự kiện có lời trong khung ` +
      `${r.eventWindow} — hai khung không trùng nhau, nên đúng lúc họ sắp mất chuỗi thì không ai nói gì`,
  );
  want(
    r.strangerUnchanged,
    'người chưa có thói quen nào không còn dùng RISK_HOUR mặc định — lateHour phải rơi về sàn khi chưa biết gì',
  );

  /* D — refresh re-reads exactly the two live fields */
  want(
    r.refreshKeepsRest && r.refreshUpdatesLive,
    `refreshKoaContext ${r.refreshKeepsRest ? '' : 'làm mất một trường đã chụp; '}` +
      `${r.refreshUpdatesLive ? '' : 'không đọc lại hour/visible'}`,
  );

  /* E — the same context decides the same thing, always */
  want(r.idempotent, 'cùng một ngữ cảnh cho ra quyết định khác nhau qua 100 lần gọi');
  want(
    r.abaReacts,
    'ngữ cảnh A → B → A: lần quay lại A không còn ra cùng quyết định như lần đầu',
  );
} catch (e) {
  problems.push(`không dựng được phép thử ngữ cảnh Koa: ${e.message}`);
} finally {
  rmSync(out, { recursive: true, force: true });
}

if (problems.length) {
  console.log('ngữ cảnh Koa còn hở:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'ngữ cảnh Koa OK — CHẠY THẬT useKoaContext và useUserState trên một QueryClient THẬT (@tanstack/query-core ' +
    'của chính app): dữ liệu của ALPHA nằm nguyên trong cache mà BRAVO đăng nhập vẫn thấy streak 0 và ' +
    'state không xác định — cả hai lần đọc đều khoá theo user.id, và đó mới là lớp giữ, vì clearPersistedCache ' +
    'cố ý KHÔNG được await nên nó đua với lần đăng nhập kế tiếp; BRAVO vẫn dựng được ngữ cảnh của chính mình. ' +
    'Cache trống KHÔNG thành ngày trống (emptyToday=false), state ra confidence=none, và streak_at_risk im lặng — ' +
    'không-biết không bao giờ thành số 0 ở chỗ số 0 đổi hành vi. Lỗi đã sửa: useKoaContext nay đặt riskHour ' +
    'theo giờ của chính người đó (lateHour(habitFor("meal"), RISK_HOUR)), nên khuôn mặt lo và sự kiện có lời ' +
    'dùng CÙNG một khung giờ — bản đã ship để riskHour undefined và streakInDanger lấy `?? RISK_HOUR`, ' +
    'nên với người ghi lúc 01:00 hai khung là 02:00–08:00 và 18:00–00:00, không trùng nhau một giờ nào. ' +
    'refreshKoaContext chỉ đọc lại hour và visible và giữ nguyên phần đã chụp; cùng một ngữ cảnh qua 100 lần ' +
    'cho cùng một quyết định, và A→B→A quay lại đúng quyết định của A. ' +
    'Không có cửa sổ bất đồng bộ nào trong cả hai hàm, nên không có đua refresh để mà chặn',
);

function DRIVER() {
  return String.raw`
const { QueryClient } = require('@tanstack/react-query');
const H = require('@tanstack/react-query')._h;
const { useKoaContext, refreshKoaContext } = require('./hooks/use-koa-context.js');
const { decide } = require('./lib/koa-decide.js');
const { streakInDanger, RISK_HOUR, RISK_SPAN } = require('./lib/mascot-emotion.js');
const { lateHour } = require('./lib/user-rhythm.js');
const { koaMounted, resetKoaPresence } = require('./lib/koa-presence.js');
const { noteDone, resetPersonalModel, habitFor } = require('./lib/personal-model.js');

const ALPHA = 'aaaaaaaa-1111-1111-1111-111111111111';
const BRAVO = 'bbbbbbbb-2222-2222-2222-222222222222';
const o = {};
const ds = (n = 0) => { const t = new Date(); t.setDate(t.getDate() - n);
  return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); };
const TODAY = ds(0);

(async () => {
  const qc = new QueryClient();
  H.client = qc;
  koaMounted();                      // a figure is on screen, so decisions are not quieted

  /* ── ALPHA: a 30-day streak, a logged day, eight weeks of sessions ── */
  H.user = { id: ALPHA };
  const dates = Array.from({ length: 30 }, (_, i) => ds(i));
  qc.setQueryData(['mascot_streak', ALPHA, TODAY], { count: 30, loggedToday: true, loggedDates: dates, frozen: [] });
  qc.setQueryData(['daily_log', ALPHA, TODAY], { kcal: 2100, workout_count: 1, steps: 8000, acwr: 1.0 });
  qc.setQueryData(['workout_sessions', ALPHA, 56],
    Array.from({ length: 12 }, (_, i) => ({ date_time: ds(i * 4) + 'T09:00:00', session_rpe: 7, sets: [{ reps: 10 }] })));
  const a = useKoaContext();
  o.alphaStreak = a.streak;
  o.alphaStateKnown = !!a.state && a.state.confidence !== 'none';
  o.alphaEmptyToday = a.emptyToday;

  /* ── A. BRAVO signs in. ALPHA's entries are left in the cache ON PURPOSE ── */
  H.user = { id: BRAVO };
  const b = useKoaContext();
  o.bravoStreak = b.streak;
  o.bravoStateKnown = !!b.state && b.state.confidence !== 'none';
  o.bravoEmptyToday = b.emptyToday;
  o.alphaStillCached = !!qc.getQueryData(['mascot_streak', ALPHA, TODAY]);

  qc.setQueryData(['mascot_streak', BRAVO, TODAY], { count: 4, loggedToday: false, loggedDates: [ds(1), ds(2), ds(3), ds(4)], frozen: [] });
  qc.setQueryData(['daily_log', BRAVO, TODAY], { kcal: 0, workout_count: 0, steps: 0, acwr: null });
  const b2 = useKoaContext();
  o.aliveAfterSwitch = b2.streak === 4 && b2.emptyToday === true;

  /* ── B. an empty cache is not an empty day ── */
  H.user = { id: 'cccccccc-3333-3333-3333-333333333333' };
  const c = useKoaContext();
  o.emptyCacheEmptyToday = c.emptyToday;
  o.emptyCacheStateNone = !c.state || c.state.confidence === 'none';
  o.unknownNeverWorries = decide({ kind: 'streak_at_risk', id: 'risk', magnitude: 0.5 },
    { ...c, hour: 21 }).shouldReact === false;

  /* The greeting is the branch that reads the *situation*, and it is gated on
     confidence. A state that says "returning" while admitting it knows nothing
     must not produce "welcome back" — that sentence claims a shared history. */
  const greet = (state) => decide({ kind: 'koa_greeted', id: 'greet', magnitude: 0.4 },
    { hour: 10, streak: 0, state, emptyToday: false, visible: true, riskHour: 18 });
  o.unknownNeverWelcomesBack =
    greet({ situation: 'returning', confidence: 'none', because: 'chua biet gi' }).say !== 'welcome_back';
  o.knownStillWelcomesBack =
    greet({ situation: 'returning', confidence: 'high', because: 'vang 14 ngay' }).say === 'welcome_back';

  /* ── C. the person's own hour ── */
  await resetPersonalModel();
  /* Somebody who logs their meals at one in the morning.

     noteDone(quest, HOUR, dateStr) — an hour, not a Date. Chain V caught this
     seeding a Date here: toAngle does ((h % 24) + 24) % 24, and dates one day
     apart are 86,400,000 ms apart, which wraps to 0 every time. Twelve
     identical angles gave R = 1 and a confident "habit at midnight" out of
     nonsense, and this rule was only red because that nonsense happened to
     land somewhere other than RISK_HOUR. */
  for (let i = 0; i < 12; i++) {
    noteDone('meal', 1, '2026-01-' + String(1 + i).padStart(2, '0'));
  }
  H.user = { id: ALPHA };
  const owl = useKoaContext();
  o.ctxHasRiskHour = typeof owl.riskHour === 'number';

  const theirHour = lateHour(habitFor('meal'), RISK_HOUR);
  const windowOf = (from) => {
    const hrs = [];
    for (let h = 0; h < 24; h++) if (((((h - from) % 24) + 24) % 24) < RISK_SPAN) hrs.push(h);
    return hrs;
  };
  const face = windowOf(theirHour);
  const event = windowOf(owl.riskHour ?? RISK_HOUR);
  o.faceWindow = face[0] + ':00–' + ((face[face.length - 1] + 1) % 24) + ':00';
  o.eventWindow = event[0] + ':00–' + ((event[event.length - 1] + 1) % 24) + ':00';
  /* the two must agree at every hour of the day, for the same person */
  o.nightOwlAgrees = Array.from({ length: 24 }, (_, h) =>
    streakInDanger({ streak: 30, emptyToday: true, hour: h, riskHour: theirHour }) ===
    streakInDanger({ streak: 30, emptyToday: true, hour: h, riskHour: owl.riskHour })).every(Boolean);

  /* a stranger with no habit still gets the app's default */
  await resetPersonalModel();
  const stranger = useKoaContext();
  o.strangerUnchanged = (stranger.riskHour ?? RISK_HOUR) === RISK_HOUR;

  /* ── D. refresh re-reads exactly two fields ── */
  const captured = { ...useKoaContext(), hour: 3, visible: false, streak: 30 };
  const fresh = refreshKoaContext(captured);
  o.refreshKeepsRest = fresh.streak === 30 && fresh.emptyToday === captured.emptyToday &&
    fresh.state === captured.state && fresh.riskHour === captured.riskHour;
  o.refreshUpdatesLive = fresh.hour === new Date().getHours() && fresh.visible === true;

  /* ── E. idempotence, and A → B → A ── */
  const ctxA = { hour: 20, streak: 30, state: null, emptyToday: true, visible: true, riskHour: 18 };
  const ev = { kind: 'streak_at_risk', id: 'risk', magnitude: 0.5 };
  const first = JSON.stringify(decide(ev, ctxA));
  o.idempotent = Array.from({ length: 100 }, () => JSON.stringify(decide(ev, ctxA))).every((x) => x === first);
  const ctxB = { ...ctxA, emptyToday: false };
  decide(ev, ctxB);
  o.abaReacts = JSON.stringify(decide(ev, ctxA)) === first;

  resetKoaPresence();
  console.log(JSON.stringify(o));
})().catch((e) => { console.log(JSON.stringify({ harnessError: String((e && e.stack) || e) })); });
`;
}
