/**
 * Mức tạ từng bài: buổi GẦN NHẤT so với buổi TRƯỚC ĐÓ (Kiệt 28/10).
 *
 * ── vì sao ──
 *
 * Coach chỉ thấy `volume_load` (tổng khối lượng) của mỗi buổi, nên nói về
 * progressive overload bằng "khối lượng 728 kg" — trong khi điều người tập hỏi
 * là "bench lần này nâng được bao nhiêu so với lần trước". Tổng khối lượng còn
 * ra 0 với bài không tạ, và Coach đọc thành "chưa ghi tạ".
 *
 * ── quy ước ──
 *
 * - Set khởi động (`warmup`) không tính.
 * - Set "đỉnh" của một bài trong một buổi: tạ nặng nhất; bằng tạ thì nhiều reps hơn.
 * - Bài không tạ (mọi set `weight` = 0): set đỉnh là set nhiều reps nhất, `kg` = 0.
 * - Bài theo thời gian (`durationSec`, không reps): bỏ qua — không so được bằng tạ.
 * - Thay đổi chỉ tính khi có buổi trước; không có thì `previous` = null (lần đầu).
 */

export interface WorkoutRow {
  date_time: string;
  sets: unknown;
}

export interface TopSet {
  date: string;
  kg: number;
  reps: number;
  sets: number;
}

export interface ExerciseProgress {
  exercise: string;
  bodyweight: boolean;
  last: TopSet;
  previous: TopSet | null;
  change_kg: number | null;
  change_reps: number | null;
}

interface SetRow {
  exerciseName?: unknown;
  weight?: unknown;
  reps?: unknown;
  warmup?: unknown;
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
/* 0,1 kg: tạ ghi bằng lb lưu thành kg lẻ (35 lb = 15,88 kg) — Coach đọc "15,88 kg",
   "tăng 2,52 kg". Một chữ số thập phân là đủ cho mọi bước tạ thật. */
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Set đỉnh của MỘT bài trong MỘT buổi; null khi bài ấy không có set làm việc nào có reps. */
function topSet(sets: SetRow[], date: string): TopSet | null {
  const work = sets.filter((s) => s.warmup !== true && num(s.reps) > 0);
  if (!work.length) return null;
  let best = work[0];
  for (const s of work) {
    const w = num(s.weight), bw = num(best.weight);
    if (w > bw || (w === bw && num(s.reps) > num(best.reps))) best = s;
  }
  return { date, kg: round1(num(best.weight)), reps: Math.round(num(best.reps)), sets: work.length };
}

/**
 * `rows`: buổi tập mới → cũ (như câu chọn của ai-coach). `localDay` đổi `date_time`
 * sang ngày của người dùng. Trả tối đa `limit` bài, bài tập gần đây nhất trước.
 */
export function exerciseProgress(
  rows: WorkoutRow[],
  localDay: (iso: string) => string,
  limit = 12,
): ExerciseProgress[] {
  // tên bài (chuẩn hoá) → các buổi, mới → cũ
  const byExercise = new Map<string, { name: string; sessions: TopSet[] }>();
  for (const row of rows) {
    if (!Array.isArray(row.sets)) continue;
    const date = localDay(row.date_time);
    const groups = new Map<string, { name: string; sets: SetRow[] }>();
    for (const raw of row.sets as SetRow[]) {
      if (!raw || typeof raw !== "object") continue;
      const name = typeof raw.exerciseName === "string" ? raw.exerciseName.trim() : "";
      if (!name) continue;
      const key = name.toLocaleLowerCase();
      const g = groups.get(key) ?? { name, sets: [] };
      g.sets.push(raw);
      groups.set(key, g);
    }
    for (const [key, g] of groups) {
      const t = topSet(g.sets, date);
      if (!t) continue;
      const e = byExercise.get(key) ?? { name: g.name, sessions: [] };
      e.sessions.push(t);
      byExercise.set(key, e);
    }
  }
  const out: ExerciseProgress[] = [];
  for (const { name, sessions } of byExercise.values()) {
    const [last, previous = null] = sessions;
    const bodyweight = sessions.every((s) => s.kg === 0);
    out.push({
      exercise: name,
      bodyweight,
      last,
      previous,
      change_kg: previous && !bodyweight ? round1(last.kg - previous.kg) : null,
      change_reps: previous ? last.reps - previous.reps : null,
    });
  }
  out.sort((a, b) => (a.last.date < b.last.date ? 1 : a.last.date > b.last.date ? -1 : 0));
  return out.slice(0, limit);
}
