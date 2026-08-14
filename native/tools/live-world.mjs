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
  workout_sessions: [{
    id: 'k1', user_id: UID, date_time: day(0.4), template_name: 'Push A',
    volume_load: 8450, session_rpe: 7, sets: [], source: 'manual',
  }],
  meal_entries: [{
    id: 'm1', user_id: UID, date_time: day(0.25), meal_type: 'breakfast',
    total_kcal: 520, total_protein_g: 38, total_carbs_g: 54, total_fat_g: 14, total_fiber_g: 7,
  }],
};
