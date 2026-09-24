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
