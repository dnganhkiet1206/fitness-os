/**
 * Bình luận một tầng và `@handle` (#30) — phần thuần.
 *
 * Server đã quyết hai thứ, và tệp này chỉ VẼ theo quyết định ấy:
 *   · `parent_id` luôn trỏ vào một bình luận GỐC (trigger chuẩn hoá);
 *   · một `@handle` là một người chỉ khi `community_comment_mentions` có dòng
 *     cho nó — handle có thật, không qua cặp chặn. Chuỗi nào trông giống một
 *     handle mà server không xác nhận thì vẫn là chữ, không phải liên kết:
 *     client không tự đoán ai là ai.
 *
 * Cùng một mẫu với server (`@([a-z0-9_.]*[a-z0-9_])`, không phân biệt hoa
 * thường), nên chữ được tô là đúng chữ server đã đọc ra. Không import gì —
 * `tools/comment-thread.mjs` biên dịch và chạy nó.
 */

export type MentionPart = { text: string; userId?: string };

const HANDLE = /@([a-zA-Z0-9_.]*[a-zA-Z0-9_])/g;

/** Tách thân bình luận thành đoạn chữ và đoạn nhắc (đoạn có `userId`). */
export function mentionParts(body: string, known: ReadonlyMap<string, string>): MentionPart[] {
  const out: MentionPart[] = [];
  let last = 0;
  for (const m of body.matchAll(HANDLE)) {
    const userId = known.get(m[1].toLowerCase());
    if (!userId || m.index === undefined) continue;
    if (m.index > last) out.push({ text: body.slice(last, m.index) });
    out.push({ text: m[0], userId });
    last = m.index + m[0].length;
  }
  if (last < body.length) out.push({ text: body.slice(last) });
  return out.length ? out : [{ text: body }];
}

/**
 * Gốc theo thứ tự đến, mỗi gốc kèm các câu trả lời của nó theo thứ tự đến.
 *
 * Câu trả lời mà gốc không có trong danh sách (gốc bị ẩn với người đọc, hoặc
 * nằm ngoài giới hạn 200 dòng) đứng một mình như một gốc, chứ không biến mất:
 * một câu người ta thấy được thì không được giấu chỉ vì cha của nó không thấy.
 */
export function threadComments<T extends { id: string; parent_id: string | null; created_at: string }>(
  list: readonly T[],
): { root: T; replies: T[] }[] {
  const byTime = [...list].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
  const ids = new Set(byTime.map((c) => c.id));
  const threads = new Map<string, { root: T; replies: T[] }>();
  const order: { root: T; replies: T[] }[] = [];
  for (const c of byTime) {
    if (c.parent_id && ids.has(c.parent_id)) continue;
    const t = { root: c, replies: [] as T[] };
    threads.set(c.id, t);
    order.push(t);
  }
  for (const c of byTime) {
    if (c.parent_id && ids.has(c.parent_id)) threads.get(c.parent_id)?.replies.push(c);
  }
  return order;
}

/** Chữ điền sẵn khi bấm "Trả lời": `@handle ` — như X, người được trả lời đọc thấy tên mình. */
export const replyPrefix = (handle: string | null | undefined) => (handle ? `@${handle} ` : '');

/**
 * Gốc còn thiếu của một trang (#173): `parent_id` của những câu trả lời mà gốc
 * không nằm trong chính trang ấy, mỗi id một lần, theo thứ tự gặp.
 */
export function missingRoots(rows: readonly { id: string; parent_id: string | null }[]): string[] {
  const here = new Set(rows.map((r) => r.id));
  const out: string[] = [];
  for (const r of rows) if (r.parent_id && !here.has(r.parent_id) && !out.includes(r.parent_id)) out.push(r.parent_id);
  return out;
}

/**
 * Các trang (mới → cũ, mỗi trang `rows` + `roots` kèm theo) thành MỘT danh sách
 * cũ → mới, mỗi bình luận một lần: một gốc được tải kèm ở trang này rồi về lại
 * ở trang cũ hơn không được vẽ hai lần.
 */
export function mergeCommentPages<T extends { id: string; created_at: string }>(pages: readonly { rows: readonly T[]; roots: readonly T[] }[]): T[] {
  const byId = new Map<string, T>();
  for (const p of pages) for (const c of [...p.rows, ...p.roots]) if (!byId.has(c.id)) byId.set(c.id, c);
  return [...byId.values()].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
