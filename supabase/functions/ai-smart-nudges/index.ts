import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { claimCall, corsHeaders, quotaExceeded, requireUser } from "../_shared/guard.ts";
import { asleepMinutes, localHour, SLEEP_COLUMNS } from "../_shared/sleep.ts";

/** Output ceiling — the reply is a handful of one-line nudges. */
const MAX_TOKENS = 700;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const caller = await requireUser(req);
    if (caller instanceof Response) return caller;
    const { userId, supabase } = caller;

    if (!(await claimCall(supabase, "ai-smart-nudges"))) return quotaExceeded();

    const { lang = "vi", date, tzOffset } = await req.json().catch(() => ({}));
    // Prefer the client's local calendar date; fall back to server UTC
    const today = date ?? new Date().toISOString().split("T")[0];
    const threeDaysAgo = new Date(`${today}T00:00:00Z`);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const daysAgo3 = threeDaysAgo.toISOString().split("T")[0];

    const [profileRes, dailyLogsRes, sleepRes, waterRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", userId).single(),
      supabase.from("daily_logs").select("date, kcal, protein_g, carbs_g, fat_g, readiness_score, readiness_status, sleep_duration_min, steps, volume_load").eq("user_id", userId).gte("date", daysAgo3).order("date", { ascending: false }).limit(3),
      supabase.from("sleep_logs").select(`quality, deep_min, rem_min, light_min, ${SLEEP_COLUMNS}`).eq("user_id", userId).order("waketime", { ascending: false }).limit(3),
      supabase.from("water_logs").select("amount_ml, date").eq("user_id", userId).eq("date", today),
    ]);

    const profile = profileRes.data;
    const dailyLogs = dailyLogsRes.data ?? [];
    const sleepLogs = sleepRes.data ?? [];
    const waterToday = (waterRes.data ?? []).reduce((sum: number, w: any) => sum + (w.amount_ml || 0), 0);

    const ctx = {
      profile: profile ? {
        goal: profile.goal,
        tdee: profile.tdee_target_kcal,
        protein_target: profile.macro_protein_g,
        sleep_target_hours: profile.sleep_target_hours,
        water_target_ml: profile.water_target_ml,
      } : null,
      recent_days: dailyLogs,
      recent_sleep: sleepLogs.map((s: any) => ({
        bedtime: s.bedtime,
        waketime: s.waketime,
        quality: s.quality,
        /*
          The stage sum is only a night's length for a night HealthKit wrote.
          A night typed into `log-sleep` leaves all three boxes empty, stored
          as 0 — so this used to tell the model the person slept **zero
          minutes**, and then ask it for a nudge about their recovery.
        */
        total_min: asleepMinutes(s),
      })),
      water_today_ml: waterToday,
      /*
        `new Date().getHours()` here was the hour in UTC, on a Deno host. The
        prompt below branches on it ("if evening: remind to sleep early; if
        morning: remind water + protein"), so at UTC+7 somebody got the
        morning nudge at eight in the evening. `null` when the client did not
        say, because a prompt that branches on time of day is better off
        knowing it does not know than being confidently seven hours out.
      */
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
              ? `You are an AI habit-reminder assistant. Based on the user's data, create 2-4 short nudges for today.

DATA: ${JSON.stringify(ctx)}

IMPORTANT PRINCIPLES:
- NEVER predict or diagnose any health condition or illness
- ONLY remind about simple things everyone knows but forgets: drink water, sleep enough, eat enough, rest
- Each nudge max 60 characters
- Base it on real data, not generic
- Prioritize: biggest shortfall first
- If evening: remind to sleep early; if morning: remind water + protein
- Do not give medical advice in any form. All text in English.`
              : `Bạn là AI hỗ trợ nhắc nhở thói quen sinh hoạt. Dựa trên dữ liệu người dùng, tạo 2-4 gợi ý ngắn gọn cho hôm nay.

DỮ LIỆU: ${JSON.stringify(ctx)}

NGUYÊN TẮC QUAN TRỌNG:
- KHÔNG BAO GIỜ dự đoán hay chẩn đoán tình trạng sức khoẻ, bệnh lý
- CHỈ nhắc nhở những việc đơn giản ai cũng biết nhưng hay quên: uống nước, ngủ đủ, ăn đủ chất, nghỉ ngơi
- Mỗi nudge tối đa 60 ký tự
- Dựa trên dữ liệu thực, không generic
- Ưu tiên: thiếu hụt lớn nhất trước
- Nếu buổi tối: nhắc ngủ sớm, nếu sáng: nhắc uống nước + protein
- Không đưa lời khuyên y tế dưới bất kỳ hình thức nào`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_nudges",
              description: "Generate smart nudges for user",
              parameters: {
                type: "object",
                properties: {
                  nudges: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        type: { type: "string", enum: ["hydration", "sleep", "protein", "steps", "recovery", "nutrition", "training"] },
                        message: { type: "string" },
                        priority: { type: "string", enum: ["high", "medium", "low"] },
                        icon: { type: "string" },
                      },
                      required: ["type", "message", "priority", "icon"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["nudges"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_nudges" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    let nudges = [];

    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        nudges = parsed.nudges || [];
      } catch {
        nudges = [];
      }
    }

    return new Response(JSON.stringify({ nudges }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-smart-nudges error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
