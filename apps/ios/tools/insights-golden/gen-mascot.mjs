#!/usr/bin/env node
/**
 * Golden cho phòng linh vật (#527 Phase 7, `app/mascot-room.tsx` @ fac9ac2):
 * CHÍNH `native/src/lib/mascot-room.ts` và `native/src/lib/streak.ts` biên dịch
 * — bảng nhiệm vụ, XP theo `ref_key`, cấp, hạng, thưởng chuỗi, băng chuỗi,
 * `streakFrom` / `missedDates` — cùng hai biểu thức màn dựng trên chúng (chép
 * nguyên văn, không hàm nào export):
 *
 * - ví (`use-mascot-room.ts:100–118`): `balance = Σ amount`, `xp = Σ xpForRefKey(ref_key)`;
 * - tiêu đề năng lượng (`mascot-room.tsx:410–417`): 0 → empty; đủ → full; ≥3 → mid; còn lại low.
 *
 *   ./build.sh && node gen-mascot.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/mascot-golden.json
 */
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const m = require('./out/mascot-room.js');
const s = require('./out/streak.js');

const refKeys = [
  'welcome', 'dev:1700000000000', 'buy:cape', 'freeze:6f1c', 'w:1234', 'w:',
  'ch:bronze:2026-10-05:steps_week', 'ch:silver:2026-10-05:x', 'ch:gold:a:b', 'ch:platinum:a:b', 'ch:diamond:a:b', 'ch:',
  'set:gym', 'set:runner', 'set:tet', 'set:xmas', 'set:halloween', 'set:nope',
  'd:2026-10-08:meal', 'd:2026-10-08:workout', 'd:2026-10-08:water', 'd:2026-10-08:sleep', 'd:2026-10-08:steps',
  'd:2026-10-08:streak', 'd:2026-10-08:dance', 'd:2026-1-08:meal', 'd:2026-10-08:', 'D:2026-10-08:meal', 'd:2026-10-08:meal:extra',
];
const xp = refKeys.map((k) => ({ refKey: k, xp: m.xpForRefKey(k) }));

const xps = [0, 1, 119, 120, 121, 239, 240, 479, 480, 1079, 1080, 2279, 2280, 3999, 6480, 6481, 100000];
const levels = xps.map((x) => ({ xp: x, level: m.levelFromXp(x), into: x % m.LEVEL_XP }));

const ranks = [];
for (let level = 0; level <= 70; level++) {
  const r = m.rankForLevel(level);
  const n = m.nextRank(level);
  ranks.push({ level, rank: r.key, next: n ? n.key : null });
}

const streakCoins = [];
for (let k = 0; k <= 15; k++) streakCoins.push({ streak: k, coins: m.streakCoins(k) });

// Ví: danh sách giao dịch → số dư, XP, ref_key đã nhận.
const ledgers = [
  [],
  [{ amount: 300, ref_key: 'welcome' }],
  [{ amount: 300, ref_key: 'welcome' }, { amount: 25, ref_key: 'd:2026-10-08:workout' }, { amount: 10, ref_key: 'd:2026-10-08:meal' }],
  [{ amount: 300, ref_key: 'welcome' }, { amount: -150, ref_key: 'freeze:abc' }, { amount: 25, ref_key: 'd:2026-10-07:streak' }],
  [{ amount: 120, ref_key: 'ch:platinum:2026-10-05:k' }, { amount: 120, ref_key: 'set:runner' }, { amount: -400, ref_key: 'buy:cape' }],
].map((rows) => ({
  rows,
  balance: rows.reduce((a, r) => a + r.amount, 0),
  xp: rows.reduce((a, r) => a + m.xpForRefKey(r.ref_key), 0),
}));

const headline = (n) => (n === 0 ? 'empty' : n >= m.ENERGY_SIGNALS.length ? 'full' : n >= 3 ? 'mid' : 'low');
const energy = [0, 1, 2, 3, 4, 5].map((n) => ({ count: n, headline: headline(n) }));

// Chuỗi ngày: (ngày đã ghi, mới → cũ), hôm nay, ngày đã băng.
const streakCases = [
  { name: 'empty', dates: [], today: '2026-10-08', frozen: [] },
  { name: 'today only', dates: ['2026-10-08'], today: '2026-10-08', frozen: [] },
  { name: 'plain run incl. today', dates: ['2026-10-08', '2026-10-07', '2026-10-06'], today: '2026-10-08', frozen: [] },
  { name: 'run ends yesterday', dates: ['2026-10-07', '2026-10-06', '2026-10-05'], today: '2026-10-08', frozen: [] },
  { name: 'lapsed', dates: ['2026-10-06', '2026-10-05'], today: '2026-10-08', frozen: [] },
  { name: 'gap breaks', dates: ['2026-10-08', '2026-10-07', '2026-10-05', '2026-10-04'], today: '2026-10-08', frozen: [] },
  { name: 'freeze covers gap', dates: ['2026-10-08', '2026-10-07', '2026-10-05', '2026-10-04'], today: '2026-10-08', frozen: ['2026-10-06'] },
  { name: 'freeze covers yesterday', dates: ['2026-10-06', '2026-10-05'], today: '2026-10-08', frozen: ['2026-10-07'] },
  { name: 'freeze today not loggedToday', dates: ['2026-10-07'], today: '2026-10-08', frozen: ['2026-10-08'] },
  { name: 'future row dropped', dates: ['2026-11-07', '2026-10-08', '2026-10-07'], today: '2026-10-08', frozen: [] },
  { name: 'only future', dates: ['2026-10-09'], today: '2026-10-08', frozen: [] },
  { name: 'future freeze dropped', dates: ['2026-10-08', '2026-10-07'], today: '2026-10-08', frozen: ['2026-10-10'] },
  { name: 'month boundary', dates: ['2026-11-01', '2026-10-31', '2026-10-30'], today: '2026-11-01', frozen: [] },
  { name: 'year boundary', dates: ['2027-01-01', '2026-12-31'], today: '2027-01-01', frozen: [] },
  { name: 'leap day', dates: ['2028-03-01', '2028-02-29', '2028-02-28'], today: '2028-03-01', frozen: [] },
  { name: 'missed three days', dates: ['2026-10-04', '2026-10-03'], today: '2026-10-08', frozen: [] },
  { name: 'missed with freeze inside', dates: ['2026-10-04'], today: '2026-10-08', frozen: ['2026-10-06'] },
].map((c) => ({ ...c, streak: s.streakFrom(c.dates, c.today, c.frozen), missed: s.missedDates(c.dates, c.today, c.frozen) }));

process.stdout.write(JSON.stringify({
  source: 'native/src/lib/{mascot-room,streak}.ts @ fac9ac2 — apps/ios/tools/insights-golden/gen-mascot.mjs',
  constants: {
    levelXp: m.LEVEL_XP, streakXp: m.STREAK_XP, freezeMax: m.FREEZE_MAX, freezePrice: m.FREEZE_PRICE,
    weeklyBonusXp: m.WEEKLY_BONUS_XP, streakWindow: s.STREAK_WINDOW, loggedDayFilter: s.LOGGED_DAY_FILTER,
    energySignals: m.ENERGY_SIGNALS,
  },
  quests: m.DAILY_QUESTS, ranks: m.RANKS, challengeReward: m.CHALLENGE_REWARD,
  refKeys: { quest: m.questRefKey('2026-10-08', 'workout'), challenge: m.challengeRefKey('gold', '2026-10-05', 'steps_week') },
  xp, levels, rankByLevel: ranks, streakCoins, ledgers, energy, streakCases,
}, null, 1) + '\n');
