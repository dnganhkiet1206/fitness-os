/**
 * Máy chủ Supabase giả, DÙNG CHUNG cho `live.mjs` và mọi đầu dò trên trình duyệt (#39).
 *
 * ── vì sao tách ra ──
 *
 * Bốn đầu dò hiệu năng (`deck-swipe`, `frame-churn`, `koa-breath`,
 * `tab-latency`) từng tự dựng route REST riêng trả `FIXTURES[bảng]` NGUYÊN BẢNG:
 * không qua `applyQuery` (#17 — `.eq()` không lọc, nên `maybeSingle()` của hồ sơ
 * cộng đồng ném PGRST116), không `order=`, không `requestRejection` (#35/#40),
 * không RPC (#38), không nhớ lệnh ghi (#52). Chúng đo khung hình và độ trễ trên
 * một thế giới mà nhiều màn đang ở trạng thái LỖI — một con số hiệu năng của màn
 * lỗi không phải con số của màn thật. Nay mọi `page.route('**' + '/*.supabase.co/**')`
 * trong `tools/` đi qua hàm này (`fake-rest.mjs` canh điều đó), nên sửa máy chủ
 * giả một chỗ là sửa cho mọi phép đo.
 *
 * `world`: thế giới của TRANG — lệnh ghi áp vào nó (#52), RPC tính từ nó (#38).
 * Người gọi dựng bản sao (`structuredClone(FIXTURES)`, hay thế giới "nặng" của
 * `tab-latency`). `mode`: `'full'` · `'empty'` (người gọi đưa thế giới chỉ có
 * hồ sơ) · `'fail'` (mọi REST trả 500). `report`: các Set để ghi lại điều máy
 * chủ giả đã phải từ chối hay không làm được, liệt kê cuối lượt của `live.mjs`
 * — `rpcArgMisses`, `rpcUnfixtured`, `selectMisses`, `writesNotApplied`; thiếu
 * Set nào thì điều ấy không được ghi.
 */
import { RPC_FIXTURES } from './live-rpc.mjs';
import { MISSING_ART_FILES, UID, applyQuery, contentRange, embedRows } from './live-world.mjs';
import { applyWrite, unsupportedFilters } from './live-writes.mjs';
import { deflateSync } from 'node:zlib';
import { TYPE_RELATIONSHIPS, requestRejection, rpcArgsRejection } from './postgrest-select.mjs';

export function fakeSupabase({ world, mode = 'full', report = {} }) {
  const note = (kind, what) => report[kind]?.add(what);
  return async (r) => {
    const u = new URL(r.request().url());
    if (u.pathname.startsWith('/rest/v1/')) {
      if (mode === 'fail') {
        return r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"server error"}' });
      }
      const table = u.pathname.split('/')[3];
      /* #38: `/rest/v1/rpc/<tên>` là một lời gọi hàm, không phải bảng `rpc`.
         Trước đây nó rơi vào nhánh bảng dưới đây và luôn nhận `[]`, nên thẻ
         thử thách, gợi ý theo dõi, tìm người và bản xem trước Tiến trình chỉ
         từng được quét ở trạng thái rỗng. Nay: đối số phải khớp chữ ký trong
         `types.ts` (không thì 404 / PGRST202 như PostgREST), rồi kết quả tính
         từ CÙNG thế giới với các bảng (`tools/live-rpc.mjs`). Hàm không có
         fixture vẫn nhận `[]` như cũ, và được liệt kê cuối lượt. */
      if (table === 'rpc') {
        const fn = u.pathname.split('/')[4];
        const req = r.request();
        let args = {};
        if (req.method() === 'GET') args = Object.fromEntries(u.searchParams);
        else if (req.postData()) { try { args = JSON.parse(req.postData()); } catch { args = {}; } }
        const badArgs = rpcArgsRejection(fn, args);
        if (badArgs) {
          note(
            'rpcArgMisses',
            `rpc/${fn}(${Object.keys(args).join(', ')}) — ` +
              [badArgs.extra.length && `thừa ${badArgs.extra.join(', ')}`, badArgs.missing.length && `thiếu ${badArgs.missing.join(', ')}`]
                .filter(Boolean).join('; '),
          );
          return r.fulfill({ status: badArgs.status, contentType: 'application/json', body: JSON.stringify(badArgs.body) });
        }
        const fx = RPC_FIXTURES[fn];
        if (!fx) {
          note('rpcUnfixtured', fn);
          return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
        }
        try {
          const out = fx.run(args, world);
          const one = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
          return r.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify(one && Array.isArray(out) ? (out[0] ?? null) : out),
          });
        } catch (e) {
          if (!e.rpc) throw e;
          /* Mã HTTP theo bảng của PostgREST cho đúng những mã hàm SQL ném (#80):
             23505 → 409 (bấm Nhận lần hai), 42501 → 403, P0002 → 404, còn lại 400. */
          const status = { 23505: 409, 42501: 403, P0002: 404 }[e.rpc.code] ?? 400;
          return r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(e.rpc) });
        }
      }
      /* #35: `select=` hỏi một cột không có thật thì trả 400 như PostgREST, và
         ghi lại — một lượt quét màn hay một kịch bản có thể chỉ thấy một toast
         lỗi (hay không thấy gì), còn danh sách này nói đúng bảng và cột.
         Trước đây máy chủ giả trả hàng bất kể câu hỏi, nên bốn lệnh xoá hỏi
         `RETURNING id` trên bảng không có `id` (c227cfe) xanh ở đây suốt. */
      /* #40: không chỉ `select=` — bộ lọc, `or=`/`and=`, `order=`, `on_conflict=`,
         `columns=` (42703) và khoá của thân POST/PATCH (PGRST204) cũng phải là
         cột có thật. Trước #40, `.eq('user_idd', …)` gõ nhầm cho một màn
         "trống" ở đây, còn trên server thật nó hỏng. */
      const rejected = requestRejection(u, r.request().method(), r.request().postData());
      if (rejected) {
        note(
          'selectMisses',
          `${r.request().method()} ${table} (${rejected.where}${rejected.where === 'select=' ? u.searchParams.get('select') : ''}) — không có cột ${rejected.bad.join(', ')}`,
        );
        return r.fulfill({ status: rejected.status, contentType: 'application/json', body: JSON.stringify(rejected.body) });
      }
      /* `applyQuery` lọc `eq`/`neq`/`in`/`is` (từ #17), rồi đọc `order=` và
         `limit=` — xem chú thích của nó trong `live-world.mjs`. Không đọc
         `gte`/`lt`; giới hạn ấy ghi ở kịch bản "nhật ký ngày khác" của
         `live.mjs` và vẫn còn nguyên. */
      const req = r.request();
      const limited = reportLimit(world, table, req.method()) ?? postingGuard(world, table, req.method());
      if (limited) return r.fulfill(limited);
      const before = table === 'community_reports' ? (world.community_reports ?? []).length : 0;
      const wrote = applyWrite(world, table, req.method(), u, req.postData(), req.headers());
      if (table === 'community_reports' && wrote) reportsAfterInsert(world, before);
      if (wrote) {
        if (!wrote.applied) note('writesNotApplied', `${req.method()} ${table} (${unsupportedFilters(u).join(', ')})`);
        return r.fulfill({ status: wrote.status, contentType: 'application/json', body: wrote.body });
      }
      const seen = readable(world, table, world[table] ?? []);
      const rows = applyQuery(seen, u);
      /* #140: tài nguyên nhúng một tầng; nhúng không dựng được thì ghi ra. */
      const embedded = embedRows(world, table, rows, u, TYPE_RELATIONSHIPS);
      for (const x of embedded.unsupported) note('selectMisses', `nhúng không dựng được: ${x}`);
      const single = (r.request().headers()['accept'] ?? '').includes('vnd.pgrst.object');
      /* #70: số đếm đi trong `Content-Range`, không trong thân — và `HEAD`
         (`head: true`) có thân rỗng. Header ấy không nằm trong danh sách mà một
         trang khác nguồn được đọc, nên Supabase thật khai nó ở
         `Access-Control-Expose-Headers`; máy chủ giả làm y vậy. */
      return r.fulfill({
        status: 200, contentType: 'application/json',
        headers: {
          'content-range': contentRange(seen, u, rows.length, req.headers()['prefer'] ?? ''),
          'access-control-expose-headers': 'Content-Range',
        },
        body: req.method() === 'HEAD' ? '' : JSON.stringify(single ? (embedded.rows[0] ?? null) : embedded.rows),
      });
    }
    /*
      #163: tệp của thư viện ảnh app (bucket công khai `community-art`). Đường dẫn
      có trong `community_art` của thế giới → một PNG THẬT, mỗi đường dẫn một
      màu (để "đổi phong cách thì ảnh đổi" đo được bằng mắt lẫn bằng `src`);
      không có → 404, đúng như Storage, để nhánh "ảnh tải hỏng" của thẻ bài có
      chỗ để chạy.
    */
    const artPrefix = '/storage/v1/object/public/community-art/';
    if (u.pathname.startsWith(artPrefix)) {
      const path = decodeURIComponent(u.pathname.slice(artPrefix.length));
      const known = (world.community_art ?? []).some((a) => a.path === path) && !MISSING_ART_FILES.has(path);
      if (mode === 'fail' || !known) {
        return r.fulfill({ status: mode === 'fail' ? 500 : 404, contentType: 'application/json', body: '{"message":"Object not found"}' });
      }
      return r.fulfill({ status: 200, contentType: 'image/png', body: solidPng(path) });
    }
    return r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: UID, aud: 'authenticated', role: 'authenticated' }),
    });
  };
}

/* Một PNG 32×18 một màu, màu suy ra từ chuỗi — đủ để trình duyệt giải mã thật. */
function solidPng(seed) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const rgb = [h & 255, (h >>> 8) & 255, (h >>> 16) & 255];
  const W = 32;
  const H = 18;
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) rgb.forEach((v, i) => (raw[y * (W * 3 + 1) + 1 + x * 3 + i] = v));
  const crc = (buf) => {
    let c = ~0;
    for (const b of buf) {
      c ^= b;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

/*
  Policy đọc bài và bình luận của cộng đồng, mô phỏng (A 04/10, việc #7 ở #6).

  Trước đây bộ chạy KHÔNG mô phỏng RLS: bài `hidden` của người khác, bài
  chỉ-người-theo-dõi của người mình không theo dõi, bài của người đã chặn
  nhau — đều được trả về. Kịch bản thẻ "Hành trình" đo ra điều ấy: thêm một bài
  ẩn của người khác vào thế giới thì app ĐẾM nó, trong khi trên Postgres thật
  policy đã lọc mất. Mọi phép đo về "người xem không thấy X" vì vậy mù ở live.

  Chép đúng ba vế của policy SELECT (`20260927120000_community_foundation.sql`
  và các bản sửa): của mình thì luôn thấy; của người khác thì phải KHÔNG ẩn,
  không chặn nhau (hai chiều), và công khai HOẶC mình đang theo dõi. Bình luận:
  của mình luôn thấy; của người khác phải không ẩn, không chặn nhau, và bài cha
  phải đọc được.
*/
export function readable(world, table, rows) {
  if (table !== 'community_posts' && table !== 'community_comments') return rows;
  const blocks = world.community_blocks ?? [];
  const blocked = (a, b) => blocks.some((x) => (x.blocker_id === a && x.blocked_id === b) || (x.blocker_id === b && x.blocked_id === a));
  const follows = (b) => (world.community_follows ?? []).some((f) => f.follower_id === UID && f.followee_id === b);
  /* Policy RESTRICTIVE của 20261007220000 (#6): bài mình ẩn riêng và bài của
     người mình đang tắt tiếng (còn hạn) — chỉ với bài, không với bình luận. */
  const hid = (id) => (world.community_post_hides ?? []).some((h) => h.user_id === UID && h.post_id === id);
  const now = new Date().toISOString();
  const muted = (a) => (world.community_mutes ?? []).some((m) => m.user_id === UID && m.muted_id === a && m.until > now);
  const postOk = (p) =>
    p.author_id === UID || (!p.hidden && !blocked(UID, p.author_id) && (p.visibility !== 'followers' || follows(p.author_id)));
  if (table === 'community_posts') return rows.filter((p) => postOk(p) && (p.author_id === UID || (!hid(p.id) && !muted(p.author_id))));
  const posts = new Map((world.community_posts ?? []).map((p) => [p.id, p]));
  return rows.filter((c) => {
    if (c.author_id === UID) return true;
    const parent = posts.get(c.post_id);
    return !c.hidden && !blocked(UID, c.author_id) && (!parent || postOk(parent));
  });
}

/*
  Hai trigger của báo cáo (20261007220000, #6), mô phỏng:

  trần     BEFORE INSERT: đã có ≥ 10 báo cáo trong 24 giờ → 54000. PostgREST
           trả lớp 54 bằng HTTP 500, nên máy chủ giả cũng vậy.
  ẩn riêng AFTER INSERT: báo cáo một bài thì bài ấy ẩn với chính người báo cáo.

  `counted` (người báo cáo đủ điều kiện) KHÔNG mô phỏng: người dùng của thế
  giới giả là tài khoản cũ có hoạt động, và client không đọc lại cột ấy.
*/
export const REPORT_DAILY_LIMIT = 10;

function reportLimit(world, table, method) {
  if (table !== 'community_reports' || method !== 'POST') return null;
  const since = new Date(Date.now() - 86400000).toISOString();
  const n = (world.community_reports ?? []).filter((x) => x.reporter_id === UID && x.created_at > since).length;
  if (n < REPORT_DAILY_LIMIT) return null;
  return {
    status: 500, contentType: 'application/json',
    body: JSON.stringify({ code: '54000', details: null, hint: null, message: 'report limit reached: at most 10 reports per 24 hours' }),
  };
}

function reportsAfterInsert(world, before) {
  const hides = (world.community_post_hides ??= []);
  for (const x of (world.community_reports ?? []).slice(before)) {
    if (x.post_id && !hides.some((h) => h.user_id === x.reporter_id && h.post_id === x.post_id)) {
      hides.push({ user_id: x.reporter_id, post_id: x.post_id, created_at: new Date().toISOString() });
    }
  }
}

/*
  Cửa đăng của 20261007235000, mô phỏng cho bình luận (bài sinh qua hàm share_*
  — fixture của chúng ở live-rpc.mjs): đang bị tạm khoá → CR001 (PostgREST:
  lớp lạ → 400); ≥ 30 bình luận trong 60 phút → 54000 (HTTP 500).
*/
function postingGuard(world, table, method) {
  if (table !== 'community_comments' || method !== 'POST') return null;
  const now = new Date().toISOString();
  if ((world.community_restrictions ?? []).some((x) => x.user_id === UID && x.until > now)) {
    return { status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'CR001', details: null, hint: null, message: 'posting restricted' }) };
  }
  const since = new Date(Date.now() - 3600e3).toISOString();
  if ((world.community_comments ?? []).filter((c) => c.author_id === UID && c.created_at > since).length >= 30) {
    return { status: 500, contentType: 'application/json', body: JSON.stringify({ code: '54000', details: null, hint: null, message: 'comment limit reached' }) };
  }
  return null;
}

