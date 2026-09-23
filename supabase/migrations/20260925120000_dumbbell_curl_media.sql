-- Bộ media đầu tiên: bốn tấm minh hoạ của Dumbbell Curl, và chữ của chúng.
--
-- ── vì sao migration này ra đời BÂY GIỜ chứ không cùng hai bảng kia ──
--
-- `20260924120000` dựng bucket và `20260924130000` dựng bảng chú thích, cả hai
-- RỖNG, có chủ ý: lúc ấy chưa có tệp ảnh nào, và bốn hàng trỏ vào URL chưa có
-- nội dung là đặt một khẳng định sai vào sản phẩm. Bốn tệp nay đã có, nên bốn
-- hàng nay là sự thật.
--
-- CHẠY SAU KHI UPLOAD. Nếu chạy trước, bốn URL trả 404 và màn hướng dẫn nói
-- "không tải được hình minh hoạ" — một câu ĐÚNG (có URL, máy không lấy được),
-- nhưng không phải thứ ai muốn thấy.
--
-- ── vì sao tra theo TÊN chứ không gõ một UUID ──
--
-- Hạt giống chèn bằng `gen_random_uuid()` (`20260212040248_…sql:358` không có
-- cột `id`), nên id của Dumbbell Curl KHÁC NHAU ở mỗi project. Một UUID viết
-- cứng đúng trên đúng một máy và im lặng chèn 0 hàng ở mọi máy khác.
--
-- `user_id IS NULL` là nghĩa của "dòng dùng chung" — xem policy trên
-- `exercises`. Bản mà một người dùng tự tạo trùng tên KHÔNG bị đụng tới.
--
-- ── vì sao URL tuyệt đối, và cái giá của nó ──
--
-- `exercise_media.uri` được tiêu thụ thẳng bằng `<Image source={{ uri }}>`, nên
-- nó là một URL đầy đủ. Host vì thế được ghim ở đây — và nó là chỗ ghim THỨ BA,
-- sau `supabase/config.toml` (`project_id`) và `native/src/lib/backend.ts`
-- (`DEFAULT_URL`). Đổi project nghĩa là sửa cả ba.
--
-- Cách tránh được điều đó là lưu ĐƯỜNG DẪN rồi ghép host lúc đọc, nhưng đó là
-- đổi ý nghĩa của một cột đang chạy, và lượt này không đổi kiến trúc.

-- ═════════════════════════════════════════════════════════════════════════
-- 1 · bốn tấm, đúng thứ tự
-- ═════════════════════════════════════════════════════════════════════════
--
-- `position` là cơ chế thứ tự DUY NHẤT: 0 hero → 1 chuyển động → 2 kỹ thuật →
-- 3 lỗi thường gặp. `ON CONFLICT DO NOTHING` để chạy lại không nhân đôi.

INSERT INTO public.exercise_media (exercise_id, kind, uri, position)
SELECT e.id, 'image', v.uri, v.pos
  FROM public.exercises e
  CROSS JOIN (VALUES
    (0, 'https://guqmbqtgxqleuwajvwvg.supabase.co/storage/v1/object/public/exercise-media/dumbbell-curl/01-hero.webp'),
    (1, 'https://guqmbqtgxqleuwajvwvg.supabase.co/storage/v1/object/public/exercise-media/dumbbell-curl/02-movement.webp'),
    (2, 'https://guqmbqtgxqleuwajvwvg.supabase.co/storage/v1/object/public/exercise-media/dumbbell-curl/03-technique.webp'),
    (3, 'https://guqmbqtgxqleuwajvwvg.supabase.co/storage/v1/object/public/exercise-media/dumbbell-curl/04-mistakes.webp')
  ) AS v(pos, uri)
 WHERE lower(trim(e.name)) = 'dumbbell curl'
   AND e.user_id IS NULL
ON CONFLICT (exercise_id, position) DO NOTHING;

-- ═════════════════════════════════════════════════════════════════════════
-- 2 · chữ của từng tấm, hai ngôn ngữ
-- ═════════════════════════════════════════════════════════════════════════
--
-- Đọc lại từ `exercise_media` chứ KHÔNG từ `RETURNING` của lệnh trên. Lý do là
-- chạy lại: `RETURNING` chỉ trả những hàng THẬT SỰ được chèn, nên ở lần chạy
-- thứ hai nó rỗng — và nếu lượt đầu chèn được media mà hỏng ở chú thích thì
-- không lần chạy nào sau đó sửa được nữa. Đọc lại bảng thì cả hai nửa đều tự
-- lành.
--
-- CHỮ KHÔNG NẰM TRONG ẢNH. Bốn tấm nói bằng giải phẫu, tư thế, mũi tên và dấu
-- ✓/✗; mọi câu dưới đây đổi theo ngôn ngữ mà không đụng một byte nào của ảnh.

INSERT INTO public.exercise_media_content (media_id, locale, title, description)
SELECT m.id, c.locale, c.title, c.body
  FROM public.exercise_media m
  JOIN public.exercises e ON e.id = m.exercise_id
  JOIN (VALUES
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
  ) AS c(pos, locale, title, body) ON c.pos = m.position
 WHERE lower(trim(e.name)) = 'dumbbell curl'
   AND e.user_id IS NULL
ON CONFLICT (media_id, locale) DO NOTHING;

-- ═════════════════════════════════════════════════════════════════════════
-- 3 · ba lỗi thường gặp, dạng chữ
-- ═════════════════════════════════════════════════════════════════════════
--
-- Chúng thuộc `exercise_guide_content.common_mistakes` — cột đã có, một dòng
-- cho mỗi (bài tập, ngôn ngữ) — chứ KHÔNG thuộc chú thích của tấm ảnh. Lý do:
-- chúng là câu chữ của BÀI TẬP, và tấm `04-mistakes` chỉ tình cờ vẽ ra chúng.
-- Gắn chúng vào tấm ảnh nghĩa là xoá tấm ảnh thì mất luôn ba lời khuyên.
--
-- ĐÚNG BA LỖI, không thêm. Mỗi câu là thứ tấm ảnh thật sự vẽ ra; một lỗi thứ
-- tư viết cho đủ là một khẳng định về cơ thể người khác mà không có căn cứ.
--
-- `WHERE` loại sẵn dòng đã có nội dung khác rỗng: nếu ai đó đã viết tay
-- `common_mistakes` cho bài này thì migration KHÔNG đè lên chữ của họ.

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
   END,
   updated_at = now()
  FROM public.exercises e
 WHERE e.id = c.exercise_id
   AND lower(trim(e.name)) = 'dumbbell curl'
   AND e.user_id IS NULL
   AND coalesce(array_length(c.common_mistakes, 1), 0) = 0;
