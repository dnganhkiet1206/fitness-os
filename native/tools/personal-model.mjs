/**
 * The one store in this app that *learns*.
 *
 * `personal-model.ts` accumulates, on the device and nowhere else, when this
 * person actually does each thing (circular statistics over the hour of day), a
 * Thompson-sampling belief about which quest to bring up, an appearance budget,
 * and a ring buffer of Koa moments already reacted to. Chain U made one of those
 * fields a live decision input for the first time — `riskHour` now comes from
 * `lateHour(habitFor('meal'), RISK_HOUR)` — so a wrong learned hour is no longer
 * cosmetic.
 *
 * ── the bug this was written for ──
 *
 * `ascnd_personal_model_v1` is **not** in `USER_KEYS`. Every other user-owned
 * key is deleted by `clearUserScopedStorage()` with an awaited `removeItem`;
 * this one is cleared only by `resetPersonalModel()`, which
 *
 *   · returns `void`, so the `await resetPersonalModel()` at its only call site
 *     is a no-op, and
 *   · clears the *disk* by scheduling `save()` — a `setTimeout(0)` that then
 *     does `AsyncStorage.setItem(...).catch(() => {})`.
 *
 * So `clearUserScopedStorage()` resolves while ALPHA's learned model is still on
 * disk. Measured against the real module and a real key-value store:
 *
 *     sau khi await clearUserScopedStorage() tương đương:
 *       bộ nhớ : sạch
 *       ổ đĩa  : VẪN LÀ MÔ HÌNH CỦA ALPHA
 *
 * The deferred write normally lands a tick later. When it does not — the process
 * is suspended on sign-out, or the write throws into that swallowed `catch` —
 * ALPHA's habit hours, bandit weights, `koaSeen` and level stay on the device,
 * and the next launch reads them into whoever signs in.
 *
 * ── and a claim in the file that was not true ──
 *
 * `loadPersonalModel`'s header says *"Anything missing or malformed falls back
 * to the fresh model rather than throwing"*. Only a `JSON.parse` throw is
 * caught. The parsed object's fields are spread in wholesale:
 *
 *     hours: { ...base.hours, ...(parsed.hours ?? {}) }
 *
 * so `{"hours":{"meal":"nope"}}` parses, is merged, and becomes live. `habit()`
 * then computes `r = sqrt(undefined)/undefined` → `NaN`, and `NaN < MIN_R` is
 * **false**, so the gate that exists to refuse a shapeless pattern passes it —
 * returning `{ hour: NaN }`. That reaches `riskHour`, and `streakInDanger`'s
 * `since < RISK_SPAN` is false for `NaN` for every hour of the day: the streak
 * nudge is switched off, permanently and silently.
 *
 * ── a mistake of mine that this chain caught ──
 *
 * Chain U's `koa-context.mjs` seeded the habit with `noteDone('meal', new Date(…))`
 * — the wrong arity and the wrong type. `toAngle` does `((hour % 24) + 24) % 24`,
 * and my dates were exactly 86 400 000 ms apart, which wraps to **0**. Twelve
 * identical angles gave R = 1 and a confident "habit at midnight" out of
 * nonsense. The bug Chain U reported was real and the fix stands — but the rule
 * only went red because that nonsense happened to land somewhere other than
 * `RISK_HOUR`. It is fixed there to feed real hours, and Rule F here keeps
 * `noteDone` honest at the boundary instead.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const out = mkdtempSync(path.join(tmpdir(), 'pmodel-'));

try {
  const shim = (rel, body) => {
    const dir = path.join(out, 'node_modules', rel);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: rel, main: 'index.js' }));
    writeFileSync(path.join(dir, 'index.js'), body);
  };
  /* A key-value store that records every call, so "did the reset actually reach
     the disk, and when" is a measurement rather than an assumption. */
  shim('@react-native-async-storage/async-storage',
    `const s = new Map();
     const log = [];
     let latency = 0;
     const wait = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : null);
     const A = {
       async getItem(k) { log.push(['get', k]); const w = wait(latency); if (w) await w; return s.has(k) ? s.get(k) : null; },
       async setItem(k, v) { const w = wait(latency); if (w) await w; log.push(['set', k]); s.set(k, String(v)); },
       async removeItem(k) { const w = wait(latency); if (w) await w; log.push(['remove', k]); s.delete(k); },
       _raw: (k) => (s.has(k) ? s.get(k) : null),
       _put: (k, v) => s.set(k, v),
       _log: log,
       _latency: (ms) => { latency = ms; },
     };
     module.exports = A; module.exports.default = A;`);
  shim('react', `module.exports = { useSyncExternalStore: (s, g) => g(), useMemo: (f) => f(), useEffect: (f) => { f(); }, useRef: (v) => ({ current: v }) };`);

  const LIB = readdirSync(path.join(NATIVE, 'src/lib')).filter((f) => f.endsWith('.ts')).map((f) => `src/lib/${f}`);
  try {
    execFileSync('npx', ['tsc', ...LIB, '--ignoreConfig', '--outDir', out, '--rootDir', 'src',
      '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck', '--lib', 'es2020,dom'],
      { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch { /* `@/` unmapped → TS2307; emits anyway */ }
  for (const rel of LIB) {
    const js = path.join(out, rel.replace(/^src\//, '').replace(/\.tsx?$/, '.js'));
    writeFileSync(js, readFileSync(js, 'utf8').replace(/require\("@\/(.*?)"\)/g, (_, p) => `require("../${p}")`));
  }

  writeFileSync(path.join(out, 'drive.cjs'), DRIVER());
  const raw = execFileSync('node', [path.join(out, 'drive.cjs')], { cwd: out, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const r = JSON.parse(raw.trim().split('\n').filter((l) => l.startsWith('{')).pop());
  if (r.harnessError) throw new Error(r.harnessError);
  const want = (ok, m) => { if (!ok) problems.push(m); };

  /* baseline — the harness has to have taught the model something real */
  want(
    r.alphaHabitHour !== null && Math.abs(r.alphaHabitHour - 1) < 0.5 && r.alphaRiskHour !== null,
    `ALPHA không học được thói quen nào để mà kiểm (giờ=${r.alphaHabitHour}) — bộ dò hỏng, đừng tin phần còn lại`,
  );
  want(
    r.oracleAgrees,
    `habit() lệch với phép tính vòng tròn độc lập (app=${r.alphaHabitHour}, oracle=${r.oracleHour}) — ` +
      'trung bình trên đường tròn, không phải trung bình số học',
  );

  /* A — the reset reaches the disk before it says it has */
  want(
    r.diskCleanRightAfterReset,
    'sau khi resetPersonalModel() trả về, mô hình của ALPHA VẪN CÒN trên đĩa — ' +
      'ascnd_personal_model_v1 không nằm trong USER_KEYS, nên nó không được xoá bằng removeItem có await ' +
      'như mọi khoá khác; nó chỉ được ghi đè bởi một save() hoãn qua setTimeout(0) rồi .catch(() => {}). ' +
      'clearUserScopedStorage() vì thế kết thúc trong lúc đĩa vẫn là của người vừa đăng xuất',
  );
  want(r.memoryCleanAfterReset, 'resetPersonalModel() không dọn state trong bộ nhớ');
  want(
    r.bravoLearnsNothingOfAlpha,
    `BRAVO đăng nhập ở lần khởi động sau và đọc được thói quen của ALPHA (giờ=${r.bravoHabitHour})`,
  );

  /* B — malformed persistence must not become a live model */
  want(
    r.malformedCases === r.malformedSafe,
    `${r.malformedCases - r.malformedSafe}/${r.malformedCases} mô hình lưu HỎNG vẫn thành mô hình đang chạy: ` +
      `${JSON.stringify(r.malformedFail)} — loadPersonalModel chỉ bắt được JSON.parse ném, ` +
      'còn các trường bên trong thì spread thẳng vào; habit() gặp NaN thì `NaN < MIN_R` là FALSE nên nó ' +
      'đi qua đúng cái cổng sinh ra để chặn, rồi trả về { hour: NaN }',
  );
  want(
    r.nanNeverBecomesRiskHour,
    `một HourStat hỏng cho ra riskHour=${r.nanRiskHour} — streakInDanger so \`since < RISK_SPAN\`, ` +
      'và với NaN thì phép so đó FALSE ở cả 24 giờ, nên lời nhắc chuỗi ngày tắt hẳn trong im lặng',
  );

  /* C — the learning boundary */
  want(
    r.badHoursRejected === r.badHoursCases,
    `${r.badHoursCases - r.badHoursRejected}/${r.badHoursCases} giá trị KHÔNG PHẢI SỐ HỮU HẠN vẫn đầu độc ` +
      `bộ cộng dồn: ${JSON.stringify(r.badHoursFail)} — sin/cos thành NaN, và NaN cộng gì cũng là NaN, ` +
      'nên MỘT quan sát hỏng giết vĩnh viễn thói quen của quest đó; tám quan sát tốt sau đó vẫn không cứu được. ' +
      '(Số hữu hạn thì VẪN cuộn vòng như tài liệu nói — −5 là 19:00 — và luật này không đụng tới)',
  );
  want(
    r.goodHoursStillLearned,
    'giờ hợp lệ không còn được học — chốt chặn đã đi quá tay',
  );

  /* D — replay semantics, stated rather than assumed */
  want(
    r.replayIsCumulative,
    `ghi cùng một quan sát 100 lần cho ra n=${r.replayN} — mô hình đếm quan sát, nên lặp lại PHẢI cộng dồn; ` +
      'nếu nó thành idempotent thì một người ăn trưa mỗi ngày sẽ mãi mãi chỉ có một quan sát',
  );
  want(
    r.koaSeenCapped,
    `koaSeen không còn bị chặn (${r.koaSeenLen}) — đây là vòng đệm khoảnh khắc gần đây, không phải lịch sử`,
  );

  /* E — the bandit stays a probability distribution */
  want(
    r.banditValid,
    `bandit ra thứ tự không hợp lệ với phần thưởng bệnh lý: ${JSON.stringify(r.banditFail)}`,
  );
} catch (e) {
  problems.push(`không dựng được phép thử mô hình cá nhân: ${e.message}`);
} finally {
  rmSync(out, { recursive: true, force: true });
}

if (problems.length) {
  console.log('mô hình học được còn hở:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'mô hình cá nhân OK — CHẠY THẬT personal-model trên một kho khoá-giá trị thật có ghi nhật ký: ' +
    'ALPHA học được thói quen ăn lúc 01:00 và habit() khớp một phép tính vòng tròn ĐỘC LẬP (trung bình trên ' +
    'đường tròn chứ không phải trung bình số học). Lỗi đã sửa: resetPersonalModel() nay XOÁ khoá trên đĩa và ' +
    'await được, nên khi clearUserScopedStorage() kết thúc thì cả bộ nhớ lẫn ổ đĩa đều sạch — bản đã ship để ' +
    'ascnd_personal_model_v1 ngoài USER_KEYS và chỉ ghi đè bằng một save() hoãn qua setTimeout(0) rồi nuốt lỗi, ' +
    'nên nó trả về trong lúc mô hình của người vừa đăng xuất vẫn nằm nguyên trên đĩa, và lần khởi động sau ' +
    'đọc nó vào phiên của người kế tiếp. Và một mô hình lưu HỎNG không còn thành mô hình đang chạy: ' +
    '`{"hours":{"meal":"nope"}}` từng parse được, được spread thẳng vào, rồi habit() trả { hour: NaN } — ' +
    'vì `NaN < MIN_R` là FALSE nên nó đi qua đúng cái cổng sinh ra để chặn — và NaN đó thành riskHour, ' +
    'nơi `since < RISK_SPAN` sai ở cả 24 giờ, tắt hẳn lời nhắc chuỗi ngày trong im lặng. ' +
    'Cộng với: giờ vô lý (NaN, Infinity, Date, chuỗi, âm) bị từ chối còn giờ hợp lệ vẫn học được; ' +
    'lặp lại một quan sát vẫn cộng dồn (mô hình đếm quan sát); koaSeen vẫn bị chặn ở mức trần; ' +
    'và bandit giữ thứ tự hợp lệ với phần thưởng bệnh lý',
);

function DRIVER() {
  return String.raw`
const AS = require('@react-native-async-storage/async-storage');
const PM = require('./lib/personal-model.js');
const { habit, emptyHours, observeHour, lateHour } = require('./lib/user-rhythm.js');
const { RISK_HOUR, RISK_SPAN, streakInDanger } = require('./lib/mascot-emotion.js');
const KEY = 'ascnd_personal_model_v1';
const o = {};
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 5; i++) await tick(); };
const D = (n = 0) => { const t = new Date(); t.setDate(t.getDate() - n);
  return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); };

/* INDEPENDENT circular mean — mean unit vector, then its direction and length.
   Written from the definition, not from observeHour/habit. */
function oracleHabit(hours) {
  if (hours.length < 6) return null;
  let sx = 0, sy = 0;
  for (const h of hours) { const a = (2 * Math.PI * h) / 24; sx += Math.cos(a); sy += Math.sin(a); }
  const mx = sx / hours.length, my = sy / hours.length;
  const R = Math.hypot(mx, my);
  if (R < 0.6) return null;
  let ang = Math.atan2(my, mx);
  if (ang < 0) ang += 2 * Math.PI;
  return { hour: (ang / (2 * Math.PI)) * 24, strength: R };
}

(async () => {
  /* ── baseline: ALPHA logs meals at 01:00 ── */
  await PM.resetPersonalModel();
  await settle();
  const HOURS = [1, 1, 1, 0, 2, 1, 1, 2];
  HOURS.forEach((h, i) => PM.noteDone('meal', h, D(i)));
  await settle();
  const hb = PM.habitFor('meal');
  o.alphaHabitHour = hb ? hb.hour : null;
  o.alphaRiskHour = lateHour(hb, RISK_HOUR);
  const orc = oracleHabit(HOURS);
  o.oracleHour = orc ? orc.hour : null;
  o.oracleAgrees = !!hb && !!orc && Math.abs(hb.hour - orc.hour) < 1e-9 &&
    Math.abs(hb.strength - orc.strength) < 1e-9;

  /* ── A. does the reset reach the disk before it returns? ── */
  o.diskBeforeReset = AS._raw(KEY) !== null;
  await PM.resetPersonalModel();          // exactly how clearUserScopedStorage calls it
  const disk = AS._raw(KEY);
  o.diskCleanRightAfterReset = disk === null || !/"n":[1-9]/.test(disk);
  o.memoryCleanAfterReset = PM.habitFor('meal') === null;
  await settle();

  /* the next launch: whatever is on disk is read into whoever signs in */
  const onDisk = AS._raw(KEY);
  let bravoHours = null;
  if (onDisk) { try { bravoHours = (JSON.parse(onDisk).hours || {}).meal ?? null; } catch {} }
  const bravoHabit = bravoHours ? habit(bravoHours) : null;
  o.bravoHabitHour = bravoHabit ? bravoHabit.hour : null;
  o.bravoLearnsNothingOfAlpha = bravoHabit === null;

  /* ── B. malformed persistence ── */
  const MALFORMED = [
    ['{}', {}],
    ['null', null],
    ['[]', []],
    ['"a string"', 'a string'],
    ['hours entry is a string', { hours: { meal: 'nope' } }],
    ['hours entry missing fields', { hours: { meal: { n: 9 } } }],
    ['hours entry has NaN-as-null', { hours: { meal: { n: 9, sin: null, cos: null } } }],
    ['n is a string', { hours: { meal: { n: '9', sin: 8, cos: 1 } } }],
    ['arms is a number', { arms: 5 }],
    ['arms entry is garbage', { arms: { meal: { a: 'x', b: null } } }],
    ['koaSeen is a string', { koaSeen: 'nope' }],
    ['unknown quest key', { hours: { telepathy: { n: 9, sin: 8, cos: 1 } } }],
  ];
  let safe = 0, fail = null;
  for (const [label, blob] of MALFORMED) {
    await PM.resetPersonalModel();
    await settle();
    AS._put(KEY, typeof blob === 'string' ? blob : JSON.stringify(blob));
    PM.__resetLoadedForTest ? PM.__resetLoadedForTest() : null;
    await PM.resetPersonalModel();       // clears loaded
    AS._put(KEY, typeof blob === 'string' ? blob : JSON.stringify(blob));
    await PM.loadPersonalModel();
    await settle();
    /* Whatever it decided, the model must still answer sanely: either no habit,
       or a habit whose hour is a real hour of a real day. */
    const h = PM.habitFor('meal');
    const ok = h === null || (Number.isFinite(h.hour) && h.hour >= 0 && h.hour < 24 &&
      Number.isFinite(h.strength) && h.strength >= 0 && h.strength <= 1);
    const rh = lateHour(h, RISK_HOUR);
    const rhOk = Number.isFinite(rh) && rh >= 0 && rh < 24;
    if (ok && rhOk) safe++; else if (!fail) fail = { label, habit: h, riskHour: rh };
  }
  o.malformedCases = MALFORMED.length; o.malformedSafe = safe; o.malformedFail = fail;

  /* the specific consequence: a NaN riskHour silences the nudge at every hour */
  await PM.resetPersonalModel(); await settle();
  AS._put(KEY, JSON.stringify({ hours: { meal: { n: 9, sin: 'x', cos: 'y' } } }));
  await PM.resetPersonalModel();
  AS._put(KEY, JSON.stringify({ hours: { meal: { n: 9, sin: 'x', cos: 'y' } } }));
  await PM.loadPersonalModel(); await settle();
  const badRisk = lateHour(PM.habitFor('meal'), RISK_HOUR);
  o.nanRiskHour = Number.isFinite(badRisk) ? badRisk : String(badRisk);
  o.nanNeverBecomesRiskHour = Array.from({ length: 24 }, (_, h) =>
    streakInDanger({ streak: 30, emptyToday: true, hour: h, riskHour: badRisk })).some(Boolean);

  /* ── C. the learning boundary ── */
  /* Two classes, and only one of them is wrong.

     A finite number WRAPS, by design: hours are a circle and toAngle does
     ((h % 24) + 24) % 24, so -5 is 19:00 and 24.5 is half past midnight. That
     is the documented arithmetic and it stays.

     A value that is not a finite number is different in kind: it makes sin and
     cos NaN, and NaN + anything is NaN for ever, so ONE bad observation
     poisons that quest's accumulator permanently. Nothing can recover it
     except a full reset. That is the class that must never be folded in. */
  const POISON = [NaN, Infinity, -Infinity, null, undefined, new Date(), {}, 'nope'];
  let rejected = 0, badFail = null;
  for (const v of POISON) {
    await PM.resetPersonalModel(); await settle();
    for (let i = 0; i < 8; i++) PM.noteDone('meal', v, D(i));
    /* and then eight perfectly good observations, which must still be learnable */
    for (let i = 0; i < 8; i++) PM.noteDone('meal', 14, D(i));
    await settle();
    const h = PM.habitFor('meal');
    const ok = !!h && Number.isFinite(h.hour) && Math.abs(h.hour - 14) < 0.001;
    if (ok) rejected++; else if (!badFail) badFail = { value: String(v), habit: h };
  }
  o.badHoursCases = POISON.length; o.badHoursRejected = rejected; o.badHoursFail = badFail;

  await PM.resetPersonalModel(); await settle();
  for (let i = 0; i < 8; i++) PM.noteDone('meal', 14, D(i));
  await settle();
  const good = PM.habitFor('meal');
  o.goodHoursStillLearned = !!good && Math.abs(good.hour - 14) < 0.001;

  /* ── D. replay semantics ── */
  await PM.resetPersonalModel(); await settle();
  for (let i = 0; i < 100; i++) PM.noteDone('meal', 9, D(0));
  await settle();
  const st = JSON.parse(AS._raw(KEY) || '{}').hours?.meal ?? { n: 0 };
  o.replayN = st.n;
  o.replayIsCumulative = st.n === 100;

  await PM.resetPersonalModel(); await settle();
  for (let i = 0; i < 200; i++) PM.koaSeenAdd('event:' + i);
  await settle();
  const seen = JSON.parse(AS._raw(KEY) || '{}').koaSeen ?? [];
  o.koaSeenLen = seen.length;
  o.koaSeenCapped = seen.length <= 40;

  /* ── E. the bandit under pathological reward ── */
  await PM.resetPersonalModel(); await settle();
  const rnd = (() => { let s = 42; return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648); })();
  let bFail = null;
  for (const n of [0, 1, 10, 100]) {
    for (let i = 0; i < n; i++) { PM.noteAsked('meal', D(i)); PM.noteDone('meal', 9, D(i)); }
    const order = PM.rankQuests(rnd);
    const uniq = new Set(order);
    if (order.length !== 5 || uniq.size !== 5 || order.some((k) => typeof k !== 'string')) {
      bFail = { n, order };
      break;
    }
  }
  o.banditValid = bFail === null; o.banditFail = bFail;

  console.log(JSON.stringify(o));
})().catch((e) => { console.log(JSON.stringify({ harnessError: String((e && e.stack) || e) })); });
`;
}
