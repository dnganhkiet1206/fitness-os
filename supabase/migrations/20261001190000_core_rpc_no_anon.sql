-- ════════════════════════════════════════════════════════════════════════════
-- Hàm SECURITY DEFINER lõi: đóng với anon (issue #154).
--
-- Các migration kinh tế xu, đóng băng chuỗi và hạn mức AI đều viết
-- `REVOKE ALL ON FUNCTION … FROM PUBLIC; GRANT EXECUTE … TO authenticated`.
-- Trên Supabase thế là CHƯA đủ: default privileges của project cấp EXECUTE
-- trên mọi hàm mới ở `public` THẲNG cho anon (không qua PUBLIC), nên anon vẫn
-- gọi được — đúng bài C9 mà Cộng đồng đã học (#13): một hàm chỉ `REVOKE … FROM
-- PUBLIC` trông kín mà anon gọi được. Đo bằng
-- `supabase/tests/core/rpc_authority.test.sql` (E1 đỏ trước migration này).
--
-- Thân mỗi hàm đã tự từ chối khi `auth.uid()` là NULL ('not signed in', hay
-- RETURN sớm), nên đây chưa phải một lỗ đang mở — là một lớp thứ hai cho bất
-- biến "mọi hàm gọi được đều đóng với anon" (#15), để một thân hàm sau này quên
-- chốt ấy không thành một lỗ. App không gọi hàm nào trong số này khi chưa đăng
-- nhập; edge function gọi bằng client mang JWT người dùng (vai authenticated).
--
-- Thu từ CẢ PUBLIC lẫn anon: `buy_mascot_item`, `earn_mascot_coins`,
-- `current_tier` chưa từng có dòng REVOKE nào, nên anon còn gọi được chúng qua
-- PUBLIC (đo: E1 vẫn đỏ ở buy_mascot_item khi chỉ thu của anon). GRANT cho
-- authenticated được viết lại tường minh cho mọi hàm — không mở thêm gì, chỉ
-- để quyền của người đã đăng nhập không còn đứng trên PUBLIC. Không sửa thân
-- hàm nào. Hàm trigger
-- (handle_new_user, trim_coach_memory) không gọi được qua RPC nên không nằm đây.
-- ════════════════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.ai_gate(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_gate(TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.buy_mascot_item(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buy_mascot_item(TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.buy_streak_freeze(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buy_streak_freeze(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.buy_streak_freeze() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buy_streak_freeze() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_ai_call(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_ai_call(TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_quest_reward(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_quest_reward(TEXT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.current_tier() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_tier() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.earn_mascot_coins(TEXT, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.earn_mascot_coins(TEXT, INTEGER, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.reward_amount_for(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reward_amount_for(TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.spend_ai_tokens(TEXT, BIGINT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spend_ai_tokens(TEXT, BIGINT, BOOLEAN) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.use_streak_freeze(DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.use_streak_freeze(DATE) TO authenticated;
