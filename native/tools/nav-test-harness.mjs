#!/usr/bin/env node
/**
 * Kiểm tra điều hướng của #369 trên CODE THẬT.
 *
 * ── vì sao bản cũ bị bỏ ──
 *
 * Bản trước (ca67c71) tự định nghĩa class `NavStack` mock rồi test chính cái
 * mock đó: nó kiểm tra logic do chính file test bịa ra, không chạm tới một
 * dòng nào của app. Vacuous — xanh hay đỏ đều không nói gì về sản phẩm.
 *
 * ── bản này làm gì ──
 *
 * Biên dịch `src/lib/nav-guard.ts` THẬT (luật chống duplicate navigation của
 * app, được tách riêng chính để test được) rồi lái nó qua ba yêu cầu của
 * #369 trên một navigator giả có đúng hình dạng thật:
 *
 *   - `router.push` chỉ XẾP HÀNG; hàng chạy ở lần render sau (`flush`), lúc
 *     ấy state đổi đồng bộ và container phát sự kiện `state`;
 *   - native có hoạt ảnh stack kết thúc bằng `transitionEnd`, web thì không;
 *   - `signOut` THÁO CẢ container (đúng `_layout.tsx`: `if (!user) return
 *     <AuthScreen />`) — `rootState()` trả `undefined`, `activeDest()` null,
 *     như `useNavigationContainerRef().isReady() === false`;
 *   - một action không resolve được bị expo-router bỏ im lặng: hàng chạy
 *     xong mà state không đổi.
 *
 * Ba yêu cầu của #369:
 *   (a) không duplicate navigation stack — bấm dồn chỉ mở một màn;
 *   (b) không stale screen sau account reset — reset giữa chừng không kẹt
 *       khoá, màn mới đọc từ navigator chứ không từ ký ức;
 *   (c) loading/failed được xử lý — dispatch ném lỗi thì nhả khoá, action
 *       no-op thì không giữ khoá chờ một sự kiện không bao giờ tới.
 *
 * ── negative test ──
 *
 * Mỗi kịch bản chạy hai lần: một trên code thật (phải PASS), một trên bản
 * sao bị PHÁ HỎNG có chủ ý của `nav-guard.js` (phải FAIL). Nếu bản hỏng mà
 * vẫn xanh, chính phép kiểm này tự báo hỏng — đó là cách chứng minh nó không
 * rỗng, thay vì tin vào lời hứa.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fatal = (m) => {
  console.error(`phép tự kiểm hỏng — ${m}, đừng tin kết quả`);
  process.exit(1);
};

const out = mkdtempSync(path.join(tmpdir(), 'nav369-'));
execFileSync('npx', ['tsc', 'src/lib/nav-guard.ts', '--ignoreConfig', '--outDir', out,
  '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
  { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] });
const realSrc = readFileSync(path.join(out, 'nav-guard.js'), 'utf8');
if (!realSrc.includes('function request(')) fatal('biên dịch nav-guard.ts không ra code');
let n = 0;
const loadGuard = (src) => {
  const f = path.join(out, `guard-${++n}.js`);
  writeFileSync(f, src);
  return createRequire(import.meta.url)(f);
};

/* Bản hỏng có chủ ý. Mỗi mục phá đúng một nhánh của luật; nếu kịch bản tương
   ứng không đỏ trên bản này thì kịch bản đó rỗng. */
const MUTATIONS = {
  /* M1: không bao giờ từ chối — duplicate và xung đột đều lọt. */
  noDedup: (s) => s.replace(
    "return pending?.key === key ? 'duplicate' : 'busy';", "return 'accept';"),
  /* M3: finalize luôn chờ hoạt ảnh kể cả khi cây bị thay (reset) — khoá kẹt. */
  stuckOnReset: (s) => s.replace(
    "phase = env.animates && stackMoved(p.baseline, state) ? 'transitioning' : 'idle';",
    "phase = env.animates ? 'transitioning' : 'idle';"),
  /* M4: dispatch ném lỗi mà không nhả khoá. */
  noFailRelease: (s) => s.replace(
    "function failed() {\n    if (phase === 'navigating') {\n        pending = null;\n        phase = 'idle';\n    }\n}",
    "function failed() {\n}"),
  /* M5: hàng chạy xong mà state không đổi vẫn giữ khoá. */
  noNoopRelease: (s) => s.replace(
    "        else if (env.routerIdle()) {\n            pending = null;\n            phase = 'idle';\n        }", ""),
};
for (const [k, f] of Object.entries(MUTATIONS)) {
  if (f(realSrc) === realSrc) fatal(`mutation ${k} không bám vào code đã biên dịch`);
}

/*
 * Navigator giả đúng hình dạng thật. Không có đồng hồ: mọi thứ xảy ra qua
 * flush()/transitionEnd()/signOut() do kịch bản gọi tường minh.
 */
function makeWorld(G, { animates }) {
  let k = 0;
  const screen = (name) => ({ key: `${name}#${++k}`, name });
  const appTree = () => ({ type: 'stack', index: 0, routes: [screen('today')] });
  let state = appTree(); // null = container bị tháo (sau signOut)
  const queue = [];
  let dispatched = 0;
  let applied = 0;
  const top = () => state.routes[state.index];
  const detach = G.attach({
    rootState: () => (state === null ? undefined : state),
    activeDest: () => (state === null ? null : top().name),
    routerIdle: () => queue.length === 0,
    animates,
  });
  const w = {
    detach,
    depth: () => state.routes.length,
    place: () => (state === null ? null : top().name),
    dispatched: () => dispatched,
    applied: () => applied,
    phase: () => G.snapshot().phase,
    /* Đường đi của `nav.push` trong lib/nav.ts: hỏi luật, rồi mới dispatch. */
    push(dest, { throws = false, noop = false } = {}) {
      const v = G.request(`push:${dest}`, dest);
      if (v !== 'accept') return v;
      dispatched++;
      if (throws) {
        G.failed(); // go() trong nav.ts: catch -> failed() -> throw
        return 'threw';
      }
      queue.push(noop ? { t: 'noop' } : { t: 'push', dest });
      return v;
    },
    /* Hàng của expo-router chạy ở lần render sau. */
    flush() {
      while (queue.length) {
        const a = queue.shift();
        if (a.t === 'noop') continue; // bỏ im lặng, state không đổi
        if (state === null) continue; // cây đã bị thay: không còn navigator
        state = { type: 'stack', index: state.routes.length, routes: [...state.routes, screen(a.dest)] };
        applied++;
        G.onState();
      }
    },
    transitionEnd() {
      G.onTransitionEnd();
    },
    signOut() {
      state = null; // _layout.tsx: !user -> cả cây điều hướng bị THAY
      queue.length = 0; // hàng cũ không còn navigator để xả
      G.onState();
    },
    signIn() {
      state = appTree();
      G.onState();
    },
  };
  return w;
}

/* Mỗi kịch bản trả {ok, detail}. Chạy trên native (có hoạt ảnh) và web. */
const scenarios = {
  /* (a) Bốn lần bấm dồn khi app khựng: chỉ MỘT màn được mở. */
  dupPress(G, plat) {
    const w = makeWorld(G, { animates: plat === 'native' });
    const v1 = w.push('/workout');
    const v2 = w.push('/workout');
    const v3 = w.push('/workout');
    w.flush();
    if (plat === 'native') w.transitionEnd();
    const ok = v1 === 'accept' && v2 === 'duplicate' && v3 === 'duplicate'
      && w.dispatched() === 1 && w.applied() === 1 && w.depth() === 2
      && w.place() === '/workout' && w.phase() === 'idle';
    w.detach();
    return { ok, detail: `v=[${v1},${v2},${v3}] dispatched=${w.dispatched()} depth=${w.depth()} phase=${w.phase()}` };
  },
  /* (a) Đích khác tới giữa chừng chuyển cảnh: xung đột, bị bỏ. */
  conflictDrop(G, plat) {
    const w = makeWorld(G, { animates: plat === 'native' });
    const v1 = w.push('/workout');
    const v2 = w.push('/meals');
    w.flush();
    if (plat === 'native') w.transitionEnd();
    const ok = v1 === 'accept' && v2 === 'busy'
      && w.depth() === 2 && w.place() === '/workout';
    w.detach();
    return { ok, detail: `v=[${v1},${v2}] depth=${w.depth()} place=${w.place()}` };
  },
  /* (b) Reset tài khoản giữa một lần điều hướng đang bay: không kẹt khoá,
     màn sau đọc từ navigator mới chứ không phải ký ức cũ. */
  accountReset(G, plat) {
    const w = makeWorld(G, { animates: plat === 'native' });
    const v1 = w.push('/workout'); // đang bay
    w.signOut(); // container bị tháo
    const idleAfterReset = w.phase() === 'idle';
    const destAfterReset = w.place() === null; // không còn "màn cũ"
    const v2 = w.push('/today'); // sau reset vẫn điều hướng được
    w.signIn();
    w.flush();
    if (plat === 'native') w.transitionEnd();
    const ok = v1 === 'accept' && idleAfterReset && destAfterReset && v2 === 'accept'
      && w.depth() === 2 && w.place() === '/today' && w.phase() === 'idle';
    w.detach();
    return { ok, detail: `v1=${v1} idleSauReset=${idleAfterReset} v2=${v2} depth=${w.depth()} place=${w.place()}` };
  },
  /* (c) Dispatch ném lỗi: khoá nhả ngay, lần sau đi được. */
  dispatchThrows(G, plat) {
    const w = makeWorld(G, { animates: plat === 'native' });
    const v1 = w.push('/workout', { throws: true });
    const idleAfterThrow = w.phase() === 'idle';
    const v2 = w.push('/workout');
    w.flush();
    if (plat === 'native') w.transitionEnd();
    const ok = v1 === 'threw' && idleAfterThrow && v2 === 'accept'
      && w.depth() === 2 && w.place() === '/workout';
    w.detach();
    return { ok, detail: `v1=${v1} idleSauThrow=${idleAfterThrow} v2=${v2} depth=${w.depth()}` };
  },
  /* (c) Action no-op (expo-router bỏ im lặng, state không đổi): khoá nhả khi
     hàng chạy xong, không chờ một sự kiện không bao giờ tới. */
  noopAction(G, plat) {
    const w = makeWorld(G, { animates: plat === 'native' });
    const v1 = w.push('/ghost', { noop: true });
    w.flush(); // hàng chạy xong, state Y NGUYÊN
    const v2 = w.push('/workout');
    w.flush();
    if (plat === 'native') w.transitionEnd();
    const ok = v1 === 'accept' && v2 === 'accept'
      && w.depth() === 2 && w.place() === '/workout' && w.phase() === 'idle';
    w.detach();
    return { ok, detail: `v1=${v1} v2=${v2} depth=${w.depth()} phase=${w.phase()}` };
  },
};

/* Kịch bản nào phải đỏ trên bản hỏng nào. */
const negatives = [
  ['dupPress', 'noDedup'],
  ['conflictDrop', 'noDedup'],
  ['accountReset', 'stuckOnReset'],
  ['dispatchThrows', 'noFailRelease'],
  ['noopAction', 'noNoopRelease'],
];

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`ok   ${name}`); }
  else { fail++; console.log(`FAIL ${name} — ${detail}`); }
};

for (const plat of ['native', 'web']) {
  for (const [name, fn] of Object.entries(scenarios)) {
    const G = loadGuard(realSrc);
    const r = fn(G, plat);
    check(`${name} [${plat}] code thật`, r.ok, r.detail);
  }
}
/* stuckOnReset chỉ có nghĩa trên native (web không có pha transition). */
for (const [name, mut] of negatives) {
  const G = loadGuard(MUTATIONS[mut](realSrc));
  const r = scenarios[name](G, 'native');
  check(`${name} đỏ trên bản hỏng ${mut}`, !r.ok, `bản hỏng mà vẫn xanh: ${r.detail}`);
}

console.log(`\n${pass}/${pass + fail} nav tests pass (code thật + negative)`);
process.exit(fail > 0 ? 1 : 0);
