/**
 * The money functions are valid SQL, and they serialise.
 *
 * ── the bug this was written for ──
 *
 * Both purchase functions read the wallet like this:
 *
 *     SELECT COALESCE(SUM(amount), 0) INTO v_balance
 *       FROM public.mascot_transactions WHERE user_id = v_uid FOR UPDATE;
 *
 * PostgreSQL refuses it: *"FOR UPDATE is not allowed with aggregate
 * functions"*. A locking clause has to name individual rows to lock, and an
 * aggregate has thrown those away.
 *
 * The reason it shipped is the whole point of this file. **A plpgsql body is
 * not parsed when the function is created** — it is a string until something
 * calls it. So `supabase db push` succeeds, the migration reports no error,
 * every table and policy lands, and the damage is invisible until a user taps
 * Buy. Measured on PostgreSQL 16.13: loading the migration printed nothing at
 * all; the first call raised.
 *
 * That is `buy_mascot_item` and `buy_streak_freeze` — the entire 39-item shop
 * and the streak insurance — failing on every call, with a green deploy.
 *
 * ── why the second rule ──
 *
 * The comment above those lines said the lock stopped two purchases in flight
 * from both reading the same balance and both deciding it was enough. It is
 * worth being exact about this, because the obvious repair is to keep
 * `FOR UPDATE` and merely move the aggregate — and that repair is wrong.
 *
 * Measured, same cluster, two concurrent buys of a 150-coin freeze by a user
 * holding exactly 150:
 *
 *   · `SELECT amount … FOR UPDATE` wrapped in an outer SUM — **both
 *     succeeded**. Final balance **−150**, two freezes for the price of one.
 *   · `pg_advisory_xact_lock(hashtextextended(uid::text, 0))` then a plain SUM
 *     — the second blocked, then correctly raised `insufficient coins`. Final
 *     balance **0**, one freeze.
 *
 * `FOR UPDATE` locks the rows that are *already there*. A purchase does not
 * modify those rows, it INSERTs a new one — and under READ COMMITTED the second
 * transaction's snapshot predates that insert, so it unblocks, re-reads the
 * same untouched history, and spends money that is gone. Row locks cannot
 * defend a sum over a growing set. A lock on the *user* can.
 *
 * ── why this reads the last definition and not every one ──
 *
 * The fix is a new migration that `CREATE OR REPLACE`s both functions, not an
 * edit to the two old files — correct whether or not those files were ever
 * applied somewhere. Which means the broken text is still in the repository, on
 * purpose, and always will be.
 *
 * So a rule that grepped every file would fail forever on history, and the only
 * way to green it would be to rewrite the past. Migrations are applied in
 * filename order and the last definition of a function is the one that runs, so
 * that is what this checks — the same model the database itself uses.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS = path.join(NATIVE, '..', 'supabase', 'migrations');

const problems = [];

/** `--` comments only; `/* *​/` blocks are stripped separately. */
const strip = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--.*$/gm, ' ');

/**
 * Every `CREATE [OR REPLACE] FUNCTION name(...) ... $$ body $$` in file order,
 * newest last. Bodies are dollar-quoted throughout this schema.
 */
function definitions() {
  const found = new Map(); // name -> { file, body }
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    const src = readFileSync(path.join(MIGRATIONS, file), 'utf8');
    const re =
      /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([\w.]+)\s*\(([^)]*)\)([\s\S]*?)\$(\w*)\$([\s\S]*?)\$\4\$/gi;
    let m;
    while ((m = re.exec(src)) !== null) {
      const name = m[1].replace(/^public\./, '');
      found.set(name, { file, body: m[5] });
    }
  }
  return found;
}

const defs = definitions();

if (defs.size === 0) {
  problems.push(
    `không đọc được hàm nào trong ${MIGRATIONS} — luật này đang không kiểm gì cả`,
  );
}

const AGG = /\b(?:sum|count|avg|min|max|array_agg|string_agg|bool_and|bool_or)\s*\(/i;
const LOCKING = /\bFOR\s+(?:UPDATE|SHARE|NO\s+KEY\s+UPDATE|KEY\s+SHARE)\b/i;

for (const [name, { file, body }] of defs) {
  const clean = strip(body);

  /*
    ── 1. no locking clause in a statement that aggregates ──

    Split on `;` so a function that legitimately does both in *separate*
    statements is not accused. The failure is the two in one statement.
  */
  for (const stmt of clean.split(';')) {
    if (LOCKING.test(stmt) && AGG.test(stmt)) {
      problems.push(
        `${name} (${file}): một câu lệnh vừa gom nhóm vừa có ${LOCKING.exec(stmt)[0].toUpperCase()} — ` +
          'PostgreSQL từ chối thẳng ("FOR UPDATE is not allowed with aggregate functions"). ' +
          'Thân hàm plpgsql KHÔNG được phân tích lúc tạo, nên migration vẫn chạy xanh ' +
          'và hàm chỉ nổ khi có người gọi.',
      );
    }
  }

  /*
    ── 2. read-decide-write on the ledger is serialised per user ──

    Any function that sums the ledger and then writes to it is deciding whether
    money exists and then spending it. Two of those in flight must not both
    pass. Only an advisory lock taken *before* the read does that; see the
    measurement in the header for why a row lock does not.
  */
  const readsBalance = /SUM\s*\(\s*amount\s*\)[\s\S]{0,200}?mascot_transactions/i.test(clean);
  const writesLedger = /INSERT\s+INTO\s+(?:public\.)?mascot_transactions/i.test(clean);

  if (readsBalance && writesLedger) {
    const lockAt = clean.search(/pg_advisory_xact_lock\s*\(/i);
    const readAt = clean.search(/SUM\s*\(\s*amount\s*\)/i);

    if (lockAt === -1) {
      problems.push(
        `${name} (${file}): đọc số dư rồi ghi vào sổ cái mà không khoá theo người dùng — ` +
          'hai lệnh mua cùng lúc đều đọc ra số cũ và đều tiêu. Đo thật: số dư về −150, ' +
          'mua được 2 món bằng tiền của 1. Cần pg_advisory_xact_lock(...) trước khi đọc.',
      );
    } else if (lockAt > readAt) {
      problems.push(
        `${name} (${file}): có pg_advisory_xact_lock nhưng đặt SAU khi đọc số dư — ` +
          'khoá sau khi đã quyết định thì không chặn được gì.',
      );
    }
  }
}

/*
  ── 3. the two functions this was written about still exist ──

  Without this, deleting or renaming them turns every rule above into a loop
  over nothing, and the step goes green by having no work to do.
*/
for (const required of ['buy_mascot_item', 'buy_streak_freeze']) {
  if (!defs.has(required)) {
    problems.push(`không tìm thấy hàm ${required} — luật ở trên đang không kiểm nó nữa`);
  }
}

if (problems.length) {
  console.log('SQL kinh tế:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

const names = [...defs.keys()].sort().join(', ');
console.log(
  `SQL kinh tế OK — đọc ${defs.size} hàm, lấy bản định nghĩa CUỐI CÙNG của mỗi hàm ` +
    '(migration chạy theo thứ tự tên file, nên bản cuối là bản thật sự chạy — hai file cũ ' +
    'vẫn còn nguyên câu lệnh hỏng và cố ý không sửa tại chỗ); ' +
    'không hàm nào còn vừa gom nhóm vừa khoá dòng trong một câu lệnh — thứ mà PostgreSQL từ ' +
    'chối khi GỌI chứ không phải khi tạo, nên nó đã qua được một lần deploy xanh; ' +
    'và mọi hàm vừa đọc số dư vừa ghi sổ cái đều khoá theo người dùng TRƯỚC khi đọc ' +
    `(đo thật trên PostgreSQL 16.13: bỏ khoá ra thì hai lệnh mua song song đưa số dư về −150). ` +
    `Các hàm: ${names}`,
);
