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
 * Lovable là dàn xếp cho giai đoạn PHÁT TRIỂN: khoá của họ nằm sẵn trong project
 * cũ và không xem lại được. Khi publish, khoá là của người dùng tự mua. Hai giai
 * đoạn, cùng một đoạn code — nên thứ phân biệt chúng phải là cấu hình, không
 * phải một commit.
 *
 * Endpoint mặc định theo chuẩn `/v1/chat/completions` của OpenAI, thứ mà
 * Lovable, OpenAI, Groq, Together và phần lớn gateway đều nói. Đổi nhà cung cấp
 * trong đa số trường hợp là đổi hai biến, không phải viết lại request.
 *
 * ── mặc định là bản đang chạy ──
 *
 * Không đặt biến nào thì mọi thứ chạy đúng như trước file này. Đó là điều kiện
 * để một bản gom lại như thế này an toàn: nó không được phép đổi hành vi hôm nay
 * để đổi lấy sự tiện lợi ngày mai.
 */
const env = (name: string, fallback: string) => Deno.env.get(name) ?? fallback;

export const aiUrl = () =>
  env("ASCND_AI_URL", "https://ai.gateway.lovable.dev/v1/chat/completions");

/** Khoá gateway. `LOVABLE_API_KEY` là bản đang dùng; `ASCND_AI_KEY` là bản thay. */
export const aiKey = () => Deno.env.get("ASCND_AI_KEY") ?? Deno.env.get("LOVABLE_API_KEY");

/** Model cho văn bản — năm function dùng cái này. */
export const aiModel = () => env("ASCND_AI_MODEL", "google/gemini-3-flash-preview");

/**
 * Model cho ảnh — chỉ `scan-food`.
 *
 * Tách riêng vì nó là một NĂNG LỰC khác, không phải một sở thích khác: đổi model
 * văn bản sang một model không đọc được ảnh thì scan-food hỏng, và nó hỏng ở
 * đúng chỗ khó đoán nhất — một request trả về text mô tả sai một bức ảnh nó
 * không thấy.
 */
export const aiVisionModel = () => env("ASCND_AI_VISION_MODEL", "google/gemini-2.5-flash");

/*
  Khoá mới cắm vào endpoint cũ — sai lầm dễ gặp nhất của ngày chuyển đổi.

  `aiKey()` và `aiUrl()` có fallback ĐỘC LẬP: đặt `ASCND_AI_KEY` mà quên
  `ASCND_AI_URL` thì khoá là của nhà cung cấp mới còn địa chỉ vẫn là gateway cũ.
  Sự độc lập ấy là cố ý và phải giữ — hôm nay `LOVABLE_API_KEY` chạy một mình,
  không có `ASCND_AI_URL` nào, và bắt phải có cả hai là tắt bản đang chạy.

  Nhưng "hợp lệ" không có nghĩa là "có chủ ý". Cặp lệch này hiện ra ở đầu kia là
  một chuỗi 401 — thứ `providerFault` coi là lỗi CỦA BÊN ĐÓ, nên nó lặng lẽ tụt
  xuống bên dự phòng và tính tiền vào đấy. Không có gì trong log nói rằng bên
  thứ nhất chưa bao giờ được cấu hình xong.

  Nên: một dòng, ở lúc khởi động, ngay tại chỗ biết được điều đó. Không từ chối
  — một người cố ý xoay khoá Lovable qua tên mới vẫn phải chạy được.
*/
if (Deno.env.get("ASCND_AI_KEY") && !Deno.env.get("ASCND_AI_URL")) {
  console.error(
    "ASCND_AI_KEY đã đặt nhưng ASCND_AI_URL thì chưa — request sẽ mang khoá mới tới gateway MẶC ĐỊNH. " +
    "Nếu đó không phải ý định thì đây là một lần chuyển nhà cung cấp làm dở, và nó chỉ hiện ra là 401.",
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
 * phòng không đụng gì tới bên đang dùng.
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
  if (key0) out.push({ url: aiUrl(), key: key0, model: aiModel(), visionModel: aiVisionModel() });
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
export async function callAI(
  body: Record<string, unknown>,
  opts: { vision?: boolean } = {},
): Promise<Response | null> {
  const list = providers();
  if (list.length === 0) return null;

  let last: Response | null = null;
  for (const p of list) {
    let res: Response;
    /* Một controller cho mỗi bên: huỷ bên A không được đụng tới bên B. */
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      res = await fetch(p.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${p.key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, model: opts.vision ? p.visionModel : p.model }),
        signal: ctrl.signal,
      });
    } catch (e) {
      /* Mạng hỏng, DNS không phân giải được, hoặc hết giờ: cả ba đều là "bên đó
         không trả lời", và câu trả lời đúng cho cả ba là thử bên tiếp theo.
         Log ở server — thông báo này mang theo hostname. */
      console.error("ai provider unreachable", e);
      continue;
    } finally {
      /* Tắt NGAY khi có header. Để nó chạy tiếp là để nó huỷ thân đang stream. */
      clearTimeout(timer);
    }
    if (res.ok) return res;
    last = res;
    if (!providerFault(res.status)) return res;
    console.error("ai provider fault", res.status);
  }
  return last;
}
