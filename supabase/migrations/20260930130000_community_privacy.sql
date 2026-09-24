-- ════════════════════════════════════════════════════════════════════════════
-- Cộng đồng — Quyền riêng tư (issue #11, người làm A).
--
-- Concept mục 11: "không nên mặc định công khai mọi dữ liệu", và người dùng
-- phải kiểm soát được thứ mình chia sẻ.
--
-- ── thứ KHÔNG cần migration ──
--
--   · Bỏ chặn: `community_blocks` đã có policy SELECT/DELETE cho chính người
--     chặn (nền móng, mục 2). App chỉ còn thiếu một màn để làm việc đó.
--   · Xoá mọi bài của mình: policy "Authors delete their own posts" đã có.
--
-- ── thứ cần: MỘT bảng cài đặt riêng ──
--
-- "Mặc định khi đăng" (Mọi người / Người theo dõi) KHÔNG nằm trên
-- `community_profiles`: bảng ấy mở đọc cho mọi người đã đăng nhập, nên một
-- cột ở đó là cho cả cộng đồng biết người này thường giấu bài với ai. Bảng
-- riêng, chỉ chủ nhân đọc và ghi.
--
-- Không có policy DELETE: không có gì để xoá ngoài việc đặt lại, và dòng tự
-- đi theo tài khoản qua ON DELETE CASCADE.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE public.community_settings (
  user_id            uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  default_visibility text NOT NULL DEFAULT 'public' CHECK (default_visibility IN ('public', 'followers')),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.community_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own community settings"
  ON public.community_settings FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users create their own community settings"
  ON public.community_settings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users edit their own community settings"
  ON public.community_settings FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
