/**
 * Every reward the app grants can actually be granted, and exactly once.
 *
 * ── the two bugs this was written for ──
 *
 * **1. Three grants were larger than the server would accept.**
 * `earn_mascot_coins` refuses any claim over `MAX_PER_CLAIM`, which was 120.
 * The welcome gift asks for 300, the Runner Set for 180, the dev faucet for
 * 500. `useClaimReward` only swallows errors containing 'duplicate', so all
 * three raised.
 *
 * The welcome gift is the one that mattered: a new account was meant to open
 * the Koa room with 300 coins and the cheapest item costs 60. Instead the room
 * opened at **zero** — a full shop and no way to afford any of it, on the first
 * visit, with no error shown.
 *
 * **2. Finishing a weekly challenge paid twice.** Progress completion wrote
 * `ch:<tier>:<week>:<key>` worth 25/50/80/120 by tier; a "Claim" button in the
 * Koa room then wrote `w:<id>` worth a flat 40 + 40 XP. Two keys for one event,
 * so `UNIQUE(user_id, ref_key)` could not see they meant the same thing. A gold
 * challenge paid 120/120 instead of 80/80 — and since XP is derived from this
 * same ledger, the inflation carried into level, rank, the level-up
 * celebrations and the shop's `unlockLevel` gates.
 *
 * ── why the existing economy rules missed both ──
 *
 * `economy-authority.mjs` compares `MAX_PER_CLAIM` against `CHALLENGE_REWARD`,
 * whose peak is exactly 120, and stops there. It never reads `COLLECTIONS` and
 * never sees the amounts written straight into a screen — so the three grants
 * above were invisible to it.
 *
 * `economy.mjs` prices things but never asks how many ledger rows one event
 * produces, which is the only question that would have caught the double pay.
 *
 * So this file asks the two questions neither of them did: *can this amount get
 * through*, and *how many keys does one event write*.
 *
 * ── the ceiling is read, not repeated ──
 *
 * `MAX_PER_CLAIM` comes out of the migrations, taking the **last** definition
 * of `earn_mascot_coins` the way `economy-sql.mjs` does — because migrations
 * apply in filename order and the last one wins. Writing the number here as
 * well would be a second copy of the rule, which is the bug family this
 * repository keeps finding in itself.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS = path.join(NATIVE, '..', 'supabase', 'migrations');
const read = (p) => readFileSync(path.join(NATIVE, p), 'utf8');
const strip = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

const problems = [];

/* ── the ceilings, from the migration that actually runs ── */
function ceilings() {
  let found = null;
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    const src = readFileSync(path.join(MIGRATIONS, file), 'utf8');
    const re =
      /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.earn_mascot_coins[\s\S]*?\$(\w*)\$([\s\S]*?)\$\1\$/gi;
    let m;
    while ((m = re.exec(src)) !== null) {
      const body = m[2];
      const claim = body.match(/MAX_PER_CLAIM\s+CONSTANT\s+INTEGER\s*:=\s*(\d+)/i);
      const day = body.match(/MAX_PER_DAY\s+CONSTANT\s+INTEGER\s*:=\s*(\d+)/i);
      if (claim && day) found = { file, claim: Number(claim[1]), day: Number(day[1]) };
    }
  }
  return found;
}

const cap = ceilings();
if (!cap) {
  problems.push('không đọc được MAX_PER_CLAIM / MAX_PER_DAY từ migration nào — luật này không kiểm gì cả');
}

/* ── 1. every grant fits under the per-claim ceiling ── */
const grants = [];
if (cap) {
  const room = strip(read('src/lib/mascot-room.ts'));

  /* The catalogue's own numbers. */
  for (const m of room.matchAll(/rewardCoins:\s*(\d+)/g)) {
    grants.push({ what: 'bộ sưu tập (COLLECTIONS.rewardCoins)', coins: Number(m[1]) });
  }
  for (const m of room.matchAll(/\b(bronze|silver|gold|platinum):\s*\{\s*coins:\s*(\d+)/g)) {
    grants.push({ what: `thử thách ${m[1]} (CHALLENGE_REWARD)`, coins: Number(m[2]) });
  }
  for (const m of room.matchAll(/key:\s*'(\w+)',\s*coins:\s*(\d+)/g)) {
    grants.push({ what: `quest ngày ${m[1]}`, coins: Number(m[2]) });
  }

  /*
    And the amounts written straight into a screen, which is where the welcome
    gift and the faucet lived — invisible to any rule that only reads the
    catalogue.
  */
  const screen = strip(read('src/app/mascot-room.tsx'));
  for (const m of screen.matchAll(/amount:\s*(\d+)/g)) {
    grants.push({ what: `số gõ thẳng trong mascot-room.tsx (amount: ${m[1]})`, coins: Number(m[1]) });
  }

  if (grants.length < 10) {
    problems.push(`chỉ tìm thấy ${grants.length} khoản thưởng — quá ít, luật đang đọc hụt`);
  }

  for (const g of grants) {
    if (g.coins > cap.claim) {
      problems.push(
        `${g.what} = ${g.coins} xu > trần mỗi lần nhận ${cap.claim} — ` +
          'server sẽ ném "reward out of range", và useClaimReward chỉ nuốt lỗi chứa "duplicate", ' +
          'nên khoản này im lặng không bao giờ được trả',
      );
    }
  }
}

/* ── 2. a maximal legitimate day fits under the daily ceiling ── */
if (cap) {
  const room = strip(read('src/lib/mascot-room.ts'));
  const sum = (re) => [...room.matchAll(re)].reduce((s, m) => s + Number(m[1]), 0);
  const max = (re) => Math.max(0, ...[...room.matchAll(re)].map((m) => Number(m[1])));

  const quests = sum(/key:\s*'\w+',\s*coins:\s*(\d+)/g);
  const streak = 25; // streakCoins() is capped there by Math.min(5 + streak * 2, 25)
  const challenge = max(/\b(?:bronze|silver|gold|platinum):\s*\{\s*coins:\s*(\d+)/g);
  const collection = max(/rewardCoins:\s*(\d+)/g);
  const welcome = max(/amount:\s*(\d+)/g) >= 300 ? max(/amount:\s*(\d+)/g) : 300;

  const bestDay = welcome + quests + streak + challenge + collection;
  if (bestDay > cap.day) {
    problems.push(
      `một ngày hợp lệ tối đa là ${bestDay} xu (chào mừng ${welcome} + quest ${quests} + ` +
        `chuỗi ${streak} + thử thách ${challenge} + bộ sưu tập ${collection}) ` +
        `nhưng trần ngày là ${cap.day} — người dùng sẽ mất phần đã thật sự kiếm được`,
    );
  }
}

/* ── 3. one event, one ref_key shape ── */
{
  const extras = strip(read('src/hooks/use-extras.ts'));
  const screen = strip(read('src/app/mascot-room.tsx'));

  const autoPays = extras.includes('challengeRefKey(');
  const roomPays = /reward\(\s*(?:refKey|weeklyRefKey\()/.test(screen) && screen.includes('weeklyRefKey(');

  if (autoPays && roomPays) {
    problems.push(
      'thử thách tuần được trả qua HAI khoá khác dạng — `ch:<tier>:<week>:<key>` khi hoàn thành ' +
        'và `w:<id>` từ nút Nhận trong phòng. UNIQUE(user_id, ref_key) không thấy chúng là một ' +
        'sự kiện, nên mỗi thử thách xong được trả hai lần (vàng: 120/120 thay vì 80/80), ' +
        'và XP suy ra từ chính sổ cái nên level và rank phồng theo',
    );
  }
  if (!autoPays && !roomPays) {
    problems.push('không đường nào trả tiền cho thử thách tuần — hoàn thành xong không được gì');
  }

  /*
    Whichever path survives, the room must not be able to mint a second row for
    an event the ledger already has. A bare `weeklyRefKey` used only to *read*
    is fine; passing it to a payment is not.
  */
  if (/reward\(\s*weeklyRefKey\(|reward\(\s*refKey\b/.test(screen) && screen.includes('weeklyRefKey(')) {
    problems.push('src/app/mascot-room.tsx: vẫn trả tiền theo khoá `w:` — đường thanh toán thứ hai chưa bị bỏ');
  }
}

/* ── 4. the dev faucet cannot exist in a release build ── */
{
  const screen = strip(read('src/app/mascot-room.tsx'));
  if (screen.includes("reason: 'dev grant'")) {
    /* The grant is fine in development; what matters is that the handler is
       unreachable without __DEV__. */
    const idx = screen.indexOf("reason: 'dev grant'");
    const around = screen.slice(Math.max(0, idx - 700), idx);
    if (!around.includes('__DEV__')) {
      problems.push(
        'src/app/mascot-room.tsx: faucet dev không nằm sau __DEV__ — trong bản phát hành, ' +
          'nhấn giữ ô xu là tự in tiền, ngay trên nút người dùng bấm để xem số dư',
      );
    }
  }
}

if (problems.length) {
  console.log('sổ cái thưởng:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  `sổ cái thưởng OK — trần đọc từ ${cap.file} (mỗi lần ${cap.claim} xu, mỗi ngày ${cap.day}) ` +
    `chứ không chép lại; cả ${grants.length} khoản thưởng trong app đều lọt qua trần đó ` +
    '(bản đã ship có trần 120 trong khi quà chào mừng xin 300, bộ Chạy Bộ 180 và faucet 500 — ' +
    'cả ba bị từ chối lặng lẽ, nên người dùng mới mở phòng Koa với 0 xu); ' +
    'một ngày hợp lệ tối đa vẫn nằm dưới trần ngày; mỗi sự kiện chỉ sinh MỘT dạng ref_key — ' +
    'thử thách tuần từng được trả qua cả `ch:` lẫn `w:` nên hạng vàng ra 120/120 thay vì 80/80 ' +
    'và thổi phồng cả level lẫn rank; và faucet dev nằm sau __DEV__',
);
