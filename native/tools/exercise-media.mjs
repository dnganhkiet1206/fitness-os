/**
 * Media của bài tập: BỐN trạng thái, và giao diện là hệ quả của chúng.
 *
 *     node tools/exercise-media.mjs
 *
 * ── vì sao luật này CHẠY hàm chứ không đọc mã ──
 *
 * `lib/exercise-media.ts` thuần: không React, không Supabase, không theme. Nên
 * nó biên dịch rồi GỌI được, và mọi vế dưới đây là một câu hỏi có đáp án cụ
 * thể — "ba hàng ảnh ra trạng thái gì", "video chưa biết thời lượng thì
 * `displayDuration` trả gì" — chứ không phải một phép dò chuỗi.
 *
 * ── lỗi nó canh, và cả ba đều đã có thật trong repo này ──
 *
 * **Một — đoán kiểu bằng đuôi tệp.** Bản trước phân biệt ảnh/video bằng regex
 * trên URL, vì cột `exercises.video_url` là một URL trần và đó là tín hiệu duy
 * nhất tồn tại. Phép đoán ấy sai ở đúng trường hợp thường gặp nhất mà sản phẩm
 * này sẽ có: một URL ký sẵn của Supabase Storage không mang đuôi nào. Nay kiểu
 * được LƯU (`exercise_media.kind`), và luật đòi đường mới không bao giờ đoán —
 * một hàng `kind:'video'` với đuôi `.png` vẫn phải ra VIDEO.
 *
 * **Hai — một con số giữ chỗ thành nguồn thời lượng.** Lượt trước có
 * `DEMO_SECS = 5` để dựng nhãn `0:05` của ảnh tham chiếu. Đặt hàng cấm thẳng,
 * và luật này canh cả hai chiều: ảnh KHÔNG bao giờ có thời lượng, và video
 * chưa đọc được metadata trả `null` chứ không trả một con số.
 *
 * **Ba — `0` là một con số.** `duration_s` về từ PostgREST dưới dạng CHUỖI (nó
 * là `NUMERIC`), và `Number('')` là 0. Một phép ép thẳng biến "chưa biết"
 * thành "0 giây" — đúng giá trị mà cột ấy có `CHECK (> 0)` để cấm.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
let CASES = 0;

const out = mkdtempSync(path.join(tmpdir(), 'exercise-media-'));
let mod;
try {
  execFileSync(
    'npx',
    ['tsc', 'src/lib/exercise-media.ts', '--ignoreConfig', '--outDir', out,
      '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: 'pipe' },
  );
  mod = await import(path.join(out, 'exercise-media.js'));
} catch (e) {
  console.error('media bài tập CÓ LỖI:\n');
  console.error(`  • không biên dịch được \`lib/exercise-media.ts\`: ${e.message.split('\n')[0]}`);
  rmSync(out, { recursive: true, force: true });
  process.exit(1);
}
const { resolveExerciseMedia, hasMedia, showsDots, displayDuration, clockLabel,
  mediaLabel, captionedItems } = mod.default ?? mod;

const img = (uri, position = 0, alt = null) =>
  ({ kind: 'image', uri, position, duration_s: null, poster_uri: null, alt });
const vid = (uri, duration_s = null, position = 0) =>
  ({ kind: 'video', uri, position, duration_s, poster_uri: null, alt: null });

const eq = (what, got, want) => {
  CASES++;
  if (got !== want) problems.push(`${what}: ra \`${String(got)}\`, phải là \`${String(want)}\``);
};

/* ══ 1 · BỐN TRẠNG THÁI ══ */
eq('không hàng nào và không có cột cũ → none', resolveExerciseMedia([], null).type, 'none');
eq('một hàng ảnh → image_single', resolveExerciseMedia([img('a.png')], null).type, 'image_single');
eq('hai hàng ảnh → image_gallery',
  resolveExerciseMedia([img('a.png', 0), img('b.png', 1)], null).type, 'image_gallery');
eq('năm hàng ảnh → image_gallery',
  resolveExerciseMedia([0, 1, 2, 3, 4].map((i) => img(`${i}.png`, i)), null).type, 'image_gallery');
eq('một hàng video → video', resolveExerciseMedia([vid('a.mp4')], null).type, 'video');

/* ══ 2 · KIỂU ĐƯỢC LƯU, KHÔNG ĐƯỢC ĐOÁN ══
   Vế trung tâm của cả lượt này. Một hàng khai `video` với đuôi `.png` vẫn phải
   ra VIDEO, và một hàng khai `image` với đuôi `.mp4` vẫn phải ra ẢNH. Nếu ai đó
   nhét lại phép đoán đuôi tệp vào đường mới, đúng hai vế này đỏ. */
eq('kind=video thắng đuôi .png', resolveExerciseMedia([vid('x.png')], null).type, 'video');
eq('kind=image thắng đuôi .mp4', resolveExerciseMedia([img('x.mp4')], null).type, 'image_single');
eq('URL ký sẵn không đuôi, kind=image → ảnh',
  resolveExerciseMedia([img('https://x.supabase.co/storage/v1/object/sign/m/abc?token=ey')], null).type,
  'image_single');

/* ══ 3 · THỨ TỰ theo `position`, không theo thứ tự máy chủ trả về ══ */
CASES++;
{
  const m = resolveExerciseMedia([img('c.png', 2), img('a.png', 0), img('b.png', 1)], null);
  const got = m.items.map((x) => x.uri).join(',');
  if (got !== 'a.png,b.png,c.png') problems.push(`thứ tự theo position: ra \`${got}\``);
}

/* ══ 4 · THỜI LƯỢNG ══ */
eq('ảnh đơn KHÔNG có thời lượng',
  displayDuration(resolveExerciseMedia([img('a.png')], null)), null);
eq('bộ ảnh KHÔNG có thời lượng',
  displayDuration(resolveExerciseMedia([img('a.png', 0), img('b.png', 1)], null)), null);
eq('không media thì KHÔNG có thời lượng',
  displayDuration(resolveExerciseMedia([], null)), null);
eq('video chưa biết thời lượng → null, KHÔNG phải một con số',
  displayDuration(resolveExerciseMedia([vid('a.mp4', null)], null)), null);
eq('video biết thời lượng → đúng con số ấy',
  displayDuration(resolveExerciseMedia([vid('a.mp4', 12)], null)), 12);
/* PostgREST trả `NUMERIC` dưới dạng CHUỖI — đây là hình dạng thật của dữ liệu. */
eq('duration_s dạng chuỗi "7.5" đọc được',
  displayDuration(resolveExerciseMedia([vid('a.mp4', '7.5')], null)), 7.5);
eq('duration_s = 0 KHÔNG thành "0 giây"',
  displayDuration(resolveExerciseMedia([vid('a.mp4', 0)], null)), null);
eq('duration_s = "" KHÔNG thành 0',
  displayDuration(resolveExerciseMedia([vid('a.mp4', '')], null)), null);
eq('duration_s rác KHÔNG thành một con số',
  displayDuration(resolveExerciseMedia([vid('a.mp4', 'nope')], null)), null);
eq('duration_s âm bị từ chối',
  displayDuration(resolveExerciseMedia([vid('a.mp4', -3)], null)), null);

/* ══ 5 · CHẤM TRANG chỉ ở bộ ảnh ══ */
eq('không media → không chấm', showsDots(resolveExerciseMedia([], null)), false);
eq('ảnh ĐƠN → không chấm', showsDots(resolveExerciseMedia([img('a.png')], null)), false);
eq('bộ ảnh → có chấm',
  showsDots(resolveExerciseMedia([img('a.png', 0), img('b.png', 1)], null)), true);
eq('video → không chấm', showsDots(resolveExerciseMedia([vid('a.mp4')], null)), false);

/* ══ 6 · KHÔNG MEDIA thì không có gì để mở ══ */
eq('none: hasMedia false', hasMedia(resolveExerciseMedia([], null)), false);
eq('ảnh: hasMedia true', hasMedia(resolveExerciseMedia([img('a.png')], null)), true);
eq('hàng rác (thiếu uri) vẫn ra none',
  resolveExerciseMedia([{ kind: 'image', uri: '  ', position: 0 }], null).type, 'none');
eq('hàng rác (kind lạ) vẫn ra none',
  resolveExerciseMedia([{ kind: 'sticker', uri: 'a.png', position: 0 }], null).type, 'none');

/* ══ 7 · ĐƯỜNG LUI cho cột `video_url` cũ ══
   Đây là chỗ DUY NHẤT phép đoán đuôi tệp còn được phép, vì cột ấy không mang
   kiểu. Bỏ nó đi sẽ làm trắng media của mọi dòng đang chạy. */
eq('không hàng nào + cột cũ đuôi ảnh → ảnh đơn',
  resolveExerciseMedia([], 'https://x/a.gif').type, 'image_single');
eq('không hàng nào + cột cũ đuôi video → video',
  resolveExerciseMedia([], 'https://x/a.mp4').type, 'video');
eq('cột cũ chuỗi rỗng → none', resolveExerciseMedia([], '   ').type, 'none');
eq('HÀNG BẢNG thắng cột cũ',
  resolveExerciseMedia([img('new.png')], 'https://x/old.mp4').type, 'image_single');

/* ══ 8 · MỘT BỘ LÀ MỘT KIỂU ══ */
eq('bộ trộn: hàng đầu là ảnh → cả bộ là ảnh',
  resolveExerciseMedia([img('a.png', 0), vid('b.mp4', null, 1)], null).type, 'image_single');
eq('bộ trộn: hàng đầu là video → cả bộ là video',
  resolveExerciseMedia([vid('a.mp4', null, 0), img('b.png', 1)], null).type, 'video');

/* ══ 8b · CHÚ THÍCH: chữ ở TẦNG NỘI DUNG, không ở trong ảnh ══

   Đặt hàng dựng cả lượt này quanh một luật: *"MEDIA ASSET ≠ INSTRUCTIONAL
   TEXT."* Lý do là đa ngữ — một tấm ảnh có chữ tiếng Anh nướng vào pixel chỉ
   dùng được cho một nửa người dùng, và sửa được bằng đúng một cách là vẽ lại.

   Nên bốn vế dưới đây kiểm đúng một tính chất: ĐỔI NGÔN NGỮ ĐỔI CHỮ, KHÔNG ĐỔI
   `uri`. Và luật lùi ngôn ngữ ở đây phải là CÙNG luật của nội dung hướng dẫn —
   `pickLocale` trong `guide-content.ts` — chứ không phải một bản sao thứ hai. */
const cap = (uri, position, captions) =>
  ({ kind: 'image', uri, position, duration_s: null, poster_uri: null, alt: null,
    exercise_media_content: captions });
const BOTH = [
  { locale: 'vi', title: 'Tư thế bắt đầu', description: 'Đứng thẳng, hai chân rộng bằng vai.' },
  { locale: 'en', title: 'Starting position', description: 'Stand tall, feet shoulder-width apart.' },
];
{
  const vi = resolveExerciseMedia([cap('01.webp', 0, BOTH)], null, 'vi');
  const en = resolveExerciseMedia([cap('01.webp', 0, BOTH)], null, 'en');
  eq('vi → tiêu đề tiếng Việt', vi.items[0].title, 'Tư thế bắt đầu');
  eq('en → tiêu đề tiếng Anh', en.items[0].title, 'Starting position');
  eq('ĐỔI NGÔN NGỮ KHÔNG ĐỔI TẤM ẢNH', vi.items[0].uri === en.items[0].uri && vi.items[0].uri, '01.webp');
  eq('mô tả cũng đổi theo', en.items[0].description, 'Stand tall, feet shoulder-width apart.');
}
eq('chưa dịch sang tiếng Anh → lùi về tiếng Việt, KHÔNG ra rỗng',
  resolveExerciseMedia([cap('01.webp', 0, [BOTH[0]])], null, 'en').items[0].title, 'Tư thế bắt đầu');
eq('dòng tiếng Anh có locale đúng nhưng TIÊU ĐỀ rỗng → vẫn lùi về tiếng Việt',
  resolveExerciseMedia([cap('01.webp', 0, [BOTH[0], { locale: 'en', title: '  ', description: 'x' }])],
    null, 'en').items[0].title, 'Tư thế bắt đầu');
eq('chưa ai viết chú thích → `title` là null, không phải chuỗi rỗng',
  resolveExerciseMedia([img('01.webp')], null, 'vi').items[0].title, null);
eq('không chú thích thì `description` là chuỗi rỗng, không phải null',
  resolveExerciseMedia([img('01.webp')], null, 'vi').items[0].description, '');
eq('đường lui `video_url` cũ KHÔNG mượn chú thích của ai',
  resolveExerciseMedia([], 'https://x/y.gif', 'vi').items[0].title, null);

/* ══ 8c · NHÃN TRỢ NĂNG đến từ chú thích, KHÔNG từ tên tệp ══
   Đặt hàng: *"Do NOT use filenames as accessibility labels."* Và nó phải đổi
   theo ngôn ngữ — một `alt` viết bằng tiếng Anh được đọc nguyên văn cho người
   đang để app ở tiếng Việt, nên chú thích THẮNG `alt`. */
{
  const vi = resolveExerciseMedia([cap('01-hero.webp', 0, BOTH)], null, 'vi').items[0];
  const en = resolveExerciseMedia([cap('01-hero.webp', 0, BOTH)], null, 'en').items[0];
  eq('nhãn tiếng Việt', mediaLabel('Dumbbell Curl', vi), 'Dumbbell Curl — Tư thế bắt đầu');
  eq('nhãn tiếng Anh', mediaLabel('Dumbbell Curl', en), 'Dumbbell Curl — Starting position');
  CASES++;
  if (/01-hero|\.webp/.test(mediaLabel('Dumbbell Curl', vi))) {
    problems.push('nhãn trợ năng chứa TÊN TỆP — nó phải đến từ nội dung đã bản địa hoá');
  }
}
eq('chưa có chú thích → `mediaLabel` trả null để chỗ gọi lùi về `alt`',
  mediaLabel('Dumbbell Curl', resolveExerciseMedia([img('a.png')], null).items[0]), null);
eq('không có tấm nào → null, không ném',
  mediaLabel('Dumbbell Curl', resolveExerciseMedia([], null).items[0]), null);

/* ══ 8d · mục "các bước" chỉ gồm những tấm CÓ chữ ══ */
eq('bốn tấm, hai có chú thích → hai bước',
  captionedItems(resolveExerciseMedia(
    [cap('1.webp', 0, BOTH), img('2.webp', 1), cap('3.webp', 2, BOTH), img('4.webp', 3)], null, 'vi',
  )).length, 2);
eq('không tấm nào có chú thích → KHÔNG dựng mục bước',
  captionedItems(resolveExerciseMedia([img('1.webp', 0), img('2.webp', 1)], null, 'vi')).length, 0);

/* ══ 9 · NHÃN ĐỒNG HỒ ══ */
eq('5 giây → 0:05', clockLabel(5), '0:05');
eq('65 giây → 1:05', clockLabel(65), '1:05');
eq('0,4 giây làm tròn lên 0:01, KHÔNG ra 0:00', clockLabel(0.4), '0:01');

/* ══ 10 · `DEMO_SECS` KHÔNG được quay lại làm nguồn thời lượng ══
   Đặt hàng: *"Verify that DEMO_SECS cannot become the production duration
   source."* Nó đã bị gỡ; luật này giữ cho nó không mọc lại ở hai tệp media. */
CASES++;
{
  const { readFileSync } = await import('node:fs');
  const src = ['src/components/ascnd/guide-media.tsx', 'src/app/media-viewer.tsx']
    .map((f) => readFileSync(path.join(NATIVE, f), 'utf8'));
  const { inCode } = await import('./lib/code-mask.mjs');
  const bad = src.filter((s) => inCode(s, 'DEMO_SECS')).length;
  if (bad) {
    problems.push(
      'một hằng thời lượng giữ chỗ (`DEMO_SECS`) quay lại trong mã media. Ảnh demo LÀ MỘT TẤM ẢNH, và ' +
        'ảnh không có thời lượng — cái nhãn ấy không phải "một con số tạm", nó là một lời khẳng định sai ' +
        'về LOẠI của thứ đang hiện. Thời lượng chỉ có hai nguồn thật: `duration_s` trong bảng, và trình ' +
        'giải mã lúc chạy',
    );
  }
}

rmSync(out, { recursive: true, force: true });

if (!problems.length) {
  console.log(
    `media bài tập OK — ${CASES} ca, CHẠY THẬT \`resolveExerciseMedia\`. Bốn trạng thái phân biệt được ` +
      '(none · ảnh đơn · bộ ảnh · video) và giao diện đọc chúng chứ không đoán: kiểm cả hai chiều rằng ' +
      '`kind` được LƯU thắng đuôi tệp — `kind:video` với đuôi `.png` vẫn ra video, và một URL ký sẵn ' +
      'không đuôi vẫn ra đúng loại nó khai. Thời lượng: ảnh và bộ ảnh không bao giờ có; video chưa đọc ' +
      'được metadata trả `null` chứ không trả một con số; `0`, chuỗi rỗng, chuỗi rác và số âm đều KHÔNG ' +
      'thành "0 giây" (cột là `NUMERIC` nên PostgREST trả CHUỖI, và `Number("")` là 0 — đó là cách lỗi ' +
      'ấy xảy ra). Chấm trang chỉ ở bộ ảnh. Thứ tự theo `position`, không theo thứ tự máy chủ trả về. ' +
      'Hàng bảng thắng cột `video_url` cũ, và cột cũ vẫn là đường lui nên không dòng dữ liệu nào đang ' +
      'chạy bị làm trắng. Và `DEMO_SECS` không quay lại được làm nguồn thời lượng. CHÚ THÍCH nằm ở tầng ' +
      'nội dung chứ không trong ảnh: đổi vi↔en đổi tiêu đề, mô tả và nhãn trợ năng mà `uri` không đổi ' +
      'một ký tự; luật lùi ngôn ngữ là CÙNG `pickLocale` của nội dung hướng dẫn, nên một bản dịch thiếu ' +
      'ra chữ tiếng Việt chứ không ra màn trống; và nhãn trợ năng không bao giờ là tên tệp',
  );
}

if (problems.length) {
  console.error('media bài tập CÓ LỖI:\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}
