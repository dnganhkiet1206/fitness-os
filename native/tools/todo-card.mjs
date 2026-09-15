/**
 * Thẻ "Cần làm hôm nay": danh sách đúng, và KHÔNG ai dựng lại lời mời thứ hai.
 *
 *     node tools/todo-card.mjs
 *
 * ── vì sao một thẻ danh sách lại cần một bước kiểm ──
 *
 * Thứ nó thay thế đã sai đúng ở phần logic. Hàng bốn chip trên Today mời ghi
 * bốn thứ mà không bao giờ hỏi thứ nào ĐÃ ghi — `lib/today-cta.ts` ra đời vì
 * điều kiện `planned || day?.is_rest` không có vế `done`, nên một buổi tập đã
 * xong vẫn được mời ghi lại. Một danh sách nằm trong JSX là một danh sách không
 * công cụ nào chạy được, nên danh sách này nằm ở `lib/todo.ts` và bước dưới đây
 * GỌI nó với cả 32 tổ hợp.
 *
 * ── ba luật còn lại đều là về chuyện "đừng có bản thứ hai" ──
 *
 * Cả thay đổi này là một phép GỘP: năm lời mời rải trên một trang cuộn về một
 * chỗ. Chế độ hỏng của nó không phải thẻ vẽ sai, mà là lời mời thứ hai mọc lại
 * — một hàng chip mới, một nguồn trạng thái riêng, hay một ô nhập cân nặng thứ
 * hai. Cả ba đều dựng được, đều chạy được, và không cái nào làm đỏ `tsc`.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(NATIVE, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

const CARD = 'src/components/ascnd/todo-card.tsx';
const ENTRY = 'src/components/ascnd/weight-entry.tsx';
const TODAY = 'src/app/(tabs)/index.tsx';

const problems = [];
let CASES = 0;
const out = mkdtempSync(path.join(tmpdir(), 'todo-'));

try {
  execFileSync(
    'npx',
    ['tsc', 'src/lib/todo.ts', '--ignoreConfig', '--outDir', out,
      '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const { TODO_ORDER, todoOpen, todoProgress } = createRequire(import.meta.url)(
    path.join(out, 'todo.js'),
  );

  /* ── 1. thứ tự là thứ tự chủ dự án đọc ra, không phải thứ tự tôi thấy hợp lý ──
     "ghi bữa ăn, ghi buổi tập, ghi giấc ngủ, nhập sinh trắc, ghi cân nặng". */
  const WANT = ['meal', 'workout', 'sleep', 'biometrics', 'weight'];
  CASES++;
  if (TODO_ORDER.join(',') !== WANT.join(',')) {
    problems.push(
      `thứ tự dòng là ${TODO_ORDER.join(', ')} chứ không phải ${WANT.join(', ')} — thứ tự này do chủ ` +
        'dự án đọc ra khi đặt hàng thẻ, và nó cũng đi từ việc làm nhiều lần mỗi ngày xuống việc làm ' +
        'một lần. Đổi nó thì phải có một lý do mới, ghi vào đây',
    );
  }

  /* ── 2. chạy thật, cả 32 tổ hợp ── */
  for (let mask = 0; mask < 32; mask++) {
    const done = {};
    WANT.forEach((k, i) => (done[k] = !!(mask & (1 << i))));
    const open = todoOpen(done);
    const prog = todoProgress(done);
    CASES++;

    const expectOpen = WANT.filter((k) => !done[k]);
    if (open.join(',') !== expectOpen.join(',')) {
      problems.push(
        `tổ hợp ${JSON.stringify(done)}: còn lại ${open.join(', ') || '(rỗng)'} chứ không phải ` +
          `${expectOpen.join(', ') || '(rỗng)'}`,
      );
    }
    if (prog.done !== 5 - expectOpen.length || prog.total !== 5) {
      problems.push(`tổ hợp ${JSON.stringify(done)}: tiến độ ${prog.done}/${prog.total}, đáng lẽ ${5 - expectOpen.length}/5`);
    }
    /* Việc đã ghi KHÔNG được xuất hiện trong danh sách việc cần làm. Đây chính
       là lỗi mà hàng chip cũ mắc, viết thành một phép kiểm. */
    for (const k of WANT) {
      if (done[k] && open.includes(k)) {
        problems.push(`\`${k}\` đã ghi xong nhưng vẫn nằm trong danh sách cần làm`);
      }
    }
  }

  /* Thứ tự tương đối KHÔNG đổi khi bớt một việc: danh sách rút ngắn chứ không
     sắp lại, nếu không thì mỗi lần ghi xong một thứ là một lần cả thẻ nhảy chỗ. */
  for (const k of WANT) {
    CASES++;
    const none = todoOpen(Object.fromEntries(WANT.map((x) => [x, false])));
    const one = todoOpen(Object.fromEntries(WANT.map((x) => [x, x === k])));
    if (one.join(',') !== none.filter((x) => x !== k).join(',')) {
      problems.push(`ghi xong \`${k}\` làm các dòng còn lại đổi thứ tự: ${one.join(', ')}`);
    }
  }
} catch (e) {
  problems.push(`không chạy được lib/todo.ts: ${e.message.split('\n')[0]}`);
} finally {
  rmSync(out, { recursive: true, force: true });
}

/* ── 3. mỗi khoá có đủ bốn thứ để vẽ ra một dòng ──
   Thêm một khoá thứ sáu mà quên một bảng thì dòng ấy vẫn dựng: icon thành
   `undefined` và `graphicOf` nhận `undefined`. Không cái nào làm đỏ `tsc` nếu
   bảng được khai kiểu lỏng hơn một ngày nào đó. */
{
  const src = strip(read(CARD));
  const keysOf = (name) => {
    const m = new RegExp(`const ${name}[^=]*= \\{([\\s\\S]*?)\\n\\}`).exec(src);
    return m ? [...m[1].matchAll(/^\s*(\w+):/gm)].map((x) => x[1]) : null;
  };
  const order = ['meal', 'workout', 'sleep', 'biometrics', 'weight'];
  for (const [name, expect] of [
    ['ICON', order],
    ['TINT', order],
    /* `weight` cố ý KHÔNG có route: nó là việc duy nhất ghi tại chỗ. */
    ['ROUTE', order.filter((k) => k !== 'weight')],
  ]) {
    CASES++;
    const got = keysOf(name);
    if (!got) {
      problems.push(`${CARD}: không đọc được bảng \`${name}\``);
    } else if (got.join(',') !== expect.join(',')) {
      problems.push(`${CARD}: bảng \`${name}\` có [${got.join(', ')}], cần [${expect.join(', ')}]`);
    }
  }
  CASES++;
  const labels = /const label: Record<TodoKey, string> = \{([\s\S]*?)\n  \};/.exec(src);
  const labelKeys = labels ? [...labels[1].matchAll(/^\s*(\w+):/gm)].map((x) => x[1]) : null;
  if (!labelKeys || labelKeys.join(',') !== order.join(',')) {
    problems.push(`${CARD}: bảng nhãn thiếu khoá — có [${labelKeys?.join(', ') ?? '?'}]`);
  }

  /* ── 4. MỘT ý kiến về ngày hôm nay ──
     `useDailyQuests` đã đo bữa ăn / buổi tập / giấc ngủ cho phòng Koa. Đọc lại
     `useDailyLog` ở đây là dựng ý kiến thứ hai về cùng một ngày, cho cùng một
     người, trên cùng một màn — và hai ý kiến ấy sẽ lệch nhau đúng một lần. */
  CASES++;
  if (!/useDailyQuests\(\)/.test(src)) {
    problems.push(`${CARD}: không còn đọc \`useDailyQuests\` — ba trạng thái đầu phải đến từ đó, không tự đo lại`);
  }
  CASES++;
  if (/useDailyLog\(/.test(src)) {
    problems.push(
      `${CARD}: đọc thẳng \`useDailyLog\` — đó là ý kiến thứ hai về "hôm nay đã ghi gì", cạnh ` +
        '`useDailyQuests` vốn đã đo đúng ba thứ ấy',
    );
  }
  /* ── 5. chưa đọc xong ngày thì chưa nói ──
     Không có cờ này, một ngày đang tải tính ra là năm việc chưa làm: "0/5" hiện
     cho người đã ghi suốt buổi sáng. Hook `useDailyQuests` đặt hẳn một cờ vì app
     đã gặp lỗi ấy nhiều lần. */
  CASES++;
  if (!/if \(!quests\.ready\) return null;/.test(src)) {
    problems.push(`${CARD}: không chặn theo \`quests.ready\` — ngày chưa đọc xong sẽ hiện ra thành 0/5`);
  }
}

/* ── 6. lời mời thứ hai không mọc lại trên Today ── */
{
  const src = strip(read(TODAY));
  CASES++;
  if (!/<TodoCard \/>/.test(src)) {
    problems.push(`${TODAY}: không còn dựng <TodoCard /> — thẻ này LÀ chỗ trả lời "hôm nay còn ghi gì"`);
  }
  CASES++;
  if (/quickActions|styles\.quickChip|styles\.quickRow/.test(src)) {
    problems.push(
      `${TODAY}: hàng chip log cũ đã mọc lại. Nó mời ghi mà không hỏi thứ nào đã ghi, và nó là lời ` +
        'mời thứ hai cho đúng việc mà thẻ Cần làm đang mời',
    );
  }
}

/* ── 7. ô ghi cân nặng chỉ có MỘT bản ──
   Cân nặng là việc duy nhất không có màn riêng, nên nó được ghi tại chỗ ở hai
   nơi: thẻ Cân nặng và dòng cân nặng trong thẻ Cần làm. Chép ô nhập sang chỗ
   thứ hai là nhân đôi một logic GHI DỮ LIỆU — quy đổi kg/lb, ngưỡng hợp lý, và
   đường ghi offline có `mutationKey` bền, thứ đã từng nuốt mất một lần cân. */
{
  CASES++;
  const callers = [];
  for (const f of [CARD, ENTRY, 'src/components/ascnd/today-widgets.tsx']) {
    if (/useLogWeight\(\)/.test(strip(read(f)))) callers.push(f);
  }
  if (callers.join(',') !== ENTRY) {
    problems.push(
      `\`useLogWeight()\` được gọi ở [${callers.join(', ')}] — chỉ \`${ENTRY}\` được gọi nó. Hai chỗ ` +
        'ghi cân nặng là hai bản của cùng một đường ghi, và bản thứ hai sẽ trôi ở chỗ mất dữ liệu',
    );
  }
  CASES++;
  for (const f of [CARD, 'src/components/ascnd/today-widgets.tsx']) {
    if (!/<WeightEntry\b/.test(strip(read(f)))) {
      problems.push(`${f}: không dựng <WeightEntry /> — chỗ ghi cân nặng phải là bản dùng chung`);
    }
  }
}

if (problems.length) {
  console.log('thẻ cần làm CÓ LỖI:\n');
  for (const p of problems.slice(0, 12)) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  `thẻ cần làm OK — ${CASES} ca, và danh sách được CHẠY chứ không đọc: cả 32 tổ hợp xong/chưa của ` +
    'năm việc đều trả đúng phần còn lại, việc đã ghi không bao giờ còn nằm trong danh sách (đúng lỗi ' +
    'mà hàng chip cũ mắc: nó mời "Ghi bữa ăn" sau bữa thứ ba), và bớt một việc không làm các dòng ' +
    'còn lại đổi thứ tự. Thứ tự năm dòng là thứ tự chủ dự án đọc ra. Ba bảng vẽ (icon, màu, đích ' +
    'đến) và bảng nhãn phủ đúng năm khoá, nên một khoá thứ sáu không dựng ra được một dòng không có ' +
    'hình. Trạng thái ba việc đầu ĐỌC từ `useDailyQuests` chứ không tự đo lại, và thẻ im lặng tới ' +
    'khi ngày được đọc xong. Trên Today, hàng chip cũ không mọc lại. Và `useLogWeight()` chỉ có một ' +
    'chỗ gọi duy nhất: cân nặng ghi được ở hai nơi nhưng chỉ bằng MỘT đường ghi',
);
