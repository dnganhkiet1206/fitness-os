/**
 * body-check: lời của model → con số được ghi vào `body_checks`.
 *
 * Tách khỏi `index.ts` (28/11, Master Audit P2-02) để test lái thẳng được: import `index.ts`
 * thì `serve()` chạy và mở cổng, nên `clampBody` — dù đã export "để test" — chưa từng được
 * test nào gọi. Logic giữ nguyên từng dòng.
 */

export const PCT_MIN = 3;
export const PCT_MAX = 60;
export const NOTE_MAX = 280;

export function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const clampPct = (n: number) => Math.min(PCT_MAX, Math.max(PCT_MIN, n));

/**
 * Lời của model → con số được ghi. Xuất ra để test lái thẳng (như `clampItems` của scan-food).
 * `null` = không ghi (không phải ảnh thân người, hay số không phải số đo).
 */
export function clampBody(raw: unknown): {
  body_fat_pct: number; body_fat_low: number; body_fat_high: number; confidence: string; note: string;
} | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (r.is_body_photo !== true) return null;
  const pct = num(r.body_fat_pct);
  if (pct === null || pct < PCT_MIN || pct > PCT_MAX) return null;
  let low = num(r.body_fat_low) ?? pct - 3;
  let high = num(r.body_fat_high) ?? pct + 3;
  // khoảng luôn bao lấy số giữa, rộng ít nhất 2 điểm (ảnh không đo chính xác hơn thế), nhiều nhất 12
  low = clampPct(Math.min(low, pct - 1));
  high = clampPct(Math.max(high, pct + 1));
  if (high - low > 12) {
    low = clampPct(pct - 6);
    high = clampPct(pct + 6);
  }
  const confidence = ["low", "medium", "high"].includes(r.confidence as string) ? (r.confidence as string) : "low";
  const note = typeof r.note === "string" ? r.note.trim().slice(0, NOTE_MAX) : "";
  return { body_fat_pct: round1(pct), body_fat_low: round1(low), body_fat_high: round1(high), confidence, note };
}
