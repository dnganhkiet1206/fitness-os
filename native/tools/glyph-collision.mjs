/**
 * That no two things on the assistant page wear the same badge.
 *
 * ── the bug this was written for ──
 *
 * The weekly-review tool shipped with `glyph: 'gauge'`. The readiness metric,
 * eight tiles above it on the same screen, is also `gauge`. Both are drawn from
 * `GLYPH_TINT`, so both came out the same green speedometer in the same green
 * ring — one meaning *your readiness score*, one meaning *your week* — and the
 * only way to tell them apart was to read the label underneath.
 *
 * That is precisely what the tools grid grew hints to avoid, and it was
 * reported by a person looking at the screen for one second. It was invisible
 * in the diff, because the diff is one line naming one glyph and the collision
 * lives in a nineteen-entry table in another file that has no idea which page
 * renders which entry.
 *
 * ── the rule is not "no duplicates" ──
 *
 * Two of the repeats are the point. The heart metric is today's heart rate and
 * the heart tool opens `/biometrics`, which is where that number comes from;
 * the moon metric is last night and the moon tool opens `/sleep-insights`. In
 * both cases the same glyph twice is a *pairing* — the tile is the door to the
 * number above it — and taking that away would make the page worse.
 *
 * So a repeat has to be declared, with the two routes it joins, and the check
 * verifies the pairing is real rather than taking the word for it: the tool in
 * the pair must actually push the route named, and the metric must actually be
 * the metric named. A pairing that stops being true fails here instead of
 * quietly licensing a fresh collision under an old excuse.
 *
 * Everything else — any glyph appearing twice without a declared pairing — is
 * the bug.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(NATIVE, p), 'utf8');

/** comments stripped, so a note that quotes a glyph name is not an entry */
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/**
 * The repeats that are deliberate, and what makes each one true.
 *
 * `tool` is the tool entry's `key`, `route` the screen it must open, `metric`
 * the metric entry's `key`. All three are checked — see the note above for why
 * an unverified allowlist is just a comment.
 */
const PAIRED = {
  heart: { tool: 'bio', route: '/biometrics', metric: 'hr' },
  moon: { tool: 'sleep', route: '/sleep-insights', metric: 'sleep' },
};

/**
 * Every `glyph: '…'` on the page, with the entry's own `key` beside it.
 *
 * Both `TOOLS` and `metrics` write `key` before `glyph` on the same entry, so
 * one pattern reads both. The `Tool`/`Metric` interface declarations say
 * `glyph: GlyphName` with no quotes and are skipped by the quote in the
 * pattern.
 */
function entries(src) {
  const out = [];
  for (const m of src.matchAll(/key:\s*'([^']+)',\s*\n?\s*glyph:\s*'([^']+)'/g)) {
    out.push({ key: m[1], glyph: m[2] });
  }
  return out;
}

function collisions(src) {
  const bad = [];
  const byGlyph = new Map();
  for (const e of entries(src)) {
    if (!byGlyph.has(e.glyph)) byGlyph.set(e.glyph, []);
    byGlyph.get(e.glyph).push(e.key);
  }

  for (const [glyph, keys] of byGlyph) {
    if (keys.length < 2) continue;
    const pair = PAIRED[glyph];
    if (!pair) {
      bad.push(
        `glyph '${glyph}' dùng cho ${keys.length} mục trên cùng một trang (${keys.join(', ')}) — ` +
          'cùng hình, cùng màu, chỉ khác dòng chữ bên dưới. Đổi glyph, hoặc khai báo cặp trong PAIRED nếu hai mục thật sự cùng một chủ đề',
      );
      continue;
    }
    if (keys.length > 2) {
      bad.push(`glyph '${glyph}' khai báo là một cặp nhưng có ${keys.length} mục dùng: ${keys.join(', ')}`);
      continue;
    }
    for (const want of [pair.tool, pair.metric]) {
      if (!keys.includes(want)) {
        bad.push(`cặp '${glyph}' khai báo gồm '${want}', nhưng trang dùng glyph này cho: ${keys.join(', ')}`);
      }
    }
    // the pairing's claim is that the tool opens the metric's own screen
    if (!new RegExp(`key:\\s*'${pair.tool}'[^\\n]*route:\\s*'${pair.route}`).test(src)) {
      bad.push(`cặp '${glyph}' nói tool '${pair.tool}' mở ${pair.route}, nhưng nó không mở`);
    }
  }
  return bad;
}

/*
  The self-test runs on a page written here, not on the real one.

  The first version rebuilt the bug by swapping `'calendar'` back to `'gauge'`
  in the live source — and that made the tool *unable to report the very bug it
  was written for*. Sabotage the real page and the reconstruction finds no
  `'calendar'` to swap, so the self-test bails with "cannot rebuild the broken
  version" and the actual collision is never printed. It exits non-zero either
  way, which is why it looked fine; the message is the wrong one, and a check
  that names the wrong fault is a check somebody debugs for an hour.

  A fixture has no such coupling: it proves the rule catches a collision,
  catches a pairing whose claim has stopped being true, and stays quiet on a
  page where the two real pairings are present and honest.
*/
{
  const good = [
    "const TOOLS = [",
    "  { key: 'week', glyph: 'calendar', route: '/weekly-review' },",
    "  { key: 'bio', glyph: 'heart', route: '/biometrics' },",
    "  { key: 'sleep', glyph: 'moon', route: '/sleep-insights' },",
    "];",
    "const metrics = [",
    "  { key: 'hr', glyph: 'heart' },",
    "  { key: 'sleep', glyph: 'moon' },",
    "  { key: 'readiness', glyph: 'gauge' },",
    "];",
  ].join('\n');

  const cases = [
    ['cặp có thật vẫn được đi qua', good, false],
    ['glyph trùng không khai báo', good.replace("glyph: 'calendar'", "glyph: 'gauge'"), true],
    ['cặp khai báo nhưng route đã đổi', good.replace("'/sleep-insights'", "'/steps'"), true],
    ['glyph trùng ba mục', good.replace("glyph: 'gauge'", "glyph: 'heart'"), true],
  ];

  const wrong = cases.filter(([, src, shouldFail]) => (collisions(src).length > 0) !== shouldFail);
  if (wrong.length) {
    console.log(`tự kiểm tra hỏng — sai ở: ${wrong.map(([l]) => l).join(', ')}, đừng tin kết quả`);
    process.exit(2);
  }
}

const src = strip(read('src/app/(tabs)/assistant.tsx'));
const problems = collisions(src);
if (problems.length) {
  for (const p of problems) console.log(`• ${p}`);
  process.exit(1);
}

const all = entries(src);
const pairs = Object.keys(PAIRED).length;
console.log(
  `hình huy hiệu OK — ${all.length} mục trên trang trợ lý, ${new Set(all.map((e) => e.glyph)).size} hình; ` +
    `${pairs} cặp trùng có chủ đích và cả hai đều được kiểm là thật (tool mở đúng màn của chỉ số nó đứng cạnh); ` +
    '4 ca tự kiểm chạy trên trang mẫu (trùng không khai báo, cặp sai route, trùng ba mục — đều bị bắt; trang đúng thì im)',
);
