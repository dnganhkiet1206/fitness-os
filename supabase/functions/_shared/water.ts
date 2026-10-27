/**
 * Đơn vị nước của người dùng cho câu AI (Kiệt 27/10, #527).
 *
 * App gửi `waterUnit: "oz" | "ml"` (Cài đặt → đơn vị thể tích). Trước đây hai
 * hàm chỉ có ml, nên tài khoản oz đọc "bạn mới uống 473ml" ngay dưới "16 oz".
 * Sổ vẫn lưu ml; đổi ở đây, trước khi tới model, để model không phải tự đổi.
 *
 * Tương thích ngược: app cũ không gửi gì (hay gửi giá trị lạ) → "ml", y như cũ.
 */
export type WaterUnit = "ml" | "oz";

/** Như app (`Water.mlPerFloz`). */
export const ML_PER_FLOZ = 29.5735296;

export const readWaterUnit = (raw: unknown): WaterUnit => (raw === "oz" ? "oz" : "ml");

/** Số ml → số theo đơn vị: oz làm tròn tới số nguyên (như app), ml giữ ml. */
export const waterAmount = (ml: number, unit: WaterUnit): number =>
  unit === "oz" ? Math.round(ml / ML_PER_FLOZ) : Math.round(ml);

/** Chữ cho người đọc: "16 oz", "1.5 L", "473 ml". */
export const showWater = (ml: number, unit: WaterUnit): string => {
  if (unit === "oz") return `${waterAmount(ml, "oz")} oz`;
  return ml >= 1000 ? `${Math.round(ml / 100) / 10} L` : `${Math.round(ml)} ml`;
};

/** Một dòng luật cho prompt: viết nước bằng đúng đơn vị người dùng. */
export const waterRule = (unit: WaterUnit, lang: "vi" | "en"): string =>
  unit === "oz"
    ? lang === "en"
      ? `- Water is in fl oz for this user (fields ending _oz). Write every water amount in oz, rounded to whole oz (e.g. "16 oz"); never ml or L`
      : `- Người dùng này đo nước bằng fl oz (các trường đuôi _oz). Mọi lượng nước viết bằng oz, làm tròn tới số nguyên (vd. "16 oz"); không bao giờ viết ml hay L`
    : lang === "en"
      ? `- Water is in ml (fields ending _ml). Write water amounts in ml, or L from 1000 ml (e.g. "1.5 L"); never oz`
      : `- Nước tính bằng ml (các trường đuôi _ml). Viết lượng nước bằng ml, hoặc L từ 1000 ml (vd. "1,5 L"); không bao giờ viết oz`;
