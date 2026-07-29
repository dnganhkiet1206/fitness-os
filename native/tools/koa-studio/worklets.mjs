/**
 * A worklet may only call other worklets.
 *
 * On the UI runtime, a plain module-level function reached from a worklet is a
 * *remote function*, and Reanimated throws the moment it gets there:
 *
 *   [Worklets] Tried to synchronously call a Remote Function.
 *   Called "clamp" on the UI Runtime.
 *
 * This is the one class of bug none of the other tools in here can see. They
 * all bundle the real modules and step them in Node, where a function call is
 * a function call — `gaze.mjs` ran `gazeAt` four thousand times, measured the
 * eyes to a tenth of a pixel, and could not have known the whole thing throws
 * on a phone. The room's rule is that "it looks fine" is not evidence; this is
 * the case where "it measures fine" is not evidence either.
 *
 * So this reads the source instead of running it: every function that carries
 * `'worklet'`, plus every callback Reanimated workletises for you
 * (`useAnimatedProps`, `useAnimatedStyle`, `useDerivedValue`,
 * `useFrameCallback`), checked against the module-level functions that do not.
 *
 *   node tools/koa-studio/worklets.mjs
 *
 * ── two ways this was wrong before it was right ──
 *
 * Both worth knowing, because both are the same mistake in different clothes:
 * looking *near* a thing instead of *at* it.
 *
 * The first version decided a function was a worklet if `'worklet'` appeared
 * in the 200 characters after its declaration — and the very bug it was
 * written to catch slipped through, because the doc-comment on the *next*
 * function happened to say the word. The second tried to find each body by its
 * opening brace, which is not where a body starts when the signature ends in
 * `): { x: number; y: number } {` or the parameter is destructured.
 *
 * So: comments are stripped first, and nothing is parsed that does not have to
 * be. A declaration is a worklet if the directive appears before the next
 * declaration; a worklet's *reach* is the enclosing block, found by scanning
 * back to the brace that opens it. Both directions are tested against the
 * original `clamp` bug on every run — see `--self-test`.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOTS = ['src/components/ascnd', 'src/hooks'];

function walkDir(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walkDir(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

/**
 * Comments out, offsets kept.
 *
 * Every comment becomes the same number of spaces (newlines preserved), so a
 * reported line number still points at the real line. Prose is the main source
 * of false readings here — this file's own comments would trip it twice over.
 */
function decomment(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
}

const DECL = /^(?:export )?(?:function (\w+)\s*[<(]|const (\w+)\s*=\s*(?:\([^)]*\)|\w+)\s*(?::[^=]*)?=>)/gm;
const AUTO = /use(?:AnimatedProps|AnimatedStyle|DerivedValue|FrameCallback)\b/g;
const DIRECTIVE = "'worklet';";

/** the balanced `{ … }` that *contains* `i`, found by scanning back to its brace */
function enclosing(s, i) {
  let d = 0;
  for (let k = i; k >= 0; k--) {
    if (s[k] === '}') d++;
    else if (s[k] === '{') {
      if (d === 0) return balanced(s, k, '{', '}');
      d--;
    }
  }
  return '';
}

/** the balanced group opening at `j` */
function balanced(s, j, open, close) {
  let d = 0;
  for (let k = j; k < s.length; k++) {
    if (s[k] === open) d++;
    else if (s[k] === close && --d === 0) return s.slice(j, k + 1);
  }
  return s.slice(j);
}

/** a call's argument list — the parens, skipping any `<…>` type argument */
function callArgs(s, i) {
  const j = s.indexOf('(', i);
  return j < 0 ? '' : balanced(s, j, '(', ')');
}

/**
 * Every module-level declaration in the file, and whether it is a worklet.
 *
 * A declaration owns the text up to the next one, which is where the directive
 * has to be. A plain function that merely *hosts* an inline worklet — every
 * component using `useAnimatedProps` — reads as a worklet by this rule; that
 * only ever loses a warning about calling it, and nothing calls a component
 * from a worklet.
 */
function declare(s) {
  DECL.lastIndex = 0;
  const found = [];
  for (let m; (m = DECL.exec(s)); ) found.push({ name: m[1] ?? m[2], at: m.index });
  const plain = new Set();
  for (let i = 0; i < found.length; i++) {
    const to = i + 1 < found.length ? found[i + 1].at : s.length;
    if (!s.slice(found[i].at, to).includes(DIRECTIVE)) plain.add(found[i].name);
  }
  return plain;
}

/** every stretch of code that runs on the UI runtime */
function worklets(s) {
  const out = [];
  for (let i = s.indexOf(DIRECTIVE); i >= 0; i = s.indexOf(DIRECTIVE, i + 1)) {
    out.push([i, enclosing(s, i)]);
  }
  AUTO.lastIndex = 0;
  for (let m; (m = AUTO.exec(s)); ) out.push([m.index, callArgs(s, m.index)]);
  return out;
}

function check(src) {
  const s = decomment(src);
  const plain = declare(s);
  const bad = [];
  if (plain.size === 0) return bad;
  for (const [at, body] of worklets(s)) {
    for (const n of plain) {
      if (new RegExp(`\\b${n}\\s*\\(`).test(body)) {
        bad.push({ line: s.slice(0, at).split('\n').length, name: n });
      }
    }
  }
  return bad;
}

/* ── the tool's own test ──────────────────────────────────────────────── */

const BROKEN = `
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** a comment that says 'worklet' and must not fool anything */
export function gazeAt(t: number): { x: number; y: number } {
  'worklet';
  const p = perchAt(t);
  if (p.k <= 0) return { x: 0, y: 0 };
  return { x: clamp(p.x, -1, 1), y: clamp(p.y, -1, 1) };
}
`;
const FIXED = BROKEN.replace(
  'return { x: clamp(p.x, -1, 1), y: clamp(p.y, -1, 1) };',
  'const x = p.x < -1 ? -1 : p.x; return { x, y: p.y };',
);

if (process.argv.includes('--self-test')) {
  const a = check(BROKEN);
  const b = check(FIXED);
  const ok = a.length === 1 && a[0].name === 'clamp' && b.length === 0;
  console.log(ok ? 'tự kiểm: bắt được lỗi clamp, và không báo nhầm sau khi sửa' : 'TỰ KIỂM HỎNG');
  process.exit(ok ? 0 : 1);
}

// a check that has never been seen to fail is not a check — so it proves
// itself on the bug it was written for before it says anything about the room
execFileSync('node', [fileURLToPath(import.meta.url), '--self-test'], { stdio: 'inherit' });

/* ── the room ─────────────────────────────────────────────────────────── */

let bad = 0;
let files = 0;
for (const root of ROOTS) {
  for (const f of walkDir(root)) {
    const src = readFileSync(f, 'utf8');
    if (!src.includes(DIRECTIVE) && !AUTO.test(src)) continue;
    files++;
    for (const { line, name } of check(src)) {
      console.log(`  ${f}:${line}  worklet gọi hàm thường \`${name}\``);
      bad++;
    }
  }
}

console.log(
  bad === 0
    ? `sạch — ${files} tệp có worklet, không tệp nào gọi ra ngoài`
    : `\n${bad} chỗ sẽ ném lỗi trên UI runtime`,
);
process.exit(bad === 0 ? 0 : 1);
