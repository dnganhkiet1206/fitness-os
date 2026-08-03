# Nối Supabase và AI thật vào app

Khi bạn có project Supabase của riêng mình, đây là toàn bộ việc cần làm.
App hiện đang chạy trên project phát triển được ghi mặc định trong
`src/lib/backend.ts`, nên bản clone mới vẫn chạy được mà không cần cấu hình gì.

---

## 1. Trỏ app sang project mới

Có **hai** chỗ ghi địa chỉ project, không phải một. Đổi thiếu một chỗ thì app
đọc ghi ở project mới còn edge function được deploy lên project cũ — và không
có gì trông như hỏng cả.

### 1a. App (`.env`)

```bash
cp .env.example .env
```

Điền hai dòng:

```
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_KEY=<anon / publishable key>
```

Rồi khởi động lại Metro **kèm xoá cache** — Expo nội tuyến biến môi trường vào
bundle lúc build, nên đổi `.env` mà không xoá cache thì bundle cũ vẫn giữ giá
trị cũ:

```bash
npx expo start --clear
```

Tiền tố `EXPO_PUBLIC_` là bắt buộc. Expo chỉ nội tuyến biến có tiền tố đó; đặt
tên thiếu tiền tố thì lúc chạy nó là `undefined` và app **âm thầm** quay về giá
trị mặc định — không có lỗi nào hiện ra.

Anon key được thiết kế để nằm trong client; row-level security mới là thứ kiểm
soát truy cập. Nó không phải bí mật. `.env` vẫn nằm trong `.gitignore` để tránh
lỡ tay commit thứ khác vào đó sau này.

Kiểm tra app đang trỏ đâu:

```ts
import { describeBackend } from '@/lib/backend';
console.log(describeBackend());
// { url, usingConfigured: true, keyPreview, edgeFunctions: [...] }
```

`usingConfigured: false` nghĩa là `.env` chưa được đọc — gần như luôn là do
thiếu tiền tố hoặc chưa `--clear`.

### 1b. Supabase CLI (`supabase/config.toml`)

Dòng đầu file là `project_id = "drqgonxrtmomgrftelih"` — ref của project phát
triển. `supabase db push` và `supabase functions deploy` đi theo project đang
được **link**, không theo `.env` của app. Đổi dòng đó rồi link lại:

```bash
supabase link --project-ref <project-ref mới>
```

Bỏ qua bước này là cách chắc chắn nhất để migration và function của bạn hạ cánh
xuống project cũ trong khi app nói chuyện với project mới.

---

## 2. Tạo schema

`supabase/migrations/` đã có **18 file SQL** dựng sẵn toàn bộ schema (16 file
`<timestamp>_<uuid>.sql` do Lovable sinh ra, cộng `mascot_economy` và
`ai_usage_quota` viết tay). Sau khi link đúng project ở bước 1b:

```bash
supabase db push
```

Đó là con đường đúng. Danh sách dưới đây để **đối chiếu** — nếu dựng schema
bằng tay thì thiếu một bảng là mất nguyên một màn hình. Kiểu dữ liệu đầy đủ ở
`src/integrations/supabase/types.ts`.

App gọi thẳng 28 bảng (đếm bằng `grep -rhoE "\.from\(\s*'[a-z_]+'" src/`):

| Bảng | Dùng cho |
|---|---|
| `profiles` | hồ sơ, mục tiêu, đơn vị đo |
| `daily_logs` | tổng hợp mỗi ngày — **được dựng lại**, không ghi trực tiếp |
| `meal_entries` / `meal_entry_items` | nhật ký ăn uống |
| `food_items` | thư viện món ăn |
| `meal_plans` / `meal_plan_items` | kế hoạch bữa ăn |
| `grocery_items` | danh sách đi chợ |
| `workout_sessions` | buổi tập |
| `workout_templates` / `routine_days` | giáo án và lịch tập |
| `exercises` | thư viện động tác |
| `sleep_logs` | giấc ngủ |
| `biometric_samples` | HR / HRV |
| `water_logs` | nước uống |
| `weight_logs` | cân nặng — **cả tab Tiến độ chạy trên bảng này** |
| `body_measurements` | số đo vòng |
| `progress_photos` | ảnh tiến độ (chỉ giữ **đường dẫn**, xem §2b) |
| `supplements` / `supplement_intake_logs` | thực phẩm bổ sung |
| `weekly_challenges` | thử thách tuần |
| `awards` | huy hiệu |
| `mascot_inventory` / `mascot_transactions` | kinh tế Koa: đồ và coin |
| `ai_conversations` / `ai_messages` | lịch sử chat coach |
| `habit_nudges`, `wearable_sources` | nhắc nhở, thiết bị đeo |

Ngoài ra edge function cần thêm hai thứ app không đụng tới:

- Bảng `ai_usage` và hàm `public.claim_ai_call(p_kind)` — hạn mức AI theo ngày
  (`20260729120000_ai_usage_quota.sql`). `claimCall` trong
  `supabase/functions/_shared/guard.ts` **fail open**: thiếu hàm này thì AI vẫn
  chạy, chỉ là không còn trần chi phí, và không có lỗi nào hiện ra.
- `scan_history` — có trong schema, app native không đọc.

**Row-level security phải bật trên tất cả.** App luôn lọc theo
`user_id = auth.uid()`, nên policy tối thiểu là cho phép chủ sở hữu đọc/ghi
dòng của chính mình. Không có RLS thì mọi tài khoản đọc được dữ liệu của nhau.

Hai điểm dễ sai:

- `daily_logs` có ràng buộc `unique(user_id, date)` — `recomputeDailyLog` dùng
  `upsert(..., { onConflict: 'user_id,date' })`. Thiếu ràng buộc này thì mỗi
  lần ghi tạo một dòng mới và số liệu nhân đôi.
- `mascot_transactions.ref_key` phải `unique` theo user. Đó là thứ khiến việc
  nhận thưởng không cộng coin hai lần khi bấm nhanh hai cái.
- `weight_logs` cần `unique(user_id, date)`. `useLogWeight` upsert theo cặp đó,
  và `useDeleteWeight` xoá theo cặp đó. Thiếu ràng buộc thì mỗi lần cân tạo một
  dòng mới và biểu đồ có nhiều điểm trùng ngày.

### 2b. Ảnh tiến độ nằm ở Storage, không nằm ở bảng

`progress_photos.photo_url` chỉ giữ **đường dẫn**; file thật nằm trong bucket
`progress-photos`, đặt tên `<user_id>/<ngày>-<pose>-<timestamp>.jpg`
(`src/hooks/use-progress-photos.ts:70`). Bucket được tạo trong
`20260212045102_….sql:60` là `public = true` rồi bị chuyển thành private ở
`20260212183020_….sql` — nên một lần `db reset` có đi qua trạng thái công khai.

Hệ quả quan trọng nhất: **object trong Storage không phải là dòng trong bảng,
nên `ON DELETE CASCADE` không đụng tới chúng.** Xem §3.

---

## 3. Edge function — 5 cái đã có sẵn, 1 cái phải viết

Mã nguồn của năm function AI **đã nằm trong repo** ở `supabase/functions/`, nên
với chúng đây chỉ là việc deploy chứ không phải việc viết:

```bash
supabase functions deploy ai-coach ai-meal-suggest ai-smart-nudges ai-weekly-review scan-food
```

Deploy `db push` **trước** khi deploy function, để hạn mức có hiệu lực ngay từ
request đầu tiên thay vì fail open trong một khoảng. Chi tiết và cách kiểm lại
sau khi deploy: `docs/PRE_RELEASE.md`, mục "Deploying the fixes".

`delete-account` **chưa tồn tại** — không có thư mục trong `supabase/functions/`
và không có mục trong `config.toml`. Đó là thứ duy nhất trong mục này phải viết
mới.

Danh sách đầy đủ nằm trong `EDGE_FUNCTIONS` ở `src/lib/backend.ts` — đó là
checklist, không phải tiện ích:

| Function | Gọi từ | Nếu thiếu |
|---|---|---|
| `ai-meal-suggest` | gợi ý món ăn | nút gợi ý báo "chưa cài trên máy chủ" |
| `scan-food` | chụp ảnh món ăn | màn hình quét báo lý do cụ thể |
| `ai-weekly-review` | tổng kết tuần | nút phân tích báo lý do |
| `ai-smart-nudges` | thẻ gợi ý ở Today | im lặng — đây là phần thưởng thêm |
| `ai-coach` | chat coach (**streaming**) | chat báo lỗi |
| `delete-account` | nút Xoá tài khoản ở Cài đặt | app báo "máy chủ chưa bật chức năng này" |

### `delete-account` — bắt buộc để lên App Store

Đây là function **duy nhất không phải AI** trong danh sách, và là function
**không được bỏ qua**: App Store Review Guideline 5.1.1(v) yêu cầu mọi app cho
tạo tài khoản phải cho xoá tài khoản ngay trong app.
*(Nguồn: nhớ lại, chưa mở lại trang guideline để đối chiếu — hãy kiểm tra bản
mới nhất tại https://developer.apple.com/app-store/review/guidelines/ trước khi
nộp. Việc app có nút xoá tài khoản thì đằng nào cũng đúng, vì chính sách quyền
riêng tư của app đã hứa điều đó.)*

Client không thể tự xoá vì `auth.admin.deleteUser` cần service role key — thứ
không bao giờ được nằm trong app. Function cần:

1. Đọc user từ JWT trong header `Authorization` (đừng nhận id từ body — ai cũng
   gửi được id của người khác). `requireUser` trong
   `supabase/functions/_shared/guard.ts` làm sẵn việc này và đã chặn đúng trường
   hợp anon key — dùng lại nó, đừng viết lại.
2. **Xoá file trong Storage trước.** `deleteUser` xoá dòng trong bảng qua khoá
   ngoại; object trong bucket không phải dòng trong bảng nên không cascade theo.
   Bỏ bước này thì ảnh tiến độ của người đã xoá tài khoản vẫn nằm nguyên trong
   `progress-photos`, và vẫn bị tính tiền lưu trữ:

   ```ts
   const { data } = await admin.storage.from('progress-photos').list(userId);
   if (data?.length) {
     await admin.storage.from('progress-photos')
       .remove(data.map((f) => `${userId}/${f.name}`));
   }
   ```

3. `supabase.auth.admin.deleteUser(userId)` bằng service role key. **Không cần
   xoá tay từng bảng.** Cả 31 bảng trong `supabase/migrations/` đều có đường
   cascade về `auth.users`: 27 bảng trỏ thẳng (17 khai báo inline trong
   `CREATE TABLE`, 10 khai báo bằng `ALTER TABLE … ADD CONSTRAINT`), và 4 bảng
   con đi qua bảng cha — `ai_messages`→`ai_conversations`,
   `meal_entry_items`→`meal_entries`, `meal_plan_items`→`meal_plans`,
   `routine_days`→`workout_templates`. Danh sách xoá tay chính là thứ sẽ mục
   ruỗng: thêm bảng mới mà quên thêm vào danh sách thì dữ liệu ở lại, im lặng.

   Một chỗ cần thử trên project thật: `meal_plan_items.food_id` trỏ tới
   `food_items(id)` **không khai báo `ON DELETE`** nên nhận mặc định `NO ACTION`,
   trong khi cả hai bảng đều bị cascade trong cùng một lệnh. Tôi không kiểm
   chứng được thứ tự Postgres xử lý ở đây nên không khẳng định nó chạy hay
   không — chỉ cần bước 4 đọc lỗi thật thay vì giả định thành công, thì trường
   hợp xấu nhất là một câu báo lỗi rõ ràng chứ không phải xoá nửa vời.

4. Trả 2xx **chỉ khi mọi bước trên không lỗi**. App chỉ đăng xuất và xoá cache
   khi nhận được 2xx; mọi trường hợp khác app nói rõ **chưa có gì bị xoá**, nên
   một function trả 200 sau khi thất bại giữa chừng sẽ biến câu đó thành lời nói
   dối.

App phân biệt được **chưa deploy** (404) với **chạy rồi hỏng** (5xx) và nói hai
câu khác nhau — vì hai câu đó dẫn tới hai việc phải làm khác nhau. Khi hỏng, app
nói rõ **chưa có gì bị xoá**; nói "đã xoá" khi chưa xoá là lời nói dối tệ nhất
có thể trên đúng màn hình này.

`ai-coach` khác bốn cái kia: nó stream nên không đi qua
`supabase.functions.invoke`, mà tự gọi `functionUrl(EDGE_FUNCTIONS.coach)`. Nếu
bạn đổi cách stream thì đó là chỗ duy nhất cần sửa.

Mỗi function cần API key của nhà cung cấp AI đặt trong Supabase secrets. Thiếu
key thì function vẫn tồn tại nhưng trả 5xx, và app sẽ nói **"Dịch vụ AI chưa
trả lời được"** chứ không phải "chưa cài" — hai câu khác nhau vì hai việc phải
làm khác nhau.

---

## 4. Cách app báo lỗi khi gọi edge function

Mọi lời gọi edge function đi qua `callEdge()` trong `src/lib/edge.ts`, và nó
**phân loại** lỗi thay vì nuốt:

| Kết quả | Nghĩa là | Việc cần làm |
|---|---|---|
| `not-deployed` (404) | project chưa có function tên đó | deploy nó |
| `provider-error` (5xx) | function chạy và hỏng | kiểm tra API key trong secrets |
| `unauthorised` (401/403) | chưa đăng nhập / hết hạn phiên | kiểm tra auth |
| `offline` | request không tới nơi | mạng |
| `unknown` | về nhưng không hiểu | đọc `raw` trong kết quả |

Trước đây tất cả đều hiện chung một câu "Không thể lấy gợi ý", nên lúc nối
project mới sẽ không biết đang thiếu gì. Trường `raw` giữ lại nguyên văn lỗi —
không hiện cho người dùng, nhưng là thứ cần dán vào báo lỗi.

Phần phân loại nằm riêng ở `src/lib/edge-failure.ts` — không import gì cả — nên
`tools/edge-failure.mjs` biên dịch và chạy **hàm thật** với 13 mã lỗi. Trước đó
nó nằm cạnh Supabase client, thứ kéo theo React Native và không chạy được trong
Node, nên chỉ kiểm được bằng cách đọc.

---

## 5. Kiểm lại

```bash
node tools/check.mjs
```

Bước `backend` giữ hai luật, và cả hai đều tự kiểm tra trước khi tin vào kết quả
của chính mình:

1. URL project chỉ được xuất hiện trong `src/lib/backend.ts`.
2. `functions.invoke` chỉ được gọi từ `src/lib/edge.ts`.

Luật thứ nhất tồn tại vì URL từng nằm ở hai nơi — đổi project mà quên chỗ thứ
hai thì app đọc ghi ở project mới còn coach vẫn nói chuyện với project cũ, và
không có gì trông như hỏng cả.
