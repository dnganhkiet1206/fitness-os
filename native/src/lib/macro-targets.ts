/**
 * The day's calorie and macro targets, from the profile.
 *
 * Extracted because two screens now draw the same nutrition card — the
 * dashboard and the Nutrition tab — and a target computed twice is a target
 * that eventually disagrees with itself. The card is already one component;
 * this makes its inputs one function.
 *
 * ── và vì sao bộ dự phòng KHÔNG còn là bốn con số rời ──
 *
 * Bản trước có năm giá trị dự phòng ĐỘC LẬP: calo `|| 2200`, đạm `|| 150`,
 * carb `|| 250`, mỡ `|| 70`. Bốn con số ấy cộng lại là **2.230 kcal** trong khi
 * vòng calo nói **2.200** — và vì chúng độc lập, một hồ sơ thiếu dữ liệu MỘT
 * PHẦN cho ra lệch lớn hơn nhiều. Đo trên chính các hàm này:
 *
 *     hồ sơ rỗng                        calo 2.200 · macro 2.230   lệch   +30
 *     nữ đang cut, thiếu cột macro      calo 1.200 · macro 2.230   lệch +1.030
 *     bulk, thiếu cột macro             calo 3.200 · macro 2.230   lệch   −970
 *
 * Và nó tới được bằng thao tác thường, không phải một hàng dữ liệu hỏng:
 * `edit-profile.tsx` ghi năm trường độc lập, mỗi trường `Number(x) || null`,
 * nên xoá trắng MỘT ô là trường đó thành `null`. Trên một hồ sơ thật (nữ 58 kg,
 * 162 cm, cut 1.399 kcal) xoá ô carb cho ra 139P/250C/39F = **1.907 kcal**, tức
 * vượt vòng calo của chính người đó 508 kcal. Ăn đúng cả bốn vòng macro là vượt
 * 36% mục tiêu calo, trên cùng một màn hình.
 *
 * Đó ĐÚNG là lỗi mà `calcMacros` được viết ra để chặn — chú thích của nó nói
 * thẳng: "bốn vòng cộng lại NHIỀU HƠN vòng calo phía trên". Nó đã bị chặn ở
 * đường onboarding và sống sót ở đường dự phòng, vì `tools/nutrition-targets.mjs`
 * quét toàn bộ không gian onboarding qua `calcPlan` mà không import tệp này.
 *
 * ── luật mới, một câu ──
 *
 * **Calo là cái neo; carb là số dư.** Thiếu bất kỳ macro nào thì carb được suy
 * ra từ đồng nhất thức, nên tổng KHỚP theo cấu tạo — đúng cách `calcMacros` đã
 * làm. Đủ cả bốn thì dùng nguyên những gì đã lưu: một người tự gõ bốn con số là
 * một người đang nói ý mình, và ghi đè lên đó là bịa hộ họ.
 *
 * Hai tỉ lệ dùng để suy ra đều có nguồn, không phải chọn bừa:
 *
 *   · mỡ  — `FAT_TARGET_FRACTION` (25%), CÙNG hằng số đường thật dùng, nằm
 *           giữa dải AMDR 20–35% của IOM.
 *   · đạm — 27% năng lượng, chính là tỉ lệ ẩn trong bộ mặc định cũ (150 g trên
 *           2.200 kcal = 27,3%). Giữ nguyên ý sản phẩm, và nằm trong AMDR
 *           10–35%. Đường thật tính đạm theo g/kg; ở đây không có cân nặng, nên
 *           phần năng lượng là hình dạng duy nhất dùng được.
 *
 * AMDR: Institute of Medicine / Food and Nutrition Board, Dietary Reference
 * Intakes — carb 45–65%, mỡ 20–35%, đạm 10–35% tổng năng lượng.
 */

import { FAT_TARGET_FRACTION, FIBER_G_PER_1000_KCAL } from '@/lib/fitness-calc';

export interface MacroProfile {
  tdee_target_kcal?: number | string | null;
  macro_protein_g?: number | string | null;
  macro_carbs_g?: number | string | null;
  macro_fat_g?: number | string | null;
  macro_fiber_g?: number | string | null;
}

/** Điều một hồ sơ chưa qua onboarding nhận được. */
export const DEFAULT_KCAL = 2200;

/** Xem khối chú thích đầu tệp — 27% là tỉ lệ ẩn trong bộ mặc định cũ. */
export const PROTEIN_FALLBACK_FRACTION = 0.27;

/**
 * Một trường đã lưu, hay `null`.
 *
 * `Number(x) || null` của bản cũ biến số 0 thành "chưa đặt". Ở đây 0 vẫn là 0 —
 * nhưng một macro âm hay không phải số thì KHÔNG phải một giá trị đã lưu, nó là
 * một hàng hỏng, và hàng hỏng đi theo đường suy ra chứ không được vẽ lên vòng.
 */
function stored(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Mục tiêu calo của ngày.
 *
 * Khác `stored()` ở đúng một điểm: số 0 KHÔNG phải một mục tiêu calo. Một macro
 * bằng 0 thì có nghĩa (0 g tinh bột là một kế hoạch keto người ta thật sự đặt);
 * 0 kcal thì không phải một kế hoạch, nó là một hàng thiếu dữ liệu. App không
 * ghi được 0 vào cột này — `edit-profile.tsx` đổi 0 thành `null` — nhưng một
 * hàng cũ thì ghi được, và bước này quyết định người đó thấy 2.200 hay thấy 0.
 */
export const calorieTargetFor = (p: MacroProfile | undefined | null): number => {
  const v = stored(p?.tdee_target_kcal);
  return Math.round(v !== null && v > 0 ? v : DEFAULT_KCAL);
};

/**
 * Bốn mục tiêu macro, luôn nói cùng một câu với `calorieTargetFor`.
 *
 * Bất biến: khi có bất kỳ trường nào thiếu, `protein*4 + carbs*4 + fat*9` bằng
 * calo mục tiêu trong sai số làm tròn. `tools/nutrition-targets.mjs` canh nó.
 */
export const macroTargetsFor = (p: MacroProfile | undefined | null) => {
  const kcal = calorieTargetFor(p);
  const protein = stored(p?.macro_protein_g);
  const carbs = stored(p?.macro_carbs_g);
  const fat = stored(p?.macro_fat_g);
  const fiber = stored(p?.macro_fiber_g);

  /* Đủ cả bốn: người này đã có một kế hoạch. Dùng nguyên văn. */
  if (protein !== null && carbs !== null && fat !== null && fiber !== null) {
    return { protein, carbs, fat, fiber };
  }

  /* Thiếu một chỗ nào đó: neo vào calo và để carb làm số dư. */
  const p_g = protein ?? Math.round((kcal * PROTEIN_FALLBACK_FRACTION) / 4);
  const f_g = fat ?? Math.round((kcal * FAT_TARGET_FRACTION) / 9);
  const c_g = Math.max(Math.round((kcal - p_g * 4 - f_g * 9) / 4), 0);
  return {
    protein: p_g,
    carbs: c_g,
    fat: f_g,
    fiber: fiber ?? Math.round((kcal / 1000) * FIBER_G_PER_1000_KCAL),
  };
};

/**
 * Bốn con số người dùng tự gõ có nói cùng một câu với mục tiêu calo không.
 *
 * ── vì sao đây là một CẢNH BÁO chứ không phải một bản sửa ──
 *
 * `macroTargetsFor` ở trên cố ý KHÔNG ghi đè một bộ đủ bốn: một người gõ đủ bốn
 * ô là một người đang nói ý mình, và suy lại hộ họ là bịa. Nhưng "tôn trọng con
 * số ấy" không có nghĩa là "im lặng khi nó mâu thuẫn với mục tiêu calo ngay
 * phía trên nó" — người gõ 250 g carb vào một kế hoạch 1.399 kcal gần như chắc
 * chắn không định ăn vượt 508 kcal mỗi ngày, họ chỉ chưa cộng lại.
 *
 * Nên app nói ra con số và để người ta quyết định. Không chặn lưu.
 *
 * ── ngưỡng 10 kcal là một phép ĐO, không phải một lựa chọn ──
 *
 * Cả bốn giá trị đều làm tròn tới gram, nên một bộ HOÀN TOÀN nhất quán vẫn lệch
 * được một ít. Biên lý thuyết tối đa:
 *
 *     đạm ±0,5 g × 4  = ±2      tinh bột ±0,5 g × 4 = ±2
 *     mỡ  ±0,5 g × 9  = ±4,5    mục tiêu calo       = ±0,5
 *     ────────────────────────────────────────────── ±9 kcal
 *
 * Đường thật đo được nhiều nhất **2 kcal** trên 401.940 hồ sơ
 * (`tools/nutrition-targets.mjs`). Ngưỡng đặt ở 10 — trên cả biên lý thuyết —
 * nên bước này không bao giờ kêu vì làm tròn, chỉ kêu khi có bất đồng thật.
 */
export const MACRO_DRIFT_TOLERANCE_KCAL = 10;

export interface MacroDrift {
  /** Năng lượng bốn macro cộng lại. */
  sum: number;
  /** `sum` trừ mục tiêu calo. Dương là ăn vượt. */
  drift: number;
  kcalTarget: number;
}

/**
 * `null` khi không có gì để cảnh báo — và có BA cách để không có gì:
 *
 *   · hồ sơ thiếu macro → `macroTargetsFor` đã suy ra cho khớp, không thể lệch;
 *   · lệch nằm trong biên làm tròn;
 *   · không đọc được mục tiêu calo.
 *
 * `null` chứ không phải `drift: 0`: "không có bất đồng" và "chưa xét" là hai
 * câu khác nhau, và màn hình phải phân biệt được.
 */
export function macroDriftFor(p: MacroProfile | undefined | null): MacroDrift | null {
  const protein = stored(p?.macro_protein_g);
  const carbs = stored(p?.macro_carbs_g);
  const fat = stored(p?.macro_fat_g);
  /* Thiếu một trường nào đó thì `macroTargetsFor` suy ra cho khớp — không có
     bất đồng để nói. Chất xơ không mang năng lượng trong phép cộng này nên nó
     không tham gia, nhưng nó vẫn phải CÓ: thiếu nó là hồ sơ đi đường suy ra. */
  if (protein === null || carbs === null || fat === null || stored(p?.macro_fiber_g) === null) return null;

  const kcalTarget = calorieTargetFor(p);
  const sum = protein * 4 + carbs * 4 + fat * 9;
  const drift = sum - kcalTarget;
  if (Math.abs(drift) < MACRO_DRIFT_TOLERANCE_KCAL) return null;
  return { sum, drift, kcalTarget };
}
