-- Media của bài tập — MỘT QUAN HỆ, không phải một cột nữa.
--
-- ── thứ đang có, và vì sao nó không đủ ──
--
-- Toàn bộ mô hình media của bài tập cho tới hôm nay là một cột:
--
--     exercises.video_url TEXT DEFAULT ''
--
-- Một URL, không kiểu, không thứ tự, không thời lượng, không poster. Hệ quả đo
-- được trong mã: `guide-media.tsx` phải đoán ảnh-hay-video bằng REGEX ĐUÔI TỆP,
-- vì đó là tín hiệu duy nhất tồn tại. Một URL ký sẵn của Supabase Storage
-- (`…/object/sign/…?token=…`) không mang đuôi nào, nên phép đoán ấy sai ngay ở
-- trường hợp thường gặp nhất mà sản phẩm này sẽ có.
--
-- Và hai thứ đặt hàng đòi thì cột ấy KHÔNG biểu diễn được:
--
--     "3 ảnh cho một bài"       → một cột giữ được một URL
--     "thời lượng thật"         → không có chỗ nào để lưu
--
-- ── vì sao một BẢNG, và vì sao đúng khuôn này ──
--
-- Cùng lập luận đã dựng `exercise_guide_content`, và cố ý dùng lại nguyên khuôn
-- ấy: định nghĩa bài tập là cha và là danh tính; bảng này THÊM media cho một
-- bài, không bao giờ tạo ra một bài, và không sống lâu hơn bài ấy.
--
-- Thêm `image_url_2`, `image_url_3` sẽ làm schema mọc NGANG mỗi lần ai đó muốn
-- thêm một ảnh. Một hàng cho mỗi tấm thì mọc XUỐNG, đúng việc của hàng — và
-- `position` là thứ biến "nhiều hàng" thành "một bộ có thứ tự".
--
-- ── `video_url` KHÔNG bị xoá ──
--
-- Nó vẫn là nguồn hợp lệ, và mã đọc nó làm ĐƯỜNG LUI khi một bài chưa có hàng
-- media nào. Xoá nó ở lượt này sẽ làm trắng media của mọi dòng đang có dữ liệu
-- trên mọi project đã chạy, đổi lấy đúng một chút gọn gàng. Khi nào mọi dòng đã
-- được chuyển sang bảng này thì cột ấy mới đáng gỡ, và đó là một lượt riêng có
-- dữ liệu để kiểm.
--
-- ── và nó RỖNG ──
--
-- Migration này không viết một hàng media nào cho một bài nào. Mười dòng hạt
-- giống không có media, và bịa ra một URL để màn hình trông đầy đủ là đặt một
-- khẳng định sai vào sản phẩm. Bảng rỗng là một sự thật: chưa ai thêm.

CREATE TABLE IF NOT EXISTS public.exercise_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  exercise_id UUID NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,

  -- KIỂU ĐƯỢC LƯU, không được đoán.
  --
  -- Đây là lý do bảng này tồn tại. Đặt hàng nói thẳng: *"Do not infer media
  -- type from filename."* Với một cột URL trần thì không có cách nào khác; với
  -- cột này thì việc đoán không còn được phép nữa.
  kind TEXT NOT NULL CHECK (kind IN ('image', 'video')),

  uri TEXT NOT NULL CHECK (length(trim(uri)) > 0),

  -- Thứ tự trong bộ. Hai tấm cùng `position` làm "ảnh thứ hai là tấm nào" thành
  -- một câu hỏi không có đáp án, nên nó là duy nhất theo từng bài.
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),

  -- Thời lượng giây, CHỈ cho video và chỉ khi biết.
  --
  -- NULL nghĩa là "chưa biết" — một trạng thái có thật: một video vừa được thêm
  -- mà chưa ai đọc metadata. Màn hình phải im lặng ở trạng thái ấy chứ không
  -- được in một con số. 0 thì bị cấm, vì "0 giây" là một lời khẳng định sai chứ
  -- không phải một chỗ trống.
  duration_s NUMERIC CHECK (duration_s IS NULL OR duration_s > 0),

  -- Khung hình đại diện của video. Ảnh thì không có poster — chính nó là poster.
  poster_uri TEXT,

  -- Nhãn trợ năng do người thêm media viết. NULL thì màn hình tự dựng một câu
  -- từ tên bài; một chuỗi rỗng và một giá trị vắng mặt không được có hai cách
  -- viết, nên chỉ NULL là "chưa có".
  alt TEXT CHECK (alt IS NULL OR length(trim(alt)) > 0),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (exercise_id, position),

  -- Hai ràng buộc nói ra đúng những gì từng kiểu ĐƯỢC PHÉP mang. Không có
  -- chúng thì một hàng `kind='image'` mang `duration_s = 12` là hợp lệ, và màn
  -- hình sẽ phải tự đoán xem có nên tin con số ấy không — tức phép đoán quay
  -- lại, chỉ là ở một chỗ khác.
  CONSTRAINT exercise_media_image_has_no_video_fields
    CHECK (kind <> 'image' OR (duration_s IS NULL AND poster_uri IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_exercise_media_exercise
  ON public.exercise_media(exercise_id, position);

ALTER TABLE public.exercise_media ENABLE ROW LEVEL SECURITY;

-- Ai thấy được BÀI TẬP thì thấy được media của nó — không nhiều hơn, không ít
-- hơn. Điều kiện được viết qua khoá ngoại chứ không chép lại luật của
-- `exercises`: chép lại nghĩa là hai chỗ phải cùng đổi, và một ngày nào đó
-- chúng sẽ không.
DROP POLICY IF EXISTS "Users can view media for visible exercises"
  ON public.exercise_media;
CREATE POLICY "Users can view media for visible exercises"
  ON public.exercise_media FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.exercises e
      WHERE e.id = exercise_media.exercise_id
        AND (e.user_id IS NULL OR e.user_id = auth.uid())
    )
  );

-- KHÔNG có policy INSERT/UPDATE/DELETE cho client, cố ý — cùng lý do đã ghi ở
-- `exercise_guide_content`: chưa có màn nào cho người dùng thêm media. Cấp một
-- quyền ghi không ai dùng là mở một lỗ không có tính năng nào ở sau. Khi màn ấy
-- tồn tại, policy tới cùng nó.
