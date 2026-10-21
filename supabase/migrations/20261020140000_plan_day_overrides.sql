-- Đổi lịch cho RIÊNG một ngày (#527 GĐ1, Kiệt chọn "bảng mới trên server" 21/10).
--
-- `routine_days` là lịch mẫu theo thứ trong tuần. Hai phương án của Daily Plan
-- cần đổi đúng MỘT ngày mà không sửa lịch mẫu:
--   · "Dời sang ngày X": ngày gốc thành nghỉ (moved_to = X), ngày X nhận buổi
--     (moved_from = ngày gốc) — hai hàng ghi cùng một lượt từ app;
--   · "Đổi thành ngày nghỉ": ngày ấy nghỉ (moved_to NULL).
-- Quyết định được GHI LẠI, không xoá buổi nào; thống kê (Gains, ngày lỡ, tổng
-- kết tuần) đọc lịch mẫu ⊕ bảng này.
--
-- Một hàng mỗi (người, ngày): app upsert theo khoá này, gửi lại là ghi đè cùng
-- nội dung (idempotent, như `routine_days`).
CREATE TABLE IF NOT EXISTS public.plan_day_overrides (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  -- Buổi của ngày ấy; NULL + is_rest = false là "chưa lên lịch".
  template_id uuid REFERENCES public.workout_templates(id) ON DELETE CASCADE,
  is_rest boolean NOT NULL DEFAULT false,
  moved_from date,
  moved_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date),
  -- Ngày nghỉ không mang buổi.
  CONSTRAINT plan_day_overrides_rest_has_no_session CHECK (NOT (is_rest AND template_id IS NOT NULL)),
  -- Dời từ / tới chính nó là vô nghĩa.
  CONSTRAINT plan_day_overrides_moved_elsewhere CHECK (
    (moved_from IS NULL OR moved_from <> date) AND (moved_to IS NULL OR moved_to <> date)
  )
);

ALTER TABLE public.plan_day_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can CRUD own plan day overrides" ON public.plan_day_overrides;
CREATE POLICY "Users can CRUD own plan day overrides" ON public.plan_day_overrides FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_plan_day_overrides_updated_at ON public.plan_day_overrides;
CREATE TRIGGER update_plan_day_overrides_updated_at BEFORE UPDATE ON public.plan_day_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Dòng cha phải là của mình (#149, như `routine_days` ở 20261001180000): khoá
-- ngoại được kiểm bằng quyền chủ bảng, nên thiếu điều kiện này thì một người
-- trỏ được buổi của mình vào mẫu của người khác nếu biết UUID.
DROP POLICY IF EXISTS "Day override points at own template" ON public.plan_day_overrides;
CREATE POLICY "Day override points at own template" ON public.plan_day_overrides
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (template_id IS NULL OR EXISTS (SELECT 1 FROM public.workout_templates t WHERE t.id = template_id AND t.user_id = auth.uid()));
DROP POLICY IF EXISTS "Day override update points at own template" ON public.plan_day_overrides;
CREATE POLICY "Day override update points at own template" ON public.plan_day_overrides
  AS RESTRICTIVE FOR UPDATE
  USING (true)
  WITH CHECK (template_id IS NULL OR EXISTS (SELECT 1 FROM public.workout_templates t WHERE t.id = template_id AND t.user_id = auth.uid()));
