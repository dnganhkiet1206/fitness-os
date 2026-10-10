#!/usr/bin/env node
/**
 * Golden cho menu bình luận + ghi chú "đang ẩn" (#527, lát 4) @ fac9ac2.
 *
 * - `hidden`: ánh xạ hàng `community_my_hidden_reasons` của `useHiddenReasons`
 *   (`hooks/use-community.ts:1014`) rồi CHÍNH các biểu thức `r` / `sent` /
 *   `final` / `why` và nhánh hiển thị của `components/ascnd/hidden-notice.tsx`,
 *   chép nguyên văn (file .tsx không biên dịch riêng được).
 * - `deleted`: số trên thẻ một lần xoá lấy đi — `useDeleteComment.onSuccess`
 *   (`:669`) trên CHÍNH `mergeCommentPages` biên dịch (`build.sh`).
 *
 *   node gen-community-moderation.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/community-moderation-golden.json
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { mergeCommentPages } = require('./out/comment-thread.js');

let seed = 4242;
const rnd = (n) => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return Math.floor(seed / 65536) % n;
};
const pick = (xs) => xs[rnd(xs.length)];

// use-community.ts:1022-1031 — nguyên văn.
const mapRow = (r) => ({
  post_id: r.post_id ?? null,
  comment_id: r.comment_id ?? null,
  reporters: Number(r.reporters) || 0,
  top_reason: r.top_reason ?? null,
  review_requested: !!r.review_requested,
  removed: !!r.removed,
  review_upheld: !!r.review_upheld,
});

// hidden-notice.tsx:44-55 + nhánh JSX — nguyên văn, chữ thay bằng tên khoá.
const notice = (data, commentId, askSuccess) => {
  const postId = undefined; // bình luận: `<HiddenNotice commentId={…} compact />`
  const r = data?.find((x) => (postId ? x.post_id === postId : x.comment_id === commentId));
  const sent = !!r?.review_requested || askSuccess;
  const final = r?.removed ? 'removed' : r?.review_upheld ? 'upheld' : null;
  const why = r && r.reporters > 0 ? { key: r.top_reason ? 'why' : 'whyN', n: r.reporters, reason: r.top_reason } : null;
  const step = !r ? 'unknown' : final ? final : sent ? 'sent' : 'canAsk';
  return { why, step };
};

const REASONS = ['spam', 'harassment', 'inappropriate', 'misleading', 'other', null, undefined];
const COUNTS = [0, 1, 2, 3, 7, '2', '0', null, undefined, ''];
const FLAGS = [true, false, null, undefined];
const hidden = [];
for (let i = 0; i < 200; i++) {
  const rows = Array.from({ length: 1 + rnd(3) }, (_, k) => {
    const isPost = rnd(4) === 0;
    return {
      post_id: isPost ? `p${k}` : null,
      comment_id: isPost ? null : pick(['c1', 'c2', 'c3']),
      reporters: pick(COUNTS),
      top_reason: pick(REASONS),
      review_requested: pick(FLAGS),
      removed: rnd(5) === 0 ? true : pick([false, null]),
      review_upheld: rnd(5) === 0 ? true : pick([false, null]),
    };
  });
  const own = rows.filter((r) => r.comment_id);
  const commentId = own.length && rnd(4) ? pick(own).comment_id : pick(['c1', 'c2', 'c3']);
  const askSuccess = rnd(4) === 0;
  const loaded = rnd(6) !== 0;
  hidden.push({
    rows: loaded ? rows : null,
    commentId,
    askSuccess,
    out: notice(loaded ? rows.map(mapRow) : undefined, commentId, askSuccess),
  });
}

const TIMES = ['2026-10-09T10:00:00+00:00', '2026-10-09T11:00:00+00:00', '2026-10-10T09:00:00+00:00'];
const deleted = [];
for (let i = 0; i < 80; i++) {
  const mk = () => ({ id: `d${rnd(9)}`, parent_id: pick([null, `d${rnd(3)}`]), created_at: pick(TIMES) });
  const pages = Array.from({ length: 1 + rnd(3) }, () => ({
    rows: Array.from({ length: rnd(6) }, mk),
    roots: Array.from({ length: rnd(2) }, mk),
  }));
  const commentId = `d${rnd(4)}`;
  // use-community.ts:684-686 — nguyên văn.
  const seen = mergeCommentPages(pages);
  const gone = 1 + seen.filter((c) => c.parent_id === commentId).length;
  deleted.push({ pages, commentId, out: gone });
}

process.stdout.write(JSON.stringify({ hidden, deleted }, null, 1) + '\n');
