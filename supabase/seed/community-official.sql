-- ════════════════════════════════════════════════════════════════════════════
-- Tài khoản ASCND chính thức + ba bài mở màn cho feed Khám phá.
--
-- Chủ dự án (24/09): feed trống thì hiện nội dung của một tài khoản ASCND
-- THẬT có dấu xác minh — không phải người dùng bịa.
--
-- Cách chạy (một lần, sau khi đã áp `20260927120000_community_foundation.sql`):
--
--   1. Dashboard → Authentication → Add user: tạo tài khoản cho ASCND
--      (email của nhóm). Chép UUID của nó.
--   2. Chạy bằng psql với chuỗi kết nối ở Dashboard → Connect:
--        psql "$DB_URL" -v official=<uuid> -f supabase/seed/community-official.sql
--      KHÔNG dán vào SQL Editor: tệp dùng biến của psql (`\if`, `:'official'`)
--      mà SQL Editor không hiểu.
--
-- Chạy lại không nhân đôi: hồ sơ dùng ON CONFLICT, mỗi bài chỉ chèn khi chưa
-- có bài cùng tiêu đề của tài khoản ấy.
--
-- Bài của ASCND là MẪU buổi tập chứ không phải buổi của một người, nên không
-- có mức tạ (`weight` 0) và không có tổng khối lượng. Thẻ vẽ "5 × 5" (set ×
-- rep) khi không có tạ. Mỗi bài tập trỏ tới một bài trong THƯ VIỆN CHUNG
-- (`exercises.user_id IS NULL`), nên "Thử workout" chép được cả.
-- ════════════════════════════════════════════════════════════════════════════

\if :{?official}
\else
  \echo 'Thiếu biến official: psql ... -v official=<uuid của tài khoản ASCND>'
  \quit
\endif

INSERT INTO public.community_profiles (user_id, handle, display_name, bio, mascot_id, is_official)
VALUES (:'official', 'ascnd', 'ASCND', 'Buổi tập mẫu, thử thách và mẹo từ đội ngũ ASCND.', 'koa', true)
ON CONFLICT (user_id) DO UPDATE SET is_official = true;

CREATE TEMP TABLE _ascnd_official_posts (title text, minutes int, caption text, ex jsonb);
INSERT INTO _ascnd_official_posts VALUES
  ('Push — Sức mạnh', 50, 'Buổi đẩy nền tảng: ép ngực, đẩy vai, rồi tay trước để kết thúc. Bắt đầu nhẹ hơn bạn nghĩ.',
   '[["Bench Press",5,5],["Overhead Press",4,8],["Dumbbell Curl",3,12]]'),
  ('Pull — Lưng dày', 55, 'Kéo xà trước khi mỏi, chèo tạ đòn giữ lưng thẳng. Chất lượng mỗi rep hơn số rep.',
   '[["Pull-up",4,6],["Barbell Row",4,8],["Lat Pulldown",3,10],["Dumbbell Curl",3,12]]'),
  ('Legs — Nền móng', 60, 'Squat là vua, RDL giữ lưng sau khoẻ, leg press để dồn khối lượng cuối buổi.',
   '[["Barbell Squat",5,5],["Romanian Deadlift",4,8],["Leg Press",3,12]]');

INSERT INTO public.community_posts (author_id, kind, source_id, payload, caption, visibility)
SELECT
  (:'official')::uuid,
  'workout',
  NULL,
  jsonb_build_object(
    'title', o.title,
    'performedAt', now(),
    'volumeKg', 0,
    'pr', false,
    'minutes', o.minutes,
    'exerciseCount', jsonb_array_length(o.ex),
    'exercises', (
      SELECT jsonb_agg(jsonb_build_object(
               'exerciseId',   (SELECT x.id::text FROM public.exercises x WHERE x.user_id IS NULL AND x.name = e->>0 LIMIT 1),
               'exerciseName', e->>0,
               'library',      EXISTS (SELECT 1 FROM public.exercises x WHERE x.user_id IS NULL AND x.name = e->>0),
               'sets',         (e->>1)::int,
               'weight',       0,
               'reps',         (e->>2)::int
             ) ORDER BY i)
      FROM jsonb_array_elements(o.ex) WITH ORDINALITY AS t(e, i)
    )
  ),
  o.caption,
  'public'
FROM _ascnd_official_posts o
WHERE NOT EXISTS (
  SELECT 1 FROM public.community_posts p
  WHERE p.author_id = (:'official')::uuid AND p.payload->>'title' = o.title
);

DROP TABLE _ascnd_official_posts;
