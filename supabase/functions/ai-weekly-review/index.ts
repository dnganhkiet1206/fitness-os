import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { claimCall, corsHeaders, quotaExceeded, requireUser } from "../_shared/guard.ts";

/** Output ceiling — the reply is a structured review, not an essay. */
const MAX_TOKENS = 1200;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const caller = await requireUser(req);
    if (caller instanceof Response) return caller;
    const { userId, supabase } = caller;

    if (!(await claimCall(supabase, "ai-weekly-review"))) return quotaExceeded();

    const { week_start, lang = "vi" } = await req.json();

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

    const ctx = {
      profile: profile ? { goal: profile.goal, tdee: profile.tdee_target_kcal, protein: profile.macro_protein_g, sleep_target: profile.sleep_target_hours, training_level: profile.training_level } : null,
      week: {
        logs: weekLogs.map(l => ({ date: l.date, kcal: l.kcal, protein_g: l.protein_g, carbs_g: l.carbs_g, fat_g: l.fat_g, volume_load: l.volume_load, readiness: l.readiness_score, readiness_status: l.readiness_status, steps: l.steps, sleep_min: l.sleep_duration_min })),
        sleep: sleepLogs.map(s => ({ date: new Date(s.waketime).toISOString().split("T")[0], quality: s.quality, deep_min: s.deep_min, rem_min: s.rem_min, light_min: s.light_min })),
        workouts: workouts.map(w => ({ date: new Date(w.date_time).toISOString().split("T")[0], name: w.template_name, volume: w.volume_load, rpe: w.session_rpe, pain_flags: w.pain_flags })),
      },
      month_context: { total_logs: allLogs.length, avg_volume_28d: allLogs.reduce((s: number, l: any) => s + (Number(l.volume_load) || 0), 0) / Math.max(allLogs.length, 1) },
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
              ? `You are an AI assistant for weekly lifestyle-habit tracking. Analyze the data and give observations + suggestions in English.

DATA: ${JSON.stringify(ctx)}

IMPORTANT PRINCIPLES:
- NEVER predict, diagnose or detect any illness or health condition
- ONLY comment on lifestyle habits (eating, sleeping, training, hydration) and suggest simple improvements
- Suggestions must be things ordinary people know but often skip
- Do not give medical advice in any form

Return insights (observations from the data) and recommendations (concrete actions for next week). All text in English.`
              : `Bạn là AI hỗ trợ theo dõi thói quen sinh hoạt hàng tuần. Phân tích dữ liệu và đưa ra nhận xét + gợi ý bằng tiếng Việt.

DỮ LIỆU: ${JSON.stringify(ctx)}

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
