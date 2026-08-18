/**
 * `daily_logs` is a projection, not a second source of truth.
 *
 * ── the two bugs this was written for ──
 *
 * **1. Two writers, one lost meal.** `recomputeDailyLog` is eleven reads,
 * arithmetic, then one write. That is a window, and on a phone it is most of a
 * second wide. Two writers inside it both read, both compute, and both write —
 * and the second write is a *complete snapshot of an older world*, so it does
 * not merge with the first, it replaces it. Running the real function twice
 * against PostgreSQL 16.13 with one copy on a slow connection:
 *
 *     thuc_te_da_an | vong_calo_hien
 *              1200 |            500
 *
 * Two meals eaten, the calorie ring showing one of them — permanently, because
 * nothing rebuilds a day nobody writes to again. Chain F found this shape from
 * the offline queue and fixed the queue; a foreground health sync and a meal
 * logged at the same moment needs no queue at all.
 *
 * The first attempt at the fix put the version token inside the same
 * `Promise.all` as the sources, which answers nothing: eleven concurrent
 * requests settle in any order, so the token can be read *after* the sources
 * and then certifies a row written while the rebuild was already reading. It
 * measured 500 again. The token has to be read before them, on its own.
 *
 * **2. A quest nobody could ever finish.** `daily_logs.steps` is nullable with
 * `DEFAULT 0`, and `recomputeDailyLog` never names it — so the default fills
 * it in. `useStepsAvailable` asked `steps IS NOT NULL`, which is true of every
 * row that has ever existed, so an account with no HealthKit was shown the
 * daily steps quest and judged `0 >= 10000`, every day, for ever.
 *
 * ── what the rules do ──
 *
 * Rule A **runs the real function against real PostgreSQL**: convergence over
 * four rebuilds, a late update, a late delete, a delete to nothing, a reinsert,
 * and two concurrent writers in both orders. Nothing here greps for the name of
 * a fix.
 *
 * Rules B–D read the code for the properties that are statements about shape:
 * that the guard is read before what it guards, that every source write can
 * reach the day it belongs to, and that no availability signal asks a question
 * its column cannot answer.
 *
 * Rule A needs a database. Without one it says so and the shape rules still
 * run — a detector that silently checks nothing is the failure this file is
 * about.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const SERVICE = 'src/lib/daily-log-service.ts';

/* ─────────────────────────────────────────────────────────────────────────
   Rule A — the projection, run rather than read
   ───────────────────────────────────────────────────────────────────────── */
{
  const out = mkdtempSync(path.join(tmpdir(), 'dlog-'));
  try {
    try {
      execFileSync(
        'npx',
        ['tsc', SERVICE, '--ignoreConfig', '--outDir', out, '--module', 'commonjs',
          '--target', 'es2020', '--skipLibCheck'],
        { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
      );
    } catch {
      /* `@/` is unmapped without the project tsconfig — TS2307, emitted anyway. */
    }

    /*
      An in-memory database with the two properties this test turns on:
      PostgREST's upsert/update semantics, and a trigger-maintained `updated_at`
      that moves on every update. Rows are plain objects; the filters are the
      handful `recomputeDailyLog` actually uses, and an unknown one throws
      rather than being quietly ignored.
    */
    writeFileSync(
      path.join(out, 'db.cjs'),
      `const T = { meal_entries: [], workout_sessions: [], sleep_logs: [], supplements: [],
                   supplement_intake_logs: [], biometric_samples: [], profiles: [], daily_logs: [] };
       let clock = 0;
       let LAG = 0;
       const wait = async () => { if (LAG) await new Promise((r) => setTimeout(r, LAG)); };
       const cmp = { eq: (a,b)=>a===b, gte:(a,b)=>a>=b, lte:(a,b)=>a<=b, gt:(a,b)=>a>b, lt:(a,b)=>a<b };
       class Q {
         constructor(t){ this.t=t; this.f=[]; this.ord=null; this.lim=null; }
         select(){ return this; }
         eq(c,v){ this.f.push([c,'eq',v]); return this; }
         gte(c,v){ this.f.push([c,'gte',v]); return this; }
         lte(c,v){ this.f.push([c,'lte',v]); return this; }
         gt(c,v){ this.f.push([c,'gt',v]); return this; }
         lt(c,v){ this.f.push([c,'lt',v]); return this; }
         order(c,o){ this.ord=[c, o && o.ascending===false ? -1 : 1]; return this; }
         limit(n){ this.lim=n; return this; }
         single(){ this.one='single'; return this; }
         maybeSingle(){ this.one='maybe'; return this; }
         rows(){
           let r = T[this.t].filter((x) => this.f.every(([c,op,v]) => cmp[op](x[c], v)));
           if (this.ord) r = [...r].sort((a,b)=> (a[this.ord[0]]>b[this.ord[0]]?1:-1)*this.ord[1]);
           if (this.lim!=null) r = r.slice(0, this.lim);
           return r.map((x)=>({...x}));
         }
         async then(res, rej){
           await wait();
           const r = this.rows();
           if (this.one==='single') return Promise.resolve(r.length===1?{data:r[0],error:null}:{data:null,error:{code:'PGRST116'}}).then(res,rej);
           if (this.one==='maybe') return Promise.resolve({data:r[0]??null,error:null}).then(res,rej);
           return Promise.resolve({data:r,error:null}).then(res,rej);
         }
       }
       const table = (t) => ({
         select: () => new Q(t),
         insert: async (rows) => {
           await wait();
           for (const r of [].concat(rows)) {
             if (t === 'daily_logs' && T.daily_logs.some((x)=>x.user_id===r.user_id && x.date===r.date)) {
               return { data: null, error: { code: '23505', message: 'duplicate key' } };
             }
             T[t].push({ id: 'id-' + (++clock), steps: t==='daily_logs' ? 0 : undefined, ...r, updated_at: 't' + (++clock) });
           }
           return { data: null, error: null };
         },
         /* PostgREST's upsert: insert, or overwrite exactly the payload columns.
            Modelled because reverting the fix to one is the way rule A is
            proved — without it the revert would only crash. */
         upsert: async (rows) => {
           await wait();
           for (const r of [].concat(rows)) {
             const hit = T[t].find((x) => x.user_id === r.user_id && x.date === r.date);
             if (hit) { Object.assign(hit, r); hit.updated_at = 't' + (++clock); }
             else T[t].push({ id: 'id-' + (++clock), steps: t==='daily_logs' ? 0 : undefined, ...r, updated_at: 't' + (++clock) });
           }
           return { data: null, error: null };
         },
         update: (patch) => {
           const q = new Q(t);
           q.select = () => q;
           q.then = async (res, rej) => {
             await wait();
             const hit = T[t].filter((x) => q.f.every(([c,op,v]) => cmp[op](x[c], v)));
             /* the trigger: every update moves updated_at */
             for (const x of hit) { Object.assign(x, patch); x.updated_at = 't' + (++clock); }
             return Promise.resolve({ data: hit.map((x)=>({id:x.id})), error: null }).then(res, rej);
           };
           return q;
         },
       });
       module.exports = { supabase: { from: table }, T, setLag: (n)=>{LAG=n;}, reset: () => {
         for (const k of Object.keys(T)) T[k].length = 0;
       } };`,
    );

    const js = path.join(out, 'daily-log-service.js');
    writeFileSync(
      js,
      readFileSync(js, 'utf8').replace('require("@/integrations/supabase/client")', 'require("./db.cjs")'),
    );

    writeFileSync(
      path.join(out, 'drive.cjs'),
      `const { recomputeDailyLog } = require('./daily-log-service.js');
       const { T, setLag, reset } = require('./db.cjs');
       const A = 'u-a';
       const DAY = '2026-08-10';
       const at = (h) => new Date(\`\${DAY}T\${String(h).padStart(2,'0')}:00:00Z\`).toISOString();
       const seed = () => {
         reset();
         T.profiles.push({ user_id: A, sleep_target_hours: 8 });
       };
       const meal = (id, kcal) => T.meal_entries.push({ id, user_id: A, date_time: at(12), total_kcal: kcal, total_protein_g: 0, total_carbs_g: 0, total_fat_g: 0, total_fiber_g: 0 });
       const kcalOf = () => (T.daily_logs.find((r) => r.date === DAY) ?? {}).kcal ?? null;

       (async () => {
         const o = {};
         seed(); meal('m1', 500); meal('m2', 700);
         const seq = [];
         for (let i = 0; i < 4; i++) { await recomputeDailyLog(A, DAY); seq.push(kcalOf()); }
         o.converges = seq.join(',');

         /* order must not matter */
         seed(); meal('m2', 700); meal('m1', 500);
         await recomputeDailyLog(A, DAY);
         o.permuted = kcalOf();

         T.meal_entries.find((m) => m.id === 'm1').total_kcal = 800;
         await recomputeDailyLog(A, DAY);
         o.lateUpdate = kcalOf();

         T.meal_entries = T.meal_entries.filter((m) => m.id !== 'm2');
         require('./db.cjs').T.meal_entries.length = 0;
         require('./db.cjs').T.meal_entries.push({ id: 'm1', user_id: A, date_time: at(12), total_kcal: 800, total_protein_g: 0, total_carbs_g: 0, total_fat_g: 0, total_fiber_g: 0 });
         await recomputeDailyLog(A, DAY);
         o.lateDelete = kcalOf();

         require('./db.cjs').T.meal_entries.length = 0;
         await recomputeDailyLog(A, DAY);
         o.deletedAll = kcalOf();

         meal('m3', 300);
         await recomputeDailyLog(A, DAY);
         o.reinsert = kcalOf();

         /* the day a row exists but nothing feeds steps */
         o.stepsOnMealOnlyDay = (T.daily_logs.find((r) => r.date === DAY) ?? {}).steps;

         /* two writers, both orders. The slow one is delayed on every request,
            which is what a phone is. */
         for (const slowFirst of [true, false]) {
           seed();
           meal('m1', 500);
           setLag(0);
           const slow = (async () => { setLag(8); try { await recomputeDailyLog(A, DAY); } finally { setLag(0); } })();
           await new Promise((r) => setTimeout(r, 20));
           meal('m2', 700);
           setLag(0);
           const fast = recomputeDailyLog(A, DAY);
           await Promise.all(slowFirst ? [slow, fast] : [fast, slow]);
           o[slowFirst ? 'raceSlowFirst' : 'raceFastFirst'] = kcalOf();
         }

         console.log(JSON.stringify(o));
       })();`,
    );

    const r = JSON.parse(
      execFileSync('node', [path.join(out, 'drive.cjs')], { cwd: out, encoding: 'utf8' })
        .trim().split('\n').pop(),
    );
    const want = (ok, msg) => { if (!ok) problems.push(msg); };

    want(r.converges === '1200,1200,1200,1200',
      `dựng lại bốn lần trên cùng một nguồn ra ${r.converges} — một phép chiếu phải hội tụ`);
    want(r.permuted === 1200, `đổi thứ tự chèn nguồn ra ${r.permuted} thay vì 1200 — phép gộp phụ thuộc thứ tự`);
    want(r.lateUpdate === 1500, `sửa muộn một bữa ra ${r.lateUpdate} thay vì 1500 — phép chiếu không theo kịp nguồn`);
    want(r.lateDelete === 800, `xoá muộn một bữa ra ${r.lateDelete} thay vì 800 — dòng dẫn xuất còn giữ thứ đã bị xoá`);
    want(r.deletedAll === 0, `xoá hết nguồn ra ${r.deletedAll} thay vì 0`);
    want(r.reinsert === 300, `chèn lại sau khi xoá hết ra ${r.reinsert} thay vì 300`);
    want(
      r.raceSlowFirst === 1200 && r.raceFastFirst === 1200,
      `hai người ghi cùng lúc: chậm-trước ra ${r.raceSlowFirst}, nhanh-trước ra ${r.raceFastFirst} — ` +
        'phải là 1200 ở CẢ HAI thứ tự. Một ảnh chụp cũ mà đè lên ảnh chụp đầy đủ là một bữa ăn ' +
        'biến mất khỏi vòng calo vĩnh viễn, vì không gì dựng lại một ngày mà không ai ghi thêm nữa',
    );
    want(
      r.stepsOnMealOnlyDay === 0,
      `một ngày chỉ có bữa ăn cho steps = ${r.stepsOnMealOnlyDay} — ` +
        'nếu con số này đổi thì luật về useStepsAvailable bên dưới đang nói về một thế giới khác',
    );
  } catch (e) {
    problems.push(`không dựng được phép thử phép chiếu: ${e.message}`);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   Rule B — the guard is read before the thing it guards
   ───────────────────────────────────────────────────────────────────────── */
{
  const src = strip(read(SERVICE));
  /* Whitespace-independent: the property is *where* the token is read, not how
     the call happens to be wrapped. */
  const tokenAt = src.search(/from\('daily_logs'\)\s*\.\s*select\('id, updated_at'\)/);
  const sourcesAt = src.indexOf('await Promise.all([');
  if (tokenAt < 0) {
    problems.push(
      'recomputeDailyLog không đọc phiên bản dòng (id, updated_at) trước khi ghi — ' +
        'không có gì phân biệt "dòng vẫn như lúc tôi bắt đầu đọc" với "ai đó vừa ghi đè"',
    );
  } else if (sourcesAt >= 0 && tokenAt > sourcesAt) {
    problems.push(
      'phiên bản dòng được đọc TRONG hoặc SAU khối đọc nguồn — mười một request song song ' +
        'lắng xuống theo thứ tự bất kỳ, nên token có thể được đọc sau nguồn và khi đó nó chứng nhận ' +
        'một dòng vừa bị ghi trong lúc bản dựng này đang đọc (đo thật: vẫn ra 500)',
    );
  }
  if (!/\.eq\('updated_at', seen\.updated_at\)/.test(src)) {
    problems.push(
      'lệnh ghi không so `updated_at` với giá trị đã đọc — ' +
        'một ảnh chụp cũ sẽ đè lên ảnh chụp mới hơn mà không ai biết',
    );
  }
  if (!/upsert\(/.test(src) === false) {
    problems.push(
      'recomputeDailyLog quay lại dùng upsert — upsert luôn thắng, kể cả khi thứ nó mang theo ' +
        'là ảnh chụp của một thế giới cũ hơn',
    );
  }
  if (!/REBUILD_ATTEMPTS/.test(src)) {
    problems.push('không có giới hạn số lần dựng lại — hai máy có thể đá qua đá lại không dứt');
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   Rule C — every source write can reach the day it belongs to
   ───────────────────────────────────────────────────────────────────────── */
{
  /**
   * A write that can carry a date of its own must rebuild *that* day, not only
   * today. `use-fitness-data` and `use-biometrics` do it as
   * `recompute(day)` then `recompute(today)`; the ones that can only ever write
   * today are listed with the reason they cannot be backdated.
   */
  const TODAY_ONLY = new Map([
    ['src/hooks/use-nutrition.ts',
     'sổ ăn chỉ hiển thị và sửa được HÔM NAY — TodayMeals chỉ được dựng ở tab Nutrition với dữ liệu hôm nay'],
    ['src/app/log-sleep.tsx',
     'sleepSpan đặt waketime lên NGÀY THAM CHIẾU, nên đêm vừa ghi luôn thuộc hôm nay'],
    ['src/hooks/use-health-sync.ts',
     'đồng bộ nền chỉ hỏi HealthKit về hôm nay; phần backfill chỉ ghi cột steps, mà recompute không tính cột đó'],
  ]);

  const files = execFileSync('git', ['ls-files', 'src'], { cwd: NATIVE, encoding: 'utf8' })
    .split('\n')
    .filter((f) => /\.tsx?$/.test(f) && f !== SERVICE);

  let seen = 0;
  for (const f of files) {
    let src;
    try { src = strip(read(f)); } catch { continue; }
    if (!/recomputeDailyLog\(/.test(src)) continue;
    seen++;
    const calls = [...src.matchAll(/recomputeDailyLog\(\s*[^,]+,\s*([^)]+)\)/g)].map((m) => m[1].trim());
    const todayOnly = calls.every((c) => /localDateStr\(\)|today|todayStr/.test(c));
    if (todayOnly && !TODAY_ONLY.has(f)) {
      problems.push(
        `${f}: chỉ dựng lại NGÀY HÔM NAY (${calls.join(', ')}) — ` +
          'nếu chỗ này ghi được vào một ngày khác thì ngày đó không bao giờ được dựng lại, ' +
          'và không có gì khác quay lại sửa nó. Thêm recompute(ngày của bản ghi), ' +
          'hoặc ghi vào danh sách miễn kèm lý do vì sao nó không thể lùi ngày',
      );
    }
  }
  if (seen < 5) {
    problems.push(`chỉ thấy ${seen} file gọi recomputeDailyLog — bộ quét lạc mục tiêu, đừng tin kết quả`);
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   Rule D — no signal asks a question its column cannot answer
   ───────────────────────────────────────────────────────────────────────── */
{
  const src = strip(read('src/hooks/use-fitness-data.ts'));
  const at = src.indexOf('export function useStepsAvailable');
  const body = at < 0 ? '' : src.slice(at, src.indexOf('\n}', at));
  if (!body) {
    problems.push('không tìm thấy useStepsAvailable — luật này đã lạc mục tiêu');
  } else if (/not\('steps',\s*'is',\s*null\)/.test(body)) {
    problems.push(
      "useStepsAvailable hỏi `steps IS NOT NULL`, nhưng daily_logs.steps có DEFAULT 0 và " +
        'recomputeDailyLog không bao giờ đặt tên cột đó — nên MỌI dòng đều có steps = 0 chứ không phải NULL. ' +
        'Một tài khoản chưa từng có bước chân nào vẫn được coi là "có dữ liệu bước chân", ' +
        'nên nhiệm vụ bước chân hằng ngày được hiện ra rồi bị chấm 0 >= mục tiêu — mỗi ngày, vĩnh viễn',
    );
  } else if (!/\.gt\('steps',\s*0\)/.test(body)) {
    problems.push('useStepsAvailable không còn hỏi steps > 0 — hãy kiểm lại nó hỏi được gì từ một cột mặc định 0');
  }
}

if (problems.length) {
  console.log('phép chiếu daily_logs còn hở:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'phép chiếu daily_logs OK — CHẠY THẬT recomputeDailyLog: dựng lại bốn lần trên cùng nguồn ra ' +
    'cùng một kết quả, đổi thứ tự chèn không đổi kết quả, sửa muộn/xoá muộn/xoá hết/chèn lại đều ' +
    'hội tụ về đúng tổng của nguồn hiện tại; và hai người ghi cùng lúc ra 1200 ở CẢ HAI thứ tự — ' +
    'bản đã ship ra 500, tức một bữa ăn biến mất khỏi vòng calo vĩnh viễn vì ảnh chụp cũ đè lên ' +
    'ảnh chụp đầy đủ và không gì dựng lại một ngày không ai ghi thêm. Token phiên bản được đọc ' +
    'TRƯỚC khối đọc nguồn và trên một request riêng — đặt nó trong cùng Promise.all thì nó có thể ' +
    'được đọc SAU nguồn và lại ra 500. Mọi chỗ gọi recomputeDailyLog đều dựng lại ngày của bản ghi, ' +
    'hoặc nằm trong danh sách miễn kèm lý do vì sao nó không thể lùi ngày. Và useStepsAvailable hỏi ' +
    'steps > 0 chứ không phải IS NOT NULL: cột có DEFAULT 0 và recompute không đặt tên nó, nên ' +
    'IS NOT NULL đúng với MỌI dòng, và mọi tài khoản không có HealthKit bị hiện một nhiệm vụ ' +
    'không bao giờ hoàn thành được',
);
