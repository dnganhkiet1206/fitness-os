#!/usr/bin/env node
/**
 * Golden cho nhập chỉ số sinh trắc (#527, `log-biometrics`) — @ fac9ac2.
 *
 * BIÊN DỊCH (`build.sh`): `plausible.ts` (`outOfRangeMessage`, `BOUNDS`),
 * `health-owned.ts` (`healthValues`, `overriddenFields`, `HEALTH_OWNED_BIOMETRICS`).
 *
 * CHÉP NGUYÊN VĂN từ `app/log-biometrics.tsx` (chỉ thay state React bằng tham
 * số): `num` (:91), `errors` (:103-112), `hasAnyInput` (:122-123), `values`
 * (:137-145), phép đếm của `save` (:152-157).
 *
 * `i18n.outOfRange` là `'{min}|{max}|{unit}'`; đơn vị nhịp thở là `'BREATH'`.
 *
 *   node gen-biometric-log.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/biometric-log-golden.json
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { BOUNDS, outOfRangeMessage } = require('./out/plausible.js');
const { HEALTH_OWNED_BIOMETRICS, fromHealth, healthValues, overriddenFields } = require('./out/health-owned.js');

const i18n = { outOfRange: '{min}|{max}|{unit}', biometricsBreathUnit: 'BREATH' };
const split = (e) => (e == null ? null : (([min, max, unit]) => ({ min, max, unit }))(e.split('|')));

let s = 4242;
const rnd = (n) => {
  s = (s * 1103515245 + 12345) % 2147483648;
  return Math.floor(s / 65536) % n;
};

const TEXTS = ['', ' ', '0', '1', '4', '10', '19', '20', '45', '50', '55.5', '60', '62', '97', '100', '100.1', '250', '251',
  '500', '501', '3.9', '-5', '.5', '5.', 'abc', '0x1f', '1e2', ' 60 '];

const forms = [];
for (let i = 0; i < 300; i++) {
  // Năm ca đầu cố định: trống hết; chỉ ốm; chỉ đau nhức; chỉ dấu cách; chỉ một ô.
  const fixed = [
    [['', '', '', '', ''], null, false], [['', '', '', '', ''], null, true], [['', '', '', '', ''], 3, false],
    [[' ', '', '', '', ''], null, false], [['', '', '', '', '14'], null, false],
  ][i];
  const [hr, hrv, spo2, vo2, resp] = fixed ? fixed[0] : [0, 0, 0, 0, 0].map(() => (rnd(3) === 0 ? '' : TEXTS[rnd(TEXTS.length)]));
  const soreness = fixed ? fixed[1] : rnd(3) === 0 ? 1 + rnd(10) : null;
  const ill = fixed ? fixed[2] : rnd(4) === 0;
  // ── :91 ──
  const num = (v) => (v.trim() ? Number(v) : null);
  // ── :103-112 ──
  const errors = {
    hr: outOfRangeMessage('hr_bpm', hr, i18n.outOfRange),
    hrv: outOfRangeMessage('hrv_ms', hrv, i18n.outOfRange),
    spo2: outOfRangeMessage('spo2_pct', spo2, i18n.outOfRange),
    vo2: outOfRangeMessage('vo2max_mlkgmin', vo2, i18n.outOfRange),
    resp: outOfRangeMessage('resp_rpm', resp, i18n.outOfRange, i18n.biometricsBreathUnit),
  };
  const anyBad = Object.values(errors).some(Boolean);
  // ── :122-123 ──
  const hasAnyInput = (hr || hrv || spo2 || vo2 || resp).length > 0 || soreness !== null || ill;
  // ── :137-145 ──
  const values = {
    hr_bpm: num(hr),
    hrv_rmssd_ms: num(hrv),
    spo2_pct: num(spo2),
    vo2max_mlkgmin: num(vo2),
    resp_rate_rpm: num(resp),
    soreness_1_10: soreness,
    illness_flag: ill,
  };
  const enc = (x) => (typeof x === 'number' && !Number.isFinite(x) ? String(x) : x);
  forms.push({
    texts: { hr, hrv, spo2, vo2, resp }, soreness, ill,
    errors: Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, split(v)])),
    hasAnyInput, canSave: hasAnyInput && !anyBad,
    values: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, enc(v)])),
  });
}

// ── số của Health hôm nay + phép đếm của `save` (:152-157) ──
const SOURCES = [null, '', 'manual', ' manual', 'apple_health', 'healthkit'];
const VAL = [null, 0, -1, 58, '61', 'x', 97.5, 14];
const health = [];
for (let i = 0; i < 200; i++) {
  const row = { source: SOURCES[rnd(SOURCES.length)], hr_bpm: VAL[rnd(VAL.length)], spo2_pct: VAL[rnd(VAL.length)], resp_rate_rpm: VAL[rnd(VAL.length)] };
  const owned = healthValues(row, HEALTH_OWNED_BIOMETRICS);
  const typed = [TEXTS[rnd(TEXTS.length)], TEXTS[rnd(TEXTS.length)], TEXTS[rnd(TEXTS.length)]];
  const num = (v) => (v.trim() ? Number(v) : null);
  const changed = overriddenFields(owned, { hr_bpm: num(typed[0]), spo2_pct: num(typed[1]), resp_rate_rpm: num(typed[2]) });
  health.push({ row, fromHealth: fromHealth(row), owned, typed, changes: changed.length });
}

process.stdout.write(
  JSON.stringify({
    BOUNDS: { hr: BOUNDS.hr_bpm, hrv: BOUNDS.hrv_ms, spo2: BOUNDS.spo2_pct, vo2: BOUNDS.vo2max_mlkgmin, resp: BOUNDS.resp_rpm },
    owned: HEALTH_OWNED_BIOMETRICS, forms, health,
  }, null, 0).replace(/\},\{/g, '},\n{') + '\n',
);
