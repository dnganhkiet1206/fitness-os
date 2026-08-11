/**
 * That a write made without signal is still a write tomorrow.
 *
 * ── the measured bug ──
 *
 * Recorded in `src/lib/offline.ts`: server holding one 250ml entry, connection
 * cut, one tap on +8 showed 16.5 oz, **nothing written** — not then, and not
 * thirty seconds after reconnecting. Half of it was fixed at the time: the
 * optimistic patch is suppressed while offline, so the app stopped showing
 * water nobody drank. The writes still vanished.
 *
 * ── why the project's own log refused to let this be done casually ──
 *
 * `docs/SO-GHI-LOI.md` A3 sets a condition on fixing it: *"Cần một cách kiểm tự
 * động chứng minh cả 30 chỗ đều đúng **trước khi** bắt đầu, không phải sau."*
 * A check that proves every site is right, written first.
 *
 * The reason is the failure mode. React Query pauses a mutation it cannot send
 * and persists it, but on the next launch it needs a `mutationFn` to hand the
 * variables to — and functions do not serialise, which is what
 * `setMutationDefaults` exists for. Get the key wrong at one call site and that
 * mutation **silently** stops resuming: no error, no warning, no wrong pixel.
 * Just a workout somebody logged that is not there in the morning.
 *
 * ── what is checked ──
 *
 * 1. one key and one default function, registered before the cache is restored
 * 2. paused mutations are actually resumed once it has been
 * 3. every durable call site files under that key and declares no local
 *    `mutationFn`
 * 4. the queued variables are plain data — nothing captured, nothing that
 *    cannot survive a round trip through AsyncStorage
 */
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(NATIVE, p), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const WRITE = 'src/lib/offline-write.ts';
const CLIENT = 'src/lib/query-client.ts';
const LAYOUT = 'src/app/_layout.tsx';

const problems = [];

// ── 1: one key, one function, taught before anything is restored ──
{
  const w = strip(read(WRITE));
  if (!/export const OFFLINE_WRITE_KEY/.test(w)) {
    problems.push(`${WRITE}: không có khoá dùng chung — mỗi chỗ tự đặt khoá là mỗi chỗ có thể đặt sai`);
  }
  if (!/setMutationDefaults\(/.test(w)) {
    problems.push(
      `${WRITE}: không gọi setMutationDefaults — ` +
        'mutation khôi phục từ bộ nhớ sẽ không có hàm nào để chạy và bị vứt đi trong im lặng',
    );
  }
  /* Retries are what let an online mutation that loses signal mid-flight enter
     the paused state instead of failing outright. */
  const retry = Number(w.match(/retry: (\d+)/)?.[1] ?? 0);
  if (retry < 1) {
    problems.push(
      `${WRITE}: retry = ${retry} — mutation bắt đầu lúc còn mạng rồi mất sóng giữa chừng ` +
        'chỉ chuyển sang trạng thái tạm dừng khi còn lượt thử lại; hết lượt là hỏng hẳn và mất luôn',
    );
  }

  const c = strip(read(CLIENT));
  if (!/registerOfflineWrites\(queryClient\)/.test(c)) {
    problems.push(`${CLIENT}: không đăng ký hàm mặc định — không có ai dạy client cách hoàn tất việc dở dang`);
  }
  /* Module scope, not inside a component: the provider restores the cache as
     soon as it mounts, and a paused mutation that arrives before its default
     exists is discarded. */
  if (/useEffect\([\s\S]{0,120}?registerOfflineWrites/.test(c)) {
    problems.push(
      `${CLIENT}: đăng ký bên trong useEffect — cache được khôi phục ngay khi provider mount, ` +
        'chậm một nhịp là mutation trở về mà chưa có hàm để nhận',
    );
  }
}

// ── 2: and then actually resumed ──
{
  const l = strip(read(LAYOUT));
  if (!/resumePausedMutations\(\)/.test(l)) {
    problems.push(
      `${LAYOUT}: không gọi resumePausedMutations — ` +
        'ghi lúc mất mạng vẫn nằm trong bộ nhớ và không bao giờ được gửi đi',
    );
  }
  if (!/onSuccess=\{[\s\S]{0,120}?resumePausedMutations/.test(l)) {
    problems.push(
      `${LAYOUT}: resumePausedMutations không nằm trong onSuccess của PersistQueryClientProvider — ` +
        'gọi trước khi cache khôi phục xong thì chưa có gì để tiếp tục',
    );
  }
}

/*
  ── 3: every durable call site files under the one key ──

  A hook that uses the key must **not** declare its own `mutationFn`. One
  written locally works perfectly until the app restarts, at which point the
  local function is not what comes back — the default is. That divergence is
  invisible in every test that does not involve killing the process.
*/
const files = globSync('src/**/*.{ts,tsx}', { cwd: NATIVE }).sort();
for (const f of files) {
  if (f === WRITE) continue;
  const code = strip(read(f));
  if (!/OFFLINE_WRITE_KEY/.test(code)) continue;

  for (const m of code.matchAll(/useMutation<[^>]*>\(\{([\s\S]*?)\n  \}\)/g)) {
    const body = m[1];
    if (!/mutationKey: \[\.\.\.OFFLINE_WRITE_KEY\]/.test(body)) continue;
    if (/mutationFn:/.test(body)) {
      problems.push(
        `${f}: mutation dùng OFFLINE_WRITE_KEY nhưng vẫn khai mutationFn riêng — ` +
          'chạy đúng cho tới lần khởi động lại đầu tiên, rồi hàm mặc định mới là hàm thật sự chạy',
      );
    }
  }
}

/*
  ── 4: the variables are data, not a closure ──

  What is queued gets written to AsyncStorage and read back by a process that
  has forgotten the component, the user and the date. Anything the payload
  cannot carry itself is a field that will be `undefined` on resume — and an
  insert with a missing `user_id` fails against RLS, which arrives as a write
  that simply never appeared.
*/
{
  const w = strip(read(WRITE));
  /* To the blank line, not to the first `;`.

     Every field in a multi-line variant ends in a semicolon, so `;\n` stopped
     the capture at `kind: 'workout';` — three lines before the `userId` it then
     reported as missing. Twice now a rule in this file has failed on the shape
     of the type rather than on its content. */
  const type = w.match(/export type OfflineWrite =([\s\S]*?)\n\n/)?.[1] ?? '';
  if (!type) {
    problems.push(`${WRITE}: không tìm thấy kiểu OfflineWrite`);
  } else {
    /* Split on the union separator at the start of a line, not on every `|`.
       `templateId: string | null` is a pipe *inside* a variant, and splitting
       on it cut the workout case in half — so the half without `userId` was
       reported as a variant missing it. The rule was wrong, not the code. */
    for (const variant of type.split(/\n\s*\|\s/).map((v) => v.trim()).filter(Boolean)) {
      const kind = variant.match(/kind: '(\w+)'/)?.[1];
      if (!kind) continue;
      if (!/userId: string/.test(variant)) {
        problems.push(
          `${WRITE}: biến thể "${kind}" không mang userId — ` +
            'khi khôi phục thì không còn phiên nào để suy ra nó, và insert thiếu user_id sẽ bị RLS chặn',
        );
      }
      /*
        ── and its own clock ──

        Every table these write to stamps its time column with `DEFAULT now()`,
        which is exactly right when the insert happens as you tap and silently
        wrong by however long the queue waited when it does not. Breakfast
        logged at eight in a basement, replayed at six, arrives as dinner;
        replayed after midnight it arrives on the wrong day, and the rebuild
        that travels with it then recomputes a day the meal was never part of.

        Nothing about that surfaces as an error. The row is there, the totals
        are right, and it is filed under the wrong hours.

        So a variant has to carry the moment itself. `date`, `dateTime` or `at`
        — the name follows the column it feeds, the requirement is that the
        value was decided on the device that saw the tap.
      */
      if (!/\b(dateTime|date|at): string/.test(variant)) {
        problems.push(
          `${WRITE}: biến thể "${kind}" không mang thời điểm riêng — ` +
            'cột thời gian mặc định now(), nên khi hàng đợi gửi muộn thì bản ghi mang giờ lúc gửi ' +
            'chứ không phải giờ lúc người dùng bấm, và qua nửa đêm là sang hẳn ngày khác',
        );
      }
    }
    /* Functions and class instances do not survive JSON. */
    if (/=>|\bDate\b(?!\w)/.test(type.replace(/'[^']*'/g, ''))) {
      problems.push(
        `${WRITE}: OfflineWrite chứa hàm hoặc Date — ` +
          'chỉ dữ liệu thuần mới sống sót qua AsyncStorage; ngày tháng phải là chuỗi ISO',
      );
    }
  }
}

/*
  ── the refresh is a default, not a call-site detail ──

  TanStack's persistence guide: *"When persisting to an external storage, only
  the state of mutations is persisted, as functions cannot be serialized."* That
  is the sentence that makes `mutationFn` a default here — and it applies to the
  callbacks just as completely. It is easy to fix one and forget the other,
  because forgetting the second one breaks nothing you can see.

  A meal logged in a basement, the app killed, opened the next morning: the
  write resumes and lands, and every `onSuccess` that would have refreshed the
  screen belongs to a component that does not exist in this process and never
  did. `staleTime` usually covers it; on a cold start the refetch and the
  resumed write race, and losing that race leaves somebody looking at a day
  missing the meal they can see in their own history.
*/
{
  const w = strip(read(WRITE));
  const defaults = w.slice(w.indexOf('setMutationDefaults'));
  if (!/invalidateQueries\(/.test(defaults)) {
    problems.push(
      `${WRITE}: setMutationDefaults không làm mới truy vấn nào — ` +
        'callback không được lưu cùng mutation (chỉ trạng thái được lưu), nên một bản ghi ' +
        'gửi lại sau khi khởi động lại app sẽ vào server mà màn hình không hề đổi',
    );
  }
  /* `onSettled`, not `onSuccess`: a write that finally gives up has changed
     nothing, and the screen should go back to showing what the server says. */
  if (!/onSettled:/.test(defaults)) {
    problems.push(
      `${WRITE}: setMutationDefaults chỉ làm mới khi thành công — ` +
        'bản ghi hết lượt thử lại cũng phải kéo màn hình về đúng sự thật của server',
    );
  }
}

/**
 * The self-test.
 *
 * The local-`mutationFn` rule is the one worth proving, because the broken
 * version passes every test that does not restart the process — which is every
 * test anybody runs by hand.
 */
const SELF = [
  ['khai mutationFn riêng — bị bắt', () => {
    const body = "    mutationKey: [...OFFLINE_WRITE_KEY],\n    mutationFn: async () => {},";
    return /mutationKey: \[\.\.\.OFFLINE_WRITE_KEY\]/.test(body) && /mutationFn:/.test(body);
  }],
  ['chỉ có key — không bị bắt', () => {
    const body = '    mutationKey: [...OFFLINE_WRITE_KEY],\n    onMutate: () => {},';
    return !/mutationFn:/.test(body);
  }],
  ['mặc định không làm mới truy vấn — bị bắt', () => {
    const d = "setMutationDefaults([...KEY], { mutationFn: f, retry: 3 });";
    return !/invalidateQueries\(/.test(d);
  }],
  ['chỉ làm mới khi thành công — bị bắt', () => {
    const d = "setMutationDefaults([...KEY], { mutationFn: f, onSuccess: () => client.invalidateQueries() });";
    return /invalidateQueries\(/.test(d) && !/onSettled:/.test(d);
  }],
  ['biến thể thiếu thời điểm riêng — bị bắt', () => {
    const v = "{ kind: 'supplement'; userId: string; supplementId: string; }";
    return !/\b(dateTime|date|at): string/.test(v);
  }],
  ['biến thể có dateTime — không báo oan', () => {
    const v = "{ kind: 'meal'; userId: string; dateTime: string; }";
    return /\b(dateTime|date|at): string/.test(v);
  }],
  ['biến thể thiếu userId — bị bắt', () => {
    const v = "{ kind: 'water'; amountMl: number }";
    return !/userId: string/.test(v);
  }],
  ['retry 0 — bị bắt', () => Number('0') < 1],
  ['biến thể nhiều dòng không bị cắt ở dấu ;', () => {
    const src = "export type OfflineWrite =\n  | {\n      kind: 'a';\n      userId: string;\n    };\n\nconst x = 1;";
    const t = src.match(/export type OfflineWrite =([\s\S]*?)\n\n/)?.[1] ?? '';
    return /userId: string/.test(t);
  }],
  ['pipe trong biến thể không cắt nhầm', () => {
    const t = "\n  | { kind: 'a'; userId: string }\n  | { kind: 'b'; userId: string; x: string | null }";
    const parts = t.split(/\n\s*\|\s/).map((v) => v.trim()).filter(Boolean);
    return parts.length === 2 && parts.every((v) => /userId: string/.test(v));
  }],
];
const missed = SELF.filter(([, fn]) => !fn()).map(([l]) => l);
if (missed.length) {
  console.error(`phép tự kiểm hỏng — không bắt được: ${missed.join('; ')}; đừng tin kết quả`);
  process.exit(2);
}

if (problems.length) {
  console.log('ghi khi mất mạng sai:\n');
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}

/* Distinct kinds, not a match count halved — `case 'water':` does not carry
   the `kind:` prefix, so the halving reported three operations as two. */
const kinds = new Set([...read(WRITE).matchAll(/kind: '(\w+)'/g)].map((m) => m[1])).size;
console.log(
  `ghi khi mất mạng OK — một khoá, một hàm mặc định đăng ký ở module scope trước khi cache khôi phục; ` +
    `resumePausedMutations chạy trong onSuccess của provider; ${kinds} loại thao tác, ` +
    'mỗi loại mang đủ userId, mang thời điểm của chính nó (không để cột DEFAULT now() đóng dấu lúc gửi muộn), ' +
    'và chỉ chứa dữ liệu thuần; mặc định còn làm mới truy vấn khi thao tác lắng xuống, ' +
    'vì callback của chỗ gọi không được lưu cùng mutation',
);
