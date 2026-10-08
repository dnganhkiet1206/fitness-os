/**
 * HealthKit giả cho golden: trả ĐÚNG các mẫu fixture đặt ở `globalThis.__hk`
 * — như thể HealthKit đã lọc / sắp xếp theo truy vấn — và ghi lại tham số
 * truy vấn (`globalThis.__hkLog`) để Swift hỏi HealthKit đúng như vậy.
 */
type Any = any;
const g = globalThis as Any;
const log = (op: string, args: unknown) => (g.__hkLog ??= []).push({ op, args: JSON.parse(JSON.stringify(args)) });

export const AuthorizationRequestStatus = { unnecessary: 2 };
export function isHealthDataAvailable() { return true; }
export async function requestAuthorization() { return true; }
export async function getRequestStatusForAuthorization() { return 2; }

export async function queryStatisticsForQuantity(id: string, _o: unknown, opts: Any) {
  log('statistics', { id, start: opts.filter.date.startDate, end: opts.filter.date.endDate, unit: opts.unit });
  const v = g.__hk.totals?.[id];
  return v == null ? {} : { sumQuantity: { quantity: v } };
}
export async function queryStatisticsCollectionForQuantity(id: string, _o: unknown, anchor: Date, interval: unknown, opts: Any) {
  log('collection', { id, anchor, interval, start: opts.filter.date.startDate, end: opts.filter.date.endDate });
  return g.__hk.stepBuckets ?? [];
}
export async function queryQuantitySamples(id: string, opts: Any) {
  log('quantity', { id, start: opts.filter.date.startDate, limit: opts.limit, ascending: opts.ascending, unit: opts.unit });
  const s = g.__hk.latest?.[id];
  return s ? [s] : [];
}
export async function queryCategorySamples(id: string, opts: Any) {
  log('category', { id, start: opts.filter.date.startDate, end: opts.filter.date.endDate, limit: opts.limit, ascending: opts.ascending });
  return g.__hk.sleep ?? [];
}
export async function queryWorkoutSamples(opts: Any) {
  log('workouts', { start: opts.filter.date.startDate, end: opts.filter.date.endDate, limit: opts.limit, ascending: opts.ascending });
  return g.__hk.workouts ?? [];
}
