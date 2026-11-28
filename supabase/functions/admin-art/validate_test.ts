import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { MAX_BYTES, validateArtForm } from "./validate.ts";

/**
 * admin-art's form check (Master Audit 28/11, P2-02 — the function had no
 * test). Every error branch, the happy path, and the normalisation of tags.
 */

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];
const JPG = [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];

function form(over: { bytes?: number[] | Uint8Array; type?: string; noFile?: boolean } & Record<string, unknown> = {}): FormData {
  const f = new FormData();
  if (!over.noFile) {
    const raw: Uint8Array<ArrayBuffer> = new Uint8Array(over.bytes ?? PNG);
    f.set("file", new File([raw], "a", { type: over.type ?? "image/png" }));
  }
  const fields: Record<string, string> = { kind: "workout", style: "neon_1", alt_en: "A bar", alt_vi: "Thanh đòn", tags: "", sort: "" };
  for (const [k, v] of Object.entries(over)) if (k in fields) fields[k] = String(v);
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

async function err(f: FormData) {
  const r = await validateArtForm(f);
  return "error" in r ? [r.error, r.status] : ["ok", 200];
}

Deno.test("a valid png / jpeg / webp passes with the right extension", async () => {
  for (const [bytes, type, ext] of [[PNG, "image/png", "png"], [JPG, "image/jpeg", "jpg"], [WEBP, "image/webp", "webp"]] as const) {
    const r = await validateArtForm(form({ bytes: [...bytes], type }));
    if ("error" in r) throw new Error(`${type}: ${r.error}`);
    assertEquals([r.ext, r.contentType, r.kind, r.style, r.sort], [ext, type, "workout", "neon_1", 0]);
  }
});

Deno.test("no file → file_required 400", async () => {
  assertEquals(await err(form({ noFile: true })), ["file_required", 400]);
});

Deno.test("declared type outside the three → unsupported_type 415", async () => {
  for (const type of ["image/gif", "image/svg+xml", "application/octet-stream", ""]) {
    assertEquals(await err(form({ type })), ["unsupported_type", 415], type);
  }
});

Deno.test("empty or over 1 MiB → file_too_large 413", async () => {
  assertEquals(await err(form({ bytes: [] })), ["file_too_large", 413]);
  const big = new Uint8Array(MAX_BYTES + 1);
  big.set(PNG);
  assertEquals(await err(form({ bytes: big })), ["file_too_large", 413]);
  const exact = new Uint8Array(MAX_BYTES);
  exact.set(PNG);
  assertEquals(await err(form({ bytes: exact })), ["ok", 200]);
});

Deno.test("bytes that do not match the declared type → type_mismatch 415", async () => {
  assertEquals(await err(form({ bytes: JPG, type: "image/png" })), ["type_mismatch", 415]);
  assertEquals(await err(form({ bytes: PNG, type: "image/webp" })), ["type_mismatch", 415]);
  assertEquals(await err(form({ bytes: [0x3c, 0x73, 0x76, 0x67, 0, 0, 0, 0, 0, 0, 0, 0], type: "image/jpeg" })), ["type_mismatch", 415]);
  assertEquals(await err(form({ bytes: PNG.slice(0, 8) })), ["type_mismatch", 415]); // shorter than 12 bytes
});

Deno.test("kind outside the whitelist → invalid_kind 400", async () => {
  for (const kind of ["", "avatar", "../workout", "WORKOUT"]) {
    assertEquals(await err(form({ kind })), ["invalid_kind", 400], kind);
  }
});

Deno.test("style must be lower snake, 1–24 chars, starting with a letter → invalid_style 400", async () => {
  for (const style of ["", "1neon", "Neon", "neon-1", "a/b", "../x", "a".repeat(25)]) {
    assertEquals(await err(form({ style })), ["invalid_style", 400], style);
  }
  assertEquals(await err(form({ style: "a".repeat(24) })), ["ok", 200]);
});

Deno.test("both alts required, each ≤ 200 → alt_required 400", async () => {
  assertEquals(await err(form({ alt_en: "" })), ["alt_required", 400]);
  assertEquals(await err(form({ alt_vi: "   " })), ["alt_required", 400]);
  assertEquals(await err(form({ alt_en: "x".repeat(201) })), ["alt_required", 400]);
  assertEquals(await err(form({ alt_vi: "x".repeat(200) })), ["ok", 200]);
});

Deno.test("sort must be a number → invalid_sort 400; blank means 0", async () => {
  assertEquals(await err(form({ sort: "abc" })), ["invalid_sort", 400]);
  const r = await validateArtForm(form({ sort: " 7 " }));
  assertEquals("error" in r ? r.error : r.sort, 7);
});

Deno.test("tags: trimmed, lower-cased, blanks dropped, at most 12", async () => {
  const many = Array.from({ length: 20 }, (_, i) => ` T${i} `).join(",");
  const r = await validateArtForm(form({ tags: `Legs, ,CHEST,,${many}` }));
  if ("error" in r) throw new Error(r.error);
  assertEquals(r.tags.length, 12);
  assertEquals(r.tags.slice(0, 3), ["legs", "chest", "t0"]);
});
