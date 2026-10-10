#!/usr/bin/env node
/**
 * Golden cho Ảnh tiến trình (#527) — `app/progress-photos.tsx` +
 * `lib/photo-urls.ts` @ fac9ac2.
 *
 * `signPhotos` là mã RN biên dịch (`build.sh`), chạy với một hàm ký giả
 * (loạt hỏng / path hỏng / ném) để ghim cách chia loạt, bỏ trùng và rơi về
 * đường dẫn khi ký hỏng. Tấm so sánh không export: chép NGUYÊN VĂN
 * `nearestOnOrBefore` + phép tính hiệu + `deltaText` (`progress-photos.tsx:335-388`).
 *
 *   node gen-progress-photos.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/progress-photos-golden.json
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { signPhotos } = require('./out/photo-urls.js');

let seed = 9001;
const rnd = (n) => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return Math.floor(seed / 65536) % n;
};
const day = (k) => {
  const d = new Date(Date.UTC(2026, 0, 1 + k));
  return d.toISOString().slice(0, 10);
};

// progress-photos.tsx:335-341
function nearestOnOrBefore(rows, date) {
  let best = null;
  for (const r of rows) {
    if (r.date <= date && (best === null || r.date > best.date)) best = r;
  }
  return best;
}
// :358-388
function compare(before, after, weightHistory, measurements) {
  const wBefore = nearestOnOrBefore(weightHistory, before.date);
  const wAfter = nearestOnOrBefore(weightHistory, after.date);
  const mBefore = nearestOnOrBefore(measurements.filter((m) => m.waist_cm != null), before.date);
  const mAfter = nearestOnOrBefore(measurements.filter((m) => m.waist_cm != null), after.date);
  const weightDelta = wBefore && wAfter ? Math.round((wAfter.value - wBefore.value) * 10) / 10 : null;
  const waistDelta =
    mBefore?.waist_cm != null && mAfter?.waist_cm != null
      ? Math.round((mAfter.waist_cm - mBefore.waist_cm) * 10) / 10
      : null;
  const deltaText = (v, unit) => {
    if (v === null) return '—';
    const sign = v > 0 ? '+' : '';
    return `${sign}${v}${unit}`;
  };
  return {
    wBefore: wBefore?.value ?? null,
    wAfter: wAfter?.value ?? null,
    mBefore: mBefore?.waist_cm ?? null,
    mAfter: mAfter?.waist_cm ?? null,
    weightDelta,
    waistDelta,
    weightText: deltaText(weightDelta, 'kg'),
    waistText: deltaText(waistDelta, 'cm'),
  };
}

const compares = [];
for (let i = 0; i < 150; i++) {
  const weights = [];
  for (let k = 0; k < 60; k++) if (rnd(4) === 0) weights.push({ date: day(k), value: Math.round((60 + rnd(400) / 10) * 10) / 10 });
  const measurements = [];
  for (let k = 0; k < 60; k++) {
    if (rnd(6) !== 0) continue;
    const w = [null, 70, 72.5, 80.25, 91.1, 88][rnd(6)];
    measurements.push({ date: day(k), waist_cm: w });
  }
  const a = rnd(60), b = rnd(60);
  const before = { date: day(Math.min(a, b)) }, after = { date: day(Math.max(a, b)) };
  compares.push({ before: before.date, after: after.date, weights, measurements, out: compare(before, after, weights, measurements) });
}

// signPhotos: ký giả có lỗi theo kịch bản.
async function signCase(rows, mode, chunk) {
  const calls = [];
  const sign = async (paths) => {
    calls.push(paths);
    if (mode === 'throw' && calls.length === 2) throw new Error('boom');
    if (mode === 'error' && calls.length === 1) return { data: null, error: { message: 'x' } };
    return {
      data: paths.map((p) => (p.includes('bad') ? { path: p, signedUrl: null } : { path: p, signedUrl: `https://s/${p}?t=1` })),
      error: null,
    };
  };
  const out = await signPhotos(rows, sign, chunk);
  return { calls, urls: out.map((r) => r.signedUrl) };
}
const signs = [];
for (let i = 0; i < 40; i++) {
  const n = rnd(9);
  const rows = [];
  for (let k = 0; k < n; k++) {
    const r = rnd(10);
    const photo_url = r === 0 ? `https://cdn/x${k}.jpg` : r === 1 ? `u/bad-${k}.jpg` : r === 2 && k > 0 ? rows[k - 1].photo_url : `u/2026-01-0${k}-front-${k}.jpg`;
    rows.push({ id: `p${k}`, photo_url });
  }
  const mode = ['ok', 'ok', 'error', 'throw'][rnd(4)];
  const chunk = [100, 2, 3][rnd(3)];
  signs.push({ rows, mode, chunk, ...(await signCase(rows, mode, chunk)) });
}

process.stdout.write(JSON.stringify({ compares, signs }, null, 1) + '\n');
