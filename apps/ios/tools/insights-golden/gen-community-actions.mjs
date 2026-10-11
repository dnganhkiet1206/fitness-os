#!/usr/bin/env node
/**
 * Golden cho thích / lưu (#527, lát 6) @ fac9ac2: `onMutate` / `onError` của
 * `useToggle` (`hooks/use-community.ts`) — chép nguyên văn, chạy trên mọi tổ
 * hợp cờ × bộ đếm × bật/tắt.
 *
 *   node gen-community-actions.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/community-actions-golden.json
 */
const onMutate = (p, flag, count, on) =>
  p[flag] === on ? p : { ...p, [flag]: on, [count]: Math.max(0, p[count] + (on ? 1 : -1)) };
const onError = (p, flag, on) => (p[flag] === on ? { ...p, [flag]: !on } : p);

const toggle = [];
for (const [flag, count] of [['liked', 'like_count'], ['saved', 'save_count']]) {
  for (const liked of [false, true]) {
    for (const saved of [false, true]) {
      for (const n of [0, 1, 2, 3, 7, 42, 999]) {
        for (const on of [false, true]) {
          const p = { liked, saved, like_count: n, save_count: flag === 'liked' ? 3 : n };
          const m = onMutate(p, flag, count, on);
          const e = onError(m, flag, on);
          toggle.push({
            flag, on, ...p,
            mutated: { liked: m.liked, like_count: m.like_count, saved: m.saved, save_count: m.save_count },
            errored: { liked: e.liked, saved: e.saved },
          });
        }
      }
    }
  }
}
process.stdout.write(JSON.stringify({ toggle }, null, 1) + '\n');
