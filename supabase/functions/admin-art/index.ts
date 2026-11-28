import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.0";

import { corsHeaders, dbServiceKey, dbUrl, json, opaque, requireUser } from "../_shared/guard.ts";
import { MAX_FORM_BYTES, validateArtForm } from "./validate.ts";

/**
 * Thêm một ảnh vào thư viện ảnh Cộng đồng — chỉ admin.
 *
 * ── vì sao phải là một function ──
 *
 * Bucket `community-art` không có policy GHI nào cho client (20261002110000):
 * người dùng không tải ảnh lên, và một policy "admin được ghi" sẽ phải đọc vai
 * trò từ `storage.objects` — tức đụng vào bảng hệ thống, điều chủ dự án đã cấm.
 * Nên tệp vào bằng service_role, ở ĐÂY, sau khi người gọi đã được hỏi vai trò.
 *
 * ── vai trò được hỏi HAI lần, ở hai nơi ──
 *
 * 1. `my_app_role()` bằng chính token của người gọi, TRƯỚC khi chạm Storage:
 *    không phải admin thì 403 và không byte nào được ghi.
 * 2. `admin_add_art` cũng bằng token ấy, nên database tự kiểm lại
 *    (`moderation_require(true)`) và ghi ADD_IMAGE vào nhật ký với đúng người
 *    làm. Function này KHÔNG ghi `community_art` bằng service_role — làm thế là
 *    nhật ký mất tên người thêm ảnh.
 *
 * Danh tính đến từ token, không bao giờ từ body. Không email nào được so ở đây.
 *
 * ── tệp được kiểm như một tệp lạ ──
 *
 * Kiểu khai trong form là thứ ai cũng gõ được, nên nó phải khớp với mấy byte
 * đầu của tệp. Trần 1 MiB và ba kiểu ảnh trùng với trần của bucket — bucket vẫn
 * là lớp cuối, đây chỉ là lớp trả lời sớm với một mã đọc được.
 *
 * Thêm ảnh hỏng giữa chừng (tệp lên rồi mà hàng không ghi được) thì tệp bị gỡ
 * lại: một tệp mồ côi trong bucket không hại ai, nhưng nó cũng không ai dọn.
 */

const BUCKET = "community-art";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const caller = await requireUser(req);
    if (caller instanceof Response) return caller;

    const { data: role, error: roleErr } = await caller.supabase.rpc("my_app_role");
    if (roleErr) return opaque(roleErr, "role_lookup_failed");
    if (role !== "admin") return json({ error: "forbidden" }, 403);

    /* Refused before formData() buffers it: a declared body past the file
       ceiling plus room for the text fields cannot be a valid upload. */
    const declared = Number(req.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_FORM_BYTES) return json({ error: "file_too_large" }, 413);

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return json({ error: "invalid_form" }, 400);
    }

    const checked = await validateArtForm(form);
    if ("error" in checked) return json({ error: checked.error }, checked.status);
    const { bytes, contentType, ext, kind, style, altEn, altVi, tags, sort } = checked;

    // Tên do server đặt: không ký tự nào của người gọi đi vào đường dẫn ngoài
    // `kind` và `style`, cả hai đã qua danh sách trắng ở trên.
    const path = `${kind}/${style}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

    const service = createClient(dbUrl(), dbServiceKey());
    const { error: upErr } = await service.storage.from(BUCKET).upload(path, bytes, {
      contentType,
      upsert: false,
    });
    if (upErr) return opaque(upErr, "upload_failed");

    const { data: id, error: addErr } = await caller.supabase.rpc("admin_add_art", {
      p_kind: kind,
      p_style: style,
      p_tags: tags,
      p_path: path,
      p_alt_en: altEn,
      p_alt_vi: altVi,
      p_sort: sort,
    });
    if (addErr) {
      await service.storage.from(BUCKET).remove([path]);
      // 42501 ở đây nghĩa là vai trò bị thu hồi giữa hai lời gọi.
      if (addErr.code === "42501") return json({ error: "forbidden" }, 403);
      return opaque(addErr, "add_failed", addErr.code === "22023" || addErr.code === "23514" ? 400 : 500);
    }
    return json({ id, path });
  } catch (e) {
    return opaque(e, "admin_art_failed");
  }
});
