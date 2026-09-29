/**
 * Chính sách ghi khi mất mạng (#161, `docs/OFFLINE-POLICY.md`): mọi thao tác
 * ghi tự khai lớp, và lớp Trạng thái giữ đúng ba luật của nó.
 *
 * ── vế 1: không thao tác nào chưa khai ──
 *
 * Mỗi `useOnlineMutation({…})` phải mang `meta: { offline: now(N) }` với N là
 * số câu hỏi đã quyết nó (1, 2, 3 hoặc 6); mỗi `useMutation({…})` gọi thẳng
 * phải mang `meta: { offline: RECORD }` — một mutation trần mà không xếp hàng
 * là đúng cái "tạm dừng im lặng" #45 đã gỡ. Kiểu của `useOnlineMutation` đã
 * đòi `meta`, nhưng `useMutation` thì không có kiểu nào đòi, nên bước này mới
 * là thứ buộc thao tác thứ 101 phải trả lời sáu câu hỏi.
 *
 * ── vế 2: lớp Trạng thái ──
 *
 * Mỗi `setState({…})` phải có khoá gộp (`key:`), giá trị server để so
 * (`server:`), và `send` KHÔNG đảo: không `!value`, không RPC "toggle", không
 * `NOT` trong câu lệnh — thứ gửi đi phải là giá trị cần ĐẶT. Và lõi không
 * được lưu xuống máy: lớp này chỉ sống trong phiên, đúng lựa chọn của chủ dự
 * án.
 *
 * ── vế 3: CHẠY THẬT lõi `state-write-core.ts` ──
 *
 * Tick → bỏ → tick khi mất mạng rồi có mạng: MỘT lệnh ghi, giá trị true.
 * Tick → bỏ: không lệnh nào. Ý mới lúc một lệnh đang bay: đợi rồi gửi ý mới
 * nhất, không hai lệnh song song. Thực thể đã bị xoá: bỏ ý, có lời báo. Hỏng
 * vì mất mạng: giữ ý tới lần có mạng. Hỏng vì lý do khác: bỏ ý, có lời báo.
 * Năm bản hỏng phải bị bắt.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');
/* Chú thích thành khoảng trắng, GIỮ xuống dòng — để số dòng trong lời báo đúng. */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')).replace(/(^|[^:])\/\/.*$/gm, '$1');
const problems = [];
const fatal = (m) => {
  console.error(`phép tự kiểm hỏng — ${m}, đừng tin kết quả`);
  process.exit(1);
};

/** Đối số `{…}` bắt đầu ở `open` (vị trí dấu `{`), cân ngoặc. */
function objectAt(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return src.slice(open, i + 1);
    else if (ch === "'" || ch === '"' || ch === '`') {
      const q = ch;
      for (i++; i < src.length && src[i] !== q; i++) if (src[i] === '\\') i++;
    }
  }
  return src.slice(open);
}

/** Mọi vấn đề của MỘT tệp nguồn — tách ra để phép tự kiểm gọi đúng hàm này. */
export function audit(file, raw) {
  const out = [];
  const code = strip(raw);
  const lineOf = (i) => code.slice(0, i).split('\n').length;
  for (const m of code.matchAll(/\b(useOnlineMutation|useMutation)\s*(<[^(]*>)?\(\s*\{/g)) {
    if (file.endsWith('use-online-mutation.ts')) continue;
    const obj = objectAt(code, m.index + m[0].length - 1);
    const meta = /\bmeta:\s*\{\s*offline:\s*(now\((\d)\)|RECORD)\s*\}/.exec(obj);
    const at = `${file}:${lineOf(m.index)}`;
    if (!meta) {
      out.push(`${at}: \`${m[1]}\` chưa khai lớp — thêm \`meta: { offline: ${m[1] === 'useMutation' ? 'RECORD' : 'now(<1|2|3|6>)'} }\` theo sáu câu hỏi của docs/OFFLINE-POLICY.md`);
      continue;
    }
    if (m[1] === 'useOnlineMutation' && !meta[2]) out.push(`${at}: \`useOnlineMutation\` từ chối khi mất mạng, nên lớp của nó là \`now(N)\`, không phải RECORD`);
    if (meta[2] && !['1', '2', '3', '6'].includes(meta[2])) out.push(`${at}: \`now(${meta[2]})\` — lớp Tức thời chỉ do câu 1, 2, 3 hoặc 6 quyết`);
    if (m[1] === 'useMutation' && meta[2]) out.push(`${at}: \`useMutation\` trần khai \`now\` — nó sẽ TẠM DỪNG im lặng khi mất mạng (#45); dùng \`useOnlineMutation\``);
  }
  for (const m of code.matchAll(/(?<![.\w])setState\(\s*\{/g)) {
    if (file.endsWith('lib/state-write.ts')) continue;
    const obj = objectAt(code, m.index + m[0].length - 1);
    const at = `${file}:${lineOf(m.index)}`;
    if (!/\bkey\b\s*[:,}]/.test(obj)) out.push(`${at}: lớp Trạng thái thiếu khoá gộp \`key\` (thực thể, trường)`);
    if (!/\bserver\b\s*[:,}]/.test(obj)) out.push(`${at}: lớp Trạng thái thiếu \`server\` — không so được "ý cuối trùng giá trị server thì không gửi"`);
    const send = /\bsend:\s*async\s*\((\w+)\)\s*=>\s*\{/.exec(obj);
    if (!send) {
      out.push(`${at}: lớp Trạng thái thiếu \`send: async (value) => {…}\``);
      continue;
    }
    const body = objectAt(obj, send.index + send[0].length - 1);
    const v = send[1];
    if (new RegExp(`!\\s*${v}\\b`).test(body.replace(new RegExp(`if\\s*\\(\\s*!\\s*${v}\\s*\\)`, 'g'), ''))) {
      out.push(`${at}: \`send\` gửi \`!${v}\` — đó là lệnh ĐẢO; lớp Trạng thái gửi giá trị cần đặt`);
    }
    if (/rpc\(\s*'[^']*toggle/i.test(body) || /\bNOT\s+\w+/.test(body)) out.push(`${at}: \`send\` gọi một lệnh đảo (toggle/NOT) — gửi giá trị tuyệt đối`);
  }
  return out;
}

/* ── vế 1 và 2 trên kho thật ── */
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'src'], { cwd: NATIVE, encoding: 'utf8' })
  .split('\n')
  .filter((f) => /\.tsx?$/.test(f) && existsSync(path.join(NATIVE, f)));
let mutations = 0;
let states = 0;
for (const f of files) {
  const raw = read(f);
  if (!f.endsWith('use-online-mutation.ts')) mutations += (strip(raw).match(/\b(useOnlineMutation|useMutation)\s*(<[^(]*>)?\(\s*\{/g) ?? []).length;
  states += f.endsWith('lib/state-write.ts') ? 0 : (strip(raw).match(/(?<![.\w])setState\(\s*\{/g) ?? []).length;
  problems.push(...audit(f, raw));
}
if (mutations < 60) fatal(`chỉ đếm được ${mutations} thao tác ghi — bộ quét hỏng`);
if (states < 2) problems.push(`chỉ có ${states} chỗ dùng lớp Trạng thái — tick đi chợ và tick thực phẩm bổ sung đều phải ở đây`);
/* Đo được (#161): không có chỉ thị này, React Compiler ghi nhớ hàm đọc ý chờ và
   ô tick khi mất mạng không bao giờ đổi — câu báo hiện, kho có ý, màn đứng yên. */
if (!/function useStateOverlay\([\s\S]*?\|\s*undefined\s*\{\s*'use no memo';/.test(strip(read('src/lib/state-write.ts')))) {
  problems.push("src/lib/state-write.ts: `useStateOverlay` mất chỉ thị `'use no memo'` — React Compiler sẽ ghi nhớ hàm đọc và danh sách không vẽ lại ý chờ");
}
for (const f of ['src/lib/state-write-core.ts', 'src/lib/state-write.ts']) {
  if (/AsyncStorage|persist/i.test(strip(read(f)))) problems.push(`${f}: lớp Trạng thái được lưu xuống máy — chủ dự án chọn "chỉ trong phiên"`);
}

/* Phép tự kiểm cho vế 1–2: mỗi ca giả phải đỏ đúng một lần. */
{
  const bad = [
    ['thiếu lớp', "useOnlineMutation({ mutationFn: async () => {} })"],
    ['useMutation trần thiếu lớp', "useMutation({ mutationFn: async () => {} })"],
    ['useMutation trần khai now', "useMutation({ meta: { offline: now(2) }, mutationFn: async () => {} })"],
    ['now(4)', "useOnlineMutation({ meta: { offline: now(4) }, mutationFn: async () => {} })"],
    ['state thiếu key', "setState({ value: v, server: s, send: async (value) => { return 'ok'; } })"],
    ['state gửi lệnh đảo', "setState({ key: k, value: v, server: s, send: async (value) => { await up({ checked: !value }); return 'ok'; } })"],
    ['state gọi RPC toggle', "setState({ key: k, value: v, server: s, send: async (value) => { await supabase.rpc('toggle_checked', {}); return 'ok'; } })"],
  ];
  for (const [name, src] of bad) {
    if (audit('src/fake.ts', src).length !== 1) fatal(`ca giả "${name}" không đỏ đúng một lần (${audit('src/fake.ts', src).length})`);
  }
  const good = [
    "useOnlineMutation({ meta: { offline: now(3) }, mutationFn: async () => {} })",
    "useMutation<void, Error, X>({ meta: { offline: RECORD }, mutationKey: [...K] })",
    "setState({ key: k, value: v, server: s, send: async (value) => { if (!value) { await del(); return 'ok'; } await ins(); return 'ok'; } })",
  ];
  for (const src of good) if (audit('src/fake.ts', src).length) fatal(`ca đúng bị báo: ${audit('src/fake.ts', src)[0]}`);
}

/* ── vế 3: chạy thật lõi ── */
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => ((resolve = a), (reject = b)));
  return { promise, resolve, reject };
};
const tick = () => new Promise((r) => setImmediate(r));

function world(core) {
  let online = true;
  const sends = [];
  const gone = [];
  const errors = [];
  const settled = [];
  const w = createWriter();
  function createWriter() {
    return core.createStateWriter({
      online: () => online,
      isOffline: (e) => e?.offline === true,
      onSettled: (k) => settled.push(k),
      onGone: (k) => gone.push(k),
      onError: (k, e) => errors.push([k, e]),
    });
  }
  /** Máy chủ giả: mỗi lệnh gửi là một promise ca kiểm tự quyết lúc xong. */
  let reply = () => Promise.resolve('ok');
  const set = (key, value, server) =>
    w.set({ key, value, server, send: (v) => (sends.push([key, v]), reply(v)) });
  return {
    w, set, sends, gone, errors, settled,
    offline: () => (online = false),
    online: () => {
      online = true;
      w.flush();
    },
    reply: (f) => (reply = f),
  };
}

const CASES = [
  ['tick → bỏ → tick khi mất mạng, có mạng: MỘT lệnh ghi, giá trị true', async (core) => {
    const t = world(core);
    t.offline();
    t.set('g:1', true, false);
    t.set('g:1', false, false);
    t.set('g:1', true, false);
    if (t.sends.length) return `gửi ${t.sends.length} lệnh lúc còn mất mạng`;
    t.online();
    await tick();
    return JSON.stringify(t.sends) === '[["g:1",true]]' ? null : `lệnh ghi: ${JSON.stringify(t.sends)}`;
  }],
  ['tick → bỏ khi mất mạng: KHÔNG lệnh nào, không còn ý chờ', async (core) => {
    const t = world(core);
    t.offline();
    t.set('g:1', true, false);
    t.set('g:1', false, false);
    t.online();
    await tick();
    if (t.sends.length) return `gửi ${JSON.stringify(t.sends)}`;
    return t.w.pending('g:1') ? 'ý chờ còn treo' : null;
  }],
  ['có mạng, trùng giá trị server: không gửi', async (core) => {
    const t = world(core);
    const r = t.set('g:1', true, true);
    await tick();
    return r === 'unchanged' && !t.sends.length ? null : `ra ${r}, gửi ${t.sends.length}`;
  }],
  ['ý mới lúc một lệnh đang bay: đợi, rồi gửi ý MỚI NHẤT — không hai lệnh song song', async (core) => {
    const t = world(core);
    const d = deferred();
    t.reply(() => d.promise);
    t.set('g:1', true, false);
    t.set('g:1', false, false);
    t.set('g:1', true, false);
    t.set('g:1', false, false);
    if (t.sends.length !== 1) return `${t.sends.length} lệnh song song`;
    t.reply(() => Promise.resolve('ok'));
    d.resolve('ok');
    await tick();
    await tick();
    const last = t.sends.at(-1);
    return t.sends.length === 2 && last[1] === false && !t.w.pending('g:1') ? null : `lệnh ghi: ${JSON.stringify(t.sends)}`;
  }],
  ['thực thể đã bị xoá ở nơi khác: bỏ ý và báo', async (core) => {
    const t = world(core);
    t.reply(() => Promise.resolve('gone'));
    t.set('g:1', true, false);
    await tick();
    return t.gone.length === 1 && !t.w.pending('g:1') && t.settled.length === 1 ? null : `gone ${t.gone.length}, pending ${!!t.w.pending('g:1')}`;
  }],
  ['hỏng vì mất mạng giữa chừng: giữ ý, lần có mạng sau gửi lại', async (core) => {
    const t = world(core);
    t.reply(() => Promise.reject({ offline: true }));
    t.set('g:1', true, false);
    await tick();
    if (!t.w.pending('g:1')) return 'ý bị bỏ khi request hỏng vì mất mạng';
    if (t.errors.length) return 'báo lỗi cho một lần hỏng vì mất mạng';
    t.reply(() => Promise.resolve('ok'));
    t.online();
    await tick();
    return t.sends.length === 2 && !t.w.pending('g:1') ? null : `lệnh ghi: ${JSON.stringify(t.sends)}`;
  }],
  ['hỏng vì lý do khác: bỏ ý, báo lỗi, đọc lại server', async (core) => {
    const t = world(core);
    t.reply(() => Promise.reject(new Error('500')));
    t.set('g:1', true, false);
    await tick();
    return t.errors.length === 1 && !t.w.pending('g:1') && t.settled.length === 1 ? null : `errors ${t.errors.length}, pending ${!!t.w.pending('g:1')}`;
  }],
  ['hai khoá khác nhau không gộp vào nhau', async (core) => {
    const t = world(core);
    t.offline();
    t.set('g:1', true, false);
    t.set('g:2', true, false);
    t.online();
    await tick();
    return t.sends.length === 2 ? null : `lệnh ghi: ${JSON.stringify(t.sends)}`;
  }],
  ['pending() giữ cùng một object tới khi ý đổi (useSyncExternalStore)', async (core) => {
    const t = world(core);
    t.offline();
    t.set('g:1', true, false);
    const a = t.w.pending('g:1');
    const b = t.w.pending('g:1');
    return a === b && a.value === true ? null : 'mỗi lần đọc một object mới — màn sẽ dựng lại mãi';
  }],
];

const out = mkdtempSync(path.join(tmpdir(), 'offline-class-'));
try {
  execFileSync('npx', ['tsc', 'src/lib/state-write-core.ts', '--ignoreConfig', '--outDir', out,
    '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] });
  const compiled = readFileSync(path.join(out, 'state-write-core.js'), 'utf8');
  let n = 0;
  const load = (src) => {
    const f = path.join(out, `v${n++}.js`);
    writeFileSync(f, src);
    return createRequire(import.meta.url)(f);
  };
  const runAll = async (core) => {
    const fails = [];
    for (const [name, fn] of CASES) {
      let err;
      try {
        err = await fn(core);
      } catch (e) {
        err = `ném ra ${e?.message ?? e}`;
      }
      if (err) fails.push(`${name}: ${err}`);
    }
    return fails;
  };
  problems.push(...(await runAll(load(compiled))));

  const MUTANTS = [
    ['không gộp: mỗi ý một lệnh', [/if \(entry\.inFlight\) \{\s*notify\(\);\s*return 'queued';\s*\}/, ''], [/if \(!e \|\| e\.inFlight\)\s*return;/, 'if (!e) return;']],
    ['không bỏ ý trùng giá trị server', [/if \(Object\.is\(entry\.desired, entry\.server\)\) \{\s*entries\.delete\(intent\.key\);\s*notify\(\);\s*return 'unchanged';\s*\}/, '']],
    ['không gửi ý mới sau lệnh đang bay', [/if \(!Object\.is\(e\.desired, e\.server\)\) \{\s*start\(key\);\s*return;\s*\}/, '']],
    ['thực thể đã xoá mà không báo', [/env\.onGone\(key\);/, '']],
    ['bỏ ý khi hỏng vì mất mạng', [/if \(env\.isOffline\(error\)\) \{/, 'if (false) {']],
  ];
  for (const [name, ...edits] of MUTANTS) {
    let src = compiled;
    for (const [re, to] of edits) {
      if (!re.test(src)) fatal(`bản hỏng "${name}": không tìm thấy chỗ để sửa (${re})`);
      src = src.replace(re, to);
    }
    if (!(await runAll(load(src))).length) fatal(`bản hỏng "${name}" vẫn qua hết các ca`);
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}

if (problems.length) {
  console.error('chính sách ghi khi mất mạng CÓ LỖI:\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}
console.log(
  `chính sách ghi khi mất mạng OK — ${mutations} thao tác ghi đều tự khai lớp (useOnlineMutation → now(câu 1/2/3/6), ` +
    `useMutation trần → RECORD); ${states} chỗ dùng lớp Trạng thái đều có khoá gộp, giá trị server và send không đảo; lớp ` +
    'ấy không lưu xuống máy. CHẠY THẬT lõi: tick → bỏ → tick khi mất mạng ra MỘT lệnh true; tick → bỏ ra không lệnh nào; ' +
    'trùng server không gửi; ý mới lúc đang bay đợi rồi gửi ý mới nhất; thực thể đã xoá thì bỏ và báo; hỏng vì mất mạng giữ ' +
    'ý tới lần có mạng; hỏng khác bỏ và báo. 7 ca giả của bộ dò và 5 bản hỏng của lõi đều bị bắt',
);
