-- Kho chứa media hướng dẫn — một BUCKET, không phải một thư mục trong app.
--
-- ── vì sao Storage chứ không gói kèm vào app ──
--
-- `exercise_media.uri` được tiêu thụ đúng một cách trong toàn bộ mã:
--
--     <Image source={{ uri }} />        guide-media.tsx, media-viewer.tsx
--
-- tức một URL MẠNG. Đường ảnh gói kèm (`require()`) tồn tại đúng một chỗ —
-- `DEMO_HERO` — và nó được đánh dấu TẠM ngay tại đó, vì một tấm ảnh gói kèm đi
-- vào binary: thêm bốn ảnh cho một bài tập, rồi bốn ảnh nữa cho bài sau, là
-- dựng một app mà mỗi lần thêm nội dung phải phát hành lại qua App Store.
--
-- Nội dung hướng dẫn là DỮ LIỆU, không phải mã. Nó thuộc về nơi dữ liệu sống.
--
-- ── công khai, và vì sao điều đó đúng ở đây ──
--
-- Khác `progress-photos` — ảnh cơ thể của một người, phải ký URL và phải khoá
-- theo thư mục của chính họ — media hướng dẫn giống hệt nhau cho mọi người và
-- không nói gì về ai cả. Một URL ký sẵn ở đây chỉ thêm một vòng mạng và một
-- hạn dùng để hết hạn giữa lúc người ta đang đọc.
--
-- Nên bucket công khai ĐỌC, và ai thấy được bài tập thì vẫn là câu hỏi của
-- `exercise_media` — hàng media của một bài riêng tư không lộ ra qua RLS của
-- bảng ấy, kể cả khi tệp phía sau đọc được bằng URL.
--
-- ── KHÔNG có policy GHI cho client ──
--
-- Cùng lý do đã ghi ở `exercise_media` và `exercise_guide_content`: không màn
-- nào trong app cho người dùng thêm media hướng dẫn. Cấp một quyền ghi không
-- ai dùng là mở một lỗ không có tính năng nào ở sau. Media vào đây bằng tay
-- (bảng điều khiển Supabase hoặc `supabase storage cp`), và khi có màn quản
-- trị thì policy tới cùng màn ấy.

INSERT INTO storage.buckets (id, name, public)
VALUES ('exercise-media', 'exercise-media', true)
ON CONFLICT (id) DO NOTHING;

-- ── trần dung lượng và danh sách kiểu tệp ──
--
-- 5 MiB, ĐÚNG trần mà `20260812120000_progress_photos_limits.sql` đã chọn. Lấy
-- lại con số ấy chứ không nghĩ ra một con số mới, vì ở đây chưa có phép đo nào
-- để biện minh cho một con số khác — và bốn tệp của lượt đầu tiên đo được
-- 137–204 KB, tức dưới trần hai bậc độ lớn. Đây là trần chặn lạm dụng, không
-- phải một phép siết chất lượng.
--
-- CHỈ ẢNH, cố ý. `exercise_media.kind` có `'video'`, và một ngày nào đó bucket
-- này sẽ phải nhận `video/mp4`. Hôm nay thì không: đặt hàng của lượt này nói
-- thẳng *"Do not introduce a new video for this task"*, và một kiểu tệp được
-- cho phép mà không có gì dùng là đúng thứ lập luận "không cấp quyền ghi" ở
-- trên đang từ chối. Khi video thật đến, nó đến cùng một dòng ALTER và một
-- phép đo về kích cỡ.
--
-- ── và số hàng được ĐỌC LẠI ──
--
-- Một `UPDATE ... WHERE id = …` trần không thể thất bại: bucket vắng mặt thì
-- lệnh khớp 0 hàng, báo thành công, và migration được ghi là đã chạy — để lại
-- một bucket KHÔNG trần dung lượng và KHÔNG giới hạn kiểu tệp trong khi mọi
-- bản ghi đều nói rằng giới hạn đang ở đó. Cùng cái bẫy mà migration
-- `progress_photos_limits` đã ghi lại, nên cùng cách phòng.
DO $$
DECLARE
  touched integer;
BEGIN
  UPDATE storage.buckets
     SET file_size_limit = 5242880,                    -- 5 MiB
         allowed_mime_types = ARRAY['image/webp', 'image/jpeg', 'image/png']
   WHERE id = 'exercise-media';

  GET DIAGNOSTICS touched = ROW_COUNT;
  IF touched <> 1 THEN
    RAISE EXCEPTION
      'bucket exercise-media không tồn tại (UPDATE khớp % hàng) — trần dung lượng và danh sách kiểu tệp KHÔNG được áp dụng',
      touched;
  END IF;
END $$;
