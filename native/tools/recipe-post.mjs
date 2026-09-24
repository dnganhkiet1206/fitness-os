/**
 * Bài RECIPE (#7) — CHẠY THẬT hàm đọc payload, trên những payload hỏng thật.
 *
 *     node tools/recipe-post.mjs
 *
 * ── vì sao chạy chứ không đọc mã ──
 *
 * `readRecipePayload` là cửa DUY NHẤT giữa một payload đi qua mạng và cache
 * persist (`JSON.stringify` → AsyncStorage) với thẻ trên feed của NGƯỜI KHÁC.
 * Thứ nó phải làm là một tính chất về GIÁ TRỊ — "đưa rác vào, ra một thẻ ít
 * hơn, không ra màn đỏ" — và tính chất về giá trị chỉ kiểm được bằng cách đưa
 * rác vào. Bài học có sẵn ở màn hướng dẫn: "Cannot read property 'map' of
 * undefined" xảy ra thật trên máy chủ dự án vì đúng loại payload lệch hình này.
 *
 * ── ba tính chất nó canh ──
 *
 *   1. KHÔNG NÉM, với mọi hình dạng payload.
 *   2. SỐ TRÊN THẺ = TỔNG CÁC DÒNG, kể cả khi trường tổng trên payload nói dối.
 *      "Thêm vào bữa ăn" ghi CÁC DÒNG — nên đây là tính chất "thấy gì thì ghi
 *      nấy", và `toPlannedFoods` được chạy để chứng minh nó.
 *   3. KHÔNG BỊA KHỐI LƯỢNG: không biết thì `null`, không bao giờ "100 g".
 *
 * Và một vế canh chính dữ liệu giả: fixture Recipe trong `live-world.mjs` phải
 * giữ tính chất 2 — một fixture lệch sẽ dạy harness chấp nhận đúng lỗi ấy.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
let CASES = 0;
const note = (label, ok, why) => {
  CASES++;
  if (!ok) problems.push(`${label} — ${why}`);
};

const out = mkdtempSync(path.join(tmpdir(), 'recipe-post-'));
let mod;
try {
  execFileSync(
    'npx',
    ['tsc', 'src/lib/recipe-post.ts', '--ignoreConfig', '--outDir', out,
      '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: 'pipe' },
  );
  mod = await import(path.join(out, 'recipe-post.js'));
} catch (e) {
  console.error('bài Recipe CÓ LỖI:\n');
  console.error(`  • không biên dịch được \`lib/recipe-post.ts\`: ${e.message.split('\n')[0]}`);
  rmSync(out, { recursive: true, force: true });
  process.exit(1);
}
rmSync(out, { recursive: true, force: true });
const { readRecipePayload, toPlannedFoods } = mod.default ?? mod;

const { FIXTURES } = await import(path.join(NATIVE, 'tools', 'live-world.mjs'));
const fixture = FIXTURES.community_posts.find((p) => p.kind === 'recipe');

/* ── 1 · KHÔNG NÉM, với mọi hình dạng ── */
const HOSTILE = [
  ['null', null], ['undefined', undefined], ['một chuỗi', 'recipe'], ['một số', 42],
  ['một mảng', [1, 2]], ['đối tượng rỗng', {}],
  ['ingredients là chuỗi', { ingredients: 'Ức gà' }],
  ['ingredients chứa rác', { ingredients: [null, 'x', 7, [], { name: 'Thật', kcal: 100 }] }],
  ['số âm, NaN, Infinity', { ingredients: [{ name: 'A', kcal: -5, protein: NaN, carbs: Infinity, fat: '−3' }] }],
];
for (const [label, raw] of HOSTILE) {
  let r = null;
  let err = null;
  try { r = readRecipePayload(raw); } catch (e) { err = e; }
  note(`payload ${label}: không ném`, !err, err ? `ném: ${err.message}` : '');
  if (r) {
    note(`payload ${label}: mọi con số là số hữu hạn, không âm`,
      [r.kcal, r.protein, r.carbs, r.fat, ...r.ingredients.flatMap((i) => [i.kcal, i.protein, i.carbs, i.fat])]
        .every((n) => Number.isFinite(n) && n >= 0),
      JSON.stringify(r).slice(0, 120));
    note(`payload ${label}: ingredientCount khớp số dòng thật`, r.ingredientCount === r.ingredients.length,
      `${r.ingredientCount} vs ${r.ingredients.length}`);
  }
}
const junk = readRecipePayload({ ingredients: [null, 'x', 7, [], { name: 'Thật', kcal: 100 }] });
note('dòng rác bị lọc, dòng thật ở lại', junk.ingredients.length === 1 && junk.ingredients[0].name === 'Thật',
  junk.ingredients.map((i) => i.name).join(', '));

/* ── 2 · SỐ TRÊN THẺ = TỔNG CÁC DÒNG, kể cả khi trường tổng nói dối ── */
const liar = readRecipePayload({ kcal: 9999, protein: 999, carbs: 999, fat: 999,
  ingredients: [{ name: 'A', kcal: 300, protein: 20, carbs: 40, fat: 6 }, { name: 'B', kcal: 42, protein: 1, carbs: 2, fat: 3 }] });
note('trường tổng NÓI DỐI: thẻ vẫn in tổng các dòng', liar.kcal === 342 && liar.protein === 21 && liar.carbs === 42 && liar.fat === 9,
  `${liar.kcal} / ${liar.protein} / ${liar.carbs} / ${liar.fat} — phải là 342 / 21 / 42 / 9`);
const planned = toPlannedFoods(liar);
note('"thấy gì thì ghi nấy": tổng kcal ghi vào nhật ký = kcal in trên thẻ',
  planned.reduce((n, f) => n + f.kcal, 0) === liar.kcal,
  `ghi ${planned.reduce((n, f) => n + f.kcal, 0)} · thẻ ${liar.kcal}`);
note('mỗi dòng ghi ĐÚNG số của nó, không nhân thêm với khẩu phần',
  planned[0].kcal === 300 && planned[0].protein_g === 20 && planned[0].carbs_g === 40 && planned[0].fat_g === 6,
  JSON.stringify(planned[0]));
note('không trỏ vào món trong kho của NGƯỜI ĐĂNG (RLS không cho người xem đọc nó)',
  planned.every((f) => f.food_item_id === null), JSON.stringify(planned.map((f) => f.food_item_id)));

/* ── 3 · KHÔNG BỊA KHỐI LƯỢNG ── */
const grams = readRecipePayload({ ingredients: [
  { name: 'có', grams: 180 }, { name: 'null', grams: null }, { name: 'thiếu' },
  { name: 'số 0', grams: 0 }, { name: 'âm', grams: -50 }, { name: 'chuỗi rác', grams: 'nhiều' },
] });
note('khối lượng biết thì giữ', grams.ingredients[0].grams === 180, String(grams.ingredients[0].grams));
note('khối lượng KHÔNG biết thì null — không bao giờ bịa "100 g"',
  grams.ingredients.slice(1).every((i) => i.grams === null),
  grams.ingredients.slice(1).map((i) => `${i.name}=${i.grams}`).join(', '));
note('khối lượng đi thẳng sang `serving_g` của món ghi vào nhật ký',
  toPlannedFoods(grams)[0].serving_g === 180 && toPlannedFoods(grams)[1].serving_g === null,
  JSON.stringify(toPlannedFoods(grams).slice(0, 2).map((f) => f.serving_g)));
note('tên trống không thành một dòng trống', readRecipePayload({ ingredients: [{ name: '   ' }] }).ingredients[0].name === '?',
  JSON.stringify(readRecipePayload({ ingredients: [{ name: '   ' }] }).ingredients[0].name));

/* ── fixture của thế giới giả phải giữ tính chất 2 ── */
note('có một bài Recipe trong fixture', !!fixture, 'không thấy bài `kind: recipe` nào trong `live-world.mjs`');
if (fixture) {
  const sum = (k) => fixture.payload.ingredients.reduce((n, i) => n + i[k], 0);
  note('fixture: trường tổng ĐÚNG BẰNG tổng các dòng',
    ['kcal', 'protein', 'carbs', 'fat'].every((k) => fixture.payload[k] === sum(k)),
    ['kcal', 'protein', 'carbs', 'fat'].map((k) => `${k} ${fixture.payload[k]}≠${sum(k)}`).join(', '));
}

if (problems.length) {
  console.error('bài Recipe CÓ LỖI:\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}
console.log(
  `bài Recipe OK — ${CASES} ca, CHẠY THẬT \`readRecipePayload\` và \`toPlannedFoods\`. Chín hình dạng payload hỏng ` +
    '(null, chuỗi, số, mảng, ingredients là chuỗi, dòng rác, số âm/NaN/Infinity) đều ra một thẻ ít hơn chứ không ném. ' +
    'Số trên thẻ là TỔNG CÁC DÒNG kể cả khi trường tổng nói dối 9999, và đúng số ấy là thứ "Thêm vào bữa ăn" ghi ' +
    'vào nhật ký — thấy gì thì ghi nấy. Khối lượng không biết thì null, không bao giờ bịa "100 g". Món ghi vào ' +
    'nhật ký không trỏ vào kho của người đăng, vì RLS không cho người xem đọc nó. Và fixture Recipe của thế giới ' +
    'giả tự giữ đúng tính chất ấy',
);
