/**
 * Coach trả lời progressive overload theo MỨC TẠ TỪNG BÀI (Kiệt 28/10).
 *
 * Trước đây `ai-coach` chỉ gửi `volume_load` của mỗi buổi nên Coach nói "khối
 * lượng 728 kg" và gọi buổi không tạ là "volume bằng 0". Bước này chạy THẬT
 * `_shared/progress.ts` (Node bỏ kiểu TS) và kiểm ai-coach gửi + dặn dùng nó.
 *
 *   node --experimental-strip-types apps/ios/tools/native-ai-exercise-progress.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };

// A. Hàm dùng chung, chạy thật.
const { exerciseProgress } = await import(pathToFileURL(path.join(ROOT, 'supabase/functions/_shared/progress.ts')).href);
const day = (iso) => iso.slice(0, 10);
const rows = [
  { date_time: '2026-10-26T10:00:00Z', sets: [
    { exerciseName: 'Bench Press', weight: 20, reps: 10, warmup: true },
    { exerciseName: 'Bench Press', weight: 62.5, reps: 8 }, { exerciseName: 'Bench Press', weight: 62.5, reps: 6 },
    { exerciseName: 'Push-up', weight: 0, reps: 18 }, { exerciseName: 'Plank', weight: 0, reps: 0, durationSec: 60 } ] },
  { date_time: '2026-10-23T10:00:00Z', sets: [{ exerciseName: 'Squat', weight: 80, reps: 5 }] },
  { date_time: '2026-10-21T10:00:00Z', sets: [
    { exerciseName: 'bench press', weight: 60, reps: 8 }, { exerciseName: 'Push-up', weight: 0, reps: 15 } ] },
];
const out = exerciseProgress(rows, day);
const by = Object.fromEntries(out.map((e) => [e.exercise.toLowerCase(), e]));
check(by['bench press']?.last.kg === 62.5 && by['bench press'].last.reps === 8 && by['bench press'].last.sets === 2,
  'A1: set đỉnh buổi gần nhất phải là 62,5 kg × 8, 2 set làm việc (bỏ set khởi động)');
check(by['bench press']?.previous?.kg === 60 && by['bench press'].change_kg === 2.5,
  'A2: so với buổi trước (tên không phân biệt hoa thường) phải +2,5 kg');
check(by['push-up']?.bodyweight === true && by['push-up'].change_kg === null && by['push-up'].change_reps === 3,
  'A3: bài không tạ so reps (+3), không so kg');
check(by.squat?.previous === null && by.squat.change_kg === null, 'A4: lần đầu → previous null');
check(!by.plank, 'A5: bài chỉ có thời gian bị bỏ');
check(out[0]?.last.date === '2026-10-26', 'A6: bài tập gần đây nhất đứng trước');
check(exerciseProgress([{ date_time: '2026-10-26T00:00:00Z', sets: null }], day).length === 0, 'A7: sets null → rỗng');
const lb = exerciseProgress([
  { date_time: '2026-10-26T00:00:00Z', sets: [{ exerciseName: 'DB Press', weight: 18.37, reps: 10 }] },
  { date_time: '2026-10-21T00:00:00Z', sets: [{ exerciseName: 'DB Press', weight: 15.88, reps: 9 }] },
], day)[0];
check(lb.last.kg === 18.4 && lb.previous.kg === 15.9 && lb.change_kg === 2.5,
  `A8: tạ đổi từ lb làm tròn 0,1 kg (18,4 / 15,9 / +2,5), được ${JSON.stringify(lb)}`);

// B. ai-coach gửi và dặn dùng nó.
const coach = read('supabase/functions/ai-coach/index.ts');
check(/exercise_progress:\s*exerciseProgress\(/.test(coach), 'B1: ai-coach phải gửi exercise_progress');
check(/eightWeeksAgo/.test(coach), 'B2: ai-coach phải đọc 8 tuần buổi tập cho exercise_progress');
check((coach.match(/exercise_progress \(/g) ?? []).length >= 2, 'B3: luật trả lời theo từng bài phải có ở cả nhánh en và vi');
check(/weight_unit/.test(coach), 'B4: ai-coach phải gửi đơn vị cân để viết mức tạ theo lb khi cần');

if (fails.length) {
  console.error('AI trả lời mức tạ từng bài:');
  for (const f of fails) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`AI trả lời mức tạ từng bài OK — chạy thật exerciseProgress (${out.length} bài: set đỉnh, bỏ khởi động, bài không tạ so reps, lần đầu) và ai-coach gửi + dặn dùng nó ở cả en / vi.`);
