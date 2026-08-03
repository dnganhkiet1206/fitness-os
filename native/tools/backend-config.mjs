/**
 * Keep the backend addressable from exactly one file.
 *
 * ── what went wrong ──
 *
 * The project URL was written out twice: in the Supabase client, and in
 * `ai-coach.tsx`, which streams and so builds its own function URL. Swapping
 * projects meant finding both. Miss the second and the app reads and writes
 * against the new project while the coach talks to the old one — no error, no
 * warning, just an assistant answering from someone else's data.
 *
 * The same file also read the anon key as
 * `process.env.EXPO_PUBLIC_SUPABASE_KEY ?? ''`. With no `.env` that is an empty
 * string, so on a fresh clone every feature worked except the coach, which
 * answered 401. That looks like a broken coach and is a missing key.
 *
 * ── the two rules ──
 *
 * 1. A Supabase project URL may appear only in `src/lib/backend.ts`.
 * 2. `supabase.functions.invoke` may be called only from `src/lib/ai.ts`, so
 *    every AI call classifies its own failure. A call site that invokes
 *    directly goes back to `catch {}` and one message for four causes.
 *
 * Both are about the same thing: when the real project is connected, the wiring
 * should be one edit and any mistake should say what it is.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(NATIVE, 'src');

const URL_RE = /https:\/\/[a-z0-9]+\.supabase\.co/g;
const INVOKE_RE = /functions\s*\.\s*invoke\s*\(/g;

const URL_HOME = path.join('src', 'lib', 'backend.ts');
const INVOKE_HOME = path.join('src', 'lib', 'edge.ts');

/**
 * Prove the patterns still match before trusting a clean run.
 *
 * A check that has quietly stopped matching anything reports success, which is
 * indistinguishable from a healthy codebase and much worse. These are the exact
 * lines that used to be in the tree.
 */
const SELF_TEST = [
  [URL_RE, "const CHAT_URL = 'https://drqgonxrtmomgrftelih.supabase.co/functions/v1/ai-coach';", true],
  [URL_RE, "const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;", false],
  [INVOKE_RE, "await supabase.functions.invoke('ai-meal-suggest', {", true],
  [INVOKE_RE, 'await callEdge(EDGE_FUNCTIONS.mealSuggest, { lang });', false],
];
for (const [re, line, shouldFlag] of SELF_TEST) {
  if (new RegExp(re.source).test(line) !== shouldFlag) {
    console.error(`tự kiểm tra hỏng: ${JSON.stringify(line)}`);
    process.exit(1);
  }
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const problems = [];
for (const file of walk(SRC)) {
  const rel = path.relative(NATIVE, file);
  const text = readFileSync(file, 'utf8');
  // Comments explain the rule and must not trip it.
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const at = (i) => `${rel}:${text.slice(0, i).split('\n').length}`;

  if (rel !== URL_HOME) {
    for (const m of code.matchAll(URL_RE)) {
      problems.push(`${at(m.index)}  URL dự án nằm ngoài ${URL_HOME}: ${m[0]}`);
    }
  }
  if (rel !== INVOKE_HOME) {
    for (const m of code.matchAll(INVOKE_RE)) {
      problems.push(`${at(m.index)}  gọi thẳng functions.invoke — dùng callEdge() trong ${INVOKE_HOME}`);
    }
  }
}

if (problems.length) {
  console.error('cấu hình backend bị phân tán:\n');
  for (const p of problems) console.error(`  ${p}`);
  console.error('\nxem đầu tools/backend-config.mjs');
  process.exit(1);
}

console.log(`backend OK — địa chỉ chỉ ở ${URL_HOME}, mọi lời gọi AI qua ${INVOKE_HOME}`);
