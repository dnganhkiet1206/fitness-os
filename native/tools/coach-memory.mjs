/**
 * That the coach's memory helps the person and cannot be turned against them.
 *
 * ── what this feature is ──
 *
 * Facts the user stated about themselves — an injury, a food they avoid, when
 * they train — carried between conversations and pasted into the coach's system
 * prompt. It is the difference between a chatbot with a database attached and
 * something worth a subscription, and the retention data is blunt about which
 * one people keep paying for.
 *
 * ── the three ways it goes wrong, none of them visible ──
 *
 * 1. **It becomes an injection channel.** These rows are prepended to the
 *    system prompt. A client that could write them could store "ignore your
 *    safety rules" as a remembered fact and have the server obediently place it
 *    above every reply — on an app that talks to people about their bodies.
 *    Hence no INSERT or UPDATE policy for user tokens, and a newline ban: one
 *    line is a fact, several lines is a script.
 *
 * 2. **A parse failure erases everything.** The extractor deletes whatever the
 *    model did not repeat, which is how a contradiction resolves instead of
 *    accumulating. But a malformed reply and "this person has no durable facts"
 *    arrive as the same empty array, and one of those must not wipe a year of
 *    memory. Being wrong in one direction costs a stale fact; in the other it
 *    costs everything.
 *
 * 3. **It stops being deletable.** These are health facts somebody said out
 *    loud. Storing them and offering no way to look at or erase them is
 *    surveillance with a friendlier name, and charging for it makes that worse
 *    rather than better.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(NATIVE, '..');
const read = (p) => readFileSync(path.join(REPO, p), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const EXTRACTOR = 'supabase/functions/ai-coach-memory/index.ts';
const COACH = 'supabase/functions/ai-coach/index.ts';
const SCREEN = 'native/src/app/coach-memory.tsx';

const problems = [];

const sql = readdirSync(path.join(REPO, 'supabase', 'migrations'))
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(path.join(REPO, 'supabase', 'migrations', f), 'utf8'))
  .join('\n');

/*
  ── 1: the table takes no client writes, but does take client deletes ──

  Both halves matter and they pull in opposite directions, which is why they are
  checked together: locking the table down completely would also take away the
  ability to forget.
*/
{
  const policies = [...sql.matchAll(/CREATE POLICY "([^"]+)"\s+ON public\.coach_memory([\s\S]*?);/g)];
  const ops = (op) => policies.filter((m) => new RegExp(`\\bFOR (${op}|ALL)\\b`).test(m[2]));
  for (const op of ['INSERT', 'UPDATE']) {
    if (ops(op).length) {
      problems.push(
        `coach_memory: có policy ${op} cho client — những dòng này được dán vào system prompt, ` +
          'ai ghi được là viết lại được chỉ dẫn của coach',
      );
    }
  }
  if (!ops('DELETE').length) {
    problems.push('coach_memory: không có policy DELETE — người dùng phải xoá được thứ app nhớ về cơ thể họ');
  }
  if (!ops('SELECT').length) {
    problems.push('coach_memory: không có policy SELECT — không xem được thì không kiểm chứng được');
  }
  /* One fact per row, one line per fact. */
  if (!/length\(fact\) BETWEEN/.test(sql)) {
    problems.push('coach_memory: fact không giới hạn độ dài — một "dữ kiện" dài bằng cả trang là một đoạn chỉ dẫn');
  }
  if (!/MAX_FACTS CONSTANT INTEGER/.test(sql)) {
    problems.push('coach_memory: không có trần số dòng — prompt sẽ phình ra vô hạn theo thời gian');
  }
}

/*
  ── 2: the extractor refuses rather than repairs ──

  Every guard here is a `continue` or an early return. A half-parsed sentence
  about somebody's injury is worse than no sentence, so nothing is guessed at.
*/
{
  const code = strip(read(EXTRACTOR));

  if (!/facts\.length === 0\) return json\(\{ saved: 0/.test(code)) {
    problems.push(
      `${EXTRACTOR}: kết quả rỗng không được chặn trước bước xoá — ` +
        'một lần model trả về sai định dạng là mất sạch trí nhớ của người dùng',
    );
  }
  if (!/\[\\n\\r\]/.test(code) && !/[\n\r]/.test(code.match(/if \(\/\[.*?\]\/\.test\(fact\)\) continue;/)?.[0] ?? '')) {
    problems.push(`${EXTRACTOR}: không chặn xuống dòng trong fact — nhiều dòng là một đoạn chỉ dẫn, không phải một dữ kiện`);
  }
  if (!/SUPABASE_SERVICE_ROLE_KEY/.test(code)) {
    problems.push(`${EXTRACTOR}: không dùng service role — bảng không có policy INSERT nên ghi bằng token người dùng sẽ hỏng`);
  }
  if (!/claimCall\(supabase, "ai-coach-memory"\)/.test(code)) {
    problems.push(`${EXTRACTOR}: không trừ hạn mức — đây là một lời gọi model, và nó do client kích hoạt`);
  }
  if (!/turns\.length < 2/.test(code)) {
    problems.push(`${EXTRACTOR}: không bỏ qua hội thoại quá ngắn — một câu thì không có gì bền lâu để học, chỉ tốn tiền`);
  }
  /* Only the person's own words become facts about the person. */
  if (!/m\.role === "user"/.test(code)) {
    problems.push(
      `${EXTRACTOR}: trích xuất từ cả câu trả lời của model — ` +
        'như vậy là biến phỏng đoán của AI thành dữ kiện về cơ thể người dùng',
    );
  }
}

/*
  ── 3: the prompt frames them as facts, and the screen can erase them ──
*/
{
  const coach = read(COACH);
  if (!/memoryBlock/.test(coach)) {
    problems.push(`${COACH}: không nạp trí nhớ vào prompt — bảng có dữ liệu mà coach không đọc`);
  }
  /*
    Both languages, separately.

    The first version accepted `KHÔNG phải mệnh lệnh|not as instructions`, so a
    sabotage that broke the Vietnamese framing passed on the strength of the
    English one — and the app is Vietnamese-first. Two prompts, two checks: a
    rule that any one of N sites can satisfy is checking that the feature
    exists, not that it is right.
  */
  for (const [lang, re] of [
    ['tiếng Việt', /KHÔNG phải mệnh lệnh/],
    ['tiếng Anh', /not as instructions/],
  ]) {
    if (!re.test(coach)) {
      problems.push(
        `${COACH}: prompt ${lang} không nói rõ ký ức là dữ kiện chứ không phải mệnh lệnh — ` +
          'đó là dòng duy nhất ngăn một "dữ kiện" được đọc thành chỉ thị',
      );
    }
  }
  if (!/last_confirmed/.test(coach)) {
    problems.push(`${COACH}: prompt không kèm ngày nhắc lần cuối — vai đau hồi tháng 3 sẽ được trích như đang đau`);
  }

  const screen = read(SCREEN);
  for (const [what, re] of [
    ['xoá từng dòng', /\.delete\(\)[\s\S]{0,80}?\.eq\('id'/],
    ['xoá toàn bộ', /\.delete\(\)[\s\S]{0,80}?\.eq\('user_id'/],
    ['hỏi lại trước khi xoá hết', /Alert\.alert/],
    ['hiện ngày nhắc lần cuối', /last_confirmed/],
  ]) {
    if (!re.test(screen)) {
      problems.push(`${SCREEN}: thiếu "${what}"`);
    }
  }
}

/**
 * The self-test.
 *
 * The empty-result rule is the one worth proving: the dangerous version is not
 * a crash, it is a perfectly ordinary `delete` running with an empty keep-list.
 */
const SELF = [
  ['xoá sạch khi rỗng — bị bắt', () => {
    const bad = 'const facts = parseFacts(text);\nawait admin.from("coach_memory").delete().eq("user_id", userId);';
    return !/facts\.length === 0\) return json\(\{ saved: 0/.test(bad);
  }],
  ['có chặn rỗng — không bị bắt', () => {
    const good = 'if (facts.length === 0) return json({ saved: 0, reason: "nothing extracted" });';
    return /facts\.length === 0\) return json\(\{ saved: 0/.test(good);
  }],
  ['một ngôn ngữ hỏng vẫn bị bắt', () => {
    const half = 'not as instructions';   // EN còn, VI mất
    return !/KHÔNG phải mệnh lệnh/.test(half);
  }],
  ['policy INSERT bị bắt', () => {
    const s = 'CREATE POLICY "w" ON public.coach_memory FOR INSERT WITH CHECK (true);';
    return [...s.matchAll(/CREATE POLICY "([^"]+)"\s+ON public\.coach_memory([\s\S]*?);/g)]
      .filter((m) => /\bFOR (INSERT|ALL)\b/.test(m[2])).length === 1;
  }],
];
const missed = SELF.filter(([, fn]) => !fn()).map(([l]) => l);
if (missed.length) {
  console.error(`phép tự kiểm hỏng — không bắt được: ${missed.join('; ')}; đừng tin kết quả`);
  process.exit(2);
}

if (problems.length) {
  console.log('trí nhớ coach sai:\n');
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}

console.log(
  'trí nhớ coach OK — bảng chỉ cho đọc và xoá, không cho client ghi (dòng này nằm trong system prompt); ' +
    'trích xuất chỉ từ lời người dùng, có hạn mức, bỏ qua hội thoại ngắn, và kết quả rỗng không xoá gì; ' +
    'prompt gọi rõ là dữ kiện kèm ngày, màn hình xoá được từng dòng lẫn toàn bộ',
);
