/**
 * Nhà cung cấp AI nằm ở đâu. Chỗ duy nhất biết.
 *
 * ── vì sao file này tồn tại ──
 *
 * Endpoint, khoá và tên model từng được viết cứng trong SÁU function. Sáu bản
 * sao của cùng một quyết định, và cái giá của chúng không phải hôm nay mà là
 * ngày đổi nhà cung cấp: phải sửa sáu file và tin rằng mình không sót cái nào —
 * mà cái sót thì không lỗi, nó chỉ lặng lẽ tiếp tục gọi và tính tiền vào tài
 * khoản cũ.
 *
 * `native/src/lib/backend.ts` đã viết đúng lập luận này cho phía app: "The only
 * file that knows… swapping projects is one `.env` change rather than a search
 * across the app." Đây là bản tương ứng cho phía server.
 *
 * ── và vì sao nó là biến môi trường, không phải hằng số ──
 *
 * Đổi nhà cung cấp phải là đổi cấu hình, không phải một commit. Endpoint theo
 * chuẩn `/v1/chat/completions` của OpenAI — Google Gemini (endpoint OpenAI của
 * nó), OpenAI, Groq, Together… đều nói — nên đổi bên trong đa số trường hợp là
 * đổi các biến `ASCND_AI_*`, không phải viết lại request.
 *
 * ── không có mặc định (Kiệt 28/10) ──
 *
 * Production chạy Gemini bằng khoá của ASCND: `ASCND_AI_URL` = endpoint OpenAI
 * của Google, `ASCND_AI_KEY` = khoá Gemini. Mặc định cũ (gateway Lovable +
 * `LOVABLE_API_KEY`) là dàn xếp của giai đoạn phát triển và đã gỡ: thiếu biến
 * thì AI TẮT và nói ra ở log lúc khởi động — không lặng lẽ gọi một bên thứ ba
 * mà không ai cấu hình.
 */
const env = (name: string, fallback: string) => Deno.env.get(name) ?? fallback;

/** Endpoint `/v1/chat/completions` của bên AI. Không đặt → không có bên nào. */
export const aiUrl = () => Deno.env.get("ASCND_AI_URL") ?? "";

/** Khoá của bên AI. */
export const aiKey = () => Deno.env.get("ASCND_AI_KEY");

/** Model cho văn bản — các function AI dùng cái này. */
export const aiModel = () => env("ASCND_AI_MODEL", "gemini-flash-lite-latest");

/**
 * Model cho ảnh — chỉ `scan-food`.
 *
 * Tách riêng vì nó là một NĂNG LỰC khác, không phải một sở thích khác: đổi model
 * văn bản sang một model không đọc được ảnh thì scan-food hỏng, và nó hỏng ở
 * đúng chỗ khó đoán nhất — một request trả về text mô tả sai một bức ảnh nó
 * không thấy.
 */
export const aiVisionModel = () => env("ASCND_AI_VISION_MODEL", "gemini-flash-lite-latest");

/**
 * Mức "suy nghĩ" của model — chỉ gửi khi đặt `ASCND_AI_REASONING_EFFORT`.
 *
 * Gemini qua endpoint OpenAI của Google mặc định suy nghĩ trước khi trả lời, và
 * phần ấy ăn vào CHÍNH `max_tokens` (700–1500 ở đây) — câu trả lời cụt hoặc
 * rỗng. `none` tắt nó ở 2.5; dòng 3.x (`gemini-flash-lite-latest`) từ chối
 * `none` bằng 400 "invalid argument" — dùng `low`. Không đặt biến → không gửi
 * tham số (bên non-reasoning có thể từ chối tham số lạ).
 */
export const aiReasoningEffort = () => Deno.env.get("ASCND_AI_REASONING_EFFORT") || undefined;

/*
  Cấu hình làm dở — một trong hai biến có, biến kia không — là sai lầm dễ gặp
  nhất của ngày đổi nhà cung cấp, và nó không hiện ra ở đâu khác: bên thứ nhất
  bị bỏ khỏi `providers()`, request rơi xuống bên dự phòng (nếu có) hoặc trả
  "AI chưa sẵn sàng". Một dòng ở lúc khởi động, ngay tại chỗ biết được điều đó.
*/
if (!!Deno.env.get("ASCND_AI_KEY") !== !!Deno.env.get("ASCND_AI_URL")) {
  console.error(
    "ASCND_AI_KEY và ASCND_AI_URL phải đặt CÙNG nhau — đang thiếu một biến, bên AI thứ nhất bị tắt.",
  );
}


/**
 * Danh sách nhà cung cấp, theo thứ tự ưu tiên.
 *
 * Mỗi bên khai bằng bốn biến có hậu tố: `_2`, `_3`… Không dùng một biến JSON
 * chứa cả danh sách, vì một secret hỏng cú pháp thì hỏng TOÀN BỘ đường AI cùng
 * lúc, và thông báo lỗi của `JSON.parse` không nói được biến nào sai.
 *
 * Bên thứ nhất không có hậu tố — nó chính là cấu hình đang chạy, nên thêm dự
 * phòng không đụng gì tới bên đang dùng. Mỗi bên cần CẢ khoá lẫn endpoint.
 */
export interface Provider {
  url: string;
  key: string;
  model: string;
  visionModel: string;
}

export function providers(): Provider[] {
  const out: Provider[] = [];
  const key0 = aiKey();
  const url0 = aiUrl();
  if (key0 && url0) out.push({ url: url0, key: key0, model: aiModel(), visionModel: aiVisionModel() });
  for (const n of [2, 3]) {
    const key = Deno.env.get(`ASCND_AI_KEY_${n}`);
    const url = Deno.env.get(`ASCND_AI_URL_${n}`);
    if (!key || !url) continue;
    out.push({
      url,
      key,
      model: Deno.env.get(`ASCND_AI_MODEL_${n}`) ?? aiModel(),
      visionModel: Deno.env.get(`ASCND_AI_VISION_MODEL_${n}`) ?? aiVisionModel(),
    });
  }
  return out;
}

/**
 * Một lỗi CỦA NHÀ CUNG CẤP, không phải của yêu cầu.
 *
 * Đây là toàn bộ phần khó của việc dự phòng: thử lại bên khác chỉ đúng khi lỗi
 * thuộc về bên đó.
 *
 *   402  hết credit — của HỌ, không phải của mình
 *   429  quá tải/giới hạn nhịp — của họ
 *   408  hết giờ
 *   5xx  hỏng bên trong
 *
 * Còn 400 hay 422 là "yêu cầu này sai". Gửi lại đúng cái sai đó sang bên thứ
 * hai thì nó cũng từ chối, và ta vừa tiêu hai lượt gọi để nhận hai lần cùng một
 * câu trả lời. 401/403 cũng vậy về mặt "đừng thử lại", nhưng nó là khoá của bên
 * đó hỏng — nên nó CÓ chuyển bên, vì bên kia có khoá khác.
 */
const providerFault = (status: number) =>
  status === 402 || status === 408 || status === 429 || status === 401 || status === 403 || status >= 500;

/**
 * Bao lâu thì coi như một bên KHÔNG TRẢ LỜI.
 *
 * ── vì sao cần một con số, và vì sao nó chỉ tính tới HEADER ──
 *
 * `fetch` trần không có hạn giờ. Một bên từ chối hay một bên hỏng mạng thì cơ
 * chế dự phòng bên dưới chạy được — nhưng một bên TREO thì không: không có phản
 * hồi, không có lỗi, nên vòng lặp đứng lại ở đúng bên hỏng và bên thứ hai không
 * bao giờ được thử. Đó là chế độ hỏng duy nhất mà danh sách dự phòng không cứu
 * được, và nó là chế độ dễ gặp nhất ở một nhà cung cấp vừa đổi.
 *
 * Hạn giờ này bao TỚI LÚC CÓ HEADER, rồi tắt. Không phải vì tiện: `signal`
 * truyền vào `fetch` cũng huỷ luôn phần THÂN đang chảy, nên một hạn giờ bao cả
 * request sẽ cắt ngang một cuộc trò chuyện dài ở giây thứ N — biến một tính năng
 * đang chạy đúng thành một tính năng tự ngắt. `ai-coach` stream, và stream thì
 * header tới gần như tức thì rồi thân chảy tiếp lâu tuỳ câu trả lời.
 *
 * ── phần nó KHÔNG bao ──
 *
 * Với lời gọi không stream, chỗ gọi mới là nơi đọc thân (`res.json()`), và phép
 * đọc đó nằm ngoài hạn giờ này. Một bên trả header rồi treo giữa thân vẫn treo
 * được. Nói ra ở đây thay vì để người sau tưởng đã kín: cứu nó cần một hạn giờ
 * thứ hai ở mỗi chỗ gọi, tức đúng thứ "đừng lặp lại sáu lần" mà lớp này sinh ra
 * để tránh — nên nó chờ một lý do thật, không phải một khả năng.
 */
/*
  ── và vì sao con số này được KIỂM, không chỉ được đọc ──

  `Number(Deno.env.get(...) ?? 20_000)` đọc thì gọn nhưng nó tin vào một chuỗi
  do người gõ. `Number("")` là 0, `Number("20s")` là NaN, và `setTimeout` quy cả
  hai về 0 — đo được: một `setTimeout(fn, NaN)` chạy sau 0ms. Nghĩa là

      supabase secrets set ASCND_AI_TIMEOUT_MS=20s

  huỷ MỌI request trước khi nó rời máy, ở cả sáu function cùng lúc. Và nó không
  trông như một lỗi cấu hình: mỗi bên đều "không trả lời", vòng dự phòng chạy
  hết danh sách, log đầy `ai provider unreachable`, và người đọc đi tìm một sự
  cố mạng không tồn tại.

  Một secret gõ sai phải hỏng ở chỗ nó được gõ, không phải ở chỗ nó được dùng.
*/
const TIMEOUT_MS = (() => {
  const raw = Deno.env.get("ASCND_AI_TIMEOUT_MS");
  if (raw === undefined) return 20_000;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    console.error(
      `ASCND_AI_TIMEOUT_MS=${JSON.stringify(raw)} không phải số mili-giây dương — dùng 20000. ` +
      "Để nguyên giá trị này thì mọi lời gọi AI bị huỷ trước khi gửi đi.",
    );
    return 20_000;
  }
  return n;
})();

/**
 * Gọi AI, thử lần lượt cho tới khi có bên trả lời.
 *
 * `body` KHÔNG mang `model` — mỗi bên có tên model riêng, và để chỗ gọi tự điền
 * là để mỗi function phải biết về danh sách nhà cung cấp.
 *
 * Trả về response ĐẦU TIÊN dùng được, hoặc response cuối cùng nếu tất cả đều
 * hỏng — chỗ gọi vẫn đọc status như trước, nên không function nào phải học một
 * cách xử lý lỗi mới.
 *
 * ── vì sao stream vẫn dự phòng được ──
 *
 * Chuyển bên chỉ xảy ra TRƯỚC byte đầu tiên. Khi `fetch` đã trả về một response
 * ok thì thân của nó là của bên đó và không đổi giữa chừng được — nhưng lúc ấy
 * cũng không cần: thứ dự phòng cứu là "bên này không trả lời", và điều đó biết
 * được trước khi có byte nào.
 */
/**
 * Ba function (nudges, gợi ý bữa, review tuần) chỉ gửi một tin `system` có kèm
 * dữ liệu. Vài gateway chấp nhận, nhưng endpoint OpenAI của Gemini từ chối
 * 400 "contents is not specified" — với nó, system là chỉ dẫn, không phải nội
 * dung. Thêm một lượt `user` ngắn khi chưa có lượt nào; prompt đã nói ngôn ngữ.
 */
const withUserTurn = (messages: unknown): unknown => {
  if (!Array.isArray(messages)) return messages;
  const hasTurn = messages.some((m) => m?.role === "user" || m?.role === "assistant");
  return hasTurn ? messages : [...messages, { role: "user", content: "Go." }];
};

export async function callAI(
  body: Record<string, unknown>,
  opts: { vision?: boolean } = {},
): Promise<Response | null> {
  const list = providers();
  if (list.length === 0) return null;

  let last: Response | null = null;
  for (const p of list) {
    /* 503 "high demand" của gói Gemini miễn phí thường qua trong vài trăm ms
       (16/10: tin "Hi" hỏng vì một lần 503). Thử lại cùng bên hai lần, cách
       0,6 s rồi 1,2 s, trước khi coi là bên đó hỏng và chuyển bên dự phòng.
       Mạng hỏng / hết giờ thì không thử lại — sang bên dự phòng như trước. */
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 600 * attempt));
      let res: Response;
      /* Một controller cho mỗi bên: huỷ bên A không được đụng tới bên B. */
      const ctrl = new AbortController();
      /* Ảnh chậm hơn chữ nhiều (16/10: scan-food bị huỷ ở 20 s, log ghi nhầm
         "no ai provider configured") — lời gọi đọc ảnh được tối thiểu 45 s. */
      const timer = setTimeout(() => ctrl.abort(), opts.vision ? Math.max(TIMEOUT_MS, 45_000) : TIMEOUT_MS);
      try {
        res = await fetch(p.url, {
          method: "POST",
          headers: { Authorization: `Bearer ${p.key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            ...body,
            messages: withUserTurn(body.messages),
            model: opts.vision ? p.visionModel : p.model,
            ...(aiReasoningEffort() ? { reasoning_effort: aiReasoningEffort() } : {}),
          }),
          signal: ctrl.signal,
        });
      } catch (e) {
        /* Mạng hỏng, DNS không phân giải được, hoặc hết giờ: cả ba đều là "bên đó
           không trả lời", và câu trả lời đúng cho cả ba là thử bên tiếp theo.
           Log ở server — thông báo này mang theo hostname. */
        console.error("ai provider unreachable", e);
        break;
      } finally {
        /* Tắt NGAY khi có header. Để nó chạy tiếp là để nó huỷ thân đang stream. */
        clearTimeout(timer);
      }
      if (res.ok) return res;
      last = res;
      if (!providerFault(res.status)) return res;
      console.error("ai provider fault", res.status, "attempt", attempt + 1);
      if (res.status !== 503) break;
    }
  }
  return last;
}

/**
 * Tiếng Tây Ban Nha (16/10): app có vi / en / es, nhưng các prompt chỉ có hai nhánh
 * vi / en — "es" từng rơi vào nhánh tiếng Việt và người dùng nhận câu trả lời
 * tiếng Việt. Spanish dùng nhánh tiếng Anh, đổi mọi "in English" thành tiếng Tây
 * Ban Nha lúc chạy (giữ chữ "in English" trong mã cho cổng `ai-language`).
 */
export const promptLang = (raw: unknown): "vi" | "en" => (raw === "en" || raw === "es" ? "en" : "vi");

export const forSpanish = (prompt: string, raw: unknown): string =>
  raw !== "es" ? prompt : prompt
    .replaceAll("in English", "in Spanish (español)")
    .replaceAll("English", "Spanish")
    .replaceAll("I only help with training, nutrition, sleep and recovery.",
      "Solo te ayudo con entrenamiento, nutrición, sueño y recuperación.");
