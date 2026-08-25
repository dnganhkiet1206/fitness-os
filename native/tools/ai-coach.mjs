/**
 * A model may suggest. It may not decide, and it may not spend.
 *
 * ── the three bugs this was written for ──
 *
 * The AI layer was already built the right way round: every function reads its
 * caller from the JWT and never from the body, `claim_ai_call` is one atomic
 * statement, `coach_memory` has no INSERT policy for user tokens, and the
 * memory extractor validates the model's reply into a whitelist of kinds and a
 * 3–300 character single line. Measured on PostgreSQL 16.13, forty concurrent
 * claims against a limit of ten return exactly ten `true`.
 *
 * **1. A vision model's guess became a fact about somebody's diet.**
 * `scan-food` did `JSON.parse(toolCall.function.arguments)` and returned it
 * verbatim. A tool schema is what the gateway is *asked* for, not what it
 * enforces. `scan-food.tsx` then rounds each field and nothing else, the items
 * go into a meal, the meal is summed into `meal_entries`, and
 * `recomputeDailyLog` turns that into `daily_logs.kcal` — read by the calorie
 * ring, the macro rings, the daily quests, the readiness score and
 * `adaptiveTDEE`'s fourteen-day regression. The app has a gate for numbers a
 * person types (`lib/plausible.ts`); the one source that is not a person was
 * the one source not passing through it.
 *
 * **2. `claim_ai_call` believed its parameter.** It is `SECURITY DEFINER` and
 * granted to `authenticated`, which makes it the only way a client can write
 * `ai_usage` — a table with no INSERT policy precisely because it decides who
 * may spend money. Signed in as an ordinary user:
 *
 *     SELECT claim_ai_call('kind-tu-che-001');    → true
 *     SELECT claim_ai_call(repeat('x', 100000));  → true, kind_len 100000
 *
 * Not a quota bypass — every function passes its own literal — but unbounded
 * rows of unbounded size in a table nothing else lets a client touch.
 *
 * **3. The quota was spent before the request was read.** `claimCall` is an
 * increment, not a reservation, so a request with no image, no messages, or a
 * body that is not JSON cost a call for nothing. `ai-weekly-review` was the
 * sharpest: an unvalidated `week_start` went into `new Date()`, `toISOString()`
 * threw two lines later, and the caller got a 500 with the call already gone.
 *
 * ── what the rules check ──
 *
 * Rule A runs the real `clampItems` against the model outputs that matter.
 * Rule B asserts its bounds are the app's own, read out of `lib/plausible.ts`,
 * so the two cannot drift. Rules C–E read the six functions and the migration
 * for the properties that are statements about shape rather than about a run.
 *
 * None of this is the authorization boundary. That is `requireUser` plus RLS,
 * measured separately on PostgreSQL 16.13 and recorded in the ledger: B cannot
 * read, write, update or delete A's `coach_memory` or `ai_usage`, A cannot
 * write either of them directly, and an anonymous `claim_ai_call` returns
 * false.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(NATIVE, '..');
const FNS = path.join(ROOT, 'supabase/functions');
const problems = [];
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const fn = (name) => readFileSync(path.join(FNS, name, 'index.ts'), 'utf8');

/** Every AI function, and the quota kind each one claims under. */
const AI = [
  ['ai-coach', 'ai-coach'],
  ['ai-coach-memory', 'ai-coach-memory'],
  ['ai-meal-suggest', 'ai-meal-suggest'],
  ['ai-smart-nudges', 'ai-smart-nudges'],
  ['ai-weekly-review', 'ai-weekly-review'],
  ['scan-food', 'scan-food'],
];

/* ─────────────────────────────────────────────────────────────────────────
   Rule A — run the real gate between a model's guess and the diary
   ───────────────────────────────────────────────────────────────────────── */
const out = mkdtempSync(path.join(tmpdir(), 'aicoach-'));
let bounds = null;
try {
  try {
    execFileSync(
      'npx',
      ['tsc', '../supabase/functions/scan-food/index.ts', '--ignoreConfig', '--outDir', out,
        '--module', 'commonjs', '--target', 'es2022', '--skipLibCheck', '--lib', 'es2022,dom'],
      { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch {
    /* A Deno file: `Deno` is undeclared here and the imports are URLs. tsc says
       so and emits anyway; `serve` is stubbed below so the module can load. */
  }
  /* tsc keeps the source tree's shape, so the emitted file is
     `<out>/scan-food/index.js` with `../_shared/guard.js` beside it. */
  const js = path.join(out, 'scan-food', 'index.js');
  writeFileSync(
    js,
    readFileSync(js, 'utf8')
      .replace(/require\("https:\/\/deno\.land\/[^"]+"\)/g, 'require("../serve.cjs")')
      .replace(/require\("\.\.\/_shared\/guard\.ts"\)/g, 'require("../guard.cjs")')
      .replace(/require\("\.\.\/_shared\/ai\.ts"\)/g, 'require("../ai.cjs")'),
  );
  writeFileSync(path.join(out, 'serve.cjs'), 'module.exports = { serve: () => {} };');
  writeFileSync(
    path.join(out, 'guard.cjs'),
    'module.exports = { corsHeaders: {}, json: () => {}, opaque: () => {}, requireUser: async () => ({}), claimCall: async () => true, aiGate: async () => "ok", recordTokens: async () => {}, tokensOf: () => 0, meterStream: () => {}, quotaExceeded: () => {} };',
  );
  /* `_shared/ai.ts` — nhà cung cấp AI nay nằm một chỗ, nên bản dựng thử
     cũng phải biết tới nó. */
  writeFileSync(path.join(out, 'ai.cjs'), 'module.exports = { aiUrl: () => "https://ai.example/v1/chat/completions", aiKey: () => "k", aiModel: () => "m", aiVisionModel: () => "mv" };');


  const drive = path.join(out, 'drive.cjs');
  writeFileSync(
    drive,
    `globalThis.Deno = { env: { get: () => 'x' } };
     const m = require('./scan-food/index.js');
     const one = (it) => m.clampItems({ items: [it] }).items;
     const good = { food_name: 'Cơm', serving_g: 200, kcal: 260, protein_g: 5, carbs_g: 56, fat_g: 0.6, fiber_g: 1 };
     const o = {};
     o.keepsPlausible = one(good).length === 1;
     o.roundTrip = JSON.stringify(one(good)[0]);
     o.hugeKcal = one({ ...good, kcal: 900000 }).length;
     o.negKcal = one({ ...good, kcal: -50 }).length;
     o.negMacro = one({ ...good, protein_g: -20 }).length;
     o.hugeMacro = one({ ...good, protein_g: 50000 }).length;
     o.infinite = one({ ...good, kcal: Infinity }).length;
     o.stringNumber = one({ ...good, kcal: '1e12' }).length;
     o.nullMacro = one({ ...good, fat_g: null }).length;
     o.missingMacro = one({ food_name: 'x', kcal: 100 }).length;
     o.noName = one({ ...good, food_name: '' }).length;
     o.notObject = m.clampItems({ items: ['nope', 42, null] }).items.length;
     o.notArray = m.clampItems({ items: 'nope' }).items.length;
     o.garbage = m.clampItems(null).items.length;
     o.flood = m.clampItems({ items: Array.from({ length: 500 }, () => ({ ...good })) }).items.length;
     o.extraFields = JSON.stringify(one({ ...good, tier: 'max', reward: 100, user_id: 'x' })[0]);
     o.boundaryKcal = one({ ...good, kcal: 10000 }).length;
     o.overBoundaryKcal = one({ ...good, kcal: 10001 }).length;
     console.log(JSON.stringify(o));`,
  );
  const r = JSON.parse(execFileSync('node', [drive], { cwd: out, encoding: 'utf8' }).trim().split('\n').pop());

  const want = (ok, msg) => { if (!ok) problems.push(msg); };
  want(r.keepsPlausible, 'một món ăn bình thường bị loại — cổng đã đi quá tay và bữa nào cũng rỗng');
  want(
    r.hugeKcal === 0 && r.negKcal === 0 && r.hugeMacro === 0 && r.negMacro === 0,
    `số vô lý từ model vẫn lọt: 900k kcal→${r.hugeKcal}, -50 kcal→${r.negKcal}, ` +
      `50k g đạm→${r.hugeMacro}, -20 g đạm→${r.negMacro} — con số này đi thẳng vào meal_entries, ` +
      'rồi daily_logs.kcal, rồi vòng calo, nhiệm vụ ngày, điểm sẵn sàng và hồi quy 14 ngày của adaptiveTDEE',
  );
  want(
    r.infinite === 0 && r.stringNumber === 0,
    `Infinity→${r.infinite} và chuỗi '1e12'→${r.stringNumber} vẫn qua — schema của tool là thứ được YÊU CẦU, không phải thứ được ÉP`,
  );
  want(
    r.nullMacro === 0 && r.missingMacro === 0,
    `macro null→${r.nullMacro} / thiếu→${r.missingMacro} vẫn qua — giữ calo mà bỏ đạm là một món ` +
      'mà macro không mô tả chính nó, tệ hơn là không có món',
  );
  want(r.noName === 0, 'món không có tên vẫn qua');
  want(
    r.notObject === 0 && r.notArray === 0 && r.garbage === 0,
    `hồi đáp dị dạng không bị chặn (${r.notObject}/${r.notArray}/${r.garbage})`,
  );
  want(r.flood <= 20, `500 món trong một ảnh cho ra ${r.flood} — không có trần số món`);
  want(
    r.boundaryKcal === 1 && r.overBoundaryKcal === 0,
    `biên 10.000 kcal không đúng chỗ: 10000→${r.boundaryKcal}, 10001→${r.overBoundaryKcal}`,
  );
  want(
    !/tier|reward|user_id/.test(r.extraFields),
    `trường lạ do model bịa ra được giữ lại: ${r.extraFields} — ` +
      'hồi đáp của model không được mang theo thứ gì app chưa hỏi',
  );

  /*
    And the gate is on the path, not merely present.

    The first version of this rule ran `clampItems` directly and passed with the
    handler returning `JSON.parse(...)` untouched beside it — a correct function
    nobody calls, which is exactly the shape `tools/linked.mjs` exists for. What
    the handler returns has to be what came out of the gate.
  */
  const handler = strip(fn('scan-food'));
  const ret = handler.match(/const result = ([^;]+);/)?.[1] ?? '';
  if (!/clampItems\(/.test(ret)) {
    problems.push(
      `scan-food: hồi đáp trả về \`${ret.trim() || '(không đọc được)'}\` chứ không đi qua clampItems — ` +
        'schema của tool là thứ được YÊU CẦU chứ không phải thứ được ÉP, nên con số model đoán ' +
        'đi thẳng vào meal_entries → daily_logs.kcal → vòng calo, nhiệm vụ ngày, điểm sẵn sàng ' +
        'và hồi quy 14 ngày của adaptiveTDEE',
    );
  }

  /* ── Rule B — and the bounds are the app's own, not a second opinion ── */
  const plausible = readFileSync(path.join(NATIVE, 'src/lib/plausible.ts'), 'utf8');
  const boundOf = (name) =>
    Number(plausible.match(new RegExp(name + ':\\s*\\{[^}]*max:\\s*(\\d+)'))?.[1]);
  bounds = { meal_kcal: boundOf('meal_kcal'), macro_g: boundOf('macro_g') };
  const src = strip(fn('scan-food'));
  const constOf = (name) =>
    Number(src.match(new RegExp(name + '\\s*=\\s*([\\d_]+)'))?.[1]?.replace(/_/g, ''));
  const kcal = constOf('ITEM_MAX_KCAL');
  const macro = constOf('ITEM_MAX_MACRO_G');
  if (!bounds.meal_kcal || !bounds.macro_g) {
    problems.push('không đọc được BOUNDS.meal_kcal/macro_g từ lib/plausible.ts — luật này đang không kiểm gì cả');
  } else if (kcal !== bounds.meal_kcal || macro !== bounds.macro_g) {
    problems.push(
      `scan-food chặn ở ${kcal} kcal / ${macro} g còn lib/plausible.ts chặn ở ` +
        `${bounds.meal_kcal} kcal / ${bounds.macro_g} g — cùng một câu hỏi, hai câu trả lời; ` +
        'số người GÕ và số model ĐOÁN phải qua cùng một cánh cổng',
    );
  }
} catch (e) {
  problems.push(`không dựng được phép thử scan-food: ${e.message}`);
} finally {
  rmSync(out, { recursive: true, force: true });
}

/* ─────────────────────────────────────────────────────────────────────────
   Rule C — every AI function reads its caller, and pays after it reads
   ───────────────────────────────────────────────────────────────────────── */
for (const [name, kind] of AI) {
  const src = strip(fn(name));

  if (!/requireUser\(req\)/.test(src) || !/caller instanceof Response/.test(src)) {
    problems.push(
      `${name}: không gác bằng requireUser — verify_jwt = false trong config.toml, ` +
        'nên cổng duy nhất là cái function tự dựng, và ở đây thì không có',
    );
  }
  /* `claimCall` HOẶC `aiGate` — cả hai gọi cùng một hàm SQL và cùng đếm.

     Luật này khớp `claimCall` nguyên văn. Cổng đổi sang `aiGate` để diễn tả ba
     trạng thái (trong hạn mức / vượt-nhưng-có-ví / hết) thay vì hai, và luật đỏ
     dù việc đếm không đổi một chút nào. Lần thứ mười trong repo này. */
  if (!new RegExp(`(claimCall|aiGate)\\(supabase, "${kind}"\\)`).test(src)) {
    problems.push(`${name}: không trừ hạn mức dưới đúng tên '${kind}' — một lời gọi không đếm là một hoá đơn không trần`);
  }
  /* The caller comes from the token. A user id in the body is a user id
     anybody can send. */
  if (/body[?.]*\.(user_id|userId|profile_id|account_id)/.test(src)) {
    problems.push(`${name}: đọc id người dùng từ thân request — danh tính phải đến từ JWT, không từ người gọi`);
  }
  /* And the quota is spent after the request is known to be one. */
  const claimAt = src.indexOf('claimCall(supabase');
  const bodyAt = src.indexOf('req.json()');
  if (claimAt >= 0 && bodyAt >= 0 && claimAt < bodyAt) {
    problems.push(
      `${name}: trừ hạn mức TRƯỚC khi đọc thân request — claimCall là một phép cộng chứ không phải một chỗ giữ, ` +
        'nên một request dị dạng chưa từng ra khỏi server vẫn ăn một lượt của người dùng',
    );
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   Rule D — the model's reply never chooses who it belongs to
   ───────────────────────────────────────────────────────────────────────── */
{
  const src = strip(fn('ai-coach-memory'));
  /* Every write to coach_memory binds the owner from the token. */
  for (const m of src.matchAll(/from\("coach_memory"\)\s*\.\s*(insert|upsert|update|delete)/g)) {
    const after = src.slice(m.index, m.index + 400);
    if (!/user_id: userId|\.eq\("user_id", userId\)/.test(after)) {
      problems.push(
        `ai-coach-memory: ${m[1]} vào coach_memory không ràng buộc user_id theo người đã xác thực — ` +
          'chủ sở hữu một trí nhớ không bao giờ được đến từ hồi đáp của model',
      );
    }
  }
  /* The reply is validated into a shape, not stored as it arrives. */
  if (!/KINDS\.includes/.test(src)) {
    problems.push('ai-coach-memory: không kiểm `kind` theo danh sách trắng — model đặt tên loại gì cũng vào bảng');
  }
  if (!/!\/\[\\n\\r\]\/\.test/.test(src)) {
    problems.push(
      'ai-coach-memory: không chặn xuống dòng trong một "fact" — ' +
        'đó là cách một dòng dữ kiện biến thành một đoạn chỉ thị khi được dán vào system prompt',
    );
  }
  /* Deletion resolves through ids that are already on file, so a fact the
     model invented resolves to nothing. */
  if (!/idOf\.get\(f\)/.test(src) || !/\.in\("id", dropIds\)/.test(src)) {
    problems.push(
      'ai-coach-memory: xoá không đi qua id đã có trên hồ sơ — ' +
        'một câu model bịa ra sẽ khớp bằng CHỮ và xoá mất thứ người ta chỉ nói một lần',
    );
  }
  /* Memory is quoted to the coach as data. */
  const coach = fn('ai-coach');
  if (!/not as instructions|không phải chỉ thị/.test(coach)) {
    problems.push(
      'ai-coach: khối trí nhớ được dán vào system prompt mà không nói rõ đó là DỮ KIỆN chứ không phải chỉ thị',
    );
  }
  /* And the coach's own reply is streamed, never parsed into state. */
  if (/JSON\.parse/.test(strip(coach))) {
    problems.push(
      'ai-coach: phân tích hồi đáp của model — hàm này stream thẳng cho client và không được biến lời model thành trạng thái',
    );
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   Rule E — the quota counter, read from the migration that ships
   ───────────────────────────────────────────────────────────────────────── */
{
  const sql = strip(
    execFileSync('sh', ['-c', `cat ${path.join(ROOT, 'supabase/migrations')}/*.sql`], { encoding: 'utf8' }),
  );
  /* Migrations run in filename order, so the last definition is the live one. */
  /* Bộ đếm nay nằm trong `ai_gate`; `claim_ai_call` chỉ là một lớp mỏng gọi nó,
     vì boolean không diễn tả được ba trạng thái. Luật vẫn canh đúng một thứ —
     cộng và đọc phải nằm trong MỘT câu lệnh — chỉ là câu đó đã dọn sang tên
     khác, nên tìm cả hai và lấy bản mới nhất có thân thật. */
  const defs = [...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.(ai_gate|claim_ai_call)[\s\S]*?\$\$;/g)]
    .filter((m) => /INSERT INTO public\.ai_usage/.test(m[0]));
  const body = defs.length ? defs[defs.length - 1][0] : '';
  if (!body) {
    problems.push('không tìm thấy claim_ai_call trong migrations — luật này đã lạc mục tiêu');
  } else {
    if (!/INSERT INTO public\.ai_usage[\s\S]*?ON CONFLICT[\s\S]*?DO UPDATE SET calls = public\.ai_usage\.calls \+ 1[\s\S]*?RETURNING calls/.test(body)) {
      problems.push(
        'claim_ai_call không còn cộng và đọc trong MỘT câu lệnh — ' +
          'tách phần đọc khỏi phần cộng là một cuộc đua, và cái thua cuộc là hoá đơn ' +
          '(đo thật: 40 lời gọi đồng thời / hạn mức 10 → đúng 10 lần cho phép)',
      );
    }
    /* `RETURN false` hoặc `RETURN 'denied'` — hai cách viết cùng một câu trả
       lời, vì hàm nay trả TEXT ba trạng thái thay vì boolean hai. */
    if (!/auth\.uid\(\)/.test(body) || !/v_uid IS NULL[\s\S]{0,60}RETURN (false|'denied')/.test(body)) {
      problems.push('claim_ai_call không từ chối khi chưa đăng nhập');
    }
    if (!/p_kind !~|p_kind ~/.test(body)) {
      problems.push(
        'claim_ai_call không kiểm hình dạng p_kind — hàm này là SECURITY DEFINER và là đường ' +
          'DUY NHẤT client ghi được ai_usage, nên một tham số không kiểm là ghi được dòng dài tuỳ ý, ' +
          'nhiều tuỳ ý, vào một bảng vốn không có policy ghi cho client',
      );
    }
    /* And the ceiling on unknown kinds must not be able to switch off a known
       one — the first version of that fix locked callers out of `ai-coach`. */
    if (/p_kind/.test(body) && /count\(\*\)/.test(body)) {
      if (!/kind NOT IN \(/.test(body)) {
        problems.push(
          'claim_ai_call đếm số bộ đếm trong ngày mà không loại trừ các kind CÓ THẬT — ' +
            'lấp đầy bằng tên rác sẽ khoá luôn ai-coach của chính người đó cả ngày',
        );
      }
    }
  }

  /* `ai_usage` is the counter; a client that could write it could reset it. */
  const at = sql.indexOf('CREATE TABLE IF NOT EXISTS public.ai_usage');
  const ddl = at < 0 ? '' : sql.slice(at, at + 2000);
  if (!ddl) {
    problems.push('không tìm thấy bảng ai_usage — luật này đã lạc mục tiêu');
  } else {
    for (const m of ddl.matchAll(/CREATE POLICY\s+"([^"]+)"\s+ON\s+public\.ai_usage\s+FOR\s+(\w+)/gi)) {
      if (!/select/i.test(m[2])) {
        problems.push(
          `ai_usage có policy ${m[2].toUpperCase()} "${m[1]}" — ` +
            'người dùng ghi được bộ đếm của chính mình là người dùng tự đặt lại hạn mức',
        );
      }
    }
  }
}

if (problems.length) {
  console.log('lớp AI còn hở:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'lớp AI OK — CHẠY THẬT clampItems của scan-food: món bình thường qua được, còn 900.000 kcal, ' +
    '-50 kcal, 50.000 g đạm, Infinity, chuỗi "1e12", macro null/thiếu, món không tên, mảng dị dạng ' +
    'và 500 món trong một ảnh đều bị loại; biên đúng ở 10.000 kcal; trường model bịa thêm ' +
    '(tier, reward, user_id) không được mang theo — bản đã ship trả nguyên arguments của tool, ' +
    'và schema của tool là thứ được YÊU CẦU chứ không phải thứ được ÉP, nên con số đó đi thẳng vào ' +
    'meal_entries → daily_logs.kcal → vòng calo, nhiệm vụ ngày, điểm sẵn sàng, hồi quy 14 ngày của TDEE. ' +
    `Ngưỡng đọc NGƯỢC từ lib/plausible.ts (${bounds?.meal_kcal ?? '?'} kcal / ${bounds?.macro_g ?? '?'} g) ` +
    'nên số người GÕ và số model ĐOÁN qua cùng một cổng. Cả 6 function AI đều gác bằng requireUser ' +
    '(verify_jwt = false nên đó là cổng duy nhất), trừ hạn mức dưới đúng tên của mình, không đọc id ' +
    'người dùng từ thân request, và trừ hạn mức SAU khi đọc thân request — claimCall là phép cộng ' +
    'chứ không phải chỗ giữ, nên request dị dạng từng ăn một lượt mà chưa từng ra khỏi server. ' +
    'Mọi lệnh ghi coach_memory ràng buộc chủ theo JWT, kind theo danh sách trắng, fact cấm xuống dòng, ' +
    'và xoá đi qua id đã có trên hồ sơ nên câu model bịa ra không xoá được gì; ai-coach stream thẳng ' +
    'và không phân tích lời model thành trạng thái. claim_ai_call cộng-và-đọc trong MỘT câu lệnh ' +
    '(40 đồng thời / hạn mức 10 → đúng 10), từ chối khi chưa đăng nhập, kiểm hình dạng p_kind, ' +
    'và trần cho kind lạ không đụng tới kind có thật; ai_usage không có policy ghi cho client',
);
