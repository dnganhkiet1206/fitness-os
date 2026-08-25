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
