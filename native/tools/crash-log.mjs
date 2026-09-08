/**
 * Cái ghi lại sự cố phải tự nó chạy đúng.
 *
 * ── vì sao có tệp này ──
 *
 * `lib/crash-log.ts` là mã chỉ chạy vào đúng lúc app đang chết. Không ảnh chụp
 * nào thấy nó, không màn hình nào vẽ nó, và nếu nó hỏng thì cách duy nhất phát
 * hiện là một sự cố thật đã xảy ra và KHÔNG được ghi lại — tức đúng lúc không
 * còn gì để đọc.
 *
 * Nó cũng mang một bất biến rất dễ mất: handler phải GỌI TIẾP handler cũ. Nuốt
 * đi thì hộp đỏ của bản dev biến mất và mọi lỗi khó thấy hơn trước — cùng bẫy
 * mà `catch {}` ở nút chia sẻ huy chương vừa phải sửa trong phiên này. Một
 * dòng `prev?.(e, isFatal)` bị xoá sẽ không làm gãy gì cả và không đỏ ở đâu cả.
 *
 * Nên tệp này biên dịch module thật, thay `AsyncStorage` và `ErrorUtils` bằng
 * vỏ ghi lại, rồi ném lỗi thật vào nó.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(NATIVE, 'node_modules', '.cache', 'crash-log');
rmSync(CACHE, { recursive: true, force: true });
mkdirSync(CACHE, { recursive: true });

try {
  execFileSync(
    'npx',
    ['tsc', 'src/lib/crash-log.ts', 'src/lib/telemetry-scrub.ts', '--ignoreConfig', '--outDir', CACHE,
      '--rootDir', 'src', '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck', '--lib', 'es2020'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
  );
} catch {
  /* import của AsyncStorage không phân giải được ngoài bundler; bản emit vẫn ra. */
}

const js = path.join(CACHE, 'lib/crash-log.js');
/* Vỏ AsyncStorage: một Map, và nó ghi lại mọi lần bị gọi. */
writeFileSync(
  path.join(CACHE, 'store.cjs'),
  `const m = new Map();
   module.exports = { __esModule: true, default: {
     getItem: async (k) => (m.has(k) ? m.get(k) : null),
     setItem: async (k, v) => { m.set(k, v); },
     removeItem: async (k) => { m.delete(k); },
   }, __map: m };`,
);
writeFileSync(
  js,
  readFileSync(js, 'utf8')
    .replace(
      /require\("@react-native-async-storage\/async-storage"\)/g,
      'require("../store.cjs")',
    )
    /* `@/lib/telemetry-scrub` là bộ lọc riêng tư, và nó được biên dịch THẬT
       cạnh tệp này chứ không bị vỏ đi: điều đáng kiểm nhất ở đây là một mục ghi
       vào nhật ký đã sạch hay chưa, và một vỏ giả sẽ trả lời hộ câu ấy. */
    .replace(/require\("@\/lib\/telemetry-scrub"\)/g, 'require("./telemetry-scrub.js")'),
);

const problems = [];
const { createRequire } = await import('node:module');
const require_ = createRequire(import.meta.url);
const mod = require_(js);

/* ── vỏ ErrorUtils ── */
let installedHandler = null;
let prevCalls = [];
const prevHandler = (e, fatal) => prevCalls.push(`${e?.message ?? e}|${!!fatal}`);
globalThis.ErrorUtils = {
  getGlobalHandler: () => installedHandler ?? prevHandler,
  setGlobalHandler: (h) => { installedHandler = h; },
};

/* Đợi hàng đợi ghi rút hết. Một tick là đủ cho một lần ghi; tám lần nối đuôi
   cần tám. Chờ dư không hại gì, chờ thiếu thì phép thử đo nhầm. */
const sleep = () => new Promise((r) => setTimeout(r, 30));

/* ── 1. gắn được, và gắn HAI lần không bọc hai lớp ── */
mod.installCrashHandler();
const first = installedHandler;
if (!first) problems.push('installCrashHandler không đặt handler nào');
mod.installCrashHandler();
if (installedHandler !== first) {
  problems.push('gọi lần hai bọc thêm một lớp — mỗi sự cố sẽ được ghi hai lần và handler cũ chạy hai lần');
}

/* ── 1b. nhật ký này RỜI KHỎI MÁY, nên nó phải sạch ──

   `settings.tsx` có nút "chạm để gửi đi" và nó gọi `Share.share` với toàn bộ
   nội dung. Tức đây là một đường telemetry thật, chỉ khác là người bấm nút là
   người dùng. Thông điệp của một lỗi thật mang theo thứ nó vừa chạm vào: một
   URL PostgREST có `user_id=eq.<uuid>`, một câu 401 kèm access token, một mảnh
   `image_base64`. Người dùng gửi nhật ký đi nhờ giúp là gửi cả những thứ ấy.

   Lọc ở CHỖ GHI chứ không ở nút chia sẻ: một đường gửi thứ hai thêm sau này sẽ
   tự động sạch. */
if (first) {
  const UID = '6f1c2a3b-4d5e-6f70-8192-a3b4c5d6e7f8';
  const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.aaaaaaaaaaaa';
  const dirty = new Error(`GET /rest/v1/daily_logs?user_id=eq.${UID} 401 token=${JWT}`);
  dirty.stack = `Error: ${dirty.message}\n  at fetch (app:///lib/edge.ts:1:1)`;
  first(dirty, false);
  await sleep();
  const [entry] = await mod.readCrashLog();
  const flat = JSON.stringify(entry ?? {});
  for (const [label, secret] of [['UUID người dùng', UID], ['access token', JWT]]) {
    if (flat.includes(secret)) {
      problems.push(
        `mục ghi vào nhật ký còn ${label}. Nhật ký này gửi đi được bằng một cú chạm ở màn Cài đặt, `
        + 'nên chưa lọc ở đây nghĩa là người dùng gửi đi thứ họ không biết mình đang gửi',
      );
    }
  }
  if (!flat.includes('daily_logs')) {
    problems.push('lọc quá tay: mất luôn tên bảng, thứ nói lên lỗi nằm ở đâu và không nói người dùng nào');
  }
  await mod.clearCrashLog();
  /* Trả lại trạng thái chung: các luật bên dưới ĐẾM số lần handler cũ chạy, nên
     một lỗi thêm vào ở đây sẽ làm chúng đo nhầm. */
  prevCalls = [];
}

/* ── 2. một lỗi chí mạng được ghi lại, ĐỦ ba thứ đáng đọc ── */
if (first) {
  const err = new Error('boom from the hero card');
  first(err, true);
  await sleep();
  const log = await mod.readCrashLog();
  if (log.length !== 1) {
    problems.push(`ném một lỗi mà nhật ký có ${log.length} mục`);
  } else {
    const e = log[0];
    if (!e.message.includes('boom from the hero card')) problems.push(`không ghi lại thông điệp lỗi (được "${e.message}")`);
    if (e.fatal !== true) problems.push('không ghi lại cờ fatal');
    if (!e.stack || e.stack.length < 10) problems.push('không ghi lại stack');
    if (Number.isNaN(Date.parse(e.at))) problems.push(`mốc thời gian không đọc được: ${e.at}`);
  }

  /* ── 3. HANDLER CŨ VẪN CHẠY ──
     Bất biến dễ mất nhất: nuốt lỗi thì hộp đỏ bản dev biến mất. */
  if (prevCalls.length !== 1) {
    problems.push(
      `handler cũ được gọi ${prevCalls.length} lần thay vì 1 — nuốt lỗi đi thì hộp đỏ của bản dev ` +
        'biến mất và mọi lỗi trở nên khó thấy hơn trước khi có tệp này',
    );
  }

  /* ── 4. giữ đúng năm lần gần nhất, mới nhất trước ── */
  for (let i = 2; i <= 8; i++) first(new Error('e' + i), false);
  await sleep();
  const log2 = await mod.readCrashLog();
  if (log2.length !== 5) problems.push(`ném 8 lỗi mà nhật ký giữ ${log2.length} mục, đáng lẽ 5`);
  else if (log2[0].message !== 'e8') problems.push(`mục đầu là "${log2[0].message}", đáng lẽ là lần MỚI NHẤT ("e8")`);

  /* ── 5. xoá được ── */
  await mod.clearCrashLog();
  if ((await mod.readCrashLog()).length !== 0) problems.push('clearCrashLog không xoá được');

  /* ── 6. kho hỏng không được ném thêm lỗi TỪ TRONG tay lỗi ── */
  const store = require_(path.join(CACHE, 'store.cjs'));
  store.__map.set('ascnd_crash_log', '{ đây không phải json');
  let threw = null;
  try {
    first(new Error('while the store is broken'), true);
    await sleep();
  } catch (e) {
    threw = e;
  }
  if (threw) problems.push(`nhật ký hỏng làm handler NÉM tiếp: ${threw.message}`);
  if (prevCalls.length !== 9) {
    problems.push(`handler cũ không được gọi khi kho hỏng (${prevCalls.length}/9) — lỗi thật sẽ bị nuốt`);
  }
}

rmSync(CACHE, { recursive: true, force: true });

if (problems.length) {
  console.error('nhật ký sự cố sai:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(
  'nhật ký sự cố OK — module thật được biên dịch rồi CHẠY với AsyncStorage và ErrorUtils giả: một lỗi ' +
    'chí mạng được ghi kèm thông điệp, stack, cờ fatal và mốc thời gian đọc được; handler cũ VẪN chạy ' +
    '(nuốt nó đi là làm hộp đỏ bản dev biến mất, cùng bẫy với `catch {}` ở nút chia sẻ huy chương); gắn ' +
    'hai lần không bọc hai lớp; tám lỗi để lại đúng năm mục mới-nhất-trước; và một kho hỏng không ném ' +
    'thêm lỗi từ trong tay lỗi, handler cũ vẫn được gọi',
);
