-- Phần Supabase tối thiểu migration cần.
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role', true), '') $$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;
-- Hai bảng có sẵn mà share_workout đọc, chỉ các cột nó dùng.
CREATE TABLE public.exercises (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, name text);
CREATE TABLE public.workout_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, date_time timestamptz DEFAULT now(), sets jsonb DEFAULT '[]', volume_load numeric DEFAULT 0, pr_detected boolean, template_name text);
-- Bài Progress (#8) đọc cân nặng và vòng eo.
CREATE TABLE public.weight_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, date date NOT NULL, weight_kg numeric NOT NULL);
CREATE TABLE public.body_measurements (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, date date NOT NULL, waist_cm numeric);
-- Thử thách (#9) ghi thưởng vào sổ xu; UNIQUE(user_id, ref_key) là thứ chặn nhận hai lần.
CREATE TABLE public.mascot_transactions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, amount integer NOT NULL, reason text, ref_key text, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (user_id, ref_key));
-- (B thêm ở đây những bảng bài Recipe cần đọc, chỉ các cột nó dùng.)
-- Supabase mặc định cấp quyền bảng cho các vai trò API; RLS mới là thứ chặn.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
-- …và cấp quyền EXECUTE trên MỌI HÀM MỚI cho anon và authenticated — không chỉ
-- qua PUBLIC. Thiếu dòng này thì mọi `REVOKE … FROM anon, authenticated` trong
-- migration không được đo: một hàm chỉ `REVOKE … FROM PUBLIC` trông kín trên
-- stub mà anon gọi được trên Supabase thật (phép thử ngược C9, #13).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
-- Sổ xu được ĐỌC bằng quyền người gọi từ #41 (`community_challenge_history`).
-- Nó được tạo TRƯỚC dòng cấp quyền mặc định ở trên nên không được cấp gì — lệch
-- khỏi Supabase, nơi mọi bảng được cấp cho vai API và RLS là thứ chặn. Dựng lại
-- đúng như `20260718120000_mascot_economy.sql` (policy INSERT đã bị
-- `20260810120000_economy_server_authority.sql` bỏ): chỉ đọc dòng của mình.
GRANT ALL ON public.mascot_transactions TO anon, authenticated, service_role;
ALTER TABLE public.mascot_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own mascot transactions" ON public.mascot_transactions FOR SELECT USING (auth.uid() = user_id);
