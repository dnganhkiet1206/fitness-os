# Triển khai đường AI — sổ tay

Trang này là thứ duy nhất cần đọc khi có quyền Supabase trong tay. Nó không
chứa khoá nào và không bao giờ được chứa.

**Đo lần gần nhất:** 2026-09-08.

---

## 1. Hiện trạng, đo chứ không đoán

| Câu hỏi | Cách đo | Kết quả |
|---|---|---|
| Project mới còn sống? | `curl` tới REST của `guqmbqtgxqleuwajvwvg` | **401** — sống, chỉ là chưa có khoá |
| Có function nào đang chạy? | gọi cả chín tên, so với một tên vô nghĩa làm đối chứng | cả chín trả `sb-error-code: NOT_FOUND` **giống hệt từng byte** với đối chứng → **không có function nào được deploy** |
| Project Lovable cũ? | phân giải tên miền ref cũ | **không phân giải** (`curl: (56)`), trong khi ref mới đi qua đúng proxy đó thì được |

Ba con số ấy đổi hai điều mà bản audit trước đã giả định:

- **Không có phụ thuộc Lovable SỐNG nào để cắt.** `LOVABLE_API_KEY` vẫn là giá
  trị mặc định trong mã, nhưng hôm nay không có gì đang gọi nó.
- **Không có bản triển khai cũ để quay lui.** Kế hoạch rollback nào nói "trả về
  bản đang chạy" đều đang nói về một thứ không tồn tại. Xem mục 6.

---

## 2. Điều kiện đã sẵn sàng (kiểm được không cần khoá)

| Điều kiện | Trạng thái | Kiểm bằng |
|---|---|---|
| Cả chín function khai trong `config.toml` | ✅ | `supabase/config.toml` |
| RPC `ai_gate`, `spend_ai_tokens` có migration | ✅ | `20260825120000_ai_token_metering.sql` |
| RPC `claim_ai_call` có migration | ✅ | `20260729120000_ai_usage_quota.sql` |
| Sáu function chỉ biết `callAI` | ✅ | `tools/ai-provider.mjs` luật 12 |
| Không endpoint/khoá gõ thẳng ngoài `_shared/ai.ts` | ✅ | luật 9 và 12 |

Nghĩa là: **đặt secret rồi deploy, không phải sửa mã.**

---

## 3. Secret cần đặt, và ĐÚNG THỨ TỰ

> Đặt bằng `supabase secrets set` từ máy có quyền. Không ghi giá trị vào repo,
> không dán vào chat, không đưa vào `.env` được commit.

**Bên chính — OpenRouter.** Bốn biến, đặt **cùng một lệnh**:

```
ASCND_AI_URL           https://openrouter.ai/api/v1/chat/completions
ASCND_AI_KEY           <khoá OpenRouter>
ASCND_AI_MODEL         google/gemini-3-flash-preview
ASCND_AI_VISION_MODEL  google/gemini-2.5-flash
```

**Bên dự phòng — Google AI.** Bốn biến hậu tố `_2`:

```
ASCND_AI_URL_2           https://generativelanguage.googleapis.com/v1beta/openai/chat/completions
ASCND_AI_KEY_2           <khoá Google AI Studio>
ASCND_AI_MODEL_2         <tên model theo cách gọi của Google>
ASCND_AI_VISION_MODEL_2  <tên model đọc được ảnh theo cách gọi của Google>
```

### Vì sao "cùng một lệnh" là một luật, không phải một lời khuyên

`ASCND_AI_KEY` và `ASCND_AI_URL` rơi về mặc định **độc lập** với nhau. Đặt khoá
mà quên địa chỉ thì khoá OpenRouter được gửi tới gateway cũ; đầu kia trả 401;
`providerFault` coi 401 là lỗi của bên đó và **lặng lẽ tụt xuống bên dự phòng**.
Mọi thứ vẫn chạy, hoá đơn về bên thứ hai, và không có gì nói bên thứ nhất chưa
bao giờ được cấu hình xong.

Sự độc lập ấy phải giữ (hôm nay `LOVABLE_API_KEY` chạy một mình, không có
`ASCND_AI_URL` nào). Nên chỗ này không từ chối — nó **nói ra**, một dòng lúc
khởi động:

```
ASCND_AI_KEY đã đặt nhưng ASCND_AI_URL thì chưa — request sẽ mang khoá mới tới
gateway MẶC ĐỊNH. Nếu đó không phải ý định thì đây là một lần chuyển nhà cung
cấp làm dở, và nó chỉ hiện ra là 401.
```

Thấy dòng đó trong log sau khi deploy nghĩa là **thiếu `ASCND_AI_URL`**.

### `ASCND_AI_TIMEOUT_MS` — để trống nếu không có lý do

Mặc định 20000 ms, và hạn giờ chỉ bao **tới lúc có header** (xem `_shared/ai.ts`).
Nếu đặt: phải là số mili-giây **dương**. Một giá trị rỗng hay `20s` từng quy về
0, tức huỷ mọi request trước khi gửi, ở cả sáu function cùng lúc — và nó trông
như mạng hỏng chứ không như lỗi cấu hình. Nay giá trị hỏng rơi về 20000 và in:

```
ASCND_AI_TIMEOUT_MS="20s" không phải số mili-giây dương — dùng 20000.
```

### Model — đã tra, không phải đã đoán

Tra trên danh mục OpenRouter đang chạy (428 model), 2026-09-08:

| Model | Giá /1M vào–ra | Ngữ cảnh | Nhận ảnh | `tools`+`tool_choice` |
|---|---|---|---|---|
| `google/gemini-3-flash-preview` | $0.50 / $3.00 | 1M | có | có |
| `google/gemini-2.5-flash` | $0.30 / $2.50 | 1M | có | có |

Cả hai đều **bắt buộc** phải hỗ trợ `tools` + `tool_choice` ép: bốn function
(`ai-meal-suggest`, `ai-smart-nudges`, `ai-weekly-review`, `scan-food`) không có
đường nào khác để lấy kết quả. Model thị giác **bắt buộc** nhận ảnh, nếu không
`scan-food` sẽ mô tả một bức ảnh nó không thấy.

---

## 4. Deploy

```
supabase link --project-ref guqmbqtgxqleuwajvwvg
supabase db push
supabase functions deploy
```

`db push` **trước** `functions deploy`: thiếu `ai_gate` thì `aiGate` trả
`denied` và toàn bộ AI trả 429 — cố ý (xem `_shared/guard.ts`), nhưng nó trông
như hết hạn mức chứ không như thiếu migration.

---

## 5. Khói — phải chạy, không phải nên chạy

Cần một **JWT của người dùng thật** (đăng nhập trong app rồi lấy access token).
Anon key **không** đi qua được `requireUser` — đó là một lỗ đã bịt, không phải
một bất tiện.

| # | Gọi gì | Đúng thì thấy | Sai thì nghĩa là |
|---|---|---|---|
| 1 | `ai-coach`, một câu ngắn | SSE chảy, có chữ | không có SSE → bên kia bỏ qua `stream: true` |
| 2 | log của #1 | **không** có `UNMETERED ai-coach` | bên kia không gửi `stream_options.include_usage` → mọi cuộc trò chuyện không tính được tiền |
| 3 | `ai-meal-suggest` | 200 kèm danh sách | 502 `ai_incomplete` → model không gọi tool; đổi model, đừng nới lỏng kiểm tra |
| 4 | `scan-food` với một ảnh thật | 200 kèm `items` | 502 `ai_incomplete` → model thị giác sai; kiểm `ASCND_AI_VISION_MODEL` |
| 5 | bảng `ai_usage` sau #1–#4 | có dòng cho từng `kind` | trống → sổ token không chạy; đọc log tìm `UNMETERED` |
| 6 | log khởi động | không có dòng `ASCND_AI_URL`/`ASCND_AI_TIMEOUT_MS` nào | có → secret đặt thiếu hoặc gõ sai, xem mục 3 |
| 7 | tạm bỏ `ASCND_AI_KEY`, gọi lại | vẫn trả lời (qua bên `_2`) | không → bên dự phòng chưa cấu hình đúng |

Bảy phép này kiểm **hành vi của nhà cung cấp thật**, thứ mà
`tools/ai-provider.mjs` cố ý không kiểm được: bước kiểm ấy chứng minh logic của
mình đúng với một nhà cung cấp cư xử theo từng kiểu, không chứng minh nhà cung
cấp thật cư xử theo kiểu nào.

---

## 6. Quay lui

**Không có bản triển khai cũ để quay về** (mục 1). Nên "rollback" ở đây có đúng
hai nghĩa:

- **Đổi nhà cung cấp:** đổi bốn biến `ASCND_AI_*` rồi deploy lại. Không sửa mã.
- **Tắt AI:** xoá `ASCND_AI_KEY` và `LOVABLE_API_KEY`. `callAI` trả `null` và cả
  sáu function trả `ai_unavailable` — có chủ ý, không phải một cú sập.

**`LOVABLE_API_KEY` chưa được thu hồi**, và chưa nên thu hồi cho tới khi mục 5
xanh trên bản deploy thật. Nó không tốn gì khi không ai gọi, và nó là bên thứ ba
nếu hai bên kia đều hỏng.

---

## 7. Ba điều KHÔNG được mở lại nếu không có bằng chứng mới

1. **Đừng viết lại sáu function để đổi nhà cung cấp.** `providers()` đã là chỗ
   duy nhất biết; sáu function chỉ biết `callAI`. `tools/ai-provider.mjs` luật 12
   giữ điều đó và sẽ đỏ nếu ai đó với tay tới `aiUrl`/`aiKey` từ bên ngoài.
2. **Đừng biến 502 `ai_incomplete` trở lại thành 200 rỗng.** Một tính năng trống
   kèm HTTP 200 đọc ra là "không có gì cho bạn", trong khi sự thật là model chưa
   trả lời — và token đã bị tính. Xem `toolArgs` trong `_shared/guard.ts`.
3. **Đừng bịa một con số token khi nhà cung cấp không gửi `usage`.** Chỗ trống
   phải ở lại là chỗ trống, nhưng phải **đếm được**: đó là dòng `UNMETERED`.
