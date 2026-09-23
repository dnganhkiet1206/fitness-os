# Media hướng dẫn: đưa một bộ ảnh vào một bài tập

Trang này là thứ cần đọc khi có bốn tấm ảnh trong tay và muốn chúng hiện ra
trong màn hướng dẫn. Nó mô tả **cơ chế đang có**, không mô tả một kế hoạch.

Cơ chế đã xong và đã kiểm; thứ còn thiếu là **các tệp**.

---

## Ảnh KHÔNG được mang chữ

Đây là luật đầu tiên vì nó là luật không sửa lại được.

App chạy hai thứ tiếng. Một tấm ảnh có chữ tiếng Anh nướng vào pixel chỉ dùng
được cho một nửa người dùng, và cách duy nhất để sửa là **vẽ lại nó**. Nên ảnh
nói bằng:

- giải phẫu, tư thế, hướng chuyển động
- mũi tên, đường căn chỉnh
- vùng cơ được tô sáng
- dấu ✓ / ✗

còn mọi câu chữ — số bước, tiêu đề, mô tả, nhãn trợ năng — đến từ bảng
`exercise_media_content` và đổi theo ngôn ngữ mà **không đụng một byte nào của
tấm ảnh**.

`tools/exercise-media.mjs` canh đúng tính chất ấy bằng cách chạy thật: đổi
`vi ↔ en` phải đổi tiêu đề, mô tả và nhãn trợ năng trong khi `uri` không đổi
một ký tự.

---

## Ba bảng, và mỗi bảng trả lời một câu

| bảng | câu hỏi | khoá |
|---|---|---|
| `exercises` | bài tập ấy LÀ gì | danh tính |
| `exercise_media` | có những tấm nào, thứ tự nào | `UNIQUE (exercise_id, position)` |
| `exercise_media_content` | mỗi tấm NÓI gì, ở tiếng nào | `UNIQUE (media_id, locale)` |

`position` là cơ chế thứ tự **duy nhất**. Không khớp chú thích theo chỉ số của
một mảng nào khác: làm thế là dựng một cơ chế thứ hai, ngầm, và nó lệch im lặng
ngay khi một trong hai danh sách đổi độ dài.

---

## Bước 1 — upload lên bucket

Bucket: **`exercise-media`**, công khai đọc, trần 5 MiB, chỉ nhận
`image/webp`, `image/jpeg`, `image/png`.
Nó được tạo bởi `supabase/migrations/20260924120000_exercise_media_bucket.sql`.

Đường dẫn theo khuôn `{khoá-bài-tập}/{thứ tự}-{vai}.webp`:

```
exercise-media/dumbbell-curl/01-hero.webp
exercise-media/dumbbell-curl/02-movement.webp
exercise-media/dumbbell-curl/03-technique.webp
exercise-media/dumbbell-curl/04-mistakes.webp
```

Tên tệp là để **người** tìm lại được tấm nào là tấm nào. Mã không bao giờ đọc
nó: kiểu nằm ở cột `kind`, thứ tự nằm ở cột `position`, và nhãn trợ năng đến từ
chú thích. Đổi tên tệp không đổi hành vi nào.

```bash
supabase storage cp ./01-hero.webp ss:///exercise-media/dumbbell-curl/01-hero.webp
```

URL công khai sau đó là:

```
{SUPABASE_URL}/storage/v1/object/public/exercise-media/dumbbell-curl/01-hero.webp
```

## Bước 2 — bốn hàng media + tám hàng chú thích

Một migration, và nó **tra bài tập theo tên chứ không gõ một UUID**: hạt giống
chèn bằng `gen_random_uuid()`, nên không project nào có cùng id với project
khác, và một UUID viết cứng sẽ đúng trên đúng một máy.

```sql
-- hai hằng của lượt chạy này
\set base 'https://<ref>.supabase.co/storage/v1/object/public/exercise-media/dumbbell-curl'

WITH ex AS (
  SELECT id FROM public.exercises
   WHERE lower(trim(name)) = 'dumbbell curl' AND user_id IS NULL
   LIMIT 1
), ins AS (
  INSERT INTO public.exercise_media (exercise_id, kind, uri, position)
  SELECT ex.id, 'image', v.uri, v.pos
    FROM ex, (VALUES
      (0, :'base' || '/01-hero.webp'),
      (1, :'base' || '/02-movement.webp'),
      (2, :'base' || '/03-technique.webp'),
      (3, :'base' || '/04-mistakes.webp')
    ) AS v(pos, uri)
  ON CONFLICT (exercise_id, position) DO NOTHING
  RETURNING id, position
)
INSERT INTO public.exercise_media_content (media_id, locale, title, description)
SELECT ins.id, c.locale, c.title, c.body
  FROM ins JOIN (VALUES
    (0, 'vi', 'Tư thế bắt đầu',
        'Đứng thẳng, hai chân rộng bằng vai. Giữ tạ hai bên thân, lòng bàn tay hướng về trước và khuỷu tay gần thân.'),
    (0, 'en', 'Starting position',
        'Stand tall with your feet about shoulder-width apart. Hold the dumbbells at your sides with your palms facing forward and elbows close to your body.'),
    (1, 'vi', 'Cuộn tạ lên',
        'Giữ khuỷu tay cố định và cuộn tạ lên bằng cách gập khuỷu tay. Không dùng thân người để tạo đà.'),
    (1, 'en', 'Curl the dumbbells',
        'Keep your elbows stable and curl the dumbbells by bending your elbows. Do not use your body to create momentum.'),
    (2, 'vi', 'Giữ khuỷu tay cố định',
        'Khuỷu tay nên duy trì gần thân và không trượt ra trước khi cuộn tạ.'),
    (2, 'en', 'Keep your elbows stable',
        'Keep your elbows close to your body instead of allowing them to drift forward during the curl.'),
    (3, 'vi', 'Các lỗi thường gặp',
        'Tránh đung đưa thân người, đưa khuỷu tay ra trước hoặc thả tạ quá nhanh.'),
    (3, 'en', 'Common mistakes',
        'Avoid swinging your body, letting the elbows drift forward, or dropping the weights too quickly.')
  ) AS c(pos, locale, title, body) ON c.pos = ins.position
ON CONFLICT (media_id, locale) DO NOTHING;
```

## Bước 3 — ba lỗi thường gặp, dạng chữ

Ba lỗi mà tấm `04-mistakes` vẽ ra thuộc về `exercise_guide_content.common_mistakes`
— cột đã có, một dòng cho mỗi (bài tập, ngôn ngữ). Không dựng bảng mới cho
chúng: chúng là **câu chữ của bài tập**, không phải chú thích của một tấm ảnh.

```sql
UPDATE public.exercise_guide_content c
   SET common_mistakes = CASE c.locale
     WHEN 'vi' THEN ARRAY[
       'Đung đưa thân người — không ngả người hoặc dùng hông để tạo đà nâng tạ.',
       'Đưa khuỷu tay ra trước — giữ khuỷu tay ổn định thay vì để khuỷu tay di chuyển về phía trước.',
       'Thả tạ quá nhanh — hạ tạ có kiểm soát thay vì để trọng lượng rơi tự do.']
     ELSE ARRAY[
       'Swinging the body — do not lean back or use your hips to create momentum.',
       'Elbows drifting forward — keep the elbows stable instead of allowing them to move forward.',
       'Dropping the weight — lower the dumbbells under control instead of letting gravity pull them down.']
   END
  FROM public.exercises e
 WHERE e.id = c.exercise_id
   AND lower(trim(e.name)) = 'dumbbell curl'
   AND e.user_id IS NULL;
```

**Đúng ba lỗi này, không thêm.** Mỗi câu phải là thứ tấm ảnh thật sự vẽ ra; một
lỗi thứ tư viết thêm cho đủ là một khẳng định về cơ thể người khác mà không có
căn cứ, và không ai kiểm được nó sau đó.

---

## Vì sao repo chưa có hàng nào

`exercise_media` và `exercise_media_content` đều **rỗng**, cùng một lý do mà
`exercise_guide_content` từng rỗng: bịa ra một URL để màn hình trông đầy đủ là
đặt một khẳng định sai vào sản phẩm. Hàng media tới cùng tệp, không trước.

Trong lúc chờ, màn hướng dẫn vẫn dựng được bố cục nhờ `DEMO_HERO` — một ảnh
minh hoạ tạm, có nhãn trợ năng nói thẳng rằng nó là ảnh tạm, và **không** sinh
ra nút mở, chấm trang hay thời lượng, vì mô hình media nói rằng bài ấy chưa có
media.

## Kiểm lại sau khi đã đổ dữ liệu

```
node tools/exercise-media.mjs     # mô hình + chú thích, chạy thật
node tools/exercise-guide.mjs     # chữ không được nằm trong component
node tools/check.mjs              # toàn bộ cổng
```

Và một lượt mở màn bằng mắt: đổi ngôn ngữ trong Cài đặt phải đổi tiêu đề, mô tả
và nhãn VoiceOver của từng bước, trong khi bốn tấm ảnh **không đổi**.
