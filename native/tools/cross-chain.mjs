/**
 * Where two correct subsystems meet.
 *
 * Chains A–Q hardened the parts. This one asks the question none of them could:
 * *can two individually-correct subsystems still leave the app in a wrong
 * state when their boundaries interact?*
 *
 * ── the seam that was open, and why every earlier rule was blind to it ──
 *
 * Chain E gave the app one canonical way to forget an account:
 * `clearUserScopedStorage()` deletes the `USER_KEYS` from AsyncStorage, calls
 * `resetPersonalModel()`, then runs `runUserScopedResets()` — the registry a
 * module store joins to be cleaned up.
 *
 * `tools/auth-lifecycle.mjs` guards that registry, and it guards it **by walking
 * `USER_KEYS`**: for each storage key, find the module that caches it, and
 * require that module to register a reset. That is the right rule for the bug it
 * was written for, and it has a hole shaped exactly like a store that persists
 * nothing. Three of those existed, and all three hold the most personal things
 * the app produces:
 *
 *     ALPHA earns a medal, unlocks a mascot, finishes the meal quest,
 *     and Koa reacts to a thirty-day streak
 *     → SIGNED_OUT → the real reset seam runs
 *     → BRAVO signs in and the app shows:
 *
 *         celebration head : {"kind":"award","award":{"title":"ALPHA 100 buổi tập"}}
 *         quest peek       : {"n":1,"quest":"meal","coins":40}
 *         koa stage        : award:streak_30, celebrate, intensity 0.95
 *
 * ── and each one harms the second person twice ──
 *
 * Both stores that survived also *deduplicate*, so ALPHA's leftovers do not
 * merely appear — they **suppress BRAVO's own**:
 *
 *   · `enqueueMascot` refuses an id already queued, so BRAVO genuinely
 *     unlocking `koa_gold` produced no entry at all. Measured: the queue BRAVO
 *     was shown held ALPHA's two celebrations and neither of BRAVO's.
 *   · `emitKoa` drops any event id it has seen, so BRAVO's own thirty-day
 *     streak returned `sự kiện này đã xử lý rồi` and Koa said nothing.
 *
 * One person is shown a stranger's achievement; the other silently loses their
 * own. `koa-stage` is the sharpest of the three because the repair already
 * existed — `resetKoaStage()` clears exactly the right things and was wired to
 * one debug screen.
 *
 * ── how these rules work ──
 *
 * Rules A and B **run the real modules through the real seam**: the stores are
 * transpiled and driven, `resetPersonalModel()` and `runUserScopedResets()` are
 * called in the order `clearUserScopedStorage` calls them, and the assertions
 * are about what BRAVO's session actually holds afterwards. Nothing greps for
 * the name of a fix.
 *
 * Rule C is the boundary rule, and it is the one that matters after today: a
 * module-scope store React subscribes to must either join the reset registry or
 * be classified, by name, with a reason. Chain E's rule could not see these
 * three because it started from storage; this one starts from the store.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const read = (rel) => readFileSync(path.join(NATIVE, rel), 'utf8');

/* ─────────────────────────────────────────────────────────────────────────
   Rules A–B — drive the real stores through the real reset seam
   ───────────────────────────────────────────────────────────────────────── */
const out = mkdtempSync(path.join(tmpdir(), 'xchain-'));
try {
  const shim = (rel, body) => {
    const dir = path.join(out, 'node_modules', rel);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: rel, main: 'index.js' }));
    writeFileSync(path.join(dir, 'index.js'), body);
  };
  shim(
    '@react-native-async-storage/async-storage',
    `const s = new Map();
     const A = { async getItem(k){return s.has(k)?s.get(k):null;}, async setItem(k,v){s.set(k,String(v));},
       async removeItem(k){s.delete(k);}, _dump(){return Object.fromEntries(s);} };
     module.exports = A; module.exports.default = A;`,
  );
  shim('react', `module.exports = { useSyncExternalStore:(sub,get)=>get(), useEffect:(f)=>{f();}, useRef:(v)=>({current:v}) };`);

  /* Everything in `src/lib`, because the stores import each other and chasing
     the closure one module at a time is how a harness ends up testing a subset
     it did not mean to. */
  const FILES = readdirSync(path.join(NATIVE, 'src/lib'))
    .filter((f) => f.endsWith('.ts'))
    .map((f) => `src/lib/${f}`);
  try {
    execFileSync(
      'npx',
      ['tsc', ...FILES, '--ignoreConfig', '--outDir', out, '--rootDir', 'src',
        '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck', '--lib', 'es2020,dom'],
      { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch {
    /* `@/` is unmapped without the project tsconfig, so tsc reports TS2307 and
       exits non-zero. It emits regardless; the requires are rewritten below. */
  }
  for (const rel of FILES) {
    const js = path.join(out, rel.replace(/^src\//, '').replace(/\.tsx?$/, '.js'));
    writeFileSync(
      js,
      readFileSync(js, 'utf8').replace(/require\("@\/(.*?)"\)/g, (_, p) => `require("../${p}")`),
    );
  }

  writeFileSync(
    path.join(out, 'drive.cjs'),
    `const reset = require('./lib/user-scoped-reset.js');
     const celeb = require('./lib/celebration-queue.js');
     const peek  = require('./lib/quest-peek.js');
     const koa   = require('./lib/koa-stage.js');
     const scan  = require('./lib/scan-bridge.js');
     const pm    = require('./lib/personal-model.js');

     const CTX = { hour: 10, streak: 30, stretch: 'steady', tier: 'free', visible: true };
     const AWARD = { kind: 'award_earned', id: 'award:streak_30', magnitude: 0.9, label: 'Chuỗi 30 ngày' };

     (async () => {
       const o = {};

       /* ── ALPHA uses the app ── */
       celeb.enqueueAward({ id: 'medal-100', title: 'ALPHA 100 buổi tập', tier: 'gold' });
       celeb.enqueueMascot('koa_gold');
       peek.peekAt('meal', 40);
       scan.setPendingScan([{ name: 'ALPHA phở bò', kcal: 520 }]);
       o.alphaKoaReacted = koa.emitKoa(AWARD, CTX).shouldReact;
       o.alphaHasCelebration = !!celeb.useCelebrationHead();
       o.alphaHasPeek = peek.useQuestPeek().n > 0;
       o.alphaHasStage = !!koa.useKoaReaction();

       /*
         ── SIGNED_OUT, in the order clearUserScopedStorage runs it ──

         Both calls, not just the registry. \`koaSeenHas\` reads the persisted
         half of the same seen-set out of \`personal-model\`, which is reset by
         name rather than through the registry — a harness that ran only
         \`runUserScopedResets()\` would report the koa-stage fix as broken when
         it is the harness that is half a seam short.
       */
       await pm.resetPersonalModel();
       reset.runUserScopedResets();

       /* ── what does BRAVO's session hold? ── */
       o.celebrationSurvived = JSON.stringify(celeb.useCelebrationHead() ?? null);
       o.peekSurvived = JSON.stringify(peek.useQuestPeek());
       o.stageSurvived = JSON.stringify(koa.useKoaReaction());
       o.scanSurvived = JSON.stringify(scan.consumePendingScan());

       /* ── and can BRAVO earn the very same things? ── */
       celeb.enqueueMascot('koa_gold');
       const head = celeb.useCelebrationHead();
       o.bravoUnlockLanded = !!head && head.kind === 'mascot' && head.mascotId === 'koa_gold';
       const d = koa.emitKoa(AWARD, CTX);
       o.bravoKoaReacted = d.shouldReact;
       o.bravoKoaBecause = d.because ?? '-';

       console.log(JSON.stringify(o));
     })();`,
  );

  const raw = execFileSync('node', [path.join(out, 'drive.cjs')], { cwd: out, encoding: 'utf8' });
  const r = JSON.parse(raw.trim().split('\n').filter((l) => l.startsWith('{')).pop());
  const want = (ok, message) => {
    if (!ok) problems.push(message);
  };

  /* The harness has to have actually put something there, or every assertion
     below passes against an app that simply never worked. */
  want(
    r.alphaHasCelebration && r.alphaHasPeek && r.alphaHasStage && r.alphaKoaReacted,
    'ALPHA không tạo được state nào để mà kiểm (' +
      `celebration=${r.alphaHasCelebration} peek=${r.alphaHasPeek} stage=${r.alphaHasStage}) — ` +
      'bộ dò hỏng, đừng tin kết quả bên dưới',
  );

  /* Rule A — nothing of ALPHA's reaches BRAVO */
  want(
    r.celebrationSurvived === 'null',
    `huy chương của ALPHA còn nguyên sau khi đăng xuất: ${r.celebrationSurvived} — ` +
      'hàng đợi ăn mừng không giữ khoá AsyncStorage nào, nên mọi luật của Chain E đều không nhìn thấy nó, ' +
      'và BRAVO được chiếu toàn màn hình một tấm huy chương của người khác',
  );
  want(
    r.peekSurvived === '{"n":0,"quest":null,"coins":0,"at":0}',
    `lượt Koa ló ra của ALPHA còn nguyên: ${r.peekSurvived} — ` +
      'Today sẽ diễn lại nó và ghi công cho BRAVO số xu ALPHA kiếm được',
  );
  want(
    r.stageSurvived === 'null',
    `phản ứng của Koa với sự kiện của ALPHA còn trên sân khấu: ${r.stageSurvived}`,
  );
  /* Chain O's registration, kept here as the control: if this one ever fails,
     the seam itself is broken and the three above mean nothing. */
  want(
    r.scanSurvived === 'null',
    `đĩa ăn ALPHA vừa quét còn nguyên: ${r.scanSurvived} — ` +
      'đây là mẫu đối chứng của Chain O; nó đỏ nghĩa là chính cơ chế reset đã hỏng',
  );

  /* Rule B — and BRAVO can still earn the same things */
  want(
    r.bravoUnlockLanded,
    'BRAVO mở khoá đúng linh vật ALPHA từng mở và KHÔNG có gì được xếp hàng — ' +
      'enqueueMascot từ chối id đã có trong hàng đợi, nên đồ thừa của ALPHA nuốt mất lễ mở khoá của BRAVO; ' +
      'người này bị chiếu thành tích của người kia, người kia mất thành tích của chính mình',
  );
  want(
    r.bravoKoaReacted,
    `BRAVO đạt chuỗi 30 ngày và Koa im lặng ("${r.bravoKoaBecause}") — ` +
      'tập `seen` trong koa-stage giữ id sự kiện của ALPHA suốt vòng đời tiến trình, ' +
      'và bản lưu xuống đĩa của chính tập ấy (koaSeen trong personal-model) thì LUÔN được xoá, ' +
      'nên hai tầng của cùng một cơ chế bất đồng ý kiến về chuyện chúng thuộc về ai',
  );
} catch (e) {
  problems.push(`không dựng được phép thử liên chuỗi: ${e.message}`);
} finally {
  rmSync(out, { recursive: true, force: true });
}

/* ─────────────────────────────────────────────────────────────────────────
   Rule C — the boundary itself: a store must be classified

   Chain E's rule starts from `USER_KEYS` and asks which module caches each one.
   This one starts from the store, so a store that persists nothing is in scope
   from the moment it is written.

   The definition is deliberately narrow and mechanical: module-scope mutable
   state that React subscribes to via `useSyncExternalStore`. That is precisely
   the shape "one place holds it, every screen reads it" — the shape that
   outlives a sign-out.
   ───────────────────────────────────────────────────────────────────────── */
{
  /** Stores that are NOT the person's. Each needs a reason, not just a name. */
  const EXEMPT = {
    'src/lib/toast.ts':
      'một dòng thông báo đang hiện trên màn hình; không thuộc về ai, và biến mất sau vài giây',
    'src/lib/personal-model.ts':
      'được đặt lại bằng resetPersonalModel(), thứ clearUserScopedStorage gọi thẳng theo tên ' +
      'ngay trước runUserScopedResets() — đăng ký thêm lần nữa là gọi hai lần',
    'src/hooks/use-volume-unit.ts':
      'đơn vị đo là tuỳ chọn của MÁY (DEVICE_KEYS), cố ý giữ lại: xoá nó nghĩa là ai đó cho mượn ' +
      'máy một lần thì chủ máy nhận lại máy ở đơn vị khác',
    'src/lib/interaction.ts':
      'một cái ĐẾM số ngón tay đang chạm màn hình, về 0 khi nguồn cuối cùng buông. Nó là một sự ' +
      'thật về CÚ CHẠM đang diễn ra, không phải về tài khoản: không ai có thể đăng xuất trong lúc ' +
      'ngón tay vẫn đang giữ một cái thẻ, và nếu bằng cách nào đó xảy ra thì hậu quả là mascot đứng ' +
      'hình cho tới cú chạm kế tiếp — hết. Đăng ký onUserScopedReset ở đây là nói rằng một cú vuốt ' +
      'thuộc về một người',
    'src/hooks/use-mascot-emotion.tsx':
      '`greeted` là cờ một-lần-mỗi-lần-mở-app, và chính file đó nói vậy: "một sự thật về cây React này, ' +
      'không phải về tài khoản". Đổi tài khoản giữa chừng thì BRAVO không được chào — chỉ là thiếu một câu chào',
  };

  const dirs = ['src/lib', 'src/hooks'];
  const files = dirs.flatMap((d) =>
    readdirSync(path.join(NATIVE, d))
      .filter((f) => /\.tsx?$/.test(f))
      .map((f) => `${d}/${f}`),
  );

  let checked = 0;
  for (const rel of files) {
    const src = read(rel);
    if (!/useSyncExternalStore/.test(src)) continue;
    /* module scope only — an indented `let` is a local */
    if (!/^let |^const .* = new (Map|Set)\(/m.test(src)) continue;
    checked += 1;
    const registers = /onUserScopedReset\s*\(/.test(src);
    const exempt = Object.prototype.hasOwnProperty.call(EXEMPT, rel);
    if (registers && exempt) {
      problems.push(
        `${rel}: vừa đăng ký onUserScopedReset vừa nằm trong danh sách miễn — ` +
          'một kho chỉ được ở đúng một danh sách, nếu không thì lý do miễn đã cũ và không ai biết',
      );
    } else if (!registers && !exempt) {
      problems.push(
        `${rel}: giữ state ở phạm vi module mà React đăng ký đọc, nhưng không đăng ký ` +
          'onUserScopedReset và cũng không được phân loại là "không thuộc về người dùng" — ' +
          'một kho không giữ khoá AsyncStorage nào thì mọi luật của Chain E đều không nhìn thấy, ' +
          'và nó sẽ sống qua lần đăng xuất kế tiếp',
      );
    }
  }
  /* A rule that finds nothing to check is a rule that has drifted off target. */
  if (checked < 8) {
    problems.push(`chỉ tìm thấy ${checked} kho phạm vi module — luật này đã lạc mục tiêu, đừng tin nó`);
  }
  for (const rel of Object.keys(EXEMPT)) {
    if (!files.includes(rel)) {
      problems.push(`danh sách miễn còn tên ${rel}, nhưng file đó không còn tồn tại`);
    }
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   Rule D — the seam runs BOTH halves

   `koaSeen` lives in `personal-model` and is cleared by name; the in-memory
   half lives in `koa-stage` and is cleared by the registry. If sign-out ever
   stops calling one of the two, the halves disagree about whose events they
   are — which is the shipped bug, exactly.
   ───────────────────────────────────────────────────────────────────────── */
{
  const qc = read('src/lib/query-client.ts');
  const body = qc.slice(qc.indexOf('export async function clearUserScopedStorage'));
  if (!body) {
    problems.push('không tìm thấy clearUserScopedStorage — luật này đã lạc mục tiêu');
  } else {
    if (!/resetPersonalModel\(\)/.test(body)) {
      problems.push('clearUserScopedStorage không còn gọi resetPersonalModel()');
    }
    if (!/runUserScopedResets\(\)/.test(body)) {
      problems.push('clearUserScopedStorage không còn chạy runUserScopedResets()');
    }
  }
  const auth = read('src/hooks/use-auth.tsx');
  if (!/clearUserScopedStorage\(\)/.test(auth) || !/SIGNED_OUT/.test(auth)) {
    problems.push('use-auth không còn nối dọn dẹp vào SIGNED_OUT — mọi luật ở trên chỉ đúng nếu cửa này còn');
  }
}

if (problems.length) {
  console.log('ranh giới giữa các chuỗi còn hở:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'liên chuỗi OK — CHẠY THẬT các kho module qua đúng cơ chế dọn dẹp của app ' +
    '(resetPersonalModel() rồi runUserScopedResets(), đúng thứ tự clearUserScopedStorage gọi): ' +
    'ALPHA nhận huy chương, mở khoá linh vật, xong nhiệm vụ bữa ăn, Koa ăn mừng chuỗi 30 ngày và vừa quét một đĩa ăn — ' +
    'sau khi đăng xuất, BRAVO KHÔNG thấy một thứ nào trong số đó (bản đã ship thì thấy cả huy chương "ALPHA 100 buổi tập", ' +
    'lượt ló ra ghi công 40 xu, và phản ứng của Koa). Và nửa còn lại: BRAVO mở khoá ĐÚNG linh vật ấy thì lễ mở khoá ' +
    'vẫn được xếp hàng (enqueueMascot từng nuốt nó vì trùng id với đồ thừa của ALPHA), và BRAVO đạt ĐÚNG chuỗi 30 ngày ấy ' +
    'thì Koa vẫn phản ứng (tập seen trong koa-stage từng giữ id của ALPHA suốt vòng đời tiến trình, trong khi bản lưu đĩa ' +
    'của chính tập ấy luôn được xoá — hai tầng bất đồng về chuyện chúng thuộc về ai). ' +
    'Cộng với luật ranh giới: mọi kho state phạm vi module mà React đăng ký đọc đều PHẢI đăng ký onUserScopedReset ' +
    'hoặc được phân loại kèm lý do — luật của Chain E bắt đầu từ khoá AsyncStorage nên không thể thấy kho nào không lưu gì cả',
);
