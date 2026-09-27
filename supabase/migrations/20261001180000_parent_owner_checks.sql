-- ════════════════════════════════════════════════════════════════════════════
-- Dòng cha phải là của mình (issue #149).
--
-- Postgres kiểm khoá ngoại bằng quyền CHỦ BẢNG, không qua RLS. Năm bảng dưới
-- đây có policy chỉ hỏi chủ của chính dòng (`auth.uid() = user_id`) hoặc chủ
-- của bữa / kế hoạch cha — không hỏi dòng mà khoá ngoại thứ hai trỏ tới. Nên
-- người B tạo được một dòng CỦA B trỏ vào dòng riêng của người A, nếu biết UUID:
--
--   supplement_intake_logs.supplement_id → supplements      (ON DELETE CASCADE)
--   workout_sessions.template_id         → workout_templates (ON DELETE SET NULL)
--   routine_days.template_id             → workout_templates (ON DELETE CASCADE)
--   meal_entry_items.food_item_id        → food_items        (ON DELETE SET NULL)
--   meal_plan_items.food_item_id         → food_items        (ON DELETE SET NULL)
--
-- Hệ quả: A xoá dòng cha thì dữ liệu của B bị xoá theo hay mất tham chiếu; và
-- `share_recipe` (SECURITY DEFINER) đọc `serving_g` của thực phẩm được trỏ tới.
-- Rủi ro thấp (phải biết một UUID), nhưng là đúng loại lỗ "quên kiểm chủ của
-- cha" mà #148 hỏi.
--
-- ── vì sao policy RESTRICTIVE, không sửa policy cũ ──
--
-- Policy RESTRICTIVE được AND với mọi policy PERMISSIVE đang có. Không DROP,
-- không viết lại policy nào: quyền đọc/ghi hiện tại giữ nguyên, chỉ thêm một
-- điều kiện cho INSERT và UPDATE. Truy vấn con chạy bằng quyền người gọi, nên
-- nó thấy đúng những dòng cha người gọi được thấy: của mình, và thực phẩm
-- chung (`user_id IS NULL`) của thư viện.
--
-- ── luồng hợp lệ không bị chặn ──
--
-- Đã soát `src/`: mọi chỗ ghi supplement_id / template_id / food_item_id lấy
-- id từ một dòng người dùng ĐANG THẤY (tìm thực phẩm: của mình + chung; mẫu,
-- thực phẩm bổ sung: của mình). Thẻ công thức cộng đồng không mang food_item_id
-- (`share_recipe` chỉ ghi tên, gam, macro). Dòng cũ không bị động tới: WITH
-- CHECK chỉ hỏi dòng MỚI của một lệnh ghi.
--
-- Kịch bản: supabase/tests/core/parent_fk.test.sql (F1–F11), ca phá ở
-- supabase/tests/core/reverse.py.
-- ════════════════════════════════════════════════════════════════════════════

CREATE POLICY "Intake log points at own supplement" ON public.supplement_intake_logs
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.supplements s WHERE s.id = supplement_id AND s.user_id = auth.uid()));
CREATE POLICY "Intake log update points at own supplement" ON public.supplement_intake_logs
  AS RESTRICTIVE FOR UPDATE
  USING (true)
  WITH CHECK (EXISTS (SELECT 1 FROM public.supplements s WHERE s.id = supplement_id AND s.user_id = auth.uid()));

CREATE POLICY "Session points at own template" ON public.workout_sessions
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (template_id IS NULL OR EXISTS (SELECT 1 FROM public.workout_templates t WHERE t.id = template_id AND t.user_id = auth.uid()));
CREATE POLICY "Session update points at own template" ON public.workout_sessions
  AS RESTRICTIVE FOR UPDATE
  USING (true)
  WITH CHECK (template_id IS NULL OR EXISTS (SELECT 1 FROM public.workout_templates t WHERE t.id = template_id AND t.user_id = auth.uid()));

CREATE POLICY "Routine day points at own template" ON public.routine_days
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (template_id IS NULL OR EXISTS (SELECT 1 FROM public.workout_templates t WHERE t.id = template_id AND t.user_id = auth.uid()));
CREATE POLICY "Routine day update points at own template" ON public.routine_days
  AS RESTRICTIVE FOR UPDATE
  USING (true)
  WITH CHECK (template_id IS NULL OR EXISTS (SELECT 1 FROM public.workout_templates t WHERE t.id = template_id AND t.user_id = auth.uid()));

CREATE POLICY "Meal item points at visible food" ON public.meal_entry_items
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (food_item_id IS NULL OR EXISTS (SELECT 1 FROM public.food_items f WHERE f.id = food_item_id AND (f.user_id IS NULL OR f.user_id = auth.uid())));
CREATE POLICY "Meal item update points at visible food" ON public.meal_entry_items
  AS RESTRICTIVE FOR UPDATE
  USING (true)
  WITH CHECK (food_item_id IS NULL OR EXISTS (SELECT 1 FROM public.food_items f WHERE f.id = food_item_id AND (f.user_id IS NULL OR f.user_id = auth.uid())));

CREATE POLICY "Plan item points at visible food" ON public.meal_plan_items
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (food_item_id IS NULL OR EXISTS (SELECT 1 FROM public.food_items f WHERE f.id = food_item_id AND (f.user_id IS NULL OR f.user_id = auth.uid())));
CREATE POLICY "Plan item update points at visible food" ON public.meal_plan_items
  AS RESTRICTIVE FOR UPDATE
  USING (true)
  WITH CHECK (food_item_id IS NULL OR EXISTS (SELECT 1 FROM public.food_items f WHERE f.id = food_item_id AND (f.user_id IS NULL OR f.user_id = auth.uid())));
