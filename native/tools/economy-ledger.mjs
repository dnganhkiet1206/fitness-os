/**
 * That every coin has an origin, and that no earned coin can quietly vanish.
 *
 * ── what the existing economy tools already hold, and what they cannot ──
 *
 *   · `economy.mjs`          — the loop's arithmetic: payouts vs prices.
 *   · `economy-authority.mjs`— prices in SQL match the catalogue.
 *   · `economy-sql.mjs`      — no aggregate beside `FOR UPDATE`, and every
 *                              read-decide-write locks first.
 *   · `reward-ledger.mjs`    — amounts fit under the server ceiling; one event
 *                              writes one `ref_key` shape.
 *
 * All four are about the *server* and the *numbers*. None of them can see the
 * shape this file is about, which is on the client and is about **what happens
 * when an economic call fails**:
 *
 *   1. A reward marked as sent before the write lands, and never unmarked when
 *      the write is refused — so the coins are never retried. Three instances
 *      shipped: the quest auto-claim (`sent`), the welcome gift
 *      (`welcomeTried`), and the streak guard (`tried`, corrected earlier and
 *      the model for the other two).
 *
 *   2. A reward paid *after* the event is recorded as finished. The challenge
 *      payout wrote `completed: true` first; `justCompleted` is a transition,
 *      so a payment refused after that write was never attempted again — the
 *      coins were gone for a challenge the app itself had recorded as won.
 *
 * ── the invariants, stated as properties rather than as patch names ──
 *
 *   A. A latch that guards an economic call must be released when that call
 *      fails. Idempotency is what makes releasing it safe; the ledger's
 *      `UNIQUE(user_id, ref_key)` provides it for every reward in the app.
 *
 *   B. When one step is idempotent and the other is not, the idempotent one
 *      goes first. Concretely: the payment must precede the write that makes
 *      the payment unreachable.
 *
 *   C. Client code never writes the ledger, the inventory or the freeze table
 *      directly — those tables have no client write policy, so an insert is a
 *      request that will be refused, and the refusal is the *good* case.
 *
 * The database half of Chain D — RLS, minting, double-spend, freeze races — is
 * measured on a real PostgreSQL instance built from `supabase/migrations/`;
 * see the ledger entry. What a static tool can hold is the wiring, and that is
 * what this holds.
 */
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(NATIVE, '..');
const read = (p) => readFileSync(path.join(NATIVE, p), 'utf8');
/* Comments name the bugs; every rule reads code with the prose blanked and the
   newlines kept, so line numbers and brace matching survive. */
const strip = (s) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const problems = [];
const files = globSync('src/**/*.{ts,tsx}', { cwd: NATIVE }).sort();

/* ── A: a latch around an economic call is released when the call fails ──

   The shape: a ref/flag is set, and a claim is fired in the same block. Whether
   the flag is a `Set` (`sent.current.add`) or a boolean (`welcomeTried.current
   = true`) does not matter; what matters is that the same block hands the
   claim an `onError`. Without one the flag is permanent for the life of that
   ref, and the reward is simply not retried. */
{
  /** every `x.mutate(` / `x.mutateAsync(` call, with its arguments brace-matched */
  const calls = (code) => {
    const out = [];
    for (const m of code.matchAll(/\b(\w+)\.mutate(?:Async)?\(/g)) {
      let depth = 1;
      let i = m.index + m[0].length;
      for (; i < code.length && depth > 0; i++) {
        if (code[i] === '(') depth++;
        else if (code[i] === ')') depth--;
      }
      out.push({ name: m[1], at: m.index, args: code.slice(m.index, i) });
    }
    return out;
  };

  for (const f of files) {
    const code = strip(read(f));
    /* Only the calls that move money. `useClaimReward` is the one hook that
       reaches `earn_mascot_coins`, so a claim is a call on something bound to
       it — found by binding rather than by variable name. */
    const claimVars = [...code.matchAll(/const\s+(\w+)\s*=\s*useClaimReward\(\)/g)].map((m) => m[1]);
    if (claimVars.length === 0) continue;

    /*
      A latch and the claim it guards are in the same block — that is the
      relationship, and it is structural rather than a distance.

      The first version of this rule read a 400-character window above the call
      and missed the very regression it was written for, because the comment
      explaining the latch is longer than the window. In this repository prose
      between two statements is the norm, so any rule measured in characters is
      a rule that stops working the moment somebody writes a paragraph.

      So: from the latch, scan forward to the `}` that closes its enclosing
      block, and hold every claim inside that span.
    */
    for (const latch of code.matchAll(/(\w+)\.current\.add\(|(\w+)\.current\s*=\s*true\b/g)) {
      const name = latch[1] ?? latch[2];
      let depth = 0;
      let end = latch.index;
      for (; end < code.length; end++) {
        if (code[end] === '{') depth++;
        else if (code[end] === '}') {
          if (depth === 0) break;
          depth--;
        }
      }
      const span = code.slice(latch.index, end);
      for (const call of calls(span)) {
        if (!claimVars.includes(call.name)) continue;
        if (/onError\s*:/.test(call.args)) continue;
        problems.push(
          `${f}:${code.slice(0, latch.index + call.at).split('\n').length}: chốt \`${name}\` được đặt ` +
            'trước một lời gọi trả thưởng trong cùng khối, nhưng lời gọi đó không có `onError` để gỡ ' +
            'chốt. Ghi thưởng bị từ chối một lần là không bao giờ thử lại — mà `UNIQUE(user_id, ' +
            'ref_key)` làm cho việc thử lại không thể trả hai lần, nên không thử lại là mất trắng',
        );
      }
    }
  }
}

/* ── B: the idempotent step goes first ──

   Stated about the pair that had it backwards, and about the property that
   makes the order matter: the payment is idempotent on `ref_key`, the write
   that flips `completed` is what makes the payment unreachable. So inside the
   challenge pass, `earn_mascot_coins` must appear before the update of
   `weekly_challenges`. */
{
  const f = 'src/hooks/use-extras.ts';
  const code = strip(read(f));
  /* The payment, whichever RPC spells it — see `challenge-reward.mjs` for why
     both names are named. Anchoring on one literal is what made this rule's own
     self-test fire ("luật B không kiểm gì cả") the day the call moved to
     `claim_quest_reward`; the self-test was right and the anchor was stale. */
  const payMatch = code.match(/claim_quest_reward|earn_mascot_coins/);
  const pay = payMatch ? payMatch.index : -1;
  const mark = code.indexOf("from('weekly_challenges')\n              .update(");
  const markAny = mark >= 0 ? mark : code.search(/from\('weekly_challenges'\)[\s\S]{0,120}?\.update\(/);
  if (pay < 0 || markAny < 0) {
    console.error(
      `tự kiểm hỏng: không tìm thấy cặp trả-thưởng / ghi-hoàn-thành trong ${f} — luật B không kiểm gì cả`,
    );
    process.exit(2);
  }
  if (pay > markAny) {
    problems.push(
      `${f}: thử thách được ghi \`completed\` TRƯỚC khi trả thưởng. \`justCompleted\` là một chuyển ` +
        'trạng thái, nên lượt focus sau đọc nó là "đã xong từ lâu" và không bao giờ trả lại — một lần ' +
        'trả thưởng hỏng là mất vĩnh viễn số xu của một thử thách mà chính app đã ghi là thắng. ' +
        'Bước idempotent (trả thưởng, khoá theo ref_key) phải đi trước',
    );
  }
}

/* ── C: the client does not write the money tables ──

   Not a style rule: `mascot_transactions`, `mascot_inventory` and
   `streak_freezes` have no client INSERT/UPDATE/DELETE policy, so such a call
   is refused at the database. Code that makes one is code that believes it can
   move money, and it will fail in a way nobody sees until somebody reads a
   support ticket. Every legitimate path goes through an RPC.

   `TEST_UNLOCK_ALL` writes AsyncStorage, not Supabase, and is not matched. */
{
  const GUARDED = ['mascot_transactions', 'mascot_inventory', 'streak_freezes'];
  /* `mascot_inventory` keeps one client UPDATE policy — equipping is free and a
     trigger pins `item_key` and `user_id` — so only the verbs that create or
     destroy ownership are forbidden. */
  const VERBS = { mascot_transactions: /insert|update|upsert|delete/, mascot_inventory: /insert|upsert|delete/, streak_freezes: /insert|update|upsert|delete/ };
  for (const f of files) {
    const code = strip(read(f));
    for (const table of GUARDED) {
      const re = new RegExp(`\\.from\\('${table}'\\)\\s*\\n?\\s*\\.(\\w+)\\(`, 'g');
      for (const m of code.matchAll(re)) {
        if (!VERBS[table].test(m[1])) continue;
        problems.push(
          `${f}:${code.slice(0, m.index).split('\n').length}: gọi .${m[1]}() thẳng vào ${table} — ` +
            'bảng này không có policy ghi cho client, nên lệnh sẽ bị RLS từ chối. Tiền chỉ đi qua RPC ' +
            '(earn_mascot_coins / buy_mascot_item / buy_streak_freeze / use_streak_freeze)',
        );
      }
    }
  }
}

/* ── D: and the SQL keeps the two guarantees the race tests measured ──

   Read from the migrations rather than trusted: the partial unique index is
   what makes "one freeze per day" true no matter how many devices ask, and the
   `unique_violation` handler is what makes the second asker get an answer
   instead of a raw constraint error. Both were measured on PostgreSQL 16.13;
   this keeps them from being edited away. */
{
  const sql = globSync('supabase/migrations/*.sql', { cwd: REPO })
    .sort()
    .map((p) => readFileSync(path.join(REPO, p), 'utf8'))
    .join('\n');
  if (!/CREATE\s+UNIQUE\s+INDEX[^;]*streak_freezes\s*\(\s*user_id\s*,\s*used_on\s*\)[^;]*WHERE\s+used_on\s+IS\s+NOT\s+NULL/is.test(sql)) {
    problems.push(
      'mất index duy nhất riêng phần streak_freezes(user_id, used_on) — đó là thứ duy nhất bảo đảm ' +
        'một ngày chỉ tiêu một freeze khi hai thiết bị cùng hỏi (đo thật: hai phiên song song → 1 tiêu, 1 giữ)',
    );
  }
  /* The last definition of the function is the one that runs. */
  const defs = [...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.use_streak_freeze[\s\S]*?\n\$\$;/g)];
  if (defs.length === 0) {
    console.error('tự kiểm hỏng: không tìm thấy use_streak_freeze trong migrations — luật D không kiểm gì cả');
    process.exit(2);
  }
  /* Prose out before the shape is read — the handler carries the paragraph
     explaining why it exists, and a fixed window would be measuring the
     comment's length rather than the code's. */
  const live = defs[defs.length - 1][0]
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*--.*$/gm, ' ');
  if (!/EXCEPTION\s+WHEN\s+unique_violation\s+THEN\s+RETURN\s+false/i.test(live)) {
    problems.push(
      'use_streak_freeze không bắt unique_violation — hàm này tự nói nó TRẢ VỀ FALSE khi ngày đã được ' +
        'phủ, và cuộc đua hai thiết bị đi vòng qua phép kiểm trước đó. Đo thật: thiết bị thứ hai nhận ' +
        '"duplicate key value violates unique constraint" rồi useStreakGuard hiện nguyên văn câu đó ' +
        'thành toast đỏ và thử lại — trong một lượt mở app mà chuỗi ngày ĐÃ được cứu',
    );
  }
}

if (problems.length > 0) {
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error(`\nsổ cái kinh tế: ${problems.length} vấn đề`);
  process.exit(1);
}

console.log(
  'sổ cái kinh tế OK — mọi chốt đặt trước một lời gọi trả thưởng đều có onError để gỡ chốt ' +
    '(ghi thưởng idempotent theo ref_key, nên không thử lại là mất trắng chứ không phải an toàn); ' +
    'thử thách được TRẢ TIỀN trước khi được ghi là hoàn thành, vì justCompleted là một chuyển trạng ' +
    'thái và ghi trước là mất vĩnh viễn; không dòng code client nào ghi thẳng vào mascot_transactions, ' +
    'mascot_inventory hay streak_freezes — ba bảng đó không có policy ghi cho client; và SQL vẫn giữ ' +
    'index duy nhất một-freeze-một-ngày cùng nhánh bắt unique_violation trả về false',
);
