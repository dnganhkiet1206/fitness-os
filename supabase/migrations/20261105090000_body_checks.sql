-- Đo cơ thể bằng AI trong Ảnh tiến trình (Kiệt duyệt 04/11): ước tính tỉ lệ mỡ của MỘT ảnh tiến trình,
-- do hàm `body-check` ghi. Là ước tính từ ảnh — luôn kèm khoảng (thấp–cao) và độ tin, không phải số đo.
-- Ảnh vẫn chỉ nằm ở bucket riêng tư `progress-photos`; bảng này không chứa ảnh.

CREATE TABLE public.body_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- xoá ảnh thì xoá luôn kết quả của ảnh ấy
  photo_id uuid NOT NULL REFERENCES public.progress_photos(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  body_fat_pct numeric(4, 1) NOT NULL CHECK (body_fat_pct BETWEEN 3 AND 60),
  body_fat_low numeric(4, 1) NOT NULL CHECK (body_fat_low BETWEEN 3 AND 60),
  body_fat_high numeric(4, 1) NOT NULL CHECK (body_fat_high BETWEEN 3 AND 60),
  confidence text NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 280),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (body_fat_low <= body_fat_pct AND body_fat_pct <= body_fat_high)
);

-- một kết quả cho mỗi ảnh: đo lại thì thay
CREATE UNIQUE INDEX body_checks_photo ON public.body_checks (photo_id);
CREATE INDEX body_checks_user_date ON public.body_checks (user_id, date DESC);

ALTER TABLE public.body_checks ENABLE ROW LEVEL SECURITY;

-- như `progress_photos`: chỉ chủ tài khoản đọc / ghi / xoá dòng của mình
CREATE POLICY "Users can CRUD own body checks"
  ON public.body_checks FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON public.body_checks FROM anon;
