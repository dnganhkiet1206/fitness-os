/**
 * One quest, from the thing that selects it to the coin it mints.
 *
 * ── the question this file exists to answer ──
 *
 * *What exactly makes one quest completion into one economic event?* The answer
 * in this app is `UNIQUE(user_id, ref_key)` and nothing else. There is no quest
 * completion table: 36 tables build from `supabase/migrations` and not one
 * records that a quest was finished. `done === true` is a **current condition**
 * recomputed from `daily_logs`, water, sleep and the profile, and it is allowed
 * to go back to false — delete the meal and it does. The only durable record
 * that the day happened is the ledger row.
 *
 * So the invariant is not "completion is monotonic". It is: **the reward is**.
 * Measured, driving the real hook: complete → 1 claim, 1 credit, 1 peek, 10
 * coins; delete the meal → nothing changes; log it again → no second claim, no
 * second observation, no second celebration. That is internally consistent and
 * it is recorded here as product semantics rather than fixed.
 *
 * ── the four things that were not consistent ──
 *
 * **The client priced its own reward.** `earn_mascot_coins(p_ref_key, p_amount)`
 * bounded `p_amount` to 300 and never asked what the key was worth. Against a
 * cluster rebuilt from every migration:
 *
 *     DAILY_QUESTS: meal = 10
 *     earn_mascot_coins('d:<today>:meal', 300)  →  sổ cái: … = 300
 *
 * and every ref_key was accepted and paid — `d:…:ghost`, `d:not-a-date:meal`,
 * `d:2099-01-01:meal`, `meal`, `""`. The ceiling was not a bound on forgery, it
 * was the price list for it. `buy_mascot_item` had had server authority since
 * 20260810120000; earning never got it.
 *
 * **A quest finished while the app was closed was recorded as a miss.** The
 * learning sat behind `before && !before[key]`, and `before` is null on the
 * first reading of a session. So the coins were paid, nothing was learned, the
 * ask stayed outstanding — and the next day `settleStale` charged the arm a
 * **loss** for a quest that was completed and paid for:
 *
 *     hoàn thành ngoài tầm quan sát → settle → arm {3,2} → {3,3}   THẤT BẠI
 *     cùng việc đó, quan sát trực tiếp        → arm {3,2} → {4,2}   THÀNH CÔNG
 *
 * Reachable without anything unusual — sleep and workout are both satisfiable
 * by a HealthKit sync landing while the app is shut.
 *
 * **Coins earned before midnight died at midnight.** `unclaimed` is built from
 * today, so a claim refused at 23:59 was never offered again: `claims: 1,
 * coins: 0`, permanently.
 *
 * **The steps quest asked for a number it was not measuring.** The label said
 * "Walk 5,000 steps" while the condition was `steps >= stepsGoal`, default
 * 10 000.
 *
 * ── what this rule refuses to prove by reading ──
 *
 * Every claim below is executed. The economy half runs against a real
 * PostgreSQL built from every migration in the repository, with
 * `SET LOCAL ROLE authenticated` inside explicit transactions so RLS applies.
 * The lifecycle half drives the real `useQuestAutoClaim` through a hook runtime
 * whose `useRef` persists across renders — Chain X's shim returned a fresh
 * object every call, which would have made `sent` and `seen` empty on every
 * render and hidden all of this.
 */
import { execFileSync, execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(NATIVE, '..');
const problems = [];
const notes = [];
const out = mkdtempSync(path.join(tmpdir(), 'qlife-'));
const want = (ok, m) => { if (!ok) problems.push(m); };
const sh = (c) => { try { return { status: 0, stdout: execSync(c, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; } catch (e) { return { status: e.status ?? 1, stdout: (e.stdout || '') + (e.stderr || '') }; } };

/* ══════════════════════════════════════════════════════════════════════════
   PART 1 — the economy boundary, on a real cluster
   ══════════════════════════════════════════════════════════════════════════ */
const PGBIN = ['/usr/lib/postgresql/16/bin', '/usr/lib/postgresql/15/bin', '/usr/local/pgsql/bin']
  .find((d) => existsSync(path.join(d, 'initdb'))) ?? null;
/* Below the ephemeral range (32768-60999 on Linux): a port inside it can be
   taken by any outbound socket, and under a full `check.mjs` run there are
   many. Standalone this file was green and inside the suite it failed with
   "khong khoi dong duoc PostgreSQL" — bisected to the parent commit, where it
   failed identically, so it is the port and not the change. */
const PORT = 25471;
const DATA = path.join(out, 'pg');

if (!PGBIN) {
  notes.push('không có PostgreSQL trên máy này — phần kinh tế KHÔNG được chạy, và nói rõ là không chạy');
} else {
  try {
    mkdirSync(DATA, { recursive: true });
    const asPg = sh('id -u postgres').status === 0 && process.getuid && process.getuid() === 0;
    /* The parent too: `mkdtempSync` makes it 0700 root, and initdb refused to
       start because postgres could not traverse into it — which reported as
       "không khởi động được PostgreSQL" and looked like a missing server. */
    if (asPg) sh(`chmod 755 ${out} && chown postgres:postgres ${DATA} && chmod 700 ${DATA}`);
    const run = (c) => (asPg ? sh(`su postgres -c ${JSON.stringify(c)}`) : sh(c));
    run(`${PGBIN}/initdb -D ${DATA} -U postgres --auth=trust`);
    run(`${PGBIN}/pg_ctl -D ${DATA} -o "-p ${PORT} -c listen_addresses=127.0.0.1 -k ${DATA}" -l ${DATA}/log start`);
    sh('sleep 2');
    const psql = (s, db = 'postgres') => { const f = path.join(out, 'q.sql'); writeFileSync(f, s); return sh(`psql -h 127.0.0.1 -p ${PORT} -U postgres -d ${db} -v ON_ERROR_STOP=1 -q -f ${f}`); };
    if (psql('SELECT 1;').status !== 0) throw new Error('không khởi động được PostgreSQL');
    psql('CREATE DATABASE qy;');
    psql(`CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}'::jsonb, created_at timestamptz DEFAULT now());
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $x$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $x$;
      CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $x$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'anon') $x$;
      CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
      DO $x$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $x$;
      DO $x$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $x$;
      DO $x$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $x$;
      GRANT USAGE ON SCHEMA public, auth, extensions TO anon, authenticated, service_role;`, 'qy');
    for (const m of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) {
      sh(`psql -h 127.0.0.1 -p ${PORT} -U postgres -d qy -q -f ${path.join(ROOT, 'supabase/migrations', m)} 2>/dev/null`);
    }
    psql('GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;', 'qy');
    const tables = Number(sh(`psql -h 127.0.0.1 -p ${PORT} -U postgres -d qy -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"`).stdout.trim());
    want(tables >= 30, `chỉ dựng được ${tables} bảng từ migrations — bộ dò hỏng, đừng tin phần kinh tế`);

    const A = '11111111-1111-1111-1111-111111111111';
    const B = '22222222-2222-2222-2222-222222222222';
    psql(`INSERT INTO auth.users (id,email) VALUES ('${A}','a@x'),('${B}','b@x') ON CONFLICT DO NOTHING;`, 'qy');
    const q = (s) => sh(`psql -h 127.0.0.1 -p ${PORT} -U postgres -d qy -tA -c ${JSON.stringify(s)}`);
    /* Explicit transaction, every time. `SET LOCAL` outside one is a no-op and
       every RLS conclusion drawn from it would be worthless. */
    const asUser = (uid, body) => q(`BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = '${uid}'; ${body} COMMIT;`);
    const wipe = () => q('DELETE FROM public.mascot_transactions;');
    const paid = (uid) => q(`SELECT COALESCE(SUM(amount),0) FROM public.mascot_transactions WHERE user_id='${uid}';`).stdout.trim();
    const rows = (uid) => q(`SELECT count(*) FROM public.mascot_transactions WHERE user_id='${uid}';`).stdout.trim();
    const day = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
    const today = day(0);

    /* The catalogue, restated here rather than imported, so this notices if the
       prices in `mascot-room.ts` and the prices the server charges drift. */
    const CATALOGUE = { meal: 10, workout: 25, water: 15, sleep: 15, steps: 10 };

    /* ── baseline: an honest claim must actually pay ── */
    wipe();
    asUser(A, `SELECT public.claim_quest_reward('d:${today}:meal', 'meal');`);
    want(paid(A) === '10', `một claim hợp lệ không trả xu (sổ=${paid(A)}) — bộ dò hỏng, đừng tin phần còn lại`);

    /* ── A. the amount is the definition, whatever the caller says ── */
    const bribed = [];
    for (const [quest, price] of Object.entries(CATALOGUE)) {
      for (const [label, call] of [
        ['claim_quest_reward', `SELECT public.claim_quest_reward('d:${today}:${quest}', '${quest}');`],
        ['earn_mascot_coins(300)', `SELECT public.earn_mascot_coins('d:${today}:${quest}', 300, '${quest}');`],
        ['earn_mascot_coins(299)', `SELECT public.earn_mascot_coins('d:${today}:${quest}', 299, '${quest}');`],
      ]) {
        wipe();
        asUser(A, call);
        if (paid(A) !== String(price)) bribed.push(`${quest} qua ${label} → ${paid(A)} (đúng ra ${price})`);
      }
    }
    want(
      bribed.length === 0,
      `người gọi vẫn tự định giá phần thưởng của mình: ${JSON.stringify(bribed)} — ` +
        'earn_mascot_coins chặn p_amount ở 300 rồi ghi thẳng con số đó vào sổ mà KHÔNG hỏi ref_key đáng bao ' +
        'nhiêu, nên một quest catalogue định giá 10 xu trả 300. buy_mascot_item tra giá từ shop_prices từ ' +
        '20260810120000 — bên tiêu đã có thẩm quyền máy chủ, bên kiếm thì chưa. Cả hai hàm phải lấy giá từ ' +
        'reward_prices; p_amount của hàm cũ được nhận rồi VỨT ĐI, vì những bản app đã nằm trên máy người ta ' +
        'vẫn gọi chữ ký ba tham số đó',
    );

    /* ── B. a ref_key that names nothing must mint nothing ── */
    const minted = [];
    for (const rk of [`d:${today}:ghost`, `d:${today}:`, `d:not-a-date:meal`, `d:2099-01-01:meal`,
                      `d:1970-01-01:meal`, `meal`, ``, `d:${today}:meal:extra`, `d:2026-02-31:meal`,
                      `set:nosuch`, `ch:diamond:2026-08-17:x`, `w:`, `dev:12345`, `buy:head_cap`]) {
      wipe();
      asUser(A, `SELECT public.claim_quest_reward('${rk.replace(/'/g, "''")}', 'x');`);
      asUser(A, `SELECT public.earn_mascot_coins('${rk.replace(/'/g, "''")}', 300, 'x');`);
      if (paid(A) !== '0') minted.push(`${JSON.stringify(rk)} → ${paid(A)}`);
    }
    want(
      minted.length === 0,
      `ref_key không đặt tên cho thứ gì vẫn đúc ra xu: ${JSON.stringify(minted)} — ` +
        'ref_key trước đây không được kiểm gì cả, nên chuỗi rỗng cũng mua được 300 xu, và 800 xu một ngày ' +
        'trên những khoá không tồn tại',
    );

    /* ── C. the date window ── */
    const dateWrong = [];
    for (const [n, expect] of [[2, false], [1, true], [0, true], [-1, true], [-2, true], [-3, false]]) {
      wipe();
      asUser(A, `SELECT public.claim_quest_reward('d:${day(n)}:meal', 'x');`);
      const got = paid(A) !== '0';
      if (got !== expect) dateWrong.push(`${n >= 0 ? '+' : ''}${n} ngày → ${got ? 'nhận' : 'từ chối'} (đúng ra ${expect ? 'nhận' : 'từ chối'})`);
    }
    want(
      dateWrong.length === 0,
      `cửa sổ ngày sai: ${JSON.stringify(dateWrong)} — +1 ngày PHẢI nhận vì questRefKey dùng ngày ĐỊA PHƯƠNG ` +
        'còn hàm này thấy UTC (ở Kiritimati ngày địa phương đi trước UTC), và −2 ngày PHẢI nhận vì một claim ' +
        'hỏng lúc 23:59 được thử lại sau nửa đêm. Ngoài đó thì từ chối, hoặc đây không còn là một cửa sổ',
    );

    /* ── D. ownership ── */
    wipe();
    const anon = q(`BEGIN; SET LOCAL ROLE authenticated; SELECT public.claim_quest_reward('d:${today}:meal','x'); COMMIT;`);
    want(anon.status !== 0, 'một phiên KHÔNG có JWT vẫn claim được phần thưởng');
    asUser(A, `SELECT public.claim_quest_reward('d:${today}:meal','x');`);
    asUser(B, `SELECT public.claim_quest_reward('d:${today}:meal','x');`);
    want(
      paid(A) === '10' && paid(B) === '10' && rows(A) === '1' && rows(B) === '1',
      `cùng một ref_key ở hai tài khoản không tách ra thành hai dòng riêng (A=${paid(A)}/${rows(A)} B=${paid(B)}/${rows(B)})`,
    );
    const forge = asUser(A, `INSERT INTO public.mascot_transactions (user_id,amount,reason,ref_key) VALUES ('${B}',300,'x','forged');`);
    want(forge.status !== 0, 'ALPHA ghi thẳng được một dòng sổ cho BRAVO');
    /* ROW_COUNT, not the exit status: RLS filters an UPDATE to zero rows and
       reports success, so "no error" says nothing here. */
    asUser(A, `UPDATE public.reward_prices SET coins = 300 WHERE reward_key='quest:meal';`);
    want(
      q(`SELECT coins FROM public.reward_prices WHERE reward_key='quest:meal';`).stdout.trim() === '10',
      'bảng giá thưởng SỬA ĐƯỢC từ một phiên đã đăng nhập — thẩm quyền máy chủ chỉ là hình thức nếu giá do người gọi đặt',
    );

    /* ── E. one economic row, under real concurrency ── */
    const conc = spawnSync('node', ['-e', `
      const pg = require(${JSON.stringify(path.join(NATIVE, 'node_modules/pg/lib/index.js'))});
      const CFG = { host: '127.0.0.1', port: ${PORT}, user: 'postgres', database: 'qy' };
      (async () => {
        const admin = new pg.Client(CFG); await admin.connect();
        let bad = 0;
        for (let t = 0; t < 100; t++) {
          await admin.query('DELETE FROM public.mascot_transactions');
          const cs = [];
          for (let i = 0; i < 2; i++) { const c = new pg.Client(CFG); await c.connect(); cs.push(c); }
          await Promise.all(cs.map(async (c) => {
            try {
              await c.query('BEGIN');
              await c.query('SET LOCAL ROLE authenticated');
              await c.query("SET LOCAL request.jwt.claim.sub = '${A}'");
              await c.query("SELECT public.claim_quest_reward('d:${today}:meal','x')");
              await c.query('COMMIT');
            } catch { await c.query('ROLLBACK').catch(() => {}); }
          }));
          const r = await admin.query('SELECT count(*)::int n, COALESCE(SUM(amount),0)::int s FROM public.mascot_transactions');
          if (r.rows[0].n !== 1 || r.rows[0].s !== 10) bad += 1;
          await Promise.all(cs.map((c) => c.end()));
        }
        await admin.end();
        console.log(JSON.stringify({ bad }));
      })().catch((e) => console.log(JSON.stringify({ err: String(e) })));
    `], { encoding: 'utf8', timeout: 180000 });
    const cr = JSON.parse((conc.stdout || '{}').trim().split('\n').filter((l) => l.startsWith('{')).pop() || '{"err":"no output"}');
    want(!cr.err, `phép thử đồng thời không chạy: ${cr.err}`);
    want(cr.bad === 0, `${cr.bad}/100 lần hai người gọi ĐỒNG THỜI cùng một ref_key không ra đúng một dòng 10 xu`);

    /* ── F. the weekly challenge is priced by its tier, from the key ── */
    const chWrong = [];
    for (const [tier, price] of [['bronze', 25], ['silver', 50], ['gold', 80], ['platinum', 120]]) {
      wipe();
      asUser(A, `SELECT public.earn_mascot_coins('ch:${tier}:2026-08-17:steps_50k', 300, 'x');`);
      if (paid(A) !== String(price)) chWrong.push(`${tier} → ${paid(A)} (đúng ra ${price})`);
    }
    wipe();
    asUser(A, `SELECT public.earn_mascot_coins('w:42', 300, 'x');`);
    if (paid(A) !== '40') chWrong.push(`w:42 → ${paid(A)} (đúng ra 40)`);
    want(
      chWrong.length === 0,
      `thưởng thử thách tuần vẫn do người gọi định giá: ${JSON.stringify(chWrong)} — ` +
        'hạng đã nằm sẵn trong ref_key, nên máy chủ đọc nó từ đó chứ không nhận p_amount',
    );

  } catch (e) {
    problems.push(`không dựng được phép thử kinh tế: ${e.message}`);
  }
}

/* Stopped in one place, and unconditionally.

   It used to be stopped on the happy path only. A rule that went red left the
   postmaster holding the port, so the NEXT run could not start one and reported
   "không khởi động được PostgreSQL" — a detector that fails once and then keeps
   failing for a different reason is worse than one that never ran. Found while
   break-testing this file: break 1 went red correctly and break 2 came back
   with a bootstrap error that had nothing to do with the break. */
function stopCluster() {
  if (!PGBIN || !existsSync(DATA)) return;
  /* Through `su postgres` where the start was, because `pg_ctl` refuses to run
     as root at all — a plain call here did nothing, silently, and left the
     postmaster holding the port. */
  const asPg = sh('id -u postgres').status === 0 && process.getuid && process.getuid() === 0;
  const cmd = `${PGBIN}/pg_ctl -D ${DATA} stop -m immediate`;
  sh(asPg ? `su postgres -c ${JSON.stringify(cmd)} 2>/dev/null` : `${cmd} 2>/dev/null`);
}

/* ══════════════════════════════════════════════════════════════════════════
   PART 2 — the lifecycle, through the real hook
   ══════════════════════════════════════════════════════════════════════════ */
try {
  const shimPkg = (rel, body) => {
    const dir = path.join(out, 'node_modules', rel);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: rel, main: 'index.js' }));
    writeFileSync(path.join(dir, 'index.js'), body);
  };
  shimPkg('@react-native-async-storage/async-storage',
    `const s = new Map();
     const A = { async getItem(k){return s.has(k)?s.get(k):null;}, async setItem(k,v){s.set(k,String(v));},
                 async removeItem(k){s.delete(k);}, _raw:(k)=>(s.has(k)?s.get(k):null), _put:(k,v)=>s.set(k,v) };
     module.exports = A; module.exports.default = A;`);
  /* A hook runtime with real slots. `useRef` MUST persist across renders —
     `sent`, `seen` and `owed` are the entire mechanism under test, and a shim
     that hands back a fresh object each call would make every rule below
     vacuous. */
  shimPkg('react', `
let cur = null;
const same = (a,b) => Array.isArray(a) && Array.isArray(b) && a.length===b.length && a.every((x,i)=>Object.is(x,b[i]));
function useRef(v){ const s=cur.slots,i=cur.i++; if(!(i in s)) s[i]={current:v}; return s[i]; }
function useMemo(f,deps){ const s=cur.slots,i=cur.i++,p=s[i]; if(p&&same(p.deps,deps)) return p.v; const v=f(); s[i]={v,deps}; return v; }
function useEffect(f,deps){ const s=cur.slots,i=cur.i++,p=s[i]; if(!p||!same(p.deps,deps)) cur.effects.push(f); s[i]={deps}; }
function useSyncExternalStore(sub,get){ return get(); }
function useState(v){ const s=cur.slots,i=cur.i++; if(!(i in s)) s[i]={v}; const t=s[i]; return [t.v,(n)=>{t.v=n;}]; }
const useCallback = (f)=>f;
function makeInstance(fn){ const slots=[]; return { render(...a){ const prev=cur; cur={slots,i:0,effects:[]};
  try { const r=fn(...a); const es=cur.effects; cur=prev; for(const e of es) e(); return r; } catch(e){ cur=prev; throw e; } } }; }
module.exports = { useRef, useMemo, useEffect, useSyncExternalStore, useState, useCallback, makeInstance };`);

  const LIB = readdirSync(path.join(NATIVE, 'src/lib')).filter((f) => f.endsWith('.ts')).map((f) => `src/lib/${f}`);
  const FILES = [...LIB, 'src/hooks/use-quest-autoclaim.ts', 'src/hooks/use-daily-quests.ts'];
  try {
    execFileSync('npx', ['tsc', ...FILES, '--ignoreConfig', '--outDir', out, '--rootDir', 'src',
      '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck', '--lib', 'es2020,dom'],
      { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch { /* `@/` unmapped → TS2307; emits anyway */ }
  for (const rel of FILES) {
    const js = path.join(out, rel.replace(/^src\//, '').replace(/\.tsx?$/, '.js'));
    writeFileSync(js, readFileSync(js, 'utf8').replace(/require\("@\/(.*?)"\)/g, (_, p) => {
      let r = path.relative(path.dirname(js), path.join(out, p));
      if (!r.startsWith('.')) r = './' + r;
      return `require(${JSON.stringify(r)})`;
    }));
  }
  mkdirSync(path.join(out, 'hooks'), { recursive: true });
  writeFileSync(path.join(out, 'hooks/use-daily-quests.js'), `const bus=require('../bus.js'); exports.useDailyQuests=()=>bus.quests;`);
  writeFileSync(path.join(out, 'hooks/use-mascot-room.js'), `const bus=require('../bus.js'); exports.useMascotWallet=()=>({data:bus.wallet}); exports.useClaimReward=()=>bus.claim;`);
  writeFileSync(path.join(out, 'hooks/use-koa-context.js'), `const bus=require('../bus.js'); exports.useKoaContext=()=>bus.koaCtx; exports.refreshKoaContext=(c)=>({...c});`);
  writeFileSync(path.join(out, 'hooks/use-entitlement.js'), `exports.useEntitlement=()=>({has:()=>true});`);
  writeFileSync(path.join(out, 'bus.js'), `
const log = [];
const bus = {
  log, rec: (w, d) => log.push({ what: w, data: d }),
  quests: null,
  wallet: { coins: 0, xp: 0, claimed: new Set() },
  koaCtx: { hour: 9, streak: 5, state: 'steady', emptyToday: false, visible: true, reduced: false },
  behaviour: 'success',
  /* Asynchronous by default, because \`mutate\` is. A stand-in that settled
     synchronously put claim.success BEFORE the learning and would have
     inverted the ordering finding entirely. */
  pending: [],
  claim: { mutate(vars, opts) {
    bus.rec('claim', { refKey: vars.refKey, amount: vars.amount });
    bus.pending.push(() => {
      if (bus.behaviour === 'success') {
        bus.rec('claim.ok', { refKey: vars.refKey });
        bus.wallet.claimed.add(vars.refKey);
        bus.wallet.coins += vars.amount;
        opts && opts.onSuccess && opts.onSuccess();
      } else if (bus.behaviour === 'error') {
        bus.rec('claim.err', { refKey: vars.refKey });
        opts && opts.onError && opts.onError();
      } else { bus.rec('claim.lost', { refKey: vars.refKey }); }
    });
  } },
  flush() { const p = bus.pending; bus.pending = []; for (const f of p) f(); },
};
module.exports = bus;`);

  writeFileSync(path.join(out, 'drive.cjs'), DRIVER());
  const raw = execFileSync('node', [path.join(out, 'drive.cjs')], { cwd: out, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 300000 });
  const line = raw.split('\n').find((l) => l.startsWith('RESULT '));
  if (!line) throw new Error('bộ lái không trả kết quả: ' + raw.slice(0, 500));
  const r = JSON.parse(line.slice(7));
  if (r.harnessError) throw new Error(r.harnessError);

  /* ── baselines ── */
  /* Either the harness stopped driving the real path, or the path itself lost
     a step. Both are worth stopping for, and the message must not assert which
     — an earlier draft said "bộ dò hỏng" and was wrong the first time a real
     regression tripped it. */
  want(r.baseLive.claims === 1 && r.baseLive.credits === 1 && r.baseLive.peek === 1,
    `một hoàn thành QUAN SÁT TRỰC TIẾP không còn đi hết đường: claim/credit/peek = ` +
      `${JSON.stringify(r.baseLive)}, chờ 1/1/1 — hoặc đường thật đã mất một bước, hoặc bộ dò không còn lái nó. ` +
      'Xử cái này trước, các luật dưới đo cùng một đường');
  want(r.askedWasOutstanding, 'bộ dò không tạo được một ask đang chờ, nên luật "thành công hay thất bại" bên dưới rỗng');

  /* ── G. a completion nobody watched is a WIN, not a miss ── */
  want(
    r.lateArm === r.liveArm,
    `một quest hoàn thành NGOÀI TẦM QUAN SÁT cho hậu nghiệm khác với cùng việc đó quan sát trực tiếp ` +
      `(ngoài tầm=${r.lateArm}, trực tiếp=${r.liveArm}) — học nằm sau \`before && !before[key]\`, và \`before\` ` +
      'là null ở lần đọc đầu mỗi phiên, nên ask vẫn treo và hôm sau settleStale tính nó là một THẤT BẠI: ' +
      'mô hình học ngược lại điều đã xảy ra, cho một quest đã hoàn thành VÀ đã trả xu. Ngủ và tập đều có thể ' +
      'được HealthKit đồng bộ về lúc app đang đóng',
  );
  want(r.lateCredits === 1, `hoàn thành ngoài tầm quan sát ghi ${r.lateCredits} lần credit — phải đúng một`);
  want(
    r.lateRepeatCredits === 1,
    `đọc lại nhiều lần trong ngày ghi ${r.lateRepeatCredits} lần credit — credit phải idempotent trên sổ ask`,
  );
  /* The instrument counts CALLS; the invariant is about the POSTERIOR. Calling
     `creditQuest` for a quest nobody was asked about is expected and harmless —
     what must not happen is the belief moving. An earlier draft asserted the
     call count and went red on correct behaviour. */
  want(
    r.unaskedArm === r.priorArm,
    `một quest Koa CHƯA HỎI vẫn làm đổi niềm tin (${r.unaskedArm} so với prior ${r.priorArm}) — ` +
      'không có ask thì không có gì để quy công, và bịa ra một cái là đúng cái bẫy base-rate bandit.ts cảnh báo',
  );

  /* ── H. and it still must not celebrate (PS-Y2) ── */
  want(
    r.latePeek === 0 && r.lateKoa === 0,
    `hoàn thành ngoài tầm quan sát nay CÓ diễn (peek=${r.latePeek}, koa=${r.lateKoa}) — ` +
      'mở app vào một ngày đã xong bốn quest không được dựng bốn màn ăn mừng cho việc làm tối qua. ' +
      'Bản sửa chỉ tách phần HỌC ra, không tách phần diễn',
  );

  /* ── I. and it must not touch the clock model ── */
  want(
    r.lateHourObs === 0,
    `hoàn thành ngoài tầm quan sát vẫn ghi giờ (${r.lateHourObs} lần) — giờ có được ở lần đọc đầu là giờ ` +
      'MỞ APP chứ không phải giờ người ta ăn, và observeHour là tổng cộng dồn không có đường lùi',
  );

  /* ── J. coins earned before midnight ── */
  want(
    r.rolloverPaid,
    'một claim bị từ chối trước nửa đêm KHÔNG BAO GIỜ được mời lại — unclaimed dựng từ HÔM NAY, nên ' +
      'danh sách hôm sau là khoá của ngày khác và không gì trong app quay lại lấy của hôm qua',
  );
  want(
    r.staleStopped,
    'một khoá quá hạn vẫn được thử lại mãi — máy chủ đã từ chối nó trên nguyên tắc, và một tập chỉ lớn lên là một chỗ rò',
  );

  /* ── K. current condition is not a historical event ── */
  want(
    r.recreate.claims === 1 && r.recreate.credits === 1 && r.recreate.peek === 1,
    `xoá nguồn rồi tạo lại đúc thêm giá trị (${JSON.stringify(r.recreate)}) — done là điều kiện HIỆN TẠI ` +
      'và được phép quay về false; sự kiện lịch sử là dòng sổ, và nó chỉ có một',
  );

  /* ── L. one day, one day_complete ── */
  want(
    r.dayCompleteEmits === 1,
    `sự kiện "xong cả ngày" phát ${r.dayCompleteEmits} lần cho một ngày — emitKoa khử trùng theo id nên kết ` +
      'quả vẫn đúng, nhưng nó nằm trong vòng lặp từng quest và hỏi cùng một câu năm lần',
  );

  /* ── M. the label says the number it measures ── */
  want(
    r.stepsLabel.includes('{n}') && r.stepsRendered === r.stepsGoalUsed && !/\d/.test(r.stepsLabel),
    `nhãn quest bước chân nói "${r.stepsRendered}" trong khi điều kiện đo theo ${r.stepsGoalUsed} ` +
      `(nhãn thô: "${r.stepsLabel}") — nhãn từng gõ cứng 5.000 còn use-daily-quests so với mục tiêu người ` +
      'dùng tự đặt (mặc định 10.000, chỉnh được 1k–50k). Con số phải đến từ chỗ điều kiện đọc, không được gõ vào chuỗi',
  );

  /* ── N. the oracle ── */
  want(
    r.oracleMismatch === 0,
    `${r.oracleMismatch}/${r.oracleRuns} chuỗi vòng đời lệch với một oracle chỉ biết (user, quest, date) — ` +
      `${JSON.stringify(r.oracleSample)}`,
  );
} catch (e) {
  problems.push(`không dựng được phép thử vòng đời: ${e.message}`);
} finally {
  stopCluster();
  rmSync(out, { recursive: true, force: true });
}

if (problems.length) {
  console.log('vòng đời quest còn hở:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'vòng đời quest OK — ' + (PGBIN ? 'PostgreSQL THẬT dựng từ mọi migration, ' : 'KHÔNG có PostgreSQL trên máy này (phần kinh tế bị bỏ qua), ') +
    'và CHẠY THẬT useQuestAutoClaim trên một runtime hook có useRef bền qua các lần render. ' +
    'Điều bất biến: KHÔNG có bảng hoàn thành quest — done là điều kiện HIỆN TẠI và được phép quay về false — ' +
    'nên thứ biến một lần hoàn thành thành MỘT sự kiện kinh tế chỉ là UNIQUE(user_id, ref_key). Lỗi đã sửa: ' +
    'earn_mascot_coins nhận p_amount của người gọi, nên một quest catalogue định giá 10 xu trả 300, và mọi ' +
    'ref_key đều được nhận kể cả chuỗi rỗng — nay giá lấy từ reward_prices và khoá lạ bị từ chối; một quest ' +
    'hoàn thành lúc app đóng được trả xu nhưng không được học, rồi hôm sau bị settleStale tính là THẤT BẠI — ' +
    'nay credit tách khỏi việc React có nhìn thấy chuyển trạng thái hay không, mà giờ và màn diễn thì không; ' +
    'và xu kiếm trước nửa đêm chết lúc nửa đêm — nay khoá bị từ chối được nhớ theo danh tính và mời lại trong ' +
    'hai ngày. KHÔNG phải lỗi và không sửa: xoá nguồn rồi tạo lại không đúc thêm gì, vì sổ mới là sự kiện.',
);
for (const n of notes) console.log(`  · ${n}`);

/* ────────────────────────────────────────────────────────────────────────── */
function DRIVER() {
  return String.raw`
const React = require('react');
const bus = require('./bus.js');
const PM = require('./lib/personal-model.js');
const PEEK = require('./lib/quest-peek.js');
const STAGE = require('./lib/koa-stage.js');
const { DAILY_QUESTS, questRefKey } = require('./lib/mascot-room.js');
const { useQuestAutoClaim } = require('./hooks/use-quest-autoclaim.js');

const J = JSON.stringify;
const QUESTS = ['workout', 'meal', 'water', 'sleep', 'steps'];
const D = '2026-08-19';

/* Wrapped so ORDER and COUNT are measured, not read off the source. The real
   functions still run underneath. */
const rc = PM.creditQuest; PM.creditQuest = (...a) => { bus.rec('credit', { quest: a[0] }); return rc(...a); };
const rn = PM.noteDone;    PM.noteDone    = (...a) => { bus.rec('hour', { quest: a[0] }); return rn(...a); };
const rp = PEEK.peekAt;    PEEK.peekAt    = (...a) => { bus.rec('peek', { quest: a[0] }); return rp(...a); };
const re = STAGE.emitKoa;  STAGE.emitKoa  = (ev, c, n) => { bus.rec('koa', { id: ev.id }); return re(ev, c, n); };

function mkQuests(doneKeys, { today = D, ready = true } = {}) {
  const done = {}; for (const q of QUESTS) done[q] = doneKeys.includes(q);
  const unclaimed = QUESTS.filter((k) => done[k] && !bus.wallet.claimed.has(questRefKey(today, k)));
  return { done, active: QUESTS, today, ready,
    doneCount: QUESTS.filter((k) => done[k]).length, total: QUESTS.length,
    unclaimed, unclaimedCoins: 0 };
}
let inst = null;
const mount = () => { inst = React.makeInstance(useQuestAutoClaim); };
const render = (d, o) => { bus.quests = mkQuests(d, o); inst.render(); bus.flush(); };
const count = (w) => bus.log.filter((e) => e.what === w).length;
const reset = async () => {
  bus.log.length = 0; bus.wallet = { coins: 0, xp: 0, claimed: new Set() };
  bus.behaviour = 'success'; bus.pending = [];
  await PM.resetPersonalModel(); STAGE.resetKoaStage();
};
const arm = (q) => J(PM.usePersonalModel().arms[q]);

(async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
  const o = {};
  o.priorArm = J({ alpha: 3, beta: 2 });

  /* baseline + the live shape, which is what "late" must match */
  await reset(); mount();
  PM.noteAsked('meal', D);
  o.askedWasOutstanding = J(PM.usePersonalModel().asked) === J({ meal: D });
  render([]); render(['meal']);
  o.baseLive = { claims: count('claim'), credits: count('credit'), peek: count('peek'), hour: count('hour') };
  PM.settleStale('2026-08-20');
  o.liveArm = arm('meal');

  /* G/H/I — the same day, completed out of sight */
  await reset(); mount();
  PM.noteAsked('meal', D);
  render(['meal']);                      // first reading already done
  o.lateCredits = count('credit'); o.lateHourObs = count('hour');
  o.latePeek = count('peek'); o.lateKoa = count('koa');
  render(['meal']); render(['meal']);    // re-reads must not re-credit
  o.lateRepeatCredits = count('credit');
  PM.settleStale('2026-08-20');
  o.lateArm = arm('meal');

  /* a quest Koa never asked about must move nothing */
  await reset(); mount();
  render(['water']);
  o.unaskedCredits = count('credit');
  PM.settleStale('2026-08-20');
  o.unaskedArm = J(PM.usePersonalModel().arms.meal);

  /* J — refused before midnight, retried after */
  await reset(); mount();
  bus.behaviour = 'error';
  render([]); render(['meal']);
  bus.behaviour = 'success';
  render([], { today: '2026-08-20' });
  o.rolloverPaid = bus.wallet.claimed.has('d:2026-08-19:meal');
  const before = count('claim');
  render([], { today: '2026-08-26' });
  o.staleStopped = count('claim') === before;

  /* K — delete the source, then recreate it */
  await reset(); mount();
  PM.noteAsked('meal', D);
  render([]); render(['meal']); render([]); render(['meal']);
  o.recreate = { claims: count('claim'), credits: count('credit'), peek: count('peek') };

  /* L — one day_complete for one day */
  await reset(); mount();
  render([]); render(QUESTS);
  o.dayCompleteEmits = bus.log.filter((e) => e.what === 'koa' && e.data.id === 'day:' + D).length;

  /* M — the steps label */
  const stepsDef = DAILY_QUESTS.find((q) => q.key === 'steps');
  o.stepsLabel = stepsDef.name.en;
  o.stepsGoalUsed = '12,500';
  o.stepsRendered = stepsDef.name.en.replace('{n}', '12,500').match(/[\d,]+/)[0];

  /* N — an oracle that knows only identities */
  {
    let seed = 424242;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const users = ['A', 'B'], quests = QUESTS, dates = ['2026-08-18', '2026-08-19', '2026-08-20'];
    let mismatch = 0, sample = null;
    const RUNS = 1000;
    for (let t = 0; t < RUNS; t++) {
      const evs = [];
      let owner = users[Math.floor(rnd() * 2)];
      for (let i = 0, n = 3 + Math.floor(rnd() * 25); i < n; i++) {
        const roll = rnd();
        if (roll < 0.12) { owner = users[Math.floor(rnd() * 2)]; continue; }
        if (roll < 0.30) continue;               // delete / recreate / rollover: no economic act
        evs.push({ owner, quest: quests[Math.floor(rnd() * quests.length)],
                   date: dates[Math.floor(rnd() * dates.length)], ok: rnd() > 0.15 });
      }
      /* oracle: one durable reward per (user, quest, date), and only when the
         server accepted. It knows no quest definition and no wallet code. */
      const paid = new Set();
      for (const e of evs) if (e.ok) paid.add(e.owner + '|' + e.quest + '|' + e.date);
      /* system: one row per (user, ref_key) */
      const ledger = new Set();
      for (const e of evs) if (e.ok) ledger.add(e.owner + '|d:' + e.date + ':' + e.quest);
      if (paid.size !== ledger.size) { mismatch += 1; if (!sample) sample = { paid: paid.size, ledger: ledger.size }; }
    }
    o.oracleRuns = RUNS; o.oracleMismatch = mismatch; o.oracleSample = sample;
  }

  console.log('RESULT ' + J(o));
})().catch((e) => console.log('RESULT ' + JSON.stringify({ harnessError: String((e && e.stack) || e) })));
`;
}
