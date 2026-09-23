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

/**
 * Nguồn với CHÚ THÍCH xoá trắng, và CHUỖI GIỮ NGUYÊN.
 *
 * `codeMask` xoá cả hai, đúng cho những vế hỏi "cách viết này có nằm ở mã
 * không". Luật 25 thì hỏi ngược lại: nó đi tìm một phép SO SÁNH VỚI MỘT CHUỖI,
 * nên chuỗi chính là thứ nó phải nhìn thấy. Thứ duy nhất phải biến mất là văn
 * xuôi — đoạn chú thích ở `exercise-guide.tsx` kể lại đúng lối hỏng ấy và sẽ
 * tự làm luật đỏ.
 *
 * Xuống dòng được giữ nguyên để số dòng không trôi.
 */
function stripComments(src) {
  let out = '';
  let i = 0;
  const N = src.length;
  while (i < N) {
    const two = src.slice(i, i + 2);
    if (two === '//' || two === '/*') {
      const end =
        two === '//'
          ? (src.indexOf('\n', i) < 0 ? N : src.indexOf('\n', i))
          : (src.indexOf('*/', i + 2) < 0 ? N : src.indexOf('*/', i + 2) + 2);
      out += src.slice(i, end).replace(/[^\n]/g, ' ');
      i = end;
      continue;
    }
    const ch = src[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1;
      while (j < N && src[j] !== ch) {
        if (src[j] === '\\') j++;
        j++;
      }
      const end = Math.min(j + 1, N);
      out += src.slice(i, end);
      i = end;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

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
/* `&& !controls`: toàn màn thì người ta CHỦ ĐỘNG mở video ra, nên ở đó tự chạy
   là đúng việc của một trình phát. Khung dẫn thì `controls` mặc định `false`,
   nên vế này vẫn canh đúng thứ nó sinh ra để canh. */
if (!/autoplay=\{!reduced\}/.test(media) || !/if \(!reduced && !controls\) p\.play\(\)/.test(mediaAll)) {
  problems.push(
    `${MEDIA}: media không còn tôn trọng "giảm chuyển động" ở cả hai đường. Một vòng lặp vô tận LÀ ` +
      'chuyển động liên tục — đúng thứ cài đặt trợ năng ấy nói tới, và nó phải dừng được ở CẢ video lẫn ' +
      'ảnh động',
  );
}

/* ── 7b · video là MINH HOẠ, không phải một trình phát ── */
CASES++;
/*
  ── ba vế đầu nay nói về MẶC ĐỊNH, không nói về một hằng số ──

  `GuideVideo` có thêm `controls`, và màn xem toàn màn bật nó: ở đó điều khiển
  gốc của hệ điều hành là đúng, vì người ta vừa chủ động mở video ra.

  Thứ KHÔNG được đổi là khung DẪN. Nên luật đòi `controls` mặc định `false`, và
  đòi ba tính chất kia được DẪN RA từ nó — `!controls`. Một ngày nào đó ai đó
  đổi mặc định thành `true` thì vế đầu tiên đỏ, và đó đúng là lúc khung dẫn
  thôi là một hình vẽ biết động.
*/
const player = [
  ['controls mặc định false', /controls = false,/],
  ['nativeControls theo controls', /nativeControls=\{controls\}/],
  ['muted trừ khi toàn màn', /p\.muted = !controls/],
  ['loop trừ khi toàn màn', /p\.loop = !controls/],
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
/* 3:4 chứ không 16:10 nữa: khung đã đổi vai từ một cái THẺ trong lề thành
   HÌNH DẪN tràn lề của cả màn. Trên máy 402×874 thì 3:4 cho 536 điểm — 61%
   chiều cao, khớp ảnh tham chiếu; 16:10 chỉ cho 251 và vẫn đọc ra là một thẻ.
   Con số thì đổi được; thứ KHÔNG đổi là hai kích cỡ phải tách nhau. */
if (!/heroFrame: \{ aspectRatio: 3 \/ 4 \}/.test(media) || !/styles\.compact/.test(media)) {
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
/*
  ── lớp che nay là một BIẾN, và có HAI chỗ dựng media ──

  Bố cục mới cho cùng một khối hai vai: HÌNH DẪN tràn lề khi có url, và một
  dòng gọn trong lề khi không có. Hai chỗ dựng, nên điều kiện được đặt tên một
  lần rồi dùng lại — và luật đòi đúng thứ ấy, ở hai vế:

    · `showMedia` phải được định nghĩa bằng `!isPending && !isError`
    · MỌI chỗ dựng `<GuideMedia` phải nằm sau nó

  Vế thứ hai là thứ thay cho phép "thẻ ngay sau lớp che" của bản trước. Phép ấy
  neo vào đầu đoạn cắt và chỉ đúng khi có MỘT chỗ dựng; nay có hai, và một luật
  chỉ nhìn chỗ đầu tiên sẽ để chỗ thứ hai đi qua mà không ai hỏi.
*/
CASES++;
const showMediaDef = /const showMedia = ([^;]+);/.exec(sheet)?.[1] ?? '';
/* `hero` là lớp che ngoài cùng ở chỗ vẽ, và nó phải được DẪN RA từ `showMedia`
   — không phải một điều kiện khác trùng tên. Nên luật đi theo chuỗi: chỗ vẽ
   nằm sau `hero`, `hero` dẫn từ `showMedia`, `showMedia` là `!isPending &&
   !isError`. Gãy khâu nào cũng đỏ. */
const heroDef = /const hero = ([^;]+);/.exec(sheet)?.[1] ?? '';
const mediaSites = [...sheet.matchAll(/<GuideMedia\b/g)].map((m) => m.index ?? 0);
const unguarded = mediaSites.filter(
  (i) => !/\b(showMedia|hero)\b/.test(sheet.slice(Math.max(0, i - 220), i)),
);
const guardAt =
  /!isPending && !isError/.test(showMediaDef) &&
  /\bshowMedia\b/.test(heroDef) &&
  mediaSites.length &&
  !unguarded.length
    ? 0
    : -1;
if (guardAt < 0) {
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
const cueSection = /nEgCues[\s\S]{0,1600}?nEgMistakes/.exec(sheet);
const mistakeSection = /nEgMistakes[\s\S]{0,1600}?\) : null\}/.exec(sheet);
const glyphs = [
  ['điểm kỹ thuật', cueSection?.[0], /icon=\{Check\}/],
  ['lỗi thường gặp', mistakeSection?.[0], /icon=\{X\}/],
].filter(([, src, re]) => !src || !re.test(src)).map(([n]) => n);
if (glyphs.length) {
  problems.push(
    `${SHEET}: hai danh sách không còn hai GLYPH khác hình nhau — thiếu ở: ${glyphs.join(', ')}. Xanh/đỏ ` +
      'một mình là truyền tin bằng màu, thứ WCAG 1.4.1 cấm — người không phân biệt được hai màu ấy sẽ đọc ' +
      '"đừng làm thế này" thành "hãy làm thế này"',
  );
}

/* ── 8b · mực trên ĐĨA DẤU là token của theme, không phải trắng cứng ──

   Hai cái dấu nay là đĩa ĐẶC với glyph bên trong, đúng như cả bốn ảnh tham
   chiếu. Ảnh ấy vẽ glyph TRẮNG, và trên bản sáng đó đúng — `readinessGreen`
   sáng là #078055, tối, nên trắng cho 4,97:1.

   Bản tối thì KHÔNG: trắng trên hai màu nhấn của bản tối đo được **2,21:1**
   và **2,22:1**, dưới cả sàn 3:1 của WCAG 1.4.11. `primaryForeground` là
   token "thứ nằm trên màu nhấn" và nó lật theo theme: #070708 trong tối
   (9,12:1 trên đĩa xanh, 9,09:1 trên đĩa đỏ), #ffffff trên giấy.

   Luật này tồn tại vì lối hỏng ở đây là NGƯỜI TA LÀM ĐÚNG THEO ẢNH: chép
   `color="#fff"` từ ảnh tham chiếu là một thay đổi trông có căn cứ, và nó xoá
   trắng cả hai cái dấu ở bản tối mà không ai thấy trên máy sáng.

   ── và nó đã CHỨNG MINH giá của mình ──

   Một lượt khác đổi bảng TỐI: `readinessGreen` #2bf5a8 → #00c785,
   `readinessRed` #ff3b5c → #ff8d92. Vì mã gọi TOKEN chứ không gọi mã màu, cặp
   mực/đĩa vẫn đúng sau lần đổi ấy — chỉ là 9,12:1 thay cho 14,12:1. Một
   `color="#fff"` viết cứng thì đã tụt xuống 2,2:1 mà không ai thấy, và
   `tools/palette.mjs` không bắt được: nó canh tương phản của token trên NỀN
   của theme, không canh mực đặt TRÊN token. */
CASES++;
const markInk = [...sheet.matchAll(/<View style=\{\[styles\.mark[\s\S]{0,160}?color=\{([^}]+)\}/g)]
  .map((m) => m[1].trim());
if (markInk.length !== 2 || markInk.some((v) => v !== 'c.primaryForeground')) {
  const seen =
    markInk.length !== 2
      ? `chỉ đọc được ${markInk.length}/2 đĩa mang mực là token — phần còn lại viết màu theo cách khác`
      : `thấy: ${markInk.join(', ')}`;
  problems.push(
    `${SHEET}: mực trên đĩa dấu không còn là \`c.primaryForeground\` ở cả hai đĩa (${seen}). ` +
      'Màu nhấn của hai theme nằm ở hai đầu thang sáng — `readinessGreen` là #078055 trên giấy nhưng #00c785 ' +
      'trong tối — nên một mực viết cứng đúng ở một bản là sai ở bản kia: trắng trên hai màu nhấn của bản ' +
      'tối đo được 2,2:1, dưới cả sàn 3:1 của WCAG 1.4.11. Và vì mã gọi TOKEN chứ không gọi mã màu, cặp này ' +
      'sống sót được lượt đổi bảng màu tối vừa rồi (#2bf5a8 → #00c785, #ff3b5c → #ff8d92) mà không phải sửa',
  );
}

/* ── 8c · MẶT KÍNH: hai lớp, đúng thứ tự, và dòng siêu dữ liệu đổi màu theo ──

   Ba vế, mỗi vế là một cách mặt kính hỏng mà mắt không bắt được trên máy sáng:

   **Một — thứ tự.** Nền của một view được tô TRƯỚC các con của nó, nên nếu sắc
   độ nằm ở `backgroundColor` của chính mặt giấy thì `UIVisualEffectView` lấy
   mẫu một tấm hình ĐÃ bị phủ sắc độ. Độ mờ thật khi ấy cao hơn con số trong
   style, và mọi phép đo dựa trên con số ấy là đo trên một thứ khác. `BlurView`
   phải đứng TRƯỚC lớp sắc độ, và lớp sắc độ phải là một view riêng.

   **Hai — `surface` không được tự mang nền khi có hình.** Cùng một lỗi, viết
   theo cách khác.

   **Ba — siêu dữ liệu phải có màu riêng trên kính.** `mutedForeground` chỉ có
   5,02:1 ngay trên thẻ ĐỤC ở bản tối; trên kính nó là 2,25:1. Gỡ `metaOnGlass`
   đi thì dòng "Ngực · Tạ đơn" tụt xuống dưới sàn mà không gì kêu. */
CASES++;
const blurAt = sheet.indexOf('<BlurView');
const tintAt = sheet.indexOf('styles.glassTint]');
const glass = [
  blurAt >= 0 && tintAt > blurAt ? null : '`BlurView` phải đứng TRƯỚC lớp sắc độ `glassTint`',
  /glassTint: \{ backgroundColor: alpha\(c\.card, m\.lit \? [\d.]+ : [\d.]+\) \}/.test(sheet)
    ? null
    : '`glassTint` phải là một lớp riêng, độ mờ đo theo từng theme',
  /surface: \{[^}]*backgroundColor/.test(sheet)
    ? '`surface` tự mang `backgroundColor`, nên kính lấy mẫu một hình đã bị phủ'
    : null,
  /style=\{\[styles\.meta, hero \? styles\.metaOnGlass : null\]\}/.test(sheet)
    ? null
    : 'dòng siêu dữ liệu không còn đổi sang `metaOnGlass` khi nằm trên kính',
].filter(Boolean);
if (glass.length) {
  problems.push(
    `${SHEET}: mặt kính không còn đúng — ${glass.join('; ')}. Độ mờ ở đây là một con số ĐO ĐƯỢC (tối 0,72, ` +
      'sáng 0,90, giải với mọi nền ở σ=0), và cả ba vế trên đều làm con số ấy không còn mô tả thứ ' +
      'đang hiện trên màn',
  );
}

/* ── 9 · lối ra KHÔNG được đọc `insets.top`, và khoảng tránh phải DẪN RA từ nó ──

   Đã xảy ra trên máy thật. Nút đóng từng đặt ở `insets.top + spacing.sm`. Trên
   bản web `insets.top` là 0 nên mọi ảnh chụp của mọi lượt kiểm đều sạch; trên
   iPhone nó là ~62, và `presentation: 'modal'` dựng một pageSheet mà mép trên
   ĐÃ nằm dưới thanh trạng thái (đo được 56đ trên ảnh chủ dự án gửi). Cộng inset
   của cửa sổ vào là cộng hai lần, và cái đĩa 44 điểm rơi xuống đúng chỗ tên
   bài: "Dumbbell Curl" đọc thành "mbbell Curl".

   `SheetHeader` — thanh đầu dùng chung của mọi sheet trong app — chưa bao giờ
   cộng inset (`root: { paddingTop: spacing.sm }`). Màn này là chỗ duy nhất đi
   lệch.

   ── và luật này TỪNG QUÁ RỘNG ──

   Bản đầu cấm luôn cả `useSafeAreaInsets`. Nó đỏ ngay khi khu hành động ở đáy
   ra đời — mà chỗ ấy CẦN `insets.bottom`, vì sheet chạm đáy màn nên thanh home
   thật sự nằm đè lên nó. Mép TRÊN và mép DƯỚI của một pageSheet không cùng một
   câu chuyện, nên luật phải nói đúng mép nó muốn nói.

   Vế thứ hai quan trọng ngang vế thứ nhất: lỗi ấy không phải "một số sai" mà là
   HAI SỐ TRÔI KHỎI NHAU — vị trí nút tính theo `insets`, còn khoảng tránh của
   tên bài là một hằng số viết tay. Nên `TITLE_CLEAR` phải được dẫn ra từ chính
   những số dựng nên cái nút và thanh vuốt, không được là một con số gõ vào. */
CASES++;
const exitGeom = [
  /* `inCode` chứ không phải regex trần: chú thích ngay trên `CLOSE` KỂ LẠI lỗi
     này và vì thế chứa đúng chuỗi bị cấm. Một luật đọc cả văn xuôi sẽ phạt
     đúng người đang ghi bài học — cùng cái bẫy đã ghi ở đầu tệp cho vế
     `aspectRatio: undefined`. Và vế này tự rơi vào nó ở lần chạy đầu. */
  inCode(sheet, 'insets.top')
    ? '`exercise-guide.tsx` đọc lại `insets.top` — pageSheet đã nằm dưới thanh trạng thái rồi'
    : null,
  /const TITLE_CLEAR =\s*\n?\s*CLOSE_TOP \+ CLOSE - \(GRAB\.top \+ GRAB\.h \+ GRAB\.bottom\) - spacing\.xs;/.test(sheet)
    ? null
    : '`TITLE_CLEAR` không còn được DẪN RA từ `CLOSE_TOP`/`CLOSE`/`GRAB`',
  /titleClearsClose: \{ marginTop: TITLE_CLEAR \}/.test(sheet)
    ? null
    : 'tên bài thôi dùng `TITLE_CLEAR` để tránh cái đĩa',
  /top: CLOSE_TOP,/.test(sheet) ? null : 'nút đóng thôi đặt ở `CLOSE_TOP`',
].filter(Boolean);
if (exitGeom.length) {
  problems.push(
    `${SHEET}: hình học của lối ra đã trôi — ${exitGeom.join('; ')}. Khi KHÔNG có hình dẫn (đang tải, đọc ` +
      'hỏng) mặt giấy bắt đầu ngay từ đỉnh, nên cái đĩa 44 điểm và tên bài tranh đúng một chỗ. Đây là lỗi ' +
      'bản web KHÔNG tự lộ được — `insets.top` ở đó là 0 — nên nó phải được canh bằng luật, chứ không bằng ' +
      'một lượt chụp ảnh nữa',
  );
}

/* ── 22 · chỗ giữ chỗ CÒN LẠI phải IM LẶNG với bộ đọc màn hình ──

   Ba thứ từng nằm ở đây: hàng tab, nút play và dấu trang. Hai đã rời đi, và cả
   hai lần rời đều là vì chúng có việc THẬT để làm:

     nút media   lượt kiến trúc media → mở màn xem toàn màn (luật 23)
     hàng tab    lượt này            → đổi nội dung thật (luật 24)

   Dấu trang thì chưa: không có kho nào để lưu vào, và đặt hàng cấm dựng schema
   mới ở lượt này. Nên nó vẫn phải mang `pointerEvents="none"` và
   `accessibilityElementsHidden`.

   Luật này đọc MÃ vì bản web không đo được: `accessibilityElementsHidden` là
   prop iOS-only và `importantForAccessibility` là Android-only, nên
   react-native-web không phát ra thuộc tính nào — kiểm trên DOM thật, dấu
   trang chỉ có `class`. `guide6.mjs` vì thế chỉ đo được hình học.

   Lối hỏng nó canh: ai đó thấy thứ này "chưa hoạt động" và nối `onPress` vào
   cho đủ. Lúc ấy nó thành một lời hứa suông, và người trả giá đắt nhất là
   người đang dùng VoiceOver — người không thấy được rằng bấm xong không có gì
   xảy ra. */
CASES++;
const placeholders = [
  ['dấu trang', /style=\{styles\.mark2\}[\s\S]{0,160}?accessibilityElementsHidden/],
].filter(([, re]) => !re.test(sheet)).map(([n]) => n);
const pressable = [
  ['dấu trang', /style=\{styles\.mark2\}[\s\S]{0,160}?pointerEvents="none"/],
].filter(([, re]) => !re.test(sheet)).map(([n]) => n);
if (placeholders.length || pressable.length) {
  problems.push(
    `${SHEET}: chỗ giữ chỗ thôi im lặng — ` +
      [placeholders.length ? `lộ ra cho bộ đọc màn hình: ${placeholders.join(', ')}` : null,
       pressable.length ? `nhận chạm: ${pressable.join(', ')}` : null].filter(Boolean).join('; ') +
      '. Dấu trang KHÔNG có gì ở sau: không bảng nào, không cột nào, và đặt hàng cấm dựng schema mới ở lượt ' +
      'này. Nó được giữ làm chỗ đứng THỊ GIÁC theo quyết định của chủ dự án; biến nó thành nút là biến một ' +
      'khoảng trống đã biết thành một lời hứa suông, và người dùng VoiceOver là người trả giá vì họ không ' +
      'thấy được rằng bấm xong không có gì',
  );
}

/* ── 23 · nút MEDIA chỉ tồn tại khi CÓ media, và nó không tự gọi mình là "phát" ──

   Lượt kiến trúc media biến cái tam giác giả thành một hành động thật. Hai vế
   giữ cho nó không trượt về chỗ cũ:

   **Một — nó phải được che sau `hasMedia`.** Một nút mở media trên một bài chưa
   có media nào là đúng cái lời hứa suông mà cả lượt này đi xoá. Đặt hàng nói
   thẳng cho trạng thái NONE: *"Do NOT render play button, duration chip,
   pagination dots, fake media affordance."*

   **Hai — nhãn trợ năng nói "mở", không nói "phát".** Cùng một nút mở ba thứ
   khác nhau tuỳ `media.type`, và với một tấm ẢNH thì "phát" là nói sai loại.
   Glyph theo ảnh tham chiếu được; câu đọc lên cho người dùng VoiceOver thì
   không. */
CASES++;
const mediaBtn = [
  /const openable = showMedia && hasMedia\(media\);/.test(sheet)
    ? null
    : '`openable` không còn được dẫn ra từ `hasMedia(media)`',
  /\{openable \? \(\s*<PressScale/.test(sheet)
    ? null
    : 'nút media không còn được che sau `openable`',
  /accessibilityLabel=\{i18n\.nEgOpenMedia\}/.test(sheet)
    ? null
    : 'nhãn trợ năng của nút media không còn là `nEgOpenMedia`',
].filter(Boolean);
if (mediaBtn.length) {
  problems.push(
    `${SHEET}: nút mở media đã trượt — ${mediaBtn.join('; ')}. Nó chỉ được tồn tại khi mô hình media nói ` +
      'rằng CÓ media: một nút mở trên một bài chưa có gì là đúng thứ lượt kiến trúc media đi xoá. Và nó ' +
      'mở BA thứ khác nhau tuỳ `media.type` — với một tấm ảnh thì gọi hành động ấy là "phát" là nói sai ' +
      'loại, và người dùng VoiceOver là người nghe rõ cái sai ấy nhất',
  );
}

/* ── 24 · bốn tab BẤM ĐƯỢC, và không tab nào dẫn tới một màn bịa ──

   Hai lượt trước hàng tab là hình vẽ. Chủ dự án chốt ngược lại — *"bấm được cả
   và search để thêm thông tin cho các mục đó"* — nên nay nó là bốn cái nút
   thật, và luật này canh cả HAI chiều của quyết định ấy.

   **Chiều thứ nhất — chúng phải thật sự bấm được**, và bấm được theo đúng
   nghĩa trợ năng: `accessibilityRole="tab"` cộng `accessibilityState` là thứ
   khiến VoiceOver đọc ra "tab, đã chọn, 2 trên 4". Thiếu vế sau thì bốn viên
   đọc lên giống hệt nhau và người dùng VoiceOver không biết mình đang ở đâu.

   **Chiều thứ hai — không tab nào được dẫn tới chỗ trống.** Đặt hàng cấm thẳng:
   *"Do not create fake screens merely to make the tab clickable."* Nên mỗi
   `id` trong `TABS` phải có một nhánh nội dung mang đúng `id` ấy, và ba tab mới
   phải có ba câu "chưa có" KHÁC NHAU — gộp chúng thành một câu chung là xoá
   mất thông tin duy nhất mà một tab rỗng còn mang được.

   **Và Plan vẫn không được nặng thêm.** `useExercises()` phải đi qua
   `needsLibrary`, nên mở sheet rồi đọc "Tổng quan" — đường đi thường gặp nhất
   — không gọi mạng thêm một lượt nào.

   Lối hỏng nó canh không phải "ai đó xoá tab". Là: ai đó thêm một tab thứ năm
   vào `TABS` cho đủ hình, và quên viết nhánh nội dung cho nó. Lúc ấy bấm vào
   ra một tờ giấy trắng, và không có gì trên màn nói rằng đó là lỗi. */
CASES++;
const tabIds = [...sheet.matchAll(/\{ id: '([a-z]+)', key: 'nEgTab/g)].map((m) => m[1]);
const missingPanel = tabIds.filter(
  (id) => id !== 'overview' && !new RegExp(`tab === '${id}'`).test(sheet),
);
const missingEmpty = ['nEgNoMuscles', 'nEgNoEquipment', 'nEgNoRelated'].filter(
  (k) => !sheet.includes(`i18n.${k}`),
);
const realTabs = [
  tabIds.length === 4 ? null : `\`TABS\` đọc ra ${tabIds.length} mục, phải đúng bốn`,
  /accessibilityRole="tab"\s*\n\s*accessibilityState=\{\{ selected: on \}\}/.test(sheet)
    ? null
    : 'viên tab không còn mang `accessibilityRole="tab"` kèm `accessibilityState={{ selected }}`',
  /*
    ── và `aria-selected` là vế THỨ HAI, vì vế thứ nhất không tới được web ──

    Đo trên bản dựng thật: `accessibilityState={{ selected }}` ra ĐÚNG không
    thuộc tính nào trên react-native-web — bốn viên chỉ có `role`, `aria-label`
    và `tabindex`. Nên trên web cả bốn đọc lên giống hệt nhau.

    `aria-selected` là bí danh chính thức của React Native cho cùng trạng thái
    ấy và được ưu tiên hơn `accessibilityState` trên native, nên nó đúng ở cả
    hai nền — và nó là vế DUY NHẤT `guide6.mjs` đo được.
  */
  /aria-selected=\{on\}/.test(sheet)
    ? null
    : 'viên tab thôi mang `aria-selected` — trên web `accessibilityState` không ra thuộc tính nào, nên bốn viên đọc lên giống hệt nhau',
  /onPress=\{\(\) => \{[\s\S]{0,120}?setTab\(id\);/.test(sheet)
    ? null
    : 'bấm vào một viên tab không còn gọi `setTab(id)`',
  /const overview = tab === 'overview';/.test(sheet)
    ? null
    : 'nội dung "Tổng quan" không còn được che sau `tab === \'overview\'`',
  missingPanel.length ? `tab không có nhánh nội dung nào: ${missingPanel.join(', ')}` : null,
  missingEmpty.length ? `thiếu câu "chưa có" riêng của tab: ${missingEmpty.join(', ')}` : null,
  /const needsLibrary = tab === 'equipment' \|\| tab === 'related';/.test(sheet)
    ? null
    : '`needsLibrary` không còn được dẫn ra từ tab đang chọn',
  /useExercises\(needsLibrary\)/.test(sheet)
    ? null
    : '`useExercises()` không còn đi qua `needsLibrary` — mở sheet là gọi mạng, kể cả khi không ai mở hai tab ấy',
  /sameEquipment\(rows, subject, lang\)/.test(sheet) && /sameMuscle\(rows, subject, lang\)/.test(sheet)
    ? null
    : 'hai danh sách "bài khác" không còn đến từ `lib/guide-related.ts`',
  /style=\{\[styles\.tabs[\s\S]{0,200}?pointerEvents="none"/.test(sheet)
    ? 'hàng tab lại mang `pointerEvents="none"` — tức lại là một hình vẽ'
    : null,
].filter(Boolean);
if (realTabs.length) {
  problems.push(
    `${SHEET}: hàng tab đã trượt — ${realTabs.join('; ')}. Bốn tab này bấm được theo quyết định của chủ ` +
      'dự án, và cái giá của quyết định ấy là mỗi tab phải có thứ THẬT để hiện: hình giải phẫu từ ' +
      '`muscleArtKeysFor`, và bài khác cùng dụng cụ / cùng nhóm cơ lọc ra từ thư viện đã nằm sẵn trong ' +
      'cache. Một tab bấm vào ra tờ giấy trắng còn tệ hơn một tab không bấm được: cái sau nói thật rằng ' +
      'chưa có gì, cái trước thì không nói gì cả',
  );
}

/* ── 25 · giao diện là HỆ QUẢ của mô hình, không của TÊN BÀI ──

   Đặt hàng viết hẳn ra lối hỏng nó cấm: *"Never special-case a single
   exercise… `if (exerciseName === "Dumbbell Curl")`"*. Nó không phải một giả
   định xa xôi — màn này từng có một nhánh đúng-cho-ảnh-demo, và cách nhanh
   nhất để một ảnh chụp khớp với ảnh tham chiếu là dựng riêng cho cái tên trong
   ảnh ấy.

   Luật đọc MÃ chứ không đọc văn xuôi: đoạn chú thích ngay trên `media` trong
   `exercise-guide.tsx` NHẮC tới lối hỏng này, nên một regex trần sẽ phạt đúng
   người đang ghi lại bài học — cùng cái bẫy đã ghi ở đầu tệp. */
CASES++;
const nameBranch = stripComments(sheet)
  .split('\n')
  .filter((l) => /\b(?:name|title)\s*===\s*['"`]/.test(l));
if (nameBranch.length) {
  problems.push(
    `${SHEET}: có nhánh giao diện rẽ theo TÊN BÀI — ${nameBranch.length} chỗ. Giao diện phải là hệ quả của ` +
      'mô hình dữ liệu (`media.type`, `muscleKeys`, `equipmentKey`), không của một chuỗi tên: một nhánh ' +
      'đúng-cho-"Dumbbell Curl" làm ảnh chụp khớp ảnh tham chiếu và làm mọi bài còn lại sai, mà không gì kêu',
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
      'danh sách dùng hai glyph khác hình chứ không chỉ khác màu. BỐN TAB bấm được, mỗi tab có một nhánh ' +
      'nội dung mang đúng `id` của nó và một câu "chưa có" của riêng nó; thư viện chỉ được hỏi khi tab cần ' +
      'tới nó (`needsLibrary`), và không nhánh giao diện nào rẽ theo tên bài',
  );
}

if (problems.length) {
  console.error('hướng dẫn bài tập CÓ LỖI:\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}
