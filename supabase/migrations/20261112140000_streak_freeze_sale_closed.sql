-- ════════════════════════════════════════════════════════════════════════════
-- Đóng bán băng chuỗi cho tới khi app tiêu được nó (round 3, AUD-14 / beta gate
-- B-2, phương án B của `docs/audits/beta-gate-decisions.md`).
--
-- `buy_streak_freeze` trừ 150 xu và tạo một băng chuỗi, nhưng app native không
-- có đường nào tiêu băng chuỗi (`use_streak_freeze` không có ai gọi, không có
-- guard chuỗi). Màn mua đã chết trong UI, còn RPC thì vẫn mở cho mọi người đã
-- đăng nhập: bán một món không dùng được.
--
-- Rút quyền gọi của `authenticated` (anon vốn đã bị rút). Hàm và bảng giữ nguyên:
-- băng đã mua vẫn còn, `use_streak_freeze` vẫn mở. Mở lại bán = một
-- `GRANT EXECUTE … TO authenticated` trong migration đi cùng guard chuỗi của app.
-- ════════════════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.buy_streak_freeze(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.buy_streak_freeze() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.buy_streak_freeze(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.buy_streak_freeze() TO service_role;
