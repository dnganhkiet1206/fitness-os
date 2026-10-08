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

/** Như `advanceTo`, nhưng xả microtask sau mỗi hẹn giờ — chuỗi Promise của NetInfo chạy đúng thứ tự. */
const realImmediate = globalThis.setImmediate;
const flush = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => realImmediate(r)); };
async function advanceToAsync(t) {
  await flush();
  for (;;) {
    const due = timers.filter((x) => x.at <= t).sort((a, b) => a.at - b.at || a.id - b.id)[0];
    if (!due) break;
    now = due.at;
    if (due.every) due.at += due.every;
    else timers = timers.filter((x) => x !== due);
    due.fn();
    await flush();
  }
  now = t;
}

const require = createRequire(import.meta.url);
const N = require('./out/net-status.js');
const { default: NetInfoState } = require('./out/netinfo/state.js');
const { default: DEFAULT_CONFIGURATION } = require('./out/netinfo/defaultConfiguration.js');
const { fakeNative } = require('./out/netinfo/nativeInterface.js');

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

/* ── phần 2: NetInfo THẬT + net-status RN, như app RN chạy trên iOS ────────────
   iOS (RNCNetInfo) chỉ báo `type` + `isConnected`; `isInternetReachable` do
   `internetReachability.ts` dò bằng `fetch` HEAD tới generate_204. `fetch` ở
   đây là bản giả theo kịch bản: mỗi lần gọi lấy kết quả kế tiếp — mã 204 (có
   internet), 200 (cổng đăng nhập Wi-Fi trả trang HTML), lỗi mạng, hoặc treo
   (để timeout 15 s của NetInfo cắt). Ghi: mốc đổi trạng thái app, chuỗi giá trị
   isInternetReachable, và các lần dò KHÔNG bị huỷ (lúc gọi + kết quả). */
const WIFI = { type: 'wifi', isConnected: true, details: null };
const CELL = { type: 'cellular', isConnected: true, details: null };
const NONE = { type: 'none', isConnected: false, details: null };
const ok = (after = 300) => ({ status: 204, after });
const portal = (after = 300) => ({ status: 200, after });
const fail = (after = 300) => ({ error: true, after });
const hang = () => ({ hang: true });

/** `probes`: [[từ mốc, kết quả], …] — phép dò BẮT ĐẦU ở mốc t nhận kết quả của
 *  dòng cuối có mốc ≤ t. Theo thời gian chứ không theo thứ tự gọi, nên phép dò
 *  bị huỷ (NetInfo huỷ khi đường mạng đổi) không "ăn" mất kết quả của phép sau. */
const NETINFO = [
  { name: 'mở app trên Wi-Fi có internet → dò, có, dò lại sau 60 s', initial: WIFI, probes: [[0, ok()]], events: [], until: 70000 },
  { name: 'cổng đăng nhập Wi-Fi (captive portal) → mất mạng, dò lại mỗi 5 s, bấm đồng ý thì về', initial: WIFI, probes: [[0, portal()], [15000, ok()]], events: [], until: 25000 },
  { name: 'phép dò treo → timeout 15 s → mất mạng, dò lại sau 5 s', initial: WIFI, probes: [[0, hang()], [10000, ok()]], events: [], until: 22000 },
  { name: 'có sóng 4G mà hết dung lượng → lỗi mạng ở mọi phép dò', initial: CELL, probes: [[0, fail()]], events: [], until: 26000 },
  { name: 'Wi-Fi → 4G khi đang có internet → không về "chưa biết", dò lại', initial: WIFI, probes: [[0, ok()]], events: [{ at: 10000, native: CELL }], until: 12000 },
  { name: 'đổi Wi-Fi → 4G giữa lúc đang dò → huỷ phép dò cũ, dò mới', initial: WIFI, probes: [[0, ok(2000)], [1000, ok(300)]], events: [{ at: 1000, native: CELL }], until: 5000 },
  { name: 'mất sóng rồi có lại → mất mạng, chưa biết (kết nối lại), dò có', initial: WIFI, probes: [[0, ok()]], events: [{ at: 5000, native: NONE }, { at: 8000, native: WIFI }], until: 12000 },
  { name: 'mất sóng giữa lúc đang dò → huỷ, mất mạng ngay', initial: WIFI, probes: [[0, ok()], [2000, ok(5000)]], events: [{ at: 2000, native: CELL }, { at: 3000, native: NONE }], until: 6000 },
  { name: 'mạng về nhưng là cổng đăng nhập → kết nối lại rồi lại mất mạng', initial: WIFI, probes: [[0, ok()], [4000, portal()]], events: [{ at: 2000, native: NONE }, { at: 4000, native: WIFI }], until: 9500 },
  { name: 'bấm Thử lại khi đang ở cổng đăng nhập → đo lại, dò lại', initial: WIFI, probes: [[0, portal()], [1000, ok()]], events: [{ at: 1000, retry: true }], until: 3000 },
  { name: 'mở app lúc không có mạng', initial: NONE, probes: [[0, ok()]], events: [], until: 10000 },
  { name: 'mở app không mạng rồi Wi-Fi về có internet', initial: NONE, probes: [[0, ok()]], events: [{ at: 3000, native: WIFI }], until: 5000 },
];

async function runNetInfo(c) {
  now = 0;
  timers = [];
  N.__resetNetStatusForTest();
  N.registerBusyProbe(() => false);
  fakeNative.reset();
  fakeNative.current = c.initial;
  const outcomeAt = (t) => [...c.probes].reverse().find(([from]) => from <= t)?.[1] ?? hang();
  const probes = [];
  globalThis.fetch = (url, opts) => {
    const rec = { at: now, url, method: opts.method, result: null, cancelled: false };
    probes.push(rec);
    const o = outcomeAt(now);
    return new Promise((resolve, reject) => {
      opts.signal?.addEventListener('abort', () => {
        // Hết 15 s mà chưa có gì: NetInfo cắt bằng timeout — một kết quả, không phải huỷ.
        if (rec.result === null && o.hang && now - rec.at === DEFAULT_CONFIGURATION.reachabilityRequestTimeout) rec.result = 'timeout';
        else rec.cancelled = rec.result === null;
        reject(new Error('AbortError'));
      });
      if (o.hang) return;
      setTimeout(() => {
        if (rec.cancelled) return;
        if (o.error) { rec.result = 'error'; reject(new TypeError('Network request failed')); }
        else { rec.result = o.status; resolve({ status: o.status }); }
      }, o.after);
    });
  };
  const seen = [{ at: 0, status: N.netStatus() }];
  N.subscribeNetStatus((st) => seen.push({ at: now, status: st }));
  const reach = [];
  const state = new NetInfoState(DEFAULT_CONFIGURATION);
  state.add((s) => {
    const last = reach[reach.length - 1];
    if (!last || last.value !== s.isInternetReachable) reach.push({ at: now, value: s.isInternetReachable ?? null });
    N.applyNetInfo(s);
  });
  await advanceToAsync(0);
  for (const e of c.events) {
    await advanceToAsync(e.at);
    if (e.native) fakeNative.emit(e.native);
    // "Thử lại" của dải báo = `retryNow`: NetInfo.refresh() rồi applyNetInfo.
    if (e.retry) N.applyNetInfo(await state._fetchCurrentState());
    await flush();
  }
  await advanceToAsync(c.until);
  state.tearDown();
  return {
    name: c.name,
    initial: { type: c.initial.type, isConnected: c.initial.isConnected },
    events: c.events.map((e) => (e.native ? { at: e.at, native: { type: e.native.type, isConnected: e.native.isConnected } } : e)),
    probeSchedule: c.probes.map(([from, o]) => ({ from, ...o })),
    until: c.until,
    transitions: seen,
    reachability: reach,
    probes: probes.filter((p) => !p.cancelled).map(({ at, result }) => ({ at, result })),
    url: probes[0]?.url ?? null,
    method: probes[0]?.method ?? null,
  };
}

const netinfo = [];
for (const c of NETINFO) netinfo.push(await runNetInfo(c));

process.stdout.write(
  JSON.stringify(
    {
      table: TABLE.map(([name, state]) => ({ name, state, usable: N.isUsable(state) })),
      cases,
      netinfo: {
        config: {
          url: DEFAULT_CONFIGURATION.reachabilityUrl,
          method: DEFAULT_CONFIGURATION.reachabilityMethod,
          requestTimeout: DEFAULT_CONFIGURATION.reachabilityRequestTimeout,
          shortTimeout: DEFAULT_CONFIGURATION.reachabilityShortTimeout,
          longTimeout: DEFAULT_CONFIGURATION.reachabilityLongTimeout,
        },
        cases: netinfo,
      },
    },
    null,
    1,
  ) + '\n',
);
