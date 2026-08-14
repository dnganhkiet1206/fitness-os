/**
 * That every face Koa can be asked for is a face.
 *
 * ── the risk this covers ──
 *
 * Expressions are no longer only what the design sheet drew. `plead` was added
 * by combining layers the sheet never combined — sad brows and a turned-down
 * mouth over wide open eyes — and that is a good way to widen a character
 * cheaply, with one failure mode that is silent: a combination that switches
 * **nothing** on. `koaFlags` is a wall of `e === '…'` tests, so an expression
 * whose name appears in the type and in no test compiles, renders, and draws a
 * blank head. Nothing throws. The character just stops having a face.
 *
 * The second failure is subtler and was met the same afternoon: two names for
 * one drawing. `rested` and `idle` came out identical in a still frame, and the
 * peek that used them is a still frame for all practical purposes — one second
 * against a nine second wink cycle. Two quests were "reacting differently" with
 * the same picture.
 *
 * ── what is and is not checked here ──
 *
 * Structure only: every expression drives at least one eye layer and one mouth
 * layer, and no two expressions produce the same set of layers. Whether two
 * different sets *look* different is not a thing a regex can know — that is
 * `tools/koa-studio/faces.mjs`, which draws them side by side, and it is how
 * both of the above were actually found.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(NATIVE, p), 'utf8');
const problems = [];

const out = mkdtempSync(path.join(tmpdir(), 'koa-face-'));
execFileSync(
  'npx',
  ['tsc', 'src/components/ascnd/koa/koa-flags.ts', '--ignoreConfig', '--outDir', out,
   '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
  { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
);
const { koaFlags, KOA_EXPRESSIONS } = createRequire(import.meta.url)(path.join(out, 'koa-flags.js'));

/** the layer groups a face is made of */
const EYES = ['eyesOpen', 'eyesWide', 'eyesArc', 'eyesStar', 'lidsHalf', 'lidsWink', 'lidsHeavy', 'lidsSad'];
const MOUTH = ['mouthSmile', 'mouthGrin', 'mouthO', 'mouthSmirk', 'mouthFrown', 'mouthFlat', 'mouthShout', 'mouthGrit'];
const BROW = ['browArc', 'browRaised', 'browSad', 'browAngry', 'browStrain'];
const FACE = [...EYES, ...MOUTH, ...BROW];

/** the face part of an expression's flags, as a comparable string */
const faceOf = (key) => {
  const f = koaFlags(key, 'idle', {});
  return FACE.filter((k) => f[k] === true).join('+');
};

const seen = new Map();
for (const { key } of KOA_EXPRESSIONS) {
  const f = koaFlags(key, 'idle', {});
  if (!EYES.some((k) => f[k] === true)) {
    problems.push(`${key}: không bật lớp mắt nào — sẽ vẽ ra một cái đầu không mặt`);
  }
  if (!MOUTH.some((k) => f[k] === true)) {
    problems.push(`${key}: không bật lớp miệng nào`);
  }
  const sig = faceOf(key);
  if (seen.has(sig)) {
    problems.push(`${key} và ${seen.get(sig)} bật đúng cùng một bộ lớp — hai cái tên cho một khuôn mặt`);
  } else {
    seen.set(sig, key);
  }
}

/* ── every emotion the app can ask for resolves to a real expression ── */
const emotions = [...read('src/lib/mascot-emotion.ts').matchAll(/^\s*\|\s*'(\w+)'/gm)].map((m) => m[1]);
const states = read('src/lib/koa-emotion.ts');
const known = new Set(KOA_EXPRESSIONS.map((e) => e.key));
for (const e of emotions) {
  const row = states.match(new RegExp(`\\b${e}: \\{[^}]*expression: '(\\w+)'`));
  if (!row) {
    problems.push(`cảm xúc ${e} không có trong bảng koa-emotion — sẽ rơi về idle mà không ai biết`);
  } else if (!known.has(row[1])) {
    problems.push(`cảm xúc ${e} trỏ tới biểu cảm '${row[1]}' không tồn tại`);
  }
}

/* ── self-test, on the real function with a made-up name ──
   An expression the flag wall has never heard of is exactly the shape of the
   bug: `koaFlags` answers happily and every face layer comes back false. */
{
  const ghost = koaFlags('khong-ton-tai', 'idle', {});
  if (FACE.some((k) => ghost[k] === true)) {
    problems.push('tự kiểm: một biểu cảm không tồn tại vẫn bật được lớp mặt — luật này vô nghĩa');
  }
  const dup = faceOf('sad') === faceOf('plead');
  if (dup) problems.push('tự kiểm: sad và plead ra cùng một bộ lớp, đáng lẽ phải khác');
}

if (problems.length) {
  console.log('khuôn mặt linh vật:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  `khuôn mặt OK — ${KOA_EXPRESSIONS.length} biểu cảm, cái nào cũng có mắt và miệng, ` +
    `không cái nào trùng bộ lớp với cái nào; ${emotions.length} cảm xúc đều trỏ tới biểu cảm có thật; ` +
    'một biểu cảm bịa ra thì mọi lớp mặt đều tắt (đúng hình dạng của lỗi này)',
);
