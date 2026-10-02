/**
 * Bấm bốn lần lúc app đang khựng thì mở MỘT màn, không phải bốn.
 *
 * ── lỗi ──
 *
 * App khựng: một truy vấn lớn về, một màn hình ảnh giải nén, luồng JS bận nửa
 * giây. Nút không phản hồi, nên người ta bấm lại. Rồi bấm nữa. Bốn lần bấm
 * không phải thiếu kiên nhẫn — đó là thông tin DUY NHẤT họ có, vì một màn chưa
 * kịp đi và một màn sắp đi trông giống hệt nhau.
 *
 * Rồi luồng rảnh. Cả bốn lần bấm đã xếp hàng cùng chạy, cách nhau vài mili
 * giây, mỗi lần push một route. Bạn nằm sâu bốn màn trên cùng một trang và
 * phải bấm back bốn lần để ra. Trên một stack có giữ state — trình dựng buổi
 * tập, một phiếu ghi viết dở — các bản bên dưới đều SỐNG, nên đường ra dắt bạn
 * qua bốn cái.
 *
 * Đây không phải ca hiếm. Đó là hệ quả CHẮC CHẮN của việc app có lúc chậm, và
 * máy càng yếu thì càng chắc chắn: đúng những người ít chịu nổi nó nhất.
 *
 * ── vì sao chốt nằm ở ĐIỀU HƯỚNG chứ không ở NÚT ──
 *
 * Chỗ hiển nhiên là cú nhấn: cho `PressScale` bỏ qua lần nhấn thứ hai trong
 * 300ms. Sai, và sai theo kiểu phải rất lâu sau mới lộ. Rất nhiều nút trong app
 * này CỐ Ý lặp — ±15 giây của đồng hồ nghỉ, thêm nhanh nước, các nút tăng giảm
 * số set, mọi dấu cộng trừ trong trình dựng. Chốt ở cú nhấn trừng phạt tất cả
 * chúng để sửa một vấn đề không cái nào có.
 *
 * Thứ không được xảy ra hai lần là ĐIỀU HƯỚNG. Nên chốt nằm ở đó, đúng một
 * chỗ, và mọi nút trong app giữ nguyên hành vi cũ.
 *
 * ── vì sao không còn đồng hồ (#157) ──
 *
 * Chốt cũ giữ mỗi đích 700ms. Đó là một phép đoán app chậm bao lâu: máy yếu
 * thì cú khựng dài hơn cửa sổ và cụm bấm lọt qua; máy nhanh thì cửa sổ chặn
 * những thứ không cần chặn. Nay khoá nhả theo điều ĐÃ XẢY RA: navigator đổi
 * state, hoạt ảnh stack kết thúc (`transitionEnd`), hàng của expo-router chạy
 * xong mà không đổi gì, dispatch ném lỗi, hoặc focus bị kéo đi nơi khác.
 *
 * ── cách kiểm ──
 *
 * CHẠY THẬT máy trạng thái đọc từ `src/lib/nav-guard.ts` trên một navigator
 * giả có đúng hình dạng thật: `push` chỉ xếp hàng, hàng chạy ở lần render sau,
 * state đổi đồng bộ, native có hoạt ảnh còn web thì không. Các ca là Test 1–3,
 * 8, 9, 10 của #157, cộng back dồn, hành động bị bỏ, đường lỗi, vuốt back giữa
 * chuyển cảnh. Mỗi ca chạy trên cả native lẫn web. Sáu bản hỏng (không chốt;
 * bỏ pha chuyển cảnh; không nhả khi hàng chạy xong; không nhả ở đường lỗi;
 * không đọc đích đang hiển thị; chờ hoạt ảnh cả khi chỉ đổi tab) đều phải bị
 * bắt, không thì bước này tự báo hỏng.
 *
 * Cộng phần cấu trúc: không tệp nào ngoài `lib/nav.ts` gọi thẳng
 * `router.push` — một lời gọi lọt lưới là một nút không có chốt, và nó trông y
 * hệt mọi nút khác trong diff; layout gốc gọi `useNavGuard()`; mọi `<Stack>`
 * gắn `navGuardScreenListeners`; không hàm thời gian nào trong chốt.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')).replace(/(^|[^:])\/\/.*$/gm, (c, p) => p + ' '.repeat(c.length - p.length));
const problems = [];
const fatal = (m) => {
  console.error(`phép tự kiểm hỏng — ${m}, đừng tin kết quả`);
  process.exit(1);
};

const out = mkdtempSync(path.join(tmpdir(), 'nav-guard-'));
try {
  /* Không import gì cả, nên biên dịch đứng một mình được — đó là lý do luật
     nằm ở `nav-guard.ts` chứ không ở `nav.ts`, thứ phải kéo theo expo-router. */
  execFileSync('npx', ['tsc', 'src/lib/nav-guard.ts', '--ignoreConfig', '--outDir', out,
    '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] });
  const compiled = readFileSync(path.join(out, 'nav-guard.js'), 'utf8');
  const load = (src, name) => {
    const f = path.join(out, `${name}.js`);
    writeFileSync(f, src);
    return createRequire(import.meta.url)(f);
  };

  /*
    ── một navigator giả có đúng hình dạng thật (#157) ──

    - `router.push` chỉ XẾP HÀNG (expo-router `routingQueue.add`); hàng được
      chạy ở lần render sau (`flush`), lúc ấy state của navigator đổi ĐỒNG BỘ
      và container phát sự kiện `state`.
    - Trên native, đổi một STACK có hoạt ảnh và kết thúc bằng `transitionEnd`;
      trên web thì không có hoạt ảnh nào.
    - Một hành động không làm gì (expo-router bỏ im lặng, hoặc navigator trả
      nguyên state) thì hàng chạy xong mà state KHÔNG đổi.

    Không có đồng hồ ở đâu cả: nếu luật cần thời gian để đúng thì ở đây nó sai.
  */
  const makeWorld = (G, { animates }) => {
    let n = 0;
    const route = (name) => ({ key: `${name}-${++n}`, name });
    let state = {
      type: 'stack', index: 0,
      routes: [{ ...route('(tabs)'), state: { type: 'tab', index: 0, routes: [route('/'), route('/workouts')] } }],
    };
    const queue = [];
    let dispatches = 0;
    const top = () => state.routes[state.index];
    const place = () => {
      const r = top();
      return r.name === '(tabs)' ? r.state.routes[r.state.index].name : r.name;
    };
    const set = (next) => {
      state = next;
      G.onState();
    };
    const detach = G.attach({
      rootState: () => state,
      activeDest: place,
      routerIdle: () => queue.length === 0,
      animates,
    });
    const w = {
      depth: () => state.routes.length,
      place,
      dispatches: () => dispatches,
      verdicts: [],
      push(dest, { drop = false, throws = false } = {}) {
        const v = G.request(`push:${dest}`, dest);
        w.verdicts.push(v);
        if (v !== 'accept') return v;
        if (throws) {
          G.failed();
          return 'threw';
        }
        queue.push(drop ? { t: 'noop' } : { t: 'push', dest });
        return v;
      },
      /* `nav.navigate('/')` từ một tab sang tab khác: đi qua chốt, nhưng thứ
         đổi là TAB chứ không phải stack. */
      navigateTab(i) {
        const dest = state.routes[0].state.routes[i].name;
        const v = G.request(`navigate:${dest}`, dest);
        w.verdicts.push(v);
        if (v === 'accept') queue.push({ t: 'tab', i });
        return v;
      },
      back() {
        if (state.routes.length < 2) return 'nowhere';
        const v = G.request('back', null);
        w.verdicts.push(v);
        if (v === 'accept') queue.push({ t: 'back' });
        return v;
      },
      /* expo-router `routingQueue.run`: lấy hết hàng RA TRƯỚC rồi mới dispatch. */
      flush() {
        const events = queue.splice(0);
        let next = state;
        for (const a of events) {
          dispatches++;
          if (a.t === 'push') next = { ...next, index: next.routes.length, routes: [...next.routes, route(a.dest)] };
          if (a.t === 'tab') {
            const t = next.routes[0];
            next = { ...next, routes: [{ ...t, state: { ...t.state, index: a.i } }, ...next.routes.slice(1)] };
          }
          if (a.t === 'back' && next.routes.length > 1) {
            next = { ...next, index: next.routes.length - 2, routes: next.routes.slice(0, -1) };
          }
        }
        if (next !== state) set(next);
      },
      transitionEnd: () => G.onTransitionEnd(),
      queueOther: () => queue.push({ t: 'noop' }),
      /* Những thay đổi KHÔNG đi qua `nav` */
      tab(i) {
        const t = state.routes[0];
        set({ ...state, index: 0, routes: [{ ...t, state: { ...t.state, index: i } }, ...state.routes.slice(1)] });
      },
      swipeBack() {
        set({ ...state, index: state.routes.length - 2, routes: state.routes.slice(0, -1) });
      },
      deepLink(dest) {
        set({ ...state, index: state.routes.length, routes: [...state.routes, route(dest)] });
      },
      phase: () => G.snapshot().phase,
      detach,
    };
    return w;
  };

  /* Mỗi ca trả về chuỗi lỗi hoặc null. Chạy trên cả native (có hoạt ảnh) lẫn web. */
  const CASES = [
    ['Test 1 — bấm một lần: đúng một lần điều hướng, một màn', (w) => {
      w.push('/settings'); w.flush(); w.transitionEnd();
      return w.depth() === 2 && w.place() === '/settings' ? null : `độ sâu ${w.depth()}, đang ở ${w.place()}`;
    }],
    ['Test 2 — app khựng, năm lần bấm xếp hàng TRƯỚC khi hàng chạy: một màn', (w) => {
      for (let i = 0; i < 5; i++) w.push('/settings');
      w.flush(); w.transitionEnd();
      return w.depth() === 2 ? null : `mở ${w.depth() - 1} màn`;
    }],
    ['Test 2 — năm lần bấm, React render xen giữa mỗi lần (hàng chạy, state đã đổi): một màn', (w) => {
      for (let i = 0; i < 5; i++) { w.push('/settings'); w.flush(); }
      w.transitionEnd();
      return w.depth() === 2 ? null : `mở ${w.depth() - 1} màn`;
    }],
    ['Test 3 — bấm cùng đích trong lúc chuyển cảnh và SAU khi chuyển cảnh xong: đều bị bỏ', (w) => {
      w.push('/settings'); w.flush();
      w.push('/settings'); w.flush();
      w.transitionEnd();
      w.push('/settings'); w.flush();
      return w.depth() === 2 ? null : `mở ${w.depth() - 1} màn — đích đang hiển thị vẫn bị đẩy thêm`;
    }],
    ['đích KHÁC trong lúc còn đang điều hướng: chuyển cảnh xung đột, bị bỏ', (w) => {
      w.push('/settings'); w.push('/nutrition'); w.flush(); w.transitionEnd();
      return w.depth() === 2 && w.place() === '/settings' ? null : `độ sâu ${w.depth()}, đang ở ${w.place()}`;
    }],
    ['xong một điều hướng thì đích khác đi được ngay (không khoá thừa)', (w) => {
      w.push('/settings'); w.flush(); w.transitionEnd();
      w.push('/nutrition'); w.flush(); w.transitionEnd();
      return w.depth() === 3 && w.place() === '/nutrition' ? null : `độ sâu ${w.depth()}, đang ở ${w.place()}`;
    }],
    ['bốn lần back xếp hàng: pop MỘT màn', (w) => {
      w.push('/a'); w.flush(); w.transitionEnd();
      w.push('/b'); w.flush(); w.transitionEnd();
      for (let i = 0; i < 4; i++) w.back();
      w.flush(); w.transitionEnd();
      return w.depth() === 2 ? null : `còn ${w.depth()} tầng, phải là 2`;
    }],
    ['Test 8 — Workout → Back → Workout, ba vòng: vòng nào cũng đi được, không khoá kẹt', (w) => {
      for (let i = 0; i < 3; i++) {
        if (w.push('/workout-detail') !== 'accept') return `vòng ${i + 1}: lần mở bị bỏ (${w.verdicts.at(-1)})`;
        w.flush(); w.transitionEnd();
        if (w.back() !== 'accept') return `vòng ${i + 1}: back bị bỏ`;
        w.flush(); w.transitionEnd();
      }
      return w.depth() === 1 ? null : `còn ${w.depth()} tầng`;
    }],
    ['hành động không làm gì (expo-router bỏ im lặng): khoá nhả khi hàng đã chạy', (w) => {
      w.push('/nowhere', { drop: true }); w.flush();
      return w.push('/settings') === 'accept' ? null : `lần bấm sau bị bỏ (${w.verdicts.at(-1)}) — khoá kẹt vì chờ một state không bao giờ đổi`;
    }],
    /* Hàng đang có việc khác (một `setParams` của màn nào đó chưa chạy): chỉ
       `failed()` nhả được khoá, vì "hàng đã chạy" chưa đúng. */
    ['dispatch ném lỗi trong lúc hàng còn việc khác: khoá nhả ở đường lỗi', (w) => {
      w.queueOther();
      w.push('/settings', { throws: true });
      return w.push('/settings') === 'accept' ? null : 'lần bấm sau bị bỏ — đường lỗi không nhả khoá';
    }],
    ['Test 9 — đổi tab nhanh giữa hai lần mở: không đợi hoạt ảnh nào, không khoá', (w) => {
      for (let i = 0; i < 6; i++) w.tab(i % 2);
      if (w.phase() !== 'idle') return `pha ${w.phase()} sau khi chỉ đổi tab`;
      w.push('/settings'); w.flush(); w.transitionEnd();
      return w.depth() === 2 ? null : `độ sâu ${w.depth()}`;
    }],
    ['nav.navigate sang tab khác: không có hoạt ảnh stack nào để đợi, lần mở sau đi ngay', (w) => {
      w.navigateTab(1); w.flush();
      if (w.place() !== '/workouts') return `đang ở ${w.place()}`;
      return w.push('/settings') === 'accept' ? null : `lần mở sau bị bỏ (${w.verdicts.at(-1)}) — chờ một transitionEnd không bao giờ đến`;
    }],
    ['vuốt back giữa chuyển cảnh: khoá nhả theo state, không đợi transitionEnd đã bị huỷ', (w) => {
      w.push('/settings'); w.flush();
      w.swipeBack();
      return w.push('/nutrition') === 'accept' ? null : `lần mở sau bị bỏ (${w.verdicts.at(-1)})`;
    }],
    ['Test 10 — deep link đã mở Workout, rồi bấm Workout: không mở bản thứ hai', (w) => {
      w.deepLink('/workout-detail'); w.transitionEnd();
      w.push('/workout-detail'); w.flush();
      return w.depth() === 2 ? null : `mở ${w.depth() - 1} màn Workout`;
    }],
    ['không nơi nào để back: không khoá gì', (w) => {
      w.back();
      return w.push('/settings') === 'accept' ? null : 'back khi không có gì để back đã giữ khoá';
    }],
  ];
  /* Chỉ native có pha chuyển cảnh; ca này đòi đúng nó. */
  const NATIVE_ONLY = [
    ['native: bốn lần back, React render xen giữa mỗi lần: vẫn MỘT màn (đang chuyển cảnh)', (w) => {
      w.push('/a'); w.flush(); w.transitionEnd();
      w.push('/b'); w.flush(); w.transitionEnd();
      for (let i = 0; i < 4; i++) { w.back(); w.flush(); }
      w.transitionEnd();
      return w.depth() === 2 ? null : `còn ${w.depth()} tầng, phải là 2`;
    }],
    ['native: bấm đích khác lúc hoạt ảnh đẩy màn chưa xong: bị bỏ', (w) => {
      w.push('/settings'); w.flush();
      w.push('/nutrition'); w.flush(); w.transitionEnd();
      return w.depth() === 2 ? null : `độ sâu ${w.depth()}`;
    }],
  ];

  const runAll = (G) => {
    const fails = [];
    for (const animates of [true, false]) {
      for (const [name, fn] of [...CASES, ...(animates ? NATIVE_ONLY : [])]) {
        const w = makeWorld(G, { animates });
        const err = fn(w);
        w.detach();
        if (err) fails.push(`${animates ? 'native' : 'web'} · ${name}: ${err}`);
      }
    }
    return fails;
  };

  const G = load(compiled, 'real');
  problems.push(...runAll(G));

  /* Không đồng hồ: luật nhả theo sự kiện, nên một hàm thời gian ở đây là dấu hiệu nó quay lại. */
  const guardSrc = strip(read('src/lib/nav-guard.ts'));
  const navSrcAll = strip(read('src/lib/nav.ts'));
  for (const [f, src] of [['src/lib/nav-guard.ts', guardSrc], ['src/lib/nav.ts', navSrcAll]]) {
    const m = /\b(setTimeout|setInterval|Date\.now|performance\.now|requestAnimationFrame)\b/.exec(src);
    if (m) problems.push(`${f}: dùng \`${m[1]}\` — #157 cấm nhả khoá theo đồng hồ`);
  }

  /*
    Phép tự kiểm: mỗi bản hỏng dưới đây là một cách viết SAI dễ gặp, và bộ ca
    ở trên phải bắt được nó. Không bắt được thì các ca đang xanh vì lý do khác.
  */
  const MUTANTS = [
    ['không chốt gì', [/if \(phase === 'navigating'\)\s*return[^;]*;/, ''], [/if \(phase === 'transitioning'\)\s*return 'busy';/, ''], [/if \(dest !== null && dest === env\.activeDest\(\)\)\s*return 'active';/, '']],
    ['nhả khoá ngay khi state đổi, bỏ pha chuyển cảnh', [/env\.animates && stackMoved\(p\.baseline, state\) \? 'transitioning' : 'idle'/, "'idle'"]],
    ['không nhả khi hàng chạy xong mà state không đổi', [/else if \(env\.routerIdle\(\)\) \{/, 'else if (false) {']],
    ['không nhả ở đường lỗi', [/function failed\(\) \{/, 'function failed() { return;']],
    ['không đọc đích đang hiển thị', [/dest === env\.activeDest\(\)/, 'false']],
    ['vào pha chuyển cảnh cả khi chỉ đổi tab', [/return y\.type === 'stack';/, 'return true;']],
  ];
  for (const [name, ...edits] of MUTANTS) {
    let src = compiled;
    for (const [re, to] of edits) {
      if (!re.test(src)) fatal(`bản hỏng "${name}": không tìm thấy chỗ để sửa (${re})`);
      src = src.replace(re, to);
    }
    const caught = runAll(load(src, `mutant-${MUTANTS.findIndex((m) => m[0] === name)}`));
    if (!caught.length) fatal(`bản hỏng "${name}" vẫn qua hết các ca`);
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}

// ── 5. không ai đi vòng qua chốt ────────────────────────────────────────────
/*
  Một `router.push` sót lại là một nút không có chốt, và trong diff nó trông y
  hệt mọi nút khác. Đây là nửa thứ hai của luật: phần trên chứng minh chốt
  ĐÚNG, phần này chứng minh nó ĐƯỢC DÙNG.
*/
{
  const files = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', 'src'],
    { cwd: NATIVE, encoding: 'utf8' },
  )
    .split('\n')
    .filter((f) => /\.tsx?$/.test(f))
    .filter((f) => existsSync(path.join(NATIVE, f)));

  const ALLOWED = new Set([
    /* Chính nó — đây là chỗ duy nhất được chạm vào router. */
    'src/lib/nav.ts',
  ]);
  let scanned = 0;
  for (const f of files) {
    if (ALLOWED.has(f)) continue;
    const code = strip(read(f));
    scanned++;
    const m = /\brouter\.(push|replace|back|navigate|dismissAll)\s*\(/.exec(code);
    if (m) {
      const line = code.slice(0, m.index).split('\n').length;
      problems.push(
        `${f}:${line}: gọi thẳng \`router.${m[1]}(\` — đi vòng qua chốt bấm dồn. Dùng ` +
          '`nav.' + m[1] + '(` từ `@/lib/nav`',
      );
    }
  }
  if (scanned < 50) fatal(`chỉ quét được ${scanned} tệp — bộ quét hỏng`);

  /*
    ── 5b. `<Link>` cũng là một đường điều hướng ── (#216)

    Luật trên chỉ bắt `router.push` gọi thẳng. Nhưng `<Link>` của expo-router
    dispatch điều hướng theo đường riêng, không qua `nav.*` — một `<Link>`
    trần mở lại đúng cái cửa #157 đã đóng (bấm dồn mở nhiều màn), mà trong
    diff nó trông vô hại. Nên mọi `<Link>` điều hướng TRONG APP đều phải đi
    qua `ZoomLink` (`src/components/ascnd/zoom-link.tsx`), thứ hỏi chốt y như
    `nav.push`. Ngoại lệ duy nhất là `external-link.tsx`: nó mở URL NGOÀI app
    (trình duyệt trong app / tab mới), không chạm vào stack điều hướng nên
    chốt không có gì để giữ.
  */
  const LINK_ALLOWED = new Set([
    'src/components/ascnd/zoom-link.tsx',
    'src/components/external-link.tsx',
  ]);
  for (const f of files) {
    if (LINK_ALLOWED.has(f)) continue;
    const code = strip(read(f));
    const m = /<Link(?![\w.])/.exec(code);
    if (m) {
      const line = code.slice(0, m.index).split('\n').length;
      problems.push(
        `${f}:${line}: dùng \`<Link>\` của expo-router — đi vòng qua chốt bấm dồn. ` +
          'Điều hướng trong app thì dùng `ZoomLink` từ `@/components/ascnd/zoom-link` (#216); ' +
          'mở URL ngoài app thì dùng `ExternalLink`',
      );
    }
  }

  /* Và `nav.ts` thật sự phải HỎI chốt, chứ không chỉ bọc router lại. */
  const navSrc = strip(read('src/lib/nav.ts'));
  /*
    `dismissAll` KHÔNG còn trong danh sách, và nó không còn trong `nav.ts`.

    Nó từng có, gọi từ hai chỗ trong Cài đặt sau `signOut`, và gây một lỗi thật
    trên máy: "The action 'POP_TO_TOP' was not handled by any navigator."
    Xem luật ngay dưới đây.
  */
  for (const fn of ['push', 'replace', 'navigate', 'back']) {
    const re = new RegExp(`\\b${fn}\\([^)]*\\)\\s*:\\s*void\\s*\\{[^}]*\\bgo\\(`);
    if (!re.test(navSrc)) {
      problems.push(`src/lib/nav.ts: \`nav.${fn}\` không đi qua \`go(\` (tức \`request\` của chốt) — vỏ bọc mà không có chốt`);
    }
  }
  if (!/function go\([^)]*\)[^{]*\{[^}]*request\(/.test(navSrc) || !/catch[\s\S]{0,40}failed\(\)/.test(navSrc)) {
    problems.push('src/lib/nav.ts: `go` phải hỏi `request` và gọi `failed()` khi dispatch ném lỗi');
  }

  /*
    Khoá chỉ nhả được nếu có ai báo cho nó: sự kiện `state` của container
    (`useNavGuard` ở layout gốc) và `transitionEnd` của MỌI stack. Một `<Stack>`
    quên gắn listener là một stack mà mỗi lần đẩy màn trên native để khoá chờ
    tới lần đổi focus kế tiếp.
  */
  const root = strip(read('src/app/_layout.tsx'));
  if (!/\buseNavGuard\(\)/.test(root)) problems.push('src/app/_layout.tsx: không gọi `useNavGuard()` — chốt không nghe được navigator, nên không bao giờ nhả');
  for (const f of files.filter((x) => x.startsWith('src/app/') && /_layout\.tsx$/.test(x))) {
    const code = strip(read(f));
    for (const m of code.matchAll(/<Stack\b(?!\.)[^>]*?>/gs)) {
      if (!/screenListeners=\{navGuardScreenListeners\}/.test(m[0])) {
        const line = code.slice(0, m.index).split('\n').length;
        problems.push(`${f}:${line}: \`<Stack>\` không có \`screenListeners={navGuardScreenListeners}\` — trên native, khoá sau mỗi lần đẩy màn ở stack này không nhả theo \`transitionEnd\``);
      }
    }
  }
}

/*
  ── không điều hướng sau `signOut` ──

  Chủ dự án gặp lỗi này trên máy thật:

      The action 'POP_TO_TOP' was not handled by any navigator.
      Is there any screen to go back to?

  Cổng ở `_layout.tsx` là `if (!user) return <AuthScreen />`. Mất phiên thì cả
  cây điều hướng bị THAY — `Stack` bị gỡ khỏi cây, không phải bị pop. Mà
  expo-router XẾP HÀNG lệnh điều hướng (`routingQueue`) và xả ở lần focus kế
  tiếp, lúc ngăn xếp đã biến mất.

  Nên mọi lệnh điều hướng đặt sau `signOut` đều vừa THỪA vừa ĐUA: cổng đã dọn
  xong trước khi nó chạy. Luật này canh đúng cặp ấy thay vì cấm một hàm.

  Ngăn xếp gọi trong báo lỗi chỉ tới `LogBoxData` và `ExpoRoot`, không tới mã
  của app — nên không ai đọc nó ra được chỗ gọi. Đó là lý do nó đáng thành một
  bước gác chứ không phải một dòng chú thích.
*/
{
  const files = [];
  (function walk(d) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const q = path.join(d, e.name);
      if (e.isDirectory()) walk(q);
      else if (/\.tsx?$/.test(q)) files.push(q);
    }
  })(path.join(NATIVE, 'src'));
  let scanned = 0;
  for (const f of files) {
    const raw = readFileSync(f, 'utf8');
    const src = strip(raw);
    scanned++;
    for (const m of src.matchAll(/\bsignOut\(\)/g)) {
      /* Cửa sổ 200 ký tự MÃ (chú thích XOÁ hẳn, không thành khoảng trắng): đủ để
         bắt lệnh ngay sau, không đủ để quét sang một handler khác. `strip` giữ
         nguyên độ dài (#164), nên `m.index` cũng là vị trí trong `raw`; cắt
         thẳng 200 ký tự của `src` thì một chú thích giữa `signOut()` và lệnh
         điều hướng chiếm chỗ của mã, và luật xanh oan. */
      const after = raw.slice(m.index, m.index + 4000)
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1').slice(0, 200); // co chuỗi có chủ ý (#164): cửa sổ, không tính dòng
      const hit = after.match(/\b(nav|router)\.(push|replace|navigate|back|dismissAll)\(/);
      if (hit) {
        const line = src.slice(0, m.index).split('\n').length;
        problems.push(
          `${path.relative(NATIVE, f)}:${line}: \`${hit[0]}\` đặt ngay sau \`signOut()\` — cổng auth đã THAY cả cây điều hướng, nên lệnh này rơi vào chỗ không có navigator (POP_TO_TOP không ai nhận)`,
        );
      }
    }
  }
  if (scanned < 50) problems.push(`chỉ quét được ${scanned} tệp — bộ dò hỏng chứ không phải kho sạch`);
}

if (problems.length) {
  console.error('chốt bấm dồn CÓ LỖI:\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}

console.log(
  'chốt bấm dồn OK — CHẠY THẬT máy trạng thái đọc từ src/lib/nav-guard.ts trên navigator giả ' +
    '(push chỉ xếp hàng, hàng chạy ở lần render sau, native có hoạt ảnh, web không), native lẫn web: ' +
    'bấm một lần mở một màn; năm lần bấm dồn (trước hoặc xen giữa các lần render) mở MỘT màn; cùng đích ' +
    'lúc và sau chuyển cảnh bị bỏ; đích khác lúc đang điều hướng bị bỏ, sau đó đi ngay; bốn lần back pop ' +
    'một màn; Workout → Back → Workout ba vòng không kẹt; hành động bị bỏ, dispatch ném lỗi, đổi tab, vuốt ' +
    'back giữa chuyển cảnh đều nhả khoá; deep link đã mở Workout thì bấm Workout không mở bản hai. Sáu ' +
    'bản hỏng đều bị bắt. Không một hàm thời gian nào trong chốt (#157). Cộng phần cấu trúc: không tệp ' +
    'nào ngoài lib/nav.ts gọi thẳng router.*, cả bốn hàm nav.* đi qua `go` → `request`, layout gốc gọi ' +
    'useNavGuard(), mọi <Stack> gắn navGuardScreenListeners. Cộng: KHÔNG lệnh điều hướng nào đặt sau ' +
    '`signOut()` — cổng auth thay cả cây, nên lệnh ấy rơi vào chỗ không có navigator',
);
