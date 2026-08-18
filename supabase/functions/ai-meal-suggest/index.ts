import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { claimCall, corsHeaders, localDate, oneOf, quotaExceeded, requireUser } from "../_shared/guard.ts";
import { localHour } from "../_shared/sleep.ts";

/** Output ceiling — the reply is a short list of meals. */
const MAX_TOKENS = 900;

/** The six `meal_type` values `log-meal.tsx` writes, plus the client's "any". */
const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack", "preworkout", "postworkout", "any"] as const;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const caller = await requireUser(req);
    if (caller instanceof Response) return caller;
    const { userId, supabase } = caller;

    /*
      The body first, the quota after. `claimCall` counts a request whether or
      not the gateway is reached, so a malformed one used to cost a call for
      nothing — see the same note in `ai-coach`.
    */
    const { meal_type, lang = "vi", date, tzOffset } = await req.json().catch(() => ({}));

    /*
      `meal_type` is copied into the prompt below. It used to go there exactly
      as sent, with no length limit and no domain — measured, a 200,000-char
      `meal_type` produced a 202,240-char request to a paid gateway for one unit
      of a quota that counts calls, not size. The client only ever sends one of
      the seven words below, so anything else is not a shorter version of a
      request, it is a different request.
    */
    const mealType = oneOf(meal_type, MEAL_TYPES);

    if (!(await claimCall(supabase, "ai-meal-suggest"))) return quotaExceeded();
    /* Validated for the same reason `ai-smart-nudges` is — see `localDate`. */
    const today = localDate(date) ?? new Date().toISOString().split("T")[0];

    const [profileRes, dailyLogRes, favFoodsRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", userId).single(),
      supabase.from("daily_logs").select("kcal, protein_g, carbs_g, fat_g").eq("user_id", userId).eq("date", today).single(),
      supabase.from("food_items").select("name, kcal, protein_g, carbs_g, fat_g, serving_g").eq("user_id", userId).eq("is_favorite", true).limit(10),
    ]);

    const profile = profileRes.data;
    const todayLog = dailyLogRes.data;
    const favFoods = favFoodsRes.data ?? [];

    /*
      ── a target that could not be read is not a target of 2200 ──

      This used to be `(profile?.tdee_target_kcal ?? 2200) - eaten`, and the
      same for the three macros. `profileRes.error` was never looked at, so a
      failed read of the profile row did not fail — it became somebody whose
      target is 2,200 kcal, 150 g of protein, 250 of carbs and 70 of fat. The
      model was then told, as fact, how much of that budget was left, and it
      suggested three meals to fill a budget that belongs to nobody.

      For a person on 1,600 that is a 600 kcal overshoot recommended with
      complete confidence. Same failure the daily-log rebuild had — an error
      swallowed and replaced by a plausible default — arriving here through a
      `??`.

      `null` says the honest thing, and the prompt below is told what to do
      with it: suggest meals, do not state a budget.
    */
    const targets = profile && {
      kcal: Number(profile.tdee_target_kcal),
      protein_g: Number(profile.macro_protein_g),
      carbs_g: Number(profile.macro_carbs_g),
      fat_g: Number(profile.macro_fat_g),
    };
    /* A profile row can exist with the target columns still null — the
       onboarding maths has not run. `Number(null)` is 0 and `Number(undefined)`
       is NaN, and neither is a calorie target. */
    const haveTargets = !!targets && Object.values(targets).every((v) => Number.isFinite(v) && v > 0);
    const remaining = haveTargets
      ? {
          kcal: targets.kcal - (Number(todayLog?.kcal) || 0),
          protein_g: targets.protein_g - (Number(todayLog?.protein_g) || 0),
          carbs_g: targets.carbs_g - (Number(todayLog?.carbs_g) || 0),
          fat_g: targets.fat_g - (Number(todayLog?.fat_g) || 0),
        }
      : null;

    const ctx = {
      goal: profile?.goal,
      dietary_preference: profile?.dietary_preference,
      allergies: profile?.allergies,
      disliked_foods: profile?.disliked_foods,
      remaining_macros: remaining,
      meal_type: mealType ?? "any",
      favorite_foods: favFoods,
      /* Was the hour in UTC, on a Deno host — "fit the time of day" below then
         fitted a time of day the caller was not in. `null` when the client did
         not say, rather than a confidently wrong hour. */
      current_hour: localHour(tzOffset),
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
- A null or missing field was NOT MEASURED. It is not a zero. Never state or imply a number the data does not contain
- Compute accurate macros for each suggestion
- Prefer favorite foods when they fit
- Avoid allergies and disliked foods
- Fit the time of day; if current_hour is null, do not mention or assume a time of day
- If remaining_macros is null, the app could not read this person's targets: suggest balanced meals and do NOT state or imply any remaining calorie or macro budget
- If a remaining value is negative they are already over that target for today: suggest something light, and do not present the negative number as an allowance
- Realistic, easy-to-cook suggestions. All names/descriptions in English.`
              : `Bạn là AI dinh dưỡng. Gợi ý 3 bữa ăn phù hợp với macros còn lại và sở thích người dùng. Trả lời bằng tiếng Việt.

DỮ LIỆU: ${JSON.stringify(ctx)}

NGUYÊN TẮC:
- Trường nào null hoặc không có nghĩa là CHƯA ĐO ĐƯỢC, không phải bằng 0. Đừng bao giờ nêu hay ám chỉ một con số mà dữ liệu không có
- Tính toán macros chính xác cho mỗi gợi ý
- Ưu tiên thực phẩm yêu thích nếu phù hợp
- Tránh allergies và disliked foods
- Phù hợp với thời điểm trong ngày; nếu current_hour là null thì không nhắc và không suy đoán thời điểm trong ngày
- Nếu remaining_macros là null nghĩa là app không đọc được mục tiêu của người này: gợi ý bữa cân đối và TUYỆT ĐỐI không nói hay ám chỉ còn bao nhiêu calo/macro
- Nếu một giá trị remaining âm nghĩa là hôm nay họ đã vượt mục tiêu đó: gợi ý bữa nhẹ, và không trình bày con số âm như một hạn mức còn được ăn
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
