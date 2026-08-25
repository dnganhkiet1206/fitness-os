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
    try {
      res = await fetch(p.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${p.key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, model: opts.vision ? p.visionModel : p.model }),
      });
    } catch (e) {
      /* Mạng hỏng hoặc DNS không phân giải được: coi như bên đó không tồn tại.
         Log ở server — thông báo này mang theo hostname. */
      console.error("ai provider unreachable", e);
      continue;
    }
    if (res.ok) return res;
    last = res;
    if (!providerFault(res.status)) return res;
    console.error("ai provider fault", res.status);
  }
  return last;
}
