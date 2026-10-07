#!/usr/bin/env node
/**
 * Golden trạng thái mạng (#527 Phase 1 · 1.11): chạy CHÍNH `net-status.ts` RN
 * (`isUsable`, `applyNetInfo`, máy trạng thái ba nhánh) trên đồng hồ ẢO.
 *
 *   ./build.sh
 *   node gen.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/net-status-golden.json
 *
 * `setTimeout` / `setInterval` được thay bằng bộ hẹn giờ ảo TRƯỚC khi nạp mã
 * RN, nên hằng số của RN (sàn 600 ms, nhịp dò 250 ms, trần 12 s) chạy nguyên
 * giá trị, và golden ghi ĐÚNG mốc mili giây của mỗi lần đổi trạng thái — Swift
 * (`NetStatusGoldenTests`) phải đổi ở đúng các mốc ấy.
 */
import { createRequire } from 'node:module';

// ── đồng hồ ảo ──
let now = 0;
let nextId = 1;
let timers = []; // {id, at, fn, every}
globalThis.setTimeout = (fn, ms) => { const id = nextId++; timers.push({ id, at: now + ms, fn, every: 0 }); return id; };
globalThis.setInterval = (fn, ms) => { const id = nextId++; timers.push({ id, at: now + ms, fn, every: ms }); return id; };
globalThis.clearTimeout = globalThis.clearInterval = (id) => { timers = timers.filter((t) => t.id !== id); };
function advanceTo(t) {
  for (;;) {
    const due = timers.filter((x) => x.at <= t).sort((a, b) => a.at - b.at || a.id - b.id)[0];
    if (!due) break;
    now = due.at;
    if (due.every) due.at += due.every;
    else timers = timers.filter((x) => x !== due);
    due.fn();
  }
  now = t;
}

const require = createRequire(import.meta.url);
const N = require('./out/net-status.js');

const ONLINE = { isConnected: true, isInternetReachable: true };
const GONE = { isConnected: false, isInternetReachable: false };
const DEAD = { isConnected: true, isInternetReachable: false };
const PROBING = { isConnected: true, isInternetReachable: null };
const UNKNOWN = { isConnected: null, isInternetReachable: null };

// Bảng `isUsable` — đúng các hàng của `native/tools/net-status.mjs`.
const TABLE = [
  ['máy bay / không sóng', GONE],
  ['Wi-Fi tốt', ONLINE],
  ['Wi-Fi quán cà phê chưa bấm đồng ý điều khoản', DEAD],
  ['vừa mở app, NetInfo còn đang dò', PROBING],
  ['không rõ loại mạng, chưa dò xong', UNKNOWN],
  ['mất kết nối, chưa dò xong', { isConnected: false, isInternetReachable: null }],
];

/** `busyUntil`: app "đang tải" khi `now < busyUntil` (`null` = mãi mãi); `probe: false` = không ai đăng ký cách hỏi. */
const at = (t, state) => ({ at: t, state });
const SEQ = [
  { name: 'mất mạng rồi có lại, còn đang tải → ở "đang kết nối lại"', events: [at(0, ONLINE), at(0, GONE), at(0, ONLINE)], busyUntil: null, until: 0 },
  { name: 'mạng vẫn tốt, NetInfo báo lại → không dựng ra lần kết nối lại', events: [at(0, ONLINE), at(0, ONLINE), at(0, ONLINE)], busyUntil: null, until: 2000 },
  { name: 'vào vùng Wi-Fi có sóng mà không có internet', events: [at(0, ONLINE), at(0, DEAD)], busyUntil: null, until: 2000 },
  { name: 'không còn gì đang tải → về online đúng ở sàn', events: [at(0, ONLINE), at(0, GONE), at(0, ONLINE)], busyUntil: 0, until: 1200 },
  { name: 'còn đang tải thì ở lại, không về sớm', events: [at(0, ONLINE), at(0, GONE), at(0, ONLINE)], busyUntil: null, until: 1200 },
  { name: 'tải không bao giờ xong → trần 12 giây', events: [at(0, GONE), at(1000, ONLINE)], busyUntil: null, until: 20000 },
  { name: 'tải xong giữa hai nhịp dò → về ở nhịp kế tiếp', events: [at(0, GONE), at(0, ONLINE)], busyUntil: 900, until: 3000 },
  { name: 'tải xong đúng lúc hết sàn', events: [at(0, GONE), at(0, ONLINE)], busyUntil: 600, until: 3000 },
  { name: 'mất mạng lại giữa lúc đang kết nối lại → huỷ hẹn giờ cũ', events: [at(0, GONE), at(0, ONLINE), at(300, GONE), at(5000, ONLINE)], busyUntil: null, until: 30000 },
  { name: 'NetInfo báo có mạng lần nữa giữa lúc kết nối lại → không bắt đầu lại', events: [at(0, GONE), at(0, ONLINE), at(400, ONLINE)], busyUntil: 2000, until: 5000 },
  { name: 'không ai đăng ký cách hỏi → về online ngay', events: [at(0, GONE), at(0, ONLINE)], busyUntil: null, probe: false, until: 2000 },
  { name: 'mở app lúc NetInfo còn dò → không nháy cảnh báo', events: [at(0, UNKNOWN), at(50, PROBING), at(80, ONLINE)], busyUntil: null, until: 2000 },
  { name: 'mở app lúc đã mất mạng', events: [at(0, GONE)], busyUntil: null, until: 2000 },
  { name: 'Wi-Fi chết rồi dò xong là chưa biết → kết nối lại', events: [at(0, DEAD), at(200, PROBING)], busyUntil: 0, until: 2000 },
];

const cases = SEQ.map((c) => {
  now = 0;
  timers = [];
  N.__resetNetStatusForTest();
  if (c.probe !== false) N.registerBusyProbe(() => c.busyUntil === null || now < c.busyUntil);
  const seen = [{ at: 0, status: N.netStatus() }];
  N.subscribeNetStatus((s) => seen.push({ at: now, status: s }));
  for (const e of c.events) {
    advanceTo(e.at);
    N.applyNetInfo(e.state);
  }
  advanceTo(c.until);
  return { ...c, probe: c.probe !== false, transitions: seen };
});

process.stdout.write(
  JSON.stringify(
    {
      table: TABLE.map(([name, state]) => ({ name, state, usable: N.isUsable(state) })),
      cases,
    },
    null,
    1,
  ) + '\n',
);
