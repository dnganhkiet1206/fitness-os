-- Phần Supabase tối thiểu để áp MỌI migration lên một cụm (AUD-13).
-- Hợp của hai stub `community/supabase-stub.sql` và `core/stub.sql`, TRỪ
-- các bảng public đứng chỗ (exercises, workout_sessions, weight_logs,
-- body_measurements, mascot_transactions): ở đây migration lõi thật tạo
-- chúng trước mọi migration cộng đồng dùng tới, nên đứng chỗ sẽ đụng
-- CREATE TABLE thật. `auth.users` hợp cả hai phía: cộng đồng cần `email` +
-- `created_at` (20261007220000), lõi cần `raw_user_meta_data`
-- (trigger `on_auth_user_created`, 20260212040248).
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
-- Mặc định `created_at` CŨ như stub cộng đồng: người dùng là tài khoản bình
-- thường, không phải tài khoản mới dưới 30 ngày.
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, created_at timestamptz NOT NULL DEFAULT now() - interval '400 days', raw_user_meta_data jsonb);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role', true), '') $$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;
-- Như Supabase: MỌI bảng và hàm mới được cấp cho các vai API; RLS là thứ duy
-- nhất đứng giữa người này và dòng của người kia.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
-- Trigger updated_at gọi hàm này; bản thật ở `20260212040248` định nghĩa lại
-- bằng CREATE OR REPLACE nên không đụng. Thân hàm chép nguyên từ core/stub.sql.
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ── storage, chỉ phần các migration chạm tới (chép từ core/stub.sql) ──
-- Bucket `progress-photos` và `exercise-media` được tạo và bị giới hạn bằng
-- migration (INSERT/UPDATE storage.buckets, policy trên storage.objects). Đây
-- là cụm Postgres TẠM của bộ kiểm; trên Supabase thật hai bảng này thuộc về
-- `supabase_storage_admin` và migration không đổi chủ hay quyền của chúng.
-- Cột chỉ những cột migration dùng; `foldername` đúng nghĩa của Supabase:
-- các đoạn thư mục của đường dẫn, bỏ tên tệp.
CREATE SCHEMA storage;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text NOT NULL, public boolean DEFAULT false, file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text REFERENCES storage.buckets(id), name text NOT NULL, owner uuid);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT ALL ON storage.objects TO anon, authenticated, service_role;
GRANT SELECT ON storage.buckets TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION storage.foldername(text) TO anon, authenticated, service_role;
