/**
 * admin-art: the form check, pulled out of `index.ts` so tests can drive it
 * (28/11, Master Audit P2-02 — importing `index.ts` starts `serve()`, so this
 * part had no test at all). Rules and error codes are unchanged, line for line.
 *
 * The declared type is something anyone can type, so it must match the file's
 * first bytes. The 1 MiB ceiling and the three image types match the bucket's
 * own limits — the bucket stays the last line; this only answers early with a
 * readable code.
 */

export const MAX_BYTES = 1024 * 1024;
/** The whole multipart body may carry the file plus a handful of short text
    fields and boundaries; anything declared beyond this cannot be a valid
    request and is refused before `formData()` buffers it. */
export const MAX_FORM_BYTES = MAX_BYTES + 64 * 1024;
export const KINDS = new Set(["workout", "progress", "recipe"]);
export const STYLE = /^[a-z][a-z0-9_]{0,23}$/;

/** Image type → file extension and first-byte signature. */
export const TYPES: Record<string, { ext: string; magic: (b: Uint8Array) => boolean }> = {
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

export interface ArtForm {
  bytes: Uint8Array;
  contentType: string;
  ext: string;
  kind: string;
  style: string;
  altEn: string;
  altVi: string;
  tags: string[];
  sort: number;
}

export type ArtFormError = { error: string; status: number };

/** The validated upload, or the error code and status to answer with. */
export async function validateArtForm(form: FormData): Promise<ArtForm | ArtFormError> {
  const file = form.get("file");
  if (!(file instanceof File)) return { error: "file_required", status: 400 };
  const type = TYPES[file.type];
  if (!type) return { error: "unsupported_type", status: 415 };
  if (file.size === 0 || file.size > MAX_BYTES) return { error: "file_too_large", status: 413 };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length < 12 || !type.magic(bytes)) return { error: "type_mismatch", status: 415 };

  const kind = text(form.get("kind"));
  const style = text(form.get("style"));
  const altEn = text(form.get("alt_en"));
  const altVi = text(form.get("alt_vi"));
  const tags = text(form.get("tags")).split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 12);
  const sort = Number.parseInt(text(form.get("sort")) || "0", 10);
  if (!KINDS.has(kind)) return { error: "invalid_kind", status: 400 };
  if (!STYLE.test(style)) return { error: "invalid_style", status: 400 };
  if (!altEn || !altVi || altEn.length > 200 || altVi.length > 200) return { error: "alt_required", status: 400 };
  if (!Number.isFinite(sort)) return { error: "invalid_sort", status: 400 };

  return { bytes, contentType: file.type, ext: type.ext, kind, style, altEn, altVi, tags, sort };
}
