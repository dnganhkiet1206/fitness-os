# Trạng thái rà soát

Một trang, một câu trả lời: **hôm nay app đang đứng ở đâu.**

`SO-GHI-LOI.md` là sổ ghi từng lỗi và luật không được đụng vào chúng. Trang này
là thứ khác: nó nói vòng rà soát gần nhất chạy khi nào, trên commit nào, đo bằng
gì, và cái gì còn lại. Ai mở repo lần đầu đọc trang này trước.

**Vòng gần nhất:** 2026-09-09 · lượt đánh bóng sản phẩm (0 thay đổi mã) ·
commit `efb851d` · nhánh `claude/ios-fitness-rebuild-omgulr`

> **AI BACKEND: HOÃN THEO YÊU CẦU CỦA CHỦ DỰ ÁN — KHÔNG LÀM LÚC NÀY.**
> Trạng thái ở `docs/AI-TRIEN-KHAI.md` giữ nguyên, không đụng vào.

---

## Cổng chất lượng

| Cổng | Kết quả | Ghi chú |
|---|---|---|
| TypeScript | **XANH** | `npx tsc --noEmit -p tsconfig.json` từ `native/` — **đo lại vòng này**, exit 0, đầu ra rỗng |
| `node tools/check.mjs` | **XANH** | exit 0, **215** bước, tất cả xanh. Chạy từ `native/`; chạy từ gốc repo là exit 2 và nó cố ý từ chối |
| Quét runtime 45 route | **KHÔNG CHẠY LẠI VÒNG NÀY** | vòng này ĐỘNG vào `native/src` (biên bắt lỗi ở `_layout.tsx`). Bộ chạy web đầy đủ mất nhiều phút và không nằm trong cổng; thay vào đó biên được chứng minh bằng `tools/error-boundary.mjs` — React 19 + ReactDOM thật trong một trình duyệt thật. Số gần nhất của bộ chạy đầy đủ (vòng A11Y-2): không route nào trắng, 1 cảnh báo web-only trên `settings` |
| Đổi theme, 9 màn | **KHÔNG CHẠY LẠI VÒNG NÀY** | biên đọc bảng màu qua `usePalette` như mọi màn khác và không thêm nhánh `m.lit` nào — `tools/theme-shape.mjs` vẫn 6 tệp, 8 nhánh, và nó nằm trong 215 bước. Số gần nhất (A11Y-2): lỗi JS 5 → 1 |
| Nút lồng trong nút, 6 tab chính | **KHÔNG CHẠY LẠI VÒNG NÀY** | `tools/a11y-swallow.mjs` và `tools/tap-targets.mjs` nằm trong 215 bước và vẫn xanh — nút thử lại của biên là một `Pressable` có nhãn, cao 44. Số gần nhất: 0/6 |
| ESLint | **KHÔNG CHẠY ĐƯỢC** | `eslint` không có trong `node_modules`; `npx expo lint` báo `Cannot find module 'eslint'` **và vẫn thoát 0** — nên đừng đọc mã thoát của nó là "sạch". Cổng thật là 215 bước ở trên |
| Bản dựng native | **CHƯA CHẠY Ở ĐÂY** | môi trường này là Linux; iOS phải dựng ở máy bạn |

---

## A9 — ĐÓNG (2026-09-08)

App thoát khi chạm vùng vòng tròn sẵn sàng sau khi đổi tab rồi quay lại.

**Nguyên nhân gốc:** đường dựng khác nhau giữa hai theme — bản tối dựng lớp
kính/lớp phủ, bản sáng bỏ lớp ấy đi.

**Đã sửa:** hai theme dùng chung một đường dựng.

**Kiểm chứng:** chủ dự án xác nhận trên máy thật, 2026-09-08.

**`MaskedView` không phải nguyên nhân gốc** và không được gỡ hay thay chỉ vì sự
cố này. Chi tiết đầy đủ ở `SO-GHI-LOI.md` mục A9.

---

## Kiến trúc dựng theo theme — điều kiện đã sinh ra A9

A9 khép lại rồi, nhưng ĐIỀU KIỆN của nó thì đo được, và ở commit `f7a3341` nó
vẫn còn. Ghi ra đây vì đó là thứ phải giữ cho "nhất quán và có chủ ý".

Đo trên bộ chạy web, đổi `prefers-color-scheme` ngay trên màn đang mở:

| Màn | node tối | node sáng | cây con bị GỠ khi đổi |
|---|---|---|---|
| Hôm nay | 1.073 | 1.031 | −6 |
| Dinh dưỡng | 611 | 545 | −7 |
| Trợ lý | 1.066 | 1.024 | −6 |
| Nước | 206 | 178 | −4 |
| Tiến trình | 633 | 619 | −2 |
| Huy chương | 822 | 798 | −1 |
| Tập luyện · Cài đặt · Cửa hàng | bằng nhau | bằng nhau | 0 |

Chiều đi một phía: bản sáng **gỡ** cây con và không thêm cái nào. Nguồn là các
nhánh `m.lit` dựng-hoặc-không:

- `ambient-light.tsx:140` — `if (!m.lit) return null` (cả component)
- `glass-card.tsx:154` — mặt gradient
- `readiness-gauge.tsx:580, 625`
- `assistant-aura.tsx:608`
- `liquid-glass.tsx:174` — lớp wash

Cả năm đều là quyết định hiệu năng **có chủ ý và có ghi lý do** — trên giấy
chúng là những lớp `<Svg>` phủ kín màn hình không nhìn thấy được. Nên luật
không phải "cấm lệch", mà là: **tập hợp các chỗ được phép lệch là một danh sách
đóng.** Một nhánh `m.lit` mới xuất hiện mà không ai quyết định là chỗ điều kiện
của A9 mọc lại.

`tools/theme-shape.mjs` giữ danh sách ấy: 6 tệp, 8 nhánh, mỗi tệp một lý do.
Nó phân biệt HÌNH DẠNG với MÀU — `color={m.lit ? a : b}` không dựng thêm hay
bớt một node nào và không tính. Bản đầu của luật gộp cả hai và báo nhầm
`awards.tsx` ba lần; đó là lý do phép phân biệt được viết ra chứ không ngầm
hiểu.

---

## A11Y-2 — XONG (2026-09-08)

Nút trong nút. Trên iOS, `Pressable.js:252` đặt `accessible: accessible !== false`
cho MỌI `Pressable`, và [tài liệu trợ năng của React
Native](https://reactnative.dev/docs/accessibility) nói phần tử ấy *"groups its
children into a single selectable component"* — UIKit không đi vào bên trong.
Nút bên trong không tồn tại với VoiceOver, trong khi ngón tay vẫn bấm được. Đó
là lý do lớp lỗi này sống lâu: nó không hỏng ở nơi ai cũng nhìn.

Bảy chỗ, mỗi chỗ đo riêng trước và sau:

| Chỗ | Đã làm gì | Đo được |
|---|---|---|
| `food-cards.tsx` | ngôi sao thành anh em; phần đệm xuống hai con để vùng chạm không tụt | **0 điểm ảnh lệch**; 3 → 0 nút lồng; vùng chạm sao 17×17 → **38×54** |
| `template-list.tsx` | nút xoá thành anh em; mũi tên giữ cú chạm với `accessible={false}` | **0 điểm ảnh lệch**; 1 → 0 |
| `grocery.tsx` | ô tick thành `checkbox` có nhãn, nút xoá thành anh em | **0 điểm ảnh lệch** |
| `assistant.tsx` | vùng bấm bọc phần đầu thẻ, các chip hỏi nhanh ra ngoài | lệch **111** điểm, dưới sàn nhiễu **186** của chính màn ấy |
| `ai-coach.tsx` | chọn/xoá hội thoại thành anh em, hàng chọn có nhãn | lệch **3** điểm; 3 hàng từ `div` → **3 nút có tên** |
| `week-plan.tsx` | **thêm nút đóng có nhãn** vào hàng tiêu đề, rồi mới `accessible={false}` cho tấm nền và tấm nuốt chạm | vùng danh sách: **0 điểm ảnh lệch**; thay đổi gói trong dải tiêu đề |
| `dashboard-cards.tsx` | nút `?` của thẻ dinh dưỡng thành anh em | nút `?` dịch **1 điểm ảnh** (nét viền của thẻ); 1 → 0 |

`week-plan` là chỗ duy nhất được thêm giao diện, và chỉ đúng phần tối thiểu:
một chữ X 14 điểm trong hàng tiêu đề **đã có sẵn**, cùng mẫu với sheet bộ sưu
tập ở `shop.tsx`. Sáu phép kiểm chức năng chạy ở **cả hai theme**, đều xanh: mở
sheet · 5 điều khiển chọn buổi tập còn đủ · nút đóng có nhãn tồn tại · bấm nó
thì sheet đóng · chạm nền vẫn đóng · chọn một buổi tập vẫn đóng.

### Hai bài học của vòng này

**Bước kiểm tĩnh có một điểm mù, và phép đo lúc chạy tìm ra nó.** Chỗ thứ bảy
(`dashboard-cards.tsx`) lồng nhau qua HAI lớp gián tiếp: một biến (`{card}`) rồi
một component (`HelpButton` trả về `PressScale`). `tools/a11y-swallow.mjs` báo
xanh trên đúng tệp hỏng; bộ chạy web bắt được. Bản sửa đầu chỉ đi theo biến và
VẪN xanh — phép thử ngược bắt được điều đó trước khi tôi tin nó. Bước kiểm nay
quét ra danh sách component-nào-là-nút từ chính mã nguồn.

**Bước kiểm bắt được một hồi quy tôi vừa gây ra.** Mũi tên mới ở
`template-list.tsx` là nút chỉ có icon và không có nhãn → `tools/tap-targets.mjs`
đỏ. Ngoại lệ được thêm là một câu trả lời chứ không phải một lối thoát: một node
đã khai `accessible={false}` không nằm trong cây trợ năng, nên một cái nhãn ở đó
là cái tên không ai nghe được. Ngoại lệ đã được thử ngược: bỏ `accessible={false}`
ra thì nó đỏ lại ngay.

---

## Đường AI — XONG phần LÀM ĐƯỢC Ở ĐÂY (2026-09-08)

Sổ tay triển khai đầy đủ: **`docs/AI-TRIEN-KHAI.md`**. Trang này chỉ ghi vòng
rà soát đã đo được gì.

### Đã sửa

| # | Lỗi | Nó im lặng ở chỗ nào |
|---|---|---|
| E1 | `if (!res)` của `ai-coach-memory` nằm SAU `res.ok`/`res.text()`/`res.json()` | mã chết: `res` null thì `TypeError` nổ trước câu kiểm |
| E2 | `fetch` không hạn giờ | một bên TREO thì vòng dự phòng đứng lại ở đó và bên thứ hai không bao giờ được thử |
| P3 | `recordTokens` chỉ ghi khi `total > 0` | bên không trả `usage` ⇒ AI phục vụ miễn phí, sổ về 0, không gì trông như hỏng |
| P4 | bốn function trả 200 kèm kết quả rỗng khi model không gọi tool | người dùng đọc ra "không có gì cho bạn"; token đã bị tính |
| **A** | `await res.json()` đứng TRƯỚC `recordTokens` ở cả năm function không-stream | 200 kèm thân không phải JSON (trang HTML của proxy, thân rỗng) ⇒ ném qua dòng ghi sổ ⇒ lượt gọi đã tiêu tiền không để lại **cả một dòng `UNMETERED`** |
| **B** | `Number(Deno.env.get("ASCND_AI_TIMEOUT_MS") ?? 20_000)` | `Number("")`=0 và `Number("20s")`=NaN, `setTimeout` quy cả hai về 0 (**đo được: fires sau 0ms**) ⇒ một secret gõ sai huỷ MỌI request ở cả sáu function, và nó trông như mạng hỏng |
| **C** | `response.body!.tee()` trong `ai-coach` | một 204 có `ok===true` và `body===null` ⇒ `TypeError` ⇒ 500, và `meterStream` không bao giờ chạy |
| **D** | `aiUrl`/`aiKey`/`aiModel` import vào cả sáu function, **không dùng ở đâu** | vô hại hôm nay, nhưng là cái móc sẵn cho một bản sửa vội — và `aiUrl()` mặc định vẫn trỏ Lovable |

A, B, C, D là vòng này. `aiPayload` (A) gộp cặp `res.json()` + `recordTokens`
thành **một** lời gọi, nên không còn cách nào đọc được thân mà bỏ qua sổ.

### Bước kiểm

`tools/ai-provider.mjs` — **14 nhóm luật** (mới), chạy MÃ THẬT (`callAI`,
`meterStream`, `recordTokens`, `toolArgs`, `aiPayload`) trên `fetch` và
`Deno.env` giả. Mỗi luật mới đã thử ngược và cả bốn phép đều bắt được:

| Thử ngược | Nó nói gì |
|---|---|
| `aiPayload` → `res.json()` trần | 6 lỗi: ba thân hỏng đều NÉM và đều IM LẶNG |
| `TIMEOUT_MS` → `Number(... ?? 20_000)` | 10 lỗi trên `""`, `"20s"`, `"0"`, `"-5"`, `"null"` |
| trả lại `aiUrl` vào `scan-food` | `scan-food/index.ts (aiUrl)` |
| trả lại `response.body!` | `ai-coach/index.ts:342` — và **342 đúng là dòng thật** |

**Một bước kiểm CŨ khẳng định cách chữa, không phải tính chất.**
`tools/ai-boundary.mjs` luật 4 đòi thấy chữ `recordTokens(` trong mỗi tệp — đúng
chừng nào phép ghi sổ còn được gõ tay ở từng chỗ gọi. `aiPayload` gộp nó vào,
năm function được đếm chặt hơn trước, và **cổng đỏ 2/211** (bước ấy đăng ký hai
lần). Cùng lỗi với luật D của `scan-food-boundary` vòng trước. Đã viết lại theo
tính chất: *không có đường nào đọc được thân của nhà cung cấp mà không đi qua
sổ* — ba lối hợp lệ (`meterStream`, `aiPayload`, `recordTokens` trần), và
**cấm** `res.json()`/`response.json()` trần (`req.json()` là thân của người gọi,
không dính). Thử ngược hai chiều: bỏ hẳn ghi sổ ⇒ 2 lỗi; **giữ** ghi sổ nhưng
đọc thân bằng tay ⇒ 1 lỗi — và vế thứ hai chính là mã đã ship, thứ luật cũ xanh.

**Hai lần dụng cụ tự sai, và cả hai đều là bài học cũ lặp lại:**

- Bản đầu của luật 10 **sập** thay vì báo — cú ném nổi lên tới đỉnh, node in
  stack trace và thoát 1: đúng mã thoát, nhưng không nói được luật nào hỏng.
  Cùng lớp với vụ treo ở `never`. Nay có `settle()`: một cú ném là một kết quả.
- Luật 13 báo `ai-coach/index.ts:239` khi dòng thật là **342** — bóc comment
  bằng `.replace(/\/\*…\*\//g, '')` xoá hẳn dòng. Nay thay bằng khoảng trắng
  giữ nguyên số dòng.

### Sẵn sàng triển khai — kiểm được không cần khoá

Chín function khai đủ trong `config.toml`; `ai_gate`, `spend_ai_tokens`,
`claim_ai_call` đều có migration. Nghĩa là **đặt secret rồi deploy, không sửa mã**.

### Chưa làm được ở đây, và vì sao

Môi trường này **không có `supabase` CLI, không đăng nhập, không quyền deploy**.
Nên Phase 5 (đặt secret), 6 (deploy + khói) và 7 (cắt Lovable) là việc của chủ
dự án. `docs/AI-TRIEN-KHAI.md` mục 3–5 là đúng những lệnh và bảy phép khói ấy.

Và bằng chứng runtime đã đổi tiền đề của Phase 7: **không có function nào đang
chạy ở bất kỳ đâu** (cả chín trả `NOT_FOUND` giống hệt một tên vô nghĩa làm đối
chứng), còn ref Lovable cũ thì **không phân giải**. Nên hôm nay không có phụ
thuộc Lovable sống nào để cắt, và không có bản triển khai cũ để quay lui.
`LOVABLE_API_KEY` **chưa thu hồi** và chưa nên thu hồi cho tới khi bảy phép khói
xanh trên bản deploy thật.

---

## Hạ tầng — vòng 1 (2026-09-08)

Kế hoạch đầy đủ, kèm lý do từng dịch vụ: **`docs/HA-TANG.md`**. Luật của trang
ấy: một dịch vụ mới phải chỉ ra được **giới hạn đo được** của thứ đang có.

### Sentry — bộ lọc XONG, SDK dừng ở ranh giới khoá

**Nhu cầu, từ sổ lỗi của chính repo này.** A9 là app thoát hẳn, và cách duy nhất
để xác nhận nó (ghi ở `SO-GHI-LOI.md` A9) là chủ dự án **cầm máy, vào Cài đặt
của iOS, đọc bằng mắt**.

**Giới hạn của `crash-log.ts`**, cả bốn đều là chỗ A9 rơi qua: nó gắn vào
`ErrorUtils` nên **chỉ bắt lỗi JS** — A9 là `EXC_BAD_ACCESS`, tiến trình chết
trước khi JS biết; nó nằm **trên máy người dùng**; giữ **5 mục**; **không gộp**
được nên không biết một người hay ba trăm người dính. Không cái nào sửa được
bằng cách viết thêm mã trong app.

**Đã làm:** `src/lib/telemetry-scrub.ts` — bộ lọc riêng tư thuần, **không import
Sentry**, kiểu khớp cấu trúc với `beforeSend`. Viết TRƯỚC vì SDK tự thêm
breadcrumb cho mọi lời gọi mạng, và mạng của app này là PostgREST:
`?user_id=eq.<uuid>&date=…` là *ai*, *bảng sức khoẻ nào*, *ngày nào* — còn
`scan-food` gửi `image_base64`, tức **ảnh bữa ăn**. Bật rồi mới lọc là đã gửi đi
một lần.

`tools/telemetry-scrub.mjs` chạy thật cả ba hàm trên hình dạng dữ liệu app này
sinh ra. **Năm phép thử ngược**, tất cả đỏ đúng chỗ — và phép thứ năm hạ ngưỡng
base64 xuống 8 để chứng minh chiều **ẩn quá tay** cũng bị bắt: một bộ lọc biến
mọi báo cáo thành `[đã ẩn]` cũng là một bộ lọc hỏng. Thứ tự luật có lý do: JWT
phải bắt **trước** base64 chung, nếu không một khoá và một bức ảnh ẩn thành cùng
một khối.

**Ranh giới:** không cài SDK từ đây — nó là native module, môi trường này là
Linux. Ba khoá còn thiếu, không cái nào vào git: `EXPO_PUBLIC_SENTRY_DSN`,
`SENTRY_AUTH_TOKEN` (thiếu nó thì sự cố native **không có tên hàm**, tức mất
đúng phần cần đọc cho lớp lỗi như A9), org + project slug.

**`tools/linked.mjs` bắt được nó**, và điều đó đúng: "viết ra mà chưa nối" là
một chế độ hỏng thật. Đã thêm vào danh sách miễn **kèm lý do**, và luật 7 của
`telemetry-scrub.mjs` sẽ đỏ ngay khi `@sentry/*` xuất hiện mà `scrubEvent` chưa
được truyền làm `beforeSend`.

### GitHub Actions — workflow XONG, chưa chạy lần nào

**Đo trước khi viết**, và hai số đo đổi hình dạng workflow:

| Câu hỏi | Kết quả |
|---|---|
| Bộ kiểm cần gì | **14** bước cần PostgreSQL, **6** cần Playwright |
| Thiếu PostgreSQL | **5** bước in "BỎ QUA" rồi **vẫn thoát 0** |
| Chạy không phải root | `su nobody -c 'node tools/acwr-consistency.mjs'` → **exit 1**, `su: Authentication failure` |
| Bao nhiêu bước thế | **11/14** gọi `su postgres` không có đường lui; 3 bước kia có `\|\| pg_ctl` |
| `playwright` | **không phải phụ thuộc gì cả** — phải cài riêng trên CI |

Nên: job chạy dưới **root**, và **một job xanh không đủ để tin** —
`tools/ci-preflight.mjs` biến "bỏ qua trong im lặng" thành một lần hỏng to và
sớm (kiểm cả `su postgres` **bằng cách thử thật**, và cả **bản Chromium** chứ
không chỉ thư viện). `tools/ci-workflow.mjs` nằm trong cổng, **phân tích** YAML
chứ không dò chữ, canh chỗ dễ mục nhất: cổng vẫn chạy mà thôi chặn. Sáu phép thử
ngược, tất cả đỏ đúng chỗ.

**Workflow chưa từng chạy** — không có runner ở nơi nó được viết. Nó được viết
để hỏng to và sớm nếu một giả định sai. **Không cần khoá nào.**

### Không thêm

Stripe · Clerk · Upstash/Redis · Pinecone · backend/auth/CSDL thứ hai. Chưa có
phép đo nào nói stack hiện tại không làm được việc của chúng. Ngày có, nó được
ghi vào `docs/HA-TANG.md` **trước khi** gói được cài.

---

## A4 — ĐÓNG (2026-09-08)

`.env` trong git. Đã đo lại: `git ls-files .env` **rỗng**, `git check-ignore -v
.env` khớp `.gitignore:38`, tệp không còn trên đĩa (sửa ở `ce8c73f`). Phần lịch
sử — thứ mục này để mở — nay cũng đã đo: mọi bản `.env` từng commit chỉ chứa
`VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
`VITE_SUPABASE_URL`, đều công khai theo thiết kế và đều thuộc project Lovable cũ
vốn **không còn phân giải được**. Viết lại lịch sử đụng vào mọi clone và mọi PR
đang mở; cái giá ấy chỉ đáng cho một secret THẬT. Không có secret nào → đóng.

---

## ERRBOUND — XONG (2026-09-08)

### Chỗ trống là chỗ trống gì

`src/` chưa từng có error boundary; `crash-log.ts` đã ghi điều đó trong chú
thích của chính nó. Hệ quả không phải "khó chẩn đoán" mà là một hành vi: React
**tháo toàn bộ cây** khi một component ném lúc render và không ai bắt. Bản dev
hiện hộp đỏ; bản phát hành **trắng màn, vĩnh viễn**, và mở lại app thì lặp lại.

### Biên nằm ở đâu, và vì sao đúng chỗ ấy

```
GestureHandlerRootView → PersistQueryClientProvider → AppSettingsProvider
  → AuthProvider → NavTheme → LockedApp → AppLockProvider → CoachChatProvider
    → [AppErrorBoundary] → Gate → AuthScreen | OnboardingFlow | <Stack> (mọi route)
    ConnectionBanner · NeonToastHost · AppLockGate   ← anh em, NGOÀI biên
```

Hẹp nhất còn đúng: **mọi màn nằm dưới `Gate`**, và biên nằm *trong*
`AppSettingsProvider` + `AuthProvider` nên fallback đọc được bảng màu và ngôn
ngữ. Đặt cao hơn thì fallback không có theme, không có tiếng Việt, và phải là
một màn viết cứng bằng màu gõ tay. Ba anh em ở ngoài là chủ ý: dải báo mất mạng,
toast và cổng khoá vẫn sống khi màn chính đã hỏng.

### Ngoài biên — ghi ra chứ không giấu

| Không bắt | Vì sao |
|---|---|
| Lỗi ném từ chính các provider ở trên nó | Cần một biên **thứ hai** ở ngoài cùng, và fallback của nó không đọc được theme hay ngôn ngữ — đó là một **quyết định thiết kế** (viết cứng màu và chọn một ngôn ngữ), không phải một dòng code. Chưa tự quyết. |
| Lỗi trong handler sự kiện, promise, `setTimeout` | React không bắt loại nào trong đó, ở đâu cũng vậy. Chúng vẫn đi tới `ErrorUtils` và vẫn vào nhật ký. |
| Sự cố **native** — lớp lỗi của A9 | Không mã JS nào bắt được. Đó là mục Sentry. |

### Fallback: cố ý KHÔNG dùng `LoadFailed`

`LoadFailed` là card lỗi sẵn có và về ngôn ngữ thiết kế thì đúng — nhưng nó dựng
trên `GlassCard` + `MascotFigure`, tức **lớp kính** và **rig nhân vật**. Lớp
kính là đúng chỗ A9 nổ, và `glass-card.tsx:154` còn nằm trong danh sách nhánh
theo theme mà `theme-shape.mjs` đóng băng.

Một màn hình dựng ra *vì* có thứ vừa hỏng không được chia phụ thuộc với chỗ hay
hỏng nhất — nếu fallback cũng ném, React tháo luôn cả biên và ta quay lại đúng
màn trắng. Nên nó dựng bằng **token** (`usePalette`, `spacing`, `type`,
`radius`): cùng ngôn ngữ thiết kế, cùng theme, không kính, không SVG, không
Reanimated. `Pressable` trần thay `PressScale` vì cùng lý do.

**Và nó không nói lỗi là gì** — không thông điệp, không stack, không mã.

### Hồi phục: vòng lặp đo bằng THỜI GIAN

Nút "Thử lại" đặt lại state. Hỏng **ngay** sau hai lần thử → ngừng mời và đổi
sang "đóng app rồi mở lại". Nhưng một sự cố khác **một phút sau** thì lại được
mời: một bộ đếm trần thì sai cả hai chiều — coi hai sự cố cách nhau nửa tiếng là
một vòng lặp, và không bao giờ mời thử lại nữa sau đó.

### Một hệ quả phải bù lại

`ErrorUtils` **không thấy** lỗi đã bị boundary bắt. Nên thêm boundary vào một app
đang ghi nhật ký sự cố là lặng lẽ làm nhật ký ấy **thôi ghi** đúng loại lỗi nó
sinh ra để bắt — đổi khả năng *nhìn thấy* lấy khả năng *hồi phục*. Không đổi:
`componentDidCatch` gọi `recordCrash` kèm `componentStack` (thứ duy nhất nói
được **màn nào** hỏng khi stack của bundle đã minify thì không).

Và `recordCrash` **lọc qua `telemetry-scrub`** trước khi ghi: `settings.tsx:126`
có nút "chạm để gửi đi" gọi `Share.share` với toàn bộ nhật ký, nên đây là một
đường telemetry thật. Thử ngược: bỏ `scrubText` ra → 2 lỗi (UUID, token).

### Kiểm chứng — chạy thật, không đọc mã

`tools/error-boundary.mjs` nạp **React 19 + ReactDOM thật vào một trình duyệt
thật**, nạp component đã biên dịch, và cho một con **ném lúc render**. Bảy nhóm
khẳng định, **năm phép thử ngược, tất cả bắt được**:

| Thử ngược | Nó nói gì |
|---|---|
| gõ sai `getDerivedStateFromError` | fallback không hiện — tức **màn trắng**, đúng lỗi mà biên sinh ra để chặn |
| nút thử lại không đặt lại state | con không dựng lại |
| boundary không ghi vào nhật ký | 3 lỗi: 0 mục, sai `fatal`, thiếu `componentStack` |
| đếm vòng lặp bằng **số lần** | sự cố sau một phút vẫn bị coi là vòng lặp |
| fallback mượn `GlassCard` | luật tĩnh đỏ |

Và nó chứng minh fallback **không in** token, UUID, tên bảng hay chữ "Error".

**Không chứng minh:** nó chạy trong DOM, không phải iOS. Bố cục,
`UIVisualEffectView` và lớp interop cần một bản dựng thật.

**Một bước kiểm cũ bắt được tôi:** `crash-log.mjs` đỏ vì tôi thêm một phụ thuộc
mà nó chưa biết. Đã dạy nó, và thêm luật cho tính chất mới (mục ghi phải sạch).

---

## CI-PG — XONG (2026-09-08)

Chi tiết đầy đủ ở `docs/HA-TANG.md`. Ở đây là phần đáng nhớ.

**Con số vòng trước SAI.** "11/14 không có đường lui" được đếm bằng
`grep -c "su postgres"` trừ số dòng có `||`, và ba tệp trong danh sách đã có
nhánh quyền đúng từ trước. Thật ra là **8**. Một phép đếm chữ không phải một
phép đo hành vi — cùng bài học với `theme-shape` và `scan-food-boundary`.

**`|| pg_ctl` là câu trả lời sai.** `initdb` **từ chối chạy dưới root**, nên
thử-rồi-lui sẽ chạy nó bằng root ở lần thử thứ hai và nhận `cannot be run as
root` — đổi một lỗi rõ ràng lấy một lỗi khó đọc hơn. Điều kiện là QUYỀN, nên
phép rẽ phải là quyền. `chown` cũng phải nằm trong nhánh ấy.

**Tám tệp, sửa và kiểm từng cái**, mỗi cái hai lần, và mỗi lần phải thấy
`PostgreSQL 16.13` thật chứ không phải một lần bỏ qua: `acwr-consistency` ·
`error-copy` · `nutrition-averages` · `readiness-anchor` ·
`readiness-confidence` · `readiness-integrity` · `workload-volume` ·
`workout-sync-integrity`. **8/8 exit 0 dưới root và 8/8 exit 0 dưới người dùng
thường** (trước đó `acwr-consistency` là exit 1).

**Một lỗi CI thứ hai, tìm ra khi đang kiểm.** `nutrition-averages` gọi `npx tsc`
với `cwd` là thư mục tạm, nên npx đi ra registry tìm một gói **tên là `tsc`** —
một stub đã ngừng bảo trì, không phải TypeScript. Đo được dưới một người dùng
mới: `npm error request to https://registry.npmjs.org/tsc failed`. Đã gọi thẳng
`node_modules/typescript/bin/tsc`.

**Dụng cụ đo của tôi sai một lần nữa.** Phép thử đầu chạy dưới `nobody`, vốn có
HOME `/nonexistent`, nên `npx` hỏng vì lý do đó chứ không vì quyền. Đã đổi sang
một người dùng có HOME ghi được, giống runner thật.

**`tools/pg-harness.mjs`** (mới, trong cổng) giữ tính chất bằng luật tĩnh, và nó
tìm ra **hai tệp nữa** mà phép phân loại của tôi bỏ sót. Nó phân biệt đúng chỗ
cần: `su … || pg_ctl` vẫn được phép cho lệnh **dừng** (an toàn hai chiều) nhưng
không cho `initdb`/`start`. Nó cũng phải **trừ chính mình** — chuỗi luật của nó
khớp mọi mẫu nó đi tìm.

**Hệ quả: workflow bỏ `sudo`** cho bước chạy bộ kiểm; nó chỉ còn ở hai bước cài
gói hệ thống. `ci-preflight` bỏ luật `su postgres` — một luật canh một điều kiện
đã hết chỉ còn chặn nhầm.

**Chưa đo được:** chạy TOÀN BỘ bộ kiểm dưới người dùng thường ở máy này ra **17
bước đỏ**, nhưng cả 17 là `EACCES` ghi vào cây nguồn — cây ở đây thuộc `root`.
Trên runner thật, `actions/checkout` tạo cây thuộc chính người chạy. Phép đo dứt
điểm cần đổi chủ cả cây và thao tác ấy bị chặn ở môi trường này, nên điều này
được **suy ra**, không được chứng minh. `ci-preflight` nay thử ghi vào `native/`
và nói thẳng nếu không được — một dòng thay cho mười bảy stack trace.

**Ba lần dụng cụ đo sai trong vòng này**, mỗi lần tạo một lỗi giả: HOME
`/nonexistent` của `nobody` (npx đi tải gói) · PATH trỏ node 20 thay vì 22 · git
từ chối repo thuộc người khác. Không lần nào là lỗi của mã đang kiểm.

---

## GitHub Actions — ĐÃ KIỂM CHỨNG TRÊN RUNNER THẬT (2026-09-08)

Không còn là "chuẩn bị xong". Workflow đã chạy hai lượt trên runner thật của
GitHub, và **cả hai đỏ**. Ghi ra vì một trang trạng thái nói "đã chuẩn bị" trong
khi runner đang đỏ là trang nói dối.

| Lượt | Commit | Kết quả | Dài |
|---|---|---|---|
| #1 | `be8aea7` | failure | ~56s |
| #2 | `4ad659b` | failure | ~74s |
| **#3** | **`af46909`** | **success** | **9 phút 13 giây** |

Lượt #3: run `34274088152`, runner `ubuntu-24.04`, job `gate`, **cả 9 bước
success**. Bộ kiểm kết thúc bằng `tất cả đều xanh`.

| Bước | Thời gian |
|---|---|
| `npm ci` (kèm `patch-package`) | 20s |
| cài PostgreSQL 16 | 6s |
| Playwright + Chromium | 16s |
| **tiền kiểm** | **<1s** |
| TypeScript | 12s |
| **bộ kiểm đầy đủ** | **8 phút 10 giây** |

**Và các bước cơ sở dữ liệu THẬT SỰ chạy, không bỏ qua.** Log của runner có
`trên PostgreSQL 16.13 dựng từ toàn bộ migration` ở `độ tin cậy điểm sẵn sàng`
và `neo cửa sổ điểm sẵn sàng`. Đó là điều cả `ci-preflight` lẫn `pg-harness`
tồn tại để bảo đảm, và nó nay là một phép đo trên runner chứ không phải một suy
luận.

### Lỗi thật đầu tiên, và nó hỏng ĐÚNG CHỖ nó phải hỏng

```
✗ không nạp được playwright (đã tìm:
  /home/runner/work/fitness-os/fitness-os/native/node_modules,
  /opt/hostedtoolcache/node/22.23.2/x64/lib/node_modules).
  6 bước chạy trình duyệt sẽ hỏng
```

`ci-preflight` dừng job ở **giây thứ 30** với câu nói đúng cái đang thiếu — thay
vì 6 bước đỏ ở phút thứ mười với sáu stack trace về trình duyệt. Đó là toàn bộ
lý do bước ấy tồn tại, và đây là lần đầu nó được kiểm chứng ở nơi nó dùng để
chạy.

### Nguyên nhân gốc — của tôi, không phải của runner

`sudo npm install -g playwright` cài vào prefix npm của **root**, còn
`npm root -g` của người chạy job trỏ vào toolcache của chính nó. Hai chỗ khác
nhau, nên thư viện có mặt mà không ai tìm thấy. Và `sudo npx playwright install`
tải trình duyệt về `/root/.cache/ms-playwright` — thư mục 0700 mà người chạy job
không đọc được.

`--with-deps` **không** cần `sudo` ở ngoài: Playwright tự leo quyền cho phần apt
của nó. Đọc từ chính gói đang cài —
`playwright-core/lib/server/registry/dependencies.js:356-358` dựng
`{ command: "sudo", args: ["--", "sh", "-c", …] }` khi nó không phải root — chứ
không đọc từ tài liệu.

**Sửa: bỏ `sudo` khỏi đúng hai dòng ấy.** Không nới lỏng bước kiểm nào, không
đổi lỗi thành bỏ qua.

### Đã được runner thật xác nhận (đo, không suy ra)

Bốn điều kiện còn lại của `ci-preflight` **đều xanh** trên runner:

- **PostgreSQL 16** cài được và tìm thấy đúng chỗ các bước kiểm đi tìm
- `node_modules/pg` có mặt sau `npm ci` (tức không bị `--omit=dev`)
- `node_modules/typescript` + `tsconfig.json` có mặt
- **cây làm việc ghi được** — điều mà ở container này chỉ *suy ra* được, vì
  thao tác đổi chủ cây bị chặn. Nay nó là một phép đo.

Và `npm ci` (kèm `patch-package` qua `postinstall`) chạy xong không lỗi.

### Điều này đổi một chữ trong tài liệu

Trước: "chuẩn bị xong, chưa chạy lần nào". Nay: **ĐÃ KIỂM CHỨNG** — một lượt
kết thúc `success` trên runner thật của GitHub, với các bước PostgreSQL và
Playwright chạy thật.

Và nó đóng luôn một chỗ trước đây chỉ *suy ra* được: chạy toàn bộ bộ kiểm dưới
một người dùng **không phải root** là được — điều mà container này không chứng
minh nổi vì cây thuộc `root` và thao tác đổi chủ bị chặn. Runner chạy dưới
`runner`, và 215 bước xanh.

---

## SENTRY — ĐÃ NỐI (2026-09-08), native CHƯA kiểm

Chi tiết ở `docs/HA-TANG.md` mục 1. Ở đây là ba điều đáng nhớ.

### Ranh giới cũ của tôi SAI, và cả hai vế đều đo được

Vòng trước tôi ghi "không cài SDK từ máy này — cài mà không dựng lại thì import
ném lúc chạy". Sai:

- **Repo dùng CNG** (không có `ios/`, `android/`) → thêm native module là thay
  đổi **cấu hình**, native sinh lúc dựng.
- **Import không ném**: `wrapper.js:35` dùng `TurboModuleRegistry?.get()`.
  `getEnforcing` chỉ ở `NativeRNSentry.js` và chú thích của Sentry nói nó ở đó
  *"to pass codegen even if not used"*.

Và **bài học A9 đã áp dụng trước khi cài**: gói khai `codegenConfig`
`"type": "all"` — có kiến trúc mới. MaskedView 0.3.2 của A9 **không có dòng
nào**. Đó là phép kiểm bắt buộc trước mọi native module trong app này.

Bản: **`~7.11.0`** — danh sách tương thích của chính Expo cho SDK 57, không phải
npm `latest` (8.25.0). `sentry-expo` không dùng (bản cuối 2024-02-15).

### Hai móc, và cái thứ hai là cái quan trọng

`beforeSend` chỉ chạy khi **JS còn sống**. Một sự cố native giết tiến trình: lớp
native dựng báo cáo rồi gửi ở lần mở sau, và `beforeSend` **không bao giờ chạy
cho nó**. Thứ duy nhất của JS còn vào được báo cáo ấy là breadcrumb, vì SDK
chuyển tiếp từng cái sang native lúc chúng xảy ra — nên `beforeBreadcrumb` là
chỗ chặn **duy nhất** cho đúng lớp lỗi Sentry được thêm vào để phục vụ.

Thiếu nó thì Sentry vẫn "chạy" và mỗi báo cáo native mang theo URL PostgREST có
`user_id=eq.<uuid>` cùng tên bảng sức khoẻ. Nó **trông như thành công**.

### Ba mức "đã kiểm" — KHÔNG gộp

| Mức | | Bằng chứng |
|---|---|---|
| Tĩnh | ✅ | luật 8 của `telemetry-scrub.mjs`; **4 phép thử ngược** đều bắt được: bỏ `beforeBreadcrumb`, bỏ `beforeSend`, bật `attachScreenshot`, DSN viết thẳng |
| JS / runtime | ✅ | `scrubBreadcrumb` chạy thật; **cổng 215/215 xanh với SDK đã cài**, gồm 6 bước dựng bundle web + mở trình duyệt |
| **Native (iOS)** | ❌ | Linux không dựng được iOS. **Chưa có gì** chứng minh sự cố native được bắt, được gửi, hay báo cáo ấy đã sạch |

`tools/linked.mjs` bắt được một miễn trừ đã cũ (`scrubEvent` nay đã nối) và tôi
gỡ luôn `observabilityEnabled` — một hàm viết cho một màn Cài đặt chưa tồn tại.
Không ship thứ chưa ai gọi.

---

## AUDIT SẢN PHẨM TRƯỚC RA MẮT — vòng 1 (2026-09-08)

Đi qua app như một người chưa từng thấy nó, dựa trên **ảnh chụp bản dựng thật**
(`tools/live.mjs --shots`), không dựa trên việc đọc mã rồi đoán. 32 màn × 3
trạng thái (đủ dữ liệu / **tài khoản trống** / mọi truy vấn hỏng).

**Luật lọc nhiễu, lấy từ chính `live.mjs`:** *"Anything that is layout, platform
or chrome seen here is noise."* Mọi phát hiện dưới đây đã được hỏi "nó có biến
mất trên điện thoại không?" trước khi được ghi.

### Câu hỏi trung tâm: 5 phút đầu

**Trả lời được.** Sau onboarding, màn Hôm nay có bốn nút hành động rõ ràng —
*Ghi bữa · Ghi buổi tập · Ghi giấc ngủ · Nhập chỉ số* — và mỗi màn chính có một
việc tiếp theo nói thành lời. Không màn nào trong 32 màn bị trắng, không màn nào
ném lỗi runtime, và không chuỗi `NaN`/`undefined` nào lọt ra.

### Cái đang làm ĐÚNG (ghi lại để không ai "sửa" mất)

| Màn | Vì sao nó tốt |
|---|---|
| **Tập luyện** (trống) | *"Chưa có buổi tập nào hôm nay — Chọn một buổi, hoặc cứ ghi lại thứ bạn làm."* Nói việc tiếp theo VÀ cho phép bỏ qua bước lập kế hoạch |
| **Tiến trình** (trống) | `CURRENT —` · `CHANGE —` · `RECORDS 0`; *"Cần cân nặng và chiều cao để tính BMI"*; *"Chưa đủ dữ liệu"* trên biểu đồ |
| **Huy chương** (trống) | `0/29`, và **mỗi** huy chương nói điều kiện của nó (*"Ghi 3 ngày liên tiếp"*) kèm tiến độ `0/3` |
| **Mọi truy vấn hỏng** | *"Không tải được dữ liệu / Dữ liệu của bạn vẫn an toàn, chỉ là app chưa lấy được"* + nút **Thử lại**. Người dùng hồi phục được mà không phải mở lại app |
| **Onboarding** | 7 bước, mỗi quyền xin kèm một dòng **vì sao**, và có "để sau". Nút Tiếp bị chặn ở bước 0 **có nói lý do** ngay tại ô nhập |
| **Cài đặt** | Mỗi công tắc có một dòng giải thích tác dụng |

### Phát hiện

#### P-01 — vòng Sẵn Sàng vẽ `0` khi chưa đo được gì · **P2** · ĐÃ SỬA

| | |
|---|---|
| **Màn** | Hôm nay → hero "Sẵn Sàng", trạng thái tài khoản trống |
| **Quan sát** | Vòng tròn hiện số **`0`**, dưới là một gạch. Lời giải thích nằm trong `<Expander open={detailOpen}>` nên **thu lại mặc định** — người mới không thấy nó |
| **Mong đợi** | Không vẽ một chữ số khi chưa có phép đo nào |
| **Bằng chứng** | Ảnh `empty/today.png`. Và app **tự mâu thuẫn với chính nó**: `/progress` dùng `CURRENT —`, `CHANGE —` cho "chưa đo" và `RECORDS 0` cho một phép đếm thật; huy chương dùng `Earned 0/29` — cũng là đếm thật. Vòng hero là chỗ **duy nhất** vẽ `0` cho "chưa đo" |
| **Nguyên nhân** | `EmptyHero` (`hero-pages.tsx`) truyền `value={0}` cho `HeroRing` |
| **Vì sao nó quan trọng** | Đây là app sức khoẻ. `0` là chữ số app dùng cho một điểm THẬT, nên nó đọc thành "điểm sẵn sàng của bạn là 0" — đáy thang — cho một người chưa làm gì sai. Engine đứng ngược lại: `computeReadiness` trả "không có điểm" chứ không trả điểm kém khi thiếu số đo, và bước kiểm `readiness-confidence` đã canh đúng điều đó |
| **Độ chắc** | Cao — quy ước có sẵn trong app, ở hai chỗ |
| **Đã sửa** | `HeroRing` nhận thêm `placeholder?: string`; `EmptyHero` truyền `—`. **Không** đổi `value: number` thành string — prop ấy có lý do ghi sẵn (dấu phân cách theo ngôn ngữ + cú đếm khớp nét quét vòng), và canary của `live.mjs` từng bắt một hồi quy ở đúng chỗ đó |
| **An toàn tự sửa** | Có — `EmptyHero` chỉ dùng ở **đúng một** chỗ |

#### P-02 — tiêu đề đầu trang trong suốt, ở bản SÁNG · **P2** · KHÔNG SỬA, cần quyết định

| | |
|---|---|
| **Màn** | `/shop` và `/mascot-room` |
| **Quan sát** | "Dressing Room" gần như không đọc được: chữ gần đen trên dải cảnh tối |
| **Nguyên nhân** | `pageTitleFloat` không đặt lại `color`, nên nó thừa `c.foreground` = `#1a1917`. Cùng hàng ấy, mũi quay lại bị ghim cứng `'#fff'` (`screen.tsx:390`) — **hai thứ trong một hàng đang nói hai chuyện khác nhau** |
| **Trạng thái** | Mã **đã ghi sẵn** đây là *"QUYẾT ĐỊNH THIẾT KẾ CÒN MỞ, không phải một phép đổi token"*, kèm câu *"Cả hai màn chưa từng được chụp ở bản sáng"* |
| **Đóng góp của vòng này** | **Nay đã chụp.** `empty/shop.png` là bằng chứng đầu tiên rằng vấn đề dự đoán ấy có thật và nhìn thấy được |
| **An toàn tự sửa** | **Không.** Chọn màu chữ cho một đầu trang trong suốt trên nền sáng là quyết định thiết kế; mã đã nói thế và tôi không đè lên |

#### P-03 — Cài đặt không nói app có gửi báo cáo sự cố đi không · **P3** · cần quyết định

| | |
|---|---|
| **Bối cảnh** | Vòng này vừa nối Sentry. Khi `EXPO_PUBLIC_SENTRY_DSN` được đặt, app **gửi dữ liệu ra bên thứ ba** — và màn Cài đặt không nói gì cả |
| **Hôm nay** | Chưa thành vấn đề: không có DSN thì không một byte nào rời máy |
| **Mong đợi** | Ngày bật DSN, Cài đặt phải nói ra — lý tưởng là kèm công tắc |
| **An toàn tự sửa** | **Không** — đây là chữ hiển thị cho người dùng và một lựa chọn sản phẩm. Tôi đã **gỡ** `observabilityEnabled` khỏi `observability.ts` chính vì không ship một hàm cho một màn chưa tồn tại |

#### P-04 — gợi ý nói về việc người dùng chưa làm · **P3** · quan sát, chưa kết luận

Ở `empty/nutrition.png`, thẻ gợi ý ghi *"Trained today and the calories did not
go up? Tap here."* cho một tài khoản chưa ghi buổi tập nào. Có thể là mẹo xoay
vòng chứ không phải một khẳng định về trạng thái — **chưa đủ bằng chứng để gọi
là lỗi**, và không sửa.

### Cái audit này KHÔNG kiểm được

Bộ chạy là web. VoiceOver, `UIVisualEffectView`, cảm giác cuộn, độ trễ chuyển
màn và mọi thứ thuộc về chạm — không thứ nào ở đây. Trợ năng, đổi theme, bàn
phím, i18n vẫn được canh bằng các bước kiểm tĩnh trong cổng
(`a11y-swallow`, `tap-targets`, `theme-shape`, `i18n`, `bàn phím`) và chúng xanh
— nhưng "xanh ở bước kiểm" không phải "đã dùng thử trên máy thật".

---

## LƯỢT ĐÁNH BÓNG SẢN PHẨM — 0 khiếm khuyết, 0 thay đổi mã (2026-09-09)

Đầy đủ ở **`docs/PRE-LAUNCH-POLISH.md`**. Tóm tắt:

Một lượt rà soát UX / chuyển động / hiệu năng / hệ thống kết thúc bằng **không
sửa gì**, và đó là kết quả chứ không phải một lần bỏ cuộc. Lý do: **211 bước
kiểm có tên** đã phủ gần hết những gì một lượt như thế đi tìm — thang chữ, bảng
màu, hình dạng cây theo theme, Dynamic Type, vùng chạm, ngân sách vẽ/ảnh/xuất
hiện, khởi động lạnh, tầng import, phạm vi hook, một-khái-niệm-một-tên.

**Hệ chuyển động đã tồn tại** (`src/constants/motion.ts`) và tốt hơn thứ một lượt
làm mới sẽ tạo ra: bốn `duration` đặt tên vì app ĐÃ nói bằng bốn con số ấy ở bảy
chỗ, lò xo viết bằng `spring(duration, bounce)` của Apple, và nó ghi rõ hai thứ
**cố ý không** token hoá (rig nhân vật, dải xuất hiện) vì chúng là choreography.
Bước kiểm `mô hình lò xo` còn bắt được rằng công thức damping trên slide WWDC23
của Apple **là sai** và đã được chính Apple đính chính.

Ba thứ được kiểm trong lượt này, cả ba đều **đủ**:

| | Kết quả |
|---|---|
| **Reduce Motion** | grep chỉ 4 khoảng trống · đọc ra **0**. `drag-reorder` từ chối có chủ ý và có ghi lý do (đóng băng cú tự-cuộn khi đang kéo là gỡ tính năng — khớp ý định của Apple). Reanimated mặc định `ReduceMotion.System`, chỉ `useFrameCallback` là không, và đúng hai đồng hồ ấy đã nối |
| **Hành động phá huỷ** | **13/13** hook xoá có xác nhận. grep chỉ 1 ứng viên · đọc ra đó là một **chú thích**. Không có bước kiểm canh tính chất này — ghi là khoảng trống đã biết, **không thêm luật cho một thứ đang đúng** |
| **Haptics** | nhất quán theo mô hình Apple: selection 188 · Light 66 · Success 45 · Medium 16 · Warning 7 · Error 2 |

**Bài học, và nó lặp lại lần thứ ba:** grep chỉ ra khoảng trống, đọc cho ra
không có. Reduce Motion 4→0 · xoá-không-xác-nhận 1→0 · và lượt trước
"11/14 bước PostgreSQL" thật ra là 8. Repo này chống lại phép đo bằng chuỗi, vì
lý do của mỗi quyết định nằm ngay cạnh nó — và một chú thích giải thích *vì sao
không làm X* trông y hệt mã *quên làm X* với một biểu thức chính quy.

**Không nghiên cứu web trong lượt này**, vì không đổi hành vi hoạt hoạ và không
đụng API nào — ghi ra chứ không dựng một mục "nghiên cứu" cho có.

---

## HERMES-MEM — ĐÃ NÂNG CÓ KIỂM SOÁT (2026-09-09)

Một bản nâng hẹp, cho đúng một lý do. **Không** nâng chung, **không** đụng gói
nào của app.

### TRƯỚC → SAU

| | TRƯỚC | SAU |
|---|---|---|
| `expo` (manifest) | `~57.0.6` | `~57.0.9` |
| `expo` (đã cài) | 57.0.6 | **57.0.9** |
| `react-native` | `0.86.0` | **`0.86.2`** |
| **`hermes-compiler`** | **250829098.0.14** | **250829098.0.16** |
| expo-doctor | 19/21 · **2 đỏ** | 20/21 · **1 đỏ** |
| gói trễ | 22 | **20** |
| TypeScript | xanh | xanh, đầu ra rỗng |
| Cổng | 215/215 | **215/215** |
| Bộ chạy web | 32×3 xanh | **32×3 xanh** (bundle Metro dựng lại trên chuỗi công cụ mới) |

Node v22.22.2 · npm 10.9.7, không đổi.

### Vì sao ĐÚNG hai phiên bản này

`expo-doctor` nói: *"Detected Hermes V1 250829098.0.14… **250829098.0.16** is
the first version that contains the fix"*, và khuyến nghị `expo@^57.0.9` /
React Native **≥ 0.86.2**.

Đọc `bundledNativeModules.json` của từng bản expo — không đoán:

| expo | ghim react-native |
|---|---|
| **57.0.9** | **0.86.2** ← ngưỡng tối thiểu |
| 57.0.21 (mới nhất) | 0.86.3 |

Nên **57.0.9 + 0.86.2** là tổ hợp NHỎ NHẤT gỡ được hồi quy, và đó là cái được
chọn. Không lên 57.0.21: nó không sửa thêm gì cho mục này và đổi nhiều hơn.

### `expo install --fix` bị BỎ, và đó là điểm quan trọng nhất của vòng này

Đó là "đường chính thức", nên tôi thử nó trước. Nó làm **đúng thứ bản nâng này
bị cấm làm**:

- đặt `expo` thành `~57.0.21`, **không** phải 57.0.9
- đổi 20 dòng trong `package.json`
- **hạ MAJOR** `@react-native-async-storage/async-storage` `^3.1.1` → `2.2.0`

Cái thứ ba là lớp lưu trữ của app — thứ giữ cache persist, hàng đợi ghi offline
và mọi khoá người dùng. Một bản hạ major ở đó không có chỗ trong một bản nâng
"sửa Hermes".

Đã hoàn nguyên `package.json` + `package-lock.json` về đúng bản commit, rồi cài
tay đúng hai gói. **Đường chính thức không phải lúc nào cũng là đường hẹp.**

### Lockfile: nhiễu là gì

77 gói đổi phiên bản, 9 thêm, 2 bỏ. Phân theo họ: **expo 26 · react-native 14 ·
khác 37** — và cả 37 "khác" đều là chuỗi công cụ đi kèm (metro 0.84.4→0.84.5,
babel-preset-expo, lightningcss, terser, postcss). Trong đó có đúng dòng đáng
đọc: `hermes-compiler 250829098.0.14 → 250829098.0.16`.

**Không gói nào của app đổi.** `async-storage`, `react-native-reanimated`
(4.5.0), `react-native-screens` (4.25.2), `@supabase/*`, `@sentry/react-native`
(~7.11.0) — nguyên vẹn.

Cây phụ thuộc: **một** `react-native` ở tầng chạy. Có vài `@react-native/*`
0.86.3 lồng dưới `expo/` và `babel-preset-expo/` — đó là công cụ dev/dựng
(debugger, codegen), không phải runtime thứ hai.

### Doctor còn một phép đỏ, và nó KHÔNG phải mục này

*"Check that packages match versions required by installed Expo SDK"* = **20 gói
trễ** = DEP-1, đã theo dõi, là quyết định của chủ dự án. Nó đỏ **trước** bản nâng
và vẫn đỏ. Điều đáng nói là bản nâng làm nó **tốt hơn**: 22 → 20, và **không gói
nào mới trễ** (`expo-constants`, `expo-font` hết trễ nhờ đi theo expo 57.0.9).

### BA MỨC BẰNG CHỨNG cho HERMES-MEM — không gộp

| Mức | | Bằng chứng |
|---|---|---|
| **A. Phiên bản / cấu hình** | ✅ | `hermes-compiler` trong lockfile là **250829098.0.16**, đúng bản Expo nêu tên. Phép kiểm Hermes của doctor biến mất khỏi danh sách đỏ |
| **B. Kiểm tĩnh / runtime** | ✅ | TypeScript exit 0 · cổng 215/215 · bộ chạy web 32 màn × 3 trạng thái xanh trên bundle Metro dựng lại |
| **C. Bộ nhớ trên iPhone thật** | ❌ **CHƯA** | Không có máy. **Không được nói hồi quy bộ nhớ "đã sửa" chỉ vì doctor xanh** — doctor đọc số phiên bản, không đo bộ nhớ |

Mục **E6** của `docs/QA-MAY-THAT.md` (mở app 20 phút, đi qua mọi tab) là phép đo
duy nhất kết luận được, và nay nó chạy được **không kèm dấu hỏi** — đó chính là
điều bản nâng này mua về.

---

## CHUẨN BỊ KIỂM TRÊN MÁY THẬT (2026-09-09)

Danh sách đi từng bước: **`docs/QA-MAY-THAT.md`**. Ở đây là những gì audit cấu
hình tìm ra.

### CHẶN — chưa liên kết dự án EAS

`app.json` không có `extra.eas.projectId`, và `eas.json` đặt
`"appVersionSource": "remote"` — thứ **đòi** một dự án đã liên kết. `eas build`
chưa chạy được ở chế độ không tương tác.

**Cần:** tài khoản Expo + `eas init` trong `native/`. **Không bịa được** — tôi
không tạo ra một UUID dự án của người khác.

### ~~RỦI RO CAO — Hermes V1 có hồi quy bộ nhớ đã biết~~ → ĐÃ NÂNG, xem mục HERMES-MEM ở trên

`npx expo-doctor` chạy hôm nay, **2/21 phép kiểm đỏ**. Phép quan trọng:

> This project uses Hermes V1 with expo@57.0.6, which is affected by a known
> memory regression. Detected Hermes V1 **250829098.0.14**. …**250829098.0.16**
> is the first version that contains the fix.

Khắc phục theo chính Expo: `expo@^57.0.9` / React Native **≥ 0.86.2**. Repo
đang ở `expo ~57.0.6`, `react-native 0.86.0`.

**Vì sao nó là mục quan trọng nhất của vòng này:** một hồi quy **bộ nhớ** hiện
ra trên máy thật đúng như *"app chậm dần"*, *"app bị hệ thống giết"*, *"app
thoát sau một lúc"* — tức lẫn hoàn toàn vào những triệu chứng mà QA máy thật đi
tìm, và vào chính lớp triệu chứng của A9. Chạy QA trên một bản dựng có hồi quy
đã biết là đo hai thứ cùng lúc mà không tách được chúng.

**KHÔNG tự nâng.** DEP-1 đã ghi là quyết định của chủ dự án, và nâng `expo` +
`react-native` đòi một bản dựng native để xác nhận. Nhưng khuyến nghị: **nâng
TRƯỚC khi chạy danh sách QA**, nếu không mọi phát hiện về hiệu năng đều mang một
dấu hỏi. Phép kiểm đỏ thứ hai chỉ là "22 gói trễ" = DEP-1, đã theo dõi.

### Chưa xác minh được ở đây

`eas.json` khai `channel: preview`/`production` nhưng **`expo-updates` không có
trong `package.json`**. Tài liệu Expo không nói build sẽ lỗi, cảnh báo hay bỏ
qua. **Không sửa `eas.json` theo phỏng đoán** — đọc log lần `eas build` đầu rồi
quyết.

### Bản dựng miễn phí kiểm được cái gì

`EXPO_FREE_TEST=1` gỡ HealthKit, Sign In with Apple và Push để dựng bằng Apple
ID miễn phí. Nên trên bản ấy, ba mục đó phải ghi **"không áp dụng"**, không được
ghi "đạt". Và Android push chưa dựng được: không có `google-services.json`.

### Đã sửa vòng này — một thứ, và nó là tài liệu

Phần đầu `.github/workflows/quality-gate.yml` còn ghi *"211 bước"* và *"Tệp này
CHƯA TỪNG CHẠY"*. Cả hai nay sai (215 bước; lượt #3 đã `success`). Đã sửa cho
khớp phép đo, kèm số của lượt xanh. Không đổi một dòng hành vi nào.

---

## BA MỨC BẰNG CHỨNG — bảng tổng, không được gộp

| Hạng mục | TĨNH | RUNTIME (web) | **MÁY THẬT** |
|---|---|---|---|
| Cổng 215 bước | ✅ | ✅ | — không áp dụng |
| CI trên runner GitHub | ✅ | ✅ | — không áp dụng |
| Biên bắt lỗi React | ✅ | ✅ | ❌ **chưa** |
| Bộ lọc riêng tư Sentry | ✅ | ✅ | ❌ **chưa** |
| **Sentry bắt sự cố NATIVE** | ✅ (nối đúng) | — không kiểm được | ❌ **chưa — đây là mục chính** |
| P-01 vòng sẵn sàng `—` | ✅ | ✅ (ảnh chụp) | ❌ **chưa** |
| A11Y-2 nút lồng nút | ✅ | ✅ | ❌ **chưa — VoiceOver chưa từng chạy** |
| A9 (chạm vùng vòng sau khi đổi tab) | — | — | ✅ chủ dự án xác nhận 2026-09-08 · **cần kiểm lại** sau khi thêm biên + Sentry |

---

## ERRBOUND-2 — MỞ, và nó là một QUYẾT ĐỊNH THIẾT KẾ

Không cài đặt gì ở đây. Trang này ghi đủ để người quyết định không phải đọc lại
mã, và cố ý dừng trước chỗ phải chọn.

### Nó bắt cái gì mà biên hiện tại không bắt

Biên hiện tại nằm quanh `<Gate />`. Bảy thứ ở **trên** nó ném ra thì không ai
bắt, và app trắng màn đúng như trước:

`GestureHandlerRootView` · `PersistQueryClientProvider` · `AppSettingsProvider` ·
`AuthProvider` · `NavTheme` · `LockedApp` · `AppLockProvider` ·
`CoachChatProvider`

Xác suất thấp hơn hẳn một màn hình — chúng không dựng lại theo dữ liệu — nhưng
hậu quả **nặng hơn**: một màn hỏng là một màn; một provider hỏng là cả app, mọi
lần mở, không có đường ra.

### Chỗ phải chọn, và vì sao không tự quyết được

Fallback của biên thứ hai **không đọc được** `usePalette` hay `useI18n`: cả hai
là context do đúng những provider vừa ném cung cấp. Nên nó buộc phải:

1. **Chọn một màu** mà không biết người dùng đang ở theme nào.
2. **Chọn một ngôn ngữ** mà không biết họ đang đọc tiếng gì.

Cả hai là câu hỏi thiết kế, không phải câu hỏi kỹ thuật, và đoán sai thì cái
người dùng thấy vào khoảnh khắc tệ nhất là một màn hình **sai theme, sai tiếng**.

### Ba lựa chọn nhỏ nhất, và cái giá của từng cái

| | Cách làm | Được | Mất |
|---|---|---|---|
| **A** | Một biên ngoài cùng, fallback **một màu trung tính** (không đen không trắng) + **một ngôn ngữ** | Rẻ nhất; ~20 dòng; không phụ thuộc gì | Sai theme với một nửa người dùng; sai tiếng với một nửa |
| **B** | Như A, nhưng đọc theme + ngôn ngữ **từ AsyncStorage** trước khi dựng | Đúng theme và đúng tiếng trong hầu hết trường hợp | Đọc bất đồng bộ ⇒ một nhịp trống trước khi vẽ; và nếu chính `AppSettingsProvider` hỏng vì kho hỏng thì phép đọc này hỏng cùng lý do |
| **C** | Không thêm biên; để `ErrorUtils` + nhật ký sự cố ghi lại, app vẫn trắng | Không thêm mã, không thêm chỗ hỏng | Người dùng vẫn không có đường ra; chỉ có người đọc log biết |

**B là cách duy nhất tránh được "sai theme, sai tiếng"**, và nó là cách duy nhất
có một chế độ hỏng chung với thứ nó đang cứu. Đó chính là chỗ cần một người
quyết định chứ không phải một phép đo.

### Câu hỏi cần trả lời để mở khoá mục này

1. **A, B hay C?**
2. Nếu A: **màu nào** và **tiếng nào**? (Gợi ý mặc định của app: `vi`.)
3. Fallback ấy có nút gì? "Thử lại" ở đây nghĩa là dựng lại **toàn bộ** cây,
   tức mất mọi state trong bộ nhớ — khác hẳn nút thử lại của biên hiện tại.

### Đã biết trước, để khỏi đo lại

- Biên hiện tại **không** cần đổi cho việc này; biên thứ hai là một lớp bọc
  thêm ở ngoài `GestureHandlerRootView`.
- `tools/error-boundary.mjs` dựng sẵn cho việc này: đổi thêm một kịch bản là đủ,
  không phải viết lại bộ khung.
- `recordCrash` đã lọc riêng tư, nên biên thứ hai ghi log được ngay mà không
  cần thêm gì.

---

## Còn mở

| ID | Mức | Vấn đề | Việc tiếp theo |
|---|---|---|---|
| ERRBOUND-2 | P3 | Không có biên thứ hai ở ngoài các provider | **Quyết định thiết kế** — ba lựa chọn và ba câu hỏi đã viết sẵn ở mục ERRBOUND-2 bên trên. Không cài đặt suy đoán. |
| DEP-1 | P2 | 21 gói trễ, gồm `react-native-screens` 4.25.2→4.26.0 và `react-native` 0.86.0→0.86.3 | Cần dựng lại native để xác nhận — quyết định của chủ dự án |
| A3 | P1 | Ghi khi mất mạng không sống sót (xem `SO-GHI-LOI.md`) | Cần một bước kiểm chứng minh cả ~30 mutation đặt đúng key **trước khi** bắt đầu |
| A7 | P2 | Xoá buổi tập không dựng lại các ngày ở giữa | xem `SO-GHI-LOI.md` |
| A8 | P2 | Android không có blur thật sau status bar | Giới hạn có chủ ý |
| AI-DEPLOY | P1 | Không function nào được deploy; sáu tính năng AI không có backend | Chủ dự án: `docs/AI-TRIEN-KHAI.md` mục 3–5. Cần `supabase` CLI + quyền |
| SHOP-HDR | P2 | Tiêu đề đầu trang trong suốt gần như không đọc được ở bản SÁNG (`/shop`, `/mascot-room`) | **Quyết định thiết kế** — `screen.tsx` đã ghi rõ là quyết định chưa ai ra. Ảnh `empty/shop.png` là bằng chứng đầu tiên. Không tự sửa |
| SENTRY-UI | P3 | Cài đặt không nói app có gửi báo cáo sự cố đi không | Chỉ thành vấn đề khi `EXPO_PUBLIC_SENTRY_DSN` được đặt. Cần chữ hiển thị + có thể một công tắc — lựa chọn sản phẩm |
| P3-1 | P3 | `settings` / `mascot-room`: `transform-origin` là thuộc tính DOM sai trên web | Chuỗi CSS của Koa; bản native đọc đúng qua `koa-figure.tsx:461`. Chỉ là tiếng ồn trên web |

---

## Bàn giao — vòng sau bắt đầu từ đâu

**Việc đáng làm nhất mà KHÔNG cần máy thật: A3 (P1).** Và bắt đầu bằng bước kiểm,
không bằng bản sửa — `SO-GHI-LOI.md` A3 đã ghi vì sao: cách sửa thật là persist
mutation cache cộng `mutationKey` + `setMutationDefaults` cho khoảng ba mươi
mutation, và *"một call site đặt sai key thì mutation đó **âm thầm** ngừng
resume — không lỗi, không cảnh báo, chỉ là dữ liệu biến mất"*. Ba mươi chỗ để
sai và không chỗ nào tự kêu. Nên thứ tự bắt buộc là: dựng một bước kiểm chứng
minh được cả ba mươi chỗ đều đúng, **rồi mới** sửa.

**Hai việc đang chờ chủ dự án, không ai khác làm được:**

- **DEP-1** — 21 gói trễ. Cần một máy dựng native để đánh giá; đã được dặn
  KHÔNG tự nâng.
- Bản dựng iOS thật cho mọi thứ vòng này đã sửa. Bộ chạy web chứng minh được
  cây trợ năng và bố cục; nó **không** chạy VoiceOver, không chạy
  `UIVisualEffectView`, và không chạy lớp interop của kiến trúc mới.

**Phối hợp:** một phiên song song đang đẩy vào CÙNG nhánh
`claude/ios-fitness-rebuild-omgulr` (giai đoạn giao diện sáng, GĐ2C). Trước mỗi
lần commit: `git fetch` rồi rebase. Khi đụng đúng dòng họ vừa sửa mà thay đổi
của mình làm ĐỔI bản tối, nhường bản của họ — `tools/dark-frozen.mjs` đang giữ
lời hứa "bản tối không đổi một ký tự nào" của giai đoạn đó.

---

## Cách cập nhật trang này

Sau mỗi vòng rà soát: đổi commit và ngày ở đầu, chạy lại bảng cổng chất lượng,
và **chỉ ghi con số mình vừa đo**. Một ô "XANH" chép lại từ vòng trước là ô nói
dối ngay lần đầu có người tin nó.
