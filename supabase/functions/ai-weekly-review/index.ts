import { aiKey, aiUrl, aiModel } from "../_shared/ai.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { claimCall, corsHeaders, json, localDate, quotaExceeded, requireUser } from "../_shared/guard.ts";
import { recoveryMeasured } from "../_shared/readiness.ts";

/** Output ceiling — the reply is a structured review, not an essay. */
const MAX_TOKENS = 1200;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const AI_KEY = aiKey();
    if (!AI_KEY) throw new Error("AI key not configured — set ASCND_AI_KEY or LOVABLE_API_KEY");

    const caller = await requireUser(req);
    if (caller instanceof Response) return caller;
    const { userId, supabase } = caller;

    /*
      `week_start` was taken on trust and handed to `new Date()`. Anything that
      is not a date makes an Invalid Date, `toISOString()` throws two lines
      later, and the request ends as a 500 — with the call already counted,
      because the quota was claimed before the body was read. Same shape check
      `ai-coach` already applies to its own `date`.
    */
    const { week_start, lang = "vi" } = await req.json().catch(() => ({}));
    /*
      The shape check this used to do was `^\d{4}-\d{2}-\d{2}$` and nothing
      more, which `9999-99-99` satisfies — and `new Date("9999-99-99")` is an
      Invalid Date whose `toISOString()` throws four lines down. Same 500, same
      already-counted quota, from the same parameter the earlier fix was about;
      a shape is not a date. `localDate` does both, in one place the other
      functions use too.
    */
    if (localDate(week_start) === null) {
      return json({ error: "week_start must be YYYY-MM-DD" }, 400);
    }

    if (!(await claimCall(supabase, "ai-weekly-review"))) return quotaExceeded();

    const weekEnd = new Date(week_start);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const endStr = weekEnd.toISOString().split("T")[0];

    // Fetch 28 days for ACWR context
    const monthStart = new Date(week_start);
    monthStart.setDate(monthStart.getDate() - 21);

    const [profileRes, dailyRes, sleepRes, workoutRes, prevWeekRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", userId).single(),
      supabase.from("daily_logs").select("*").eq("user_id", userId).gte("date", monthStart.toISOString().split("T")[0]).lte("date", endStr).order("date"),
      supabase.from("sleep_logs").select("*").eq("user_id", userId).gte("waketime", `${week_start}T00:00:00`).lte("waketime", `${endStr}T23:59:59`).order("waketime"),
      supabase.from("workout_sessions").select("template_name, volume_load, session_rpe, pain_flags, date_time").eq("user_id", userId).gte("date_time", `${week_start}T00:00:00`).lte("date_time", `${endStr}T23:59:59`).order("date_time"),
      supabase.from("daily_logs").select("date, kcal, protein_g, volume_load, readiness_score").eq("user_id", userId).gte("date", monthStart.toISOString().split("T")[0]).lt("date", week_start).order("date"),
    ]);

    const profile = profileRes.data;
    const allLogs = dailyRes.data ?? [];
    const weekLogs = allLogs.filter(l => l.date >= week_start && l.date <= endStr);
    const sleepLogs = sleepRes.data ?? [];
    const workouts = workoutRes.data ?? [];

    /*
      ── the model was being handed the same trap the screen fell into ──

      `weekLogs` is one row per `daily_logs` row, and a row is not a meal. The
      health sync upserts `{ user_id, date, steps }` for finished HealthKit days
      and an upsert **creates** the row; a day whose only meal is deleted keeps
      its row at zero too. So the payload carried days reading
      `kcal: 0, protein_g: 0, steps: 7400`, and any average taken over them is
      the truth multiplied by `days logged / 7` — measured on PostgreSQL 16.13
      as 900 kcal for somebody eating 2,100 on each of the three days they
      logged.

      The rows stay: a per-day fact is a fact, and the model can see which days
      have food and which do not. What is added is the average *already taken
      over the right population*, so the number the model reasons from is not
      one it has to derive from rows whose zeros mean "not recorded".

      Per metric, not one shared "logged day" predicate: `LOGGED_DAY_FILTER`
      answers *"was this a logged day"*, and a workout-only day answers yes
      while carrying no calories. Measured, three meal days plus two
      workout-only days plus two step-only days — truth 2,100, that filter
      1,260, per-metric 2,100. The same convention `adaptiveTDEE` keeps.
    */
    const nutritionMean = (rows: any[], key: string) => {
      const vals = rows.map((l) => Number(l[key])).filter((v) => Number.isFinite(v) && v > 0);
      return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null;
    };
    /* Block-bodied like the one above, and deliberately so: `tools/nutrition-averages.mjs`
       lifts both of these out of this file and runs them, rather than keeping a
       second copy that would agree with itself. One extraction shape for both. */
    const nutritionDays = (rows: any[], key: string) => {
      return rows.filter((l) => Number(l[key]) > 0).length;
    };

    const ctx = {
      profile: profile ? { goal: profile.goal, tdee: profile.tdee_target_kcal, protein: profile.macro_protein_g, sleep_target: profile.sleep_target_hours, training_level: profile.training_level } : null,
      week: {
        /* Averages over the days that carry each metric; `null` when there are
           none, because "no nutrition was recorded" is not the number 0. */
        nutrition: {
          avg_kcal: nutritionMean(weekLogs, "kcal"),
          kcal_days: nutritionDays(weekLogs, "kcal"),
          avg_protein_g: nutritionMean(weekLogs, "protein_g"),
          protein_days: nutritionDays(weekLogs, "protein_g"),
          days_in_week: weekLogs.length,
        },
        /*
          `recovery_measured` rather than `readiness_explain`: the row already
          carries the token (this query selects `*`), and the model needs the
          one fact it encodes, not the string. A week of readiness scores built
          from training load alone is not evidence about how somebody recovered
          — in either direction — and this is the only field that says so.

          It describes the row as stored. Past days are recomputed with windows
          anchored at the present (BUG-106, open), so this is not a claim that a
          past day's recovery availability is temporally settled; the prompt
          does not present it as one.
        */
        logs: weekLogs.map(l => ({ date: l.date, kcal: l.kcal, protein_g: l.protein_g, carbs_g: l.carbs_g, fat_g: l.fat_g, volume_load: l.volume_load, readiness: l.readiness_score, readiness_status: l.readiness_status, recovery_measured: recoveryMeasured(l.readiness_explain), steps: l.steps, sleep_min: l.sleep_duration_min })),
        sleep: sleepLogs.map(s => ({ date: new Date(s.waketime).toISOString().split("T")[0], quality: s.quality, deep_min: s.deep_min, rem_min: s.rem_min, light_min: s.light_min })),
        workouts: workouts.map(w => ({ date: new Date(w.date_time).toISOString().split("T")[0], name: w.template_name, volume: w.volume_load, rpe: w.session_rpe, pain_flags: w.pain_flags })),
      },
      month_context: { total_logs: allLogs.length, avg_volume_28d: allLogs.reduce((s: number, l: any) => s + (Number(l.volume_load) || 0), 0) / Math.max(allLogs.length, 1) },
    };

    const response = await fetch(aiUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AI_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: aiModel(),
        max_tokens: MAX_TOKENS,
        messages: [
          {
            role: "system",
            content: lang === "en"
              ? `You are an AI assistant for weekly lifestyle-habit tracking. Analyze the data and give observations + suggestions in English.

DATA: ${JSON.stringify(ctx)}

READING THE DATA:
- readiness is 0-100 and measures TRAINING CAPACITY — HRV, resting heart rate, sleep and training load combined over whichever were actually measured. readiness_status describes that capacity state. Neither is a direct measurement of recovery
- recovery_measured says only whether a recovery component (HRV, resting heart rate or sleep) was measured that day. It does NOT say recovery was good or bad. On days where it is false, never say or imply from readiness alone that the user was recovered, unrecovered, fatigued or needed recovery — the app has no reading for it. Where it is true, recovery wording is allowed only as far as the readings themselves support

IMPORTANT PRINCIPLES:
- NEVER predict, diagnose or detect any illness or health condition
- ONLY comment on lifestyle habits (eating, sleeping, training, hydration) and suggest simple improvements
- Suggestions must be things ordinary people know but often skip
- Do not give medical advice in any form

Return insights (observations from the data) and recommendations (concrete actions for next week). All text in English.`
              : `Bạn là AI hỗ trợ theo dõi thói quen sinh hoạt hàng tuần. Phân tích dữ liệu và đưa ra nhận xét + gợi ý bằng tiếng Việt.

DỮ LIỆU: ${JSON.stringify(ctx)}

CÁCH ĐỌC DỮ LIỆU:
- readiness thang 0-100, đo KHẢ NĂNG TẬP LUYỆN — ghép HRV, nhịp tim nghỉ, giấc ngủ và tải tập trên những chiều thật sự đo được. readiness_status mô tả trạng thái khả năng đó. Cả hai đều KHÔNG phải phép đo trực tiếp về phục hồi
- recovery_measured chỉ cho biết hôm đó CÓ đo được một chiều phục hồi (HRV, nhịp tim nghỉ hoặc giấc ngủ) hay không. Nó KHÔNG nói phục hồi tốt hay kém. Với những ngày nó là false, tuyệt đối không dựa vào mỗi readiness để nói hay ám chỉ người dùng đã hồi, chưa hồi, đang mệt hay cần phục hồi — app không có số liệu đó. Với ngày nó là true, chỉ được dùng ngôn ngữ phục hồi trong phạm vi các chỉ số thật sự cho thấy

NGUYÊN TẮC QUAN TRỌNG:
- KHÔNG BAO GIỜ dự đoán, chẩn đoán hay phát hiện bệnh lý hoặc tình trạng sức khoẻ
- CHỈ nhận xét về thói quen sinh hoạt (ăn, ngủ, tập, uống nước) và gợi ý cải thiện đơn giản
- Gợi ý phải là những điều người bình thường đều biết nhưng hay bỏ qua
- Không đưa lời khuyên y tế dưới bất kỳ hình thức nào

Trả về insights (quan sát từ dữ liệu) và recommendations (hành động cụ thể cho tuần tới).`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "weekly_analysis",
              description: "Generate weekly review analysis",
              parameters: {
                type: "object",
                properties: {
                  summary: { type: "string", description: "1-2 câu tổng kết tuần" },
                  score: { type: "number", description: "Điểm tuần 0-100" },
                  insights: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        category: { type: "string", enum: ["nutrition", "training", "sleep", "recovery"] },
                        icon: { type: "string" },
                        title: { type: "string" },
                        detail: { type: "string" },
                        trend: { type: "string", enum: ["up", "down", "stable"] },
                      },
                      required: ["category", "icon", "title", "detail", "trend"],
                      additionalProperties: false,
                    },
                  },
                  recommendations: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        priority: { type: "string", enum: ["high", "medium", "low"] },
                        action: { type: "string" },
                        reason: { type: "string" },
                      },
                      required: ["priority", "action", "reason"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["summary", "score", "insights", "recommendations"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "weekly_analysis" } },
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
    let analysis = { summary: "", score: 0, insights: [], recommendations: [] };

    if (toolCall?.function?.arguments) {
      try {
        analysis = JSON.parse(toolCall.function.arguments);
      } catch { /* use default */ }
    }

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-weekly-review error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
