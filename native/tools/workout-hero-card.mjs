/**
 * Workout hero card theo concept (2026-10-03).
 *
 * ── concept ──
 *
 * File `ASCND_Workout_Redesign_Concept_Source_of_Truth.md` là source of truth.
 * Hero card phải có:
 * - Eyebrow: "HÔM NAY · THỨ 7" (uppercase, muted)
 * - Title: tên buổi tập (large, bold)
 * - Ảnh workout bên phải
 * - Metadata: "3 bài · 9 sets" và "◷ ~25 phút"
 * - Progress bar + %
 * - CTA đen full-width: "▶ Bắt đầu buổi tập"
 * - Nút "..." góc trên phải
 * - WeekStrip nằm NGOÀI card
 *
 * ── 4 trạng thái ──
 *
 * - có kế hoạch, chưa tập → Bắt đầu (nút đặc đen)
 * - đã tập xong → Xem kết quả / Ghi thêm (nút nhạt)
 * - ngày nghỉ → UI nghỉ ngơi
 * - chưa có kế hoạch → Chọn buổi tập (nút nhạt)
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(NATIVE, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const problems = [];

const FILE = 'src/components/ascnd/today-training.tsx';
const code = strip(read(FILE));

/* ── 1. Hero card có đủ các phần theo concept ── */
const required = [
  ['eyebrow', /eyebrow/, 'thiếu eyebrow "HÔM NAY · THỨ 7"'],
  ['title', /styles\.title/, 'thiếu title tên buổi tập'],
  ['heroImage', /heroImage/, 'thiếu ảnh workout bên phải'],
  ['metadata', /metaRow/, 'thiếu metadata "3 bài · 9 sets"'],
  ['progress', /progressTrack|ProgressBar/, 'thiếu progress bar'],
  ['CTA', /nStartWorkout/, 'thiếu CTA "Bắt đầu buổi tập"'],
  ['overflow', /overflow/, 'thiếu nút "..." góc trên phải'],
];

for (const [name, pattern, msg] of required) {
  if (!pattern.test(code)) {
    problems.push(`${FILE} ${msg} (concept: hero card)`);
  }
}

/* ── 2. WeekStrip nằm NGOÀI GlassCard ── */
// Tìm vị trí của <WeekStrip và <GlassCard trong return
const weekStripIdx = code.indexOf('<WeekStrip');
const glassCardIdx = code.indexOf('<GlassCard');
if (weekStripIdx !== -1 && glassCardIdx !== -1 && weekStripIdx > glassCardIdx) {
  problems.push(
    `${FILE}: WeekStrip nằm TRONG GlassCard — theo concept, lịch tuần phải nằm NGOÀI card, riêng phía trên`,
  );
}

/* ── 3. CTA chính là nút đen full-width ── */
if (!/backgroundColor:\s*['"]#1a1a1a['"]/.test(code)) {
  problems.push(
    `${FILE}: CTA chính phải là nút đen (#1a1a1a) full-width theo concept`,
  );
}

/* ── 4. Đủ 4 trạng thái ── */
const states = ['start', 'extra', 'pick', 'log-free'];
for (const s of states) {
  if (!new RegExp(`cta === '${s}'`).test(code)) {
    problems.push(`${FILE}: thiếu xử lý trạng thái '${s}' (cần đủ 4: start/extra/pick/log-free)`);
  }
}

if (problems.length) {
  console.log('thẻ workout hero CÓ LỖI:\n');
  for (const p of problems.slice(0, 12)) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'thẻ workout hero OK — đủ eyebrow/title/ảnh/metadata/progress/CTA theo concept; ' +
    'WeekStrip ngoài card; CTA đen full-width; đủ 4 trạng thái',
);
