/**
 * That an AI feature answers in the language the app is set to.
 *
 * ── the bug this was written for ──
 *
 * "Today's insight" kept coming back in Vietnamese with the app in English. The
 * wiring was all correct and that is what made it hard to see: the client reads
 * `lang` from the settings context, `lang` is part of the query key so switching
 * language starts a fresh fetch rather than reusing a cached one, and the
 * request body carries it. Four files, all right.
 *
 * The fault was one sentence's position. `ai-smart-nudges` was the only one of
 * the four prompts that did not open by naming the output language: its English
 * branch began "You are an AI habit-reminder assistant. Based on the user's
 * data…" and the only mention of English was a clause tacked onto the last
 * bullet of ten — *"Do not give medical advice in any form. All text in
 * English."* The Vietnamese branch said nothing at all, and worked by accident,
 * because a prompt written in Vietnamese usually gets Vietnamese back.
 *
 * The other three all open with it — "Reply in English", "Trả lời bằng tiếng
 * Việt" — which is why only this one drifted.
 *
 * ── what is checked ──
 *
 * For every edge function that takes a `lang`:
 *
 *   1. it reads `lang` from the request, and defaults it rather than trusting
 *      whatever arrives
 *   2. it branches on `lang === "en"` — one prompt with the language pasted in
 *      is not the same thing, and none of these are built that way
 *   3. **both** branches name the output language inside the first sentence,
 *      where a model reads the instruction rather than skimming past it
 *
 * Point 3 is the rule; 1 and 2 are there so a function cannot pass it by having
 * no branches to check.
 *
 * The Vietnamese half matters as much as the English one. It is currently
 * carried by the prompt's own language, which is not an instruction — it is a
 * habit that happens to work, and the moment a prompt is drafted in English and
 * translated it stops working, in exactly the way this bug did.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FUNCTIONS = path.join(ROOT, 'supabase', 'functions');

/**
 * What counts as "up front": the prompt's opening paragraph, everything before
 * the first blank line.
 *
 * A character budget was the first version and it is the wrong measure — the
 * shipped bug put "All text in English" at the end of a ten-bullet list, which
 * lands at a different offset in every prompt, so any number is either too
 * generous for one function or too strict for another. The paragraph is a thing
 * the prompt actually has: every one of these opens with a role sentence and
 * then a blank line before the data block, and all four of the correct ones name
 * the language inside that first paragraph.
 */
const opening = (prompt) => prompt.split(/\n\s*\n/)[0];

/**
 * What naming the language looks like, in each direction.
 *
 * The phrase and not the verb around it. A first version tried to require a
 * verb — reply / respond / write / all text — and immediately mis-fired on
 * `ai-weekly-review`, which says "give observations + suggestions **in
 * English**". Four correct prompts phrase this four different ways; what they
 * share is the two words that name the language, and that is the whole of what
 * the rule is about.
 */
const SAYS_EN = /\bin english\b/i;
const SAYS_VI = /bằng tiếng việt/i;

/**
 * The opening paragraph of each branch of a `lang === "en" ? \`…\` : \`…\``.
 *
 * ── it never looks for where a prompt ends ──
 *
 * The first version paired backticks: take the four after the ternary and slice
 * between them. That is wrong on the biggest prompt in the repo. `ai-coach`
 * interpolates `${memoryBlock ? \`…\` : ""}` *inside* its English prompt, so the
 * second backtick found is the nested one and the "English branch" came out as
 * a fragment — and the tool reported the app's main coach prompt as missing an
 * instruction that is in its first sentence. A rule whose first run accuses the
 * correct code is worse than no rule.
 *
 * Only the opening paragraph is ever needed, so the end of the literal is not
 * something this has to find. Each branch is located by its own delimiter at
 * the *start of a line* — which is how these ternaries are formatted and how
 * nested inline ones are not — and read forward to the first blank line.
 *
 * ── and it only covers the two-prompt design ──
 *
 * `scan-food` builds one prompt and interpolates the language into a bullet.
 * That is a different design, not a broken one, and requiring the newline
 * before the `?` leaves it out rather than demanding it be rewritten to satisfy
 * a rule written about something else.
 */
function branches(src) {
  const start = src.search(/lang === ["']en["']\s*\n\s*\?\s*`/);
  if (start < 0) return null;
  const rest = src.slice(start);

  const enAt = rest.indexOf('`');
  const viRel = rest.search(/\n\s*:\s*`/);
  if (viRel < 0) return null;
  const viAt = rest.indexOf('`', viRel);

  return { en: opening(rest.slice(enAt + 1)), vi: opening(rest.slice(viAt + 1)) };
}

function problems(name, src) {
  const bad = [];

  if (!/\blang\b/.test(src)) return bad; // not a translated function at all

  if (!/lang\s*=\s*["']vi["']|lang\s*=\s*body\?\.lang|body\?\.lang\s*===\s*["']en["']/.test(src)) {
    bad.push(`${name}: đọc lang nhưng không có giá trị mặc định — thân request thiếu lang là rơi vào undefined`);
  }

  const b = branches(src);
  // one-prompt designs (scan-food interpolates the language into a bullet) are
  // a different shape and out of scope — see the note on `branches`
  if (!b) return bad;

  if (!SAYS_EN.test(b.en)) {
    bad.push(
      `${name}: nhánh tiếng Anh không nói rõ ngôn ngữ trả lời ngay ở đoạn mở đầu — ` +
        'câu "All text in English" nằm ở cuối bullet thứ mười là chỗ model đọc lướt qua, và đó chính là lỗi insight tiếng Việt',
    );
  }
  if (!SAYS_VI.test(b.vi)) {
    bad.push(
      `${name}: nhánh tiếng Việt không nói rõ ngôn ngữ trả lời ngay ở đoạn mở đầu — ` +
        'nó đang chạy đúng chỉ nhờ prompt tình cờ viết bằng tiếng Việt, không phải nhờ một câu lệnh',
    );
  }
  return bad;
}

/* Fixtures, not the live files: a self-test that rebuilds the bug by editing
   the real source cannot report that same bug when it is really there.

   They mirror the real prompts' *shape*, which is the part the rule depends on
   — a role sentence, a blank line, the data block, a blank line, then the
   bullets. A first draft of this fixture ran the bullets on from the role
   sentence with no blank line between them, which put "All text in English"
   inside the opening paragraph and made the shipped bug look fine. The fixture
   has to be wrong in the same way the code was. */
{
  const build = (role, bullets) =>
    `${role}\n\nDATA: {}\n\nPRINCIPLES:\n${bullets.map((b) => `- ${b}`).join('\n')}`;
  const fn = (en, vi) => `const { lang = "vi" } = await req.json();\nconst x = lang === "en"\n  ? \`${en}\`\n  : \`${vi}\`;`;

  const EIGHT = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

  const good = fn(
    build('You are an AI habit-reminder assistant. Reply in English. Create 2-4 nudges.', EIGHT),
    build('Bạn là AI nhắc thói quen. Trả lời bằng tiếng Việt. Tạo 2-4 gợi ý.', EIGHT),
  );
  /* exactly what shipped: English named only in the last bullet, in a paragraph
     of its own two blank lines down, and Vietnamese never named at all */
  const shipped = fn(
    build('You are an AI habit-reminder assistant. Create 2-4 nudges.', [
      ...EIGHT,
      'Do not give medical advice in any form. All text in English.',
    ]),
    build('Bạn là AI nhắc thói quen. Tạo 2-4 gợi ý.', EIGHT),
  );
  /* one branch fixed, one not — the half-fix, which is the likeliest next
     mistake and must not read as clean */
  const halfFixed = fn(
    build('You are an AI habit-reminder assistant. Reply in English. Create 2-4 nudges.', EIGHT),
    build('Bạn là AI nhắc thói quen. Tạo 2-4 gợi ý.', EIGHT),
  );

  const cases = [
    ['prompt đúng vẫn đi qua', good, 0],
    ['bản đã ship (tiếng Anh nằm cuối, tiếng Việt không nói)', shipped, 2],
    ['sửa một nửa (chỉ nhánh tiếng Anh)', halfFixed, 1],
    ['thiết kế một prompt (scan-food) không bị đòi viết lại', 'const lang = body?.lang === "en" ? "en" : "vi";\nconst p = `names in ${lang}`;', 0],
  ];
  const wrong = cases.filter(([, src, n]) => problems('x', src).length !== n);
  if (wrong.length) {
    console.log(`tự kiểm tra hỏng — sai ở: ${wrong.map(([l]) => l).join(', ')}, đừng tin kết quả`);
    process.exit(2);
  }
}

if (!existsSync(FUNCTIONS)) {
  console.log('không tìm thấy supabase/functions — bỏ qua');
  process.exit(0);
}

const all = [];
const checked = [];
const paired = [];
for (const name of readdirSync(FUNCTIONS)) {
  const file = path.join(FUNCTIONS, name, 'index.ts');
  if (!existsSync(file)) continue;
  const src = readFileSync(file, 'utf8');
  if (!/\blang\b/.test(src)) continue;
  checked.push(name);
  if (branches(src)) paired.push(name);
  all.push(...problems(name, src));
}

if (all.length) {
  console.log('ngôn ngữ trả lời của AI sai:\n');
  for (const p of all) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  `ngôn ngữ AI OK — ${checked.length} edge function nhận lang; ${paired.length} cái dựng hai prompt theo lang ` +
    `(${paired.join(', ')}) và CẢ HAI nhánh đều nói rõ ngôn ngữ trả lời ngay ở đoạn mở đầu; ` +
    `${checked.length - paired.length} cái dùng thiết kế một prompt và nằm ngoài luật này có chủ đích; ` +
    'bản đã ship của ai-smart-nudges (tiếng Anh nằm ở cuối bullet thứ mười, tiếng Việt không nói) vẫn bị bắt',
);
