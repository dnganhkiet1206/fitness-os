/**
 * Hướng dẫn bài tập: tra theo ID trước, và KHÔNG làm nặng màn Plan.
 *
 *     node tools/exercise-guide.mjs
 *
 * ── ba điều nó canh, và mỗi điều là một cách tính năng này hỏng ──
 *
 * **Một — thứ tự tra cứu.** `exerciseId` là khoá chính tắc. Tra theo TÊN khi đã
 * có id là tự chuốc lại đúng cái mơ hồ mà lượt sửa danh tính vừa gỡ: hai dòng
 * thư viện trùng tên, hoặc một bài vừa được đổi tên. Luật đòi nhánh id đứng
 * TRƯỚC nhánh tên trong `use-exercise-guide.ts`, và đòi nhánh tên vẫn còn — nó
 * là đường lui vĩnh viễn cho template cũ và bài thêm tay.
 *
 * **Hai — Plan không được nặng thêm.** Đặt hàng nói thẳng: *"Do not fetch media
 * for exercises that were never opened."* Nên `useExercises()` — truy vấn mà
 * màn Plan đã chạy sẵn qua `useExerciseInsights` — KHÔNG được select mấy cột
 * hướng dẫn. Nới nó ra là bắt mọi lần mở Plan tải hướng dẫn của mọi bài.
 *
 * **Ba — một lối vào, không phải ba.** Thẻ bài tập đã có hai chỗ chạm (cụm
 * thu/mở, và hàng "Lần trước" sang tiến bộ). Lối vào hướng dẫn là cái TÊN. Một
 * nút thứ tư trên cùng một thẻ là ba thứ để chọn giữa lúc đang thở dốc, và đặt
 * hàng cấm: *"Do not add multiple redundant Guide buttons."*
 *
 * ── vì sao nó đọc mã chứ không chạy mã ──
 *
 * Khác `exercise-identity.mjs`, ba điều trên là về HÌNH DẠNG của mã — thứ tự
 * hai nhánh, một câu select, số lối vào — chứ không phải về giá trị mà một hàm
 * trả về. Không có hàm thuần nào để gọi. Nên luật này canh cấu trúc, và mỗi vế
 * neo vào một chuỗi đặc trưng để nó đỏ khi chuỗi ấy biến mất chứ không xanh
 * suông.
 */
import { readFileSync } from 'node:fs';
import { codeMask, inCode } from './lib/code-mask.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(NATIVE, rel), 'utf8');

const HOOK = 'src/hooks/use-exercise-guide.ts';
const SHEET = 'src/app/exercise-guide.tsx';
const PLAN = 'src/components/ascnd/day-plan.tsx';
const MEDIA = 'src/components/ascnd/guide-media.tsx';
const VIDEO = 'src/components/ascnd/guide-video.tsx';
const LIB = 'src/hooks/use-library.ts';
const LAYOUT = 'src/app/_layout.tsx';

const problems = [];
let CASES = 0;

const hook = read(HOOK);
const sheet = read(SHEET);
const plan = read(PLAN);
const media = read(MEDIA);
const video = read(VIDEO);
/* Hai tệp, một khối media: nhánh video đã tách ra `guide-video.tsx` để cái
   import ném được của `expo-video` không nằm trên đường nạp một ROUTE. Mấy vế
   dưới đây nói về HÀNH VI của khối ấy, nên chúng đọc cả hai. */
const mediaAll = media + '\n' + video;
/*
  Vế cấm `aspectRatio: undefined` phải đọc MÃ, không đọc chú thích — và luật này
  tự đỏ vì chính điều đó ở lần chạy đầu: chú thích trong `guide-media.tsx` GIẢI
  THÍCH vì sao cách viết ấy sai, nên nó chứa đúng chuỗi bị cấm.
  Một luật không phân biệt được mã với văn xuôi sẽ phạt đúng người đang ghi lại
  bài học.

  ── và lần đầu viết vế ấy, chính nó là luật CHẾT ──

  Bản trước gọi `const mediaCode = codeMask(media)` rồi thử
  `/aspectRatio: undefined/.test(mediaCode)`. `codeMask` KHÔNG trả về chuỗi: nó
  trả về một `Uint8Array` đánh dấu từng ký tự (1 = mã, 0 = chú thích/chuỗi).
  Một regex thử trên mảng ấy sẽ so với `"1,1,0,1,…"`, nên vế đó không bao giờ
  đỏ được — tức nó đã đứng đó canh một chỗ trống. Đó đúng là "luật yếu" mà dự
  án này cấm, và nó lọt qua vì lượt ấy tôi không phá thử ĐÚNG vế này.

  `inCode(src, needle)` mới là thứ trả lời được câu hỏi "chuỗi này có nằm ở một
  vị trí LÀ MÃ không" — nó tồn tại sẵn trong cùng tệp thư viện ấy.
*/

/* ── 1 · ID trước, TÊN sau ── */
CASES++;
const byId = hook.indexOf(".eq('id', exerciseId)");
const byName = hook.indexOf('exerciseKey(r.name) === key');
if (byId < 0 || byName < 0) {
  problems.push(
    `${HOOK}: không còn thấy cả hai đường tra (id=${byId >= 0} · tên=${byName >= 0}). ` +
      'Mất đường ID là quay về tra theo tên — đúng cái mơ hồ lượt sửa danh tính vừa gỡ. Mất đường TÊN là ' +
      'làm trắng hướng dẫn của mọi template cũ và mọi bài thêm tay, thứ không bao giờ có id',
  );
} else if (byId > byName) {
  problems.push(
    `${HOOK}: đường tra theo TÊN đứng TRƯỚC đường tra theo ID. Khoá chính tắc phải được hỏi trước; ` +
      'hỏi tên trước nghĩa là hai dòng thư viện trùng tên sẽ quyết định thay cho id',
  );
}

/* ── 2 · thiếu id thì KHÔNG được ném, phải rơi xuống đường tên ── */
CASES++;
if (!/Id trỏ hụt/.test(hook) || !/if \(exerciseId\) \{/.test(hook)) {
  problems.push(
    `${HOOK}: nhánh id không còn là một nhánh CÓ ĐIỀU KIỆN rơi tiếp xuống đường tên. Một id trỏ hụt — ` +
      'bài đã bị xoá khỏi thư viện — phải ra hướng dẫn theo tên, không được ra màn trống',
  );
}

/* ── 3 · Plan KHÔNG tải cột hướng dẫn ── */
CASES++;
const lib = read(LIB);
const sel = /\.from\('exercises'\)\s*\n[\s\S]{0,400}?\.select\(([\s\S]{0,300}?)\)/.exec(lib);
if (!sel) {
  problems.push(`${LIB}: không đọc được câu select của \`exercises\` — luật này đang không kiểm gì cả`);
} else if (/form_cues|common_mistakes|video_url/.test(sel[1])) {
  problems.push(
    `${LIB}: \`useExercises()\` nay select cả cột hướng dẫn. Đó là truy vấn màn Plan ĐÃ chạy sẵn (qua ` +
      '`useExerciseInsights`), nên mọi lần mở Plan sẽ tải hướng dẫn của MỌI bài — kể cả bài không ai mở. ' +
      'Hướng dẫn có truy vấn riêng, `enabled` theo chính cái sheet: xem `use-exercise-guide.ts`',
  );
}

/* ── 4 · MỘT lối vào, và nó là cái TÊN ── */
CASES++;
const entries = (plan.match(/pathname: '\/exercise-guide'/g) ?? []).length;
if (entries !== 1) {
  problems.push(
    `${PLAN}: có ${entries} lối vào hướng dẫn, phải đúng MỘT. Thẻ bài tập đã mang hai chỗ chạm khác (cụm ` +
      'thu/mở và hàng "Lần trước"); thêm nữa là bắt người đang thở dốc phải chọn giữa bốn thứ',
  );
}
CASES++;
if (!/params: \{ ex: block\.rows\[0\]\.exerciseId \?\? '', name: block\.name \}/.test(plan)) {
  problems.push(
    `${PLAN}: lối vào không còn truyền \`exerciseId\` của khối. Truyền thiếu id thì sheet phải tra theo ` +
      'tên kể cả khi kế hoạch BIẾT chính xác bài nào — tức khoá chính tắc có mà không dùng',
  );
}

/* ── 5 · là MODAL, vì đó là cách buổi tập được giữ nguyên ── */
CASES++;
const layout = read(LAYOUT);
if (!/'exercise-guide',/.test(layout)) {
  problems.push(
    `${LAYOUT}: \`exercise-guide\` không còn nằm trong danh sách \`presentation: 'modal'\`. Nó phải là một ` +
      'pageSheet: màn Plan ở lại mounted phía dưới, nên buổi tập đang dở — tạ đã gõ, hiệp đã tick, đồng hồ ' +
      'nghỉ — không bị dựng lại. Đổi sang push toàn màn là làm mất đúng thứ tính năng này hứa giữ',
  );
}

/* ── 6 · Guide KHÔNG nuốt Insight ── */
CASES++;
if (!/exercise-insight/.test(read('src/components/ascnd/exercise-progress.tsx'))) {
  problems.push(
    'src/components/ascnd/exercise-progress.tsx: hàng "Lần trước" thôi dẫn sang `/exercise-insight`. ' +
      'Guide và Insight là hai khái niệm: một cái DẠY cách làm, một cái nói bạn đang tiến bộ ra sao. ' +
      'Thay cái này bằng cái kia là mất một tính năng đang chạy',
  );
}

/* ── 7 · media: hỏng thì có chỗ trống tử tế, và KHÔNG có trình phát ── */
CASES++;
if (!/onError=\{\(\) => setImgBroke\(true\)\}/.test(media) || !/status === 'error'/.test(mediaAll)) {
  problems.push(
    `${MEDIA}: khung hình không còn bắt lỗi tải ở CẢ hai đường (ảnh qua \`onError\`, video qua ` +
      "`status === 'error'`). Một đường dẫn đúng vẫn 404 được, và khi ấy đặt hàng đòi *\"a graceful " +
      'fallback rather than a broken player"*',
  );
}
CASES++;
if (!/autoplay=\{!reduced\}/.test(media) || !/if \(!reduced\) p\.play\(\)/.test(mediaAll)) {
  problems.push(
    `${MEDIA}: media không còn tôn trọng "giảm chuyển động" ở cả hai đường. Một vòng lặp vô tận LÀ ` +
      'chuyển động liên tục — đúng thứ cài đặt trợ năng ấy nói tới, và nó phải dừng được ở CẢ video lẫn ' +
      'ảnh động',
  );
}

/* ── 7b · video là MINH HOẠ, không phải một trình phát ── */
CASES++;
const player = [
  ['nativeControls={false}', /nativeControls=\{false\}/],
  ['muted', /p\.muted = true/],
  ['loop', /p\.loop = true/],
  ['không toàn màn', /fullscreenOptions=\{\{ enable: false \}\}/],
  ['không cửa sổ nổi', /allowsPictureInPicture=\{false\}/],
].filter(([, re]) => !re.test(mediaAll)).map(([n]) => n);
if (player.length) {
  problems.push(
    `${MEDIA}: đoạn minh hoạ đang mọc ra một TRÌNH PHÁT — thiếu: ${player.join(', ')}. Đặt hàng nói rõ ` +
      '*"no visible player controls, no audio UI, no seeking UI"*: nó phải cư xử như một hình vẽ biết ' +
      'động, không như một video mạng xã hội. Phòng tập đã đủ ồn, và không ai chọn xem một đoạn 5 giây',
  );
}

/* ── 7c · CÓ media thì to, KHÔNG có thì GỌN ── */
CASES++;
if (!/frame: \{ aspectRatio: 16 \/ 10 \}/.test(media) || !/styles\.compact/.test(media)) {
  problems.push(
    `${MEDIA}: hai kích cỡ của khung hình không còn tách nhau. \`video_url\` mặc định rỗng và cả mười ` +
      'dòng seed đều trống, nên "không có hình" là trường hợp THƯỜNG — giữ một ô 16:10 cho nó là dành một ' +
      'phần ba màn cho thứ không tồn tại, và đẩy điểm kỹ thuật xuống dưới nếp gấp',
  );
}
CASES++;
if (inCode(media, 'aspectRatio: undefined')) {
  problems.push(
    `${MEDIA}: khung hình gỡ tỉ lệ bằng \`aspectRatio: undefined\`. Nó KHÔNG chạy — React Native bỏ qua ` +
      'giá trị `undefined` lúc gộp style, nên ô trống vẫn cao nguyên 16:10. Tỉ lệ phải được CỘNG VÀO ở ' +
      'nhánh có hình, không phải trừ đi ở nhánh không',
  );
}

/* ── 7e · ô media chỉ được hỏi KHI ĐÃ BIẾT ──
   Cùng lớp lỗi với `empty-vs-failed.mjs`, ở chỗ nó chưa với tới. Đo được trên
   bản dựng thật: giữ phản hồi `exercises` lại 3 giây thì sheet khẳng định "No
   demonstration yet" suốt lúc đang tải; ép truy vấn 500 thì nó nói câu ấy ngay
   trên "Could not load your data". Cả hai đều là câu SAI về dữ liệu của người
   dùng, và cả hai đều đến từ việc `null` mang ba nghĩa. */
CASES++;
const guardAt = (() => {
  const needle = '{!isPending && !isError ? (';
  const mask = codeMask(sheet);
  for (let i = sheet.indexOf(needle); i >= 0; i = sheet.indexOf(needle, i + 1)) if (mask[i]) return i;
  return -1;
})();
/*
  Không chỉ đòi cái vỏ: thẻ NGAY SAU lớp che phải là `<GuideMedia>`.

  Phép thử đầu ở đây dùng cờ `m`, và phá thử thứ ba đã cho nó XANH: che một
  `<View>` rồi để `<GuideMedia>` đứng trơ ngay dưới `) : null}` vẫn lọt, vì với
  cờ `m` thì `^` khớp mọi đầu DÒNG trong đoạn cắt chứ không phải đầu đoạn. Neo
  vào đầu đoạn mới là thứ nói đúng câu "cái được che chính là nó".
*/
if (guardAt < 0 || !/^\s*<GuideMedia\b/.test(sheet.slice(guardAt + 27, guardAt + 120))) {
  problems.push(
    `${SHEET}: \`<GuideMedia>\` không còn được che sau \`!isPending && !isError\`. Tham số \`url\` của nó ` +
      'gộp ba trạng thái khác hẳn nhau vào một chữ `null` — CHƯA BIẾT, ĐỌC HỎNG, và BIẾT CHẮC LÀ KHÔNG CÓ — ' +
      'trong khi nó chỉ có hai câu để nói. Hai trạng thái đầu vì thế ra câu "chưa có hình minh hoạ", một ' +
      'khẳng định SAI về dữ liệu của người dùng, và ở nhánh hỏng nó còn mâu thuẫn thẳng với thẻ "không đọc ' +
      'được" ngay bên dưới. Lúc đang tải đã có vòng quay, lúc hỏng đã có thẻ báo hỏng: ô media chỉ nói khi ' +
      'nó thật sự biết',
  );
}

/* ── 7e · `expo-video` chỉ được import ở MỘT tệp, và qua một cái khoá ──

   `expo-video/build/NativeVideoModule.js` gọi `requireNativeModule('ExpoVideo')`
   ở phạm vi module, nên chỉ riêng việc import nó đã NÉM trên một bản app chưa
   có phần native. Và `guide-media.tsx` nằm trên đường nạp của `exercise-guide.tsx`
   — một ROUTE mà `expo-router` nạp lúc khởi động để kiểm cây route. Nên một
   import tĩnh ở đó không làm hỏng một màn: nó làm CẢ APP không mở được, kèm
   `Cannot read property 'ErrorBoundary' of undefined` vì route nạp hụt trả về
   `undefined`.

   Đã xảy ra thật, hai lượt liền trên máy chủ dự án, sau khi `expo-video` vào ở
   `a13e648`. `npm install` không sửa được vì thứ thiếu là mã Swift.

   Nên: đúng một tệp được import `expo-video`, và tệp bị route chạm phải đi qua
   `require` trong `try/catch`. */
CASES++;
const importers = ['src/components/ascnd/guide-media.tsx', 'src/components/ascnd/guide-video.tsx',
  'src/app/exercise-guide.tsx', 'src/components/ascnd/day-plan.tsx']
  .filter((f) => /from 'expo-video'/.test(read(f)));
if (JSON.stringify(importers) !== JSON.stringify([VIDEO])) {
  problems.push(
    `\`expo-video\` đang được import tĩnh ở [${importers.join(', ')}], phải CHỈ ở \`${VIDEO}\`. Gói ấy ` +
      'gọi `requireNativeModule` ngay lúc nạp module, nên một import tĩnh trên đường nạp một route làm cả ' +
      'app không mở được trên mọi binary chưa có phần native — không phải làm hỏng một màn',
  );
}
CASES++;
if (!/try \{[\s\S]{0,40}?return \(require\('\.\/guide-video'\)/.test(media) ||
    !/\} catch \{[\s\S]{0,30}?return null;/.test(media)) {
  problems.push(
    `${MEDIA}: cửa vào \`guide-video\` không còn là \`require\` trong \`try/catch\`. Thiếu cái khoá ấy thì ` +
      'một máy chưa build lại phần native sẽ không mở được app, thay vì thấy ô media ở trạng thái "không ' +
      'tải được hình minh hoạ" — một câu đúng: có URL, và máy này mở không nổi',
  );
}
CASES++;
if (!/!!videoUrl && !GuideVideo/.test(media)) {
  problems.push(
    `${MEDIA}: thiếu phần native mà vẫn không được tính là HỎNG. Có một URL video và máy không mở được nó ` +
      'thì đó là "không tải được", không phải "chưa có hình minh hoạ" — hai câu về hai sự thật khác nhau',
  );
}

/* ── 7d · video KHÔNG được tải từ Plan ── */
CASES++;
if (/expo-video/.test(plan) || /expo-video/.test(read('src/components/ascnd/exercise-progress.tsx'))) {
  problems.push(
    'màn Plan (hoặc hàng "Lần trước") nay import `expo-video`. Đặt hàng nói thẳng *"Do not preload video ' +
      'from Plan"* — trình giải mã chỉ được dựng khi sheet hướng dẫn mở, tức chỉ trong `guide-media.tsx`',
  );
}

/* ── 8 · nghĩa không nằm ở MÀU ── */
CASES++;
const cueSection = /nEgCues[\s\S]{0,600}?nEgMistakes/.exec(sheet);
if (!cueSection || !/icon=\{Check\}/.test(cueSection[0])) {
  problems.push(
    `${SHEET}: hai danh sách không còn hai GLYPH khác hình nhau. Xanh/đỏ một mình là truyền tin bằng màu, ` +
      'thứ WCAG 1.4.1 cấm — người không phân biệt được hai màu ấy sẽ đọc "đừng làm thế này" thành "hãy làm ' +
      'thế này"',
  );
}

if (!problems.length) {
  console.log(
    `hướng dẫn bài tập OK — ${CASES} ca. Tra cứu: \`exerciseId\` (khoá chính tắc) hỏi TRƯỚC, ` +
      '`exerciseKey(name)` là đường lui đứng sau và ở lại vĩnh viễn — template cũ, bài thêm tay và JSONB ' +
      'viết tay đều hợp lệ khi không có id, và một id trỏ hụt rơi tiếp xuống đường tên chứ không ra màn ' +
      'trống. Plan KHÔNG nặng thêm: `useExercises()` vẫn không select `form_cues`/`common_mistakes`/' +
      '`video_url`, còn hướng dẫn có truy vấn riêng `enabled` theo chính cái sheet, nên bài không ai mở thì ' +
      'không tải gì. MỘT lối vào duy nhất và nó là cái TÊN bài tập — thẻ đã có hai chỗ chạm khác. Sheet là ' +
      '`presentation: modal`, tức pageSheet iOS: Plan ở lại mounted phía dưới nên buổi tập đang dở không bị ' +
      'dựng lại, và đó là toàn bộ cơ chế giữ state. `/exercise-insight` không bị đụng — Guide dạy cách làm, ' +
      'Insight nói tiến bộ, hai câu hỏi khác nhau. Media bắt lỗi tải, tôn trọng "giảm chuyển động", và hai ' +
      'danh sách dùng hai glyph khác hình chứ không chỉ khác màu',
  );
}

if (problems.length) {
  console.error('hướng dẫn bài tập CÓ LỖI:\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}
