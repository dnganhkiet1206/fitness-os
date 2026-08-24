import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The world the app wakes up in, for every tool that boots it.
 *
 * ── why this is its own file ──
 *
 * It was inside `live.mjs`. A second tool then needed the same identity, the
 * constants were copied across by hand, and **the project reference was typed
 * from memory and wrong** — so the app quietly rejected the seeded session,
 * every boot landed on the Sign In screen, and the tool measured a login form
 * while reporting on a mascot.
 *
 * That is the exact failure this codebase keeps finding in its own app code:
 * one rule, two copies, and the copy is wrong in a way nothing errors about.
 * A harness gets to make that mistake once.
 *
 * Everything here is fake and local. The reference names no real project, the
 * token is never verified by anything, and the rows exist so that the app has
 * a coherent day to render.
 */

/**
 * Đọc ra từ `backend.ts`, không gõ lại.
 *
 * Ref này dựng khoá localStorage `sb-<ref>-auth-token` mà supabase-js tìm phiên
 * đăng nhập trong đó. Gõ cứng thì nó lệch khỏi URL thật ngay lần đổi project
 * đầu tiên, và hậu quả không phải một lỗi — mà là MỌI ảnh chụp trở thành màn
 * chưa đăng nhập, trông y như app hỏng. Lấy từ nguồn thì không lệch được.
 */
const backendTs = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'backend.ts'),
  'utf8',
);
const refMatch = backendTs.match(/https:\/\/([a-z0-9]+)\.supabase\.co/);
if (!refMatch) throw new Error('live-world: không đọc được project ref từ src/lib/backend.ts');
export const REF = refMatch[1];
export const UID = '11111111-2222-3333-4444-555555555555';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
export const jwt = () =>
  `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({
    sub: UID,
    role: 'authenticated',
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 86400 * 30,
    email: 'demo@ascnd.app',
  })}.signature-not-checked-here`;

export const day = (n) => new Date(Date.now() - n * 864e5).toISOString();
export const dayStr = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

/**
 * What the server answers in `full` mode.
 *
 * The numbers are chosen so the canary can recognise them. `1,680 / 2,450 kcal`
 * is 69% with 770 remaining, and nothing but this app's own arithmetic over
 * this exact row produces that pair.
 */
export const FIXTURES = {
  profiles: [{
    user_id: UID, name: 'Kiệt', sex: 'male', date_of_birth: '1996-04-12',
    height_cm: 174, weight_kg: 71.5, goal: 'recomp', activity_level: 'moderate',
    training_level: 'intermediate', onboarding_completed: true,
    tdee_target_kcal: 2450, macro_protein_g: 160, macro_carbs_g: 250,
    macro_fat_g: 75, macro_fiber_g: 30, sleep_target_hours: 8,
    waketime: '06:30', bedtime: '23:00', dietary_preference: 'omnivore', coins: 1240,
  }],
  daily_logs: [{
    id: 'dl1', user_id: UID, date: dayStr(0), kcal: 1680, protein_g: 118,
    carbs_g: 165, fat_g: 52, fiber_g: 21, steps: 8432, active_kcal: 486,
    active_minutes: 41, water_ml: 1750, readiness_score: 74,
    sleep_duration_min: 431, workout_count: 1, volume_load: 8450,
    acwr: 1.08, hrv_today: 62, rhr_today: 54,
  }],
  sleep_logs: [{
    id: 's1', user_id: UID, bedtime: day(1), waketime: day(0.7), quality: 8,
    deep_min: 92, rem_min: 104, light_min: 235, asleep_min: 431, source: 'apple_health',
  }],
  biometric_samples: [{
    id: 'b1', user_id: UID, date_time: day(0.2), hr_bpm: 54, hrv_sdnn_ms: 62,
    hrv_rmssd_ms: null, spo2_pct: 97, resp_rate_rpm: 14, vo2max_mlkgmin: 48,
    source: 'apple_health', confidence: 0.9,
  }],
  water_logs: [{ id: 'w1', user_id: UID, amount_ml: 1750, date: dayStr(0), logged_at: day(0.3) }],
  weight_logs: [
    { id: 'g1', user_id: UID, weight_kg: 71.5, date: dayStr(0) },
    { id: 'g2', user_id: UID, weight_kg: 72.1, date: dayStr(7) },
    { id: 'g3', user_id: UID, weight_kg: 72.8, date: dayStr(21) },
  ],
  /*
    Two sessions, not one, and the second one is deliberately lighter.

    `sessions.tsx` draws each row's volume bar as `volume / peak`, so a fixture
    with a single session gives the only bar the runner can see a ratio of
    exactly 1 — permanently full, on every shot, forever. A full bar looks the
    same whether it grows from its left edge or from its own centre, so that
    fixture could not have caught `BarFill` losing `transformOrigin: 'left'`,
    which is the one way that component can draw a wrong quantity while
    type-checking clean and throwing nothing.

    3,200 / 8,450 is 38%: far enough from both ends that a wrong origin, a
    wrong clamp or a reversed direction all land somewhere visibly different.
  */
  /*
    The sessions carry real sets now, and there are enough of them to hold a
    trend.

    Two sessions with `sets: []` was enough for every screen that reads a
    session as a single row — the diary, the volume bar, the load windows — and
    it was nothing at all to Exercise Intelligence, which reads *inside* the
    sets and needs several sessions of the same movement before it will say
    anything. A fixture that produces INSUFFICIENT_DATA for every exercise
    cannot show whether the engine works.

    Two histories, chosen because they are the two the specification uses:
    a bench press that is progressing on reps at a fixed load, and a pull-up
    that is not moving. The pull-up is also the case where the body is the load,
    so it exercises the weigh-in lookup rather than only the arithmetic.
  */
  workout_sessions: [
    ...[
      /* days ago, bench reps, pull-up reps */
      [0.4, 10, 8],
      [2.4, 9, 8],
      [5.4, 9, 9],
      [8.4, 8, 8],
      [12.4, 8, 8],
      [15.4, 7, 9],
    ].map(([d, bench, pull], i) => ({
      id: `k${i + 1}`,
      user_id: UID,
      date_time: day(d),
      template_name: i % 2 === 0 ? 'Push A' : 'Pull A',
      volume_load: Math.round(55 * bench * 3),
      session_rpe: 7,
      sets: [
        /* A warm-up, so the flag is exercised on a real screen: it must not
           count toward the volume, the best set, or a record. */
        { exerciseId: '', exerciseName: 'Bench Press', setIndex: 0, weight: 30, reps: 12, warmup: true },
        ...Array.from({ length: 3 }, (_, n) => ({
          exerciseId: '', exerciseName: 'Bench Press', setIndex: n + 1, weight: 55, reps: bench,
        })),
        ...Array.from({ length: 3 }, (_, n) => ({
          exerciseId: '', exerciseName: 'Pull-up', setIndex: n + 4, weight: 0, reps: pull,
        })),
        /* A hold. Nothing else in this fixture has a duration, so without it the
           whole `timed` path — the kind, the seconds index, the card that shows
           them — is never drawn by anything. */
        { exerciseId: '', exerciseName: 'Plank', setIndex: 7, weight: 0, durationSec: 40 + (6 - i) * 4 },
        /*
          The one movement where the DECLARED kind and the inferred kind
          disagree, which is the only way a screenshot can show that the
          declaration is being read at all.

          A dumbbell curl is loaded, so inference calls it `compound` and
          computes an estimated one-rep-max for it. The library row says
          `isolation`, and `usesE1rm` refuses one — a curl's one-rep-max is not
          a smaller version of a squat's, it is a category error. Every other
          exercise in this fixture is classified the same either way, so without
          this row the authoritative branch was never drawn.
        */
        { exerciseId: '', exerciseName: 'Dumbbell Curl', setIndex: 8, weight: 12, reps: 10 + (6 - i) },
      ],
      source: 'manual',
    })),

  /*
    Two more histories, for the two states a screenshot could not otherwise
    reach: a movement abandoned months ago, and one whose sessions disagree.

    Both are cards that LOOK confident and must not be acted on, which is
    exactly the kind of thing only a rendered screen shows. They sit in their
    own sessions rather than in the six above, because a stale movement has to
    be absent from the recent ones to be stale at all.
  */
  ...[
    /* Overhead Press: four sessions, then nothing for ten weeks. */
    [96, 'Overhead Press', 35, 6],
    [89, 'Overhead Press', 35, 7],
    [82, 'Overhead Press', 35, 8],
    [75, 'Overhead Press', 35, 9],
    /*
      Lat Pulldown: trained recently, and the sessions disagree with each other.

      Every rep count is 10 or under on purpose. The first draft used 12 for one
      session and the estimate refused it — past `E1RM_MAX_REPS` there is no
      index — so that session was dropped, the series fell to three points, and
      the drawdown came out under the threshold. The fixture had stopped
      producing the state it existed to show.

      3 rather than 4 for the bad session, too: at 4 the drawdown is exactly
      15.0% and the rule is `> 15%`, so the fixture sat precisely on the
      boundary and produced neither state reliably. 3 gives 17.5%.
    */
    [24, 'Lat Pulldown', 50, 10],
    [17, 'Lat Pulldown', 50, 3],
    [10, 'Lat Pulldown', 50, 9],
    [3, 'Lat Pulldown', 50, 5],
  ].map(([d, name, w, r], i) => ({
    id: `x${i + 1}`,
    user_id: UID,
    date_time: day(d),
    template_name: name,
    volume_load: Math.round(w * r * 3),
    session_rpe: 7,
    sets: Array.from({ length: 3 }, (_, n) => ({
      exerciseId: '', exerciseName: name, setIndex: n + 1, weight: w, reps: r,
    })),
    source: 'manual',
  })),
  ],
  /*
    A library, so the DECLARED half of the taxonomy is exercised.

    `exercise_kind` is the authoritative answer and inference is the fallback;
    with no `exercises` rows at all, every screenshot in this repository was
    taken with inference doing the whole job, and the branch that reads a
    declaration had never been drawn. Plank is the case that matters: nothing in
    a duration says whether it is a hold or an isolation movement done slowly.
  */
  exercises: [
    { id: 'e1', user_id: null, name: 'Bench Press', muscle_group: 'Ngực', equipment: 'Barbell', exercise_kind: 'compound' },
    { id: 'e2', user_id: null, name: 'Pull-up', muscle_group: 'Lưng', equipment: 'Bodyweight', exercise_kind: 'bodyweight' },
    { id: 'e3', user_id: UID, name: 'Plank', muscle_group: 'Bụng', equipment: 'Bodyweight', exercise_kind: 'timed' },
    { id: 'e4', user_id: UID, name: 'Dumbbell Curl', muscle_group: 'Bắp tay trước', equipment: 'Dumbbell', exercise_kind: 'isolation' },
  ],
  /*
    A routine, so the week's day panel actually draws exercise rows.

    Every screenshot of `/routine` in this repository has been of a REST DAY:
    with no `routine_days` and no `workout_templates` in the fixture, the panel
    renders "this day has no workout on it" and the rows underneath — the set
    ticks, the effort chips, and now the trend chip beside each exercise name —
    have never once been drawn by anything.

    All seven days point at the same template on purpose: the harness runs on
    whatever weekday it happens to be, and a routine that only covers Monday
    produces a rest day six times out of seven.
  */
  workout_templates: [{
    id: 't1', user_id: UID, name: 'Push A', type: 'strength',
    created_at: day(30),
    exercises: [
      { exerciseName: 'Bench Press', sets: 3, reps: 10, weight: 55, rpe: 8, restSeconds: 120 },
      { exerciseName: 'Pull-up', sets: 3, reps: 8, weight: 0, rpe: 8, restSeconds: 120 },
      { exerciseName: 'Lat Pulldown', sets: 3, reps: 10, weight: 50, rpe: 7, restSeconds: 90 },
    ],
  }],
  routine_days: Array.from({ length: 7 }, (_, i) => ({
    id: `rd${i}`, user_id: UID, day_of_week: i, is_rest: false, is_deload: false,
    notes: '', template_id: 't1',
  })),
  meal_entries: [{
    id: 'm1', user_id: UID, date_time: day(0.25), meal_type: 'breakfast',
    total_kcal: 520, total_protein_g: 38, total_carbs_g: 54, total_fat_g: 14, total_fiber_g: 7,
  }],
};
