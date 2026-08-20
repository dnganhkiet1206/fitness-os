/**
 * The part of the app that *chooses*, and the disk it trusts to tell it what it
 * has learned.
 *
 * ── what was already proven, and why it was not enough ──
 *
 * The only executable claim about the bandit lived in `tools/personal-model.mjs`
 * and it was `order.length === 5 && new Set(order).size === 5` — that ranking
 * returns five distinct keys. That is true of `Object.keys()`. It is true of a
 * sampler that returns a constant. It would have been true of every single bug
 * below.
 *
 * So this rule judges the bandit against an oracle that imports nothing from
 * `bandit.ts`: a Marsaglia–Tsang Beta sampler (a different algorithm, over a
 * different internal distribution, on a different uniform stream), the analytic
 * moments of Beta(α, β), and a set of invariants written from the *definition*
 * of a posterior rather than from the code that maintains one.
 *
 * ── the arithmetic came back clean ──
 *
 * Worth saying plainly, because it is the reason every finding below is at the
 * boundary rather than in the sampler. Measured: 100 000 draws match the
 * analytic mean and variance at every shape; a thousand random histories of two
 * hundred observations produced no invalid posterior; `α + β` never passed
 * `CAP` and neither parameter ever fell below 1; and a p = 0.8 arm beat a p = 0.3
 * arm in 2000 of 2000 histories. `bandit.ts` is right about every input it was
 * written for.
 *
 * ── the inputs it was written for are not the inputs it got ──
 *
 * `loadPersonalModel` spread `parsed.arms` in whole, so the contents of
 * `ascnd_personal_model_v1` *were* the posterior. Four things that JSON writes
 * without complaint, each measured through the real module:
 *
 *   · **`{"alpha":1e9}` and the app never renders again.** `sampleBeta` draws
 *     Gamma(k) as a sum of k exponentials — exact and cheap for the counts
 *     `reward()` produces, unbounded for the counts a disk can produce. 1e8 took
 *     3.2 seconds; 1e9, 2⁵³−1 and 1e308 never returned. `rankQuests` runs inside
 *     a `useMemo` on the Today render path, so that is a dead JS thread, on
 *     every launch, for ever.
 *
 *   · **`{"alpha":"5","beta":"2"}` becomes twenty-six wins out of twenty-seven.**
 *     `reward()` does `alpha += 1`, and `+` on a string concatenates: `"51"`,
 *     then `"51" + "2"` reads as 512, which is past `CAP`, so the halving turns
 *     it into `{alpha:26, beta:1}` — in valid integers, so nothing downstream
 *     can ever tell.
 *
 *   · **`{"alpha":0,"beta":0}` is an arm that cannot be beaten.** `β` stays 0
 *     through every reward because `α + β > CAP` never fires, and `sampleBeta`
 *     then returns `x / (x + 0)` = exactly 1 on every draw. `{"alpha":-5}` is
 *     the mirror: the loop runs zero times and the draw is exactly 0, for ever.
 *
 *   · **an ask can outlive its arm, and settling it throws.** `settle()` calls
 *     `reward(arms[k], false)` for every stale key in `asked`, and three blobs
 *     put a key there that `arms` does not have — an unknown key, `asked` as a
 *     string (which spreads to `{0:'n', 1:'o', …}`), and the app's own v1
 *     `pending` migration, which copies `pending.quest` across without asking
 *     whether it still names a quest. `use-mascot` calls `settleStale` from a
 *     `useEffect`, so that is a red screen; and it throws before the save, so
 *     the key survives to do it again next launch.
 *
 * ── and one thing that is not a bug, recorded so nobody re-reports it ──
 *
 * Decay is order-dependent: the same 24 wins and 36 losses in 1000 different
 * orders gave 5 distinct posteriors, with means from 0.318 to 0.500. That is
 * what halving is *for* — recent evidence weighs more. What must not happen is
 * an order that makes a losing history look like a winning one, and Rule G
 * pins exactly that.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const out = mkdtempSync(path.join(tmpdir(), 'bandit-'));

/* How long the whole ranking of five quests is allowed to take. Generous by
   three orders of magnitude — a real ranking is five sums of at most 39
   logarithms — so this can only fire on a loop that is not bounded by `CAP`. */
const RANK_BUDGET_MS = 2000;

try {
  const shim = (rel, body) => {
    const dir = path.join(out, 'node_modules', rel);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: rel, main: 'index.js' }));
    writeFileSync(path.join(dir, 'index.js'), body);
  };
  /* Seeded from the environment so each child starts from a chosen blob — the
     model hydrates at import, and that is the boundary under test. */
  shim('@react-native-async-storage/async-storage',
    `const s = new Map();
     if (process.env.SEED_BLOB) s.set('ascnd_personal_model_v1', process.env.SEED_BLOB);
     let latency = 0;
     const wait = () => (latency > 0 ? new Promise((r) => setTimeout(r, latency)) : null);
     const A = {
       async getItem(k) { const w = wait(); if (w) await w; return s.has(k) ? s.get(k) : null; },
       async setItem(k, v) { const w = wait(); if (w) await w; s.set(k, String(v)); },
       async removeItem(k) { const w = wait(); if (w) await w; s.delete(k); },
       _raw: (k) => (s.has(k) ? s.get(k) : null),
       _put: (k, v) => s.set(k, v),
       _latency: (ms) => { latency = ms; },
     };
     module.exports = A; module.exports.default = A;`);
  shim('react', `module.exports = { useSyncExternalStore: (s, g) => g(), useMemo: (f) => f(), useEffect: (f) => { f(); }, useRef: (v) => ({ current: v }) };`);

  const LIB = readdirSync(path.join(NATIVE, 'src/lib')).filter((f) => f.endsWith('.ts')).map((f) => `src/lib/${f}`);
  try {
    execFileSync('npx', ['tsc', ...LIB, '--ignoreConfig', '--outDir', out, '--rootDir', 'src',
      '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck', '--lib', 'es2020,dom'],
      { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch { /* `@/` unmapped → TS2307; emits anyway */ }
  for (const rel of LIB) {
    const js = path.join(out, rel.replace(/^src\//, '').replace(/\.tsx?$/, '.js'));
    writeFileSync(js, readFileSync(js, 'utf8').replace(/require\("@\/(.*?)"\)/g, (_, p) => `require("../${p}")`));
  }

  writeFileSync(path.join(out, 'oracle.cjs'), ORACLE());
  writeFileSync(path.join(out, 'poison.cjs'), POISON());
  writeFileSync(path.join(out, 'drive.cjs'), DRIVER());

  /* ── the hang gets its own process, because a hang cannot report itself ── */
  const poisonRuns = [
    ['alpha', JSON.stringify({ arms: { meal: { alpha: 1e9, beta: 1 } } })],
    ['beta', JSON.stringify({ arms: { meal: { alpha: 1, beta: 1e9 } } })],
    ['maxsafe', JSON.stringify({ arms: { meal: { alpha: 9007199254740991, beta: 1 } } })],
    ['huge', JSON.stringify({ arms: { meal: { alpha: 1e308, beta: 1 } } })],
  ];
  const poison = [];
  for (const [name, blob] of poisonRuns) {
    const r = spawnSync('node', [path.join(out, 'poison.cjs')], {
      cwd: out, encoding: 'utf8', timeout: RANK_BUDGET_MS + 6000,
      env: { ...process.env, SEED_BLOB: blob },
    });
    const line = (r.stdout || '').split('\n').find((l) => l.startsWith('{'));
    poison.push({ name, hung: !line, ...(line ? JSON.parse(line) : {}) });
  }

  const raw = execFileSync('node', [path.join(out, 'drive.cjs')], {
    cwd: out, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 300000,
  });
  const r = JSON.parse(raw.trim().split('\n').filter((l) => l.startsWith('{')).pop());
  if (r.harnessError) throw new Error(r.harnessError);
  if (process.env.BANDIT_DEBUG) console.log(JSON.stringify({ poison, ...r }, null, 1));
  const want = (ok, m) => { if (!ok) problems.push(m); };

  /* ── baselines: if these fail, nothing below means anything ── */
  want(
    r.controlArms === r.controlExpect,
    `mô hình HỢP LỆ trên đĩa không đọc lại được nguyên vẹn (đọc ${r.controlArms}, ` +
      `chờ ${r.controlExpect}) — bộ dò không mang nổi trạng thái, đừng tin phần còn lại`,
  );
  want(
    r.oracleSane,
    `bộ đối chiếu ĐỘC LẬP (Marsaglia–Tsang) tự nó đã lệch khỏi trung bình/phương sai giải tích: ` +
      `${JSON.stringify(r.oracleSaneFail)} — hỏng thước đo thì mọi kết luận bên dưới đều vô nghĩa`,
  );
  want(
    r.learnedArmMoves,
    `hai mươi lần ghi nhận thành công không làm đổi niềm tin (${r.learnedArm}) — ` +
      'đường ghi thật không chạy, các luật dưới đây sẽ xanh một cách rỗng',
  );

  /* ── A. a count from the disk must not be a loop bound ── */
  const hung = poison.filter((p) => p.hung).map((p) => p.name);
  want(
    hung.length === 0,
    `xếp hạng quest KHÔNG BAO GIỜ TRẢ VỀ với ${JSON.stringify(hung)} lấy từ ổ đĩa — ` +
      'sampleBeta rút Gamma(k) bằng tổng k biến mũ, nên vòng lặp chạy đúng `alpha` lần: chính xác và rẻ ' +
      'với những con số reward() sinh ra, KHÔNG CÓ CHẶN TRÊN với những con số một ổ đĩa sinh ra. ' +
      '1e9 là số JSON viết ra không một lời phàn nàn, và rankQuests nằm trong useMemo trên đường vẽ ' +
      'màn Hôm nay — đó là luồng JS chết, mọi lần mở app, vĩnh viễn',
  );
  const slow = poison.filter((p) => !p.hung && p.ms > RANK_BUDGET_MS).map((p) => `${p.name}=${p.ms}ms`);
  want(slow.length === 0, `xếp hạng quest chậm bất thường: ${JSON.stringify(slow)} (ngân sách ${RANK_BUDGET_MS}ms)`);
  const kept = poison.filter((p) => !p.hung && !p.valid).map((p) => `${p.name}→${p.meal}`);
  want(
    kept.length === 0,
    `số đếm ngoài tầm reward() sinh được vẫn thành niềm tin: ${JSON.stringify(kept)} — ` +
      'một alpha bị kẹp xuống 39 không phải là niềm tin đã sửa, đó là ba mươi chín lần thắng người ta ' +
      'chưa từng cho, và nó ghim quest đó lên đầu suốt đời máy',
  );

  /* ── B. an ask that outlives its arm ── */
  want(
    r.ghostThrew.length === 0,
    `settle NÉM với ask không còn arm tương ứng: ${JSON.stringify(r.ghostThrew)} — ` +
      'settle() gọi reward(arms[k], false) cho mọi khoá cũ trong asked, và ba blob đưa được khoá vào đó ' +
      'mà arms không có: một khoá lạ, asked là chuỗi (trải thành {0:"n",1:"o",…}), và ĐƯỜNG DI TRÚ v1 ' +
      'của chính app, vốn chép pending.quest sang mà không hỏi nó còn là quest không. use-mascot gọi ' +
      'settleStale từ useEffect, nên đó là màn hình đỏ; và nó ném TRƯỚC khi lưu, nên khoá hỏng còn nguyên ' +
      'để làm lại ở lần mở sau',
  );
  want(
    r.ghostLeftOver.length === 0,
    `khoá lạ vẫn nằm lại trong asked sau khi settle: ${JSON.stringify(r.ghostLeftOver)}`,
  );

  /* ── C. a broken write must not become confidence ── */
  want(
    r.stringCountFail.length === 0,
    `số đếm KHÔNG PHẢI SỐ vẫn vào được bộ học: ${JSON.stringify(r.stringCountFail)} — ` +
      'reward() làm `alpha += 1`, mà `+` trên chuỗi là NỐI: {alpha:"5",beta:"2"} qua một lần thắng ' +
      'thành "51", rồi "51"+"2" đọc ra 512 tức là quá CAP, nên phép chia đôi biến nó thành ' +
      '{alpha:26,beta:1} — năm-trên-bảy thành hai mươi sáu-trên-hai mươi bảy, bằng số nguyên hợp lệ, ' +
      'nên không gì phía sau còn nhận ra được',
  );

  /* ── D. no arm may be certain, in either direction ── */
  want(
    r.alwaysFirst.length === 0,
    `có arm THẮNG MỌI LƯỢT RÚT trong ${r.rankTrials} lần xếp hạng: ${JSON.stringify(r.alwaysFirst)} — ` +
      '{alpha:0,beta:0} không bao giờ chạm nhánh α+β>CAP nên beta ở nguyên 0, và sampleBeta chia ' +
      'x/(x+0) = đúng bằng 1 ở mọi lượt rút; đó không còn là Thompson sampling nữa mà là một hằng số',
  );
  want(
    r.neverFirst.length === 0,
    `có arm KHÔNG THẮNG NỔI MỘT LƯỢT NÀO trong ${r.rankTrials} lần xếp hạng: ${JSON.stringify(r.neverFirst)} — ` +
      '{alpha:-5} cho vòng lặp chạy không lần nào, mẫu rút ra đúng bằng 0, và quest đó xuống cuối vĩnh viễn',
  );

  /* ── E. the sampler is still the distribution it claims to be ── */
  want(
    r.betaFail.length === 0,
    `sampleBeta lệch khỏi Beta(α,β): ${JSON.stringify(r.betaFail)} — đối chiếu với ${r.betaN} lượt rút ` +
      'từ một bộ sinh Marsaglia–Tsang ĐỘC LẬP và với trung bình/phương sai giải tích. Một bộ sinh GẦN ĐÚNG ' +
      'cho ra những con số trông hợp lý và một cái app lệch trong im lặng',
  );

  /* ── F. the posterior stays a posterior, through the real writer ── */
  want(
    r.seqDecays > r.seqRuns,
    `${r.seqRuns} chuỗi ngày thật chỉ chạm phép chia đôi ${r.seqDecays} lần — nhánh DUY NHẤT trong ` +
      'reward() có thể sinh ra số đếm hỏng chưa từng chạy, nên luật ngay dưới đây xanh một cách rỗng',
  );
  want(
    r.invalidPosteriors === 0,
    `${r.invalidPosteriors}/${r.seqChecks} hậu nghiệm KHÔNG HỢP LỆ sau ${r.seqRuns} chuỗi ngày thật ` +
      `(hỏi/xong/kết sổ qua personal-model, ${r.seqDecays} lần chia đôi): ` +
      `${JSON.stringify(r.invalidSample)} — điều kiện là số nguyên, cả hai ≥ 1, và α+β ≤ CAP`,
  );
  want(
    r.lossNeverRaisesAlpha,
    `một chuỗi TOÀN THẤT BẠI vẫn nâng alpha (${JSON.stringify(r.lossRaiseSample)}) — ` +
      'thất bại không được phép làm một arm trông khá hơn',
  );
  want(
    r.lossReachedFloor > 0,
    'chuỗi toàn thất bại chưa từng đẩy alpha xuống 1, nên nó không gặp phép chia đôi ở đúng chỗ ' +
      'phép chia đôi có thể sinh ra số 0 — luật ngay dưới xanh một cách rỗng',
  );
  want(
    r.lossInvalid === null,
    `một chuỗi TOÀN THẤT BẠI để lại hậu nghiệm không hợp lệ: ${JSON.stringify(r.lossInvalid)} — ` +
      'đây là đường DUY NHẤT đưa alpha xuống 1 rồi gặp phép chia đôi ở đó; ' +
      'một nghìn lịch sử 40% thắng không bao giờ tới được đây',
  );
  want(
    r.untouchedArmsIntact,
    `học trên một arm làm đổi arm khác: ${JSON.stringify(r.untouchedFail)} — ` +
      'mỗi quest là một niềm tin riêng',
  );

  want(
    r.orderFlips === 0,
    `${r.orderFlips}/${r.orderRuns} lần một arm 75% thua một arm 25% sau 80 ngày ` +
      `(${JSON.stringify(r.orderFlipSample)}) — phép chia đôi được phép quên, không được phép ĐẢO thứ tự`,
  );

  /* ── G. order may reweight; it may not out-run its own best case ── */
  want(
    r.orderInventsWin === 0 && r.permInvalid === 0,
    `${r.orderInventsWin}/${r.permRuns} hoán vị của CÙNG MỘT tập 24 thắng / 36 thua vượt qua chính ` +
      `trường hợp tốt nhất của nó (chặn = mọi lần thắng ở CUỐI → ${JSON.stringify(r.permBound)}, ` +
      `cao nhất đo được ${r.permMaxMean}; ${r.permInvalid} hậu nghiệm hỏng) — "chứng cứ gần đây nặng hơn" ` +
      'chính là nghĩa của phép chia đôi, nên không thứ tự nào của cùng ngần ấy chứng cứ được phép hơn ' +
      'cái thứ tự đặt toàn bộ chiến thắng ở sát hiện tại',
  );

  /* ── H. a hydrate landing late must not undo the day ── */
  want(
    r.raceInvalid === 0,
    `${r.raceInvalid}/${r.raceRuns} lần nạp-muộn để lại hậu nghiệm không hợp lệ: ${JSON.stringify(r.raceSample)}`,
  );
  want(
    r.raceAsksKept === r.raceRuns,
    `${r.raceRuns - r.raceAsksKept}/${r.raceRuns} lần nạp-muộn NUỐT MẤT cái ask vừa ghi trong phiên — ` +
      'asked là quyết định của phiên này, nạp trễ không được phép xoá nó',
  );
} catch (e) {
  problems.push(`không dựng được phép thử bandit: ${e.message}`);
} finally {
  rmSync(out, { recursive: true, force: true });
}

if (problems.length) {
  console.log('bandit / Thompson sampling còn hở:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'bandit OK — CHẠY THẬT bandit.ts và personal-model.ts, chấm bằng một bộ đối chiếu KHÔNG import gì từ ' +
    'bandit.ts: bộ sinh Beta Marsaglia–Tsang (thuật toán khác, phân phối trung gian khác, dòng số ngẫu nhiên ' +
    'khác) cùng trung bình/phương sai giải tích. Phần số học vốn đã đúng và vẫn đúng — 100 000 lượt rút khớp ' +
    'giải tích ở mọi hình dạng, một nghìn chuỗi 200 quan sát không sinh hậu nghiệm hỏng nào, α+β chưa từng ' +
    'quá CAP. Lỗi đã sửa nằm ở CHỖ GIÁP RANH VỚI Ổ ĐĨA, nơi loadPersonalModel spread thẳng parsed.arms vào: ' +
    'alpha=1e9 (một số JSON viết ra bình thường) làm sampleBeta lặp một tỉ lần và rankQuests — chạy trong ' +
    'useMemo trên màn Hôm nay — KHÔNG BAO GIỜ trả về; {alpha:"5",beta:"2"} qua một lần thắng thành ' +
    '{alpha:26,beta:1} vì `+` trên chuỗi là nối; {alpha:0,beta:0} cho một arm rút ra đúng bằng 1 mãi mãi và ' +
    '{alpha:-5} cho một arm rút ra đúng bằng 0 mãi mãi; và một ask không còn arm — kể cả từ ĐƯỜNG DI TRÚ v1 ' +
    'của chính app — làm settle NÉM trong một useEffect. Nay mọi thứ từ đĩa đi qua bandit-state.ts và rơi về ' +
    'PRIOR nguyên khối khi không đọc được. Còn lại là hành vi đã đo chứ không phải lỗi: phép chia đôi ' +
    'PHỤ THUỘC THỨ TỰ (cùng 24 thắng/36 thua, 1000 thứ tự → 5 hậu nghiệm, trung bình 0.318…0.500) vì đó ' +
    'chính là việc nó làm — luật G chỉ chặn thứ tự biến lịch sử thua thành lịch sử thắng.',
);

/* ────────────────────────────────────────────────────────────────────────── */

function ORACLE() {
  return String.raw`
/* An oracle that shares no line with bandit.ts.

   The Beta draw is Marsaglia–Tsang: a squeeze on Gamma(k) built from normal
   variates, where the production sampler sums exponentials. Different algorithm,
   different intermediate distribution, different number of uniforms consumed —
   so the two agreeing is evidence rather than a tautology. The uniform source is
   sfc32 rather than mulberry32 for the same reason.

   The invariants are written from the definition of a Beta-Bernoulli posterior,
   not read off the implementation. */

function normal(rnd) {
  let u = 0, v = 0;
  while (u === 0) u = rnd();
  while (v === 0) v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function gammaMT(k, rnd) {
  if (k < 1) return gammaMT(k + 1, rnd) * Math.pow(rnd(), 1 / k);
  const d = k - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do { x = normal(rnd); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = rnd();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
function betaMT(a, b, rnd) {
  const x = gammaMT(a, rnd), y = gammaMT(b, rnd);
  return x / (x + y);
}
/* sfc32, seeded through splitmix32 — a different generator from the mulberry32
   in bandit.ts, and a *good* one.

   The first draft here was a 32-bit transliteration of xorshift128+, which is a
   64-bit algorithm and does not survive being cut in half. It missed the mean of
   Beta(4,2) by 0.0076 over 40 000 draws — eight and a half standard errors, so
   not sampling noise — and the baseline below caught it before it was ever
   allowed to judge the production sampler. A broken oracle is worse than no
   oracle, because it fails in the direction of confidence. */
function sfc32(seed) {
  let z = seed >>> 0;
  const mix = () => {
    z = (z + 0x9e3779b9) >>> 0;
    let t = z;
    t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
  let a = mix(), b = mix(), c = mix(), d = mix();
  return () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}
const analytic = (a, b) => ({
  mean: a / (a + b),
  varr: (a * b) / ((a + b) * (a + b) * (a + b + 1)),
});

/* The whole definition of "still a posterior", in one place. CAP is read from
   the module under test on purpose: this rule is about the counts obeying the
   bound the app declares, not about the number 40. */
function validPosterior(arm, cap) {
  if (typeof arm !== 'object' || arm === null) return false;
  const { alpha, beta } = arm;
  if (!Number.isInteger(alpha) || !Number.isInteger(beta)) return false;
  if (alpha < 1 || beta < 1) return false;
  return alpha + beta <= cap;
}
const posteriorMean = (arm) => arm.alpha / (arm.alpha + arm.beta);

module.exports = { betaMT, sfc32, analytic, validPosterior, posteriorMean };
`;
}

function POISON() {
  return String.raw`
/* One blob, one process. A ranking that never returns cannot report that it
   never returned, so the parent times this out and reads the absence. */
const O = require('./oracle.cjs');
const { seeded, CAP } = require('./lib/bandit.js');
const PM = require('./lib/personal-model.js');

(async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
  const meal = PM.usePersonalModel().arms.meal;
  const t0 = Date.now();
  let order = null;
  try { order = PM.rankQuests(seeded(11)).join(','); } catch (e) { order = 'THREW: ' + e.message; }
  console.log(JSON.stringify({
    ms: Date.now() - t0,
    meal: JSON.stringify(meal),
    valid: O.validPosterior(meal, CAP),
    order,
  }));
})().catch((e) => console.log(JSON.stringify({ err: String((e && e.stack) || e) })));
`;
}

function DRIVER() {
  return String.raw`
const O = require('./oracle.cjs');
const AS = require('@react-native-async-storage/async-storage');
const KEY = 'ascnd_personal_model_v1';
const { CAP, sampleBeta, seeded } = require('./lib/bandit.js');
const PM = require('./lib/personal-model.js');

const J = JSON.stringify;
const D = (i) => '2026-' + String(1 + Math.floor(i / 28)).padStart(2, '0') + '-' + String(1 + (i % 28)).padStart(2, '0');
/* The real local date, for the one rule that has to agree with settleStale. */
const TODAY = (() => { const t = new Date();
  return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); })();
const QUESTS = ['workout', 'meal', 'sleep', 'water', 'steps'];
/* The priors, restated rather than imported, so this notices if the editorial
   order is quietly changed underneath it. */
const PRIOR = { workout: [4, 2], meal: [3, 2], sleep: [2, 2], water: [2, 2], steps: [2, 2] };
const armsNow = () => PM.usePersonalModel().arms;
const askedNow = () => PM.usePersonalModel().asked;

/* Start from a chosen blob on disk, through the real hydrate. resetPersonalModel
   clears the "loaded" latch, so loadPersonalModel genuinely re-reads. */
async function bootFrom(blob) {
  await PM.resetPersonalModel();
  if (blob === null) AS._put(KEY, '');
  else AS._put(KEY, typeof blob === 'string' ? blob : J(blob));
  if (blob === null) await AS.removeItem(KEY);
  await PM.loadPersonalModel();
}

/* One day of the real cycle: Koa asks, they may or may not do it, the next day
   settles whatever went unanswered. This is the only way arms are written in
   production, so it is the only way they are written here. */
function day(i, quest, didIt) {
  PM.noteAsked(quest, D(i));
  if (didIt) PM.noteDone(quest, 9, D(i));
  PM.settleStale(D(i + 1));
}

const o = {};

(async () => {
  for (let k = 0; k < 20; k++) await new Promise((r) => setImmediate(r));

  /* ── baseline 1: a VALID stored model survives the round trip ── */
  await bootFrom({ arms: { workout: { alpha: 9, beta: 3 }, meal: { alpha: 2, beta: 7 } } });
  o.controlArms = J({ workout: armsNow().workout, meal: armsNow().meal });
  o.controlExpect = J({ workout: { alpha: 9, beta: 3 }, meal: { alpha: 2, beta: 7 } });

  /* ── baseline 2: the oracle agrees with the analytic moments ── */
  {
    const N = 40000;
    const fail = [];
    for (const [a, b] of [[1, 1], [9, 1], [1, 9], [4, 2], [20, 20]]) {
      const rnd = O.sfc32(5150);
      let s = 0, s2 = 0;
      for (let i = 0; i < N; i++) { const v = O.betaMT(a, b, rnd); s += v; s2 += v * v; }
      const m = s / N, varr = s2 / N - m * m;
      const an = O.analytic(a, b);
      if (Math.abs(m - an.mean) > 0.006 || Math.abs(varr - an.varr) > 0.0015) {
        fail.push({ a, b, m: +m.toFixed(5), varr: +varr.toFixed(6), an });
      }
    }
    o.oracleSane = fail.length === 0;
    o.oracleSaneFail = fail;
  }

  /* ── baseline 3: the real writing path actually moves a belief ── */
  await bootFrom(null);
  for (let i = 0; i < 20; i++) day(i, 'meal', true);
  o.learnedArm = J(armsNow().meal);
  o.learnedArmMoves = J(armsNow().meal) !== J({ alpha: PRIOR.meal[0], beta: PRIOR.meal[1] });

  /* ── B. an ask that outlives its arm ── */
  {
    const blobs = {
      'khoá lạ': { asked: { ghost: '2026-08-18' } },
      'asked là chuỗi': { asked: 'nope' },
      'di trú v1 pending': { pending: { quest: 'ghost', date: '2026-08-18' } },
    };
    const threw = [], left = [];
    for (const [name, blob] of Object.entries(blobs)) {
      try {
        await bootFrom(blob);
      } catch (e) { threw.push(name + ' (nạp): ' + e.message); continue; }
      try {
        PM.settleStale('2026-08-19');
      } catch (e) { threw.push(name + ': ' + e.message); continue; }
      const rest = Object.keys(askedNow()).filter((k) => !QUESTS.includes(k));
      if (rest.length) left.push({ [name]: rest });
    }
    o.ghostThrew = threw;
    o.ghostLeftOver = left;
  }

  /* ── C. a broken write must not become confidence ──
     The check is exact rather than a threshold: an arm the disk cannot describe
     must come back as this quest's PRIOR, because that is the only belief the
     app is entitled to when the evidence is unreadable. */
  {
    const bad = {
      'chuỗi': { alpha: '5', beta: '2' },
      'rỗng': {},
      'null': null,
      'không: 0/0': { alpha: 0, beta: 0 },
      'âm': { alpha: -5, beta: 1 },
      'thập phân': { alpha: 3.7, beta: 2 },
      'arms là chuỗi': undefined,
    };
    const fail = [];
    for (const [name, arm] of Object.entries(bad)) {
      const blob = name === 'arms là chuỗi' ? { arms: 'nope' } : { arms: { meal: arm } };
      await bootFrom(blob);
      const meal = armsNow().meal;
      const want = { alpha: PRIOR.meal[0], beta: PRIOR.meal[1] };
      if (J(meal) !== J(want)) { fail.push({ [name]: J(meal) }); continue; }
      /* and one real observation on top of it must still be a posterior */
      day(0, 'meal', true);
      if (!O.validPosterior(armsNow().meal, CAP)) fail.push({ [name + ' + 1 thắng']: J(armsNow().meal) });
      /* debris must not have been invented as extra arms */
      const extra = Object.keys(armsNow()).filter((k) => !QUESTS.includes(k));
      if (extra.length) fail.push({ [name + ' arm lạ']: extra });
    }
    o.stringCountFail = fail;
  }

  /* ── D. no arm may draw a constant ── */
  {
    await bootFrom({ arms: { meal: { alpha: 0, beta: 0 }, water: { alpha: -5, beta: 1 } } });
    /* One real completed quest on top of the blob, because that is the reachable
       sequence and the constant only appears after it: {0,0} draws 0.5 at rest —
       gamma(0) is 0 on both sides, and sampleBeta answers 0.5 when x + y is 0 —
       but one reward makes it {1,0}, and from then on y is 0 while x is not, so
       every draw is exactly x / x. Ranking the blob without living a day through
       it would have missed that entirely. */
    day(0, 'meal', true);
    const trials = 5000;
    const first = {};
    for (const q of QUESTS) first[q] = 0;
    const rnd = seeded(20260819);
    for (let i = 0; i < trials; i++) {
      const top = PM.rankQuests(rnd)[0];
      if (first[top] === undefined) first[top] = 0;
      first[top] += 1;
    }
    o.rankTrials = trials;
    o.rankFirst = first;
    o.alwaysFirst = Object.entries(first).filter(([, n]) => n === trials).map(([k]) => k);
    o.neverFirst = Object.entries(first).filter(([, n]) => n === 0).map(([k]) => k);
  }

  /* ── E. the sampler is still Beta ── */
  {
    const N = 100000;
    const fail = [];
    for (const [a, b] of [[1, 1], [9, 1], [1, 9], [4, 2], [20, 20]]) {
      const rnd = seeded(987654);
      let s = 0, s2 = 0;
      for (let i = 0; i < N; i++) { const v = sampleBeta({ alpha: a, beta: b }, rnd); s += v; s2 += v * v; }
      const m = s / N, varr = s2 / N - m * m;
      const an = O.analytic(a, b);
      if (Math.abs(m - an.mean) > 0.006 || Math.abs(varr - an.varr) > 0.0015) {
        fail.push({ a, b, m: +m.toFixed(5), varr: +varr.toFixed(6), an });
      }
    }
    o.betaN = N;
    o.betaFail = fail;
  }

  /* ── F. the posterior stays a posterior, over real days ── */
  /* One quest per run, not a quest picked at random each day.

     The first draft spread 60 days across all five, so each arm collected about
     twelve observations and "α + β > CAP" — the halving, which is the only part
     of "reward()" that can produce an invalid count — was never once reached.
     Three hundred thousand checks that could not have failed. It was found by a
     break-test that floored the decay to zero and stayed green. Every run now
     drives one arm hard enough to halve it several times, and "decayed" counts
     the halvings so the rule can say whether it got there. */
  {
    const runs = 1000, days = 120;
    const rnd = seeded(31337);
    let checks = 0, invalid = 0, sample = null, decayed = 0;
    for (let t = 0; t < runs; t++) {
      await bootFrom(null);
      const quest = QUESTS[t % QUESTS.length];
      let prev = armsNow()[quest].alpha + armsNow()[quest].beta;
      for (let i = 0; i < days; i++) {
        day(i, quest, rnd() < 0.4);
        const sum = armsNow()[quest].alpha + armsNow()[quest].beta;
        if (sum < prev) decayed += 1;
        prev = sum;
        for (const q of QUESTS) {
          checks += 1;
          if (!O.validPosterior(armsNow()[q], CAP)) {
            invalid += 1;
            if (!sample) sample = { run: t, day: i, quest: q, arm: J(armsNow()[q]) };
          }
        }
      }
    }
    o.seqRuns = runs; o.seqChecks = checks; o.invalidPosteriors = invalid; o.invalidSample = sample;
    o.seqDecays = decayed;
  }

  /* ── F2. failure never improves an arm, and never touches another ── */
  {
    /* An unbroken run of misses, which is the ONLY thing that walks alpha down
       to 1 and then meets the halving there. A 40%-win random walk never gets
       near it: measured, a floored decay that produces {0, 20} from {1, 40}
       stayed invisible to a thousand mixed histories and shows up here on the
       first run. So validity is checked on this path too, not only above. */
    await bootFrom(null);
    let maxAlpha = 0, invalid = null, atOne = 0;
    for (let i = 0; i < 120; i++) {
      PM.noteAsked('meal', D(i));
      PM.settleStale(D(i + 1));           // asked, never done → a miss
      const arm = armsNow().meal;
      maxAlpha = Math.max(maxAlpha, arm.alpha);
      if (arm.alpha === 1) atOne += 1;
      if (!invalid && !O.validPosterior(arm, CAP)) invalid = { day: i, arm: J(arm) };
    }
    o.lossNeverRaisesAlpha = maxAlpha <= PRIOR.meal[0];
    o.lossRaiseSample = { maxAlpha, prior: PRIOR.meal[0], end: J(armsNow().meal) };
    o.lossInvalid = invalid;
    o.lossReachedFloor = atOne;
    const others = QUESTS.filter((q) => q !== 'meal');
    const moved = others.filter((q) => J(armsNow()[q]) !== J({ alpha: PRIOR[q][0], beta: PRIOR[q][1] }));
    o.untouchedArmsIntact = moved.length === 0;
    o.untouchedFail = moved.map((q) => ({ [q]: J(armsNow()[q]) }));
  }

  /* ── F3. decay must not lose the ordering of two clearly different arms ── */
  {
    const runs = 1000;
    const rnd = seeded(4242);
    let flips = 0, sample = null;
    for (let t = 0; t < runs; t++) {
      await bootFrom(null);
      for (let i = 0; i < 80; i++) {
        day(i, 'meal', rnd() < 0.75);
        day(i, 'water', rnd() < 0.25);
      }
      const good = O.posteriorMean(armsNow().meal), bad = O.posteriorMean(armsNow().water);
      if (good <= bad) { flips += 1; if (!sample) sample = { meal: J(armsNow().meal), water: J(armsNow().water) }; }
    }
    o.orderRuns = runs; o.orderFlips = flips; o.orderFlipSample = sample;
  }

  /* ── G. order may reweight; it may not out-run its own best case ──
     The upper bound is the SAME multiset with every win at the end, driven
     through the same production path: that is what "recent evidence weighs
     more" means, so no other order of the same evidence may beat it. */
  {
    const W = 24, L = 36;
    const seqRun = async (seq) => {
      await bootFrom(null);
      for (let i = 0; i < seq.length; i++) day(i, 'meal', seq[i]);
      return { arm: armsNow().meal, mean: O.posteriorMean(armsNow().meal) };
    };
    const bound = await seqRun([...Array(L).fill(false), ...Array(W).fill(true)]);
    const runs = 1000;
    const rnd = seeded(555);
    let over = 0, maxMean = 0, invalid = 0;
    for (let t = 0; t < runs; t++) {
      const seq = [...Array(W).fill(true), ...Array(L).fill(false)];
      for (let i = seq.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const s = seq[i]; seq[i] = seq[j]; seq[j] = s; }
      const got = await seqRun(seq);
      if (!O.validPosterior(got.arm, CAP)) invalid += 1;
      maxMean = Math.max(maxMean, got.mean);
      if (got.mean > bound.mean + 1e-9) over += 1;
    }
    o.permRuns = runs;
    o.permBound = { arm: J(bound.arm), mean: +bound.mean.toFixed(4) };
    o.permMaxMean = +maxMean.toFixed(4);
    o.orderInventsWin = over;
    o.permInvalid = invalid;
  }

  /* ── H. a hydrate that lands late ── */
  {
    const runs = 100;
    let invalid = 0, kept = 0, sample = null;
    for (let t = 0; t < runs; t++) {
      await PM.resetPersonalModel();
      AS._put(KEY, J({ arms: { meal: { alpha: 7, beta: 3 } }, asked: { water: '2026-01-01' } }));
      AS._latency(1 + (t % 4));
      const inflight = PM.loadPersonalModel();     // deliberately not awaited yet
      /* TODAY, not a literal. loadPersonalModel ends by calling settleStale
         with the real local date, so an ask stamped with any other day is
         settled as a miss and removed — which is correct behaviour and made
         this rule fail 100/100 the morning after it was written. A rule whose
         answer depends on the calendar is not a rule. */
      PM.noteAsked('sleep', TODAY);                 // a decision this session took
      await inflight;
      AS._latency(0);
      if (askedNow().sleep === TODAY) kept += 1;
      for (const q of QUESTS) {
        if (!O.validPosterior(armsNow()[q], CAP)) {
          invalid += 1;
          if (!sample) sample = { run: t, quest: q, arm: J(armsNow()[q]) };
          break;
        }
      }
    }
    o.raceRuns = runs; o.raceInvalid = invalid; o.raceAsksKept = kept; o.raceSample = sample;
  }

  console.log(J(o));
})().catch((e) => console.log(J({ harnessError: String((e && e.stack) || e) })));
`;
}
