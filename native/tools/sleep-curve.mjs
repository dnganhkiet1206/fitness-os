/**
 * Ngủ ĐỦ là điểm cao nhất. Ngủ thêm không mua được điểm.
 *
 * ── lỗi nó bắt ──
 *
 * `computeSleepScore` cũ tăng đơn điệu theo thời lượng:
 *
 *     score = 90 + min(10, (ratio - 1) * 20)
 *
 * Chạy nó ra bảng, mục tiêu 8 giờ:
 *
 *      8h → 90     10h → 95     12h → 100     14h → 100
 *
 * Ngủ đúng mục tiêu được 90; ngủ 14 tiếng được điểm tuyệt đối. Người dùng hỏi
 * "thẻ ngủ 10/10 mà thẻ sẵn sàng chỉ 90/100" — và câu trả lời thật không phải
 * "hai thang khác nhau" mà là đường cong chấm sai chiều.
 *
 * ── vì sao đó là sai, không phải một lựa chọn ──
 *
 * Quan hệ giữa thời lượng ngủ và rủi ro là hình chữ U. Phân tích gộp 79 đoàn
 * hệ: < 7 giờ tăng tử vong mọi nguyên nhân 14%, ≥ 9 giờ tăng 34%. Hai bên còn
 * không đối xứng — mỗi giờ TRÊN 7 mang RR 1,13, mỗi giờ DƯỚI 7 mang RR 1,06.
 *
 * ── vì sao LÁI ENGINE THẬT ──
 *
 * `computeSleepScore` không được xuất ra, nên luật này gọi `computeReadiness`
 * với một ngày chỉ khác nhau ở thời lượng ngủ và đọc `subscores.sleep`. Chép
 * lại công thức vào đây thì bản chép sẽ xanh trong khi engine đã lệch — đúng
 * cái bẫy mà `score-doc.mjs` được viết ra để chặn ở phía tài liệu.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(path.join(tmpdir(), 'sleep-curve-'));
try {
  execFileSync(
    'npx',
    ['tsc', 'src/lib/readiness-engine.ts', '--ignoreConfig', '--outDir', out,
      '--rootDir', 'src', '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck', '--lib', 'es2020'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
  );
} catch {
  /* import ngoài không phân giải được; bản emit vẫn được ghi ra. */
}
const { computeReadiness } = createRequire(import.meta.url)(path.join(out, 'lib/readiness-engine.js'));

const problems = [];
const TARGET = 480;
const base = {
  hrv_today: 60,
  rhr_today: 58,
  sleep_target_min: TARGET,
  sleep_debt_7d_min: 0,
  training_load_7d: 9000,
  training_load_28d: 36000,
  training_days_28d: 28,
  illness_flag: false,
  hrv_history_28d: [60, 60, 60, 62, 58, 61, 59],
  rhr_history_28d: [58, 58, 58, 60, 62],
};
const at = (hours) =>
  computeReadiness({ ...base, sleep_min_lastnight: Math.round(hours * 60) })?.subscores?.sleep;

/* Bước 0,25 giờ từ 4 tới 14: đủ dày để thấy một đỉnh đặt sai chỗ. */
const hours = [];
for (let h = 4; h <= 14 + 1e-9; h += 0.25) hours.push(Math.round(h * 100) / 100);
const scores = hours.map(at);

if (scores.some((v) => typeof v !== 'number')) {
  problems.push('engine không trả về `subscores.sleep` cho một ngày có ghi ngủ — luật này đang không kiểm gì');
} else {
  /* ── 1. đỉnh nằm ở MỤC TIÊU, không ở đâu xa hơn ── */
  const best = Math.max(...scores);
  const atTarget = at(TARGET / 60);
  if (atTarget < best) {
    const where = hours[scores.indexOf(best)];
    problems.push(
      `ngủ đúng mục tiêu (${TARGET / 60}h) được ${atTarget} điểm, trong khi ${where}h được ${best} — ` +
        'đường cong đang thưởng cho ngủ QUÁ mục tiêu. Quan hệ thời lượng–rủi ro là hình chữ U: ' +
        'ngủ ≥ 9 giờ tăng tử vong mọi nguyên nhân 34%, cao hơn cả ngủ < 7 giờ (14%)',
    );
  }

  /* ── 2. đủ giờ là điểm TRỌN VẸN ──
     Đây là vế người dùng hỏi thẳng: thẻ ngủ ghi 10/10 thì thẻ sẵn sàng không
     được ghi 90/100 cho cùng một đêm đủ giấc. */
  if (atTarget !== 100) {
    problems.push(
      `ngủ đúng mục tiêu chỉ được ${atTarget}/100 — "đủ giờ" phải là điểm trọn vẹn, ` +
        'nếu không thì không đêm nào đạt được điểm tối đa bằng cách ngủ đúng',
    );
  }

  /* ── 3. qua mục tiêu thì KHÔNG BAO GIỜ đi lên ── */
  const iTarget = hours.indexOf(TARGET / 60);
  for (let i = iTarget + 1; i < scores.length; i++) {
    if (scores[i] > scores[i - 1] + 1e-9) {
      problems.push(
        `điểm TĂNG khi ngủ thêm: ${hours[i - 1]}h → ${scores[i - 1]}, ${hours[i]}h → ${scores[i]}. ` +
          'Quá mục tiêu, thêm giờ không được cộng điểm',
      );
      break;
    }
  }

  /* ── 4. dưới mục tiêu thì ngủ thêm VẪN tốt hơn ──
     Không được sửa vế trên bằng cách làm phẳng cả đường cong. */
  for (let i = 1; i <= iTarget; i++) {
    if (scores[i] < scores[i - 1] - 1e-9) {
      problems.push(
        `điểm GIẢM khi ngủ thêm ở phía dưới mục tiêu: ${hours[i - 1]}h → ${scores[i - 1]}, ` +
          `${hours[i]}h → ${scores[i]}`,
      );
      break;
    }
  }

  /*
    ── 5. dưới mục tiêu, ngủ ÍT phải chấm THẤP hơn thật sự ──

    Luật 4 chỉ cấm đường cong ĐI XUỐNG ở phía dưới mục tiêu. Phép thử ngược cho
    thấy nó chưa đủ: thay cả dải 0,85–1,0 bằng hằng số 100 thì đường cong phẳng
    lì, đỉnh vẫn "đúng chỗ", và bước kiểm vẫn XANH — trong khi lúc ấy ngủ 6,8
    giờ và ngủ 8 giờ được chấm y hệt nhau.

    Nên mỗi bước một giờ ở phía dưới phải nhích lên thật. 5 điểm là ngưỡng thấp:
    bản thật nhích 6–33 điểm mỗi giờ, còn một đường cong phẳng thì nhích 0.
  */
  for (let h = Math.ceil(4); h + 1 <= TARGET / 60 + 1e-9; h += 1) {
    const lo = at(h);
    const hi = at(h + 1);
    if (hi - lo < 5) {
      problems.push(
        `dưới mục tiêu, thêm một giờ ngủ gần như không đổi điểm: ${h}h → ${lo}, ${h + 1}h → ${hi}. ` +
          'Đường cong phẳng thì đỉnh nằm đúng chỗ mà vẫn không phân biệt được ngủ đủ với ngủ thiếu',
      );
      break;
    }
  }

  /* ── 6. ngủ rất dài vẫn không phải một đêm thức trắng ── */
  const veryLong = at(14);
  const veryShort = at(4);
  if (veryLong <= veryShort) {
    problems.push(
      `ngủ 14h (${veryLong}) không được chấm thấp hơn hoặc bằng ngủ 4h (${veryShort}) — ` +
        'ngủ dài là lệch mục tiêu, không phải mất ngủ',
    );
  }
}

if (problems.length) {
  console.error('đường cong điểm ngủ sai:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
const show = [4, 6.8, 7.5, 8, 9, 10, 11, 14].map((h) => `${h}h→${at(h)}`).join('  ');
console.log(
  `đường cong điểm ngủ OK — LÁI engine thật qua computeReadiness ở ${hours.length} mốc thời lượng ` +
    `(4h→14h, bước 15 phút), không chép lại công thức: đỉnh nằm đúng ở mục tiêu, đủ giờ được 100 trọn ` +
    `vẹn, qua mục tiêu không mốc nào đi lên, dưới mục tiêu mỗi giờ thêm phải nhích ít nhất 5 điểm ` +
    `(một đường cong PHẲNG từng lọt qua luật chỉ-cấm-đi-xuống), và ngủ 14h vẫn cao ` +
    `hơn ngủ 4h. Bản cũ cho 8h→90 và 12h→100, tức thưởng cho ngủ quá mục tiêu — trong khi phân tích ` +
    `gộp 79 đoàn hệ cho thấy ngủ ≥9 giờ tăng tử vong 34%, cao hơn ngủ <7 giờ (14%).  ${show}`,
);
