# Nối Supabase và AI thật vào app

Khi bạn có project Supabase của riêng mình, đây là toàn bộ việc cần làm.
App hiện đang chạy trên project phát triển được ghi mặc định trong
`src/lib/backend.ts`, nên bản clone mới vẫn chạy được mà không cần cấu hình gì.

---

## 1. Trỏ app sang project mới

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

---

## 2. Tạo schema

App đọc và ghi các bảng sau. Kiểu dữ liệu đầy đủ ở
`src/integrations/supabase/types.ts` — đó là file sinh ra từ schema, dùng nó làm
nguồn tham chiếu chính xác.

| Bảng | Dùng cho |
|---|---|
| `profiles` | hồ sơ, mục tiêu, đơn vị đo |
| `daily_logs` | tổng hợp mỗi ngày — **được dựng lại**, không ghi trực tiếp |
| `meal_entries` / `meal_entry_items` | nhật ký ăn uống |
| `food_items` | thư viện món ăn |
| `workout_sessions` | buổi tập |
| `sleep_logs` | giấc ngủ |
| `biometric_samples` | HR / HRV |
| `water_logs` | nước uống |
| `supplements` / `supplement_intake_logs` | thực phẩm bổ sung |
| `weekly_challenges` | thử thách tuần |
| `mascot_inventory` / `mascot_transactions` | kinh tế Koa: đồ và coin |
| `habit_nudges`, `wearable_sources` | nhắc nhở, thiết bị đeo |

**Row-level security phải bật trên tất cả.** App luôn lọc theo
`user_id = auth.uid()`, nên policy tối thiểu là cho phép chủ sở hữu đọc/ghi
dòng của chính mình. Không có RLS thì mọi tài khoản đọc được dữ liệu của nhau.

Hai điểm dễ sai:

- `daily_logs` có ràng buộc `unique(user_id, date)` — `recomputeDailyLog` dùng
  `upsert(..., { onConflict: 'user_id,date' })`. Thiếu ràng buộc này thì mỗi
  lần ghi tạo một dòng mới và số liệu nhân đôi.
- `mascot_transactions.ref_key` phải `unique` theo user. Đó là thứ khiến việc
  nhận thưởng không cộng coin hai lần khi bấm nhanh hai cái.

---

## 3. Deploy 5 edge function

Danh sách nằm trong `EDGE_FUNCTIONS` ở `src/lib/backend.ts` — đó là checklist,
không phải tiện ích:

| Function | Gọi từ | Nếu thiếu |
|---|---|---|
| `ai-meal-suggest` | gợi ý món ăn | nút gợi ý báo "chưa cài trên máy chủ" |
| `scan-food` | chụp ảnh món ăn | màn hình quét báo lý do cụ thể |
| `ai-weekly-review` | tổng kết tuần | nút phân tích báo lý do |
| `ai-smart-nudges` | thẻ gợi ý ở Today | im lặng — đây là phần thưởng thêm |
| `ai-coach` | chat coach (**streaming**) | chat báo lỗi |

`ai-coach` khác bốn cái kia: nó stream nên không đi qua
`supabase.functions.invoke`, mà tự gọi `functionUrl(EDGE_FUNCTIONS.coach)`. Nếu
bạn đổi cách stream thì đó là chỗ duy nhất cần sửa.

Mỗi function cần API key của nhà cung cấp AI đặt trong Supabase secrets. Thiếu
key thì function vẫn tồn tại nhưng trả 5xx, và app sẽ nói **"Dịch vụ AI chưa
trả lời được"** chứ không phải "chưa cài" — hai câu khác nhau vì hai việc phải
làm khác nhau.

---

## 4. Cách app báo lỗi AI

Mọi lời gọi AI đi qua `callAi()` trong `src/lib/ai.ts`, và nó **phân loại** lỗi
thay vì nuốt:

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

---

## 5. Kiểm lại

```bash
node tools/check.mjs
```

Bước `backend` giữ hai luật, và cả hai đều tự kiểm tra trước khi tin vào kết quả
của chính mình:

1. URL project chỉ được xuất hiện trong `src/lib/backend.ts`.
2. `functions.invoke` chỉ được gọi từ `src/lib/ai.ts`.

Luật thứ nhất tồn tại vì URL từng nằm ở hai nơi — đổi project mà quên chỗ thứ
hai thì app đọc ghi ở project mới còn coach vẫn nói chuyện với project cũ, và
không có gì trông như hỏng cả.
