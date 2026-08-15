/**
 * The coin economy, checked against itself.
 *
 * ── why this is worth a tool ──
 *
 * Rewards and prices are numbers in two files that nothing connects. Raise a
 * quest payout, add a cheap shop item, retune a challenge tier — each is a
 * one-line change with no local consequence and a global one, and the only way
 * anyone would notice the loop had gone slack is by playing for a month.
 *
 * So this compiles the real module and runs the real functions rather than
 * re-reading the constants with a regex. A check that re-implements what it
 * checks agrees with itself and proves nothing.
 *
 * ── what it asserts ──
 *
 * 1. A challenge's ref_key round-trips: `challengeRefKey(tier, …)` fed back to
 *    `xpForRefKey` must return that tier's XP. Those two live in the same file
 *    and are still easy to break apart — the tier is encoded *in the string*,
 *    so a change to the key's shape silently prices every past claim at zero.
 * 2. The other key shapes are not caught by the `ch:` branch.
 * 3. Nobody can earn coins faster than they can spend them: the whole shop must
 *    stay more than a month of perfect play away. If that inverts, the shop
 *    empties and the loop it feeds ends.
 *
 * The third is a floor, not a target. It exists to catch a mistyped zero, not
 * to hold the balance at any particular number — the balance is a product
 * decision and lives in `CHALLENGE_REWARD`.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(path.join(tmpdir(), 'econ-'));

try {
  execFileSync(
    'npx',
    ['tsc', 'src/lib/mascot-room.ts', '--ignoreConfig', '--outDir', out,
     '--module', 'esnext', '--target', 'es2020', '--moduleResolution', 'bundler', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
  );

  const mod = await import(pathToFileURL(path.join(out, 'mascot-room.js')).href);
  const { CHALLENGE_REWARD, challengeRefKey, xpForRefKey, DAILY_QUESTS, SHOP_ITEMS, streakCoins,
          WEEKLY_BONUS_XP } = mod;

  const problems = [];
  const check = (ok, msg) => { if (!ok) problems.push(msg); };

  // 1 — a claim must still be priceable from its key alone
  for (const tier of Object.keys(CHALLENGE_REWARD)) {
    const key = challengeRefKey(tier, '2026-08-03', 'workouts_5');
    check(
      xpForRefKey(key) === CHALLENGE_REWARD[tier].xp,
      `ref_key "${key}" định giá ${xpForRefKey(key)} XP, đáng lẽ ${CHALLENGE_REWARD[tier].xp}`,
    );
  }

  // 2 — and the other shapes must not fall into that branch
  check(xpForRefKey('buy:cape') === 0, 'mua đồ không được sinh XP');
  const workout = DAILY_QUESTS.find((q) => q.key === 'workout');
  check(
    xpForRefKey('d:2026-08-03:workout') === workout.xp,
    'khoá nhiệm vụ ngày không còn định giá đúng',
  );

  /*
    2b — the retired `w:` key still prices, and this is the point of it.

    Finishing a weekly challenge used to be paid twice: automatically as
    `ch:<tier>:<week>:<key>`, and again from a "Claim" button in the Koa room as
    `w:<id>`. The room's path is gone, so nothing writes `w:` any more.

    But XP is not stored — it is re-derived from the ledger on every read. So
    every `w:` row already sitting in a real user's history is still being
    priced today, and deleting the branch that prices it would take 40 XP off
    each of those rows. Somebody who had completed a few challenges would open
    the app and find themselves a **level lower**, with the shop's `unlockLevel`
    gates closed again behind them, and nothing to explain it.

    A dead key that must keep its value is exactly the kind of thing a later
    cleanup removes for looking unused. This is the note that stops it.
  */
  check(
    xpForRefKey('w:1234') === WEEKLY_BONUS_XP,
    'khoá `w:` cũ không còn định giá — mọi thử thách đã nhận trước đây sẽ mất XP và người dùng bị tụt cấp',
  );

  // 3 — the shop has to outlast a month of perfect play
  const shop = SHOP_ITEMS.reduce((s, i) => s + i.price, 0);
  const perWeek =
    (DAILY_QUESTS.reduce((s, q) => s + q.coins, 0) + streakCoins(30)) * 7 +
    (CHALLENGE_REWARD.bronze.coins + CHALLENGE_REWARD.silver.coins + CHALLENGE_REWARD.gold.coins);
  const weeks = shop / perWeek;
  check(weeks > 4, `cả cửa hàng chỉ mất ${weeks.toFixed(1)} tuần chơi hoàn hảo — vòng lặp hụt hơi`);

  if (problems.length) {
    console.error('kinh tế lệch:\n');
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }

  console.log(
    `kinh tế OK — ${SHOP_ITEMS.length} món/${shop} coin, ${perWeek}/tuần hoàn hảo, ` +
      `toàn shop ${weeks.toFixed(1)} tuần`,
  );
} finally {
  rmSync(out, { recursive: true, force: true });
}
