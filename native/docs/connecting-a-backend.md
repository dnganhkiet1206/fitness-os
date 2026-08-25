# Nối Supabase và AI thật vào app

Khi bạn có project Supabase của riêng mình, đây là toàn bộ việc cần làm.
App hiện đang chạy trên project phát triển được ghi mặc định trong
`src/lib/backend.ts`, nên bản clone mới vẫn chạy được mà không cần cấu hình gì.

---

# 0. Chạy local để test — làm trước mục 1

Mục 1 đến 4 nói về việc nối app vào một project **trên cloud**. Nhưng để *test*
thì chạy toàn bộ Supabase ngay trên máy là đường tốt hơn, và nó không đụng gì tới
cloud: `supabase start` dựng Postgres, Auth, Storage, Studio bằng Docker, còn
`supabase db reset` áp lại toàn bộ 32 migration từ đầu trong vài giây. Phá thoải
mái, không mất dữ liệu thật, không tốn tiền.

## 0a. Cài Docker và CLI

Supabase local chạy trong Docker, nên cần một container runtime trước —
Docker Desktop, hoặc OrbStack / colima / Podman / Rancher Desktop nếu bạn quen
cái khác.

CLI có hai kiểu cài, và **kiểu cài quyết định lệnh bạn gõ**:

```bash
# Cách A — cài vào chính repo này (khuyến nghị: cả nhóm dùng đúng một phiên bản)
cd native && npm install supabase --save-dev
# rồi gõ:  npx supabase <lệnh>

# Cách B — cài toàn máy
brew install supabase/tap/supabase        # macOS
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git && scoop install supabase   # Windows
# rồi gõ:  supabase <lệnh>
```

Cách A cần Node 20 trở lên. Dưới đây viết `supabase <lệnh>`; nếu bạn chọn cách A
thì đọc thành `npx supabase <lệnh>`.

**Không chạy `supabase init`.** Lệnh đó tạo `supabase/` và `config.toml` mới —
repo này đã có cả hai, và `init` sẽ ghi đè `project_id` cùng chín mục
`verify_jwt = false` đang giữ cho các function gọi được.

## 0b. Khởi động

Chạy từ **thư mục gốc của repo** (chỗ có thư mục `supabase/`), không phải từ
`native/`:

```bash
cd /đường/dẫn/fitness-os
supabase start
```

Lần đầu sẽ lâu vì phải tải Docker image. Xong, nó in ra bảng địa chỉ và khoá:

```
Project URL     http://127.0.0.1:54321
Studio          http://127.0.0.1:54323
Mailpit         http://127.0.0.1:54324
anon key        eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

`supabase start` **cũng áp luôn migration** cho database mới. Muốn dựng lại
sạch từ đầu bất cứ lúc nào:

```bash
supabase db reset
```

Đây là lệnh đáng giá nhất khi test: nó xoá database local, chạy lại cả 32
migration theo thứ tự, nên nó cũng là cách duy nhất kiểm được rằng bộ migration
của bạn **thật sự dựng được từ số không** — thứ `db push` lên cloud không bao
giờ kiểm, vì cloud chỉ chạy các file mới.

## 0c. Trỏ app sang local

```bash
cd native
cp .env.example .env
```

Sửa `.env` thành:

```
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_KEY=<anon key mà supabase start in ra>
```

Rồi:

```bash
npx expo start --clear
```

`--clear` là bắt buộc. Expo nội tuyến biến môi trường vào bundle lúc build, nên
đổi `.env` mà giữ cache thì bundle cũ vẫn trỏ về chỗ cũ — xem §1a.

## 0d. `127.0.0.1` chỉ đúng với máy ảo, không đúng với điện thoại thật

Đây là chỗ mất thời gian nhất và nó không báo lỗi gì rõ ràng — app chỉ treo ở
màn đăng nhập.

| Chạy trên | Điền gì vào `EXPO_PUBLIC_SUPABASE_URL` |
|---|---|
| iOS Simulator | `http://127.0.0.1:54321` |
| Web (`npx expo start --web`) | `http://127.0.0.1:54321` |
| Android emulator | `http://10.0.2.2:54321` — emulator ánh xạ địa chỉ này về máy chủ |
| **Điện thoại thật** | `http://<IP LAN của máy>:54321`, cùng Wi-Fi |

Với điện thoại thật còn một rào nữa: `app.json` **không** khai
`NSAppTransportSecurity`, nên một bản dựng iOS thật sẽ chặn `http://` tới IP
LAN. Trong Expo Go thì thường qua được, trong bản dev build của chính app thì
không, và tôi không kiểm được điều đó từ đây.

**Nên: test local trên Simulator / emulator / web, và test trên điện thoại thật
bằng project cloud ở mục 1.** Đó là lý do mục 1 vẫn cần thiết chứ không phải
chỉ để lên production.

## 0e. Đăng ký tài khoản test

Supabase local **không gửi email thật**. Mọi email đi vào Mailpit ở
`http://127.0.0.1:54324` — mở đó để bấm link xác thực.

Studio ở `http://127.0.0.1:54323` là chỗ nhìn thẳng vào bảng: đăng nhập xong,
ghi một buổi tập trong app rồi mở `workout_sessions` trong Studio là thấy ngay
dòng vừa ghi, kèm cột `sets` dạng JSON.

## 0f. Chín edge function — chưa cần cho việc test

Function chạy local được bằng `supabase functions serve`, nhưng **sáu function
AI đều gọi `https://ai.gateway.lovable.dev`** và cần `LOVABLE_API_KEY`. Không có
key thì chúng deploy được và trả 5xx.

Không deploy chúng cũng không sao: `src/lib/edge.ts` phân biệt **chưa deploy**
(404) với **chạy rồi hỏng** (5xx) và nói hai câu khác nhau, nên app báo đúng
"chưa cài trên máy chủ" ở đúng bốn nút AI thay vì vỡ. Mọi thứ còn lại — đăng
nhập, ghi buổi tập, dinh dưỡng, giấc ngủ, cân nặng, Trí tuệ bài tập, Koa, kinh
tế coin — không đụng tới edge function nào.

Ba function không phải AI (`verify-purchase`, `store-webhook`,
`delete-account`) không cần key AI, nhưng `verify-purchase` và `store-webhook`
cần bộ khoá App Store, và `delete-account` chỉ có ý nghĩa khi bạn muốn thử nút
xoá tài khoản.

## 0g. Chuyển qua lại giữa local và cloud

Chỉ là hai dòng trong `.env`. Giữ sẵn hai file và đổi chỗ khi cần:

```bash
cd native
cp .env .env.local-supabase     # bản trỏ về 127.0.0.1
cp .env .env.cloud              # bản trỏ về <ref>.supabase.co

cp .env.local-supabase .env && npx expo start --clear    # test local
cp .env.cloud .env             && npx expo start --clear # chạy thật
```

`.gitignore` đã bỏ qua `.env` và `.env*.local`, nhưng **không** bỏ qua
`.env.cloud` — đặt tên là `.env.cloud.local` nếu bạn không muốn nó vào git.

Kiểm app đang trỏ đâu bất cứ lúc nào:

```ts
import { describeBackend } from '@/lib/backend';
console.log(describeBackend());
```

`usingConfigured: false` nghĩa là `.env` chưa được đọc — gần như luôn là thiếu
tiền tố `EXPO_PUBLIC_` hoặc quên `--clear`.

## 0h. Dừng lại

```bash
supabase stop              # giữ dữ liệu local
supabase stop --no-backup  # xoá luôn
```

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

### 1c. "Tôi không thấy project của mình trong Supabase"

Triệu chứng: bên Lovable vẫn thấy dữ liệu, nhưng đăng nhập supabase.com thì
dashboard trống.

**Dữ liệu gần như chắc chắn không mất.** Project mặc định trong repo này —
`drqgonxrtmomgrftelih`, ghi ở `src/lib/backend.ts` và `supabase/config.toml` —
kiểm ngày 2026-08-23 vẫn đang phục vụ: `/auth/v1/health` trả 200 và
`/rest/v1/exercises` trả về đúng bộ seed. App đang chạy được là bằng chứng thứ
hai cho cùng điều đó. Vấn đề là **nhìn thấy**, không phải mất.

#### Phép thử dứt khoát

```bash
npx supabase login
npx supabase projects list
```

`projects list` liệt kê *mọi project mà tài khoản đang đăng nhập truy cập
được*. Tìm ref `drqgonxrtmomgrftelih` trong cột REFERENCE ID.

**Có trong danh sách** → project thuộc tài khoản này, bạn chỉ đang nhìn nhầm
**organization**. Dashboard nhóm project theo organization, và một tài khoản
vừa tạo có một organization mặc định mới toanh không chứa project cũ. Đổi
organization ở ô chọn góc trên bên trái, hoặc mở thẳng:

```
https://supabase.com/dashboard/project/drqgonxrtmomgrftelih
```

**Không có trong danh sách** → project không nằm trong tài khoản này. Hai khả
năng, và chúng dẫn tới hai việc khác nhau:

- **Tài khoản Supabase khác.** Lovable nối bằng tài khoản nào thì project nằm ở
  tài khoản đó. Nếu bạn vừa đăng ký bằng một email khác thì đây là câu trả lời.
  Đăng nhập lại bằng đúng email cũ, hoặc mời email mới vào organization cũ.
- **Backend do Lovable tự quản.** Khi project được Lovable cấp phát trong hạ
  tầng của họ thay vì trong tài khoản Supabase của bạn, nó **không bao giờ** xuất
  hiện ở dashboard của bạn — không có thao tác nào ở phía Supabase làm nó hiện
  ra. Phải lấy quyền từ phía Lovable.

Cách phân biệt hai khả năng: xem phần thiết lập backend trong chính project
Lovable. Nếu ở đó có ref project và bạn mở được nó trên supabase.com sau khi
đăng nhập đúng email → khả năng thứ nhất. Nếu không có chỗ nào cho bạn một ref
để mở → khả năng thứ hai.

#### Nếu phải làm lại project mới

Với app đang trong giai đoạn test, đây thường là đường nhanh nhất — dữ liệu
đang có phần lớn là dữ liệu thử:

```bash
npx supabase link --project-ref <ref mới>
npx supabase db push
```

Rồi đổi `project_id` ở dòng đầu `supabase/config.toml` và hai dòng trong
`.env` (§1a). Đăng ký lại tài khoản trong app là xong — 32 migration dựng lại
toàn bộ schema, kể cả bộ bài tập seed.

#### Nếu cần mang dữ liệu cũ sang

Cần **chuỗi kết nối Postgres** hoặc **service role key** của project cũ. Anon
key nằm trong repo không đủ: nó chỉ đọc được đúng những dòng RLS cho phép, tức
dữ liệu của chính tài khoản bạn sau khi đăng nhập, và không đọc được gì khác.

Có chuỗi kết nối rồi:

```bash
npx supabase db dump --db-url '<chuỗi kết nối project cũ>' --data-only -f data.sql
```

Hai điều phải biết trước khi làm:

- `db dump` **loại trừ schema `auth` và `storage`**. Tài khoản đăng nhập và file
  trong bucket **không** đi theo. Người dùng sẽ phải đăng ký lại, và ảnh tiến độ
  phải chép riêng.
- Khôi phục vào project mới thì bảng nhận quyền mặc định của project đích. Tài
  liệu Supabase khuyến nghị chạy trước khi restore:

  ```sql
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
  ```

Vì `auth` không đi theo, `user_id` trong dữ liệu cũ sẽ trỏ tới những user không
tồn tại ở project mới. Với một tài khoản test thì cách gọn nhất là: đăng ký lại
ở project mới, lấy `id` mới, rồi thay `user_id` trong file dump trước khi nạp.

---

## 2. Tạo schema

`supabase/migrations/` đã có **33 file SQL** dựng sẵn toàn bộ schema (16 file
`<timestamp>_<uuid>.sql` do Lovable sinh ra, phần còn lại viết tay). Sau khi
link đúng project ở bước 1b:

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

## 3. Edge function — cả 9 cái đã có sẵn

Mã nguồn của **cả chín** function đã nằm trong repo ở `supabase/functions/`,
nên đây chỉ là việc deploy chứ không phải việc viết:

```bash
supabase functions deploy ai-coach ai-coach-memory ai-meal-suggest \
  ai-smart-nudges ai-weekly-review scan-food \
  verify-purchase store-webhook delete-account
```

Deploy `db push` **trước** khi deploy function, để hạn mức có hiệu lực ngay từ
request đầu tiên thay vì fail open trong một khoảng. Chi tiết và cách kiểm lại
sau khi deploy: `docs/PRE_RELEASE.md`, mục "Deploying the fixes".

`delete-account` **đã được viết** — thư mục có trong `supabase/functions/` và
mục `verify_jwt = false` có trong `config.toml`. Câu trước đó ở chỗ này nói nó
chưa tồn tại; đúng vào lúc doc được viết, sai kể từ khi function được thêm vào.
`tools/deployable.mjs` canh phần này, và phần §3 dưới đây vẫn giữ nguyên vì nó
mô tả function đó PHẢI làm gì — thứ vẫn cần đọc trước khi sửa nó.

Danh sách đầy đủ nằm trong `EDGE_FUNCTIONS` ở `src/lib/backend.ts` — đó là
checklist, không phải tiện ích:

| Function | Gọi từ | Nếu thiếu |
|---|---|---|
| `ai-meal-suggest` | gợi ý món ăn | nút gợi ý báo "chưa cài trên máy chủ" |
| `scan-food` | chụp ảnh món ăn | màn hình quét báo lý do cụ thể |
| `ai-weekly-review` | tổng kết tuần | nút phân tích báo lý do |
| `ai-smart-nudges` | thẻ gợi ý ở Today | im lặng — đây là phần thưởng thêm |
| `ai-coach` | chat coach (**streaming**) | chat báo lỗi |
| `ai-coach-memory` | trích trí nhớ coach | coach quên giữa các phiên |
| `verify-purchase` | sau giao dịch StoreKit | mua xong không mở khoá |
| `store-webhook` | Apple gọi vào | gia hạn/huỷ không phản ánh vào app |
| `delete-account` | nút Xoá tài khoản ở Cài đặt | app báo "máy chủ chưa bật chức năng này" |

### `delete-account` — bắt buộc để lên App Store

Đây là function **duy nhất không phải AI** trong danh sách, và là function
**không được bỏ qua**. App Store Review Guideline **5.1.1(v) — Account
Sign-In**, đọc từ https://developer.apple.com/app-store/review/guidelines/
ngày 2026-08-03, nguyên văn:

> If your app supports account creation, you must also offer account deletion
> within the app.

Không phải góp ý, là điều kiện. Chính sách quyền riêng tư của app cũng đã hứa
điều này.

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

   **Cần `20260803120000_meal_plan_item_food_fk.sql` đã được `db push`.** Trước
   migration đó, `meal_plan_items.food_item_id` trỏ tới `food_items(id)` không
   khai `ON DELETE` nên nhận mặc định `NO ACTION`, và
   `DELETE FROM auth.users` **hỏng hẳn** với SQLSTATE 23503 cho bất kỳ ai từng
   thêm một món vào kế hoạch bữa ăn. Dựng lại đúng DDL trong `supabase/migrations/`
   trên PostgreSQL 16.13 để kiểm: trước migration cả hai lệnh xoá đều lỗi, sau
   migration cả hai đều xong sạch.

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
