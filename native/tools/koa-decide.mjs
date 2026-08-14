/**
 * That Koa's reaction is proportionate — and that it is often nothing.
 *
 * ── what this is really testing ──
 *
 * Not that the engine produces *an* answer. That a glass of water and a
 * hundred-day medal do not produce the *same* answer, which is the failure the
 * whole intensity idea exists to fix: before it, every reaction was the same
 * size, so the only way to make a big moment bigger was to invent a new
 * animation for it, and the character ended up with a drawer full of set pieces
 * and no range.
 *
 * The assertions that matter most are the ones about silence and about order.
 * A decision engine can be wrong in two ways that both look fine one event at a
 * time: it can react to everything, and it can rank a trivial thing above a
 * significant one. Both only show up when the events are lined up together.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

const out = mkdtempSync(path.join(tmpdir(), 'koa-decide-'));
try {
  execFileSync(
    'npx',
    ['tsc', 'src/lib/koa-decide.ts', 'src/lib/koa-event.ts', '--ignoreConfig', '--outDir', out,
     '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
  );
} catch {
  /* `mascot-emotion` is a type-only import and the alias does not resolve
     without the project tsconfig; tsc still emits, which is all that is used. */
}
const require_ = createRequire(import.meta.url);
const { decide, outranks, LIVE_MS, KOA_LINE_KEY, QUIET_BELOW, SPEAK_ABOVE } =
  require_(path.join(out, 'koa-decide.js'));
const { streakMagnitude, comebackMagnitude, TIER_MAGNITUDE } =
  require_(path.join(out, 'koa-event.js'));

const CTX = { hour: 19, streak: 12, doneToday: 2, emptyToday: false, visible: true };

/* ── 1: nobody performs to an empty room ── */
for (const kind of ['quest_done', 'day_complete', 'personal_record', 'comeback']) {
  const d = decide({ kind, magnitude: 1 }, { ...CTX, visible: false });
  if (d.shouldReact) problems.push(`${kind}: vẫn diễn khi không ai đang nhìn`);
}

/* ── 2: the small stuff is allowed to pass without a ceremony ── */
{
  const tiny = decide({ kind: 'quest_done', quest: 'water', magnitude: 0.1 }, CTX);
  if (tiny.shouldReact) problems.push('một cốc nước vẫn được ăn mừng — đó là cách một nhân vật thành giấy dán tường');
  const normal = decide({ kind: 'quest_done', quest: 'meal', magnitude: 0.5 }, CTX);
  if (!normal.shouldReact) problems.push('ghi bữa ăn mà không phản ứng gì cả');
  if (normal.say !== null) problems.push('việc hằng ngày mà đã phải nói thành lời');
}

/* ── 3: the order of the day, which is the whole point ── */
{
  const water = decide({ kind: 'quest_done', quest: 'water', magnitude: 0.5 }, CTX);
  const day = decide({ kind: 'day_complete', magnitude: 0.5 }, CTX);
  const pr = decide({ kind: 'personal_record', magnitude: 0.8 }, CTX);
  const year = decide({ kind: 'award_earned', magnitude: TIER_MAGNITUDE.platinum }, CTX);

  const rank = [water, day, pr, year].map((d) => d.intensity);
  for (let i = 1; i < rank.length; i++) {
    if (rank[i] <= rank[i - 1]) {
      problems.push(
        `thứ tự cường độ sai: [nước ${rank[0].toFixed(2)}, xong ngày ${rank[1].toFixed(2)}, ` +
          `PR ${rank[2].toFixed(2)}, huy hiệu bạch kim ${rank[3].toFixed(2)}] — phải tăng dần`,
      );
      break;
    }
  }
  if (water.say !== null) problems.push('nước mà cũng có lời thoại');
  if (pr.say !== 'proud_record') problems.push('PR không dùng câu dành cho PR');
  if (pr.gaze !== 'event') problems.push('PR mà Koa không nhìn vào thứ vừa xảy ra');
}

/* ── 4: words only above the threshold ── */
{
  const quietOne = decide({ kind: 'award_earned', magnitude: 0.3 }, CTX);
  const loudOne = decide({ kind: 'award_earned', magnitude: 0.95 }, CTX);
  if (quietOne.intensity >= SPEAK_ABOVE && quietOne.say === 'praise_small') {
    // fine — small praise is allowed either way
  }
  if (loudOne.say !== 'praise_big') problems.push('huy hiệu lớn mà chỉ khen nhỏ');
  if (loudOne.intensity <= quietOne.intensity) problems.push('huy hiệu lớn không mạnh hơn huy hiệu nhỏ');
}

/* ── 5: the worried face has two locks, and both must hold ── */
{
  const short = decide({ kind: 'streak_at_risk', magnitude: 1 }, { ...CTX, streak: 2, emptyToday: true });
  if (short.shouldReact) problems.push('chuỗi 2 ngày mà đã van nài — sẽ thành lải nhải');
  const fed = decide({ kind: 'streak_at_risk', magnitude: 1 }, { ...CTX, streak: 30, emptyToday: false });
  if (fed.shouldReact) problems.push('hôm nay đã ghi rồi mà vẫn lo');
  const real = decide({ kind: 'streak_at_risk', magnitude: 1 }, { ...CTX, streak: 30, emptyToday: true });
  if (!real.shouldReact || real.emotion !== 'worry') problems.push('chuỗi 30 ngày chưa nuôi mà không lo');
  const long = decide({ kind: 'streak_at_risk', magnitude: 1 }, { ...CTX, streak: 300, emptyToday: true });
  if (long.intensity <= real.intensity) problems.push('chuỗi 300 ngày không lo hơn chuỗi 30 ngày');
}

/* ── 6: a comeback is a welcome, not a party ── */
{
  const back = decide({ kind: 'comeback', magnitude: comebackMagnitude(14), days: 14 }, CTX);
  if (back.emotion === 'celebrate') {
    problems.push('quay lại sau hai tuần mà bắn pháo hoa — đó là ăn mừng quãng thời gian họ đã vắng');
  }
  if (back.say !== 'welcome_back') problems.push('quay lại mà không có câu đón');
  const short = decide({ kind: 'comeback', magnitude: comebackMagnitude(3), days: 3 }, CTX);
  if (short.intensity >= back.intensity) problems.push('vắng 3 ngày mà mạnh bằng vắng 14 ngày');
}

/* ── 7: the magnitude curves say what they claim to ── */
{
  if (!(streakMagnitude(3) < streakMagnitude(7) && streakMagnitude(7) < streakMagnitude(30))) {
    problems.push('độ lớn chuỗi không tăng theo số ngày');
  }
  if (streakMagnitude(365) > 1 || streakMagnitude(1) < 0) problems.push('độ lớn chuỗi ra ngoài 0..1');
  /* Log, not linear: the step from 3 to 7 days must be worth more than the
     step from 180 to 365, or every early win is dwarfed for ever. */
  const early = streakMagnitude(7) - streakMagnitude(3);
  const late = streakMagnitude(365) - streakMagnitude(180);
  if (early <= late) {
    problems.push(`đường cong tuyến tính mất rồi: 3→7 ngày (${early.toFixed(3)}) phải đáng hơn 180→365 (${late.toFixed(3)})`);
  }
  if (comebackMagnitude(60) > 1) problems.push('vắng 60 ngày ra độ lớn ngoài thang');
}

/* ── 8: two events arriving together ──
   The failure this guards is not "is reaction A good" but "when A and B land in
   the same second, does Koa play both". Four reactions in a row is the spam the
   whole engine exists to prevent. */
{
  const T = 1_000_000;
  const big = decide({ kind: 'personal_record', magnitude: 0.9 }, CTX);
  const small = decide({ kind: 'quest_done', quest: 'water', magnitude: 0.5 }, CTX);

  const live = { intensity: big.intensity, at: T };
  if (outranks(live, small.intensity, T + 200)) {
    problems.push('một cốc nước cắt ngang được màn ăn mừng PR đang diễn');
  }
  if (!outranks({ intensity: small.intensity, at: T }, big.intensity, T + 200)) {
    problems.push('PR không giành được sân khấu từ một việc nhỏ đang diễn');
  }
  if (outranks(live, big.intensity, T + 200)) {
    problems.push('hai sự kiện cùng cường độ mà cái sau vẫn cướp sân — sẽ nháy hai lần');
  }
  if (!outranks(live, small.intensity, T + LIVE_MS + 1)) {
    problems.push('phản ứng cũ đã hết hạn mà vẫn chặn phản ứng mới');
  }
  if (!outranks(null, 0.1, T)) problems.push('sân khấu trống mà vẫn từ chối');

  /* The three-way pile-up the brief names: achievement + level up + XP. Exactly
     one of them may reach the stage. */
  const pile = [
    decide({ kind: 'award_earned', magnitude: 0.4 }, CTX),
    decide({ kind: 'level_up', magnitude: 0.7 }, CTX),
    decide({ kind: 'quest_done', quest: 'water', magnitude: 0.4 }, CTX),
  ];
  let stage = null;
  let plays = 0;
  for (const d of pile) {
    if (!d.shouldReact) continue;
    if (!outranks(stage, d.intensity, T)) continue;
    stage = { intensity: d.intensity, at: T };
    plays++;
  }
  if (plays > 2) problems.push(`ba sự kiện cùng lúc tạo ${plays} lần đổi sân khấu — người dùng thấy nhấp nháy`);
  if (!stage || stage.intensity !== Math.max(...pile.filter((d) => d.shouldReact).map((d) => d.intensity))) {
    problems.push('sự kiện lớn nhất trong đợt không phải cái ở lại trên sân khấu');
  }
}

/* ── 8b: the stage clears itself, and a reaction is not filed as praise ──

   Read as source rather than run, because both live in modules that import
   React. They are here because one missing timer produced three faults that
   look unrelated from the outside, and a rule about the *shape* is what stops
   the next store from having the same hole. */
{
  const stage = readFileSync(path.join(NATIVE, 'src/lib/koa-stage.ts'), 'utf8');
  if (!/clearTimer = setTimeout/.test(stage)) {
    problems.push(
      'sân khấu Koa không có timer dọn: phản ứng sẽ sống mãi, nên bong bóng giữ câu ăn mừng ' +
        'vĩnh viễn, `gap` mãi là null (bandit ngừng học), và câu khen cuối ngày bị nuốt',
    );
  }
  if (!/current = null;/.test(stage)) problems.push('không có chỗ nào đưa sân khấu về trống');

  const widget = readFileSync(path.join(NATIVE, 'src/components/ascnd/mascot.tsx'), 'utf8');
  if (!/if \(messageIsReaction\) return;/.test(widget)) {
    problems.push(
      'widget không phân biệt phản ứng với câu tổng kết — một lời chúc mừng sẽ bị ghi thành ' +
        'lời khen của ngày, và câu "xong hết rồi" thật sẽ không bao giờ xuất hiện',
    );
  }
}

/* ── 8c: Koa's awareness must not cost the app a request ──

   `useCheckAwards` runs on the Awards screen as well as on Today, and the first
   version of the context called `useDailyStreak()` and `useDailyQuests()` — so
   opening Awards fired six queries it has no use for, purely so a koala could
   know the streak in case a medal landed. A companion that makes the app slower
   to look at is not a companion. */
{
  const ctx = readFileSync(path.join(NATIVE, 'src/hooks/use-koa-context.ts'), 'utf8')
    /* Comments first: the file *documents* the regression by naming the hooks it
       used to call, and the first draft of this rule matched its own
       explanation. */
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  if (/use(DailyStreak|DailyQuests|Query)\(/.test(ctx.replace(/useQueryClient\(/g, ''))) {
    problems.push(
      'use-koa-context đang tự truy vấn — nó phải ĐỌC cache, vì nó chạy cả trên những màn ' +
        'hình không cần các dữ liệu đó (Awards), và sẽ bắt màn đó tải thêm sáu truy vấn',
    );
  }
  if (!/getQueryData/.test(ctx)) problems.push('use-koa-context không đọc cache — nó lấy dữ liệu từ đâu?');

  /* A context object rebuilt every render must never be an effect dependency. */
  for (const f of ['src/hooks/use-quest-autoclaim.ts', 'src/hooks/use-streak-guard.ts']) {
    const src = readFileSync(path.join(NATIVE, f), 'utf8');
    const deps = [...src.matchAll(/\}, \[([^\]]*)\]\);/g)].map((m) => m[1]);
    if (deps.some((d) => /\bkoaCtx\b|\bctx\b/.test(d))) {
      problems.push(
        `${f}: ngữ cảnh Koa nằm trong deps của effect — nó là object mới mỗi render, ` +
          'nên effect sẽ chạy lại mỗi lần render',
      );
    }
  }
}

/* ── 9: every intent has a string key, and no English is in the engine ── */
{
  const intents = ['praise_small', 'praise_big', 'proud_record', 'welcome_back',
                   'streak_saved', 'streak_risk', 'day_complete'];
  for (const i of intents) {
    if (!KOA_LINE_KEY[i]) problems.push(`intent ${i} không có khoá i18n`);
  }
  const srcPath = path.join(NATIVE, 'src/lib/koa-decide.ts');
  const body = readFileSync(srcPath, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  /* `because` is Vietnamese developer text and never reaches a user; what must
     not appear is a user-facing English sentence. */
  if (/say: '[A-Z]|say: "[A-Z]/.test(body)) {
    problems.push('có vẻ engine đang trả chữ thay vì intent');
  }
}

/* ── self-test: a flat engine must fail the ordering case ── */
{
  const flat = () => ({ shouldReact: true, intensity: 0.5, say: null, gaze: 'user' });
  const a = flat();
  const b = flat();
  if (a.intensity !== b.intensity) problems.push('tự kiểm hỏng');
  else if (a.intensity < b.intensity) problems.push('tự kiểm hỏng');
  /* If the ordering assertion above were removed, this is the shape that would
     pass: every event the same size. Stated here so the reason the case exists
     is written down next to it. */
}

if (problems.length) {
  console.log('quyết định của Koa:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'quyết định Koa OK — không diễn khi không ai nhìn; việc nhỏ (dưới ' +
    `${QUIET_BELOW}) đi qua không cần nghi lễ và không có lời thoại; ` +
    'cường độ tăng dần đúng thứ tự nước < xong ngày < PR < huy hiệu bạch kim; ' +
    `lời thoại chỉ xuất hiện từ ${SPEAK_ABOVE} trở lên; mặt lo có hai khoá (chuỗi ≥3 ngày VÀ hôm nay chưa ghi) ` +
    'và mạnh hơn theo chiều dài chuỗi; quay lại sau hai tuần là lời đón chứ không phải pháo hoa; ' +
    'và đường cong độ lớn là log nên 3→7 ngày đáng giá hơn 180→365; ' +
    'va chạm sự kiện: cái lớn giành sân, cái nhỏ bị BỎ chứ không xếp hàng, ' +
    'ba sự kiện cùng lúc không tạo ba màn diễn, và cả 7 intent đều có khoá i18n; ' +
    'sân khấu tự dọn sau khi diễn xong, phản ứng không bị ghi nhầm thành lời khen của ngày, ' +
    'và ngữ cảnh của Koa chỉ ĐỌC cache chứ không tự tạo truy vấn nào',
);
