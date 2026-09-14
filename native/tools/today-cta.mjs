/**
 * Thẻ "Hôm nay" ở tab Tập luyện mời đúng một việc, và không mời việc đã xong.
 *
 * ── lỗi đã sửa ──
 *
 * Chủ dự án khoanh đỏ thẻ và hỏi: buổi tập đã hoàn thành rồi thì còn hiện "Ghi
 * buổi tập" làm gì nữa.
 *
 * Đi đọc thì thẻ có BỐN tình huống nhưng chỉ ba câu trả lời, nên một câu phải
 * gánh hai việc — và câu bị gánh là `nLogFree`:
 *
 *     hôm nay nghỉ, chưa tập      → "Ghi buổi tập"    ĐÚNG
 *     hôm nay ĐÃ TẬP XONG         → "Ghi buổi tập"    SAI
 *
 * Điều kiện viết thẳng trong JSX là `planned || day?.is_rest`, và nó không hề
 * hỏi `done`. Nên ngay dưới dòng "✓ Đã tập hôm nay" là một viên nút cao 48
 * điểm chạy hết bề ngang — phần tử to nhất thẻ — mang đúng chữ mà app dùng cho
 * "hôm nay bạn chưa ghi".
 *
 * Ca thứ tư còn sai lặng lẽ hơn: ngày TRỐNG mà đã tập thì nút hiện "Chọn buổi
 * tập" và dẫn sang màn xếp lịch — mời người ta lên kế hoạch cho một ngày đã
 * tập xong.
 *
 * ── và vì sao KHÔNG gỡ nút ──
 *
 * Chính chủ dự án đã đặt luật ngược lại: "không ghi cho ngày chưa tới là đúng,
 * chỉ cho ghi thêm trong ngày đó nếu phát sinh buổi tập mới". Gỡ nút là lấy
 * mất đường ra ấy khỏi cả tab — đúng lỗi "app trông như đã đóng cửa" mà tấm kế
 * hoạch vừa phải sửa bằng một liên kết thoát. Thứ sai là cái NHÃN.
 *
 * ── nên bước gác này canh cả hai chiều ──
 *
 * Một chiều: đã tập xong thì KHÔNG được mang nhãn của việc chưa làm.
 * Chiều kia: đã tập xong thì vẫn PHẢI còn một đường sang sổ ghi tự do.
 *
 * Chỉ canh chiều đầu thì bản sửa "gỡ quách nút đi" cũng xanh, và đó là bản
 * sửa sai.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(path.join(tmpdir(), 'today-cta-'));
const read = (p) => readFileSync(path.join(NATIVE, p), 'utf8');

const blank = (s) => s.replace(/[^\n]/g, ' ');
const stripComments = (s) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, lead) => lead + blank(m.slice(lead.length)));

try {
  execFileSync(
    'npx',
    ['tsc', 'src/lib/today-cta.ts', '--ignoreConfig', '--outDir', out,
      '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const { todayCta } = createRequire(import.meta.url)(path.join(out, 'today-cta.js'));

  const problems = [];

  /*
    Cả MƯỜI SÁU tổ hợp, không phải bốn ca tôi nghĩ ra.

    Cái sai ở trên là một tổ hợp không ai nghĩ tới — "đã tập" gặp "có kế hoạch"
    — chứ không phải một dòng ai đó gõ nhầm. Liệt kê tay thì đúng cái tổ hợp bị
    quên sẽ lại bị quên ở đây.
  */
  const flags = [false, true];
  let cases = 0;
  for (const unknown of flags)
    for (const planned of flags)
      for (const rest of flags)
        for (const done of flags) {
          cases++;
          const got = todayCta({ unknown, planned, rest, done });
          const want = unknown
            ? 'none'
            : done
              ? 'extra'
              : planned
                ? 'start'
                : rest
                  ? 'log-free'
                  : 'pick';
          if (got !== want) {
            problems.push(
              `{unknown:${unknown}, planned:${planned}, rest:${rest}, done:${done}} → "${got}", đáng lẽ "${want}"`,
            );
          }
          /*
            Luật chính, phát biểu tách rời khỏi bảng trên: đã tập xong thì
            không câu trả lời nào được là một lời mời làm việc đã làm. Bảng
            trên có thể bị sửa cho khớp một bản sai; dòng này thì không.
          */
          if (!unknown && done && got !== 'extra') {
            problems.push(
              `đã tập hôm nay mà nút vẫn là "${got}" — đó là lời mời ghi lại buổi vừa ghi`,
            );
          }
        }

  const card = stripComments(read('src/components/ascnd/today-training.tsx'));

  /* Quyết định phải đến TỪ hàm, không phải được dựng lại trong JSX. */
  if (!/todayCta\(\{/.test(card)) {
    problems.push(
      'today-training: không gọi todayCta — điều kiện lại nằm trong JSX, đúng chỗ đã quên mất `done` một lần',
    );
  }
  if (/planned \|\| day\?\.is_rest/.test(card)) {
    problems.push(
      'today-training: còn điều kiện `planned || day?.is_rest` chọn nhãn nút — chính biểu thức ấy không hỏi `done` và sinh ra lỗi này',
    );
  }
  /* Nhãn "đã tập xong" phải là nhãn RIÊNG, không dùng chung với nhãn chính. */
  if (!/cta === 'extra'/.test(card) || !/i18n\.nTodayExtra/.test(card)) {
    problems.push(
      'today-training: không có nhánh riêng cho trạng thái đã tập xong với nhãn nTodayExtra',
    );
  }
  const extraBranch = card.slice(card.indexOf("cta === 'extra'"), card.indexOf("cta === 'log-free'"));
  if (/nLogFree/.test(extraBranch)) {
    problems.push(
      'today-training: nhánh đã-tập-xong vẫn mang nhãn nLogFree — đó là chữ dành cho ngày CHƯA ghi',
    );
  }
  /*
    Và chiều còn lại: đường ra vẫn phải còn. Không có dòng này thì bản sửa "gỡ
    quách nút đi" cũng xanh — mà đó là bản sửa lấy mất chỗ ghi buổi phát sinh
    khỏi cả tab, đúng luật chủ dự án đã đặt.
  */
  if (!/nav\.push\('\/log-workout'\)/.test(extraBranch)) {
    problems.push(
      'today-training: trạng thái đã tập xong không còn đường sang sổ ghi tự do — buổi phát sinh trong ngày mất chỗ ghi',
    );
  }

  /* Nhãn phải có ở CẢ HAI thứ tiếng, kẻo bản Việt rơi về khoá. */
  const strings = read('src/lib/native-strings.ts');
  const labels = [...strings.matchAll(/\n  nTodayExtra: '([^']+)'/g)].map((m) => m[1]);
  if (labels.length !== 2) {
    problems.push(`nTodayExtra chỉ có ${labels.length} bản dịch, cần 2`);
  } else if (labels[0] === labels[1]) {
    problems.push(`nTodayExtra giống hệt nhau ở hai thứ tiếng ("${labels[0]}") — một bản chưa được dịch`);
  }

  if (problems.length) {
    console.error('thẻ hôm nay mời sai việc:\n');
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }

  console.log(
    `thẻ hôm nay OK — ${cases} tổ hợp CHẠY THẬT: đã tập xong thì nút không bao giờ mang nhãn của việc chưa làm (kể cả ngày trống, vốn mời "Chọn buổi tập" cho một ngày đã tập), nhưng đường sang sổ ghi tự do vẫn còn nguyên cho buổi phát sinh; nhãn có đủ hai thứ tiếng`,
  );
} finally {
  rmSync(out, { recursive: true, force: true });
}
