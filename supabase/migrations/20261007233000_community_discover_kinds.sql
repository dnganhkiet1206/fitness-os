-- ════════════════════════════════════════════════════════════════════════════
-- Loại bài muốn thấy ở Khám phá (A 04/10, concept §17 Settings: "Content
-- preferences"; chia việc với C ở #6).
--
-- Người chỉ quan tâm buổi tập không phải lướt qua công thức món ăn, và ngược
-- lại. Một mảng các loại bài trong cài đặt riêng của người ấy; feed Khám phá và
-- khối "Hữu ích tuần này" lọc theo nó. "Đang theo dõi" KHÔNG lọc: đó là bài
-- của những người mình chọn theo dõi, và giấu bớt bài của họ là một lựa chọn
-- khác (tắt tiếng, #6).
--
-- Mặc định cả ba — chưa có dòng cài đặt hay chưa chọn gì thì thấy hết, như
-- trước. Không được rỗng: một Khám phá không có loại bài nào là một màn trống
-- không giải thích được, nên server từ chối, không chỉ app.
--
-- RLS của bảng (20260930130000): mỗi người chỉ đọc/ghi dòng của chính mình.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.community_settings
  ADD COLUMN discover_kinds text[] NOT NULL DEFAULT ARRAY['workout', 'progress', 'recipe']
    CONSTRAINT community_settings_discover_kinds_check
    CHECK (cardinality(discover_kinds) >= 1 AND discover_kinds <@ ARRAY['workout', 'progress', 'recipe']);
