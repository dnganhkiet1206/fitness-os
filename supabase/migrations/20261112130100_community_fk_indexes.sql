-- ════════════════════════════════════════════════════════════════════════════
-- Index cho mọi khoá ngoại chưa có index dẫn đầu bằng đúng cột của nó (round 3,
-- AUD-10 / R3-PERF-01). Phần Cộng đồng (tên tệp có `_community_` để bộ test Cộng đồng áp nó).
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

CREATE INDEX IF NOT EXISTS idx_community_blocks_blocked_id ON public.community_blocks (blocked_id);
CREATE INDEX IF NOT EXISTS idx_community_likes_user_id ON public.community_likes (user_id);
CREATE INDEX IF NOT EXISTS idx_community_mutes_muted_id ON public.community_mutes (muted_id);
CREATE INDEX IF NOT EXISTS idx_community_notifications_actor_id ON public.community_notifications (actor_id);
CREATE INDEX IF NOT EXISTS idx_community_notifications_challenge_id ON public.community_notifications (challenge_id);
CREATE INDEX IF NOT EXISTS idx_community_notifications_comment_id ON public.community_notifications (comment_id);
CREATE INDEX IF NOT EXISTS idx_community_notifications_post_id ON public.community_notifications (post_id);
CREATE INDEX IF NOT EXISTS idx_community_post_hides_post_id ON public.community_post_hides (post_id);
CREATE INDEX IF NOT EXISTS idx_community_post_tries_user_id ON public.community_post_tries (user_id);
CREATE INDEX IF NOT EXISTS idx_community_posts_art_id ON public.community_posts (art_id);
CREATE INDEX IF NOT EXISTS idx_community_reports_comment_id ON public.community_reports (comment_id);
CREATE INDEX IF NOT EXISTS idx_community_reports_post_id ON public.community_reports (post_id);
CREATE INDEX IF NOT EXISTS idx_community_reports_reported_user_id ON public.community_reports (reported_user_id);
CREATE INDEX IF NOT EXISTS idx_community_review_requests_requester_id ON public.community_review_requests (requester_id);
