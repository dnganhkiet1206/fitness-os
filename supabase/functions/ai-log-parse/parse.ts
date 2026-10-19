/**
 * Câu trả lời của model → chỉ những mục an toàn để hiện. Hỏng / sai kiểu / ngoài
 * dải thì BỎ, không sửa: một số cân sai còn tệ hơn không có số.
 */
export type Parsed = { items: Record<string, unknown>[]; otherDay: string[]; unclear: string[] };

const KINDS = new Set(["run", "walk", "cycle", "swim", "yoga", "gym", "other"]);
const SLOTS = new Set(["breakfast", "lunch", "dinner", "snack"]);
const clock = (v: unknown) => (typeof v === "string" && /^([01]?\d|2[0-3]):[0-5]\d$/.test(v) ? v : null);
const int = (v: unknown, lo: number, hi: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v) : null;
const num = (v: unknown, lo: number, hi: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : null;
const text = (v: unknown, max = 80) =>
  typeof v === "string" && v.trim().length > 0 ? v.trim().slice(0, max) : null;

export function cleanParse(raw: string): Parsed {
  const out: Parsed = { items: [], otherDay: [], unclear: [] };
  let p: unknown;
  try {
    p = JSON.parse(raw.trim().replace(/^```(?:json)?/, "").replace(/```$/, ""));
  } catch {
    return out;
  }
  if (!p || typeof p !== "object") return out;
  const o = p as Record<string, unknown>;
  const strings = (v: unknown) => (Array.isArray(v) ? v.map((s) => text(s, 120)).filter((s): s is string => !!s).slice(0, 6) : []);
  out.otherDay = strings(o.otherDay);
  out.unclear = strings(o.unclear);
  for (const it of Array.isArray(o.items) ? o.items.slice(0, 12) : []) {
    if (!it || typeof it !== "object") continue;
    const i = it as Record<string, unknown>;
    switch (i.type) {
      case "sleep": {
        const bed = clock(i.bed), wake = clock(i.wake), minutes = int(i.minutes, 30, 16 * 60);
        if (bed || wake || minutes) out.items.push({ type: "sleep", bed, wake, minutes });
        break;
      }
      case "water":
        out.items.push({ type: "water", ml: i.ml == null ? null : int(i.ml, 50, 5000) });
        break;
      case "weight": {
        const kg = num(i.kg, 20, 400);
        if (kg) out.items.push({ type: "weight", kg: Math.round(kg * 10) / 10 });
        break;
      }
      case "workout":
        if (typeof i.kind === "string" && KINDS.has(i.kind)) {
          out.items.push({ type: "workout", kind: i.kind, minutes: int(i.minutes, 1, 600) });
        }
        break;
      case "meal": {
        const foods = (Array.isArray(i.foods) ? i.foods : []).slice(0, 10).flatMap((f) => {
          if (!f || typeof f !== "object") return [];
          const r = f as Record<string, unknown>;
          const name = text(r.name);
          if (!name) return [];
          return [{
            name: name.toLowerCase(), servings: num(r.servings, 0.1, 20) ?? 1,
            unit: text(r.unit, 20), grams: num(r.grams, 1, 3000),
          }];
        });
        if (foods.length) {
          out.items.push({ type: "meal", slot: typeof i.slot === "string" && SLOTS.has(i.slot) ? i.slot : null, foods });
        }
        break;
      }
    }
  }
  return out;
}
