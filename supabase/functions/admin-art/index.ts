import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { corsHeaders, dbServiceKey, dbUrl, json, opaque, requireUser } from "../_shared/guard.ts";

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
const MAX_BYTES = 1024 * 1024;
const KINDS = new Set(["workout", "progress", "recipe"]);
const STYLE = /^[a-z][a-z0-9_]{0,23}$/;

/** Kiểu ảnh → đuôi tệp và chữ ký byte đầu. */
const TYPES: Record<string, { ext: string; magic: (b: Uint8Array) => boolean }> = {
  "image/png": { ext: "png", magic: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  "image/jpeg": { ext: "jpg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/webp": {
    ext: "webp",
    magic: (b) =>
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
};

const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const caller = await requireUser(req);
    if (caller instanceof Response) return caller;

    const { data: role, error: roleErr } = await caller.supabase.rpc("my_app_role");
    if (roleErr) return opaque(roleErr, "role_lookup_failed");
    if (role !== "admin") return json({ error: "forbidden" }, 403);

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return json({ error: "invalid_form" }, 400);
    }

    const file = form.get("file");
    if (!(file instanceof File)) return json({ error: "file_required" }, 400);
    const type = TYPES[file.type];
    if (!type) return json({ error: "unsupported_type" }, 415);
    if (file.size === 0 || file.size > MAX_BYTES) return json({ error: "file_too_large" }, 413);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length < 12 || !type.magic(bytes)) return json({ error: "type_mismatch" }, 415);

    const kind = text(form.get("kind"));
    const style = text(form.get("style"));
    const altEn = text(form.get("alt_en"));
    const altVi = text(form.get("alt_vi"));
    const tags = text(form.get("tags")).split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 12);
    const sort = Number.parseInt(text(form.get("sort")) || "0", 10);
    if (!KINDS.has(kind)) return json({ error: "invalid_kind" }, 400);
    if (!STYLE.test(style)) return json({ error: "invalid_style" }, 400);
    if (!altEn || !altVi || altEn.length > 200 || altVi.length > 200) return json({ error: "alt_required" }, 400);
    if (!Number.isFinite(sort)) return json({ error: "invalid_sort" }, 400);

    // Tên do server đặt: không ký tự nào của người gọi đi vào đường dẫn ngoài
    // `kind` và `style`, cả hai đã qua danh sách trắng ở trên.
    const path = `${kind}/${style}-${crypto.randomUUID().slice(0, 8)}.${type.ext}`;

    const service = createClient(dbUrl(), dbServiceKey());
    const { error: upErr } = await service.storage.from(BUCKET).upload(path, bytes, {
      contentType: file.type,
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
