/**
 * That Koa's body says the same thing its face does — and that it shuts up.
 *
 * ── the bug this was written for ──
 *
 * The face had been state-driven for a long time: fifteen emotions derived
 * from the day, drawn by the figure. The body, on the home screen, was not. It
 * floated on a permanent loop, swayed ±9° on a permanent loop, and fired a
 * random quirk — a hop, a double-nod, or **a full 360° flip** — every six to
 * fourteen seconds, gated on nothing but the tab being focused.
 *
 * So one character disagreed with itself. At eleven at night, with the day
 * logged, Koa wore the `sleep` face and did a backflip every ten seconds. A
 * `proud` face and an `idle` face produced identical movement. Nothing errored,
 * nothing looked broken in isolation, and the whole state model the app had
 * built was invisible from two feet away.
 *
 * ── and the failure that is worse than a wrong number ──
 *
 * Motion on a timer. Something that moves without being touched is read as an
 * advertisement and stops being read within days; a character that performs
 * every ten seconds has nothing left for the moment it needs to be believed.
 * The rule below that matters most is the one that says **no timer starts a
 * movement** — it is the only check here that would catch the whole class
 * coming back in a different shape.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(NATIVE, p), 'utf8');
const strip = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const problems = [];

const out = mkdtempSync(path.join(tmpdir(), 'koa-idle-'));
try {
  execFileSync(
    'npx',
    ['tsc', 'src/lib/koa-idle.ts', '--ignoreConfig', '--outDir', out,
     '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
  );
} catch {
  /* `MascotEmotion` is a type-only import, so the emitted JS has no require to
     rewrite — tsc still exits non-zero over the missing `@/` mapping without
     the project tsconfig, and still emits, which is all this uses. */
}
const { AROUSAL, arousalOf, presenceMotion, noticeAmplitude } =
  createRequire(import.meta.url)(path.join(out, 'koa-idle.js'));

/** every emotion the figure can be asked to show */
const EMOTIONS = Object.keys(
  Object.fromEntries(
    [...strip(read('src/lib/mascot-emotion.ts')).matchAll(/^\s*\|\s*'([a-z]+)'/gm)].map((m) => [
      m[1],
      true,
    ]),
  ),
);

/* ── 1. no emotion is left without an answer ── */
{
  if (EMOTIONS.length < 10) {
    problems.push(`chỉ đọc được ${EMOTIONS.length} cảm xúc từ mascot-emotion.ts — luật này hỏng`);
  }
  for (const e of EMOTIONS) {
    if (AROUSAL[e] === undefined) {
      problems.push(`cảm xúc '${e}' không có mức tỉnh táo — thân sẽ dùng giá trị mặc định`);
    }
    const m = presenceMotion(e, false);
    if (!Number.isFinite(m.floatPt) || !Number.isFinite(m.breathMs) || m.breathMs <= 0) {
      problems.push(`'${e}' cho chuyển động vô nghĩa (${JSON.stringify(m)})`);
    }
  }
}

/* ── 2. the states that must not look like each other ──

   This is the assertion the whole file is for. Before this existed every one
   of these pairs produced identical movement. */
{
  const shape = (e) => {
    const m = presenceMotion(e, false);
    return `${m.level}:${m.floatPt}:${m.breathMs}:${m.droopDeg}`;
  };
  const mustDiffer = [
    ['sleep', 'idle'],
    ['sleep', 'celebrate'],
    ['tired', 'idle'],
    ['worry', 'idle'],
    ['worry', 'happy'],
    ['proud', 'idle'],
  ];
  for (const [a, b] of mustDiffer) {
    if (shape(a) === shape(b)) {
      problems.push(`'${a}' và '${b}' cử động y hệt nhau — thân không nghe theo trạng thái`);
    }
  }

  /* Asleep must be the slowest thing the character does, and flat-out tired
     must not travel at all. Both are cases where *less* is the information. */
  const asleep = presenceMotion('sleep');
  const awake = presenceMotion('happy');
  if (!(asleep.breathMs > awake.breathMs * 1.4)) {
    problems.push(`nhịp thở lúc ngủ (${asleep.breathMs}) không chậm hơn hẳn lúc vui (${awake.breathMs})`);
  }
  if (presenceMotion('tired').floatPt !== 0) {
    problems.push('mệt lử mà vẫn bồng bềnh — đứng yên mới là thông tin ở trạng thái này');
  }
  if (presenceMotion('worry').droopDeg !== 0) {
    problems.push('mặt lo mà thân gục xuống — lo là đang chờ, không phải đã bỏ cuộc');
  }
  if (!(presenceMotion('worry').breathMs < presenceMotion('idle').breathMs)) {
    problems.push('lo mà thở chậm hơn bình thường');
  }
}

/* ── 3. arousal actually orders the movement ── */
{
  const ordered = ['sleep', 'tired', 'idle', 'happy', 'celebrate'];
  for (let i = 1; i < ordered.length; i++) {
    if (!(arousalOf(ordered[i]) > arousalOf(ordered[i - 1]))) {
      problems.push(`thang tỉnh táo sai thứ tự ở '${ordered[i - 1]}' → '${ordered[i]}'`);
    }
  }
  /* Above `idle`, more awake means a deeper, quicker breath — or the scale is
     a number nobody reads. */
  const calm = presenceMotion('rested');
  const bright = presenceMotion('celebrate');
  if (!(bright.floatPt > calm.floatPt) || !(bright.breathMs < calm.breathMs)) {
    problems.push('càng tỉnh mà nhịp thở không sâu hơn/nhanh hơn — thang đo không dẫn tới gì');
  }
}

/* ── 4. "something is waiting" is a nudge, not a performance ── */
{
  const quiet = presenceMotion('idle', false);
  const held = presenceMotion('idle', true);
  if (held.floatPt === quiet.floatPt && held.breathMs === quiet.breathMs) {
    problems.push('có thứ đang chờ mà nhân vật không khác gì lúc rảnh');
  }
  if (held.floatPt - quiet.floatPt > 3) {
    problems.push(`"đang chờ" nhảy quá mạnh (+${held.floatPt - quiet.floatPt}pt) — đây phải là gợi ý, không phải màn diễn`);
  }
  /* Waiting must not wake a sleeping character. Uncollected coins at midnight
     are not a reason to get up. */
  if (presenceMotion('sleep', true).level !== 'asleep') {
    problems.push('xu chưa nhận làm nhân vật đang ngủ tỉnh dậy');
  }
}

/* ── 5. the first reading is a baseline, not a change ── */
{
  if (noticeAmplitude(null, 'celebrate') !== 0) {
    problems.push('lần đọc trạng thái đầu tiên bị coi là một thay đổi — nhân vật phản ứng vì vừa được sinh ra');
  }
  if (noticeAmplitude('happy', 'happy') !== 0) {
    problems.push('trạng thái không đổi vẫn sinh ra cử động');
  }
  const big = noticeAmplitude('sleep', 'celebrate');
  const small = noticeAmplitude('idle', 'rested');
  if (!(big > small)) {
    problems.push(`thay đổi lớn (${big}) không lớn hơn thay đổi nhỏ (${small})`);
  }
  if (big > 1) problems.push(`biên độ vượt 1 (${big})`);
  /* Neighbours produce nothing. A twitch nobody can attribute to anything is
     noise wearing the costume of information. */
  if (noticeAmplitude('proud', 'run') !== 0) {
    problems.push('hai trạng thái sát nhau vẫn sinh ra cử động — đó là giật, không phải phản ứng');
  }
  /* Symmetric: falling asleep is as big a change as waking up. */
  if (noticeAmplitude('celebrate', 'sleep') !== noticeAmplitude('sleep', 'celebrate')) {
    problems.push('đi lên và đi xuống cùng một khoảng lại cho biên độ khác nhau');
  }
}

/* ── 6. nothing moves on a timer ── */
{
  const src = strip(read('src/components/ascnd/mascot.tsx'));

  /* The exact shape that shipped: a `setTimeout` whose delay is randomised, so
     the character performs on a schedule nobody asked for. */
  if (/setTimeout\([^)]*Math\.random\(\)/.test(src) || /Math\.random\(\)[^;]*\)\s*;\s*\n?\s*\}/.test(src)) {
    problems.push('có hẹn giờ ngẫu nhiên trong widget — cử động theo đồng hồ là quảng cáo, không phải tính cách');
  }
  if (/setInterval\(/.test(src)) {
    problems.push('có setInterval trong widget mascot');
  }
  /* A 360° spin is a delight when somebody asked for it and wallpaper when it
     fires by itself. It may only appear inside the press handler. */
  const spins = [...src.matchAll(/withTiming\(360/g)];
  const pokeAt = src.indexOf('const poke =');
  for (const s of spins) {
    if (pokeAt < 0 || s.index < pokeAt) {
      problems.push('cú lộn 360° nằm ngoài hành động chạm — nó chỉ được xảy ra khi người dùng bấm');
    }
  }

  /* And the body has to be reading the state at all. */
  if (!src.includes('useMascotEmotion()')) {
    problems.push('widget không đọc cảm xúc — thân lại không biết mặt đang thể hiện gì');
  }
  if (!src.includes('presenceMotion(')) {
    problems.push('widget không dùng presenceMotion — các con số cử động lại nằm rải trong component');
  }
  /* Numbers back in the component is how the two halves drifted apart the
     first time. The breath's two values must come from the model — and there
     are **two**, which is the half of this that a static rule missed once
     already.

     The first version of the fix took the *pace* from the state and left the
     *depth* as the literal `-7` the file shipped with, so asleep and wide awake
     both rose exactly seven points. Nothing here objected: `presenceMotion`
     was called, `floatPt` was read, and it was read only to decide whether to
     start the loop. It took `tools/koa-breath.mjs` measuring the running app —
     7.00px at both ends of the day — to see it.

     So both are checked, and the depth is checked at the transform rather than
     at the call: the question is not whether `floatPt` is mentioned, it is
     whether it reaches the thing that moves. */
  if (!/duration:\s*half\b/.test(src)) {
    problems.push('nhịp thở lại gõ số cứng trong component thay vì lấy từ trạng thái');
  }
  /* The whole line, not `[^,\n]+`. The first version of this stopped at the
     first comma, so `interpolate(hover.value, [0, 1], [0, -7])` was read as
     `interpolate(hover.value` — no digits, green, and the sabotage it exists to
     catch walked straight past it. Second time in this file that a pattern
     which stops early has passed a broken build. */
  const rise = src.split('\n').find((l) => l.includes('translateY:'));
  if (!rise) {
    problems.push('không tìm thấy translateY của thân — luật độ sâu nhịp thở hỏng');
  } else if (/\d/.test(rise.replace(/\.value/g, '').replace(/\[0,\s*1\]/g, ''))) {
    problems.push(`độ sâu nhịp thở là số gõ cứng (${rise.trim()}) — ngủ và tỉnh sẽ nhô lên bằng nhau`);
  }
  /* And it has to be a shared value, or the worklet freezes it on the first
     render and the depth never changes again — `tools/measured-worklet.mjs`. */
  if (!/const travel = useSharedValue\(/.test(src)) {
    problems.push('độ sâu nhịp thở không phải shared value — worklet sẽ đóng băng giá trị đầu tiên');
  }
}

if (problems.length) {
  console.log('nhịp thở của Koa:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  `nhịp thở Koa OK — cả ${EMOTIONS.length} cảm xúc đều có mức tỉnh táo và một kiểu cử động hợp lệ; ` +
    'ngủ/mệt/lo/tự hào/bình thường KHÔNG còn cử động giống nhau (trước đây giống hệt); ' +
    'ngủ thở chậm nhất, mệt lử thì không bồng bềnh chút nào, lo thì thở nhanh mà không gục; ' +
    'thang tỉnh táo dẫn thẳng tới độ sâu và tốc độ nhịp thở; "đang có thứ chờ bạn" chỉ là một gợi ý ' +
    'chứ không phải màn diễn, và không đánh thức nhân vật đang ngủ; ' +
    'lần đọc trạng thái đầu tiên là mốc chứ không phải một thay đổi, hai trạng thái sát nhau không sinh cử động, ' +
    'lên và xuống cùng khoảng thì cùng biên độ; và không có hẹn giờ nào sinh ra chuyển động — ' +
    'cú lộn 360° chỉ xảy ra khi người dùng chạm',
);
