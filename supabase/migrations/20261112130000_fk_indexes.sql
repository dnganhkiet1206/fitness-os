-- ════════════════════════════════════════════════════════════════════════════
-- Index cho mọi khoá ngoại chưa có index dẫn đầu bằng đúng cột của nó (round 3,
-- AUD-10 / R3-PERF-01). Phần bảng lõi.
--
-- Dò bằng `pg_constraint` × `pg_index` trên một cụm có đủ migration (xem
-- `audit-output/round-3/DATABASE_AND_MIGRATION_REPORT.md`). Không index:
-- - `user_id`: mọi lượt đọc qua RLS (`auth.uid() = user_id`) quét cả bảng.
-- - cột trỏ tới dòng cha: xoá / sửa dòng cha (xoá tài khoản kéo cascade từ
--   `auth.users`, xoá bài, xoá mẫu buổi tập) quét cả bảng con để tìm dòng trỏ tới.
--
-- `CREATE INDEX` thường (không CONCURRENTLY): migration chạy trong transaction,
-- và các bảng hiện còn nhỏ (0 người dùng thật). Khi bảng lớn, tách thành
-- `CREATE INDEX CONCURRENTLY` chạy ngoài transaction.
--
-- Test `fk_indexes.test.sql` đỏ khi một khoá ngoại mới thiếu index.
-- ════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_exercises_user_id ON public.exercises (user_id);
CREATE INDEX IF NOT EXISTS idx_habit_nudges_user_id ON public.habit_nudges (user_id);
CREATE INDEX IF NOT EXISTS idx_meal_entry_items_food_item_id ON public.meal_entry_items (food_item_id);
CREATE INDEX IF NOT EXISTS idx_meal_plan_items_food_item_id ON public.meal_plan_items (food_item_id);
CREATE INDEX IF NOT EXISTS idx_meal_plans_user_id ON public.meal_plans (user_id);
CREATE INDEX IF NOT EXISTS idx_plan_day_overrides_template_id ON public.plan_day_overrides (template_id);
CREATE INDEX IF NOT EXISTS idx_routine_days_template_id ON public.routine_days (template_id);
CREATE INDEX IF NOT EXISTS idx_supplement_intake_logs_supplement_id ON public.supplement_intake_logs (supplement_id);
CREATE INDEX IF NOT EXISTS idx_supplements_user_id ON public.supplements (user_id);
CREATE INDEX IF NOT EXISTS idx_workout_sessions_template_id ON public.workout_sessions (template_id);
CREATE INDEX IF NOT EXISTS idx_workout_templates_user_id ON public.workout_templates (user_id);
