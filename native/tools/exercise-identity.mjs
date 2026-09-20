/**
 * Danh tính bài tập có sống sót từ THƯ VIỆN xuống tới BUỔI TẬP ĐÃ GHI không.
 *
 *     node tools/exercise-identity.mjs
 *
 * ── chuỗi phải nguyên vẹn ──
 *
 *     exercises.id                       ← định nghĩa bài tập
 *         ↓  workout-builder ghi
 *     workout_templates.exercises[].exerciseId   (JSONB)
 *         ↓  TplExercise đọc
 *     expand() → SetRow.exerciseId
 *         ↓  nút Hoàn thành ghi
 *     workout_sessions.sets[].exerciseId         (JSONB)
 *
 * ── lỗi nó sinh ra để bắt, và lỗi ấy ĐÃ tồn tại ──
 *
 * Khoá ngoại luôn nằm trong dữ liệu: `workout-builder.tsx` ghi `exerciseId: ex.id`
 * từ đầu. Nhưng kiểu phía ĐỌC — `TplExercise` — không khai báo trường ấy, nên
 * `expand()` không đọc, `SetRow` không mang, và hai chỗ ghi buổi tập viết thẳng
 * `exerciseId: ''`. Khoá ngoại có trong cơ sở dữ liệu và bị đánh rơi ở tầng kiểu.
 *
 * `use-exercise-insights.ts` ghi lại hậu quả bằng chính lời của nó: *"Keyed by
 * name, because that is what a logged set carries — most sets have no exercise
 * id at all."*
 *
 * ── vì sao nó CHẠY mã thật chứ không đọc mã ──
 *
 * Một luật đọc mã chỉ chứng minh được mã có viết chữ `exerciseId` hay không.
 * Lượt trước trong repo này tôi đã viết đúng loại luật yếu ấy — nó tìm một
 * dòng KHAI BÁO và vẫn xanh khi thứ được khai báo bị gỡ khỏi chỗ DÙNG.
 *
 * Nên luật này trích nguyên văn `expand()` và hai hàm map ghi buổi tập ra khỏi
 * `day-plan.tsx`, biên dịch, rồi CHẠY chúng trên dữ liệu dựng sẵn. Sửa mã cho
 * rơi id thì phép chạy đổi kết quả, không phải phép tìm chuỗi đổi kết quả.
 *
 * ── điều luật này KHÔNG canh ──
 *
 * Nó không đòi `exerciseId` phải CÓ. Ba nguồn hợp lệ không có nó: template cũ,
 * bài thêm tay giữa buổi, và JSONB viết tay. Đường tra theo tên là đường lui
 * VĨNH VIỄN chứ không phải tạm — nên luật đòi ngược lại: thiếu id thì phải
 * chạy được, không được ném, và phải còn tên để tra.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DP = 'src/components/ascnd/day-plan.tsx';
const src = readFileSync(path.join(NATIVE, DP), 'utf8');

const problems = [];
let CASES = 0;

/** Cắt từ `from` tới dấu ngoặc nhọn đóng khớp với dấu mở đầu tiên sau nó. */
function block(text, from) {
  const open = text.indexOf('{', from);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(from, i + 1);
    }
  }
  return null;
}

/* ── trích NGUYÊN VĂN ba mẩu mã đang ship ── */
const expandAt = src.indexOf('function expand(');
const expandSrc = expandAt < 0 ? null : block(src, expandAt);

/** Hàm map của một chỗ ghi buổi tập, tìm theo câu lệnh chứa nó. */
const mapAfter = (anchor) => {
  const at = src.indexOf(anchor);
  if (at < 0) return null;
  const arrow = src.indexOf('.map((r) => ({', at);
  if (arrow < 0 || arrow - at > 400) return null;
  const body = block(src, src.indexOf('({', arrow) + 1);
  return body;
};
const appendMap = mapAfter('const extra = pendingRows');
const logMap = mapAfter('const sets = doneRows');

CASES++;
if (!expandSrc || !appendMap || !logMap) {
  problems.push(
    `${DP}: không trích được mã để chạy (expand=${!!expandSrc} · nối-thêm=${!!appendMap} · ghi-buổi=${!!logMap}). ` +
      'Không trích được thì luật này đang không kiểm gì cả — nó phải ĐỎ chứ không được lặng lẽ qua',
  );
}

if (expandSrc && appendMap && logMap) {
  const out = mkdtempSync(path.join(tmpdir(), 'ex-id-'));
  try {
    /*
      Một tệp TS nhỏ mang đúng ba mẩu mã thật. Các kiểu được khai lại ở đây chứ
      không import: `day-plan.tsx` kéo theo React Native, và mục tiêu là chạy ba
      hàm thuần chứ không dựng một cây component.
    */
    const shim = `
interface TplExercise { exerciseId?: string; exerciseName?: string; sets?: number; reps?: number; weight?: number; rpe?: number; restSeconds?: number; }
interface SetRow { key: string; exerciseId?: string; exerciseName: string; ordinal: number; of: number; weight: number; reps: number; plannedRest: number; plannedRpe: number; heads: boolean; adHoc?: string; }
const DEFAULT_REST = 90;
const DEFAULT_RPE = 7;

${expandSrc}

/* Hai hàm map, nguyên văn, bọc lại thành hàm gọi được. */
export const mapAppend = (r: SetRow, rpe: Record<string, number>) => (${appendMap});
export const mapLog = (r: SetRow, rpe: Record<string, number>) => (${logMap});
export { expand };
`;
    /* `performed()` và `rpe[...]` là biến ngoài của hai hàm map; thay bằng
       nguồn tối thiểu để chúng chạy được mà KHÔNG đụng vào phần đang đo. */
    const stub = shim
      .replace(/\.\.\.performed\(r\),/g, 'weight: r.weight, reps: r.reps,')
      .replace(/rpe\[r\.key\] \?\? r\.plannedRpe/g, '(rpe[r.key] ?? r.plannedRpe)');
    writeFileSync(path.join(out, 'ident.ts'), stub);
    try {
      execFileSync(
        'npx',
        /* `--ignoreConfig`: có `tsconfig.json` mà lại chỉ đích danh tệp trên dòng
           lệnh thì tsc dừng ở TS5112 và KHÔNG phát mã. Cùng cờ mà
           `exercise-intelligence.mjs` dùng, vì cùng một lý do. */
        ['tsc', path.join(out, 'ident.ts'), '--ignoreConfig', '--outDir', out,
         '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
        { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
      );
    } catch (e) {
      /* tsc có thể kêu về kiểu mà vẫn phát mã — giống cách
         `exercise-intelligence.mjs` và `score-doc.mjs` đã làm. Chỉ đỏ khi
         KHÔNG có tệp js nào ra. */
      void e;
    }
    const req = createRequire(import.meta.url);
    let mod;
    try {
      mod = req(path.join(out, 'ident.js'));
    } catch (e) {
      problems.push(`tools/exercise-identity.mjs: không dựng được mã trích ra — ${(e && e.message) || e}`);
    }

    if (mod) {
      const ID = '11111111-2222-3333-4444-555555555555';
      const rpeMap = {};

      /* ── A · template MỚI có id → Plan nhận ĐÚNG id ấy ── */
      CASES++;
      const newRows = mod.expand([{ exerciseId: ID, exerciseName: 'Dumbbell Curl', sets: 3, reps: 10, weight: 12 }]);
      if (newRows.length !== 3 || newRows.some((r) => r.exerciseId !== ID)) {
        problems.push(
          `${DP}: \`expand()\` KHÔNG mang \`exerciseId\` từ template sang \`SetRow\` — ` +
            `${newRows.length} hàng, id đọc được: ${JSON.stringify(newRows.map((r) => r.exerciseId))}. ` +
            'Khoá ngoại có trong JSONB mà bị đánh rơi ở tầng kiểu, đúng lỗi luật này sinh ra để chặn',
        );
      }

      /* ── B · ghi buổi tập mang id THẬT ── */
      for (const [vn, fn] of [['ghi buổi tập', mod.mapLog], ['nối thêm bài', mod.mapAppend]]) {
        CASES++;
        const wrote = fn(newRows[0], rpeMap);
        if (wrote.exerciseId !== ID) {
          problems.push(
            `${DP}: nhánh "${vn}" ghi \`exerciseId\` = ${JSON.stringify(wrote.exerciseId)} thay vì id thật. ` +
              'Buổi tập ghi xuống không có danh tính thì lịch sử chỉ còn tra được theo TÊN, và đổi tên một ' +
              'bài trong thư viện là làm đứt lịch sử của chính nó',
          );
        }
        CASES++;
        if (wrote.exerciseName !== 'Dumbbell Curl') {
          problems.push(`${DP}: nhánh "${vn}" làm mất \`exerciseName\` — tên vẫn là thứ để HIỂN THỊ và là khoá lui`);
        }
      }

      /* ── C · template CŨ không có id → vẫn chạy, vẫn còn tên ── */
      CASES++;
      const oldRows = mod.expand([{ exerciseName: 'Bench Press', sets: 2, reps: 5 }]);
      if (oldRows.length !== 2 || oldRows.some((r) => r.exerciseName !== 'Bench Press')) {
        problems.push(`${DP}: template CŨ (không có \`exerciseId\`) không còn dựng được hàng — đường lui theo tên đã hỏng`);
      }
      CASES++;
      if (oldRows.some((r) => r.exerciseId)) {
        problems.push(
          `${DP}: template cũ lại sinh ra \`exerciseId\` = ${JSON.stringify(oldRows[0].exerciseId)}. ` +
            'Phải là `undefined`: một id bịa ra sẽ tra không bao giờ thấy, và tệ hơn là nó ngăn đường lui ' +
            'theo tên được dùng',
        );
      }

      /* ── D · id rỗng / hỏng → KHÔNG ném, và không đội lốt id thật ── */
      for (const bad of ['', null, undefined, 0]) {
        CASES++;
        let rows;
        try {
          rows = mod.expand([{ exerciseId: bad, exerciseName: 'Pull-up', sets: 1 }]);
        } catch (e) {
          problems.push(`${DP}: \`expand()\` NÉM khi \`exerciseId\` là ${JSON.stringify(bad)} — ${(e && e.message) || e}`);
          continue;
        }
        if (rows[0] && rows[0].exerciseId) {
          problems.push(
            `${DP}: \`exerciseId\` ${JSON.stringify(bad)} lọt qua thành ${JSON.stringify(rows[0].exerciseId)}. ` +
              'Giá trị giả phải quy về `undefined` để đường lui theo tên được chạy',
          );
        }
        CASES++;
        const w = mod.mapLog(rows[0], rpeMap);
        if (w.exerciseId !== '') {
          problems.push(
            `${DP}: hàng không có id ghi xuống \`exerciseId\` = ${JSON.stringify(w.exerciseId)}; ` +
              'tầng lưu khai `exerciseId: string` bắt buộc nên nó phải là chuỗi rỗng, không phải `undefined`',
          );
        }
      }

      /* ── E · lịch sử theo TÊN không được yếu đi ── */
      CASES++;
      const keySrc = readFileSync(path.join(NATIVE, 'src/lib/exercise-key.ts'), 'utf8');
      if (!/\(name \?\? ''\)\.trim\(\)\.toLowerCase\(\)\.replace\(\/\\s\+\/g, ' '\)/.test(keySrc)) {
        problems.push(
          'src/lib/exercise-key.ts: `exerciseKey` đã đổi. Nó là khoá lịch sử của MỌI set đã ghi từ trước — ' +
            'đổi ngữ nghĩa của nó là viết lại quá khứ. Thêm đường tra theo id KHÔNG được phép nới cái này',
        );
      }
      CASES++;
      /* Plan vẫn tra thư viện/insight theo TÊN, không theo id. Đó là đường lui,
         và nó phải còn nguyên chừng nào còn template cũ. */
      if (!/insightFor\(block\.name\)/.test(src) || !/lastFor\(block\.name\)/.test(src)) {
        problems.push(
          `${DP}: đường tra theo TÊN đã bị gỡ khỏi thẻ bài tập. Template cũ và bài thêm tay không có id, nên ` +
            'bỏ đường lui là làm trắng lịch sử của chúng',
        );
      }
      CASES++;
      const ins = readFileSync(path.join(NATIVE, 'src/hooks/use-exercise-insights.ts'), 'utf8');
      if (!/exerciseKey\(e\.name\)/.test(ins)) {
        problems.push(
          'src/hooks/use-exercise-insights.ts: cầu nối thư viện→lịch sử thôi khoá theo tên. Mọi set đã ghi ' +
            'từ trước đều không có id, nên khoá theo id sẽ làm rỗng toàn bộ lịch sử cũ',
        );
      }
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

if (!problems.length) {
  console.log(
    `danh tính bài tập OK — ${CASES} ca, CHẠY THẬT ba mẩu mã trích nguyên văn ra khỏi \`${DP}\`: \`expand()\` ` +
      'và hai hàm map ghi buổi tập, biên dịch rồi gọi trên dữ liệu dựng sẵn. Chuỗi được canh: `exercises.id` → ' +
      '`workout_templates.exercises[].exerciseId` (JSONB) → `TplExercise` → `SetRow.exerciseId` → ' +
      '`workout_sessions.sets[].exerciseId`. Khoá ngoại LUÔN nằm trong dữ liệu — builder ghi `exerciseId: ex.id` ' +
      'từ đầu — nhưng kiểu phía đọc từng không khai báo nó, nên nó bị đánh rơi ở tầng kiểu và buổi tập ghi ' +
      'xuống với chuỗi rỗng. Luật KHÔNG đòi id phải có: template cũ, bài thêm tay và JSONB viết tay đều hợp lệ ' +
      'khi thiếu, và `workout_templates.exercises` không có ràng buộc khoá ngoại nào ở tầng CSDL. Nó đòi điều ' +
      'ngược lại — thiếu id thì không được ném, không được bịa ra một id, phải quy về `undefined` để đường tra ' +
      'theo TÊN được chạy, và `exerciseKey` phải giữ nguyên ngữ nghĩa vì nó là khoá lịch sử của mọi set đã ghi',
  );
}

if (problems.length) {
  console.error('danh tính bài tập CÓ LỖI:\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}
