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
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;
    const { messages, lang = "vi" } = await req.json();
    const today = new Date().toISOString().split("T")[0];
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const weekAgo = sevenDaysAgo.toISOString().split("T")[0];

    const [profileRes, dailyLogsRes, sleepRes, workoutsRes, bioRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", userId).single(),
      supabase.from("daily_logs").select("*").eq("user_id", userId).gte("date", weekAgo).order("date", { ascending: false }).limit(7),
      supabase.from("sleep_logs").select("*").eq("user_id", userId).gte("waketime", `${weekAgo}T00:00:00`).order("waketime", { ascending: false }).limit(7),
      supabase.from("workout_sessions").select("template_name, volume_load, session_rpe, pain_flags, date_time, sets").eq("user_id", userId).gte("date_time", `${weekAgo}T00:00:00`).order("date_time", { ascending: false }).limit(7),
      supabase.from("biometric_samples").select("hr_bpm, hrv_rmssd_ms, date_time").eq("user_id", userId).order("date_time", { ascending: false }).limit(3),
    ]);

    const profile = profileRes.data;
    const dailyLogs = dailyLogsRes.data ?? [];
    const sleepLogs = sleepRes.data ?? [];
    const workouts = workoutsRes.data ?? [];
    const biometrics = bioRes.data ?? [];

    // Build context
    const ctx = {
      profile: profile ? {
        name: profile.name,
        goal: profile.goal,
        weight_kg: profile.weight_kg,
        height_cm: profile.height_cm,
        activity_level: profile.activity_level,
        training_level: profile.training_level,
        tdee_target: profile.tdee_target_kcal,
        macro_targets: { protein: profile.macro_protein_g, carbs: profile.macro_carbs_g, fat: profile.macro_fat_g },
        sleep_target_hours: profile.sleep_target_hours,
      } : null,
      recent_nutrition: dailyLogs.map(d => ({
        date: d.date,
        kcal: d.kcal,
        protein_g: d.protein_g,
        carbs_g: d.carbs_g,
        fat_g: d.fat_g,
        readiness: d.readiness_score,
        readiness_status: d.readiness_status,
      })),
      recent_sleep: sleepLogs.map(s => ({
        date: new Date(s.waketime).toISOString().split("T")[0],
        deep_min: s.deep_min,
        rem_min: s.rem_min,
        light_min: s.light_min,
        quality: s.quality,
      })),
      recent_workouts: workouts.map(w => ({
        date: new Date(w.date_time).toISOString().split("T")[0],
        name: w.template_name,
        volume_load: w.volume_load,
        rpe: w.session_rpe,
        pain_flags: w.pain_flags,
      })),
      latest_biometrics: biometrics.map(b => ({
        date: new Date(b.date_time).toISOString().split("T")[0],
        hr_bpm: b.hr_bpm,
        hrv_ms: b.hrv_rmssd_ms,
      })),
    };

    const systemPrompt = lang === "en"
      ? `You are an AI assistant for fitness, nutrition and recovery tracking. Reply in English, concise, practical and grounded in the data.

USER DATA (last 7 days):
${JSON.stringify(ctx, null, 2)}

IMPORTANT PRINCIPLES:
- NEVER predict, diagnose or detect any health condition or illness
- NEVER give medical advice or act as a substitute for a doctor in any way
- ONLY suggest simple lifestyle habits that ordinary people know but forget (drink water, sleep enough, eat enough protein, rest after training, etc.)
- Use the user's real data for personalized reminders
- If there are pain flags or low readiness, only advise reducing load and resting — do NOT speculate on medical causes
- Use markdown formatting for clarity
- Always end with a reminder: see a doctor if you have any health concerns`
      : `Bạn là AI hỗ trợ theo dõi fitness, dinh dưỡng và phục hồi. Trả lời bằng tiếng Việt, ngắn gọn, thực tế và dựa trên dữ liệu.

DỮ LIỆU NGƯỜI DÙNG (7 ngày gần nhất):
${JSON.stringify(ctx, null, 2)}

NGUYÊN TẮC QUAN TRỌNG:
- KHÔNG BAO GIỜ dự đoán, chẩn đoán hay phát hiện bất kỳ tình trạng sức khoẻ, bệnh lý nào
- KHÔNG đưa ra lời khuyên y tế hoặc thay thế bác sĩ dưới bất kỳ hình thức nào
- CHỈ gợi ý những thói quen sinh hoạt đơn giản mà người bình thường đều biết nhưng hay quên (uống nước, ngủ đủ giấc, ăn đủ protein, nghỉ ngơi sau tập, v.v.)
- Dựa trên dữ liệu thực của người dùng để nhắc nhở cá nhân hóa
- Nếu có pain flags hoặc readiness thấp, chỉ khuyên giảm tải và nghỉ ngơi, KHÔNG suy đoán nguyên nhân y tế
- Sử dụng markdown formatting cho rõ ràng
- Luôn kết thúc với nhắc nhở: nếu có vấn đề sức khoẻ hãy gặp bác sĩ`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Vui lòng thử lại sau." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Hết credits AI. Vui lòng nạp thêm." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-coach error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
