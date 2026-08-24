import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { claimCall, corsHeaders, localDate, quotaExceeded, requireUser } from "../_shared/guard.ts";
import { recoveryMeasured } from "../_shared/readiness.ts";
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

    /*
      The body first, the quota after. `claimCall` counts a request whether or
      not the gateway is reached, so a malformed one used to cost a call for
      nothing — see the same note in `ai-coach`.
    */
    const { lang = "vi", date, tzOffset } = await req.json().catch(() => ({}));

    if (!(await claimCall(supabase, "ai-smart-nudges"))) return quotaExceeded();
    /* Prefer the client's local calendar date; fall back to server UTC.
       Validated, because the arithmetic two lines down is `new Date(...)` and
       an unusable string makes an Invalid Date whose `toISOString()` throws —
       a 500 with the quota above already counted. `ai-weekly-review` was fixed
       for exactly this; the check is shared now so a third function cannot
       miss it. Measured: date "not-a-date" → RangeError → 500, quota 1. */
    const today = localDate(date) ?? new Date().toISOString().split("T")[0];
    const threeDaysAgo = new Date(`${today}T00:00:00Z`);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const daysAgo3 = threeDaysAgo.toISOString().split("T")[0];

    const [profileRes, dailyLogsRes, sleepRes, waterRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", userId).single(),
      supabase.from("daily_logs").select("date, kcal, protein_g, carbs_g, fat_g, readiness_score, readiness_status, readiness_explain, sleep_duration_min, steps, volume_load").eq("user_id", userId).gte("date", daysAgo3).order("date", { ascending: false }).limit(3),
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
      /*
        ── mapped, because the select now fetches something the model must not see ──

        This was `recent_days: dailyLogs` — the selected rows, forwarded whole.
        That was fine while every selected column was one the model should read.
        `readiness_explain` is not: it is the engine's internal token
        (`"hrv:50|sleep:65"`), a second copy of numbers already in the payload
        and one more string to misquote. It is fetched only so the boolean below
        can be derived from it.

        Every field the passthrough sent is listed here. A row carries more
        columns than a model needs, and the way that goes wrong is silently —
        so the mapping is explicit and `tools/readiness-confidence.mjs` asserts
        both halves: the token never leaves, and nothing that used to leave
        stopped leaving.
      */
      recent_days: dailyLogs.map((d: any) => ({
        date: d.date,
        kcal: d.kcal,
        protein_g: d.protein_g,
        carbs_g: d.carbs_g,
        fat_g: d.fat_g,
        readiness_score: d.readiness_score,
        readiness_status: d.readiness_status,
        recovery_measured: recoveryMeasured(d.readiness_explain),
        sleep_duration_min: d.sleep_duration_min,
        steps: d.steps,
        volume_load: d.volume_load,
      })),
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
              ? `You are an AI habit-reminder assistant. Reply in English. Based on the user's data, create 2-4 short nudges for today.

DATA: ${JSON.stringify(ctx)}

IMPORTANT PRINCIPLES:
- A null or missing field was NOT MEASURED. Never say the user slept nothing, drank nothing or trained none because a field is null — skip that topic instead
- readiness is 0-100 and measures TRAINING CAPACITY — HRV, resting heart rate, sleep and training load combined over whichever were actually measured. readiness_status describes that capacity state. Neither is a direct measurement of recovery
- recovery_measured says only whether a recovery component (HRV, resting heart rate or sleep) was measured that day. It does NOT say recovery was good or bad. When it is false, never say or imply from readiness alone that the user is recovered, unrecovered, fatigued or needs recovery — the app has no reading for it. When it is true, recovery wording is allowed only as far as the readings themselves support
- current_hour is null when the app does not know the local time: then do not mention or assume a time of day
- NEVER predict or diagnose any health condition or illness
- ONLY remind about simple things everyone knows but forgets: drink water, sleep enough, eat enough, rest
- Each nudge max 60 characters
- Base it on real data, not generic
- Prioritize: biggest shortfall first
- If evening: remind to sleep early; if morning: remind water + protein
- Do not give medical advice in any form
- Every nudge in English, including when the data contains Vietnamese words`
              : `Bạn là AI hỗ trợ nhắc nhở thói quen sinh hoạt. Trả lời bằng tiếng Việt. Dựa trên dữ liệu người dùng, tạo 2-4 gợi ý ngắn gọn cho hôm nay.

DỮ LIỆU: ${JSON.stringify(ctx)}

NGUYÊN TẮC QUAN TRỌNG:
- Trường nào null hoặc không có nghĩa là CHƯA ĐO ĐƯỢC. Đừng bao giờ nói người dùng không ngủ, không uống nước hay không tập chỉ vì trường đó null — hãy bỏ qua chủ đề đó
- readiness thang 0-100, đo KHẢ NĂNG TẬP LUYỆN — ghép HRV, nhịp tim nghỉ, giấc ngủ và tải tập trên những chiều thật sự đo được. readiness_status mô tả trạng thái khả năng đó. Cả hai đều KHÔNG phải phép đo trực tiếp về phục hồi
- recovery_measured chỉ cho biết hôm đó CÓ đo được một chiều phục hồi (HRV, nhịp tim nghỉ hoặc giấc ngủ) hay không. Nó KHÔNG nói phục hồi tốt hay kém. Khi nó là false, tuyệt đối không dựa vào mỗi readiness để nói hay ám chỉ người dùng đã hồi, chưa hồi, đang mệt hay cần phục hồi — app không có số liệu đó. Khi nó là true, chỉ được dùng ngôn ngữ phục hồi trong phạm vi các chỉ số thật sự cho thấy
- current_hour là null khi app không biết giờ địa phương: khi đó không nhắc và không suy đoán thời điểm trong ngày
- KHÔNG BAO GIỜ dự đoán hay chẩn đoán tình trạng sức khoẻ, bệnh lý
- CHỈ nhắc nhở những việc đơn giản ai cũng biết nhưng hay quên: uống nước, ngủ đủ, ăn đủ chất, nghỉ ngơi
- Mỗi nudge tối đa 60 ký tự
- Dựa trên dữ liệu thực, không generic
- Ưu tiên: thiếu hụt lớn nhất trước
- Nếu buổi tối: nhắc ngủ sớm, nếu sáng: nhắc uống nước + protein
- Không đưa lời khuyên y tế dưới bất kỳ hình thức nào
- Mọi gợi ý viết bằng tiếng Việt`,
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
