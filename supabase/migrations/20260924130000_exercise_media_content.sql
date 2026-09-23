-- Chú thích của TỪNG tấm media, theo TỪNG ngôn ngữ.
--
-- ── vì sao không chỗ nào đang có chứa nổi thứ này ──
--
-- Ba ứng viên, và cả ba đều hỏng theo một cách khác nhau:
--
--     exercise_media.alt              một TEXT, KHÔNG đa ngữ
--     exercise_guide_content.instructions[]
--                                     theo BÀI TẬP, không theo TẤM ẢNH
--     một cột JSONB trên exercise_media
--                                     phá khuôn một-dòng-một-ngôn-ngữ, và
--                                     `locale` thôi ràng buộc được
--
-- Cái thứ hai là cái nguy hiểm nhất vì nó trông như đủ: khớp `instructions[i]`
-- với media có `position = i` sẽ chạy đúng ngay hôm nay. Nhưng đó là dựng một
-- cơ chế THỨ TỰ THỨ HAI, ngầm, cạnh `UNIQUE (exercise_id, position)` đã có —
-- và nó vỡ IM LẶNG đúng lúc một trong hai danh sách đổi độ dài: thêm một bước
-- chữ mà không thêm ảnh thì mọi chú thích từ đó trở đi lệch một nấc, và không
-- gì trên màn nói rằng có gì sai.
--
-- ── nên: đúng NGUYÊN khuôn `exercise_guide_content` ──
--
-- Một dòng cho mỗi (media, ngôn ngữ). Cha là tấm media và là danh tính; bảng
-- này THÊM chữ cho một tấm ảnh, không bao giờ tạo ra một tấm, và không sống lâu
-- hơn nó. Đây KHÔNG phải một hệ đa ngữ thứ hai: cùng `AppLang`, cùng luật lùi
-- ngôn ngữ của `pickContent` (tiếng đang bật → tiếng Việt → không có), và luật
-- ấy nay được rút ra thành `pickLocale` để đúng một chỗ định nghĩa nó.
--
-- ── vì sao ẢNH KHÔNG mang chữ, và vì sao đó là lý do bảng này tồn tại ──
--
-- Đặt hàng nói thẳng: *"NEVER bake instructional text into the image… MEDIA
-- ASSET ≠ INSTRUCTIONAL TEXT."* Một tấm ảnh có chữ tiếng Anh nướng vào pixel là
-- một tấm ảnh chỉ dùng được cho một nửa người dùng của app này, và cách duy
-- nhất để sửa là vẽ lại nó. Bốn tấm của bộ đầu tiên vì thế nói bằng giải phẫu,
-- tư thế, mũi tên và dấu ✓/✗ — còn chữ thì ở đây, và đổi ngôn ngữ không đụng
-- một byte nào của ảnh.
--
-- ── và nó RỖNG ──
--
-- Không một dòng chú thích nào được viết ở migration này, vì chưa có tấm media
-- nào để gắn vào: `exercise_media` rỗng, và `media_id` là một khoá ngoại thật.
-- Chú thích tới CÙNG media, ở migration viết bốn hàng ấy — xem
-- `docs/exercise-media.md`.

CREATE TABLE IF NOT EXISTS public.exercise_media_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  media_id UUID NOT NULL REFERENCES public.exercise_media(id) ON DELETE CASCADE,

  -- Đúng những ngôn ngữ app vẽ được. `AppLang` trong `src/lib/i18n.ts` là
  -- `'vi' | 'en'`; một locale thứ ba ở đây là nội dung không ai đọc được, nên
  -- nó bị từ chối ở cửa chứ không được lưu rồi bỏ qua. Cùng nguyên văn ràng
  -- buộc của `exercise_guide_content`.
  locale TEXT NOT NULL CHECK (locale IN ('vi', 'en')),

  -- Tiêu đề của BƯỚC, ví dụ "Tư thế bắt đầu". Một chú thích không có tiêu đề
  -- thì không có gì để nói, nên chuỗi rỗng bị cấm — khác `description`, nơi
  -- rỗng là một sự thật ("tấm này chỉ cần một tiêu đề").
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),

  -- NOT NULL với mặc định rỗng, đúng nguyên tắc của ba cột `TEXT[]` bên
  -- `exercise_guide_content`: rỗng và vắng mặt không được có hai cách viết.
  description TEXT NOT NULL DEFAULT '',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Một dòng cho mỗi tấm cho mỗi ngôn ngữ. Hai dòng làm "chú thích tiếng Anh
  -- nào" thành một câu hỏi không có đáp án, và bộ đọc chọn dòng bằng locale
  -- một mình.
  UNIQUE (media_id, locale)
);

CREATE INDEX IF NOT EXISTS idx_exercise_media_content_media
  ON public.exercise_media_content (media_id);

ALTER TABLE public.exercise_media_content ENABLE ROW LEVEL SECURITY;

-- Thấy được đúng khi thấy được tấm media, mà tấm media thì thấy được đúng khi
-- thấy được BÀI TẬP. Luật gốc nằm trên `exercises` và được đi tới qua hai khoá
-- ngoại chứ không chép lại: chép lại nghĩa là ba chỗ phải cùng đổi, và một ngày
-- nào đó chúng sẽ không.
DROP POLICY IF EXISTS "Users can view captions for visible media"
  ON public.exercise_media_content;
CREATE POLICY "Users can view captions for visible media"
  ON public.exercise_media_content FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM public.exercise_media m
        JOIN public.exercises e ON e.id = m.exercise_id
       WHERE m.id = exercise_media_content.media_id
         AND (e.user_id IS NULL OR e.user_id = auth.uid())
    )
  );

-- KHÔNG có policy INSERT/UPDATE/DELETE cho client, cùng lý do đã ghi ở hai
-- bảng anh em: chưa có màn nào cho người dùng viết chú thích media. Xoá một
-- tấm media vẫn xoá chú thích của nó, qua khoá ngoại chứ không qua policy.
