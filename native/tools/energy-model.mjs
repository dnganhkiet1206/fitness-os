/**
 * Calo tiêu hao của một buổi tập: chạy MÃ THẬT, so với chính nguồn của nó.
 *
 * ── lỗi đã sửa ──
 *
 * `workout_sessions` không có cột calo nào, và `daily_logs.active_kcal` thì
 * CHỈ `use-health-sync` ghi. Trên một máy không nối Apple Health — kể cả bản
 * dựng `EXPO_FREE_TEST=1`, vốn gỡ hẳn HealthKit — người dùng tập xong, ghi đủ
 * set, mà vòng Move đứng ở 0 vĩnh viễn.
 *
 * Và Apple Health một mình không cứu được: iPhone không đeo đồng hồ lấy năng
 * lượng hoạt động từ bộ đồng xử lý chuyển động, tức từ bước chân, mà nâng tạ
 * gần như không đẻ ra bước nào. Muốn Health biết buổi gym thì phải có Apple
 * Watch hoặc phải có ai đó GHI một `HKWorkout` vào Health — mà ASCND ghi buổi
 * tập vào cơ sở dữ liệu của chính nó.
 *
 * ── bước này gác cái gì ──
 *
 * Không gác "con số có đẹp không" — nó gác ba khẳng định mà nếu ai đó sửa cho
 * "gọn hơn" thì app sẽ nói sai với người dùng:
 *
 *   1. MET phải ĐÚNG BẰNG số của 2024 Adult Compendium. Một hằng số không tra
 *      được nguồn là một hằng số sẽ bị chỉnh cho "hợp lý hơn".
 *   2. Phải là `MET − 1`, không phải `MET`. Vòng Move là năng lượng TRÊN mức
 *      nghỉ; lấy tổng là đếm hai lần đúng phần BMR mà mục tiêu calo đã tính.
 *   3. Thiếu dữ liệu phải ra `null`, không ra `0` — luật của A11.
 *
 * Và một khẳng định nữa, ở tầng vòng tròn: Health dương thì Health THẮNG, và
 * hai nguồn KHÔNG được cộng dồn.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import Module from 'node:module';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(path.join(tmpdir(), 'ascnd-energy-'));
const problems = [];

try {
  /* Một tsconfig TẠM chứ không phải cờ dòng lệnh: `--ignoreConfig` bỏ luôn
     bảng `paths`, mà `tsc` lại không có cờ `--paths`. Không có bảng ấy thì
     `@/lib/...` không phân giải được và cả năm tệp đều không biên dịch. */
  const cfg = path.join(out, 'tsconfig.json');
  const LIB = path.join(NATIVE, 'src', 'lib');
  writeFileSync(
    cfg,
    JSON.stringify({
      compilerOptions: {
        module: 'commonjs',
        target: 'es2020',
        skipLibCheck: true,
        esModuleInterop: true,
        outDir: out,
        rootDir: LIB,
        /* `paths` TUYỆT ĐỐI, không kèm `baseUrl`: từ TS 5 thì `paths` phân
           giải theo chỗ đặt tsconfig khi không có `baseUrl`, mà `baseUrl` nay
           đã bị đánh dấu ngừng dùng và `tsc` THOÁT KHÁC 0 vì nó — kể cả khi đã
           sinh ra đủ tệp. Một bước gác đỏ vì cảnh báo của trình biên dịch là
           một bước gác nói dối. */
        paths: { '@/*': [path.join(NATIVE, 'src', '*')] },
      },
      files: ['energy', 'activity', 'prescription', 'fitness-calc', 'plausible'].map((f) =>
        path.join(LIB, `${f}.ts`),
      ),
    }),
  );
  execFileSync('npx', ['tsc', '-p', cfg], { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] });

  /* `tsc` KHÔNG viết lại bí danh `@/` trong mã sinh ra — đó là giới hạn đã
     biết của nó, không phải cấu hình sai. Nên phân giải chúng ở đây. */
  const orig = Module._resolveFilename;
  Module._resolveFilename = function (req, ...rest) {
    if (req.startsWith('@/lib/')) return path.join(out, `${req.slice('@/lib/'.length)}.js`);
    return orig.call(this, req, ...rest);
  };

  const req = createRequire(import.meta.url);
  const E = req(path.join(out, 'energy.js'));
  const A = req(path.join(out, 'activity.js'));

  const eq = (what, got, want) => {
    if (got !== want) problems.push(`${what}: ${got}, đáng lẽ ${want}`);
  };

  /* ── 1. MET đúng bằng Compendium 2024, mục Conditioning Exercise ── */
  const COMPENDIUM = {
    light: 3.5, // 02054 kháng lực, nhiều bài, 8–15 lần ở các mức tạ khác nhau
    moderate: 5.0, // 02052 squat/deadlift, chậm hoặc bung sức
    vigorous: 6.0, // 02050 powerlifting hoặc thể hình, gắng sức mạnh
    bodyweight: 3.0, // 02056 bài trọng lượng cơ thể, chung
    bodyweightHard: 6.5, // 02057 bài trọng lượng cơ thể, cường độ cao
  };
  for (const [k, v] of Object.entries(COMPENDIUM)) {
    eq(`MET \`${k}\` khớp Compendium`, E.RT_MET[k], v);
  }
  eq('không có MET lạ nào được thêm', Object.keys(E.RT_MET).length, Object.keys(COMPENDIUM).length);

  /* ── 2. chọn MET theo RPE và theo có tạ hay không ── */
  const loaded = [{ reps: 8, weight: 60 }];
  const bw = [{ reps: 12, weight: 0 }];
  eq('có tạ, RPE thấp → light', E.metForSession(loaded, 3), COMPENDIUM.light);
  eq('có tạ, RPE 5 → moderate', E.metForSession(loaded, 5), COMPENDIUM.moderate);
  eq('có tạ, RPE 7 → moderate', E.metForSession(loaded, 7), COMPENDIUM.moderate);
  eq('có tạ, RPE 8 → vigorous', E.metForSession(loaded, 8), COMPENDIUM.vigorous);
  eq('không RPE → light, không đoán cao', E.metForSession(loaded, null), COMPENDIUM.light);
  eq('không tạ → nhánh trọng lượng cơ thể', E.metForSession(bw, 5), COMPENDIUM.bodyweight);
  eq('không tạ, RPE 9 → bodyweight cường độ cao', E.metForSession(bw, 9), COMPENDIUM.bodyweightHard);
  /* set khởi động không rep thì không được kéo buổi tạ thành buổi tay không */
  eq(
    'set 0 rep không đổi được nhánh',
    E.metForSession([{ reps: 0, weight: 0 }, { reps: 5, weight: 100 }], 9),
    COMPENDIUM.vigorous,
  );

  /* ── 3. công thức: MET − 1 trên mức nghỉ của CHÍNH người đó ── */
  const P = { weight_kg: 80, height_cm: 178, age: 30, sex: 'male' };
  // Mifflin-St Jeor: 10×80 + 6.25×178 − 5×30 + 5 = 1767.5 → 1768
  const BMR = 1768;
  const want = Math.round(((5.0 - 1) * BMR * 45) / 1440);
  eq('45 phút, RPE 6, 80 kg', E.sessionActiveKcal(loaded, 6, 45, P), want);

  /* Và nó phải KHÁC hẳn bản dùng tổng — nếu ai đổi `met - 1` thành `met` thì
     bước này đỏ, vì chênh lệch đúng bằng phần BMR của quãng thời gian ấy. */
  const gross = Math.round((5.0 * BMR * 45) / 1440);
  if (E.sessionActiveKcal(loaded, 6, 45, P) === gross) {
    problems.push(
      'đang tính bằng TỔNG (`met`) chứ không phải phần trên mức nghỉ (`met - 1`) — ' +
        `${gross} thay vì ${want}. Vòng Move là năng lượng trên mức nghỉ, nên đây là đếm hai lần BMR`,
    );
  }

  /* Và phải khác bản hằng số 3,5 — mốc để thấy bước hiệu chỉnh còn nguyên. */
  const standard35 = Math.round((5.0 - 1) * 3.5 * (80 / 200) * 45);
  if (E.sessionActiveKcal(loaded, 6, 45, P) === standard35) {
    problems.push(
      'đang dùng hằng số 3,5 ml/kg/phút thay vì mức nghỉ Mifflin-St Jeor của chính người dùng — ' +
        'đó là bước hiệu chỉnh mà chính nhóm tác giả Compendium khuyến nghị, và bỏ nó đi thì con số ' +
        'thổi phồng có hệ thống ở nhóm ít vận động nhất',
    );
  }

  /* ── 4. thiếu dữ liệu ra `null`, không ra 0 (luật A11) ── */
  eq('không hồ sơ → null', E.sessionActiveKcal(loaded, 6, 45, null), null);
  eq('không phút → null', E.sessionActiveKcal(loaded, 6, 0, P), null);
  eq('thiếu chiều cao → null', E.sessionActiveKcal(loaded, 6, 45, { ...P, height_cm: 0 }), null);
  eq('hồ sơ rỗng → null', E.energyProfileFrom(null), null);
  eq('thiếu dob → null', E.energyProfileFrom({ weight_kg: 80, height_cm: 178, dob: null }), null);
  eq(
    'dob năm 2199 → null, không ra tuổi âm',
    E.energyProfileFrom({ weight_kg: 80, height_cm: 178, dob: '2199-01-01', sex: 'male' }),
    null,
  );
  /* `sets` là JSONB tự do — một hàng không phải mảng không được làm nổ chỗ này */
  eq('sets không phải mảng → null', E.sessionKcalOf({ sets: { a: 1 }, session_rpe: 6 }, P), null);
  eq('hàng rỗng → null', E.sessionKcalOf(null, P), null);

  /* ── 5. ở tầng vòng tròn: Health thắng, và KHÔNG cộng dồn ── */
  const ring = (moveKcal, estimatedMoveKcal) =>
    A.activityModel({
      moveKcal,
      estimatedMoveKcal,
      healthMinutes: null,
      loggedMinutes: 0,
      steps: 0,
      stepsTarget: 10000,
    }).rings.find((r) => r.key === 'move');

  eq('Health có số → lấy Health', ring(412, 250).current, 412);
  eq('…và ghi nhãn là ĐO ĐƯỢC', ring(412, 250).source, 'measured');
  eq('Health không có → lấy ước lượng', ring(null, 250).current, 250);
  eq('…và ghi nhãn là ƯỚC LƯỢNG', ring(null, 250).source, 'estimated');
  eq('không có gì cả → 0 và "none"', ring(null, null).current, 0);
  eq('…nguồn là none chứ không phải measured', ring(null, null).source, 'none');
  if (ring(412, 250).current === 412 + 250) {
    problems.push('đang CỘNG DỒN Health với ước lượng — đó là đếm hai lần buổi tập');
  }
} catch (e) {
  problems.push(`không chạy được mã thật: ${String(e.message ?? e).slice(0, 400)}`);
} finally {
  rmSync(out, { recursive: true, force: true });
}

if (problems.length) {
  console.error('calo tiêu hao CÓ LỖI:\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}

console.log(
  'calo tiêu hao OK — CHẠY THẬT `lib/energy.ts` và `lib/activity.ts` chứ không chép hằng số. Năm giá trị ' +
    'MET được so với đúng số của 2024 Adult Compendium (mã 02050/02052/02054/02056/02057), và thêm một MET ' +
    'lạ cũng đỏ; chọn MET theo RPE đổi nhánh ở 5 và 8, và một set 0 rep không kéo được buổi tạ thành buổi ' +
    'tay không. Công thức là `(MET − 1) × BMR/1440 × phút`: `− 1` vì vòng Move là năng lượng TRÊN mức nghỉ, ' +
    'nên đổi sang tổng là đếm hai lần BMR (68 kcal cho một buổi 45 phút ở MET 5) và bước này đỏ; còn mức ' +
    'nghỉ lấy Mifflin-St Jeor của chính người dùng chứ không lấy hằng số 3,5 ml/kg/phút — bước hiệu chỉnh ' +
    'mà chính nhóm tác giả Compendium khuyến nghị — và quay về hằng số cũng đỏ. Thiếu dữ liệu ra `null` chứ ' +
    'không ra 0 ở tám ca gồm dob năm 2199 và `sets` không phải mảng. Ở tầng vòng tròn: Health dương thì ' +
    'Health thắng và được ghi nhãn "đo được", không có Health thì ước lượng và ghi nhãn "ước lượng", và hai ' +
    'nguồn KHÔNG cộng dồn — cộng là đếm hai lần buổi tập ở đúng nhóm đã đo cẩn thận nhất',
);
