/**
 * The gate every AI function stands behind.
 *
 * All five used to check the caller like this:
 *
 *     const { data } = await supabase.auth.getClaims(token);
 *     if (error || !data?.claims) return 401;
 *     const userId = data.claims.sub;
 *
 * which asks only *"is this a validly-signed token for this project?"* —
 * and the publishable anon key is exactly that. It is a project-signed JWT
 * whose claims are `{iss, ref, role: "anon", iat, exp}`, so `getClaims`
 * verified it, the check passed, and `userId` came out `undefined`. Since
 * nothing returned early between there and the gateway call, anyone holding
 * the anon key — which ships inside the app binary — could spend this
 * project's Lovable credits. `requireUser` asks the two further questions
 * that close it: is there a subject, and is the role `authenticated`.
 *
 * `verify_jwt = false` stays in config.toml: the functions read the header
 * themselves so they can forward the caller's token to PostgREST and keep
 * RLS in force. The platform gate would only duplicate this one.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Database nằm ở đâu — cho một function có thể KHÔNG được deploy cạnh nó.
 *
 * ── vì sao cần ba biến này ──
 *
 * Sáu function AI gọi `ai.gateway.lovable.dev`, và khoá của gateway đó nằm sẵn
 * dưới dạng secret trong project Lovable cũ. Lovable không cho xem lại khoá, nên
 * deploy chúng sang project mới là không làm được: sẽ không có gì để đặt vào
 * LOVABLE_API_KEY.
 *
 * Đường còn lại là để chúng ở project cũ và trỏ vào database MỚI. Nhưng
 * `SUPABASE_URL`, `SUPABASE_ANON_KEY` và `SUPABASE_SERVICE_ROLE_KEY` do nền tảng
 * tự tiêm và luôn trỏ về project chứa function — không đặt đè được, và cũng
 * không nên: chúng là danh tính của chính runtime đó.
 *
 * Nên ba tên riêng, mỗi cái có FALLBACK về biến nền tảng. Không đặt gì thì mọi
 * thứ chạy y như cũ; đặt vào thì function đọc database khác. Ngày các function
 * này về được project mới, xoá secret là xong, không phải sửa một dòng code.
 *
 * ── và vì sao cả BA, không phải chỉ URL ──
 *
 * `requireUser` bên dưới xác thực token của người gọi bằng chính client này.
 * Token do project MỚI cấp, nên nó chỉ verify được ở project mới. Dời địa chỉ
 * mà giữ khoá cũ thì mọi request đều 401 — xác thực và truy vấn phải dời cùng
 * nhau hoặc không dời gì cả.
 */
const env = (own: string, platform: string) => Deno.env.get(own) ?? Deno.env.get(platform)!;
export const dbUrl = () => env("ASCND_DB_URL", "SUPABASE_URL");
export const dbAnonKey = () => env("ASCND_DB_ANON_KEY", "SUPABASE_ANON_KEY");
export const dbServiceKey = () => env("ASCND_DB_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY");

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Lỗi trả cho client: một MÃ, không phải một câu chuyện.
 *
 * ── rò rỉ nó bịt ──
 *
 * Cả sáu function AI từng trả `e instanceof Error ? e.message : "Unknown error"`.
 * Bất kỳ lỗi nào ném ra đều đi nguyên văn qua mạng — kể cả câu nêu tên biến nhà
 * cung cấp, và kể cả lỗi DNS/TLS của `fetch`, thứ mang theo đúng hostname mình
 * đang gọi.
 *
 * `native/src/lib/edge.ts` đã cẩn thận ở đầu bên kia: nó giữ `raw` nhưng "never
 * shown to a user". Nên đây không phải rò rỉ tới mắt người dùng — nó là rò rỉ
 * TỚI ĐƯỜNG TRUYỀN, và nằm lại trong mọi bản bắt gói, log crash hay proxy trung
 * gian. Một client không hiển thị nó vẫn là một client đã nhận nó.
 *
 * ── vì sao một mã chứ không phải một câu tử tế ──
 *
 * Câu tử tế là việc của app, nơi biết ngôn ngữ người dùng đang đọc. Server chỉ
 * cần nói CHUYỆN GÌ đã xảy ra ở mức phân loại được, và mã thì dịch được, ghi log
 * được, và không mang theo thứ gì nó không định nói.
 *
 * Bản đầy đủ vẫn được ghi — ở server, nơi nó thuộc về.
 */
export function opaque(e: unknown, code: string, status = 500): Response {
  console.error(code, e);
  return json({ error: code }, status);
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export interface Caller {
  userId: string;
  supabase: SupabaseClient;
}

/**
 * Returns the caller, or the 401 to send back.
 *
 * The client is built on the anon key with the caller's token forwarded, so
 * every query it makes is still governed by RLS — this never runs as
 * `service_role`.
 */
export async function requireUser(req: Request): Promise<Caller | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Missing auth" }, 401);

  const supabase = createClient(
    dbUrl(),
    dbAnonKey(),
    { global: { headers: { Authorization: authHeader } } },
  );

  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await supabase.auth.getClaims(token);
  const claims = data?.claims as { sub?: string; role?: string; aud?: string | string[] } | undefined;

  // `sub` is what the anon key lacks; `role` is what tells a user token from
  // a service one. Both, or nothing.
  /*
    `aud` cũng phải là "authenticated", không chỉ `role`.

    Hai claim này thường đi cùng nhau, và chính vì thế mà kiểm một cái rồi bỏ
    cái kia nghe như đủ. Chúng trả lời hai câu khác nhau: `role` nói token này
    NÓI nó là gì, `aud` nói token này được cấp CHO AI. Một token được cấp cho
    một đối tượng khác mà mang role đúng thì vẫn không phải token của app này.

    `aud` có thể là chuỗi hoặc mảng theo chuẩn JWT, nên phải nhận cả hai dạng —
    kiểm bằng `===` trên một mảng thì luôn sai, và cái sai đó chặn hết mọi người
    dùng thật.
  */
  const aud = Array.isArray(claims?.aud) ? claims.aud : [claims?.aud];
  if (error || !claims?.sub || claims.role !== "authenticated" || !aud.includes("authenticated")) {
    return json({ error: "Unauthorized" }, 401);
  }

  return { userId: claims.sub, supabase };
}

/**
 * One call's worth of this user's daily quota, or `false` if they are out.
 *
 * The ceilings live in the database (`public.claim_ai_call`), not here and
 * not in the client, so calling the RPC directly gains nothing — a user can
 * only burn their own allowance.
 *
 * ── it used to fail open, and that was the right call for a free app ──
 *
 * The reasoning was: the migration creating the RPC might not be applied yet,
 * and an unapplied migration must not take the AI offline. Under that rule an
 * error meant "allow".
 *
 * That trade stops being worth it the moment the app charges money. The thing
 * on the other side of this call is a paid gateway, and the failure mode of
 * failing open is an unbounded bill with no ceiling and no alert — a cost that
 * arrives as an invoice rather than as a bug report. Failing closed costs an
 * outage, which is loud, bounded, and fixed by applying a migration that is
 * already in the repository.
 *
 * So: no quota counter, no AI. If this ever starts returning 503 in production,
 * the fix is to apply `20260729120000_ai_usage_quota.sql`, not to soften this.
 */
/** Ba trạng thái của một lượt gọi: trong hạn mức, vượt-nhưng-có-ví, hoặc hết. */
export type Gate = "ok" | "overage" | "denied";

/**
 * Cổng gọi AI, và nó ĐẾM — gọi đúng một lần cho mỗi lượt.
 *
 * `claimCall` cũ trả boolean, và boolean không diễn tả được ba trạng thái. Nó
 * vẫn còn và vẫn đúng, nhưng nó gọi cùng một hàm SQL, nên gọi cả hai trong một
 * lượt là đếm lượt đó hai lần.
 *
 * Lỗi RPC thì TỪ CHỐI, không thả. Một bộ đếm hỏng nghĩa là không ai biết ai đã
 * tiêu gì; cho đi qua lúc đó là chọn "cứ tiêu tiền" thay vì "dừng lại".
 */
export async function aiGate(supabase: SupabaseClient, kind: string): Promise<Gate> {
  const { data, error } = await supabase.rpc("ai_gate", { p_kind: kind });
  if (error) {
    console.error(`ai_gate failed (${error.message}) — refusing ${kind}`);
    return "denied";
  }
  return data === "ok" || data === "overage" ? data : "denied";
}

/**
 * Ghi lại token đã tiêu.
 *
 * ── vì sao lỗi ở đây KHÔNG chặn câu trả lời ──
 *
 * Nó chạy SAU khi nhà cung cấp đã trả lời và người dùng đã có thứ họ hỏi. Tiền
 * đã tiêu rồi; ném lỗi ở đây chỉ biến một lượt đã thành công thành một màn báo
 * hỏng, mà con số vẫn không được ghi.
 *
 * Nên nó nuốt lỗi và ghi log. Đó là một đánh đổi có ý thức về phía bất lợi cho
 * mình: ghi sót thì mình chịu, còn báo hỏng thì người dùng chịu.
 */
export async function recordTokens(
  supabase: SupabaseClient,
  kind: string,
  tokens: number,
  overage: boolean,
): Promise<void> {
  if (!Number.isFinite(tokens) || tokens <= 0) return;
  const { error } = await supabase.rpc("spend_ai_tokens", {
    p_kind: kind,
    p_tokens: Math.round(tokens),
    p_overage: overage,
  });
  if (error) console.error(`spend_ai_tokens failed (${error.message}) — ${kind} ${tokens}`);
}

/**
 * Số token của một response, nếu nhà cung cấp có nói.
 *
 * Chuẩn OpenAI đặt nó ở `usage.total_tokens`. Không phải bên nào cũng gửi, và
 * một bên không gửi thì lượt đó không tính tiền được — đó là mất mát về phía
 * mình, không phải về phía người dùng, nên nó im lặng trả 0.
 */
export function tokensOf(payload: unknown): number {
  const u = (payload as { usage?: { total_tokens?: unknown } })?.usage;
  const n = Number(u?.total_tokens);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Đọc con số token ra khỏi một dòng SSE, ở nền.
 *
 * ── vì sao nó không được `await` ──
 *
 * Người dùng đã có câu trả lời của họ; phép ghi sổ này chạy sau. Bắt response
 * chờ nó là bắt người ta chờ một việc không liên quan đến thứ họ hỏi.
 *
 * ── vì sao nó nuốt mọi lỗi ──
 *
 * Cùng lý do với `recordTokens`: tiền đã tiêu rồi. Một dòng đứt giữa chừng, một
 * chunk không parse được, một `usage` không bao giờ tới — tất cả đều nghĩa là
 * mình không tính được lượt đó, và mình chịu. Không cái nào là lý do để làm
 * hỏng một câu trả lời đã thành công.
 *
 * Chỉ giữ số CUỐI CÙNG đọc được: chuẩn OpenAI gửi `usage` một lần ở chunk cuối,
 * nhưng một bên khác có thể gửi tổng luỹ tiến qua từng chunk, và trong cả hai
 * cách thì con số cuối là con số đúng.
 */
export function meterStream(
  supabase: SupabaseClient,
  kind: string,
  stream: ReadableStream<Uint8Array>,
  overage: boolean,
): void {
  (async () => {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const body = line.slice(6).trim();
          if (body === "[DONE]") continue;
          try {
            const n = tokensOf(JSON.parse(body));
            if (n > 0) total = n;
          } catch {
            /* Một chunk không parse được là một chunk, không phải một lỗi. */
          }
        }
      }
    } catch (e) {
      console.error(`meterStream ${kind}`, e);
    }
    if (total > 0) await recordTokens(supabase, kind, total, overage);
  })();
}

export async function claimCall(supabase: SupabaseClient, kind: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("claim_ai_call", { p_kind: kind });
  if (error) {
    console.error(`claim_ai_call failed (${error.message}) — refusing ${kind}`);
    return false;
  }
  return data !== false;
}

/**
 * A calendar date the caller sent, or `null` if they did not send a usable one.
 *
 * ── the same bug, in two functions that did not get the fix ──
 *
 * `ai-weekly-review` learned this the hard way: `week_start` was taken on trust
 * and handed to `new Date()`, and anything that is not a date makes an Invalid
 * Date whose `toISOString()` throws — a 500, **with the quota already claimed**.
 * It got a regex. `ai-coach` has one of its own. `ai-meal-suggest` and
 * `ai-smart-nudges` were left as `date ?? new Date()...`, and nudges does the
 * identical arithmetic:
 *
 *     date: "not-a-date"  →  RangeError: Invalid time value
 *                         →  HTTP 500, claim_ai_call already counted 1
 *
 * Measured by driving the real handler. So the check lives here now, once,
 * rather than as a fourth hand-written regex — a rule kept at the call sites is
 * a rule the next call site does not know about.
 *
 * `null` rather than a throw: an older client may send no date at all, and the
 * server's own UTC day is the established fallback for that. An unusable date
 * is the same situation as an absent one.
 */
export function localDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  /* The shape is not enough: `9999-99-99` matches it and is not a day. */
  return Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? null : value;
}

/**
 * One of a known set, or `null`.
 *
 * For request fields whose values the app itself chooses. `meal_type` is the
 * one that needed it: it was copied straight from the body into the prompt with
 * no length limit and no domain, so a 200,000-character `meal_type` produced a
 * **202,240-character** request to a paid gateway — measured — for one unit of
 * a quota that counts calls, not size. The client only ever sends one of seven
 * words, so a list is a tighter and more honest bound than a length cap.
 */
export function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

/** The reply for a caller who has used the day up. */
export const quotaExceeded = () =>
  json({ error: "Đã dùng hết lượt AI hôm nay. Vui lòng thử lại vào ngày mai." }, 429);
