/**
 * Nothing of the previous account survives into the next one.
 *
 * `tools/signed-out.mjs` already checks that every AsyncStorage key is
 * classified as the device's or the person's, and that sign-out calls the two
 * cleaning functions. This file checks the three things that turn out to be
 * true anyway:
 *
 *   1. deleting a key does not clear the copy of it held in memory,
 *   2. the button in Settings is not the only way a session ends,
 *   3. a cache key that omits the account is a cache entry the next account
 *      can read.
 *
 * ── the bug this was written for ──
 *
 * Five of the thirteen user keys are read once per launch into a module-scope
 * `let`, behind a `hydrated` latch, so that Today, Settings and the Steps
 * screen all see one number. `clearUserScopedStorage()` deletes the key. The
 * `let` keeps the value, and the latch means it is never read from disk again —
 * so the value that now exists nowhere on disk is the value the app uses.
 *
 * Rule A runs the real modules against a real key-value store and watches it
 * happen. Before the fix:
 *
 *     A đặt:  steps=15000  weight=62.5  height=480
 *     sau signOut, AsyncStorage còn: {}
 *     B thấy: steps=15000  weight=62.5  height=480
 *
 * Person B is judged against person A's step goal — and the daily-steps quest
 * pays coins on that comparison, once, permanently — and person A's target
 * weight is drawn across person B's chart. `query-client.ts` knew this shape
 * could happen and handled exactly one case (`resetPersonalModel`, in `lib/`);
 * the other five are in `hooks/`, which `lib/` may not import.
 *
 * ── and why the rules are not "does the file mention the fix" ──
 *
 * Rule A does not grep for `onUserScopedReset`. It transpiles the stores,
 * hands them a working AsyncStorage, sets a value, runs the app's own
 * `clearUserScopedStorage` key list plus its resets, re-hydrates, and reads the
 * value back. Deleting a registration makes it fail with the stale number in
 * the message, which is the failure a person would have seen.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');
const strip = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/* ─────────────────────────────────────────────────────────────────────────
   Rule A — the stores really do forget, run rather than read
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Each entry: the store module, how to set a value as person A, and how to
 * read what person B ends up with. `expected` is what a fresh install has.
 *
 * These are the five modules that cache a `USER_KEYS` entry in module scope.
 * A sixth (`lib/personal-model.ts`) is covered by `signed-out.mjs` rule 6.
 */
const STORES = [
  {
    file: 'src/hooks/use-steps-goal.ts',
    what: 'mục tiêu bước chân',
    set: `m.setStepsGoal(15000)`,
    hydrate: `m.useStepsGoal()`,
    get: `m.useStepsGoal().goal`,
    expected: 10000,
    cost:
      'nhiệm vụ bước chân hằng ngày được chấm theo con số này và tiền thưởng đã trả thì không đòi lại được',
  },
  {
    file: 'src/hooks/use-weight-goal.ts',
    what: 'cân nặng mục tiêu',
    set: `m.setWeightGoalKg(62.5)`,
    hydrate: `m.useWeightGoal()`,
    get: `m.useWeightGoal().goalKg`,
    expected: null,
    cost: 'đường mục tiêu của người trước được vẽ lên biểu đồ cân nặng của người sau',
  },
  {
    file: 'src/lib/widget-heights.ts',
    what: 'chiều cao thẻ Today',
    set: `await store.setItem('ascnd-widget-heights', JSON.stringify({ steps: 480 })), await m.hydrateWidgetHeights()`,
    hydrate: `await m.hydrateWidgetHeights()`,
    get: `m.heightFor('steps')`,
    expected: 104,
    cost: 'khung xương của màn hình Today dựng theo số đo của tài khoản khác',
  },
];

const out = mkdtempSync(path.join(tmpdir(), 'authlife-'));
try {
  /* A working AsyncStorage and a React stub that runs effects immediately —
     enough to drive `useSyncExternalStore` stores from Node. */
  const shim = (rel, body) => {
    const dir = path.join(out, 'node_modules', rel);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: rel, main: 'index.js' }));
    writeFileSync(path.join(dir, 'index.js'), body);
  };
  shim(
    '@react-native-async-storage/async-storage',
    `const s = new Map();
     const A = {
       async getItem(k) { return s.has(k) ? s.get(k) : null; },
       async setItem(k, v) { s.set(k, String(v)); },
       async removeItem(k) { s.delete(k); },
       _dump() { return Object.fromEntries(s); },
     };
     module.exports = A; module.exports.default = A;`,
  );
  shim(
    'react',
    `module.exports = { useEffect: (fn) => { fn(); }, useSyncExternalStore: (sub, get) => get() };`,
  );

  try {
    execFileSync(
      'npx',
      [
        'tsc',
        'src/lib/user-scoped-reset.ts',
        ...STORES.map((s) => s.file),
        '--ignoreConfig',
        '--outDir',
        out,
        '--module',
        'commonjs',
        '--target',
        'es2020',
        '--skipLibCheck',
      ],
      { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch {
    /* `@/` is unmapped without the project tsconfig, so this reports TS2307 and
       exits non-zero. It emits regardless, and the requires are rewritten just
       below — the emitted files are checked for existence there. */
  }
  /* `@/lib/...` is unmapped without the project tsconfig, so the emitted
     requires are rewritten to the relative paths inside `out`. */
  for (const rel of [...STORES.map((s) => s.file), 'src/lib/user-scoped-reset.ts']) {
    const js = path.join(out, rel.replace(/^src\//, '').replace(/\.tsx?$/, '.js'));
    const depth = rel.replace(/^src\//, '').split('/').length - 1;
    const up = depth === 0 ? './' : '../'.repeat(depth);
    writeFileSync(
      js,
      readFileSync(js, 'utf8').replace(/require\("@\/(.*?)"\)/g, (_, p) => `require("${up}${p}")`),
    );
  }

  /* The key list and the reset call, read from the app rather than retyped. */
  const qc = strip(read('src/lib/query-client.ts'));
  const keys = [...(qc.match(/USER_KEYS\s*=\s*\[([\s\S]*?)\]/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map(
    (m) => m[1],
  );
  if (keys.length < 10) {
    problems.push(`chỉ đọc được ${keys.length} khoá USER_KEYS — bộ dò hỏng, đừng tin kết quả`);
  }
  if (!/runUserScopedResets\(\)/.test(qc)) {
    problems.push(
      'clearUserScopedStorage không gọi runUserScopedResets() — xoá khoá trong AsyncStorage ' +
        'không chạm tới bản sao đang nằm trong bộ nhớ, nên tài khoản sau vẫn dùng số của tài khoản trước',
    );
  }

  const driver = path.join(out, 'drive.cjs');
  writeFileSync(
    driver,
    `const store = require('@react-native-async-storage/async-storage');
     const reset = require('./lib/user-scoped-reset.js');
     const KEYS = ${JSON.stringify(keys)};
     (async () => {
       const results = [];
       for (const s of ${JSON.stringify(STORES.map((s) => ({ file: s.file, set: s.set, hydrate: s.hydrate, get: s.get })))}) {
         const m = require('./' + s.file.replace(/^src\\//, '').replace(/\\.tsx?$/, '.js'));
         await eval('(async () => { ' + s.set + '; })()');
         await new Promise((r) => setImmediate(r));
         const before = eval(s.get);
         /* exactly what clearUserScopedStorage does */
         for (const k of KEYS) await store.removeItem(k);
         reset.runUserScopedResets();
         await eval('(async () => { ' + s.hydrate + '; })()');
         await new Promise((r) => setImmediate(r));
         results.push({ file: s.file, before, after: eval(s.get), left: store._dump() });
       }
       console.log(JSON.stringify(results));
     })();`,
  );

  const raw = execFileSync('node', [driver], { cwd: out, encoding: 'utf8' });
  const results = JSON.parse(raw.trim().split('\n').pop());
  for (const store of STORES) {
    const r = results.find((x) => x.file === store.file);
    if (!r) {
      problems.push(`${store.file}: không chạy được — bộ dò hỏng`);
      continue;
    }
    if (JSON.stringify(r.before) === JSON.stringify(store.expected)) {
      problems.push(
        `${store.file}: đặt giá trị của người A không thay đổi được gì (vẫn ${JSON.stringify(r.before)}) — ` +
          'phép thử này không kiểm gì cả',
      );
      continue;
    }
    if (Object.keys(r.left).length > 0) {
      problems.push(
        `${store.file}: sau khi dọn, AsyncStorage vẫn còn ${JSON.stringify(r.left)} — ` +
          'khoá này không nằm trong USER_KEYS',
      );
    }
    if (JSON.stringify(r.after) !== JSON.stringify(store.expected)) {
      problems.push(
        `${store.file}: ${store.what} của tài khoản trước SỐNG SÓT qua đăng xuất — ` +
          `người A đặt ${JSON.stringify(r.before)}, AsyncStorage đã trống, ` +
          `người B vẫn thấy ${JSON.stringify(r.after)} thay vì ${JSON.stringify(store.expected)}; ` +
          store.cost,
      );
    }
  }
} catch (e) {
  problems.push(`không dựng được phép thử kho trong bộ nhớ: ${e.message}`);
} finally {
  rmSync(out, { recursive: true, force: true });
}

/* ─────────────────────────────────────────────────────────────────────────
   Rule B — a store that latches its read of a user key registers a reset
   ───────────────────────────────────────────────────────────────────────── */
{
  /*
    The mechanism, stated exactly, because the rule is built on it:

        async function hydrate() {
          if (hydrated) return;   // ← never read twice
          hydrated = true;
          … = await AsyncStorage.getItem(KEY);
        }

    A latch that is set and never cleared means *once per launch*. Deleting the
    key on sign-out then does nothing at all: the value stays in memory and the
    next account never gets its own read either.

    A latch cleared inside the same function — `try { … } finally { x = false }`
    — is an in-flight guard, not a once-per-launch gate. `use-health-sync.ts`
    has one of those and is correctly not a store.
  */
  const OWNED_ELSEWHERE = new Map([
    /* key → [file, the function that resets its module state] */
    ['ascnd_personal_model_v1', ['src/lib/personal-model.ts', 'resetPersonalModel']],
  ]);

  const files = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', 'src'],
    { cwd: NATIVE, encoding: 'utf8' },
  )
    .split('\n')
    .filter((f) => /\.tsx?$/.test(f));

  const qc = strip(read('src/lib/query-client.ts'));
  const userKeys = [
    ...(qc.match(/USER_KEYS\s*=\s*\[([\s\S]*?)\]/)?.[1] ?? '').matchAll(/'([^']+)'/g),
  ].map((m) => m[1]);
  const watched = [...userKeys, ...OWNED_ELSEWHERE.keys()];

  /** Every `function` body in `src`, by brace matching from its opening `{`. */
  const bodies = (src) => {
    const out = [];
    for (const m of src.matchAll(/function\s*\w*\s*\([^)]*\)\s*\{/g)) {
      let i = m.index + m[0].length - 1;
      let depth = 0;
      let end = i;
      for (; end < src.length; end++) {
        if (src[end] === '{') depth++;
        else if (src[end] === '}' && --depth === 0) break;
      }
      out.push(src.slice(i, end + 1));
    }
    return out;
  };

  let checked = 0;
  for (const f of files) {
    if (f === 'src/lib/query-client.ts') continue;
    let src;
    try {
      src = strip(read(f));
    } catch {
      continue;
    }
    const owns = watched.filter((k) => src.includes(`'${k}'`) || src.includes(`"${k}"`));
    if (owns.length === 0) continue;

    /* A once-per-launch latch guarding a storage read. */
    const latches = [];
    for (const body of bodies(src)) {
      if (!/AsyncStorage\.getItem/.test(body)) continue;
      for (const g of body.matchAll(/if\s*\(\s*(\w+)[^)]*\)\s*return/g)) {
        const name = g[1];
        if (!new RegExp(`^\\s*let\\s+${name}\\b`, 'm').test(src)) continue; // module scope only
        if (!new RegExp(`${name}\\s*=\\s*true`).test(body)) continue;
        if (new RegExp(`${name}\\s*=\\s*false`).test(body)) continue; // cleared: in-flight guard
        latches.push(name);
      }
    }
    if (latches.length === 0) continue;
    checked++;

    const owner = owns.map((k) => OWNED_ELSEWHERE.get(k)).find((o) => o && o[0] === f);
    const registers = owner
      ? new RegExp(`export function ${owner[1]}`).test(src)
      : /onUserScopedReset\s*\(/.test(src);
    if (!registers) {
      problems.push(
        `${f}: đọc ${owns.join(', ')} một lần mỗi lần chạy (cổng \`${latches[0]}\`) và giữ kết quả ` +
          'trong state ở phạm vi module, nhưng không đăng ký reset khi đăng xuất — ' +
          'xoá khoá trên đĩa không chạm tới giá trị trong bộ nhớ, và cổng đó khiến ' +
          'tài khoản sau KHÔNG BAO GIỜ đọc được giá trị của chính họ',
      );
    }
  }
  if (checked < 4) {
    problems.push(
      `chỉ soi được ${checked} kho có cổng đọc-một-lần — bộ quét lạc mục tiêu, đừng tin kết quả`,
    );
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   Rule C — the button is not the only door out of a session
   ───────────────────────────────────────────────────────────────────────── */
{
  const auth = strip(read('src/hooks/use-auth.tsx'));
  const at = auth.indexOf('onAuthStateChange');
  const handler = at < 0 ? '' : auth.slice(at, at + 1200);
  if (!handler) {
    problems.push('không tìm thấy onAuthStateChange — luật này đã lạc mục tiêu');
  } else if (!/SIGNED_OUT/.test(handler)) {
    problems.push(
      'onAuthStateChange không xử lý SIGNED_OUT — một phiên còn kết thúc bằng refresh token hết hiệu lực, ' +
        'tài khoản bị xoá từ máy khác, hoặc đổi mật khẩu; đi những cửa đó thì bộ nhớ đệm đã lưu ' +
        '(bữa ăn, cân nặng, buổi tập), mục tiêu, thói quen đã học và cả tuần thông báo của người trước ' +
        'ở nguyên trên máy cho người sau',
    );
  } else {
    /* And the SIGNED_OUT branch has to actually clean, not just log. */
    const branch = handler.slice(handler.indexOf('SIGNED_OUT'));
    if (!/forgetPreviousAccount|clearUserScopedStorage|clearPersistedCache/.test(branch)) {
      problems.push(
        'nhánh SIGNED_OUT không gọi hàm dọn nào — nhận ra phiên đã kết thúc rồi không làm gì cả',
      );
    }
  }

  /* The button still finishes the job itself; an event is not a guarantee. */
  const so = auth.indexOf('const signOut');
  const body = so < 0 ? '' : auth.slice(so, auth.indexOf('\n  };', so));
  if (!/forgetPreviousAccount|clearUserScopedStorage/.test(body)) {
    problems.push('signOut không dọn — chỉ trông vào sự kiện là một điều kiện tranh chấp');
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   Rule D — a cached query of one person's rows is keyed by that person
   ───────────────────────────────────────────────────────────────────────── */
{
  /* Tables whose rows are private to one account. Read from the migrations so
     a new user-owned table is covered without touching this file. */
  const MIGRATIONS = path.join(NATIVE, '..', 'supabase', 'migrations');
  let sql = '';
  try {
    for (const f of execFileSync('ls', [MIGRATIONS], { encoding: 'utf8' }).split('\n')) {
      if (f.endsWith('.sql')) sql += readFileSync(path.join(MIGRATIONS, f), 'utf8');
    }
  } catch {
    // migrations unavailable; the fallback below still names the ones that matter
  }
  const owned = new Set(
    [...sql.matchAll(/create table (?:if not exists )?(?:public\.)?(\w+)([\s\S]*?);\s*$/gim)]
      .filter((m) => /\buser_id\b/i.test(m[2]))
      .map((m) => m[1].toLowerCase()),
  );
  for (const t of ['food_items', 'meal_entries', 'weight_logs', 'daily_logs']) owned.add(t);

  /**
   * Keys that legitimately omit the account because they are keyed by an
   * unguessable row id instead — a uuid the next account has no way to hold.
   * Each needs a reason, and the reason is the id.
   */
  const BY_ROW_ID = new Set(['meal_plan_items', 'food_item']);

  const files = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', 'src'],
    { cwd: NATIVE, encoding: 'utf8' },
  )
    .split('\n')
    .filter((f) => /\.tsx?$/.test(f));

  let seen = 0;
  for (const f of files) {
    let src;
    try {
      src = strip(read(f));
    } catch {
      continue;
    }
    /* Each `useQuery({ … })`, by brace matching from the call, so the whole
       option object is in view no matter how long the queryFn is. */
    for (const m of src.matchAll(/useQuery\s*(?:<[^>]*>)?\s*\(\s*\{/g)) {
      let i = m.index + m[0].length - 1;
      let depth = 0;
      let end = i;
      for (; end < src.length; end++) {
        if (src[end] === '{') depth++;
        else if (src[end] === '}' && --depth === 0) break;
      }
      const block = src.slice(i, end + 1);
      const keyMatch = block.match(/queryKey\s*:\s*\[([^\]]*)\]/);
      if (!keyMatch) continue;
      const key = keyMatch[1];
      const name = (key.match(/^\s*'([^']+)'/) ?? [])[1] ?? '?';
      const tables = [...block.matchAll(/\.from\(\s*'([^']+)'/g)].map((x) => x[1].toLowerCase());
      const privateTables = tables.filter((t) => owned.has(t));
      if (privateTables.length === 0) continue;
      seen++;
      if (/user\?\.id|user\.id|userId|session\?\.user/.test(key)) continue;
      if (BY_ROW_ID.has(name)) continue;
      problems.push(
        `${f}: queryKey ['${name}', …] đọc ${privateTables.join(', ')} — hàng riêng của một tài khoản — ` +
          'mà không có id người dùng trong khoá; bộ nhớ đệm này được ghi xuống đĩa, nên mục nhập đó ' +
          'là thứ tài khoản kế tiếp đọc trúng khi gõ đúng chữ đó',
      );
    }
  }
  if (seen < 10) {
    problems.push(`chỉ soi được ${seen} truy vấn bảng riêng tư — bộ quét lạc mục tiêu, đừng tin kết quả`);
  }
}

if (problems.length) {
  console.log('vòng đời tài khoản còn hở:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'vòng đời tài khoản OK — ba kho có state ở phạm vi module (mục tiêu bước chân, cân nặng mục tiêu, ' +
    'chiều cao thẻ) được chạy thật với AsyncStorage thật: đặt giá trị của A, xoá đúng danh sách ' +
    'USER_KEYS của app, chạy các reset, hydrate lại — và B nhận về giá trị mặc định chứ không phải ' +
    'của A (bản đã ship trả về 15000 bước và 62.5 kg trong khi AsyncStorage hoàn toàn trống, ' +
    'vì `hydrated` khiến giá trị không bao giờ được đọc lại); mọi file giữ một khoá USER_KEYS ' +
    'trong state module đều đăng ký onUserScopedReset; onAuthStateChange dọn khi SIGNED_OUT ' +
    'chứ không chỉ cái nút trong Cài đặt — refresh token hết hiệu lực, tài khoản bị xoá từ máy khác ' +
    'và đổi mật khẩu đều đi cửa đó; và không truy vấn nào đọc bảng riêng tư mà thiếu id người dùng ' +
    'trong queryKey (tìm kiếm thức ăn từng chỉ khoá theo chữ đã gõ, nên "gà" của người này ' +
    'là thứ người kia đọc trúng)',
);
