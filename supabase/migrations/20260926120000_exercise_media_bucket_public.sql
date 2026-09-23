-- Bucket `exercise-media` phải CÔNG KHAI, và nó chưa hề như thế.
--
-- ── lỗi, chính xác ở đâu ──
--
-- `20260924120000_exercise_media_bucket.sql` mở đầu bằng:
--
--     INSERT INTO storage.buckets (id, name, public)
--     VALUES ('exercise-media', 'exercise-media', true)
--     ON CONFLICT (id) DO NOTHING;
--
-- Bucket đã tồn tại TRƯỚC khi migration ấy chạy, nên `DO NOTHING` làm đúng
-- nghĩa của nó: không chèn gì, và giữ nguyên `public` cũ — tức `false`.
--
-- Lệnh `UPDATE` ngay sau đó chỉ đặt `file_size_limit` và
-- `allowed_mime_types`. Nó KHÔNG đụng tới `public`.
--
-- Hệ quả đo được: `supabase storage ls` thấy bucket và thấy đủ bốn object —
-- vì CLI đi qua token quản trị — trong khi URL công khai trả
--
--     {"statusCode":"404","error":"Bucket not found","code":"NoSuchBucket"}
--
-- Hai câu trả lời trái ngược nhau về cùng một bucket, và cả hai đều đúng:
-- object có thật, còn cửa công khai thì đóng.
--
-- ── và vì sao PHÉP KIỂM của chính migration ấy không bắt được ──
--
-- Nó có một phép đọc lại, và phép ấy hỏi SAI CÂU:
--
--     GET DIAGNOSTICS touched = ROW_COUNT;
--     IF touched <> 1 THEN RAISE EXCEPTION …
--
-- "UPDATE khớp một hàng" và "hàng đó nay nói điều ta muốn" là hai mệnh đề
-- khác nhau. Lệnh UPDATE khớp đúng một hàng và đặt đúng hai cột nó liệt kê,
-- nên phép kiểm xanh — trong khi cột quyết định cả tính năng không nằm trong
-- danh sách ấy.
--
-- Đó là một phép kiểm đo sai thứ, và nó tệ hơn không có phép kiểm nào: nó tạo
-- ra niềm tin rằng chuyện đã xong. Nên migration này kiểm bằng cách ĐỌC LẠI
-- GIÁ TRỊ, không đếm hàng.
--
-- ── vì sao SỬA BẰNG MỘT MIGRATION MỚI ──
--
-- `20260924120000` đã chạy trên project thật. Sửa nội dung một migration đã
-- áp là sửa một lịch sử mà mọi máy khác tin là bất biến: máy đã chạy nó sẽ
-- không chạy lại, nên bản sửa chỉ có tác dụng trên máy CHƯA chạy — và hai
-- project từ đó khác nhau mà không gì nói ra.
--
-- ── thứ migration này KHÔNG làm ──
--
-- Không xoá và dựng lại bucket (mọi object sẽ đi theo). Không đụng một object
-- nào. Không thêm, sửa hay xoá policy nào trên `storage.objects` — bucket vẫn
-- KHÔNG có quyền ghi cho client, đúng như `20260924120000` đã chốt và với
-- đúng lý do ấy: chưa màn nào trong app cho người dùng thêm media.
--
-- Hai cột kia được ĐẶT LẠI cùng giá trị cũ, không phải vì chúng sai, mà để
-- một dòng lệnh duy nhất nói ra TOÀN BỘ trạng thái mà bucket này phải có.
-- Trạng thái nằm rải ở hai migration là trạng thái phải ghép lại mới đọc được,
-- và chính chuyện phải ghép là cách lỗi trên lọt qua.

DO $$
DECLARE
  touched integer;
  got_public boolean;
  got_limit bigint;
  got_types text[];
BEGIN
  UPDATE storage.buckets
     SET public = true,
         file_size_limit = 5242880,                    -- 5 MiB
         allowed_mime_types = ARRAY['image/webp', 'image/jpeg', 'image/png']
   WHERE id = 'exercise-media';

  GET DIAGNOSTICS touched = ROW_COUNT;
  IF touched <> 1 THEN
    RAISE EXCEPTION
      'bucket exercise-media không tồn tại (UPDATE khớp % hàng) — không có gì để mở công khai, và migration 20260924120000 hẳn đã không chạy',
      touched;
  END IF;

  -- ĐỌC LẠI GIÁ TRỊ, không đếm hàng. Đây là vế mà bản trước thiếu.
  SELECT b.public, b.file_size_limit, b.allowed_mime_types
    INTO got_public, got_limit, got_types
    FROM storage.buckets b
   WHERE b.id = 'exercise-media';

  IF got_public IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'bucket exercise-media vẫn không công khai sau UPDATE (public = %) — URL công khai sẽ tiếp tục trả NoSuchBucket',
      got_public;
  END IF;

  IF got_limit IS DISTINCT FROM 5242880 THEN
    RAISE EXCEPTION 'trần dung lượng của exercise-media là % byte, phải là 5242880', got_limit;
  END IF;

  IF got_types IS DISTINCT FROM ARRAY['image/webp', 'image/jpeg', 'image/png'] THEN
    RAISE EXCEPTION 'danh sách kiểu tệp của exercise-media là %, không phải ba kiểu ảnh đã chốt', got_types;
  END IF;
END $$;
