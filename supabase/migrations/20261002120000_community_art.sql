-- ════════════════════════════════════════════════════════════════════════════
-- Thư viện ảnh của app cho bài Cộng đồng (#163).
--
-- Chủ dự án, 27/09: người dùng KHÔNG tải ảnh lên. Mọi bài chia sẻ (buổi tập,
-- công thức, tiến trình) có một ảnh lấy từ thư viện do app cấp; người dùng chỉ
-- chọn phong cách; chỉ admin thêm ảnh. Lý do: thiết kế đồng bộ như concept,
-- trong khi chưa có ngân sách kiểm duyệt ảnh người dùng.
--
-- ── ai làm được gì ──
--
--   · người đã đăng nhập: ĐỌC thư viện (cả ảnh đã tắt — bài cũ trỏ vào chúng
--     vẫn phải vẽ được);
--   · anon: không gì cả;
--   · ghi: KHÔNG có policy INSERT/UPDATE/DELETE nào, và không GRANT ghi cho
--     authenticated/anon. Chỉ service_role (dashboard) thêm hay tắt ảnh — cùng
--     kiểu với dấu xác minh chính thức ở nền móng.
--
-- ── bài trỏ vào ảnh, không chứa URL ──
--
-- `community_posts.art_id` là một tham chiếu tới thư viện, không bao giờ là một
-- URL tự do — một URL do client gửi là một ảnh người dùng tải lên bằng đường
-- vòng. Trigger dưới đây kiểm ở server, trên MỌI đường ghi: ảnh phải có thật,
-- CÙNG `kind` với bài, và CÒN DÙNG lúc được gắn.
--
-- `image_source` hôm nay chỉ nhận 'library'. Ngày mở cho người dùng đăng ảnh,
-- thêm giá trị 'user_upload' (và cột đường dẫn của nó) mà không phải đổi bài
-- cũ nào: bài cũ vẫn là 'library'.
--
-- Bài có từ trước #163 có `art_id` NULL; app tự chọn một ảnh hợp nội dung để
-- vẽ, không ghi gì. Tệp ảnh nằm ở bucket `community-art` (migration
-- `20261002110000_art_library_bucket.sql`), nên thêm ảnh không cần phát hành lại
-- qua App Store.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE public.community_art (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind       text NOT NULL CHECK (kind IN ('workout', 'progress', 'recipe')),
  -- Phong cách người dùng chọn ở màn xem trước ("mono", "neon", …). Một từ
  -- khoá ngắn; tên hiển thị hai ngôn ngữ nằm ở app.
  style      text NOT NULL CHECK (style ~ '^[a-z][a-z0-9_]{0,23}$'),
  -- Nhãn nội dung để app chọn sẵn ảnh hợp bài: push/pull/legs/cardio/full,
  -- bữa sáng/…; rỗng = hợp mọi bài của `kind` ấy.
  tags       text[] NOT NULL DEFAULT '{}',
  -- Đường dẫn object trong bucket `community-art`, KHÔNG phải URL.
  path       text NOT NULL UNIQUE CHECK (path ~ '^[a-z0-9][a-z0-9/_.-]{0,199}$' AND path NOT LIKE '%..%'),
  alt_en     text NOT NULL CHECK (char_length(btrim(alt_en)) BETWEEN 1 AND 200),
  alt_vi     text NOT NULL CHECK (char_length(btrim(alt_vi)) BETWEEN 1 AND 200),
  active     boolean NOT NULL DEFAULT true,
  sort       integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX community_art_pick_idx ON public.community_art (kind, active, style, sort);

ALTER TABLE public.community_art ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users read the art library"
  ON public.community_art FOR SELECT TO authenticated
  USING (true);

REVOKE ALL ON public.community_art FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.community_art TO authenticated;
GRANT ALL ON public.community_art TO service_role;

-- ── bài trỏ vào ảnh ──

ALTER TABLE public.community_posts
  ADD COLUMN image_source text NOT NULL DEFAULT 'library' CHECK (image_source IN ('library')),
  ADD COLUMN art_id uuid REFERENCES public.community_art(id) ON DELETE RESTRICT;

-- Chạy bằng quyền chủ: người ghi bài (qua RPC SECURITY DEFINER) không cần đọc
-- được gì thêm, và một policy đọc của thư viện đổi về sau không làm hỏng đường
-- chia sẻ.
CREATE FUNCTION public.community_posts_art_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a public.community_art%ROWTYPE;
BEGIN
  IF NEW.art_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- Gắn lại đúng ảnh cũ (ví dụ sửa chú thích) không bị hỏi lại "còn dùng":
  -- một ảnh bị tắt SAU khi bài đã đăng không được làm bài ấy không sửa nổi.
  IF TG_OP = 'UPDATE' AND NEW.art_id IS NOT DISTINCT FROM OLD.art_id AND NEW.kind = OLD.kind THEN
    RETURN NEW;
  END IF;
  SELECT * INTO a FROM public.community_art WHERE id = NEW.art_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'art not found' USING ERRCODE = 'P0002';
  END IF;
  IF a.kind <> NEW.kind THEN
    RAISE EXCEPTION 'art kind % does not match post kind %', a.kind, NEW.kind USING ERRCODE = '22023';
  END IF;
  IF NOT a.active THEN
    RAISE EXCEPTION 'art retired' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.community_posts_art_check() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER community_posts_art_check
  BEFORE INSERT OR UPDATE OF art_id, kind ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.community_posts_art_check();

-- ── ba đường chia sẻ nhận ảnh ──
--
-- Tên RIÊNG (`…_with_art`), không phải một bản quá tải của `share_*`: hai chữ
-- ký cùng tên buộc PostgREST phải chọn theo tập đối số, và `types.ts` (viết
-- tay, #51) không biểu diễn được hai `Args` cho một tên. Bản cũ ở nguyên cho
-- bản app đã cài; bản app mới gọi bản này.
--
-- Mỗi bản kiểm ảnh TRƯỚC khi bài được tạo, rồi gọi bản cũ và gắn ảnh trong
-- CÙNG giao dịch: ảnh hỏng thì không có bài nào, chứ không phải một bài không
-- ảnh. Trigger kiểm lại lần nữa ở câu UPDATE — hai lớp, một luật.

CREATE FUNCTION public.community_art_usable(p_art_id uuid, p_kind text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a public.community_art%ROWTYPE;
BEGIN
  IF p_art_id IS NULL THEN
    RAISE EXCEPTION 'art required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO a FROM public.community_art WHERE id = p_art_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'art not found' USING ERRCODE = 'P0002';
  END IF;
  IF a.kind <> p_kind THEN
    RAISE EXCEPTION 'art kind % does not match post kind %', a.kind, p_kind USING ERRCODE = '22023';
  END IF;
  IF NOT a.active THEN
    RAISE EXCEPTION 'art retired' USING ERRCODE = '22023';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.community_art_usable(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.share_workout_with_art(
  p_session_id uuid,
  p_caption    text,
  p_visibility text,
  p_minutes    integer,
  p_art_id     uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM public.community_art_usable(p_art_id, 'workout');
  v_id := public.share_workout(p_session_id, p_caption, p_visibility, p_minutes);
  UPDATE public.community_posts SET art_id = p_art_id WHERE id = v_id;
  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.share_workout_with_art(uuid, text, text, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.share_workout_with_art(uuid, text, text, integer, uuid) TO authenticated;

CREATE FUNCTION public.share_recipe_with_art(
  p_entry_id   uuid,
  p_title      text,
  p_caption    text,
  p_visibility text,
  p_art_id     uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM public.community_art_usable(p_art_id, 'recipe');
  v_id := public.share_recipe(p_entry_id, p_title, p_caption, p_visibility);
  UPDATE public.community_posts SET art_id = p_art_id WHERE id = v_id;
  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.share_recipe_with_art(uuid, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.share_recipe_with_art(uuid, text, text, text, uuid) TO authenticated;

CREATE FUNCTION public.share_progress_with_art(
  p_weeks            integer,
  p_weight           boolean,
  p_waist            boolean,
  p_lift_exercise_id uuid,
  p_caption          text,
  p_visibility       text,
  p_art_id           uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM public.community_art_usable(p_art_id, 'progress');
  v_id := public.share_progress(p_weeks, p_weight, p_waist, p_lift_exercise_id, p_caption, p_visibility);
  UPDATE public.community_posts SET art_id = p_art_id WHERE id = v_id;
  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.share_progress_with_art(integer, boolean, boolean, uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.share_progress_with_art(integer, boolean, boolean, uuid, text, text, uuid) TO authenticated;
