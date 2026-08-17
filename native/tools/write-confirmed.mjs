/**
 * Every update and delete either checks that it touched something, or says why
 * it does not have to.
 *
 * ── the shape this exists for ──
 *
 * PostgREST answers an `UPDATE` or `DELETE` that matched **no rows** exactly the
 * way it answers one that matched five: `error: null`, and nothing else. There
 * were thirty-three of them in this app and not one of them asked.
 *
 * That is not a hypothetical. It is the difference between:
 *
 *   · a profile edit that says "Saved" and then puts every field back to the
 *     old number on the next read, because the session's `user_id` no longer
 *     matches the row;
 *   · a workout that vanishes on delete, comes back on the refetch, and makes
 *     the app look broken rather than out of date;
 *   · and the weekly-challenge write, whose failure does not merely lose
 *     progress — it leaves `completed` false in the database, so the next focus
 *     pass reads the challenge as freshly finished and celebrates it all over
 *     again. One unchecked write rebuilding a bug two files away.
 *
 * Nothing throws in any of those. There is no failure to catch, because as far
 * as the client is concerned nothing failed.
 *
 * ── why a list with reasons rather than a blanket rule ──
 *
 * Some writes really may match nothing, and treating those as failures would be
 * its own bug: clearing the equipped flag on garments that may not be equipped,
 * a background sync whose row was deleted mid-flight, un-ticking a supplement
 * that is already un-ticked. Each of those is named below **with the sentence
 * that makes it true**, and the sentence is the point — "it is in the list" is
 * not an argument.
 *
 * ── and one entry that was wrong before it was ever needed ──
 *
 * The first draft exempted the whole offline replay path, on the reasoning that
 * a queued write already on the server may legitimately replay into nothing.
 * True in general, and false about this file: `lib/offline-write.ts` only ever
 * `insert`s and `upsert`s, so the entry described a write that does not exist.
 * The stale-entry check below found it on the first run, which is the same
 * check `dead-schema.mjs` and `linked.mjs` carry and the same reason.
 *
 * A write added later and left unchecked fails this step, which is the case
 * worth catching: it is the one nobody would otherwise notice, because it looks
 * exactly like every write that works.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

const strip = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/**
 * Writes that may legitimately touch nothing, and the reason each one may.
 *
 * Keyed `file:table:verb` so two different writes to the same table are two
 * different decisions.
 */
const EXEMPT = new Map([
  [
    'src/hooks/use-mascot-room.ts:mascot_inventory:update',
    'gỡ cờ equipped khỏi các món CÙNG VỊ TRÍ trước khi mặc món mới — nếu vị trí đó đang trống thì ' +
      'không có dòng nào để chạm, và đó là kết quả đúng chứ không phải thất bại',
  ],
  /*
    `use-health-sync.ts:daily_logs:update` used to be exempt here, and the entry
    is gone because the write is.

    The exemption reasoned about the right thing (an update touching no rows is
    not a failure for a background sync) and sat on top of the wrong shape: the
    update was the second half of a `select … maybeSingle()` then
    insert-or-update, which read a failed lookup as "no row" and inserted
    against `UNIQUE (user_id, date)`. It is one `upsert` now — no read, no id
    carried across a round trip, no branch to get wrong — and an upsert has no
    "touched nothing" case to excuse.

    Left as a note rather than deleted silently: an exemption that disappears is
    worth a sentence saying whether the risk went with it.
  */
  [
    'src/hooks/use-coach-chat.tsx:ai_conversations:update',
    'chỉ đụng vào `updated_at` để cuộc trò chuyện nổi lên đầu danh sách; hỏng thì thứ tự sai một chỗ ' +
      'chứ không có thông tin nào của người dùng bị mất',
  ],
  [
    'src/hooks/use-library.ts:supplement_intake_logs:delete',
    'bỏ tick một thứ vốn đã không được tick là không-làm-gì đúng nghĩa, không phải lỗi — và hai lần ' +
      'chạm nhanh sẽ khiến lần thứ hai hợp lệ mà chạm 0 dòng',
  ],
  [
    'src/hooks/use-nutrition.ts:meal_entry_items:delete',
    'xoá món đã có đường báo lỗi riêng và phải chạy tiếp sang bước dựng lại bữa ăn kể cả khi dòng đã ' +
      'biến mất — dừng ở đây sẽ để lại một bữa ăn có tổng số sai',
  ],
  [
    'src/lib/weight-sync.ts:profiles:update',
    'đồng bộ cân nặng sang hồ sơ chạy kèm lệnh ghi cân nặng và cố ý không được phép làm hỏng nó; ' +
      'lần cân sau sẽ đồng bộ lại',
  ],
]);

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'src'], {
  cwd: NATIVE,
  encoding: 'utf8',
})
  .split('\n')
  .filter((f) => /\.tsx?$/.test(f));

let scanned = 0;
let confirmed = 0;
const seenExempt = new Set();

for (const f of files) {
  if (f === 'src/lib/write-result.ts') continue;
  let src;
  try {
    src = strip(readFileSync(path.join(NATIVE, f), 'utf8'));
  } catch {
    continue;
  }
  if (!/\.update\(|\.delete\(\)/.test(src)) continue;

  /* Each write, taken with the statement it belongs to: walk back to the start
     of the expression so the table name and the guarding call are both in
     hand. */
  for (const m of src.matchAll(/\.(update|delete)\(/g)) {
    const verb = m[1];
    /* `.update` on anything that is not a PostgREST builder — a Reanimated
       shared value, a Map — has no `.from('table')` before it and is skipped by
       the table test below. */
    const before = src.slice(Math.max(0, m.index - 700), m.index);
    const from = [...before.matchAll(/\.from\(\s*['"](\w+)['"]\s*\)/g)].pop();
    if (!from) continue;
    const table = from[1];

    scanned++;

    const key = `${f}:${table}:${verb}`;
    const wildcard = `${f}:*:*`;
    if (EXEMPT.has(key)) {
      seenExempt.add(key);
      continue;
    }
    if (EXEMPT.has(wildcard)) {
      seenExempt.add(wildcard);
      continue;
    }

    /*
      ── this reads the statement, and the first version read a window ──

      The first working version tested a ±900-character slice for the word
      `confirmWrite`. It passed, and it was worthless: breaking one delete in
      `use-fitness-data.ts` back to the unchecked form left it green, because
      three *other* confirmed writes in neighbouring functions were still inside
      the window. Exactly the trap `plausible.mjs` fell into — a flat window
      answers "is the word nearby", never "does it apply to this".

      So the expression is bounded properly: walk back from the write to the
      `supabase` that starts its chain, and read what immediately precedes it;
      walk forward to the end of the chain, and read whether it selects. Nothing
      outside this one statement can satisfy it.
    */
    const chainStart = src.lastIndexOf('supabase', m.index);
    const lead = chainStart < 0 ? '' : src.slice(Math.max(0, chainStart - 40), chainStart);
    const wrapped = /confirmWrite\(\s*$/.test(lead);

    /* End of the chain: the first `;` or `,` at paren depth 0 after the write. */
    let depth = 0;
    let end = m.index;
    for (; end < src.length; end++) {
      const c = src[end];
      if (c === '(') depth++;
      else if (c === ')') {
        if (depth === 0) break;
        depth--;
      } else if ((c === ';' || c === ',') && depth === 0) break;
    }
    const chain = src.slice(m.index, end);
    const selects = /\.select\(/.test(chain);

    if (wrapped || selects) {
      confirmed++;
      continue;
    }

    problems.push(
      `${f}: .${verb}() trên '${table}' không kiểm xem có dòng nào bị chạm không. PostgREST trả ` +
        '`error: null` y hệt nhau cho "sửa 5 dòng" và "không khớp dòng nào", nên lệnh này báo thành ' +
        'công rồi không đổi gì cả. Bọc confirmWrite() từ lib/write-result.ts, hoặc ghi ' +
        `'${key}' vào EXEMPT trong tools/write-confirmed.mjs KÈM LÝ DO`,
    );
  }
}

if (scanned < 25) {
  problems.push(`chỉ quét được ${scanned} lệnh update/delete — bộ quét hỏng, đừng tin kết quả bước này`);
}

/* ── the list does not outlive its own entries ── */
for (const [k, why] of EXEMPT) {
  if (!why || why.length < 40) problems.push(`'${k}' được miễn mà lý do quá sơ sài`);
  if (!seenExempt.has(k)) {
    problems.push(`EXEMPT còn '${k}' nhưng không tìm thấy lệnh ghi nào khớp — bỏ dòng đó đi`);
  }
}

if (problems.length) {
  console.log('lệnh ghi không xác nhận:\n');
  for (const p of problems.slice(0, 12)) console.log(`  • ${p}`);
  if (problems.length > 12) console.log(`  … và ${problems.length - 12} lỗi nữa`);
  process.exit(1);
}

console.log(
  `lệnh ghi OK — quét ${scanned} lệnh update/delete: ${confirmed} lệnh xác nhận có dòng bị chạm, ` +
    `${EXEMPT.size} lệnh được miễn CÓ GHI LÝ DO (chạm 0 dòng là kết quả đúng: gỡ cờ ở một vị trí vốn ` +
    'trống, đồng bộ nền không ai chờ, bỏ tick thứ vốn chưa tick). Bản đã ship ' +
    'có 33 lệnh và KHÔNG lệnh nào hỏi — nên sửa hồ sơ báo "đã lưu" rồi mọi ô quay về số cũ, xoá buổi ' +
    'tập rồi nó hiện lại, và lệnh ghi thử thách hỏng thì lần focus sau lại ăn mừng đúng thử thách đó ' +
    'một lần nữa; một lệnh ghi mới thêm mà quên kiểm sẽ làm hỏng bước này',
);
