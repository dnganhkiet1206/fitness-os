#!/usr/bin/env node
/**
 * Golden cho thẻ sẵn sàng / ACWR (#527 Phase 4/9) — CHÍNH mã RN @ fac9ac2:
 * `readinessExplainText` / `readinessRecoText` / `readinessSubscores` /
 * `hasRecoverySignal` (`lib/readiness-i18n.ts`) và `acwrZone` / `loadComparison`
 * / `latestAcwr` (`lib/training-card.ts`), cộng hai biểu thức của
 * `readiness-gauge.tsx` (chép nguyên văn, không hàm nào export):
 *
 * - màu ô con (`:313`): `v >= 70 ? green : v >= 40 ? yellow : red`;
 * - dòng độ tin cậy (`:457–458`, `:841–847`): `measured = Object.keys(subs).length`,
 *   `measured > 0 ? readinessConfidence(measured) : null` — ẩn khi `high`.
 *
 *   ./build.sh && node gen-readiness.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/readiness-card-golden.json
 */
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const R = require('./out/readiness-i18n.js');
const T = require('./out/training-card.js');

const confidence = (n) => (n >= 3 ? 'high' : n === 2 ? 'medium' : 'low'); // readinessConfidence (engine :257)
const tokens = [
  null, '', 'hrv:62|rhr:55|sleep:80|load:35', 'hrv:50', 'hrv:50|rhr:50', 'sleep:20|load:35',
  'load:80', 'sleep:100|load:80|rhr:71|hrv:39.6', 'hrv:40|rhr:70|sleep:70.4|load:40',
  'Ngủ kém, tải cao — legacy prose', 'foo:10|bar:20', 'hrv:x|sleep:45', 'hrv:|rhr:30', 'load:0', 'sleep:-5|hrv:105',
  'hrv:62|hrv:10', 'rhr:44.5|sleep:44.5',
];
const explain = [];
for (const t of tokens) {
  const subs = R.readinessSubscores(t);
  const measured = Object.keys(subs).length;
  explain.push({
    token: t,
    subs,
    measured,
    confidence: measured > 0 ? confidence(measured) : null,
    recovery: R.hasRecoverySignal(t),
    text: Object.fromEntries(['vi', 'en', 'es'].map((l) => [l, R.readinessExplainText(t, l)])),
  });
}
const recoKeys = [null, '', ...Object.keys(R.READINESS_RECO), 'Some legacy prose sentence.'];
const reco = recoKeys.map((k) => ({ key: k, text: Object.fromEntries(['vi', 'en', 'es'].map((l) => [l, R.readinessRecoText(k, l)])) }));

const subColor = (v) => (v >= 70 ? 'green' : v >= 40 ? 'yellow' : 'red');
const tileColors = [0, 39, 39.9, 40, 69, 69.9, 70, 100].map((v) => ({ v, color: subColor(v) }));

const acwrs = [0, 0.3, 0.6499, 0.65, 0.7, 0.7999, 0.8, 1, 1.25, 1.3, 1.3001, 1.5, 1.6, 1.6001, 2, 3.4];
const acwr = acwrs.map((a) => ({ acwr: a, zone: T.acwrZone(a), comparison: T.loadComparison(a) }));

const latest = [
  [],
  [{ date: '2026-10-08', acwr: null }],
  [{ date: '2026-10-07', acwr: 1.1 }, { date: '2026-10-08', acwr: null }],
  [{ date: '2026-10-06', acwr: '0.9' }, { date: '2026-10-08', acwr: 1.4 }, { date: '2026-10-07', acwr: 2 }],
  [{ date: '2026-10-08', acwr: 'abc' }, { date: '2026-10-05', acwr: 0 }],
].map((rows) => ({ rows, latest: T.latestAcwr(rows) }));

process.stdout.write(JSON.stringify({
  source: 'native/src/lib/{readiness-i18n,training-card}.ts + readiness-gauge.tsx @ fac9ac2 — gen-readiness.mjs',
  bands: T.ACWR_BANDS,
  explain, reco, tileColors, acwr, latest,
}, null, 1) + '\n');
