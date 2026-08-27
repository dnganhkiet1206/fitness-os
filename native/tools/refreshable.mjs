/**
 * Kéo xuống để tải lại: có thật, và có ở nơi người ta sẽ kéo.
 *
 * ── thứ được tìm thấy ──
 *
 * Trong cả ứng dụng có ĐÚNG MỘT màn hình mang `RefreshControl`: Today. Ba mươi
 * màn còn lại đọc dữ liệu server và không màn nào phản ứng với cú kéo xuống.
 *
 * Không màn nào nói dối — không có vòng xoay giả nào quay rồi không làm gì cả —
 * nhưng đó không phải điều an ủi được ai. "Không có gì xảy ra" và "đã tải lại
 * xong, không có gì mới" trông y hệt nhau trên màn hình, nên người dùng không
 * có cách nào biết cử chỉ ấy tồn tại hay không. Họ kéo, không thấy gì, và kết
 * luận app treo.
 *
 * Nó được tìm ra lúc đi tìm một lỗi khác: màn Today hỏng BỐ CỤC (xem
 * `card-deck.tsx`), người dùng kéo để tải lại và không sửa được gì. Cú kéo ấy
 * chạy thật và dữ liệu về thật; thứ hỏng không phải dữ liệu. Nhưng câu hỏi đi
 * kèm — "kéo xuống có thật sự tải lại không hay chỉ là lừa" — hoá ra có một câu
 * trả lời đáng lo hơn cả câu hỏi: ở hai mươi chín màn thì không có gì để lừa
 * cả, vì không có gì ở đó.
 *
 * ── luật ──
 *
 * Một màn đọc dữ liệu server thì phải mời được cú kéo. `<Screen refreshable>`
 * là cách bật; scaffold lo phần còn lại, kể cả chỗ vẽ vòng xoay, thứ đã sai một
 * lần rồi (`(tabs)/index.tsx` ghi lại: vòng xoay vẽ ở đỉnh KHUNG scroll view,
 * nằm sau Dynamic Island, nên cú kéo có tải lại mà không nhìn thấy gì).
 *
 * ── và cú kéo phải làm việc thật ──
 *
 * Một `refreshControl` gọi vào một hàm không đọc lại gì mới đúng là "lừa". Nên
 * phần thứ hai kiểm chính `screen.tsx`: handler phải gọi `invalidateQueries`,
 * và phải hạ cờ trong `finally` — một lời hứa hỏng mà không có `finally` để
 * lại một vòng xoay quay mãi mãi trên một trang không còn tải gì, tức là một
 * lời nói dối lâu hơn hẳn một cú kéo không làm gì.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const problems = [];

/**
 * Màn KHÔNG cần cú kéo, mỗi cái một lý do đã đọc tay.
 *
 * Danh sách tên chứ không phải một mẫu chung: một mẫu sẽ lặng lẽ che luôn màn
 * tiếp theo mà không ai đọc.
 */
const EXEMPT = new Map([
  ['src/app/legal.tsx', 'chữ tĩnh, không đọc gì từ server'],
  ['src/app/change-password.tsx', 'một biểu mẫu — kéo xuống giữa lúc gõ không tải lại được gì'],
  ['src/app/koa-debug.tsx', 'màn gỡ lỗi, không phải màn người dùng'],
  ['src/app/mascot-room.tsx', 'căn phòng có cử chỉ riêng; một cú kéo ở đây tranh với chúng'],
  /* Các màn ghi/sửa: nội dung là thứ ĐANG GÕ, không phải thứ vừa đọc về. Tải
     lại giữa chừng không làm mới được gì và vòng xoay chỉ đánh lạc hướng. */
  ['src/app/log-meal.tsx', 'biểu mẫu ghi'],
  ['src/app/log-workout.tsx', 'biểu mẫu ghi'],
  ['src/app/log-sleep.tsx', 'biểu mẫu ghi'],
  ['src/app/log-biometrics.tsx', 'biểu mẫu ghi'],
  ['src/app/log-measurement.tsx', 'biểu mẫu ghi'],
  ['src/app/edit-profile.tsx', 'biểu mẫu sửa'],
  ['src/app/workout-builder.tsx', 'biểu mẫu dựng buổi tập'],
  ['src/app/food-editor.tsx', 'biểu mẫu sửa'],
  ['src/app/scan-food.tsx', 'màn camera'],
  ['src/app/scan-barcode.tsx', 'màn camera'],
  ['src/app/koa-sheet.tsx', 'tấm trượt, không phải trang'],
  ['src/app/ai-coach.tsx', 'khung chat — lịch sử tự về, và kéo lên là cuộn ngược'],
  ['src/app/(tabs)/assistant.tsx', 'trang tràn viền có thanh hỏi ở đáy, không có vùng cuộn thường'],
  /* Today không dùng `Screen`: nó có scaffold riêng và `RefreshControl` riêng,
     với `progressViewOffset` mà scaffold sau này chép lại. */
  ['src/app/(tabs)/index.tsx', 'scaffold riêng, đã tự mang RefreshControl'],
]);

const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', 'src/app'],
  { cwd: NATIVE, encoding: 'utf8' },
)
  .split('\n')
  .filter((f) => f.endsWith('.tsx'))
  .filter((f) => existsSync(path.join(NATIVE, f)));

let on = 0;
let exempt = 0;
let scanned = 0;
for (const f of files) {
  const code = strip(read(f));
  if (!/<Screen\b/.test(code)) continue;
  scanned++;
  /* "Đọc dữ liệu server" = có gọi một hook trong `@/hooks`. Đó là chỗ duy nhất
     app này đọc Supabase từ màn hình, nên nó là phép thử thật chứ không phải
     một phỏng đoán theo tên tệp. */
  const readsServer = /from '@\/hooks\//.test(code) && /\buse[A-Z]\w*\(/.test(code);
  const has = /<Screen\b[^>]*\brefreshable\b/.test(code) || /refreshControl=/.test(code);
  if (has) on++;
  if (EXEMPT.has(f)) {
    exempt++;
    if (has) {
      problems.push(
        `${f} vừa được miễn ("${EXEMPT.get(f)}") vừa bật kéo-để-tải-lại — một trong hai là sai`,
      );
    }
    continue;
  }
  if (readsServer && !has) {
    problems.push(
      `${f}: đọc dữ liệu server mà <Screen> không có \`refreshable\`. Người dùng SẼ kéo — ` +
        'và "không có gì xảy ra" với "đã tải lại, không có gì mới" trông y hệt nhau, nên cú kéo ' +
        'chết đọc ra thành app treo. Bật nó, hoặc thêm vào EXEMPT kèm lý do',
    );
  }
}
if (scanned < 20) {
  console.error(`phép tự kiểm hỏng — chỉ thấy ${scanned} màn dùng <Screen>, đừng tin kết quả`);
  process.exit(1);
}

/* ── và cú kéo thật sự tải lại ── */
{
  const s = strip(read('src/components/ascnd/screen.tsx'));
  const body = /const onRefresh = useCallback\(async \(\) => \{([\s\S]*?)\n  \}, \[/.exec(s)?.[1];
  if (!body) {
    problems.push('src/components/ascnd/screen.tsx: không tìm thấy handler onRefresh');
  } else {
    if (!/invalidateQueries\(/.test(body)) {
      problems.push(
        'src/components/ascnd/screen.tsx: onRefresh không gọi invalidateQueries — vòng xoay quay ' +
          'rồi không đọc lại gì. ĐÓ mới là cú kéo lừa người dùng',
      );
    }
    if (!/finally\s*\{[^}]*setRefreshing\(false\)/.test(body)) {
      problems.push(
        'src/components/ascnd/screen.tsx: cờ refreshing không hạ trong `finally` — một lời hứa ' +
          'hỏng để lại vòng xoay quay mãi trên một trang không còn tải gì',
      );
    }
  }
  /* Cả ba nhánh scaffold đều phải mang nó: một nhánh quên là cú kéo biến mất ở
     đúng một kiểu bố cục, và không ai biết kiểu nào cho tới khi mở đúng màn đó.
     `plan-actuals.mjs` đã đếm ScrollView theo cách này cho `keyboardAware`. */
  const scrolls = [...s.matchAll(/<ScrollView\n/g)].length;
  const controls = [...s.matchAll(/refreshControl=\{refresher\(/g)].length;
  if (scrolls !== controls) {
    problems.push(
      `src/components/ascnd/screen.tsx: ${scrolls} ScrollView nhưng chỉ ${controls} cái nhận ` +
        'refreshControl — nhánh bị quên sẽ im lặng không có cú kéo',
    );
  }
}

if (problems.length) {
  console.error('kéo-để-tải-lại CÓ LỖI:\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}

console.log(
  `kéo-để-tải-lại OK — ${scanned} màn dùng <Screen>, ${on} màn mời được cú kéo, ${exempt} màn ` +
    'được miễn KÈM LÝ DO (biểu mẫu ghi/sửa, màn camera, chữ tĩnh, khung chat). Trước bản này con ' +
    'số ấy là 1: đúng một màn trong cả app có RefreshControl, ba mươi màn còn lại đọc dữ liệu ' +
    'server và không màn nào phản ứng với cú kéo — không màn nào nói dối, nhưng "không có gì xảy ' +
    'ra" và "đã tải lại, không có gì mới" trông y hệt nhau. Và handler được ĐỌC ra: nó gọi ' +
    'invalidateQueries thật, hạ cờ trong `finally` (không thì vòng xoay quay mãi), và cả ba nhánh ' +
    'scaffold đều nhận refreshControl',
);
