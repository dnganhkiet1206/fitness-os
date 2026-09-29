-- Kho tệp của thư viện ảnh Cộng đồng (#163) — một BUCKET, theo đúng mẫu đã
-- chạy được trên production ở `20260924120000_exercise_media_bucket.sql`.
--
-- ── vì sao Storage chứ không gói kèm vào app ──
--
-- Ảnh của bài chia sẻ là DỮ LIỆU: admin thêm một phong cách mới, hay tắt một
-- ảnh cũ, mà không phải phát hành lại qua App Store. `community_art.path` trỏ
-- vào đây; app dựng URL công khai từ đường dẫn ấy.
--
-- ── công khai ĐỌC, và vì sao điều đó đúng ở đây ──
--
-- Khác `progress-photos` (ảnh cơ thể của một người: riêng tư, URL ký, khoá theo
-- thư mục), ảnh thư viện giống hệt nhau cho mọi người và không nói gì về ai.
-- Một URL ký chỉ thêm một vòng mạng và một hạn dùng hết giữa lúc cuộn feed.
--
-- ── KHÔNG có policy GHI nào cho client ──
--
-- Chủ dự án: người dùng không tải ảnh lên, chỉ admin thêm ảnh. Nên không một
-- policy INSERT/UPDATE/DELETE nào trên `storage.objects` cho bucket này; ảnh vào
-- bằng service_role (bảng điều khiển Supabase hoặc `supabase storage cp`).
--
-- ── ràng buộc đứng khi đụng Storage (chủ dự án, xem docs/COMMUNITY-BRIEF.md) ──
--
-- Không grant, không ALTER, không COMMENT ON bảng hệ thống. Tạo bằng
-- `INSERT … ON CONFLICT (id) DO NOTHING`, rồi chỉ `UPDATE` đúng hàng của mình,
-- và đòi đúng một hàng bị chạm — một trần không được áp là một trần im lặng.

INSERT INTO storage.buckets (id, name, public)
VALUES ('community-art', 'community-art', true)
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  touched integer;
BEGIN
  UPDATE storage.buckets
     SET file_size_limit = 1048576,                    -- 1 MiB: một thẻ feed, không phải ảnh in
         allowed_mime_types = ARRAY['image/webp', 'image/png', 'image/jpeg']
   WHERE id = 'community-art';

  GET DIAGNOSTICS touched = ROW_COUNT;
  IF touched <> 1 THEN
    RAISE EXCEPTION
      'bucket community-art không tồn tại (UPDATE khớp % hàng) — trần dung lượng và danh sách kiểu tệp KHÔNG được áp dụng',
      touched;
  END IF;
END $$;
