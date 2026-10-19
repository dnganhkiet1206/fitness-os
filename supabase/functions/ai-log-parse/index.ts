import { callAI } from "../_shared/ai.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { aiGate, aiPayload, corsHeaders, json, opaque, quotaExceeded, requireUser } from "../_shared/guard.ts";
import { cleanParse } from "./parse.ts";

/**
 * "Ghi hôm nay" — hiểu câu kể (19/10, chủ dự án: "Koa vẫn chưa đủ hiểu nhiều khi
 * người dùng ghi để log"). Câu kể → danh sách mục theo một khuôn JSON cố định.
 * Hàm này KHÔNG ghi gì: app hiện danh sách, người dùng bấm Lưu. Mọi số đi qua
 * `cleanParse` (dải hợp lệ, không calo) trước khi trả về; app kiểm lại lần nữa.
 * Luật trên máy (`SpokenLog`) vẫn chạy ngay khi gõ và khi mất mạng.
 */
const MAX_CHARS = 600;

const PROMPT = `You turn what a person says about their day into log items for a fitness app. Output ONLY a JSON object, no prose:
{"items":[...],"otherDay":[...],"unclear":[...]}
Item shapes:
- {"type":"sleep","bed":"HH:MM"|null,"wake":"HH:MM"|null,"minutes":int|null}  (last night's sleep; 24h clock; "thức tới 2h sáng mới ngủ, 8h dậy" = bed 02:00, wake 08:00, minutes 360)
- {"type":"water","ml":int|null}  (plain water only; 1 ly/cốc/glass = 250, 1 chai/bottle = 500 unless stated; null if no amount)
- {"type":"weight","kg":number}  (convert lb to kg; "ký"/"cân" = kg)
- {"type":"workout","kind":"run|walk|cycle|swim|yoga|gym|other","minutes":int|null}  (step counts are NOT workouts — ignore them)
- {"type":"meal","slot":"breakfast|lunch|dinner|snack"|null,"foods":[{"name":string,"servings":number,"unit":string|null,"grams":number|null}]}
Rules:
- Only things that ALREADY happened TODAY (last night's sleep counts). Plans, wishes, questions, negations ("chưa ăn gì", "didn't drink") and other days produce NO item; put other-day phrases in "otherDay".
- Food names: just the dish, in the user's language, lowercase, no verbs or fillers ("làm tô bún bò" → name "bún bò", unit "tô"), no people ("ăn lẩu với bạn" → only "lẩu"). Drinks with calories (coffee, milk tea, juice, beer) are foods, not water.
- Never invent numbers. Never estimate calories. Unknown amount → null / servings 1.
- slot: from words like sáng/trưa/tối/bữa phụ, breakfast/lunch/dinner/snack, desayuno/almuerzo/cena; otherwise null.
- One meal item per slot; several foods go in the same item.
- Put any part you could not turn into an item in "unclear" (short quote). Negations, plans, questions and step counts are understood, not unclear — leave them out of every list. Do not explain.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const caller = await requireUser(req);
    if (caller instanceof Response) return caller;
    const { supabase } = caller;

    const body = await req.json().catch(() => null);
    const text = typeof body?.text === "string" ? body.text.trim().slice(0, MAX_CHARS) : "";
    if (!text) return json({ items: [], otherDay: [], unclear: [] });
    const hour = Number.isInteger(body?.hour) && body.hour >= 0 && body.hour < 24 ? body.hour : 12;

    const gate = await aiGate(supabase, "ai-log-parse");
    if (gate === "denied") return quotaExceeded();

    const res = await callAI({
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content: `Local time now: ${hour}:00.\nWhat they said: ${JSON.stringify(text)}` },
      ],
      max_tokens: 600,
    });
    if (!res) return opaque(new Error("no ai provider configured"), "ai_unavailable");
    if (!res.ok) {
      console.error("log-parse gateway error", res.status, await res.text());
      return json({ error: "ai_unavailable" }, 502);
    }
    const data = await aiPayload(supabase, "ai-log-parse", res, gate === "overage");
    if (!data) return opaque(new Error("provider returned a non-JSON body"), "ai_incomplete", 502);
    const content = (data as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content;
    return json(cleanParse(typeof content === "string" ? content : ""));
  } catch (e) {
    console.error("ai-log-parse error:", e);
    return opaque(e, "ai_failed");
  }
});
