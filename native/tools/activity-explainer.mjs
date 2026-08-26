/**
 * Sheet giải thích của hai thẻ hero nói đúng thứ thẻ thật sự làm.
 *
 * ── vì sao có tệp này ──
 *
 * Chú thích ở `readiness-explainer.tsx` ghi lại một lỗi mà repo này đã dính:
 * một dòng nói *"tools/readiness-doc.mjs đọc mọi con số ở đây"* trong khi công
 * cụ ấy **chưa từng tồn tại**. Không gì kiểm các con số ấy cả; chính lời khẳng
 * định là thứ khiến không ai đi kiểm.
 *
 * `activity-explainer.tsx` cũng khẳng định như vậy về tệp này. Nên tệp này
 * phải tồn tại, và phải thật sự đọc ngược các con số ra.
 *
 * ── lỗi nó canh ──
 *
 * Sheet nói ba mục tiêu: 300 kcal, 30 phút, và số bước của người dùng. Hai con
 * số đầu là hằng số trong `lib/activity.ts`. Gõ lại chúng vào một chuỗi tiếng
 * Việt thì ngày ai đó chỉnh engine, sheet vẫn nói con số cũ — và một help sheet
 * lệch khỏi mã thì tệ hơn không có help sheet, vì nó được tin.
 *
 * Nên luật là: sheet phải IMPORT hằng số, không được gõ lại. Đó là bất biến
 * mạnh hơn "hai con số bằng nhau", vì nó đúng cả với những con số chưa ai đổi.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(NATIVE, rel), 'utf8');

const SHEET = 'src/components/ascnd/activity-explainer.tsx';
const MODEL = 'src/lib/activity.ts';
const CARD = 'src/components/ascnd/activity-rings.tsx';
const HERO = 'src/components/ascnd/hero-pages.tsx';
const LIST = 'src/components/ascnd/dashboard-cards.tsx';
const TYPES = 'src/lib/types.ts';

const problems = [];
const sheet = read(SHEET);
const model = read(MODEL);

/* ── 1. các con số phải được IMPORT, không gõ lại ─────────────────────────── */
for (const name of ['MOVE_TARGET_KCAL', 'EXERCISE_TARGET_MIN']) {
  const decl = new RegExp(`export const ${name} = (\\d+);`).exec(model);
  if (!decl) {
    problems.push(`${MODEL}: không còn hằng số \`${name}\` — sheet đang nói về nó`);
    continue;
  }
  if (!new RegExp(`\\b${name}\\b`).test(sheet)) {
    problems.push(
      `${SHEET}: không dùng \`${name}\` — con số ${decl[1]} phải được IMPORT chứ không gõ lại, ` +
        'nếu không thì ngày engine đổi mục tiêu, sheet vẫn nói con số cũ',
    );
  }
  /* Và nó phải được import THẬT, chứ không phải chỉ nhắc tên trong chú thích. */
  if (!new RegExp(`import \\{[^}]*\\b${name}\\b[^}]*\\} from '@/lib/activity'`).test(sheet.replace(/\n/g, ' '))) {
    problems.push(`${SHEET}: \`${name}\` không được import từ @/lib/activity`);
  }
}

/* Mặc định bước chân phải khớp giữa sheet và engine — sheet nói con số này ra
   thành lời ("chưa đặt thì mặc định 10.000"), nên nó là một khẳng định. */
const modelDefault = /input\.stepsTarget > 0 \? input\.stepsTarget : (\d+)/.exec(model);
if (!modelDefault) {
  problems.push(`${MODEL}: không đọc được mặc định bước chân`);
} else {
  const n = Number(modelDefault[1]);
  if (!new RegExp(`stepsTarget > 0 \\? stepsTarget : ${n}`).test(sheet)) {
    problems.push(`${SHEET}: mặc định bước chân không còn khớp engine (${n})`);
  }
  const pretty = n.toLocaleString('vi-VN');
  if (!sheet.includes(pretty) && !sheet.includes(n.toLocaleString('en-US'))) {
    problems.push(`${SHEET}: không nói ra con số mặc định ${n} bằng chữ`);
  }
}

/* ── 2. lời khẳng định lớn nhất của sheet phải ĐÚNG ───────────────────────── */
/*
  Sheet nói thẳng: ba vòng này không tính vào điểm sẵn sàng. Nếu ngày nào đó
  `ReadinessInput` nhận bước chân hay calo hoạt động, câu ấy thành lời nói dối
  trên màn hình của người dùng — và không có gì khác trong repo bắt được.
*/
const inputType = /interface ReadinessInput \{([\s\S]*?)\n\}/.exec(read(TYPES));
if (!inputType) {
  problems.push(`${TYPES}: không tìm thấy ReadinessInput`);
} else if (/\b(steps|active_kcal|active_minutes|move)\w*\s*[?:]/i.test(inputType[1])) {
  problems.push(
    `${TYPES}: ReadinessInput đã nhận một trường bước chân/calo hoạt động — ` +
      `câu "ba vòng này không tính vào điểm sẵn sàng" trong ${SHEET} không còn đúng`,
  );
}
for (const [what, re] of [
  ['ba vòng không vào điểm sẵn sàng (vi)', /không (tính vào|nằm trong) (điểm sẵn sàng|công thức)/],
  ['ba vòng không vào điểm sẵn sàng (en)', /(not in the readiness score|in no formula)/i],
  ['số 0 nghĩa là chưa ai đo (vi)', /chưa ai đo/],
  ['số 0 nghĩa là chưa ai đo (en)', /nobody measured/i],
  ['EXERCISE có hai nguồn (vi)', /ƯỚC LƯỢNG/],
  ['EXERCISE có hai nguồn (en)', /ESTIMATE/],
]) {
  if (!re.test(sheet)) problems.push(`${SHEET}: mất câu "${what}"`);
}

/* ── 3. dây nối: sheet nào cũng phải có lối mở ────────────────────────────── */
if (!/<ActivityExplainer/.test(read(CARD)) || !/useHelpTopic\(/.test(read(CARD))) {
  problems.push(`${CARD}: thẻ ba vòng không mở được sheet giải thích của chính nó`);
}
if (!/<NutritionExplainer/.test(read(HERO))) {
  problems.push(
    `${HERO}: trang hero dinh dưỡng không mở được sheet giải thích. Sheet ĐÃ CÓ và chỉ thẻ dạng ` +
      'danh sách mở được nó, trong khi hero mới là thứ phần lớn người dùng nhìn thấy',
  );
}
/* Hai lối vào cùng một sheet phải đếm lượt nhắc chung MỘT khoá, nếu không một
   chỗ im còn chỗ kia nhắc mãi. */
const topics = [read(HERO), read(LIST)].map((src) => /useHelpTopic\((?:'([^']+)'|(\w+))\)/.exec(src));
const heroTopic = topics[0] && (topics[0][1] ?? /const NUTRITION_HELP_TOPIC = '([^']+)'/.exec(read(HERO))?.[1]);
const listTopic = topics[1] && topics[1][1];
if (!heroTopic || !listTopic || heroTopic !== listTopic) {
  problems.push(
    `khoá nhắc của sheet dinh dưỡng lệch nhau: hero=${JSON.stringify(heroTopic)}, ` +
      `danh sách=${JSON.stringify(listTopic)} — hai lối vào một sheet phải đếm chung một tên`,
  );
}

/* ── phép tự kiểm ─────────────────────────────────────────────────────────── */
const SELF = [
  {
    name: 'gõ cứng 300 thay vì import MOVE_TARGET_KCAL',
    src: sheet,
    mutate: (s) => s.replace(/\bMOVE_TARGET_KCAL\b/g, '300'),
    check: (s) => {
      const bad = [];
      const decl = /export const MOVE_TARGET_KCAL = (\d+);/.exec(model);
      if (!new RegExp('\\bMOVE_TARGET_KCAL\\b').test(s)) bad.push(`không dùng MOVE_TARGET_KCAL (${decl[1]})`);
      return bad;
    },
    expect: /không dùng MOVE_TARGET_KCAL/,
  },
  {
    name: 'bỏ câu "ba vòng này không tính vào điểm sẵn sàng"',
    src: sheet,
    mutate: (s) => s.replace(/không (tính vào|nằm trong) (điểm sẵn sàng|công thức)/g, 'XOÁ'),
    check: (s) => (/không (tính vào|nằm trong) (điểm sẵn sàng|công thức)/.test(s) ? [] : ['mất câu không-tính-vào-điểm']),
    expect: /mất câu/,
  },
];
const selfFail = [];
for (const s of SELF) {
  const broken = s.mutate(s.src);
  if (broken === s.src) {
    selfFail.push(`${s.name}: không đổi được gì — phép thử ngược đang thử một bản y hệt bản thật`);
    continue;
  }
  const found = s.check(broken);
  if (found.length === 0) selfFail.push(`${s.name}: bản hỏng vẫn XANH — luật này không bắt được gì`);
  else if (!found.some((f) => s.expect.test(f))) {
    selfFail.push(`${s.name}: đỏ, nhưng không đúng chỗ đã dự đoán (${s.expect}); thật ra: ${found.join('; ')}`);
  }
  if (s.check(s.src).length !== 0) {
    selfFail.push(`${s.name}: phép kiểm đỏ ngay trên BẢN THẬT — luật sai chứ không phải mã sai`);
  }
}

if (selfFail.length) {
  console.error('phép tự kiểm hỏng — đừng tin kết quả:\n');
  for (const s of selfFail) console.error(`  ${s}`);
  process.exit(2);
}
if (problems.length) {
  console.log('sheet giải thích thẻ hero lệch khỏi mã:\n');
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}

const move = /export const MOVE_TARGET_KCAL = (\d+);/.exec(model)[1];
const ex = /export const EXERCISE_TARGET_MIN = (\d+);/.exec(model)[1];
console.log(
  `sheet giải thích thẻ hero OK — hai mục tiêu cố định (${move} kcal, ${ex} phút) được IMPORT từ lib/activity.ts ` +
    'chứ không gõ lại, nên chỉnh engine là sheet đi theo; mặc định bước chân khớp engine và được nói ra thành chữ. ' +
    'Lời khẳng định lớn nhất của sheet được kiểm ngược vào mã: ReadinessInput không nhận bước chân hay calo hoạt ' +
    'động nào, nên câu "ba vòng này không tính vào điểm sẵn sàng" vẫn đúng — không có luật nào khác trong repo bắt ' +
    'được nếu nó thôi đúng. Ba câu chịu lực còn nguyên ở CẢ HAI ngôn ngữ: số 0 nghĩa là "chưa ai đo" chứ không phải ' +
    '"bạn không vận động", và vòng EXERCISE nói ra khi nó đang ước lượng thay vì đo. Dây nối đủ hai chỗ: thẻ ba ' +
    'vòng mở được sheet của nó, và trang hero dinh dưỡng mở được sheet vốn đã tồn tại mà trước đây chỉ thẻ dạng ' +
    `danh sách với tới — hai lối vào ấy đếm lượt nhắc chung khoá "${heroTopic}". ` +
    `${SELF.length} phép thử ngược đều đỏ đúng chỗ đã dự đoán, và cả hai đều xanh trên bản thật`,
);
