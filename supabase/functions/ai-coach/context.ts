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
