/**
 * Bài RECIPE — đọc payload, và biến nó thành thứ ghi được vào nhật ký.
 *
 * Thuần: không React, không Supabase. Nên `tools/recipe-post.mjs` CHẠY được hai
 * hàm này trên những payload hỏng thật sự, thay vì đọc mã rồi đoán.
 *
 * ── vì sao phải đọc PHÒNG THỦ ──
 *
 * Payload đến từ server (`share_recipe`), nhưng nó đi qua cache được persist
 * bằng `JSON.stringify` xuống AsyncStorage (xem `lib/query-client.ts`). Một bản
 * cache của phiên bản cũ, một bài bị ai đó sửa tay trên dashboard — bất cứ
 * thứ gì không đúng hình đều phải ra một thẻ ÍT hơn, không phải một màn đỏ.
 * Đúng bài học của `safeGuide()` ở màn hướng dẫn: "Cannot read property 'map'
 * of undefined" đã xảy ra thật trên máy chủ dự án, vì đúng loại lỗi này.
 */

export interface RecipeIngredient {
  name: string;
  /** null khi không BIẾT — dòng gõ tay không có món gốc. Không bao giờ đoán. */
  grams: number | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface RecipePayload {
  title: string;
  mealType: string | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  ingredientCount: number;
  ingredients: RecipeIngredient[];
}

/** Số không âm, hữu hạn. Mọi thứ khác là 0 — kể cả `"12"` dạng chuỗi lạ. */
function num(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

export function readRecipePayload(raw: unknown): RecipePayload {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const list = Array.isArray(o.ingredients) ? o.ingredients : [];
  const ingredients: RecipeIngredient[] = list
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x))
    .map((x) => {
      const g = num(x.grams);
      return {
        name: str(x.name) || '?',
        grams: g > 0 ? g : null,
        kcal: num(x.kcal),
        protein: num(x.protein),
        carbs: num(x.carbs),
        fat: num(x.fat),
      };
    });
  return {
    title: str(o.title),
    mealType: str(o.mealType) || null,
    /*
      Tổng ĐỌC LẠI từ các dòng, không tin trường tổng trên payload.

      Server đã dựng tổng = tổng các dòng (xem `share_recipe`). Nhưng một bản
      cache cũ hay một bài bị sửa tay có thể mang một tổng khác — và nút "Thêm
      vào bữa ăn" ghi CÁC DÒNG, không ghi con số tổng. Tính lại ở đây nghĩa là
      con số in trên thẻ không bao giờ lệch khỏi con số rơi vào nhật ký người
      xem, dù payload có ra sao.
    */
    kcal: ingredients.reduce((s, i) => s + i.kcal, 0),
    protein: ingredients.reduce((s, i) => s + i.protein, 0),
    carbs: ingredients.reduce((s, i) => s + i.carbs, 0),
    fat: ingredients.reduce((s, i) => s + i.fat, 0),
    ingredientCount: ingredients.length,
    ingredients,
  };
}

/**
 * Nguyên liệu → `PlannedFood`, đúng hình mà `useLogPlannedMeal` đã nhận.
 *
 * Đường ghi SẴN CÓ, không đường mới (#7: *"Đừng viết đường ghi mới"*).
 * `useLogPlannedMeal` ghi mỗi món với `servings: 1`, vì một dòng kế hoạch ĐÃ là
 * cả phần — đúng nghĩa của một dòng nguyên liệu ở đây.
 *
 * `food_item_id: null`: món gốc nằm trong kho của NGƯỜI ĐĂNG, và RLS của
 * `food_items` không cho người xem đọc nó. Trỏ vào một ID mình không đọc được
 * là để lại trong nhật ký một liên kết gãy.
 */
export function toPlannedFoods(p: RecipePayload): {
  food_item_id: null;
  food_name: string;
  serving_g: number | null;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}[] {
  return p.ingredients.map((i) => ({
    food_item_id: null,
    food_name: i.name,
    serving_g: i.grams,
    kcal: i.kcal,
    protein_g: i.protein,
    carbs_g: i.carbs,
    fat_g: i.fat,
  }));
}

/** Một dòng `meal_entry_items` — chỉ các cột `share_recipe` đọc. */
export interface MealItemRow {
  id: string;
  meal_entry_id: string;
  food_item_id: string | null;
  food_name: string | null;
  servings: number | null;
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  created_at: string;
}

/** `btrim` của Postgres: CHỈ dấu cách, không phải mọi khoảng trắng như `trim()`. */
const btrim = (s: string) => s.replace(/^ +| +$/g, '');

/**
 * Bản XEM TRƯỚC của thẻ, dựng theo ĐÚNG luật của `share_recipe` phía server.
 *
 * Con số thật trên bài do server đọc lại từ bảng — client không gửi số nào.
 * Hàm này chỉ để người đăng THẤY TRƯỚC thẻ sẽ ra sao, nên nó phải khớp từng
 * vế với câu SQL: một bản xem trước khác bài thật là một lời nói dối đặt ngay
 * trước nút Đăng. `tools/recipe-post.mjs` chạy nó trên ĐÚNG dữ liệu của
 * `community_recipe.test.sql` và đòi ra đúng số mà các kịch bản SQL đòi.
 *
 *   thứ tự     `ORDER BY created_at, id`, tối đa 50 dòng
 *   tên        `coalesce(nullif(btrim(food_name), ''), '?')`
 *   khối lượng `round(servings × serving_g)` CHỈ khi dòng trỏ tới một món còn
 *              đó, `serving_g > 0` và `servings > 0`; còn lại null
 *   số         `round(coalesce(x, 0))` trên TỪNG dòng
 *   tổng       tổng các số ĐÃ làm tròn ấy — không phải `total_*` của bữa
 */
export function payloadFromMeal(
  title: string,
  mealType: string,
  rows: MealItemRow[],
  servingG: Record<string, number>,
): RecipePayload {
  const r0 = (v: number | null | undefined) => Math.round(Number(v) || 0);
  const ingredients: RecipeIngredient[] = [...rows]
    .sort((a, b) =>
      a.created_at !== b.created_at ? (a.created_at < b.created_at ? -1 : 1) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    )
    .slice(0, 50)
    .map((r) => {
      const g = r.food_item_id ? servingG[r.food_item_id] : undefined;
      const s = Number(r.servings) || 0;
      return {
        name: btrim(r.food_name ?? '') || '?',
        grams: g !== undefined && g > 0 && s > 0 ? Math.round(s * g) : null,
        kcal: r0(r.kcal),
        protein: r0(r.protein_g),
        carbs: r0(r.carbs_g),
        fat: r0(r.fat_g),
      };
    });
  const sum = (k: 'kcal' | 'protein' | 'carbs' | 'fat') => ingredients.reduce((n, i) => n + i[k], 0);
  return {
    title: btrim(title),
    mealType,
    kcal: sum('kcal'),
    protein: sum('protein'),
    carbs: sum('carbs'),
    fat: sum('fat'),
    ingredientCount: ingredients.length,
    ingredients,
  };
}
