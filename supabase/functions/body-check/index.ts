import { callAI } from "../_shared/ai.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { aiGate, aiPayload, corsHeaders, json, opaque, quotaExceeded, requireUser, toolArgs } from "../_shared/guard.ts";

/**
 * Đo cơ thể bằng AI trong Ảnh tiến trình (Kiệt duyệt 04/11): ước tính tỉ lệ mỡ từ MỘT ảnh tiến trình
 * của chính người gọi, ghi vào `body_checks` (một kết quả mỗi ảnh, đo lại thì thay).
 *
 * Là ƯỚC TÍNH từ ảnh: luôn kèm khoảng thấp–cao và độ tin; ánh sáng, góc chụp, quần áo đều làm lệch.
 * Không phải chẩn đoán, không nhận xét ngoại hình. Ảnh không phải người / quá tối / không thấy thân
 * thì không ghi gì và trả `not_body` — app mời chụp lại.
 *
 * Ảnh do app gửi lên (đã có ở máy), không đọc từ bucket: hàm chỉ thấy đúng ảnh người dùng bấm đo.
 */

const MAX_TOKENS = 600;
/** Như `scan-food`: ~3 MB JPEG. */
const MAX_IMAGE_CHARS = 4_000_000;
const PCT_MIN = 3;
const PCT_MAX = 60;
const NOTE_MAX = 280;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const clampPct = (n: number) => Math.min(PCT_MAX, Math.max(PCT_MIN, n));

/**
 * Lời của model → con số được ghi. Xuất ra để test lái thẳng (như `clampItems` của scan-food).
 * `null` = không ghi (không phải ảnh thân người, hay số không phải số đo).
 */
export function clampBody(raw: unknown): {
  body_fat_pct: number; body_fat_low: number; body_fat_high: number; confidence: string; note: string;
} | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (r.is_body_photo !== true) return null;
  const pct = num(r.body_fat_pct);
  if (pct === null || pct < PCT_MIN || pct > PCT_MAX) return null;
  let low = num(r.body_fat_low) ?? pct - 3;
  let high = num(r.body_fat_high) ?? pct + 3;
  // khoảng luôn bao lấy số giữa, rộng ít nhất 2 điểm (ảnh không đo chính xác hơn thế), nhiều nhất 12
  low = clampPct(Math.min(low, pct - 1));
  high = clampPct(Math.max(high, pct + 1));
  if (high - low > 12) {
    low = clampPct(pct - 6);
    high = clampPct(pct + 6);
  }
  const confidence = ["low", "medium", "high"].includes(r.confidence as string) ? (r.confidence as string) : "low";
  const note = typeof r.note === "string" ? r.note.trim().slice(0, NOTE_MAX) : "";
  return { body_fat_pct: round1(pct), body_fat_low: round1(low), body_fat_high: round1(high), confidence, note };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const caller = await requireUser(req);
    if (caller instanceof Response) return caller;
    const { supabase, userId } = caller;

    // đọc và kiểm trước khi tính lượt (như scan-food: request hỏng không tốn lượt)
    const body = await req.json();
    const image_base64 = typeof body?.image_base64 === "string" ? body.image_base64 : "";
    const photo_id = typeof body?.photo_id === "string" && UUID.test(body.photo_id) ? body.photo_id : "";
    const lang = body?.lang === "en" ? "en" : body?.lang === "es" ? "es" : "vi";
    if (!image_base64 || !photo_id) return json({ error: "photo_id and image_base64 required" }, 400);
    if (image_base64.length > MAX_IMAGE_CHARS) return json({ error: "image too large" }, 413);

    // ảnh phải là của người gọi (RLS của `progress_photos` lọc sẵn)
    const { data: photo } = await supabase.from("progress_photos").select("id, date").eq("id", photo_id).maybeSingle();
    if (!photo) return json({ error: "photo not found" }, 404);

    // gợi ý từ hồ sơ (app gửi): chỉ để model đặt khoảng hợp lý, không bắt buộc
    const sex = body?.sex === "male" || body?.sex === "female" ? body.sex : null;
    const height = num(body?.height_cm);
    const weight = num(body?.weight_kg);
    const hints = [
      sex ? `sex: ${sex}` : "",
      height && height >= 100 && height <= 250 ? `height: ${Math.round(height)} cm` : "",
      weight && weight >= 25 && weight <= 350 ? `weight: ${Math.round(weight)} kg` : "",
    ].filter(Boolean).join(", ");

    const gate = await aiGate(supabase, "body-check");
    if (gate === "denied") return quotaExceeded();

    const language = lang === "en" ? "English" : lang === "es" ? "Spanish" : "Vietnamese";
    const system = `You estimate body fat percentage from a single progress photo for a fitness app.
Rules:
- This is a rough visual ESTIMATE, not a measurement or a diagnosis. Give a central value and an honest range (low–high); widen the range when lighting, clothing, angle or distance make it hard.
- Confidence: "high" only for a well-lit, front-facing, torso-visible photo; otherwise "medium" or "low".
- If the image is not a person's body, the torso is not visible, or it is too dark/blurred to judge, set is_body_photo=false.
- Never comment on attractiveness, never shame, never give medical advice. The note is one short, kind, practical sentence in ${language} (e.g. how to take a more comparable photo next time, or a neutral observation).
${hints ? `Context from the user's profile (may help calibrate): ${hints}.` : ""}
Respond only by calling "estimate_body".`;

    const response = await callAI(
      {
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image_base64}` } },
              { type: "text", text: "Estimate body fat percentage from this progress photo." },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "estimate_body",
              description: "Visual body fat estimate for one progress photo",
              parameters: {
                type: "object",
                properties: {
                  is_body_photo: { type: "boolean" },
                  body_fat_pct: { type: "number", description: "Central estimate, percent" },
                  body_fat_low: { type: "number" },
                  body_fat_high: { type: "number" },
                  confidence: { type: "string", enum: ["low", "medium", "high"] },
                  note: { type: "string" },
                },
                required: ["is_body_photo", "body_fat_pct", "body_fat_low", "body_fat_high", "confidence", "note"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "estimate_body" } },
        max_tokens: MAX_TOKENS,
      },
      { vision: true },
    );
    if (!response) return opaque(new Error("no ai provider configured"), "ai_unavailable");
    if (!response.ok) {
      if (response.status === 429) return json({ error: "Rate limit exceeded, please try again later." }, 429);
      console.error("AI gateway error:", response.status, await response.text());
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await aiPayload(supabase, "body-check", response, gate === "overage");
    if (!data) return opaque(new Error("provider returned a non-JSON body"), "ai_incomplete", 502);
    const parsed = toolArgs(data, "estimate_body");
    if (!parsed) return opaque(new Error("model returned no usable tool call"), "ai_incomplete", 502);

    const result = clampBody(parsed);
    if (!result) return json({ ok: false, reason: "not_body" });

    const { data: row, error } = await supabase
      .from("body_checks")
      .upsert({ user_id: userId, photo_id, date: photo.date, ...result }, { onConflict: "photo_id" })
      .select()
      .single();
    if (error) return opaque(error, "write_failed");
    return json({ ok: true, check: row });
  } catch (e) {
    console.error("body-check error:", e);
    return opaque(e, "ai_failed");
  }
});
