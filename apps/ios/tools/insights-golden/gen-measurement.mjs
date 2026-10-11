#!/usr/bin/env node
/**
 * Golden cho ghi số đo cơ thể (#527, `log-measurement`) — `plausible.ts` +
 * `units.ts` @ fac9ac2 BIÊN DỊCH (`build.sh`); ba hàm của màn (`errorFor`,
 * `hasValue`, phần dựng `payload` của `save`) CHÉP NGUYÊN VĂN từ
 * `app/log-measurement.tsx:93-147` (chúng sống trong component, không có tệp
 * lib để biên dịch) — chỉ thay `fields` / `lUnit` / `i18n` bằng tham số.
 *
 * `i18n.outOfRange` là `'{min}|{max}|{unit}'` để tách ba vế mà test Swift so.
 *
 *   node gen-measurement.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/measurement-golden.json
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { BOUNDS, plausible } = require('./out/plausible.js');
const { displayLength, lengthLabel, lengthToCm } = require('./out/units.js');

const KEYS = [
  'neck_cm', 'shoulders_cm', 'chest_cm', 'waist_cm', 'hips_cm', 'bicep_left_cm', 'bicep_right_cm',
  'thigh_left_cm', 'thigh_right_cm', 'calf_left_cm', 'calf_right_cm', 'body_fat_pct',
];
const i18n = { outOfRange: '{min}|{max}|{unit}' };

// ── log-measurement.tsx:93-118, nguyên văn ──
function errorFor(fields, lUnit, key) {
  const raw = fields[key]?.trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return i18n.outOfRange.replace('{min}', '0').replace('{max}', '—').replace('{unit}', '');
  if (key === 'body_fat_pct') {
    return plausible('body_fat_pct', n) ? null
      : i18n.outOfRange
          .replace('{min}', String(BOUNDS.body_fat_pct.min))
          .replace('{max}', String(BOUNDS.body_fat_pct.max))
          .replace('{unit}', '%');
  }
  return plausible('circumference_cm', lengthToCm(n, lUnit)) ? null
    : i18n.outOfRange
        .replace('{min}', String(Math.round(displayLength(BOUNDS.circumference_cm.min, lUnit))))
        .replace('{max}', String(Math.round(displayLength(BOUNDS.circumference_cm.max, lUnit))))
        .replace('{unit}', lengthLabel(lUnit));
}

// ── :120-124 ──
function hasValue(fields) {
  return KEYS.some((key) => {
    const v = fields[key]?.trim();
    return v != null && v.length > 0 && !isNaN(Number(v));
  });
}

// ── :146-155 (phần dựng payload, bỏ `date`) ──
function payloadOf(fields, lUnit) {
  const payload = {};
  for (const key of KEYS) {
    const v = fields[key]?.trim();
    if (v && !isNaN(Number(v))) {
      payload[key] =
        key === 'body_fat_pct' ? Number(v) : Math.round(lengthToCm(Number(v), lUnit) * 10) / 10;
    }
  }
  return payload;
}

const enc = (x) => (typeof x === 'number' && !Number.isFinite(x) ? String(x) : x);
const split = (e) => (e == null ? null : (([min, max, unit]) => ({ min, max, unit }))(e.split('|')));

const TEXTS = [
  '', ' ', '0', '0.', '.5', '2', '1.9', '9.9', '10', '12', '12.5', '40', ' 40 ', '3.9', '3.93', '3.94', '4',
  '75', '75.1', '118.1', '118.11', '118.2', '299.99', '300', '300.1', '1e2', 'abc', 'Infinity', '-5', '33.333',
  '0x1f', ' 40',
];

let s = 2211;
const rnd = (n) => {
  s = (s * 1103515245 + 12345) % 2147483648;
  return Math.floor(s / 65536) % n;
};

const single = [];
for (const unit of ['cm', 'in'])
  for (const key of ['waist_cm', 'body_fat_pct'])
    for (const text of TEXTS) {
      const fields = { [key]: text };
      single.push({ unit, key, text, error: split(errorFor(fields, unit, key)), payload: enc(payloadOf(fields, unit)[key] ?? null) });
    }

const forms = [];
for (let i = 0; i < 200; i++) {
  const unit = rnd(2) ? 'cm' : 'in';
  const fields = {};
  for (const key of KEYS) if (rnd(3) === 0) fields[key] = TEXTS[rnd(TEXTS.length)];
  const errors = {};
  for (const key of KEYS) errors[key] = split(errorFor(fields, unit, key));
  const anyBad = KEYS.some((k) => errors[k] !== null);
  const payload = Object.fromEntries(Object.entries(payloadOf(fields, unit)).map(([k, v]) => [k, enc(v)]));
  forms.push({ unit, fields, errors, hasValue: hasValue(fields), canSave: hasValue(fields) && !anyBad, payload });
}

process.stdout.write(JSON.stringify({ single, forms }, null, 0).replace(/\},\{/g, '},\n{') + '\n');
