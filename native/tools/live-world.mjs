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

export const REF = 'drqgonxrtmomgrftelih';
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
        ...Array.from({ length: 3 }, (_, n) => ({
          exerciseId: '', exerciseName: 'Bench Press', setIndex: n + 1, weight: 55, reps: bench,
        })),
        ...Array.from({ length: 3 }, (_, n) => ({
          exerciseId: '', exerciseName: 'Pull-up', setIndex: n + 4, weight: 0, reps: pull,
        })),
      ],
      source: 'manual',
    })),
  ],
  meal_entries: [{
    id: 'm1', user_id: UID, date_time: day(0.25), meal_type: 'breakfast',
    total_kcal: 520, total_protein_g: 38, total_carbs_g: 54, total_fat_g: 14, total_fiber_g: 7,
  }],
};
