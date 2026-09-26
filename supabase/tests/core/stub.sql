-- Phần Supabase tối thiểu cho các bảng LÕI (#148). Tách khỏi stub của Cộng
-- đồng: bảng lõi không cần gì của Cộng đồng, và một bộ lõi không được xanh nhờ
-- một bảng Cộng đồng tạo ra.
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
-- `raw_user_meta_data`: trigger `on_auth_user_created` (20260212040248) đọc nó
-- để tạo hồ sơ — từ #132 bộ lõi nạp MỌI migration, trigger ấy có thật ở đây.
CREATE TABLE auth.users (id uuid PRIMARY KEY, raw_user_meta_data jsonb);
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

-- ── storage, chỉ phần các migration lõi chạm tới (#132) ──
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
