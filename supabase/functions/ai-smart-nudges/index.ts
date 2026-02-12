import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: authErr } = await supabase.auth.getClaims(token);
    if (authErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;
    const today = new Date().toISOString().split("T")[0];
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const daysAgo3 = threeDaysAgo.toISOString().split("T")[0];

    const [profileRes, dailyLogsRes, sleepRes, waterRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", userId).single(),
      supabase.from("daily_logs").select("date, kcal, protein_g, carbs_g, fat_g, readiness_score, readiness_status, sleep_duration_min, steps, volume_load").eq("user_id", userId).gte("date", daysAgo3).order("date", { ascending: false }).limit(3),
      supabase.from("sleep_logs").select("bedtime, waketime, quality, deep_min, rem_min, light_min").eq("user_id", userId).order("waketime", { ascending: false }).limit(3),
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
        total_min: (s.deep_min ?? 0) + (s.rem_min ?? 0) + (s.light_min ?? 0),
      })),
      water_today_ml: waterToday,
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
        messages: [
          {
            role: "system",
            content: `Bạn là AI fitness coach. Dựa trên dữ liệu người dùng, tạo 2-4 nudge/gợi ý ngắn gọn, thực tế cho hôm nay.

DỮ LIỆU: ${JSON.stringify(ctx)}

Trả về JSON array với format:
[{"type": "hydration|sleep|protein|steps|recovery|nutrition|training", "message": "...", "priority": "high|medium|low", "icon": "💧|🌙|🥩|👣|❤️|🔥|💪"}]

NGUYÊN TẮC:
- Mỗi nudge tối đa 60 ký tự
- Dựa trên dữ liệu thực, không generic
- Ưu tiên: thiếu hụt lớn nhất trước
- Nếu buổi tối: nhắc ngủ sớm, nếu sáng: nhắc uống nước + protein
- Không đưa lời khuyên y tế`,
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
