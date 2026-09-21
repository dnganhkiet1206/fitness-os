/**
 * Nội dung hướng dẫn: một ngôn ngữ sở hữu cả gói, và cột lưu KHOÁ chứ không
 * lưu nhãn.
 *
 *     node tools/guide-content.mjs
 *
 * ── ba lỗi mà luật này canh, và cả ba đều đã từng có thật ──
 *
 * **Một — nội dung một ngôn ngữ.** `form_cues TEXT[]` giữ được một tiếng, app
 * chạy hai. Kiểm kê Giai đoạn 3 chụp được đúng cảnh ấy: tiêu đề "Form cues"
 * tiếng Anh nằm trên "Vai ép xuống ghế". Bảng `exercise_guide_content` là chỗ
 * sửa, và luật đòi nó là MỘT DÒNG cho mỗi (bài tập, ngôn ngữ) — không phải
 * một cột mới cho mỗi tiếng.
 *
 * **Hai — cột lưu nhãn.** `exercises.tsx` đổ bộ chọn nhóm cơ từ `i18n.muscle*`,
 * tức từ NGÔN NGỮ ĐANG BẬT, rồi lưu thẳng cái nhãn ấy. Cùng một cái kệ thành
 * `Ngực` hoặc `Chest` tuỳ lúc bấm lưu người ta để app ở tiếng gì. Luật đòi
 * đường ghi đi qua `canonicalMuscleGroup`/`canonicalEquipment`, và đòi đường
 * hiện đi qua hàm nhãn — không màn nào in ra `chest`.
 *
 * **Ba — trộn hai thứ tiếng trong một màn.** Nếu bản tiếng Anh có điểm kỹ
 * thuật nhưng chưa có lỗi thường gặp, mượn phần thiếu từ tiếng Việt sẽ ra một
 * màn nói bằng hai giọng mà người đọc không biết câu nào là bản dịch.
 *
 * ── nó CHẠY mã, không đọc mã ──
 *
 * `guide-content.ts`, `muscle-group.ts` và `equipment.ts` đều không import gì,
 * đúng để chỗ này biên dịch được chúng bằng `tsc --ignoreConfig` rồi gọi hàm
 * thật. Vế nào về HÌNH DẠNG của mã (một câu select, một lời gọi) thì mới đọc
 * chuỗi, và mỗi vế ấy neo vào một chuỗi đặc trưng để nó đỏ khi chuỗi biến mất.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inCode } from './lib/code-mask.mjs';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(NATIVE, rel), 'utf8');

const HOOK = 'src/hooks/use-exercise-guide.ts';
const SHEET = 'src/app/exercise-guide.tsx';
const LIB_SCREEN = 'src/app/exercises.tsx';
const PLAN = 'src/components/ascnd/day-plan.tsx';
const LIBRARY = 'src/hooks/use-library.ts';
const MIGRATION = '../supabase/migrations/20260921120000_exercise_guide_content.sql';
const SEED = '../supabase/migrations/20260212040248_128920cf-c47c-49a7-b85d-ffc90138a6c4.sql';

const problems = [];
let CASES = 0;

/* ══════════════════ chạy thật: ba tệp thuần, biên dịch rồi gọi ══════════════════ */
const out = mkdtempSync(path.join(tmpdir(), 'guide-content-'));
let mods;
try {
  execFileSync(
    'npx',
    ['tsc', 'src/lib/guide-content.ts', 'src/lib/muscle-group.ts', 'src/lib/equipment.ts',
      '--ignoreConfig', '--outDir', out, '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: 'pipe' },
  );
  mods = {
    content: await import(path.join(out, 'guide-content.js')),
    muscle: await import(path.join(out, 'muscle-group.js')),
    equip: await import(path.join(out, 'equipment.js')),
  };
} catch (e) {
  console.error('nội dung hướng dẫn CÓ LỖI:\n');
  console.error(`  • không biên dịch được ba tệp thuần: ${e.message.split('\n')[0]}`);
  rmSync(out, { recursive: true, force: true });
  process.exit(1);
}

const { pickContent } = mods.content.default ?? mods.content;
const { muscleGroupLabel, canonicalMuscleGroup } = mods.muscle.default ?? mods.muscle;
const { equipmentLabel, canonicalEquipment } = mods.equip.default ?? mods.equip;

const row = (locale, cues, mistakes = []) => ({ locale, form_cues: cues, common_mistakes: mistakes });
const VI = row('vi', ['Vai ép xuống ghế', 'Hạ tạ từ từ'], ['Nảy tạ khỏi ngực']);
const EN = row('en', ['Shoulders pinned to the bench', 'Lower the bar slowly']);

const check = (name, got, want) => {
  CASES++;
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g !== w) problems.push(`${name}: ra ${g}, phải là ${w}`);
};

/* ── 1 · chọn đúng ngôn ngữ đang bật ── */
check('chọn tiếng Anh khi app ở tiếng Anh',
  pickContent([VI, EN], 'en')?.locale, 'en');
check('chọn tiếng Việt khi app ở tiếng Việt',
  pickContent([VI, EN], 'vi')?.locale, 'vi');

/* ── 2 · thứ tự hàng KHÔNG được quyết định thay ── */
check('đảo thứ tự hàng vẫn ra cùng kết quả',
  pickContent([EN, VI], 'en')?.locale, 'en');

/* ── 3 · thiếu tiếng Anh thì lùi về tiếng Việt ── */
check('không có hàng tiếng Anh → lùi về tiếng Việt',
  pickContent([VI], 'en')?.locale, 'vi');
check('hàng tiếng Anh RỖNG cũng là không có',
  pickContent([VI, row('en', [], [])], 'en')?.locale, 'vi');

/* ── 4 · không có gì thì rỗng, không phải nửa vời ── */
check('không hàng nào → null', pickContent([], 'en'), null);
check('chỉ hàng rỗng → null', pickContent([row('vi', [], []), row('en', [], [])], 'vi'), null);

/* ── 5 · KHÔNG trộn: gói nội dung thuộc về một ngôn ngữ ──
   Hàng tiếng Anh có điểm kỹ thuật mà không có lỗi thường gặp; hàng tiếng Việt
   có cả hai. Mượn phần thiếu từ tiếng Việt là đúng thứ bị cấm. */
check('tiếng Anh thiếu "lỗi thường gặp" → KHÔNG mượn của tiếng Việt',
  pickContent([VI, EN], 'en')?.commonMistakes, []);
check('và vẫn giữ nguyên điểm kỹ thuật tiếng Anh',
  pickContent([VI, EN], 'en')?.formCues, EN.form_cues);

/* ── 6 · nhãn nhóm cơ, hai ngôn ngữ, và giá trị lạ giữ nguyên ── */
check('khoá chính tắc → nhãn tiếng Việt', muscleGroupLabel('chest', 'vi'), 'Ngực');
check('khoá chính tắc → nhãn tiếng Anh', muscleGroupLabel('chest', 'en'), 'Chest');
check('khoá hai phần → hai nhãn', muscleGroupLabel('back/legs', 'vi'), 'Lưng / Chân');
check('giá trị KHÔNG nhận ra giữ nguyên văn', muscleGroupLabel('Forearms', 'vi'), 'Forearms');
check('nhãn cũ vẫn đọc được (dữ liệu lịch sử)', muscleGroupLabel('Ngực', 'en'), 'Chest');

/* ── 7 · đường ghi biến nhãn thành khoá ── */
check('nhãn tiếng Việt → khoá', canonicalMuscleGroup('Ngực'), 'chest');
check('nhãn tiếng Anh → cùng khoá ấy', canonicalMuscleGroup('Chest'), 'chest');
check('hai nhóm trong một ô → hai khoá', canonicalMuscleGroup('Lưng/Chân'), 'back/legs');
check('không nhận ra → null, KHÔNG đoán bừa', canonicalMuscleGroup('Forearms'), null);

/* ── 8 · dụng cụ, đúng nguyên tắc ấy ── */
check('dụng cụ: khoá → nhãn tiếng Việt', equipmentLabel('dumbbell', 'vi'), 'Tạ đơn');
check('dụng cụ: khoá → nhãn tiếng Anh', equipmentLabel('dumbbell', 'en'), 'Dumbbell');
check('dụng cụ: chữ tự do giữ nguyên', equipmentLabel('Kettlebell', 'vi'), 'Kettlebell');
check('dụng cụ: biến thể → khoá', canonicalEquipment('Dumbbells'), 'dumbbell');
check('dụng cụ: lạ → null, giá trị người dùng không bị nuốt', canonicalEquipment('Kettlebell'), null);

rmSync(out, { recursive: true, force: true });

/* ══════════════════ hình dạng: migration ══════════════════ */
const sql = read(MIGRATION);

/* ── 9 · một bài tập + một ngôn ngữ = MỘT dòng ── */
CASES++;
if (!/UNIQUE \(exercise_id, locale\)/.test(sql)) {
  problems.push(
    `${MIGRATION}: mất ràng buộc \`UNIQUE (exercise_id, locale)\`. Hai dòng cùng ngôn ngữ cho một bài ` +
      'tập làm câu hỏi "nội dung tiếng Anh nào" thành câu không có câu trả lời, và `pickContent` lấy ' +
      'dòng đầu tiên nó gặp — tức nội dung phụ thuộc thứ tự trả về của máy chủ',
  );
}

/* ── 10 · bài tập vẫn là cha, và danh tính vẫn ở `exercises` ── */
CASES++;
if (!/exercise_id UUID NOT NULL REFERENCES public\.exercises\(id\) ON DELETE CASCADE/.test(sql)) {
  problems.push(
    `${MIGRATION}: nội dung không còn là con của \`exercises\` qua khoá ngoại có CASCADE. Bảng này ` +
      'THÊM CHỮ cho một bài tập; nó không được tạo ra bài tập, và không được sống lâu hơn bài tập',
  );
}

/* ── 11 · locale bị chặn ở cửa, đúng bằng những tiếng app vẽ được ── */
CASES++;
const langs = [...read('src/lib/i18n.ts').matchAll(/export type AppLang = ([^\n;]+)/g)]
  .flatMap((m) => [...m[1].matchAll(/'(\w+)'/g)].map((x) => x[1]))
  .sort();
const inCheck = (/locale TEXT NOT NULL CHECK \(locale IN \(([^)]*)\)\)/.exec(sql)?.[1] ?? '')
  .match(/'(\w+)'/g)?.map((s) => s.replace(/'/g, '')).sort() ?? [];
if (!langs.length || JSON.stringify(langs) !== JSON.stringify(inCheck)) {
  problems.push(
    `${MIGRATION}: CHECK của \`locale\` là [${inCheck}] còn \`AppLang\` là [${langs}]. Một locale mà app ` +
      'không vẽ được là nội dung không ai đọc; một locale app vẽ được mà bảng từ chối là một tính năng ' +
      'không lưu được nội dung',
  );
}

/* ── 12 · KHÔNG có UPDATE trần trên bảng exercises ──
   Đây là luật an toàn quan trọng nhất của migration này: cơ sở dữ liệu thật
   không nhìn thấy được từ đây, nên mọi câu UPDATE phải có vị từ khớp trên một
   từ vựng CÓ THẬT trong kho. */
CASES++;
for (const m of sql.matchAll(/UPDATE public\.exercises[\s\S]*?;/g)) {
  const stmt = m[0];
  if (!/\bWHERE\b/.test(stmt) || !/lower\(btrim\(/.test(stmt)) {
    problems.push(
      `${MIGRATION}: có câu \`UPDATE public.exercises\` không khớp trên một vị từ an toàn ` +
        '(`WHERE lower(btrim(...)) = ...`). Sản xuất không nhìn thấy được từ môi trường này, nên một ' +
        'câu UPDATE không vị từ là viết đè lên dữ liệu chưa ai đọc',
    );
    break;
  }
}

/* ── 13 · chép nội dung cũ sang, và chép lại được nhiều lần ── */
CASES++;
if (!/INSERT INTO public\.exercise_guide_content[\s\S]*?ON CONFLICT \(exercise_id, locale\) DO NOTHING/.test(sql)) {
  problems.push(
    `${MIGRATION}: phần chép nội dung không còn \`ON CONFLICT … DO NOTHING\`. Một migration chạy hai ` +
      'lần phải ra cùng một kết quả, và ở đây "lần hai" là chuyện thường: môi trường dựng lại từ đầu',
  );
}

/* ── 14 · KHÔNG bịa "lỗi thường gặp" tiếng Anh ── */
CASES++;
/* Cột nào cũng bắt, rồi mới hỏi nó ghi gì — nếu chỉ bắt đúng bộ cột an toàn
   thì việc THÊM `common_mistakes` sẽ làm luật "không tìm thấy câu chèn" thay
   vì nói ra đúng chuyện vừa xảy ra. Phá thử thứ bảy chỉ ra điều đó. */
const enInsert = /INSERT INTO public\.exercise_guide_content \([^)]*\)\s*\nSELECT e\.id, 'en'[\s\S]*?;/.exec(sql);
if (!enInsert) {
  problems.push(`${MIGRATION}: không thấy câu chèn nội dung tiếng Anh — luật này đang không kiểm gì cả`);
} else if (/common_mistakes/.test(enInsert[0])) {
  problems.push(
    `${MIGRATION}: câu chèn tiếng Anh nay ghi cả \`common_mistakes\`. Dữ liệu gốc KHÔNG có mục nào, nên ` +
      'mọi câu ở đó đều là do migration này nghĩ ra — một khẳng định về cơ thể người khác, viết trong ' +
      'một tệp không ai đọc lại',
  );
}

/* ── 15 · bản dịch phải ĐỦ VÀ ĐÚNG SỐ: mỗi câu tiếng Việt một câu tiếng Anh ── */
CASES++;
if (enInsert) {
  const seed = read(SEED);
  const at = seed.indexOf('INSERT INTO public.exercises');
  const block = seed.slice(at, seed.indexOf(';', at));
  const viCount = {};
  for (const m of block.matchAll(/\(NULL, '([^']+)',[^[]*ARRAY\[([^\]]*)\]/g)) {
    viCount[m[1]] = (m[2].match(/'/g) ?? []).length / 2;
  }
  const enCount = {};
  for (const m of enInsert[0].matchAll(/\('([^']+)',\s*ARRAY\[([\s\S]*?)\]\)/g)) {
    enCount[m[1]] = (m[2].match(/'/g) ?? []).length / 2;
  }
  const bad = Object.keys(viCount).filter((n) => enCount[n] !== viCount[n]);
  if (bad.length) {
    problems.push(
      `${MIGRATION}: bản dịch lệch số câu ở ${bad.length} bài (${bad.slice(0, 3).join(', ')}). Đây là ` +
        'DỊCH chứ không phải viết mới: thừa một câu là một lời khuyên chưa ai duyệt, thiếu một câu là ' +
        'một lời khuyên biến mất khi người ta đổi sang tiếng Anh',
    );
  }
}

/* ══════════════════ hình dạng: mã ══════════════════ */
const hook = read(HOOK);
const sheet = read(SHEET);
const libScreen = read(LIB_SCREEN);

/* ── 16 · màn hướng dẫn KHÔNG đọc hai cột cũ nữa ── */
CASES++;
/* Cái kim bắt đầu bằng `select`, không bằng dấu nháy: `codeMask` đánh dấu 0
   cho cả CHUỖI lẫn chú thích, nên một cái kim mở đầu bằng `'` không bao giờ
   nằm ở vị trí "là mã" và luật sẽ đỏ oan. Lần chạy đầu đã đỏ đúng như thế. */
if (/form_cues/.test(hook.replace(/\/\*[\s\S]*?\*\//g, '')) &&
    !inCode(hook, "select('locale, form_cues, common_mistakes')")) {
  problems.push(
    `${HOOK}: hướng dẫn vẫn đọc \`form_cues\` ở đâu đó ngoài truy vấn nội dung. Hai nguồn cho một thứ ` +
      'là hai nguồn sẽ lệch, và mảng cũ trên `exercises` chỉ giữ được MỘT ngôn ngữ',
  );
}
CASES++;
if (!inCode(hook, "from('exercise_guide_content')") || !inCode(hook, "eq('exercise_id', row.id)")) {
  problems.push(
    `${HOOK}: nội dung không còn được tra theo \`row.id\` trên \`exercise_guide_content\`. Danh tính ` +
      'vẫn phải là `exercises.id`: tra nội dung theo TÊN sẽ dựng lại đúng cái mơ hồ mà lượt sửa danh ' +
      'tính đã gỡ',
  );
}

/* ── 17 · media không đổi hành vi ── */
CASES++;
if (!inCode(hook, 'mediaUrl: trimmed(row.video_url)') || !/video_url/.test(hook)) {
  problems.push(
    `${HOOK}: \`mediaUrl\` không còn đến thẳng từ \`video_url\` của dòng thư viện. Lượt này là kiến ` +
      'trúc nội dung; hành vi media đã được đo ở Giai đoạn 2 và không nằm trong phạm vi sửa',
  );
}

/* ── 18 · màn hình hiện NHÃN, không hiện khoá ── */
CASES++;
for (const [file, src] of [[SHEET, sheet], [LIB_SCREEN, libScreen]]) {
  const usesLabel = /muscleGroupLabel\(|equipmentLabel\(/.test(src);
  if (!usesLabel) {
    problems.push(
      `${file}: không còn gọi hàm nhãn nào. Cột nay lưu KHOÁ (\`chest\`, \`dumbbell\`), nên in thẳng ` +
        'giá trị ra màn là in một khoá cơ sở dữ liệu cho người dùng đọc',
    );
  }
}

/* ── 19 · đường GHI biến nhãn thành khoá ── */
CASES++;
if (!inCode(libScreen, 'canonicalMuscleGroup(muscleGroup)') ||
    !inCode(libScreen, 'canonicalEquipment(equipment)')) {
  problems.push(
    `${LIB_SCREEN}: form tạo bài tập lưu thẳng thứ bộ chọn đang hiện. Bộ chọn ấy đổ từ \`i18n.muscle*\`, ` +
      'tức từ ngôn ngữ đang bật — nên cùng một cái kệ lại thành `Ngực` hay `Chest` tuỳ lúc bấm lưu. ' +
      'Đó chính là lỗi lượt này sửa',
  );
}

/* ── 20 · Plan KHÔNG tải nội dung hướng dẫn ── */
CASES++;
const planSrc = read(PLAN) + read(LIBRARY);
if (/exercise_guide_content/.test(planSrc)) {
  problems.push(
    'màn Plan (hoặc `use-library.ts`) nay chạm vào `exercise_guide_content`. Nội dung hướng dẫn chỉ ' +
      'được tải khi có người MỞ hướng dẫn, cho MỘT bài — nới ra là bắt mọi lần mở Plan tải nội dung ' +
      'của mọi bài, bằng hai ngôn ngữ',
  );
}

if (!problems.length) {
  console.log(
    `nội dung hướng dẫn OK — ${CASES} ca, trong đó 22 ca CHẠY THẬT \`pickContent\`, \`muscleGroupLabel\`, ` +
      '`canonicalMuscleGroup`, `equipmentLabel` và `canonicalEquipment` sau khi biên dịch ba tệp thuần. ' +
      'Nội dung nằm ở `exercise_guide_content`, một dòng cho mỗi (bài tập, ngôn ngữ), UNIQUE trên đúng ' +
      'cặp ấy và CASCADE theo bài tập cha — schema mọc XUỐNG khi thêm tiếng, không mọc NGANG. Chọn ngôn ' +
      'ngữ là tất định: tiếng đang bật → tiếng Việt → rỗng, và ngôn ngữ đã chọn sở hữu CẢ gói, nên một ' +
      'bản dịch thiếu "lỗi thường gặp" ra màn thiếu mục chứ không ra màn hai giọng. `muscle_group` và ' +
      '`equipment` lưu KHOÁ: đường ghi đi qua `canonical*`, đường hiện đi qua hàm nhãn, và giá trị lịch ' +
      'sử nào bảng đồng nghĩa không nhận ra thì được giữ NGUYÊN VĂN chứ không bị ép vào một khoá gần ' +
      'đúng. Mọi UPDATE trong migration đều khớp trên một vị từ an toàn, bản dịch khớp số câu với bản ' +
      'gốc, không có `common_mistakes` nào được bịa ra, và Plan vẫn không tải một byte nội dung nào',
  );
}

if (problems.length) {
  console.error('nội dung hướng dẫn CÓ LỖI:\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}
