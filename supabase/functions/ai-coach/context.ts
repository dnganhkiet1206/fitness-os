/**
 * Khối `profile` trong ctx của ai-coach + luật an toàn thực phẩm.
 *
 * Tách khỏi `index.ts` để test được mà không khởi động server (`serve()` nằm
 * ở top-level của index). KOA-T02 (P0): trước đây khối profile chỉ gửi
 * name/goal/cân nặng/chiều cao/mức vận động/TDEE/macro/mục tiêu ngủ, nên
 * model không thấy dị ứng / món không thích / chế độ ăn và có thể gợi ý món
 * gây dị ứng — dù `profiles` đã có đủ 5 cột và row lấy bằng `select("*")`.
 */

/** Chỉ những cột `profiles` mà khối profile của coach dùng tới. */
export interface CoachProfileRow {
  name?: string | null;
  goal?: string | null;
  weight_kg?: number | null;
  units_weight?: string | null;
  height_cm?: number | null;
  activity_level?: string | null;
  training_level?: string | null;
  tdee_target_kcal?: number | null;
  macro_protein_g?: number | null;
  macro_carbs_g?: number | null;
  macro_fat_g?: number | null;
  macro_fiber_g?: number | null;
  sleep_target_hours?: number | null;
  allergies?: string[] | null;
  disliked_foods?: string[] | null;
  dietary_preference?: string | null;
  water_target_ml?: number | null;
}

/**
 * Khối profile gửi kèm mỗi lượt chat. `null` khi không có row.
 *
 * Trường an toàn vắng mặt thì ra `null` rõ ràng (prompt đã dạy: null là chưa
 * đo), không bao giờ bịa một danh sách rỗng hay một chế độ ăn mặc định.
 */
export function buildProfileContext(profile: CoachProfileRow | null) {
  if (!profile) return null;
  return {
    name: profile.name,
    goal: profile.goal,
    weight_kg: profile.weight_kg,
    /* Đơn vị cân người dùng chọn — mức tạ trong câu trả lời viết theo nó (28/10). */
    weight_unit: profile.units_weight === "lb" ? "lb" : "kg",
    height_cm: profile.height_cm,
    activity_level: profile.activity_level,
    training_level: profile.training_level,
    tdee_target: profile.tdee_target_kcal,
    macro_targets: {
      protein: profile.macro_protein_g,
      carbs: profile.macro_carbs_g,
      fat: profile.macro_fat_g,
      fiber: profile.macro_fiber_g,
    },
    sleep_target_hours: profile.sleep_target_hours,
    /* KOA-T02: 5 trường an toàn — dị ứng, món không thích, chế độ ăn, nước.
       Chất xơ nằm trong macro_targets (fiber), cùng chỗ với P/C/F. */
    allergies: profile.allergies ?? null,
    disliked_foods: profile.disliked_foods ?? null,
    dietary_preference: profile.dietary_preference ?? null,
    water_target_ml: profile.water_target_ml ?? null,
  };
}

/**
 * Luật không-bao-giờ-gợi-ý, một gạch trong mục nguyên tắc của system prompt.
 * Chỉ trói khi danh sách có món — danh sách rỗng nghĩa là không có hạn chế
 * từ danh sách đó, để luật không gây từ chối thừa với câu hỏi món ăn lành.
 * (es dùng nhánh en + `forSpanish`, như mọi luật khác trong prompt này.)
 */
export const allergyRule = (lang: "vi" | "en"): string =>
  lang === "en"
    ? `- Food safety: profile.allergies lists foods this person is allergic to, profile.disliked_foods lists foods they do not want, and profile.dietary_preference states their diet. NEVER recommend, suggest or include a food that contains a listed allergen, is on the disliked list, or violates the stated diet — not even as an option, a swap, or a "small amount". An empty list means no restriction from that list. If every obvious option conflicts, say so plainly instead of guessing.`
    : `- An toàn thực phẩm: profile.allergies là các món người này bị dị ứng, profile.disliked_foods là các món họ không muốn ăn, profile.dietary_preference là chế độ ăn của họ. KHÔNG BAO GIỜ gợi ý hay đưa vào món nào chứa chất gây dị ứng đã liệt kê, nằm trong danh sách không thích, hoặc vi phạm chế độ ăn đã nêu — kể cả dưới dạng lựa chọn, món thay thế, hay "một ít thôi". Danh sách rỗng nghĩa là không có hạn chế từ danh sách đó. Nếu mọi lựa chọn hiển nhiên đều xung đột, hãy nói thẳng như vậy thay vì đoán.`;

/** Ngày `YYYY-MM-DD` lùi `n` ngày (theo lịch UTC của chuỗi ngày — không phụ thuộc múi giờ máy chủ). */
const minusDays = (day: string, n: number): string => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().split("T")[0];
};

/** Một hàng `daily_logs` đủ để biết ngày ấy có ghi gì không. */
export interface LoggedDayRow {
  date: string;
  kcal?: number | null;
  workout_count?: number | null;
  sleep_duration_min?: number | null;
  supplement_taken?: number | boolean | null;
}

/** Ngày có ghi (bữa, buổi tập, giấc ngủ, thực phẩm bổ sung) — như `LOGGED_DAY_FILTER` của app. */
export const isLoggedDay = (d: LoggedDayRow): boolean =>
  Number(d.kcal) > 0 || Number(d.workout_count) > 0 || Number(d.sleep_duration_min) > 0 || Number(d.supplement_taken) > 0;

/**
 * Chuỗi ngày ghi liên tiếp, kết thúc hôm nay (hay hôm qua nếu hôm nay chưa ghi). KOA-T33: trước đây chỉ đọc
 * 7 hàng `daily_logs` nên chuỗi tối đa là 7 dù người dùng ghi đều cả tháng — đọc 31 ngày, trần `maxDays`.
 */
export function streakDays(rows: LoggedDayRow[], today: string, maxDays = 31): number {
  const logged = new Set(rows.filter(isLoggedDay).map((d) => String(d.date)));
  let n = 0;
  let cursor = logged.has(today) ? today : minusDays(today, 1);
  while (n < maxDays && logged.has(cursor)) {
    n++;
    cursor = minusDays(cursor, 1);
  }
  return n;
}

/**
 * Nước theo ngày từ `water_logs` (cùng nguồn với màn Nước của app): hôm nay + từng ngày trong 7 ngày, cũ → mới,
 * chỉ ngày CÓ ghi (KOA-T33: trước đây coach không có số nước nào dù câu mẫu trong prompt hỏi về nước).
 */
export function waterByDay(
  rows: { date: string; amount_ml: number | null }[],
  today: string,
): { today_ml: number | null; last_7_days: { date: string; ml: number }[] } {
  const from = minusDays(today, 6);
  const sums = new Map<string, number>();
  for (const r of rows) {
    const day = String(r.date).slice(0, 10);
    if (day < from || day > today) continue;
    const ml = Number(r.amount_ml);
    if (!Number.isFinite(ml) || ml <= 0) continue;
    sums.set(day, (sums.get(day) ?? 0) + ml);
  }
  const last_7_days = [...sums.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, ml]) => ({ date, ml }));
  return { today_ml: sums.get(today) ?? null, last_7_days };
}

/** Thứ Hai = 0 … Chủ nhật = 6 — đúng `WorkoutPlanning.routineIndex` của app (`routine_days.day_of_week`). */
export function mondayIndex(day: string): number {
  return (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
}

type RoutineRow = { day_of_week: number; template_id: string | null; is_rest: boolean | null; is_deload?: boolean | null };
type OverrideRow = { date: string; template_id: string | null; is_rest: boolean | null };
type TemplateRow = { id: string; name: string; exercises: unknown };
export type PauseRow = { starts_on: string; ends_on: string };

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export type TodayPlanCtx = {
  /** todo = có buổi chưa tập · done = đã tập hôm nay · rest = ngày nghỉ · unplanned = chưa lên lịch ·
   *  paused = đang trong đợt Tạm nghỉ (như `DailyPlan.input`: hôm nay là ngày nghỉ, không gợi buổi tập). */
  status: "todo" | "done" | "rest" | "unplanned" | "paused";
  /** Ngày tập lại (ngày sau ngày cuối của đợt nghỉ) khi `paused`. */
  returns_on?: string;
  name: string | null;
  is_deload: boolean;
  exercises: { name: string; sets: number; reps: number; weight_kg: number }[];
};

/**
 * Buổi tập dự kiến hôm nay (KOA-T33, phần sau): CÙNG luật với `WorkoutPlanning.plan` của app — đổi lịch
 * của riêng ngày (`plan_day_overrides`) thắng lịch mẫu (`routine_days`); `is_rest` thắng `template_id`;
 * template đã xoá = chưa lên lịch. Trước đây coach không biết hôm nay có buổi gì nên không trả lời được
 * "hôm nay tập gì?" theo đúng kế hoạch người dùng thấy ở Hôm nay.
 */
export function todayPlan(
  today: string,
  routine: RoutineRow[],
  override: OverrideRow | null,
  templates: TemplateRow[],
  trainedToday: boolean,
  pause: PauseRow | null = null,
): TodayPlanCtx {
  // Tạm nghỉ thắng lịch (`KoaPause.contains`: gồm cả ngày đầu và ngày cuối; ngày ISO so được bằng chuỗi).
  if (pause && pause.starts_on <= today && today <= pause.ends_on) {
    return { status: "paused", name: null, is_deload: false, exercises: [], returns_on: addDays(pause.ends_on, 1) };
  }
  const day = routine.find((r) => r.day_of_week === mondayIndex(today));
  const isRest = override ? override.is_rest === true : day?.is_rest === true;
  const templateId = override ? override.template_id : day?.template_id ?? null;
  const template = isRest || !templateId ? undefined : templates.find((t) => t.id === templateId);
  const exercises = template && Array.isArray(template.exercises)
    ? (template.exercises as Record<string, unknown>[])
      .filter((e) => typeof e.exerciseName === "string")
      .map((e) => ({
        name: String(e.exerciseName),
        sets: Number(e.sets) || 0,
        reps: Number(e.reps) || 0,
        // builder ghi mức tạ dưới khoá `weight` (`TemplateExercise.json`), không phải `weightKg`
        weight_kg: Number(e.weight) || 0,
      }))
    : [];
  const status: TodayPlanCtx["status"] = !template ? (isRest ? "rest" : "unplanned") : trainedToday ? "done" : "todo";
  return { status, name: template?.name ?? null, is_deload: day?.is_deload === true, exercises };
}

