-- ════════════════════════════════════════════════════════════════════════════
-- Mở `community_posts.kind` cho cả ba loại bài của MVP: workout · progress · recipe.
--
-- Vì sao là một migration riêng, và vì sao làm NGAY bây giờ:
--
-- Giai đoạn 2 chia hai người làm song song (issue #6): A làm bài Progress, B
-- làm bài Recipe. Nếu mỗi người tự nới CHECK trong migration của mình, migration
-- áp SAU sẽ dựng lại ràng buộc chỉ với loại của nó — và loại của người kia
-- biến mất khỏi danh sách, trong im lặng, tới lần đầu có ai chia sẻ.
--
-- Mở một lần, ở đây, trước khi ai bắt đầu, thì không ai phải chạm vào nó nữa.
-- Việc này không mở ra lỗ nào: bài chỉ sinh ra qua RPC phía server
-- (`community_posts` không có policy INSERT), và RPC cho progress/recipe chưa
-- tồn tại cho tới khi migration của chúng được áp.
--
-- Không sửa `20260927120000_community_foundation.sql`: nó đã nằm trong lịch sử
-- git, và có thể đã được `db push` ở đâu đó.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.community_posts DROP CONSTRAINT IF EXISTS community_posts_kind_check;
ALTER TABLE public.community_posts
  ADD CONSTRAINT community_posts_kind_check CHECK (kind IN ('workout', 'progress', 'recipe'));
