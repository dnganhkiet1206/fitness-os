-- Phần Supabase tối thiểu cho các bảng LÕI (#148). Tách khỏi stub của Cộng
-- đồng: bảng lõi không cần gì của Cộng đồng, và một bộ lõi không được xanh nhờ
-- một bảng Cộng đồng tạo ra.
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role', true), '') $$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;
-- Như Supabase: MỌI bảng và hàm mới được cấp cho các vai API; RLS là thứ duy
-- nhất đứng giữa người này và dòng của người kia. Thiếu hai dòng này thì một
-- bảng "kín" chỉ vì anon không có quyền SELECT — thứ Supabase thật không có.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
-- Trigger updated_at của `20260212060013` gọi hàm này; bản thật ở
-- `20260212040248` cùng khoảng 300 dòng bảng khác. Thân hàm chép nguyên.
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
