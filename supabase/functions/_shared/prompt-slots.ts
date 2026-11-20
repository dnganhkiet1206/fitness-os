// Khuôn prompt: đổi chữ theo ngôn ngữ + chỗ giữ dữ liệu người dùng (KOA-T37). Không đọc
// biến môi trường — test Deno của CI nạp được mà không cần quyền.

/**
 * Chỗ giữ cho dữ liệu người dùng trong khuôn prompt (KOA-T37). `forSpanish` đổi chữ bằng
 * `replaceAll` — chạy trên prompt ĐÃ chèn dữ liệu thì tên bài, ghi chú, món ăn có chữ
 * "English" cũng bị đổi. Khuôn mang `DATA_SLOT`; `fillData` điền dữ liệu SAU khi đổi chữ.
 */
export const slot = (name: string): string => `\u0000ASCND_${name}\u0000`;
export const DATA_SLOT = slot("DATA");

/** Điền dữ liệu vào chỗ giữ — hàm thay thế để `$&` / `$1` trong dữ liệu không bị hiểu là mẫu.
 *  `data` là chuỗi: điền vào `DATA_SLOT`; là bảng: điền từng `slot(tên)`. */
export const fillData = (prompt: string, data: string | Record<string, string>): string => {
  const values = typeof data === "string" ? { DATA: data } : data;
  let out = prompt;
  for (const [name, value] of Object.entries(values)) out = out.replaceAll(slot(name), () => value);
  return out;
};

export const forSpanish = (prompt: string, raw: unknown): string =>
  raw !== "es" ? prompt : prompt
    .replaceAll("in English", "in Spanish (español)")
    .replaceAll("English", "Spanish")
    .replaceAll("I only help with training, nutrition, sleep and recovery.",
      "Solo te ayudo con entrenamiento, nutrición, sueño y recuperación.");
