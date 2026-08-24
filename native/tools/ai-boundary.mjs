/**
 * What leaves the database and reaches the model provider.
 *
 * ── the primary question this chain started from ──
 *
 * A request authenticated as B must assemble and send **only B's** data. Chain
 * H asked whether model *output* could become authority; this asks the inverse
 * — what goes *in*.
 *
 * Every rule here **runs** the real edge-function handlers. They are copied,
 * their three remote imports rewritten to local stand-ins, transpiled, and
 * called with a real `Request`. `fetch` is replaced by a recorder, so what is
 * asserted is the exact bytes that would have gone to the gateway. Nothing here
 * greps for a guard.
 *
 * ── the attack, and its result ──
 *
 * A and B are seeded with disjoint markers (`ALPHA_*` / `BRAVO_*`) across
 * profiles, daily logs, sleep, workouts, biometrics, coach memory and favourite
 * foods. Each function is then called **as B, with `userId: A` and
 * `user_id: A` in the body**:
 *
 *     ai-coach · ai-weekly-review · ai-meal-suggest · ai-smart-nudges
 *     → A markers in the outgoing provider payload: none
 *     → B markers present: yes
 *
 * The request body is never an identity source in any of them: every query is
 * `.eq("user_id", userId)` where `userId` is the JWT `sub` from `requireUser`.
 * That is checked by running it, because "the body is ignored" is a claim about
 * code and this is a claim about a payload.
 *
 * ── what is *not* sent, which is the other half of the audit ──
 *
 * Four of the five functions `select('*')` from `profiles`, and two do it for
 * `daily_logs` and `sleep_logs` as well. That is local over-fetching and it
 * **does not cross the boundary**: each builds an explicit whitelist object.
 * Captured field-by-field with a stand-in that honours PostgREST's column
 * projection, no request carries `user_id`, `email`, `dob`, `onboarding_completed`
 * or any raw row. The `Authorization` header holds the gateway key; the
 * caller's JWT is never forwarded.
 *
 * That distinction is why the projection matters, and it is worth recording
 * that the first version of this harness ignored `select()` and reported
 * `favorite_foods[].user_id` reaching the provider. It does not. A harness that
 * over-reports is as useless as one that under-reports, and that one nearly
 * became two findings.
 *
 * ── the two things that were wrong ──
 *
 * Both are the same shape: **the request body was validated in two of the four
 * functions and not the other two.**
 *
 * `ai-meal-suggest` copied `meal_type` into the prompt exactly as sent, with no
 * length limit and no domain:
 *
 *     meal_type = 'Z'.repeat(200000)  →  202,240-char request to a paid gateway
 *
 * for one unit of a quota that counts calls, not size. The client only ever
 * sends one of seven words.
 *
 * `ai-smart-nudges` took `date` on trust and did `new Date(...)` arithmetic on
 * it — the identical bug `ai-weekly-review` was fixed for:
 *
 *     date = 'not-a-date'  →  RangeError: Invalid time value
 *                          →  HTTP 500, claim_ai_call already counted 1
 *
 * ── what these rules cannot tell you ──
 *
 * `PROVIDER-PAYLOAD-PROVEN`, `REAL-PROVIDER-UNVERIFIED`. The handlers, the
 * prompt construction and the payload are real; Supabase, Deno and the gateway
 * are stand-ins. No request has been made to Lovable, no model has run, and
 * nothing here says anything about what the provider does with what it
 * receives.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(NATIVE, '..');
const FUNCTIONS = path.join(REPO, 'supabase', 'functions');
const problems = [];

/** The functions this chain covers, with a body that makes each one work. */
const FNS = {
  'ai-coach': { messages: [{ role: 'user', content: 'hi' }], lang: 'en' },
  'ai-weekly-review': { week_start: '2026-08-17', lang: 'en' },
  'ai-meal-suggest': { meal_type: 'lunch', date: '2026-08-17' },
  'ai-smart-nudges': { date: '2026-08-17' },
  'ai-coach-memory': {
    messages: [
      { role: 'user', content: 'my left shoulder hurts' },
      { role: 'assistant', content: 'noted' },
      { role: 'user', content: 'and I am vegan' },
    ],
  },
};

const out = mkdtempSync(path.join(tmpdir(), 'aibound-'));
try {
  const fnDir = path.join(out, 'fn');
  mkdirSync(fnDir, { recursive: true });
  for (const name of Object.keys(FNS)) {
    copyFileSync(path.join(FUNCTIONS, name, 'index.ts'), path.join(fnDir, `${name}.ts`));
  }
  /* Enumerated, not listed. This was `['guard.ts', 'sleep.ts']` written out
     twice — here and in the import rewrite below — so `_shared/readiness.ts`
     arriving broke this whole file with `Cannot find module`, and the fix would
     have been to type a third name into two places and wait for the fourth. */
  const SHARED = readdirSync(path.join(FUNCTIONS, '_shared')).filter((f) => f.endsWith('.ts'));
  for (const shared of SHARED) {
    copyFileSync(path.join(FUNCTIONS, '_shared', shared), path.join(fnDir, shared));
  }
  /* The three imports a Deno function has that Node does not. */
  for (const f of readdirSync(fnDir).filter((f) => f.endsWith('.ts'))) {
    const p = path.join(fnDir, f);
    writeFileSync(
      p,
      readFileSync(p, 'utf8')
        .replace('https://deno.land/std@0.168.0/http/server.ts', './shim-serve.js')
        .replace('https://esm.sh/@supabase/supabase-js@2', './shim-sb.js')
        .replace(/"\.\.\/_shared\/([\w-]+\.ts)"/g, '"./$1"'),
    );
  }

  writeFileSync(
    path.join(fnDir, 'shim-serve.js'),
    `let handler = null;
     module.exports = { serve: (h) => { handler = h; }, __handler: () => handler, __reset: () => { handler = null; } };\n`,
  );

  /* A stand-in Supabase that does the two things this audit depends on: it
     honours PostgREST's column projection, and a client built from a user's
     token sees only that user's rows — the RLS half. The service-role client
     sees everything, which is exactly why it is worth testing separately. */
  writeFileSync(
    path.join(fnDir, 'shim-sb.js'),
    `const db = { rows: {}, calls: [] };
     const TOKENS = {};
     function builder(table, viewerId, isAdmin) {
       const filters = []; let limitN = null; let cols = null;
       const api = {
         select(spec) {
           if (typeof spec === 'string' && spec.trim() !== '*') {
             cols = spec.split(',').map((c) => c.trim()).filter(Boolean);
           }
           return api;
         },
         eq(c, v) {
           /* Recorded separately from the result. The stand-in enforces RLS, so
              a query that ASKED for another user's rows still comes back empty —
              and "empty because the server refused" is not the same finding as
              "the function never asked". The brief is explicit that client
              prevention and server prevention are two proofs, so the requested
              filter is captured here and asserted on its own. */
           if (c === 'user_id') db.calls.push({ table, askedFor: String(v), viewerId });
           filters.push((r) => String(r[c]) === String(v));
           return api;
         },
         gte(c, v) { filters.push((r) => String(r[c]) >= String(v)); return api; },
         lte(c, v) { filters.push((r) => String(r[c]) <= String(v)); return api; },
         gt(c, v) { filters.push((r) => String(r[c]) > String(v)); return api; },
         lt(c, v) { filters.push((r) => String(r[c]) < String(v)); return api; },
         in(c, vs) { filters.push((r) => vs.includes(r[c])); return api; },
         order() { return api; },
         limit(n) { limitN = n; return api; },
         rows() {
           let o = (db.rows[table] || []).filter((r) => filters.every((f) => f(r)));
           if (!isAdmin) o = o.filter((r) => r.user_id === undefined || r.user_id === viewerId);
           db.calls.push({ table, viewerId, isAdmin, returned: o.length });
           if (cols) o = o.map((r) => Object.fromEntries(cols.filter((c) => c in r).map((c) => [c, r[c]])));
           return limitN == null ? o : o.slice(0, limitN);
         },
         then(res, rej) { return Promise.resolve({ data: api.rows(), error: null }).then(res, rej); },
         single() { const r = api.rows(); return Promise.resolve(r.length === 1 ? { data: r[0], error: null } : { data: null, error: { code: 'PGRST116' } }); },
         maybeSingle() { const r = api.rows(); return Promise.resolve({ data: r[0] ?? null, error: null }); },
         async delete() { db.calls.push({ table, op: 'delete', isAdmin }); return { data: null, error: null }; },
         async update() { db.calls.push({ table, op: 'update', isAdmin }); return { data: null, error: null }; },
         async upsert(rows) { db.calls.push({ table, op: 'upsert', isAdmin, rows }); return { data: null, error: null }; },
         async insert(rows) { db.calls.push({ table, op: 'insert', isAdmin, rows }); return { data: null, error: null }; },
       };
       return api;
     }
     function createClient(url, key, opts) {
       const isAdmin = key === 'SERVICE_ROLE_KEY';
       const token = (opts?.global?.headers?.Authorization || '').replace('Bearer ', '');
       const viewerId = TOKENS[token]?.sub;
       return {
         from: (t) => builder(t, viewerId, isAdmin),
         rpc: async (name) => { db.calls.push({ rpc: name, viewerId }); return { data: true, error: null }; },
         auth: { async getClaims(t) { const c = TOKENS[t]; return c ? { data: { claims: c }, error: null } : { data: null, error: { message: 'bad token' } }; } },
       };
     }
     module.exports = {
       createClient, __db: db,
       __reset() { db.rows = {}; db.calls = []; for (const k of Object.keys(TOKENS)) delete TOKENS[k]; },
       __seed(t, a) { db.rows[t] = (db.rows[t] || []).concat(a); },
       __addToken(tok, claims) { TOKENS[tok] = claims; },
     };\n`,
  );

  try {
    execFileSync(
      'npx',
      ['tsc', ...readdirSync(fnDir).filter((f) => f.endsWith('.ts')).map((f) => path.join(fnDir, f)),
        '--outDir', fnDir, '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck', '--ignoreConfig'],
      { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch {
    /* Deno globals and the rewritten imports have no types here — emitted anyway. */
  }
  for (const f of readdirSync(fnDir).filter((f) => f.endsWith('.js') && !f.startsWith('shim-'))) {
    const p = path.join(fnDir, f);
    writeFileSync(
      p,
      readFileSync(p, 'utf8')
        .replace('require("./guard.ts")', 'require("./guard.js")')
        .replace('require("./sleep.ts")', 'require("./sleep.js")'),
    );
  }

  writeFileSync(
    path.join(out, 'drive.cjs'),
    `const path = require('path');
     const FN = path.join(__dirname, 'fn');
     const sb = require(path.join(FN, 'shim-sb.js'));
     const serveShim = require(path.join(FN, 'shim-serve.js'));
     const A = 'aaaaaaaa-1111-1111-1111-111111111111';
     const B = 'bbbbbbbb-2222-2222-2222-222222222222';
     let sent = [];
     let reply = '{"nudges":[],"add":[],"confirm":[],"drop":[],"suggestions":[]}';
     let httpFail = null;

     global.fetch = async (url, init) => {
       sent.push({ url: String(url), headers: init?.headers ?? {}, body: init?.body ? JSON.parse(init.body) : null });
       if (httpFail) return { ok: false, status: httpFail, json: async () => ({}), text: async () => '{}' };
       return { ok: true, status: 200,
         json: async () => ({ choices: [{ message: { content: reply, tool_calls: null } }] }),
         text: async () => 'ok' };
     };
     global.Deno = { env: { get: (k) => ({ SUPABASE_URL: 'http://x', SUPABASE_ANON_KEY: 'ANON',
       SUPABASE_SERVICE_ROLE_KEY: 'SERVICE_ROLE_KEY', LOVABLE_API_KEY: 'GATEWAY_KEY' }[k]) } };

     function seed() {
       sb.__reset();
       sb.__addToken('tokA', { sub: A, role: 'authenticated' });
       sb.__addToken('tokB', { sub: B, role: 'authenticated' });
       /* the publishable key that ships inside the app binary */
       sb.__addToken('anonTok', { role: 'anon' });
       const mk = (uid, M) => {
         sb.__seed('profiles', [{ user_id: uid, name: M + '_NAME', email: M + '_EMAIL@x.test',
           dob: '1990-01-01', weight_kg: M === 'ALPHA' ? 111 : 222, height_cm: 170, goal: M + '_GOAL',
           activity_level: 'moderate', training_level: 'intermediate', tdee_target_kcal: 2000,
           macro_protein_g: 150, macro_carbs_g: 200, macro_fat_g: 60, macro_fiber_g: 30,
           sleep_target_hours: 8, water_target_ml: 2500, dietary_preference: M + '_DIET',
           allergies: [M + '_ALLERGY'], disliked_foods: [M + '_DISLIKE'], onboarding_completed: true }]);
         sb.__seed('daily_logs', [{ user_id: uid, date: '2026-08-17', kcal: M === 'ALPHA' ? 987 : 654,
           protein_g: 100, carbs_g: 200, fat_g: 50, readiness_score: 70, readiness_status: 'ok',
           steps: 5000, sleep_duration_min: 400, volume_load: 1000, notes: M + '_DAILY_NOTE' }]);
         sb.__seed('sleep_logs', [{ user_id: uid, waketime: '2026-08-17T07:00:00Z', bedtime: '2026-08-16T23:00:00Z',
           quality: M === 'ALPHA' ? 123 : 456, deep_min: 60, rem_min: 60, light_min: 200, asleep_min: 400,
           source: 'manual', external_id: M + '_SLEEP_EXTID' }]);
         sb.__seed('workout_sessions', [{ user_id: uid, template_name: M + '_WORKOUT', volume_load: 1000,
           session_rpe: 7, pain_flags: [M + '_PAIN'], date_time: '2026-08-17T10:00:00Z', sets: [] }]);
         sb.__seed('biometric_samples', [{ user_id: uid, hr_bpm: 55, hrv_rmssd_ms: 60, hrv_sdnn_ms: 70, date_time: '2026-08-17T06:00:00Z' }]);
         sb.__seed('coach_memory', [{ user_id: uid, id: M + '-mem-1', kind: 'constraint', fact: M + '_MEMORY_FACT', last_confirmed: '2026-08-01T00:00:00Z' }]);
         sb.__seed('food_items', [{ user_id: uid, name: M + '_FAVFOOD', kcal: 300, protein_g: 20, carbs_g: 30, fat_g: 10, serving_g: 100, is_favorite: true }]);
         sb.__seed('water_logs', [{ user_id: uid, amount_ml: 250, date: '2026-08-17' }]);
       };
       mk(A, 'ALPHA'); mk(B, 'BRAVO');
     }

     async function call(fn, { token, body }) {
       serveShim.__reset();
       delete require.cache[require.resolve(path.join(FN, fn + '.js'))];
       require(path.join(FN, fn + '.js'));
       sent = [];
       const h = new Map();
       if (token) h.set('authorization', 'Bearer ' + token);
       const res = await serveShim.__handler()({
         method: 'POST',
         headers: { get: (k) => h.get(k.toLowerCase()) ?? null },
         json: async () => body,
       });
       return { status: res.status, body: await res.text(), provider: sent };
     }
     module.exports = { A, B, seed, call, sb,
       setReply: (r) => { reply = r; }, setFail: (s) => { httpFail = s; },
       resetProvider: () => { reply = '{"nudges":[],"add":[],"confirm":[],"drop":[],"suggestions":[]}'; httpFail = null; } };\n`,
  );

  writeFileSync(
    path.join(out, 'run.cjs'),
    `const { A, B, seed, call, sb, setReply, setFail, resetProvider } = require('./drive.cjs');
     const FNS = ${JSON.stringify(FNS)};
     const o = { cross: {}, fields: {}, auth: {}, size: {}, dates: {} };
     const A_MARKERS = ['ALPHA_NAME','ALPHA_GOAL','ALPHA_DIET','ALPHA_ALLERGY','ALPHA_DISLIKE',
       'ALPHA_DAILY_NOTE','ALPHA_SLEEP_EXTID','ALPHA_WORKOUT','ALPHA_MEMORY_FACT','ALPHA_FAVFOOD',
       'ALPHA_EMAIL','ALPHA_PAIN','987','111','123'];
     const FORBIDDEN = ['user_id','userId','email','"dob"','onboarding_completed','tokB','tokA','Bearer tok'];
     const flat = (v, pre = '') => {
       if (v === null || typeof v !== 'object') return [];
       if (Array.isArray(v)) return v.length ? flat(v[0], pre + '[].') : [];
       return Object.entries(v).flatMap(([k, x]) => (x && typeof x === 'object') ? flat(x, pre + k + '.') : [pre + k]);
     };

     (async () => {
       /* ── A. authenticated B, body says A ── */
       for (const [fn, body] of Object.entries(FNS)) {
         seed(); resetProvider();
         const r = await call(fn, { token: 'tokB', body: { ...body, userId: A, user_id: A } });
         const payload = JSON.stringify(r.provider);
         /* what the function ASKED the database for, before RLS had an opinion */
         o.asked = o.asked || {};
         o.asked[fn] = [...new Set(sb.__db.calls.filter((c) => c.askedFor).map((c) => c.askedFor))];
         o.cross[fn] = {
           status: r.status,
           calls: r.provider.length,
           aLeaks: A_MARKERS.filter((m) => payload.includes(m)),
           hasB: /BRAVO/.test(payload),
           forbidden: FORBIDDEN.filter((f) => payload.includes(f)),
           authHeader: r.provider[0] ? String(r.provider[0].headers.Authorization || '') : '',
         };
         /* the fields that actually crossed */
         const sys = (r.provider[0]?.body?.messages ?? []).find((m) => m.role === 'system')?.content ?? '';
         const m = sys.match(/\\{[\\s\\S]*\\}/);
         let fields = [];
         if (m) { try { fields = flat(JSON.parse(m[0])); } catch { fields = ['(unparseable)']; } }
         o.fields[fn] = fields;
       }

       /* ── B. every way of not being a signed-in user ── */
       for (const [fn, body] of Object.entries(FNS)) {
         seed(); resetProvider();
         const none = await call(fn, { token: null, body });
         const bad = await call(fn, { token: 'garbage', body });
         const anon = await call(fn, { token: 'anonTok', body });
         const good = await call(fn, { token: 'tokB', body });
         o.auth[fn] = { none: none.status, bad: bad.status, anon: anon.status, good: good.status,
           anonProviderCalls: anon.provider.length };
       }

       /* ── C. user-controlled strings, and the size of what they buy ── */
       const big = 'Z'.repeat(200000);
       for (const [fn, body, field] of [
         ['ai-meal-suggest', { meal_type: big }, 'meal_type'],
         ['ai-coach', { messages: [{ role: 'user', content: big }] }, 'messages'],
         ['ai-coach-memory', { messages: [{ role: 'user', content: big }, { role: 'assistant', content: 'x' }, { role: 'user', content: big }] }, 'messages'],
       ]) {
         seed(); resetProvider();
         const r = await call(fn, { token: 'tokB', body });
         o.size[fn + '/' + field] = JSON.stringify(r.provider).length;
       }

       /* ── D. a date the caller made up ── */
       for (const fn of ['ai-meal-suggest', 'ai-smart-nudges', 'ai-weekly-review']) {
         const res = [];
         for (const d of ['not-a-date', '9999-99-99', '', '2026-08-17\\' OR 1=1']) {
           seed(); resetProvider();
           const key = fn === 'ai-weekly-review' ? 'week_start' : 'date';
           const r = await call(fn, { token: 'tokB', body: { ...FNS[fn], [key]: d } });
           res.push(r.status);
         }
         o.dates[fn] = res.join(',');
       }

       /* ── E. model output that names another user ── */
       seed(); resetProvider();
       setReply(JSON.stringify({
         add: [{ kind: 'constraint', fact: 'INJECTED', source_excerpt: 'x', user_id: A, id: 'ALPHA-mem-1' }],
         confirm: ['ALPHA_MEMORY_FACT'], drop: ['ALPHA_MEMORY_FACT'],
       }));
       const mem = await call('ai-coach-memory', { token: 'tokB', body: FNS['ai-coach-memory'] });
       const writes = sb.__db.calls.filter((c) => c.op);
       o.modelOutput = {
         status: mem.status,
         body: mem.body,
         rows: writes.flatMap((w) => w.rows || []),
         tables: [...new Set(writes.map((w) => w.table))],
       };

       /* ── F. model output that is not usable at all ── */
       o.malformed = {};
       for (const [label, reply] of [
         ['hugeFact', JSON.stringify({ add: [{ kind: 'constraint', fact: 'X'.repeat(20000) }], confirm: [], drop: [] })],
         ['unknownKind', JSON.stringify({ add: [{ kind: 'admin_override', fact: 'F' }], confirm: [], drop: [] })],
         ['factNull', JSON.stringify({ add: [{ kind: 'constraint', fact: null }], confirm: [], drop: [] })],
         ['notJson', 'I refuse.'],
         ['manyFacts', JSON.stringify({ add: Array.from({ length: 200 }, (_, i) => ({ kind: 'goal', fact: 'F' + i })), confirm: [], drop: [] })],
       ]) {
         seed(); resetProvider(); setReply(reply);
         const r = await call('ai-coach-memory', { token: 'tokB', body: FNS['ai-coach-memory'] });
         const rows = sb.__db.calls.filter((c) => c.op === 'upsert').flatMap((w) => w.rows || []);
         o.malformed[label] = { status: r.status, rows: rows.length, ownerOk: rows.every((x) => x.user_id === B) };
       }

       console.log(JSON.stringify(o));
     })();\n`,
  );

  const r = JSON.parse(
    execFileSync('node', [path.join(out, 'run.cjs')], { cwd: out, encoding: 'utf8' })
      .trim().split('\n').pop(),
  );
  const want = (ok, msg) => { if (!ok) problems.push(msg); };

  /* ── A. the primary invariant ── */
  for (const [fn, c] of Object.entries(r.cross)) {
    want(
      c.aLeaks.length === 0,
      `${fn}: dữ liệu của NGƯỜI KHÁC lọt vào payload gửi cho nhà cung cấp mô hình — ${c.aLeaks.join(',')}. ` +
        'Gọi với tư cách B, thân yêu cầu ghi userId của A. Thân yêu cầu KHÔNG BAO GIỜ được là nguồn danh tính',
    );
    want(c.hasB || c.calls === 0, `${fn}: gọi đúng người mà dữ liệu của chính họ không có trong payload`);
    want(
      c.forbidden.length === 0,
      `${fn}: payload gửi ra ngoài chứa ${c.forbidden.join(',')} — định danh tài khoản, email hoặc token ` +
        'của người dùng không có việc gì ở bên thứ ba',
    );
    want(
      c.authHeader === '' || c.authHeader === 'Bearer GATEWAY_KEY',
      `${fn}: header Authorization gửi tới nhà cung cấp là "${c.authHeader}" — phải là khoá gateway, ` +
        'không bao giờ là JWT của người gọi',
    );
  }

  /* Client prevention, proved on its own: every user-data query names the JWT
     subject. If a function ever asked for the body's id, RLS would still return
     nothing — and the leak-check above would still pass — so this is the rule
     that would notice. */
  for (const [fn, asked] of Object.entries(r.asked ?? {})) {
    want(
      asked.length > 0 && asked.every((id) => id === 'bbbbbbbb-2222-2222-2222-222222222222'),
      `${fn}: hàm HỎI cơ sở dữ liệu về ${JSON.stringify(asked)} trong khi người gọi là B. ` +
        'RLS vẫn sẽ trả về rỗng, nên rò rỉ không xảy ra — nhưng "máy chủ từ chối" và "hàm không bao giờ hỏi" ' +
        'là hai lớp phòng thủ khác nhau, và đây là lớp phía client',
    );
  }

  /* every field that crossed, checked against the identity/PII set */
  const NEVER = ['user_id', 'email', 'dob', 'onboarding_completed', 'external_id', 'notes'];
  for (const [fn, fields] of Object.entries(r.fields)) {
    const bad = fields.filter((f) => NEVER.some((n) => f.endsWith('.' + n) || f === n || f.endsWith('[].' + n)));
    want(
      bad.length === 0,
      `${fn}: cột ${bad.join(',')} vượt qua ranh giới AI. Bốn hàm dùng select('*') trên profiles — ` +
        'điều đó chỉ được phép vì mỗi hàm dựng một object DANH SÁCH TRẮNG; đưa cả hàng vào prompt thì không',
    );
  }

  /* ── B. identity ── */
  for (const [fn, a] of Object.entries(r.auth)) {
    want(
      a.none === 401 && a.bad === 401 && a.anon === 401,
      `${fn}: không token / token rác / KHOÁ ANON ra ${a.none}/${a.bad}/${a.anon} thay vì 401. ` +
        'Khoá anon nằm sẵn trong file cài đặt của app, nên nếu nó qua được thì bất kỳ ai cũng tiêu được ' +
        'credit của dự án này',
    );
    want(a.anonProviderCalls === 0, `${fn}: khoá anon gọi được tới nhà cung cấp ${a.anonProviderCalls} lần`);
    want(a.good === 200, `${fn}: người dùng hợp lệ bị từ chối (${a.good})`);
  }

  /* ── C. size ── */
  for (const [k, size] of Object.entries(r.size)) {
    want(
      size < 60000,
      `${k}: một chuỗi 200.000 ký tự trong thân yêu cầu tạo ra payload ${size} ký tự gửi tới gateway TRẢ TIỀN ` +
        '— hạn mức đếm SỐ LƯỢT chứ không đếm kích thước, nên một lượt mua được một prompt lớn tuỳ ý',
    );
  }

  /* ── D. dates ── */
  for (const [fn, statuses] of Object.entries(r.dates)) {
    want(
      !statuses.split(',').includes('500'),
      `${fn}: một ngày do người gọi bịa ra làm hàm sập 500 (${statuses}) — và hạn mức đã bị trừ trước đó. ` +
        'ai-weekly-review đã được sửa đúng lỗi này; chốt phải nằm chung một chỗ để hàm thứ ba không lỡ',
    );
  }

  /* ── E/F. model output ── */
  want(
    r.modelOutput.rows.every((x) => x.user_id === 'bbbbbbbb-2222-2222-2222-222222222222'),
    `output của mô hình ghi được dòng mang user_id của người khác: ${JSON.stringify(r.modelOutput.rows)}`,
  );
  want(
    r.modelOutput.rows.every((x) => !('id' in x)),
    'output của mô hình đặt được id của dòng — id phải do cơ sở dữ liệu sinh, nếu không mô hình chọn được dòng nào bị ghi đè',
  );
  want(
    /"dropped":0/.test(r.modelOutput.body) && /"confirmed":0/.test(r.modelOutput.body),
    `mô hình yêu cầu xoá/xác nhận một fact của NGƯỜI KHÁC và hàm làm theo: ${r.modelOutput.body} — ` +
      'ánh xạ fact→id chỉ được dựng từ những dòng của chính người gọi',
  );
  for (const [label, m] of Object.entries(r.malformed)) {
    want(m.status === 200, `output hỏng (${label}) làm hàm trả ${m.status}`);
    want(m.ownerOk, `output hỏng (${label}) ghi ra dòng không thuộc người gọi`);
    if (label !== 'manyFacts') {
      want(m.rows === 0, `output hỏng (${label}) vẫn ghi ${m.rows} dòng vào coach_memory`);
    } else {
      want(m.rows <= 40, `200 fact một lúc ghi ${m.rows} dòng — trần của bảng là 40`);
    }
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}

if (problems.length) {
  console.log('ranh giới dữ liệu AI còn hở:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'ranh giới dữ liệu AI OK — CHẠY THẬT năm handler edge function, bắt đúng payload rời khỏi hàm: gọi với ' +
    'tư cách B kèm userId của A trong thân yêu cầu thì KHÔNG một dấu hiệu nào của A lọt ra, dữ liệu của B ' +
    'thì có; không payload nào mang user_id, email, dob, external_id hay notes, và header Authorization ' +
    'luôn là khoá gateway chứ không phải JWT người gọi (bốn hàm select("*") trên profiles, nhưng mỗi hàm ' +
    'dựng một object danh sách trắng nên đó chỉ là đọc thừa tại chỗ). Không token / token rác / KHOÁ ANON ' +
    'đều 401 và không gọi tới nhà cung cấp. Một chuỗi 200.000 ký tự trong thân yêu cầu không còn mua được ' +
    'một prompt khổng lồ (bản đã ship: meal_type sinh payload 202.240 ký tự cho một lượt hạn mức), và một ' +
    'ngày bịa ra không còn làm hàm sập 500 sau khi đã trừ hạn mức. Output của mô hình không đặt được ' +
    'user_id hay id của dòng, không xoá được fact của người khác, và output hỏng — fact 20k ký tự, kind lạ, ' +
    'fact null, không phải JSON — ghi ra 0 dòng, còn 200 fact bị chặn ở 40',
);
