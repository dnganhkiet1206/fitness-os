/**
 * URL hiển thị của ảnh tiến trình — ký CẢ LOẠT, không một request mỗi ảnh (#179).
 *
 * Trước #179 thư viện đọc 50 ảnh mới nhất và ký từng ảnh một: 50 request cho
 * một lần mở màn. Nay thư viện đọc HẾT (ảnh cũ nhất là ảnh "trước", thứ duy
 * nhất làm cả thư viện có nghĩa), nên ký từng ảnh là một request cho mỗi ảnh
 * người ta từng chụp. `createSignedUrls` ký nhiều đường dẫn trong một lần gọi.
 *
 * Giữ đúng hai điều của bản cũ:
 *   · `photo_url` đã là URL http thì dùng thẳng, không ký;
 *   · ký hỏng (cả loạt hay một ảnh) thì ô vẫn có mặt, với chính đường dẫn làm
 *     `signedUrl` — ảnh không hiện, nhưng ô và nút xoá của nó thì còn. Một lần
 *     ký hỏng không được làm cả thư viện thành "không đọc được".
 *
 * Thuần: không Supabase — `tools/read-all.mjs` chạy thật nó.
 */
export type SignBatch = (
  paths: string[],
) => PromiseLike<{ data: { path: string | null; signedUrl: string | null }[] | null; error: unknown }>;

/** Tối đa bấy nhiêu đường dẫn một lần gọi. */
export const SIGN_CHUNK = 100;

export async function signPhotos<T extends { photo_url: string }>(
  rows: readonly T[],
  sign: SignBatch,
  chunk = SIGN_CHUNK,
): Promise<(T & { signedUrl: string })[]> {
  const paths = [...new Set(rows.map((r) => r.photo_url).filter((p) => !p.startsWith('http')))];
  const url = new Map<string, string>();
  for (let i = 0; i < paths.length; i += chunk) {
    try {
      // không ném (#53): ký hỏng thì ô vẫn có mặt với chính đường dẫn — một lần ký hỏng không được làm cả thư viện "không đọc được".
      const { data, error } = await sign(paths.slice(i, i + chunk));
      if (error) continue;
      for (const d of data ?? []) if (d.path && d.signedUrl) url.set(d.path, d.signedUrl);
    } catch {
      /* như `signed?.signedUrl ?? path` của bản cũ: ô còn, ảnh không hiện */
    }
  }
  return rows.map((r) => ({ ...r, signedUrl: r.photo_url.startsWith('http') ? r.photo_url : (url.get(r.photo_url) ?? r.photo_url) }));
}
