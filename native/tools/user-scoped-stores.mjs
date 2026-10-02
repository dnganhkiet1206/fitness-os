/**
 * Module-scope state giữ dữ liệu của người dùng PHẢI đăng ký
 * `onUserScopedReset` — nếu không, sign-out không chạm được tới nó.
 *
 * ── lỗi ──
 *
 * Xem `src/lib/user-scoped-reset.ts`: `clearUserScopedStorage()` xoá
 * AsyncStorage khi đăng xuất, nhưng năm store đọc key một lần mỗi launch vào
 * một `let` ở module scope đằng sau chốt `hydrated`. Xoá key không động tới
 * `let`, và chốt nghĩa là không bao giờ đọc lại — tài khoản B nhìn thấy mục
 * tiêu bước chân và cân nặng của tài khoản A. Output thật, đã chạy ra số
 * (`tools/auth-lifecycle.mjs` Rule B dựng lại được).
 *
 * ── luật ──
 *
 * Mọi file trong `src/lib` và `src/hooks` có `let`/`var` ở module scope (hình
 * dạng của store: `let state` + chốt hydrate) phải gọi `onUserScopedReset(`,
 * HOẶC nằm trong `RESET_ELSEWHERE` (reset bằng đường khác, có tên hàm), HOẶC
 * nằm trong `NOT_USER_DATA` với lý do — vì không phải mọi `let` module đều
 * là dữ liệu người: cờ UI, singleton client, hàng đợi chẩn đoán.
 *
 * Thêm một store mới mà quên đăng ký → cổng đỏ, và người viết phải chọn:
 * đăng ký reset, hoặc ghi lý do vì sao state ấy không thuộc về người dùng.
 * Đó chính là chỗ quyết định được hỏi, chứ không phải chỗ cổng tự đoán.
 *
 * Phạm vi: `src/lib` + `src/hooks` là tầng store. Component (`src/components`,
 * `src/app`) giữ state trong React — `useState`/`useSyncExternalStore` chết
 * cùng cây render, không rò qua tài khoản.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

/** Bóc chú thích và string, giữ nguyên độ dài (#164). */
const strip = (s) => {
  let out = '';
  let quote = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      out += ch === '\n' ? '\n' : ' ';
      if (ch === quote && s[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      out += ' ';
      continue;
    }
    if (ch === '/' && s[i + 1] === '/') {
      while (i < s.length && s[i] !== '\n') {
        out += ' ';
        i++;
      }
      out += '\n';
      continue;
    }
    if (ch === '/' && s[i + 1] === '*') {
      i += 2;
      while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) {
        out += s[i] === '\n' ? '\n' : ' ';
        i++;
      }
      out += '  ';
      i++;
      continue;
    }
    out += ch;
  }
  return out;
};

/** Mọi `let`/`var` ở module scope (depth 0), kèm số dòng. */
function moduleLets(code) {
  const out = [];
  let d = 0;
  code.split('\n').forEach((ln, idx) => {
    const m = ln.match(/^\s*(?:let|var)\s+([A-Za-z_$][\w$]*)/);
    if (m && d === 0) out.push(`${m[1]}:${idx + 1}`);
    for (const c of ln) {
      if (c === '{') d++;
      else if (c === '}') d--;
    }
  });
  return out;
}

/* file → [hàm reset, nơi gọi nó] */
const RESET_ELSEWHERE = new Map([
  // trùng với OWNED_ELSEWHERE của auth-lifecycle.mjs Rule B
  ['src/lib/personal-model.ts', ['resetPersonalModel', 'src/lib/query-client.ts:273']],
]);

/* file → lý do state module-scope ấy KHÔNG phải dữ liệu người dùng */
const NOT_USER_DATA = new Map([
  ['src/hooks/use-health-sync.ts', 'autoSyncInFlight là chốt chống chạy trùng, không phải store (auth-lifecycle.mjs Rule B đã ghi nhận)'],
  ['src/lib/biometric-lock.ts', 'LocalAuth là bí danh module expo-local-authentication, không phải state'],
  ['src/lib/crash-log.ts', 'hàng đợi báo crash chẩn đoán — không mô tả người dùng'],
  ['src/lib/harness-bar.ts', 'cache chiều cao đo được của UI'],
  ['src/lib/health.ts', 'singleton HealthKit client — năng lực của máy, không phải dữ liệu người'],
  ['src/lib/interaction.ts', 'bộ đếm "đang chạm" của UI (chỉ mascot đọc) — không phải dữ liệu người'],
  ['src/lib/koa-presence.ts', 'cờ mounted của UI'],
  ['src/lib/mascot-emotion.ts', 'cảm xúc nhất thời của mascot + devOverride — tính lại mỗi launch'],
  ['src/lib/nav-guard.ts', 'máy trạng thái điều hướng (phase/pending/committedPath)'],
  ['src/lib/net-status.ts', 'trạng thái mạng + timer probe — của máy, không phải của người'],
  ['src/lib/notifications.ts', 'Notifications là bí danh module; queue là chuỗi nối promise để gọi OS tuần tự'],
  ['src/lib/observability.ts', 'cờ đã khởi tạo telemetry'],
  ['src/lib/scroll-to-top.ts', 'ref UI'],
  ['src/lib/tab-bar-visibility.ts', 'vị trí cuộn + timer ẩn tab bar'],
  ['src/lib/toast.ts', 'hàng đợi toast UI'],
  ['src/lib/web-alert.ts', 'cờ đã gắn polyfill alert cho web'],
]);

const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', 'src/lib/*.ts', 'src/hooks/*.ts'],
  { cwd: NATIVE, encoding: 'utf8' },
)
  .split('\n')
  .filter((f) => f && !/\.test\.|\.spec\./.test(f));

let stores = 0;
for (const f of files) {
  const code = strip(readFileSync(path.join(NATIVE, f), 'utf8'));
  const lets = moduleLets(code);
  if (lets.length === 0) continue;
  if (/onUserScopedReset\s*\(/.test(code)) {
    stores++;
    continue;
  }
  if (RESET_ELSEWHERE.has(f)) {
    stores++;
    continue;
  }
  if (NOT_USER_DATA.has(f)) continue;
  problems.push(
    `${f}: module-scope state (${lets.join(', ')}) giữ qua đăng xuất — đăng ký onUserScopedReset ` +
      `(xem src/lib/celebration-queue.ts:60-63), hoặc ghi vào RESET_ELSEWHERE / NOT_USER_DATA của ` +
      `tools/user-scoped-stores.mjs kèm lý do`,
  );
}
if (stores < 5) problems.push(`tự kiểm: chỉ ${stores} store đăng ký reset — bộ quét đã mù?`);

if (problems.length) {
  console.error(`store theo tài khoản HỎNG\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(
  `store theo tài khoản OK — ${stores} store đăng ký onUserScopedReset (hoặc reset ở nơi khác có tên), ` +
    `${NOT_USER_DATA.size} file module-state không phải dữ liệu người dùng có lý do ghi nhận`,
);
