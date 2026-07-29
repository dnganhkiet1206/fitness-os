import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { claimCall, corsHeaders, quotaExceeded, requireUser } from "../_shared/guard.ts";

/** Output ceiling — the reply is a short list of meals. */
const MAX_TOKENS = 900;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const caller = await requireUser(req);
    if (caller instanceof Response) return caller;
    const { userId, supabase } = caller;

    if (!(await claimCall(supabase, "ai-meal-suggest"))) return quotaExceeded();

    const { meal_type, lang = "vi", date } = await req.json();
    // Prefer the client's local calendar date; fall back to server UTC
    const today = date ?? new Date().toISOString().split("T")[0];

    const [profileRes, dailyLogRes, favFoodsRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", userId).single(),
      supabase.from("daily_logs").select("kcal, protein_g, carbs_g, fat_g").eq("user_id", userId).eq("date", today).single(),
      supabase.from("food_items").select("name, kcal, protein_g, carbs_g, fat_g, serving_g").eq("user_id", userId).eq("is_favorite", true).limit(10),
    ]);

    const profile = profileRes.data;
    const todayLog = dailyLogRes.data;
    const favFoods = favFoodsRes.data ?? [];

    const remaining = {
      kcal: (profile?.tdee_target_kcal ?? 2200) - (Number(todayLog?.kcal) || 0),
      protein_g: (profile?.macro_protein_g ?? 150) - (Number(todayLog?.protein_g) || 0),
      carbs_g: (profile?.macro_carbs_g ?? 250) - (Number(todayLog?.carbs_g) || 0),
      fat_g: (profile?.macro_fat_g ?? 70) - (Number(todayLog?.fat_g) || 0),
    };

    const ctx = {
      goal: profile?.goal,
      dietary_preference: profile?.dietary_preference,
      allergies: profile?.allergies,
      disliked_foods: profile?.disliked_foods,
      remaining_macros: remaining,
      meal_type: meal_type || "any",
      favorite_foods: favFoods,
      current_hour: new Date().getHours(),
    };

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        max_tokens: MAX_TOKENS,
        messages: [
          {
            role: "system",
            content: lang === "en"
              ? `You are a nutrition AI. Suggest 3 meals that fit the remaining macros and the user's preferences. Reply in English.

DATA: ${JSON.stringify(ctx)}

PRINCIPLES:
- Compute accurate macros for each suggestion
- Prefer favorite foods when they fit
- Avoid allergies and disliked foods
- Fit the time of day
- Realistic, easy-to-cook suggestions. All names/descriptions in English.`
              : `Bạn là AI dinh dưỡng. Gợi ý 3 bữa ăn phù hợp với macros còn lại và sở thích người dùng. Trả lời bằng tiếng Việt.

DỮ LIỆU: ${JSON.stringify(ctx)}

NGUYÊN TẮC:
- Tính toán macros chính xác cho mỗi gợi ý
- Ưu tiên thực phẩm yêu thích nếu phù hợp
- Tránh allergies và disliked foods
- Phù hợp với thời điểm trong ngày
- Gợi ý thực tế, dễ nấu`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_meals",
              description: "Suggest meals based on remaining macros",
              parameters: {
                type: "object",
                properties: {
                  suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        description: { type: "string" },
                        kcal: { type: "number" },
                        protein_g: { type: "number" },
                        carbs_g: { type: "number" },
                        fat_g: { type: "number" },
                        ingredients: { type: "array", items: { type: "string" } },
                        prep_time_min: { type: "number" },
                      },
                      required: ["name", "description", "kcal", "protein_g", "carbs_g", "fat_g", "ingredients", "prep_time_min"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["suggestions"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "suggest_meals" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    let suggestions: any[] = [];

    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        suggestions = parsed.suggestions || [];
      } catch { /* empty */ }
    }

    return new Response(JSON.stringify({ suggestions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-meal-suggest error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
