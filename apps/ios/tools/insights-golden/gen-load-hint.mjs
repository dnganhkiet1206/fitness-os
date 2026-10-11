#!/usr/bin/env node
/**
 * Golden cho gợi ý tải của `log-workout` (#527) — @ fac9ac2.
 *
 * BIÊN DỊCH (`build.sh`): `user-state.ts` (`userStateFrom`, `UNKNOWN_STATE`),
 * `load-progression.ts` (`suggestLoad`), `goal-training.ts` (`goalRpeTarget`),
 * `prescription.ts` (`effortRange`), `readiness-i18n.ts` (`hasRecoverySignal`).
 *
 * CHÉP NGUYÊN VĂN từ `app/log-workout.tsx` (chỉ thay state React bằng tham
 * số): `askedRpe` (:279-286), `loadHint` (:288-357) — câu chữ thay bằng
 * `{ up, name, aim, pct }` (chữ là việc của bảng dịch).
 *
 * Chạy với `TZ=Asia/Ho_Chi_Minh`: `progressionOf` lấy ngày LOCAL của
 * `date_time` (`localDateStr(new Date(…))`).
 *
 *   TZ=Asia/Ho_Chi_Minh node gen-load-hint.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/load-hint-golden.json
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { userStateFrom, UNKNOWN_STATE } = require('./out/user-state.js');
const { suggestLoad } = require('./out/load-progression.js');
const { goalRpeTarget } = require('./out/goal-training.js');
const { effortRange } = require('./out/prescription.js');
const { hasRecoverySignal } = require('./out/readiness-i18n.js');

if (process.env.TZ !== 'Asia/Ho_Chi_Minh') throw new Error('chạy với TZ=Asia/Ho_Chi_Minh');

let s = 52711;
const rnd = (n) => {
  s = (s * 1103515245 + 12345) % 2147483648;
  return Math.floor(s / 65536) % n;
};
const pick = (xs) => xs[rnd(xs.length)];

const TODAY = '2026-10-11';
const shift = (d, n) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

// ── 1. userStateFrom ──
const ACWR = [null, null, 0.4, 1.0, 1.49, 1.5, 1.51, 2.3];
const VOL = [0, 0, '0', '', null, 'x', 800, 1000, 1040, 1060, 1200, '950.5', 3000];
const userState = [];
for (let i = 0; i < 300; i++) {
  const kind = rnd(6);
  const span = [5, 13, 14, 20, 30, 60, 90][rnd(7)];
  const density = [0.1, 0.3, 0.6, 0.9][rnd(4)];
  const loggedDates = [];
  for (let d = 0; d < span; d++) if (rnd(100) < density * 100) loggedDates.push(shift(TODAY, -d));
  // Vắng: bỏ một đoạn gần đây, để có `returning` / `slipping`.
  if (kind === 1) {
    const gap = 2 + rnd(10), keep = rnd(3);
    for (let k = loggedDates.length - 1; k >= 0; k--) {
      const off = Math.round((Date.parse(`${TODAY}T00:00:00Z`) - Date.parse(`${loggedDates[k]}T00:00:00Z`)) / 864e5);
      if (off > keep && off <= keep + gap) loggedDates.splice(k, 1);
    }
    if (!loggedDates.includes(shift(TODAY, -keep))) loggedDates.push(shift(TODAY, -keep));
  }
  if (kind === 2) loggedDates.push(shift(TODAY, 1 + rnd(3))); // ngày tương lai (đồng hồ sai)
  if (kind === 3 && loggedDates.length) loggedDates.push(loggedDates[0]); // trùng
  loggedDates.sort(() => 0).reverse();
  const acwr = pick(ACWR);
  let sessions;
  if (rnd(3) > 0) {
    sessions = [];
    // `kind === 4`: tập đều, không kỷ lục, khối lượng phẳng — để có `stalled`.
    const flat = kind === 4;
    const n = flat ? 8 + rnd(8) : rnd(12);
    for (let k = 0; k < n; k++) {
      const day = flat ? rnd(56) : rnd(70) - 2;
      const hour = pick([0, 5, 6, 12, 18, 23]);
      // Giờ UTC: 23:00Z hôm trước là 06:00 sáng ở Hà Nội.
      const iso = `${shift(TODAY, -day)}T${String(hour).padStart(2, '0')}:30:00+00:00`;
      sessions.push({
        date_time: rnd(25) === 0 ? 'hỏng' : iso,
        volume_load: flat ? pick([1000, 1040, 1060, '1020']) : pick(VOL),
        pr_detected: flat && rnd(6) > 0 ? false : pick([null, false, false, false, true, 'true']),
      });
    }
  }
  const st = userStateFrom({ loggedDates, today: TODAY, acwr, sessions });
  userState.push({
    input: { loggedDates, acwr, sessions: sessions ?? null },
    out: { situation: st.situation, confidence: st.confidence, recent: st.recent, baseline: st.baseline, trend: st.trend, daysQuiet: st.daysQuiet },
  });
}

// ── 2. suggestLoad ──
const RPE = [null, null, 0, 6, 6, 7, 7, 7, 8, 8, 9, 9, 10, '8', ' 7 ', 'x', 7.5, -1];
const TARGET = [null, null, 0, 6, 7, 7.5, 8, 8.5, 9, 10];
const GOAL = [null, '', 'strength', ' Strength ', 'STRENGTH', 'bulk', 'endurance', 'lose', 'maintain', 'constructor'];
const SIT = [undefined, 'settling_in', 'steady', 'slipping', 'returning', 'overreaching', 'stalled'];
const CONF = [undefined, 'none', 'low', 'medium', 'high'];
const READY = [null, 'green', 'yellow', 'red', 'red'];
const EXPLAIN = [null, '', 'load:45', 'hrv:62|load:30', 'sleep:80', 'rhr:55', 'load:20|sleep:40', 'x'];
const suggest = [];
for (let i = 0; i < 600; i++) {
  const n = rnd(10);
  const reported = Array.from({ length: n }, () => pick(RPE));
  const input = {
    reported, target: pick(TARGET), goal: pick(GOAL), situation: pick(SIT), situationConfidence: pick(CONF),
    readiness: pick(READY), readinessExplain: pick(EXPLAIN),
  };
  const r = suggestLoad(input);
  suggest.push({
    input: { ...input, situation: input.situation ?? null, situationConfidence: input.situationConfidence ?? null },
    recovery: hasRecoverySignal(input.readinessExplain),
    out: { advice: r.advice, confidence: r.confidence, step: r.step, target: r.target },
  });
}

// ── 3. màn: `askedRpe` + `loadHint` ──
const NAMES = ['', '  ', 'Push', 'push ', ' PUSH', 'Pull', 'Legs', 'Ngực', 'ngực'];
const hint = [];
for (let i = 0; i < 300; i++) {
  const name = pick(NAMES);
  const templates = [];
  for (let k = rnd(4); k > 0; k--) {
    const exs = Array.from({ length: rnd(4) }, () => (rnd(4) === 0 ? {} : { rpe: pick([6, 7, 8, 9, 10]) }));
    templates.push({ name: pick(['Push', ' push', 'Pull', 'Legs', 'Ngực', null]), exercises: exs });
  }
  // Phần lớn buổi mang đúng tên đang gõ (khác hoa / dấu cách), để có câu gợi ý.
  const base = rnd(4) === 0 ? null : 5 + rnd(5);
  const recentSessions = Array.from({ length: rnd(9) }, () => ({
    template_name: rnd(3) > 0 ? pick([name, ` ${name.toUpperCase()}`, name.toLowerCase()]) : pick(['Pull', 'Ngực', null, '']),
    session_rpe: base == null ? pick(RPE) : rnd(5) === 0 ? pick(RPE) : base + rnd(3),
  }));
  const goal = pick(GOAL);
  const userStateIn = pick([UNKNOWN_STATE,
    { situation: 'overreaching', confidence: 'high' }, { situation: 'returning', confidence: 'low' },
    { situation: 'returning', confidence: 'none' }, { situation: 'steady', confidence: 'medium' }]);
  const readinessStatus = pick(READY);
  const explain = pick(EXPLAIN);

  // ── :279-286 ──
  const askedRpe = (() => {
    const key = name.trim().toLowerCase();
    if (!key) return null;
    const tpl = (templates ?? []).find((t) => (t.name ?? '').trim().toLowerCase() === key);
    const exs = Array.isArray(tpl?.exercises) ? tpl.exercises : [];
    const band = effortRange(exs);
    return band ? (band[0] + band[1]) / 2 : null;
  })();
  // ── :288-357 ──
  const loadHint = (() => {
    const key = name.trim().toLowerCase();
    if (!key) return null;
    const mine = (recentSessions ?? []).filter((s) => (s.template_name ?? '').trim().toLowerCase() === key);
    if (mine.length === 0) return null;
    const suggestion = suggestLoad({
      reported: mine.map((s) => s.session_rpe),
      target: askedRpe,
      goal,
      situation: userStateIn.situation,
      situationConfidence: userStateIn.confidence,
      readiness: readinessStatus,
      readinessExplain: explain,
    });
    if (suggestion.advice === 'unknown' || suggestion.advice === 'hold') return null;
    const pct = Math.round(Math.abs(suggestion.step) * 100);
    const aim = suggestion.target;
    return { up: suggestion.advice === 'up', name: name.trim(), aim, pct };
  })();
  hint.push({
    name, templates, recentSessions, goal, situation: userStateIn.situation, confidence: userStateIn.confidence,
    readiness: readinessStatus, recovery: hasRecoverySignal(explain), askedRpe, hint: loadHint,
  });
}

process.stdout.write(
  JSON.stringify({
    today: TODAY,
    goalTarget: Object.fromEntries(GOAL.map((g) => [String(g), goalRpeTarget(g)])),
    userState, suggest, hint,
  }, null, 0).replace(/\},\{"input"/g, '},\n{"input"').replace(/\},\{"name"/g, '},\n{"name"') + '\n',
);
