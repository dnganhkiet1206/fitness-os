/**
 * Ba tab sau của hướng dẫn: bài KHÁC cùng dụng cụ, bài KHÁC cùng nhóm cơ.
 *
 *     node tools/guide-related.mjs
 *
 * ── vì sao luật này CHẠY hàm chứ không đọc mã ──
 *
 * `lib/guide-related.ts` thuần: không React, không Supabase, không theme. Nên
 * nó biên dịch rồi GỌI được — cùng lý do với `exercise-media.ts` và
 * `guide-content.ts`. Và câu hỏi ở đây đúng là câu hỏi về GIÁ TRỊ TRẢ VỀ: "bài
 * đang mở có tự xuất hiện trong danh sách của chính nó không" là thứ không một
 * phép dò chuỗi nào trả lời được.
 *
 * ── bốn lối hỏng nó canh, và cả bốn đều có thật ở dữ liệu ĐANG CHẠY ──
 *
 * **Một — bài tự liên quan tới chính nó.** Thư viện giữ dòng hạt giống
 * (`user_id` null) và bản người dùng tự sửa CÙNG TÊN. `use-exercise-guide.ts`
 * chọn một trong hai; nếu chỉ lọc theo `id` thì bản còn lại hiện ra trong danh
 * sách "bài liên quan" của chính nó. Trông rất hợp lý — nó đúng là một dòng có
 * thật — nên không ai báo.
 *
 * **Hai — dụng cụ lạ biến thành "không biết".** `canonicalEquipment` chỉ có
 * năm từ vựng. Dùng nó một mình để SO SÁNH thì hai bài kettlebell của cùng một
 * người không tìm thấy nhau mặc dù cột ấy ghi y hệt.
 *
 * **Ba — cột trống gộp thành một nhóm.** `null` không phải một giá trị dụng
 * cụ. Nếu nó được so như mọi giá trị khác thì chống đẩy và squat "cùng thiết
 * bị".
 *
 * **Bốn — thứ tự phụ thuộc thứ tự máy chủ trả về.** Hai lần mở cùng một bài
 * phải ra cùng một danh sách. PostgREST không hứa gì về thứ tự khi `.order()`
 * có giá trị trùng.
 *
 * ── và nó chạy trên DỮ LIỆU HẠT GIỐNG THẬT ──
 *
 * Mười dòng cuối tệp này là mười dòng đúng nguyên văn trong
 * `20260212040248_…sql:358`. Chúng có đủ những chỗ khó mà dữ liệu thật có:
 * `Lưng/Chân` là hai nhóm cơ trong một ô, `Hamstring` là một cách viết mà bảng
 * đồng nghĩa phải bắt được, `Bắp tay trước` là cách viết thứ ba của biceps.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { inCode } from './lib/code-mask.mjs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
let CASES = 0;

const out = mkdtempSync(path.join(tmpdir(), 'guide-related-'));
let mod;
try {
  /* `tsc` đi theo import TƯƠNG ĐỐI, nên một lệnh này phát ra cả bốn tệp:
     `guide-related`, `equipment`, `exercise-key`, `muscle-group`. Đó là lý do
     `guide-related.ts` viết `./equipment` chứ không `@/lib/equipment` — bí
     danh `@/` chỉ tồn tại nhờ `tsconfig`, mà lệnh này chạy `--ignoreConfig`. */
  execFileSync(
    'npx',
    ['tsc', 'src/lib/guide-related.ts', '--ignoreConfig', '--outDir', out,
      '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: 'pipe' },
  );
  mod = await import(path.join(out, 'guide-related.js'));
} catch (e) {
  console.error('bài liên quan CÓ LỖI:\n');
  console.error(`  • không biên dịch được \`lib/guide-related.ts\`: ${e.message.split('\n')[0]}`);
  rmSync(out, { recursive: true, force: true });
  process.exit(1);
}
const { sameEquipment, sameMuscle, RELATED_LIMIT } = mod.default ?? mod;

const row = (id, name, muscle_group, equipment) => ({ id, name, muscle_group, equipment });
const who = (name, muscleKeys, equipmentKey, id = null) => ({ id, name, muscleKeys, equipmentKey });
const names = (list) => list.map((r) => r.name);

const note = (label, ok, why) => {
  CASES++;
  if (!ok) problems.push(`${label} — ${why}`);
};

/* ══════════════════════════ DỮ LIỆU HẠT GIỐNG THẬT ══════════════════════════
   Nguyên văn `supabase/migrations/20260212040248_…sql:358`. */
const SEED = [
  row('s1', 'Barbell Squat', 'Chân', 'Barbell'),
  row('s2', 'Bench Press', 'Ngực', 'Barbell'),
  row('s3', 'Deadlift', 'Lưng/Chân', 'Barbell'),
  row('s4', 'Overhead Press', 'Vai', 'Barbell'),
  row('s5', 'Barbell Row', 'Lưng', 'Barbell'),
  row('s6', 'Pull-up', 'Lưng', 'Bodyweight'),
  row('s7', 'Dumbbell Curl', 'Bắp tay trước', 'Dumbbell'),
  row('s8', 'Leg Press', 'Chân', 'Machine'),
  row('s9', 'Lat Pulldown', 'Lưng', 'Cable'),
  row('s10', 'Romanian Deadlift', 'Hamstring', 'Barbell'),
];

/* ── 1 · deadlift trên dữ liệu thật: hai nhóm cơ, và cả hai đều đếm ── */
const dl = who('Deadlift', ['back', 'legs'], 'barbell', 's3');
note(
  'HẠT GIỐNG · Deadlift tìm ra đúng sáu bài cùng nhóm cơ',
  JSON.stringify(names(sameMuscle(SEED, dl))) ===
    JSON.stringify(['Barbell Row', 'Barbell Squat', 'Lat Pulldown', 'Leg Press', 'Pull-up', 'Romanian Deadlift']),
  `nhận: ${JSON.stringify(names(sameMuscle(SEED, dl)))}. \`Lưng/Chân\` là HAI nhóm trong một ô, và ` +
    '`Hamstring` là cách viết thứ hai của `legs` — cả hai đều phải đi qua bảng đồng nghĩa',
);
note(
  'HẠT GIỐNG · Deadlift không tự nằm trong danh sách của chính nó',
  !names(sameMuscle(SEED, dl)).includes('Deadlift') &&
    !names(sameEquipment(SEED, dl)).includes('Deadlift'),
  'một bài liên quan tới chính nó là câu vô nghĩa duy nhất mà dữ liệu thật tự sinh ra được',
);
note(
  'HẠT GIỐNG · Deadlift tìm ra đúng năm bài khác dùng tạ đòn',
  JSON.stringify(names(sameEquipment(SEED, dl))) ===
    JSON.stringify(['Barbell Row', 'Barbell Squat', 'Bench Press', 'Overhead Press', 'Romanian Deadlift']),
  `nhận: ${JSON.stringify(names(sameEquipment(SEED, dl)))}`,
);

/* ── 2 · Dumbbell Curl: RỖNG, và đó là sự thật chứ không phải lỗi ──
   Hạt giống có đúng một bài tạ đơn và đúng một bài biceps. Hai tab ấy vì thế
   nói "chưa có bài nào khác", và luật này ghim con số 0 lại để cái rỗng ấy là
   một kết quả ĐƯỢC BIẾT chứ không phải một dấu hiệu hỏng. */
const curl = who('Dumbbell Curl', ['biceps'], 'dumbbell', 's7');
note(
  'HẠT GIỐNG · Dumbbell Curl: không bài nào cùng dụng cụ, không bài nào cùng nhóm cơ',
  sameEquipment(SEED, curl).length === 0 && sameMuscle(SEED, curl).length === 0,
  'hạt giống chỉ có một bài tạ đơn và một bài biceps; hai danh sách RỖNG là câu đúng, và màn hình phải ' +
    'nói thẳng điều đó thay vì độn thêm bài cho đỡ trống',
);

/* ── 3 · chính nó bị loại theo CẢ HAI đường ── */
const twins = [row('seed', 'Bench Press', 'Ngực', 'Barbell'), row('mine', 'Bench Press', 'Ngực', 'Barbell'),
  row('x', 'Incline Press', 'Ngực', 'Barbell')];
note(
  'bản người dùng TRÙNG TÊN không hiện trong danh sách của bản hạt giống',
  JSON.stringify(names(sameMuscle(twins, who('Bench Press', ['chest'], 'barbell', 'seed')))) ===
    JSON.stringify(['Incline Press']),
  'thư viện giữ cả dòng hạt giống lẫn bản người dùng tự sửa cùng tên. Lọc theo `id` thôi thì bản còn lại ' +
    'hiện ra như một bài "liên quan" — một dòng CÓ THẬT, nên không ai báo',
);
note(
  'không có id thì vẫn loại được chính nó, bằng TÊN',
  JSON.stringify(names(sameMuscle(twins, who('Bench Press', ['chest'], 'barbell', null)))) ===
    JSON.stringify(['Incline Press']),
  'template cũ và bài thêm tay không bao giờ có id — xem `use-exercise-guide.ts`',
);
note(
  'hai dòng trùng tên KHÁC chỉ hiện một lần',
  sameMuscle(
    [row('a', 'Cable Fly', 'Ngực', 'Cable'), row('b', 'cable  fly', 'Ngực', 'Cable')],
    who('Bench Press', ['chest'], 'barbell', 'z'),
  ).length === 1,
  'cùng tên = cùng bài, dù hai dòng. `exerciseKey` đã gấp hoa/thường và khoảng trắng',
);

/* ── 4 · dụng cụ LẠ vẫn khớp chính nó, và không khớp thứ khác ── */
const kb = [row('k1', 'KB Swing', 'Mông', 'Kettlebell'), row('k2', 'KB Snatch', 'Vai', 'kettlebell '),
  row('k3', 'Band Pull', 'Lưng', 'Resistance band')];
note(
  '`Kettlebell` khớp `kettlebell ` và KHÔNG khớp `Resistance band`',
  JSON.stringify(names(sameEquipment(kb, who('KB Clean', ['legs'], 'raw:kettlebell', 'z')))) ===
    JSON.stringify(['KB Snatch', 'KB Swing']),
  `nhận: ${JSON.stringify(names(sameEquipment(kb, who('KB Clean', ['legs'], 'raw:kettlebell', 'z'))))}. ` +
    '`canonicalEquipment` chỉ có năm từ vựng, nên nếu phép so dựa một mình vào nó thì mọi dụng cụ ngoài ' +
    'năm ấy thành "không biết" và không bài nào tìm thấy nhau',
);
note(
  'ba cách viết của cùng một khoá đều khớp: `Dumbbells`, `db`, `DUMBBELL`',
  sameEquipment(
    [row('a', 'A', 'Vai', 'Dumbbells'), row('b', 'B', 'Vai', 'db'), row('c', 'C', 'Vai', 'DUMBBELL')],
    who('Z', ['shoulders'], 'dumbbell', 'z'),
  ).length === 3,
  'bảng đồng nghĩa của `equipment.ts` là thứ phải trả lời, không phải phép so chuỗi',
);
note(
  'dụng cụ TRỐNG: danh sách rỗng, và không gộp mọi bài trống thành một nhóm',
  sameEquipment(
    [row('a', 'Push-up', 'Ngực', null), row('b', 'Squat', 'Chân', '  ')],
    who('Z', ['chest'], null, 'z'),
  ).length === 0,
  '`null` không phải một giá trị dụng cụ. So nó như mọi giá trị khác là nói chống đẩy và squat dùng chung ' +
    'một thiết bị',
);
note(
  'bài có dụng cụ TRỐNG không lọt vào danh sách của một bài CÓ dụng cụ',
  sameEquipment(
    [row('a', 'Push-up', 'Ngực', null), row('b', 'Incline Press', 'Ngực', 'Barbell')],
    who('Bench Press', ['chest'], 'barbell', 'z'),
  ).length === 1,
  'cùng lỗi, chiều ngược lại',
);

/* ── 5 · trùng NHIỀU nhóm cơ thì đứng trước, hoà thì theo tên ── */
const mix = [
  row('a', 'Zzz Row', 'Lưng', 'Barbell'),
  row('b', 'Aaa Pull', 'Lưng/Chân', 'Barbell'),
  row('c', 'Mmm Squat', 'Chân', 'Barbell'),
  row('d', 'Bbb Curl', 'Bắp tay trước', 'Dumbbell'),
];
note(
  'trùng hai nhóm đứng trước trùng một nhóm',
  JSON.stringify(names(sameMuscle(mix, who('Z', ['back', 'legs'], 'barbell', 'z')))) ===
    JSON.stringify(['Aaa Pull', 'Mmm Squat', 'Zzz Row']),
  `nhận: ${JSON.stringify(names(sameMuscle(mix, who('Z', ['back', 'legs'], 'barbell', 'z'))))}. ` +
    'Deadlift liên quan tới một bài lưng-VÀ-chân nhiều hơn tới một bài chỉ có chân',
);
note(
  'bài không chung nhóm cơ nào bị loại hẳn',
  !names(sameMuscle(mix, who('Z', ['back', 'legs'], 'barbell', 'z'))).includes('Bbb Curl'),
  'biceps không chung gì với lưng hay chân',
);
note(
  'thứ tự KHÔNG phụ thuộc thứ tự dòng đi vào',
  JSON.stringify(names(sameMuscle([...mix].reverse(), who('Z', ['back', 'legs'], 'barbell', 'z')))) ===
    JSON.stringify(names(sameMuscle(mix, who('Z', ['back', 'legs'], 'barbell', 'z')))),
  'PostgREST không hứa gì về thứ tự khi `.order()` gặp giá trị trùng; hai lần mở cùng một bài phải ra ' +
    'cùng một danh sách',
);
note(
  'không biết nhóm cơ nào thì danh sách rỗng',
  sameMuscle(SEED, who('Forearm Roller', [], null, 'z')).length === 0,
  'một chuỗi bảng đồng nghĩa không nhận ra — `Forearms` — không được biến thành "liên quan tới tất cả"',
);

/* ── 6 · liên NGÔN NGỮ: khoá so với khoá, không nhãn so với nhãn ── */
note(
  'bài lưu `Ngực` khớp một chủ thể có khoá `chest`',
  names(sameMuscle([row('a', 'Cable Fly', 'Ngực', 'Cable')], who('Z', ['chest'], null, 'z'))).length === 1,
  'thư viện lưu ba cách viết của cùng một kệ — `Chest`, `Ngực`, `Bắp tay trước` — vì ba nơi cùng ghi vào ' +
    'cột ấy. So nhãn với nhãn là để hai người dùng hai thứ tiếng thấy hai thư viện khác nhau',
);

/* ── 7 · dòng rác và phép cắt ── */
note(
  'dòng tên rỗng bị bỏ',
  sameMuscle([row('a', '   ', 'Ngực', 'Cable'), row('b', 'Cable Fly', 'Ngực', 'Cable')],
    who('Z', ['chest'], null, 'z')).length === 1,
  'một dòng không có tên thì không có gì để hiện',
);
note(
  '`null`/`undefined` thay cho mảng dòng: rỗng, không ném',
  sameMuscle(null, who('Z', ['chest'], null, 'z')).length === 0 &&
    sameEquipment(undefined, who('Z', ['chest'], 'barbell', 'z')).length === 0,
  'truy vấn thư viện `enabled` theo tab, nên lượt vẽ ĐẦU TIÊN của hai tab ấy luôn có `data` là `undefined`',
);
note(
  'phép cắt là 8, và nó cắt thật',
  RELATED_LIMIT === 8 &&
    sameMuscle(
      Array.from({ length: 20 }, (_, i) => row(`r${i}`, `Ex ${String(i).padStart(2, '0')}`, 'Ngực', 'Cable')),
      who('Z', ['chest'], null, 'z'),
    ).length === 8,
  'một danh sách dài hơn biến một tab tra cứu thành màn thư viện thứ hai, mà thư viện đã có màn riêng',
);
note(
  'mục trả về mang nhóm cơ của CHÍNH nó, không của chủ thể',
  JSON.stringify(sameMuscle([row('a', 'Deadlift 2', 'Lưng/Chân', 'Barbell')],
    who('Z', ['legs'], null, 'z'))[0].muscleKeys) === JSON.stringify(['back', 'legs']),
  'dòng phụ dưới mỗi tên trả lời "vì sao bài này ở đây"; chép lại nhóm cơ của chủ thể là làm mọi dòng ' +
    'giống hệt nhau',
);

/* ── 8 · NHÃN được dịch ở ĐÂY, không ở màn hình ──

   `tools/guide-content.mjs` luật 18 canh một điều có giá: đúng MỘT nơi biết
   rằng `muscle_group` lưu KHOÁ chứ không lưu nhãn. Màn hướng dẫn vì thế không
   được import hàm nhãn nào — nên dòng phụ dưới mỗi tên bài phải tới đây đã là
   chữ đọc được, và nó phải đổi theo ngôn ngữ đang bật.

   Ca `Forearms` là ca khó: bảng đồng nghĩa không nhận ra nó, và `muscleGroupLabel`
   trả lại NGUYÊN VĂN. Đó là câu đúng — màn hình không bao giờ in một khoá thô,
   và cũng không bao giờ bịa một nhóm cơ cho một chuỗi nó không hiểu. */
const dlRows = [row('a', 'Deadlift 2', 'Lưng/Chân', 'Barbell'), row('b', 'Odd One', 'Forearms', 'Barbell')];
note(
  'nhãn tiếng Việt: `Lưng/Chân` → "Lưng / Chân"',
  sameMuscle(dlRows, who('Z', ['back', 'legs'], null, 'z'), 'vi')[0].muscleLabel === 'Lưng / Chân',
  `nhận: "${sameMuscle(dlRows, who('Z', ['back', 'legs'], null, 'z'), 'vi')[0]?.muscleLabel}"`,
);
note(
  'nhãn tiếng Anh: cùng dòng ấy → "Back / Legs"',
  sameMuscle(dlRows, who('Z', ['back', 'legs'], null, 'z'), 'en')[0].muscleLabel === 'Back / Legs',
  `nhận: "${sameMuscle(dlRows, who('Z', ['back', 'legs'], null, 'z'), 'en')[0]?.muscleLabel}"`,
);
note(
  'giá trị bảng đồng nghĩa KHÔNG nhận ra được giữ NGUYÊN VĂN, không thành khoá thô',
  sameEquipment(dlRows, who('Z', ['back'], 'barbell', 'z'), 'en')
    .find((r) => r.name === 'Odd One')?.muscleLabel === 'Forearms',
  'một `Forearms` in ra thành `forearms` hay thành một nhóm cơ gần đúng đều là nói sai về dữ liệu của ' +
    'chính người dùng',
);

/* ── 9 · tệp này KHÔNG được với tay xuống cơ sở dữ liệu ──
   Nó là thứ giữ cho ba tab đọc đúng cache mà màn Plan đã có. Một `supabase`
   ở đây là một lượt mạng thứ hai cho dữ liệu đang nằm sẵn trong bộ nhớ. */
/* `inCode` chứ không regex trần: chú thích của chính tệp ấy NÓI rằng nó không
   import Supabase, nên một phép dò trên cả văn xuôi sẽ phạt đúng người đang
   ghi lại giao ước — cùng cái bẫy đã ghi ở `exercise-guide.mjs`. */
const src = readFileSync(path.join(NATIVE, 'src/lib/guide-related.ts'), 'utf8');
note(
  '`lib/guide-related.ts` thuần: không Supabase, không React',
  !['supabase', "from 'react", 'useQuery'].some((n) => inCode(src, n)),
  'thuần là điều kiện để chính luật này chạy được nó; và một truy vấn ở đây sẽ là lượt mạng thứ hai cho ' +
    'dữ liệu `useExercises()` đã có',
);

rmSync(out, { recursive: true, force: true });

if (!problems.length) {
  console.log(
    `bài liên quan OK — ${CASES} ca. Hai danh sách của tab "Thiết bị" và "Liên quan" được lọc từ chính ` +
      'thư viện màn Plan đã tải, không từ một truy vấn mới. Bài đang mở bị loại theo CẢ id lẫn TÊN — thư ' +
      'viện giữ dòng hạt giống và bản người dùng trùng tên, nên lọc theo id thôi là để một bài liên quan ' +
      'tới chính nó. Dụng cụ ngoài năm từ vựng vẫn khớp chính nó (`Kettlebell` ↔ `kettlebell`), còn cột ' +
      'TRỐNG thì không khớp gì — chống đẩy và squat không "cùng thiết bị". Trùng nhiều nhóm cơ đứng trước, ' +
      'hoà thì theo tên, và thứ tự không phụ thuộc thứ tự máy chủ trả về. Chạy trên đúng mười dòng hạt ' +
      'giống: Deadlift ra sáu bài cùng nhóm cơ và năm bài cùng tạ đòn, còn Dumbbell Curl ra RỖNG cả hai — ' +
      'một sự thật, không phải một lỗi',
  );
}

if (problems.length) {
  console.error('bài liên quan CÓ LỖI:\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}
