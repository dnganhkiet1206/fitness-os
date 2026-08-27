/**
 * A screen is in one language, not one and a half.
 *
 * ── the bug this pins down ──
 *
 * The two dictionaries are hand-maintained side by side, so a key added in a
 * hurry gets its English copied into the Vietnamese column and nobody notices —
 * the app runs, the text renders, and only a Vietnamese reader sees it.
 *
 * It had reached the tab bar. Two of the four labels were "Today" and
 * "Workouts" while the other two were "Dinh dưỡng" and "Tiến trình", and the
 * saved-workout cards read `1 Bài tập · Volume: 0 kg` — the app had a
 * Vietnamese word for volume (`nVolume`, "Khối lượng") and used the English one
 * three lines away.
 *
 * ── what is checked ──
 *
 * Every key the app actually renders whose Vietnamese is byte-identical to its
 * English has to be on the list below. The list is the point: plenty of terms
 * *should* stay in English — REM, RPE, kcal, Halal — and a check that flagged
 * them would be turned off within a week. Anything not on it is a translation
 * somebody forgot.
 *
 * Unused keys are ignored. The dictionaries are shared with the web app and a
 * string nobody renders is not a defect in this one.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(NATIVE, 'src');

/**
 * Terms that are the same word in both languages on purpose.
 *
 * Loan words the gym uses untranslated (set, rep, cardio, deload), units and
 * symbols (kcal, SpO₂, ms), medical initialisms (HRV, RMSSD, RPE, REM), and
 * proper nouns. Adding to this list is a decision; it should be an argument in
 * a commit message, not a quiet edit.
 */
const KEPT = new Set([
  'aiCoachTitle',            // product name
  'dcActivityKcal',          // unit
  'goalRecomp',              // gym loan word
  'logBioHRV',               // HRV RMSSD (ms)
  'logBioSpO2',              // SpO₂ (%)
  'logSleepDeep',            // sleep stages are named in English on watches
  'logSleepLight',
  'logSleepREM',
  'sleepDeep',
  'muscleCardio',
  'nWbTypeCardio',
  'nDeload',                 // gym loan word
  /*
    The name of a destination, chosen as a name rather than as a description.

    The training week used to be captioned "Lịch tập tuần" — a description of
    what is on the screen, which is why it read as a feature inside the workouts
    tab rather than as one of the places the app has. It is "Plan" in both
    languages for the same reason "Koa" is Koa in both: it is what the thing is
    called, and translating it would give the app two words for one place.
  */
  'nPlan',
  'nEmail',
  'nReps',                   // "reps" is what the gym says in Vietnamese too
  'nRdSet',                  // "Set {n}"
  'onboardingDietHalal',     // proper noun
  'nQuickProtein',           // only reachable from an unreferenced component
  /*
    Apple's own product name, and the one string on that card that must not be
    translated: the person is about to be shown an iOS permission sheet that
    says "Apple Health" in English regardless of the phone's language, and a
    card calling it something else is a card about a different app. The
    sentence explaining *why* is translated; the name is not.
  */
  'onboardingHealthTitle',
]);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** the `key: 'value',` pairs of one object literal, by its opening line */
function block(file, marker, stopAt) {
  const s = readFileSync(path.join(NATIVE, file), 'utf8');
  let body = s.slice(s.indexOf(marker) + marker.length);
  if (stopAt && body.includes(stopAt)) body = body.slice(0, body.indexOf(stopAt));
  const out = {};
  const re = /^ {2}(\w+): *(?:\n *)?'((?:[^'\\]|\\.)*)',$/gm;
  let m;
  while ((m = re.exec(body))) out[m[1]] = m[2];
  return out;
}

const en = {
  ...block('src/lib/i18n.ts', 'const en: Translations = {'),
  ...block('src/lib/native-strings.ts', 'const en = {', 'const vi: typeof en = {'),
};
const vi = {
  ...block('src/lib/i18n.ts', 'const vi: Translations = {', 'const en: Translations = {'),
  ...block('src/lib/native-strings.ts', 'const vi: typeof en = {'),
};

const source = walk(SRC)
  .map((p) => readFileSync(p, 'utf8'))
  .join('\n');

const problems = [];

// ── 1: nothing rendered is still in English by accident ──
const untranslated = [];
for (const [key, value] of Object.entries(en)) {
  if (key.startsWith('a11y')) continue;          // screen-reader text, English base
  if (KEPT.has(key)) continue;
  if (vi[key] !== value) continue;
  /* A value with no real word in it is not untranslated — "—", "1:30", "%".
     Placeholders are stripped first: `{win}` and `{gap}` are code identifiers
     that never reach a reader, so a template like `'{win} — {gap}'` is
     punctuation, and it is identical in both languages because a join is
     identical in both languages. Without this the rule reports the one string
     in the file that is *correct* to leave alone. */
  if (!/[A-Za-z]{3,}/.test(value.replace(/\{[^}]*\}/g, ''))) continue;
  if (!source.includes(`i18n.${key}`)) continue; // web-only keys are not this app's problem
  untranslated.push(`${key}: '${value}'`);
}
for (const u of untranslated) problems.push(`still English in Vietnamese — ${u}`);

// ── 2: the list earns its place ──
for (const key of KEPT) {
  if (!(key in en)) problems.push(`KEPT lists "${key}", which is not a string key any more`);
  else if (vi[key] !== en[key]) {
    problems.push(`KEPT lists "${key}", but it has been translated — drop it from the list`);
  }
}

// ── 3: the two columns describe the same app ──
for (const key of Object.keys(en)) {
  if (!(key in vi)) problems.push(`"${key}" has no Vietnamese at all`);
}

// ── 4: teeth. The tab bar's own label is the case that got through before, so
//    a copy of the pre-fix dictionary has to be rejected by rule 1. ──
const preFix = { ...vi, navToday: en.navToday, workoutsVolume: en.workoutsVolume };
const wouldCatch = ['navToday', 'workoutsVolume'].filter(
  (k) => preFix[k] === en[k] && !KEPT.has(k) && source.includes(`i18n.${k}`),
);
if (wouldCatch.length !== 2) {
  problems.push('rule 1 would no longer catch the tab bar — this check proves nothing');
}

if (problems.length) {
  console.error('dịch thuật CÓ LỖI:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(
  `dịch thuật OK — ${Object.keys(en).length} khoá, ${Object.keys(en).filter((k) => source.includes(`i18n.${k}`)).length} khoá được dùng trong app; ` +
    `không khoá nào còn tiếng Anh ngoài ${KEPT.size} từ giữ nguyên có chủ đích; ` +
    `bản trước khi sửa (tab bar + "Volume") vẫn bị bắt`,
);
