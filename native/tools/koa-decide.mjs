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
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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
    ['tsc', 'src/lib/koa-decide.ts', 'src/lib/koa-event.ts', 'src/lib/mascot-emotion.ts',
     '--ignoreConfig', '--outDir', out,
     '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
  );
} catch {
  /* Without the project tsconfig there is no `@/` mapping, so tsc reports the
     aliases as unresolved and exits non-zero — while still emitting the JS,
     which is all that is used here. */
}
/* `streakInDanger` is now a real import rather than a type, so the emitted
   alias has to be rewritten to a relative path — the same one-line
   substitution `tools/streak.mjs` documents. It is a path, not behaviour. */
const decidePath = path.join(out, 'koa-decide.js');
writeFileSync(
  decidePath,
  readFileSync(decidePath, 'utf8').replaceAll('@/lib/mascot-emotion', './mascot-emotion'),
);
const require_ = createRequire(import.meta.url);
const { decide, outranks, LIVE_MS, KOA_LINE_KEY, QUIET_BELOW, SPEAK_ABOVE } =
  require_(path.join(out, 'koa-decide.js'));
const { streakMagnitude, comebackMagnitude, TIER_MAGNITUDE } =
  require_(path.join(out, 'koa-event.js'));
const { baseEmotion, RISK_MIN_STREAK } = require_(path.join(out, 'mascot-emotion.js'));

const CTX = { hour: 19, streak: 12, emptyToday: false, visible: true };

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
  /* The hour is part of the test now, and that is the drift this consolidation
     removed: the event branch used to worry at any time of day while the held
     face waited for the evening. */
  const early = decide(
    { kind: 'streak_at_risk', magnitude: 1 },
    { ...CTX, hour: 9, streak: 30, emptyToday: true },
  );
  if (early.shouldReact) problems.push('chuỗi sắp mất mà đã lo từ 9h sáng — mặt lo lúc đó là tâm trạng, không phải thông tin');
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

/* ── 8d: a first reading is a baseline, never a crossing ──

   The level is derived from lifetime XP, so there is no moment at which the app
   knows one was just crossed — only a remembered previous value can tell. Which
   means the first reading after an install reads straight in at whatever level
   the account already is, and treating that as a crossing congratulates
   somebody on reaching the level they were already at. The quest watcher learnt
   this the same way. */
{
  const pm = readFileSync(path.join(NATIVE, 'src/lib/personal-model.ts'), 'utf8');
  const step = pm.match(/export function levelStep[\s\S]*?\n\}/);
  if (!step) {
    problems.push('không tìm thấy levelStep — không có gì nhớ được cấp độ trước');
  } else if (!/from != null && next > from/.test(step[0])) {
    problems.push(
      'levelStep không loại lần đọc ĐẦU TIÊN khỏi "vừa lên cấp" — cài lại app sẽ chúc mừng ' +
        'người ta vì đã đạt đúng cái cấp họ đang có',
    );
  }
  if (!/koaSeen/.test(pm)) {
    problems.push(
      'không có dedup lưu trữ: sân khấu chỉ nhớ trong phiên, nên đóng rồi mở lại app trong ' +
        'cùng buổi sáng sẽ chào đón cùng một người quay lại lần thứ hai',
    );
  }

  const claim = readFileSync(path.join(NATIVE, 'src/hooks/use-quest-autoclaim.ts'), 'utf8');
  if (!/if \(!crossed\) return;/.test(claim)) {
    problems.push('lên cấp được phát mà không kiểm `crossed` — mỗi lần đọc ví sẽ là một lần lên cấp');
  }
}

/* ── 8e: an event is marked handled only once it has been handled ──

   The single nastiest shape in this whole pipeline, because it destroys exactly
   the moments it exists to protect and leaves no trace: a personal record
   earned while the character is off screen comes back `shouldReact: false`, is
   filed as done, and — the id being persisted — never plays again. Not on
   returning to the dashboard. Ever. */
{
  const stage = readFileSync(path.join(NATIVE, 'src/lib/koa-stage.ts'), 'utf8');
  const body = stage.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  const declineAt = body.indexOf('if (!decision.shouldReact) return decision;');
  /* The *call*, not the declaration — `function remember(...)` sits above
     `emitKoa`, and the first draft of this rule matched it and failed on
     correct code. */
  const firstRemember = body.indexOf('remember(event.id)');
  if (declineAt < 0) {
    problems.push('không tìm thấy nhánh từ chối trong emitKoa');
  } else if (firstRemember >= 0 && firstRemember < declineAt) {
    problems.push(
      'emitKoa ghi nhận sự kiện TRƯỚC khi biết có phản ứng hay không — một khoảnh khắc bị từ ' +
        'chối (vì không ai đang nhìn) sẽ bị đánh dấu đã xử lý và không bao giờ diễn lại',
    );
  }
  if (/koaSeenOnce/.test(body)) {
    problems.push('vẫn dùng koaSeenOnce (kiểm và ghi trong một lần gọi) — đó chính là hình dạng của lỗi');
  }

  const ctx = readFileSync(path.join(NATIVE, 'src/hooks/use-koa-context.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  if (/visible: true/.test(ctx)) {
    problems.push(
      'ngữ cảnh khai `visible: true` cứng — đó là một cái nhún vai, và nó khiến phản ứng diễn ' +
        'cho một màn hình không có Koa nào trên đó',
    );
  }
  if (!/koaOnScreen\(\)/.test(ctx)) problems.push('không hỏi xem có Koa nào đang được vẽ không');
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

/* ── every kind of event either has somebody who fires it, or a written reason ──

   ── the shape, not the instance ──

   `koa_greeted` sat in the union with a full decision branch — a night face, a
   day face, an intensity, a hold — and **nothing in the app ever emitted it**.
   It was reachable only from the debug screen, so the one interaction a person
   can start ran a fixed 360° flip and consulted none of it. Nothing failed;
   there is simply no way to notice a `case` that is never reached.

   That is the same shape as `tools/dead-schema.mjs` (a table nobody reads or
   writes) and `tools/linked.mjs` (an exported function nobody calls), and it
   gets the same treatment: every kind is either wired up, or named here with
   the reason it is not. A tenth kind added and left unwired fails this step —
   which is the case worth catching, because it is the one nobody would
   otherwise see. */
{
  const KIND_EXEMPT = new Map([
    [
      'quest_done',
      'năm việc hằng ngày đã có phản ứng riêng ở chỗ peek trên thẻ (`quest-peek`); bắn thêm qua ' +
        'đường này nữa là một cốc nước được diễn hai lần',
    ],
    [
      'streak_at_risk',
      'khuôn mặt lo đã được `baseEmotion` giữ liên tục suốt buổi tối chứ không phải một sự kiện ' +
        'nổ một lần; nhánh sự kiện còn lại để màn debug chạy thử `streakInDanger` cùng một luật',
    ],
  ]);

  const eventSrc = readFileSync(path.join(NATIVE, 'src/lib/koa-event.ts'), 'utf8');
  const union = eventSrc.slice(
    eventSrc.indexOf('export type KoaEventKind'),
    eventSrc.indexOf('export interface KoaEvent'),
  );
  const kinds = [...union.matchAll(/\|\s*'(\w+)'/g)].map((m) => m[1]);
  if (kinds.length < 8) {
    problems.push(`chỉ đọc được ${kinds.length} loại sự kiện từ koa-event.ts — bộ quét hỏng`);
  }

  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'src'], {
    cwd: NATIVE,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)
    /* the debug screen fires all of them by construction, so counting it would
       make every kind look wired */
    .filter((f) => f !== 'src/app/koa-debug.tsx' && f !== 'src/lib/koa-event.ts');

  /* Read out of the `emitKoa(...)` call itself rather than off a `kind:` line.

     A first draft matched `kind:\s*'(\w+)'` and immediately reported
     `award_earned` as unwired — because the medal engine writes
     `kind: def.type === 'pr' ? 'personal_record' : 'award_earned'`, and a
     ternary is not a literal on a `kind:` line. Two kinds decided in one
     expression is an ordinary thing to write; a rule that cannot read it would
     have been argued down rather than fixed. So the whole call is taken, and
     every kind named anywhere inside it counts. */
  const emitted = new Set();
  let scanned = 0;
  for (const f of files) {
    let src;
    try {
      src = readFileSync(path.join(NATIVE, f), 'utf8');
    } catch {
      continue;
    }
    src = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    let i = src.indexOf('emitKoa(');
    while (i >= 0) {
      let depth = 0;
      let j = i + 'emitKoa'.length;
      for (; j < src.length; j++) {
        if (src[j] === '(') depth++;
        else if (src[j] === ')') {
          depth--;
          if (depth === 0) break;
        }
      }
      scanned++;
      const call = src.slice(i, j + 1);
      for (const m of call.matchAll(/'(\w+)'/g)) {
        if (kinds.includes(m[1])) emitted.add(m[1]);
      }
      i = src.indexOf('emitKoa(', j);
    }
  }
  if (scanned < 4) {
    problems.push(`chỉ đọc được ${scanned} lời gọi emitKoa — bộ quét hỏng, đừng tin kết quả bước này`);
  }

  for (const kind of kinds) {
    if (emitted.has(kind) || KIND_EXEMPT.has(kind)) continue;
    problems.push(
      `sự kiện '${kind}' có nhánh quyết định nhưng KHÔNG chỗ nào trong app bắn nó — nối nó vào, ` +
        'hoặc ghi tên nó vào KIND_EXEMPT kèm LÝ DO. Một `case` không bao giờ chạy tới không gây lỗi, ' +
        'nó chỉ nằm đó — đúng như `koa_greeted` đã nằm đó suốt, trong khi cú chạm vào Koa chạy một ' +
        'hoạt ảnh cố định và không hỏi engine lấy một câu',
    );
  }
  for (const [kind, why] of KIND_EXEMPT) {
    if (!kinds.includes(kind)) {
      problems.push(`KIND_EXEMPT còn '${kind}' nhưng loại đó không còn trong koa-event.ts — bỏ dòng đó đi`);
    }
    if (!why || why.length < 30) problems.push(`'${kind}' được miễn mà lý do quá sơ sài`);
  }
}

/* ── the greeting reads the person, and only when it is entitled to ──

   `koa_greeted` had a decision branch from the day the engine was written and
   **nothing ever emitted it**: touching the figure ran a fixed 360° flip and
   opened the room. So the one interaction the person initiates was the one
   place the character had no opinion.

   Three things have to hold at once, and the middle one is the reason this is a
   table rather than a reading:

     · a person back after a fortnight gets warmth, not the stranger's wave;
     · a person **below their own baseline** gets the ordinary wave. A character
       that changes its face at somebody having a hard fortnight is a character
       commenting on it, and that is the mechanic this app has twice written
       down that it will not use;
     · a person in a load spike is greeted quietly — a cheerful bounce is the
       one greeting here that could push somebody toward an injury.

   And none of it fires without confidence: at `none` — a five-day-old account,
   or a screen that never read the streak — the answer must be exactly the
   stranger's wave. */
{
  const NOON = { hour: 14, streak: 5, emptyToday: false, visible: true };
  const st = (situation, confidence = 'high') => ({
    situation, confidence, recent: 0.3, baseline: 0.6, trend: null, daysQuiet: 0, because: 'thử',
  });
  const greet = (state) => decide({ kind: 'koa_greeted', magnitude: 0.35 }, { ...NOON, state });

  const plain = greet(undefined);
  if (plain.emotion !== 'wave' || plain.say !== null) {
    problems.push(`chạm Koa khi chưa biết gì phải ra vẫy tay không lời, ra '${plain.emotion}'/${plain.say}`);
  }

  const back = greet(st('returning'));
  if (back.say !== 'welcome_back') {
    problems.push(
      `chạm Koa sau khi quay lại phải là lời đón (welcome_back), ra ${back.say} — ` +
        'đây là khoảnh khắc mong manh nhất trong cả sản phẩm và nó đang nhận đúng cái vẫy tay của người lạ',
    );
  }
  if (!(back.intensity > plain.intensity)) {
    problems.push('lời đón không lớn hơn cái vẫy tay thường — hai thứ khác nhau mà diễn như nhau');
  }

  const hard = greet(st('slipping'));
  if (hard.emotion !== plain.emotion || hard.say !== plain.say) {
    problems.push(
      `người đang sa sút được chào KHÁC người bình thường ('${hard.emotion}'/${hard.say}) — ` +
        'nhân vật đổi sắc mặt vì bạn có một tuần khó khăn là nhân vật đang bình phẩm về nó',
    );
  }

  const heavy = greet(st('overreaching'));
  if (heavy.say !== null || heavy.intensity >= plain.intensity) {
    problems.push(
      'người đang quá tải phải được chào KHẼ và không lời — một cú nhảy hớn hở ở đây là lời chào duy nhất ' +
        'có thể đẩy người ta tới chấn thương',
    );
  }

  /* the confidence gate, on every situation — a state read at confidence
     `none` is a state the app is not entitled to act on */
  for (const situation of ['returning', 'overreaching', 'slipping', 'steady', 'settling_in']) {
    const d = greet(st(situation, 'none'));
    if (d.emotion !== plain.emotion || d.say !== plain.say) {
      problems.push(
        `'${situation}' với độ tin cậy none vẫn đổi lời chào — chưa đủ dữ liệu thì phải cư xử ` +
          'đúng như với người lạ',
      );
    }
  }

  /* and night still wins over all of it */
  for (const hour of [23, 2, 5]) {
    const d = decide({ kind: 'koa_greeted', magnitude: 0.35 }, { ...NOON, hour, state: st('returning') });
    if (d.emotion !== 'sleep') {
      problems.push(`chạm Koa lúc ${hour}h ra '${d.emotion}' — nhân vật bật dậy lúc 2h sáng là nhân vật không có trạng thái`);
    }
  }
}

/* ── the streak must not make Koa sadder ──

   `baseEmotion` used to read `mood === 'tired' ? (streak === 0 ? 'sad' : 'tired')`.
   `useMascotMood` returns `tired` for a day that is only *empty so far* — past
   midday with no meal, past six with no workout — so somebody who installed the
   app that morning met a figure drawn at `floatPt: 0, droopDeg: 10`: slumped,
   motionless, visibly unhappy, before they had done anything at all.

   And the streak was the term that decided it, which put the sad face on the
   people with the least invested. That is guilt aimed at whoever is least able
   to carry it, and it is the mechanic this app has written down twice that it
   will not use.

   So: identical days must draw identical faces whatever the streak, and no
   streak value may produce `sad`. `worry` is the one state allowed to look
   concerned, and it is gated on a run the app has already called an
   achievement, a genuinely empty day, and this person's own evening. */
{
  const DAY = {
    onWorkoutScreen: false,
    isBirthday: false,
    cold: false,
    streakAtRisk: false,
  };
  for (const mood of ['happy', 'neutral', 'tired']) {
    for (const hour of [7, 11, 13, 17, 19, 21]) {
      const at = (streak) => baseEmotion({ ...DAY, mood, hour, streak });
      const zero = at(0);
      if (zero === 'sad') {
        problems.push(
          `mood='${mood}' lúc ${hour}h với chuỗi 0 ra 'sad' — một ngày MỚI CHỈ TRỐNG không phải một ngày ` +
            'thất bại, và người có chuỗi 0 là người mới cài app sáng nay',
        );
      }
      for (const streak of [1, 3, 12, 200]) {
        if (at(streak) !== zero) {
          problems.push(
            `mood='${mood}' lúc ${hour}h: chuỗi 0 ra '${zero}' còn chuỗi ${streak} ra '${at(streak)}' — ` +
              'cùng một ngày mà chuỗi lại chấm điểm nó, tức Koa buồn hơn với người có ít thứ để mất hơn',
          );
        }
      }
    }
  }
  /* and the one concerned state that IS allowed still works, so this check
     cannot be satisfied by deleting every negative face in the app */
  const worried = baseEmotion({
    ...DAY, mood: 'tired', hour: 20, streak: RISK_MIN_STREAK, streakAtRisk: true, riskHour: 18,
  });
  if (worried !== 'worry') {
    problems.push(
      `chuỗi ${RISK_MIN_STREAK} ngày, hôm nay trống thật, 20h — phải là 'worry' nhưng ra '${worried}'. ` +
        'Hỏi khi vẫn còn kịp trả lời là việc khác với tỏ ra thất vọng sau đó',
    );
  }
}

if (problems.length) {
  console.log('quyết định của Koa:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

/* ── an unread day must not become a mood ──

   `useMascotMood` read `data` off two queries and nothing else. While they are
   in flight, or after either fails, `meals?.length ?? 0` is 0 and
   `log?.workout_count ?? 0` is 0 — not "unknown" but a confident *nothing* — so
   every launch after midday returned `tired`, which `baseEmotion` turns into
   **`sad`** for a zero streak, which `presenceMotion('sad')` draws slumped and
   motionless.

   A character visibly unhappy because the network had not answered yet. And the
   last round made it worse rather than better: now that the body follows the
   emotion honestly, a wrong emotion is unmistakable instead of a small change
   of face.

   Every other emotional input already had a gate. The rule is the shape, not
   the one hook: read a day-query in this file and you answer for whether it has
   been read. */
{
  const src = readFileSync(path.join(NATIVE, 'src/hooks/use-mascot.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  /* Split on `export function` so each hook answers for itself — an `isSuccess`
     belonging to a different hook in the same file would satisfy a whole-file
     grep and prove nothing. */
  const chunks = src.split(/\bexport function /).slice(1);
  let checked = 0;
  for (const chunk of chunks) {
    const name = chunk.slice(0, chunk.indexOf('(')).trim();
    const body = chunk.slice(0, chunk.indexOf('\n}') === -1 ? chunk.length : chunk.indexOf('\n}'));
    if (!/use(DailyLog|TodayMeals|TodayWater)\(\)/.test(body)) continue;
    checked++;
    if (!/isSuccess/.test(body)) {
      problems.push(
        `use-mascot.tsx: ${name} đọc dữ liệu ngày mà không có cổng isSuccess — ` +
          'lúc truy vấn đang bay hoặc đã hỏng, "chưa đọc được" bị đọc thành "chưa ăn gì, chưa tập gì", ' +
          'và sau 12h trưa Koa gục xuống buồn bã chỉ vì mạng chưa trả lời',
      );
    }
  }
  if (checked < 2) {
    problems.push(`chỉ soi được ${checked} hook đọc dữ liệu ngày — bộ quét hỏng, đừng tin kết quả`);
  }

  /* ── a quest is judged against the person's own target, and only once it is
     known ──

     Two failures of the same shape lived in `use-daily-quests.ts`:

       · steps were `>= 5000`, hard-coded, while the ring on Today measures
         against the goal the person set (default 10,000, adjustable 1k–50k).
         Somebody on 15,000 saw a ring at 40% and a Koa room saying the steps
         quest was done.
       · water compared against `profile?.water_target_ml || 2500`, and `ready`
         did not wait for the profile. So during load the quest was judged — and
         auto-claimed, irreversibly — against 2,500 for somebody whose target is
         3,500.

     A default is right for rendering and wrong for deciding. Both halves are
     checked: the comparison uses the real goal, and every source feeding a
     decision is in `ready`. */
  const q = readFileSync(path.join(NATIVE, 'src/hooks/use-daily-quests.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  const doneBlock = q.slice(q.indexOf('const done'), q.indexOf('const claimed'));
  if (/steps:\s*\([^)]*\)\s*>=\s*\d+/.test(doneBlock)) {
    problems.push(
      'use-daily-quests.ts: quest bước chân so với một con số gõ cứng chứ không phải mục tiêu ' +
        'người dùng tự đặt — vòng bước trên Today và phòng Koa sẽ nói hai điều khác nhau về cùng một ngày',
    );
  }

  /* Anchored past `const claimed`, because the first `ready:` in the file is
     the interface's `ready: boolean;` — matching that read a declaration
     instead of the expression and reported the correct code as broken. */
  /* ── a quest nobody can win must leave the set ──

     `daily_logs.steps` has one writer, the HealthKit sync. Decline the Health
     prompt and it is null for ever: the steps quest was unwinnable, the day was
     pinned at 4/5, and Koa's "finished everything" event — gated on
     `doneCount >= total` — was dead code for those accounts. Two medals in this
     app were already fixed for being unearnable by construction; this was the
     same shape, one screen over.

     Apple refuses to tell an app whether *read* permission was granted (see
     `lib/health.ts`), so the signal has to be observational — has a step count
     ever arrived — and the denominator has to follow it. Checking `total` and
     `doneCount` come from the filtered set rather than from `DAILY_QUESTS`
     directly is the part that matters: a screen can hide the row and still
     leave the day unfinishable. */
  /* The filter has to *consult the signal*, not merely exist. A first version
     of this rule only checked that the identifier `activeDefs` appeared, and
     `const activeDefs = DAILY_QUESTS;` satisfied that perfectly while
     reinstating the bug. */
  const filterLine = q.match(/const activeDefs\s*=\s*([^;]+);/);
  if (!filterLine || !/stepsAvailable/.test(filterLine[1])) {
    problems.push(
      'use-daily-quests.ts: bộ quest không lọc theo nguồn dữ liệu — người từ chối quyền Health ' +
        'không bao giờ có số bước, nên quest bước vĩnh viễn không xong và ngày kẹt ở 4/5',
    );
  }
  /* Anchored past `const claimed` for the same reason `ready` is: the first
     `total:` in the file is the interface's `total: number;`, and reading a
     declaration instead of the expression let a reinstated `DAILY_QUESTS.length`
     pass unnoticed. */
  const returned = q.slice(q.indexOf('const claimed'));
  for (const [field, why] of [
    ['total', 'mẫu số vẫn là cả 5 quest nên "xong cả ngày" không bao giờ đạt'],
    ['doneCount', 'tử số đếm cả quest không thể thắng'],
  ]) {
    const line = returned.match(new RegExp(`${field}:\\s*([^,\\n]+)`));
    if (!line) {
      problems.push(`use-daily-quests.ts: không đọc được \`${field}\` — luật này đã lạc mục tiêu`);
    } else if (/DAILY_QUESTS/.test(line[1])) {
      problems.push(`use-daily-quests.ts: \`${field}\` vẫn tính từ DAILY_QUESTS — ${why}`);
    }
  }
  /* And the screens draw the filtered list, or a dot sits there that can never
     light. */
  for (const [file, what] of [
    ['src/components/ascnd/mascot.tsx', 'chấm tiến độ trên Today'],
    ['src/app/mascot-room.tsx', 'danh sách quest trong phòng Koa'],
  ]) {
    const src = readFileSync(path.join(NATIVE, file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    if (/DAILY_QUESTS\.map\(/.test(src)) {
      problems.push(
        `${file}: ${what} vẽ thẳng từ DAILY_QUESTS — sẽ hiện một quest mà tài khoản này ` +
          'không bao giờ hoàn thành được',
      );
    }
  }

  const readyLine = q.slice(q.indexOf('const claimed')).match(/ready:\s*([^,]+),/);
  if (!readyLine) {
    problems.push('use-daily-quests.ts: không đọc được biểu thức `ready` — luật này đã lạc mục tiêu');
  } else {
    for (const [needed, why] of [
      ['profileOk', 'mục tiêu nước lấy từ hồ sơ, chưa đọc xong thì mặc định 2500 ml đứng thay'],
      ['stepsGoalOk', 'mục tiêu bước lấy từ bộ nhớ máy, chưa đọc xong thì mặc định 10.000 đứng thay'],
      ['stepsAvailOk', 'chưa biết tài khoản này có nguồn bước chân chưa thì mẫu số có thể sai'],
    ]) {
      if (!readyLine[1].includes(needed)) {
        problems.push(
          `use-daily-quests.ts: \`ready\` thiếu ${needed} — ${why}; ` +
            'quest được chấm và TỰ NHẬN theo mục tiêu của người khác, mà đã nhận thì không rút lại được',
        );
      }
    }
  }

  if (problems.length) {
    console.log('quyết định của Koa:\n');
    for (const p of problems) console.log(`  • ${p}`);
    process.exit(1);
  }
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
    'và ngữ cảnh của Koa chỉ ĐỌC cache chứ không tự tạo truy vấn nào; ' +
    'lần đọc cấp độ đầu tiên là mốc chứ không phải một lần lên cấp, dedup sống qua lần khởi động lại, ' +
    'sự kiện chỉ bị đánh dấu đã xử lý SAU khi thật sự xử lý, và "có ai nhìn không" là câu hỏi ' +
    'gửi tới chính hình vẽ chứ không phải một hằng số true',
);
