-- DE-XUAT-3 P2-10 (C, 03/10/2026): index còn thiếu cho community_challenge_members(user_id).
--
-- Bảng có PK (challenge_id, user_id), nhưng RLS policy SELECT/DELETE lọc theo
-- user_id đơn lẻ (auth.uid() = user_id) — lookup theo user không dùng được PK.
-- Index này cho planner đường btree trên user_id. Additive-only, không đổi
-- schema hiện có. A đang active ở community — cross-check giúp.
CREATE INDEX IF NOT EXISTS community_challenge_members_user_id_idx
  ON public.community_challenge_members (user_id);
