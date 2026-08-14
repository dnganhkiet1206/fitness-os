/**
 * That the shop's money is the server's business.
 *
 * ── the two scenarios this exists for ──
 *
 * Neither needs an exploit or a modified app. The anon key ships inside the
 * binary and the access token sits in the device keychain; to the person
 * holding the phone, both are just strings.
 *
 *   1. `POST /rest/v1/mascot_transactions {amount: 999999, ref_key: "x"}`
 *      Balance is `SUM(amount)`, so one request bought all 39 items.
 *
 *   2. `POST /rest/v1/mascot_inventory {item_key: "stage_champion"}`
 *      Owning the item never involved paying for it.
 *
 * And the honest client had the same bug by accident: `useBuyItem` inserted the
 * inventory row first and the spend row second, so anything failing between the
 * two statements handed over a free item.
 *
 * ── what is checked ──
 *
 * 1. no code path inserts into the ledger or the inventory directly
 * 2. the price the server charges is the price the catalogue shows
 * 3. the reward ceilings still cover the economy's real maxima
 *
 * Rule 2 is the one that will break first, and it should: the catalogue in
 * `mascot-room.ts` is where somebody will change a price, and a shop that
 * charges a number nobody can see is worse than either version alone.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(NATIVE, '..');
const MIGRATIONS = path.join(REPO, 'supabase', 'migrations');

const problems = [];

/** Every migration concatenated — a policy dropped later has to win. */
const sql = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(path.join(MIGRATIONS, f), 'utf8'))
  .join('\n');

/*
  ── 1: the ledger and the inventory take no client writes ──

  Checked on the SQL rather than the client, because the client is not the only
  thing that can send a request. What matters is whether the *database* would
  accept one.
*/
for (const [table, ops] of [
  ['mascot_transactions', ['INSERT', 'UPDATE', 'DELETE']],
  ['mascot_inventory', ['INSERT', 'DELETE']],
  ['entitlements', ['INSERT', 'UPDATE', 'DELETE']],
  ['shop_prices', ['INSERT', 'UPDATE', 'DELETE']],
  /* Freezes are currency in another shape: a client INSERT policy here is a
     free streak forever, and an UPDATE policy is un-spending one. */
  ['streak_freezes', ['INSERT', 'UPDATE', 'DELETE']],
]) {
  for (const op of ops) {
    /* A policy counts only if it is still standing at the end. */
    const created = [...sql.matchAll(new RegExp(`CREATE POLICY "([^"]+)"\\s+ON public\\.${table}([\\s\\S]*?);`, 'g'))]
      .filter((m) => new RegExp(`\\bFOR (${op}|ALL)\\b`).test(m[2]))
      .map((m) => m[1]);
    const dropped = new Set(
      [...sql.matchAll(new RegExp(`DROP POLICY IF EXISTS "([^"]+)" ON public\\.${table}`, 'g'))].map((m) => m[1]),
    );
    const alive = created.filter((n) => !dropped.has(n));
    if (alive.length) {
      problems.push(
        `${table}: còn policy ${op} cho client ("${alive.join('", "')}") — ` +
          'gửi thẳng một request là tự cấp cho mình thứ lẽ ra phải trả tiền',
      );
    }
  }
}

/* And nothing in the app should be trying, either — a direct insert now fails
   at runtime, which is a crash report instead of a compile error. */
function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}
for (const f of walk(path.join(NATIVE, 'src'))) {
  const code = readFileSync(f, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  for (const table of ['mascot_transactions', 'mascot_inventory']) {
    if (new RegExp(`from\\('${table}'\\)\\s*\\.insert`).test(code)) {
      problems.push(
        `${path.relative(NATIVE, f)}: còn insert thẳng vào ${table} — phải đi qua RPC, ` +
          'nếu không thì request sẽ bị RLS chặn khi chạy thật',
      );
    }
  }
}

/*
  ── 2: one price per item ──

  The catalogue is compiled and imported rather than parsed, because a regex
  over the source got 3 of 39 items when the fields were written in a different
  order — and a price check that silently skips 36 items is worse than none.
*/
{
  const out = mkdtempSync(path.join(tmpdir(), 'econ-'));
  execFileSync(
    'npx',
    ['tsc', 'src/lib/mascot-room.ts', '--ignoreConfig', '--outDir', out,
     '--module', 'esnext', '--target', 'es2020', '--moduleResolution', 'bundler', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const { SHOP_ITEMS, CONSUMABLES, DAILY_QUESTS, CHALLENGE_REWARD } = await import(
    pathToFileURL(path.join(out, 'mascot-room.js')).href
  );

  const seeded = new Map(
    [...sql.matchAll(/\('([a-z0-9_]+)',\s*(\d+)\)/g)].map((m) => [m[1], Number(m[2])]),
  );
  /* Consumables are a second catalogue for a good reason (they are not worn),
     and they are bought with the same coins from the same price table — so the
     parity check has to see both or a consumable's price could drift unnoticed. */
  for (const item of [...SHOP_ITEMS, ...CONSUMABLES]) {
    const price = seeded.get(item.key);
    if (price === undefined) {
      problems.push(`shop_prices: thiếu "${item.key}" — mua món này sẽ báo lỗi "unknown item"`);
    } else if (price !== item.price) {
      problems.push(
        `shop_prices: "${item.key}" giá ${price} trong SQL nhưng ${item.price} trong catalogue — ` +
          'màn hình hiện một giá, server thu một giá khác',
      );
    }
  }
  const extra = [...seeded.keys()].filter(
    (k) => ![...SHOP_ITEMS, ...CONSUMABLES].some((i) => i.key === k),
  );
  if (extra.length) {
    problems.push(`shop_prices: có ${extra.length} khoá không còn trong catalogue (${extra.slice(0, 3).join(', ')}…)`);
  }

  /*
    ── 3: the ceilings still cover a real day ──

    The clamp in `earn_mascot_coins` bounds a forged claim. Bounded too tightly
    it stops being a safety net and starts refusing rewards somebody earned,
    which is the failure nobody would report as a security bug.
  */
  const perClaim = Number(sql.match(/MAX_PER_CLAIM CONSTANT INTEGER := (\d+)/)?.[1] ?? 0);
  const perDay = Number(sql.match(/MAX_PER_DAY\s+CONSTANT INTEGER := (\d+)/)?.[1] ?? 0);
  const biggestReward = Math.max(...Object.values(CHALLENGE_REWARD).map((r) => r.coins));
  const questsPerDay = DAILY_QUESTS.reduce((s, q) => s + q.coins, 0);
  const realisticDay = questsPerDay + biggestReward + 25; // + a streak bonus

  if (perClaim < biggestReward) {
    problems.push(
      `earn_mascot_coins: trần mỗi lần ${perClaim} < phần thưởng lớn nhất ${biggestReward} — ` +
        'người dùng thắng thử thách platinum sẽ bị từ chối trả thưởng',
    );
  }
  if (perDay < realisticDay) {
    problems.push(
      `earn_mascot_coins: trần mỗi ngày ${perDay} < một ngày trọn vẹn ${realisticDay} ` +
        `(${questsPerDay} quest + ${biggestReward} thử thách + 25 chuỗi) — sẽ chặn nhầm người chơi thật`,
    );
  }
}

/**
 * The self-test.
 *
 * The policy rule is the one worth proving, and the version that matters is the
 * *dropped* one: a check that only looks for `CREATE POLICY` reports the hole
 * as still open forever after it is closed, and gets ignored.
 */
const SELF = [
  ['policy đã DROP thì không tính là còn hở', () => {
    const s = 'CREATE POLICY "x" ON public.t FOR INSERT WITH CHECK (true);\nDROP POLICY IF EXISTS "x" ON public.t;';
    const created = [...s.matchAll(/CREATE POLICY "([^"]+)"\s+ON public\.t([\s\S]*?);/g)]
      .filter((m) => /\bFOR (INSERT|ALL)\b/.test(m[2])).map((m) => m[1]);
    const dropped = new Set([...s.matchAll(/DROP POLICY IF EXISTS "([^"]+)" ON public\.t/g)].map((m) => m[1]));
    return created.filter((n) => !dropped.has(n)).length === 0;
  }],
  ['policy chưa DROP thì bị bắt', () => {
    const s = 'CREATE POLICY "y" ON public.t FOR INSERT WITH CHECK (true);';
    const created = [...s.matchAll(/CREATE POLICY "([^"]+)"\s+ON public\.t([\s\S]*?);/g)]
      .filter((m) => /\bFOR (INSERT|ALL)\b/.test(m[2])).map((m) => m[1]);
    return created.length === 1;
  }],
  ['FOR ALL cũng tính là ghi được', () => /\bFOR (INSERT|ALL)\b/.test('  FOR ALL\n  USING (true)')],
];
const missed = SELF.filter(([, fn]) => !fn()).map(([l]) => l);
if (missed.length) {
  console.error(`phép tự kiểm hỏng — không bắt được: ${missed.join('; ')}; đừng tin kết quả`);
  process.exit(2);
}

if (problems.length) {
  console.log('quyền kinh tế sai:\n');
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}

console.log(
  'quyền kinh tế OK — sổ cái, kho đồ, bảng giá và entitlements đều không nhận ghi từ client; ' +
    '39 giá trong SQL khớp catalogue; trần thưởng đủ cho một ngày chơi trọn vẹn',
);
