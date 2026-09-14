/**
 * That the week's panel writes down what happened, not what was asked for.
 *
 * ── the bug this is built around ──
 *
 * For as long as this panel existed it ticked boxes and then submitted the
 * TEMPLATE's numbers as the session. Load six sets at 55 kg, do the last two at
 * 60 because it felt light, and the record said 55 six times. Nothing looked
 * wrong: the sets were there, the count was right, the volume was a number.
 * But volume load, the trend chart, the "last time" line on the card and every
 * personal record inherited it, so the app was quietly authoring a training
 * history nobody had lifted — and the screen looked MORE trustworthy for it,
 * because the numbers were tidy.
 *
 * `log-workout.tsx` had already written the principle down, about its own
 * boxes: "the third set of a five-set squat is the one that came in two reps
 * light, and a form that cannot say so is a form people stop trusting."
 *
 * And `day-progress.ts` had already built for it, explaining why ticking back
 * deliberately does not match on weight or reps: a set logged at 100×8 against
 * a row planned for 100×10 "is the same set, done two reps short, which is the
 * ordinary case and the entire reason for logging what actually happened".
 *
 * Two files were ready for the deviation. The one that collected it was not.
 *
 * ── so every rule here is about the PATH a number takes ──
 *
 * Not about a control existing. A box you can type in that is then ignored on
 * submit is the same bug wearing a keyboard.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import Module from 'node:module';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** every .ts/.tsx under a directory */
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}
const F = 'src/components/ascnd/day-plan.tsx';
const src = readFileSync(path.join(NATIVE, F), 'utf8');
const problems = [];

/* Bounded by the closing of the construct rather than by brace counting, which
   trips over the nested objects and the arrow bodies inside them. */
const slice = (from, to) => {
  const a = src.indexOf(from);
  if (a < 0) return '';
  const b = src.indexOf(to, a + from.length);
  return b < 0 ? '' : src.slice(a, b);
};

/* ── 1. the submitted sets come from the boxes, never off the plan row ── */
{
  const sets = slice('const sets = doneRows.map(', 'const sessionRpe');
  if (!sets) {
    problems.push(`${F}: không tìm thấy chỗ dựng sets để nộp`);
  } else {
    if (!/\.\.\.performed\(r\)/.test(sets)) {
      problems.push(
        `${F}: sets nộp đi không đi qua performed() — nó đang lấy số ở đâu đó khác, ` +
          'và chỗ khác duy nhất có sẵn là kế hoạch',
      );
    }
    /* The exact regression: reading the planned row straight into the record. */
    for (const m of sets.matchAll(/\b(?:weight|reps):\s*r\.(weight|reps)\b/g)) {
      problems.push(
        `${F}: nộp r.${m[1]} — đó là con số KẾ HOẠCH ghi thẳng vào hồ sơ như thể đã tập. ` +
          'Đây đúng là lỗi mà file này tồn tại để chặn',
      );
    }
  }
}

/* ── 2. the number changes unit on the way in and on the way out ──

   The boxes hold whatever unit is on screen. A pound user typing 135 and a
   record holding 135 KILOGRAMS is a silent, unrecoverable corruption of the
   only history the app has — and it looks perfectly normal on the screen that
   caused it, because that screen converts back. */
{
  const perf = slice('const performed = useCallback(', '  );');
  if (!perf) problems.push(`${F}: không tìm thấy performed()`);
  else {
    if (!/weightToKg\(/.test(perf)) {
      problems.push(
        `${F}: performed() không gọi weightToKg — ô nhập theo đơn vị đang hiện, ` +
          'kho lưu theo kg. Người dùng lb gõ 135 sẽ thành 135 KG',
      );
    }
    if (!/parseRepEntry\(/.test(perf)) {
      problems.push(
        `${F}: performed() không dùng parseRepEntry — màn ghi buổi tập dùng nó, ` +
          'và hai màn đọc "45s" khác nhau là hai màn ghi hai buổi tập khác nhau',
      );
    }
  }
  const prefill = slice('const plannedLoad = useCallback(', '  );');
  if (prefill && !/displayWeight\(/.test(prefill)) {
    problems.push(`${F}: giá trị điền sẵn không qua displayWeight — ô sẽ mở ra bằng kg cho người dùng lb`);
  }
}

/* ── 3. one definition, so the three readers cannot disagree ──

   The online submit, the offline queue and the volume under the bar all say
   what the session was. They must say the same thing. */
{
  const uses = [...src.matchAll(/performed\(\w+\)/g)].length;
  if (uses < 2) {
    problems.push(
      `${F}: performed() chỉ được dùng ${uses} lần — tổng khối lượng dưới thanh và phần nộp ` +
        'phải cùng đọc một chỗ, nếu không màn hình sẽ nói một đằng và hồ sơ ghi một nẻo',
    );
  }
  const vol = slice('const volume = doneRows.reduce(', '\n\n');
  if (vol && /r\.weight\s*\*\s*r\.reps/.test(vol)) {
    problems.push(`${F}: tổng khối lượng vẫn nhân số KẾ HOẠCH — nó sẽ lệch với chính buổi tập vừa nộp`);
  }
}

/* ── 4. the boxes exist and are wired both ways ──

   A field showing the plan and never writing anywhere is a readout; a state
   that nothing renders is dead weight. Checked as a pair. */
{
  for (const [state, setter] of [
    ['weightText', 'setWeightText'],
    ['repsText', 'setRepsText'],
  ]) {
    const shown = new RegExp(`value=\\{${state === 'weightText' ? 'loadOf' : 'repsOf'}\\(row\\)\\}`).test(src);
    const written = new RegExp(`onChangeText=\\{\\(v\\) => ${setter}\\(`).test(src);
    if (!shown) problems.push(`${F}: không có ô nào hiển thị ${state} — người dùng không sửa được`);
    if (!written) problems.push(`${F}: không có ô nào ghi vào ${state} — gõ vào rồi mất`);
  }
}

/* ── 5. what you typed survives the workout being interrupted ──

   The resume point is the only copy of these numbers until the session is
   submitted, and a workout is the single most interruptible thing this app
   does. Read and write are checked separately: a blob that saves them and
   never reads them back is the same loss, one restart later. */
{
  const write = slice('AsyncStorage.setItem(', ').catch(');
  const read = slice('const saved = JSON.parse(raw)', 'setLoaded(true)');
  for (const [k, setter] of [
    ['weightText', 'setWeightText'],
    ['repsText', 'setRepsText'],
    ['extra', 'setExtra'],
  ]) {
    if (!new RegExp(`\\b${k}\\b`).test(write)) {
      problems.push(`${F}: điểm resume không LƯU ${k} — thoát app giữa buổi là mất những gì đã gõ`);
    }
    /*
      The SETTER being called, not the word appearing.

      The first version of this rule looked for the name anywhere in the
      read-back and went green on a version with the restore deleted — because
      the name was still there, in the type annotation describing the blob.
      That is the same mistake in miniature as the bug this file is about: a
      declaration that a number exists is not the number arriving.
    */
    if (!new RegExp(`${setter}\\(`).test(read)) {
      problems.push(`${F}: điểm resume không ĐỌC LẠI ${k} — lưu rồi mà không gọi ${setter} thì cũng như không lưu`);
    }
  }
}

/* ── 6. an added movement is a row like any other ──

   The tempting shape is a second list carried beside `rows` and merged at
   submit time. That is the same feature written twice, and the second copy is
   the one that forgets to be ticked, counted, or saved. */
{
  if (!/const rows = useMemo\(\(\) => \[\.\.\.planned, \.\.\.adHocRows\(extra\)\]/.test(src)) {
    problems.push(
      `${F}: bài thêm trong ngày không nhập vào chung danh sách rows — mọi thứ đọc rows ` +
        '(tick, resume, thanh tiến độ, hai đường nộp) sẽ bỏ sót nó',
    );
  }
}

/* ── 7. the card's key cannot contain a name you can edit ──

   Subtle and certain: an added movement's name changes on every keystroke, and
   a key containing it makes React discard the card and mount a new one per
   letter. The field loses focus after one character and the keyboard shuts —
   the control is unusable, and it type-checks perfectly. */
{
  const key = src.match(/<Animated\.View key=\{([^}]*)\}/);
  if (!key) problems.push(`${F}: không tìm thấy key của thẻ bài tập`);
  else if (/block\.name/.test(key[1])) {
    problems.push(
      `${F}: key của thẻ chứa block.name, mà tên bài THÊM TRONG NGÀY sửa được — ` +
        'gõ một chữ là thẻ bị dựng lại, ô mất focus và bàn phím đóng',
    );
  }
}

/* ── 8. fields below the fold mean the page has to move for the keyboard ──

   `screen.tsx` states the condition and the remedy in advance: every field on
   these pages sits near the top, "if a form ever grows long enough for that to
   stop being true, wrap that form's fields in a KeyboardAvoidingView; do not
   put `automaticallyAdjustKeyboardInsets` back on the scaffold". Two dozen
   boxes down a scrolling list is that form. Without the wrap the box you tap
   near the bottom is simply underneath the keyboard, with no way to reach it —
   and nothing about that shows up in a screenshot, a type check or a unit
   test, because none of them have a keyboard. */
/* Luật này từng ghi thẳng `src/app/routine.tsx`. Panel đã dọn nhà hai lần kể
   từ đó — thành một mục trong tab Tập luyện, rồi thành trang riêng
   `(tabs)/workouts/plan.tsx` — nên chỗ phải bật `keyboardAware` được TÌM từ
   nơi thật sự gắn panel, chứ không phải chép lại một cái tên file. Ghim đúng
   bất biến: scaffold nào chứa panel thì scaffold đó phải tránh bàn phím. */
{
  if (/<TextInput/.test(src)) {
    const hosts = walk(path.join(NATIVE, 'src')).filter((f) =>
      /<WeekPlan\b/.test(readFileSync(f, 'utf8')),
    );
    if (hosts.length === 0) {
      problems.push(
        'không file nào gắn <WeekPlan /> — panel kế hoạch tuần đã biến mất khỏi ứng dụng, ' +
          'hoặc luật này đang ghim một cái tên không còn tồn tại',
      );
    }
    for (const host of hosts) {
      const rel = path.relative(NATIVE, host);
      const code = readFileSync(host, 'utf8');
      const tag = code.match(/<Screen\b[^>]*>/);
      if (!tag) problems.push(`${rel}: gắn <WeekPlan /> mà không tìm thấy <Screen>`);
      else if (!/\bkeyboardAware\b/.test(tag[0])) {
        problems.push(
          `${rel}: panel có ô nhập chạy dài quá màn mà <Screen> không bật keyboardAware — ` +
            'ô ở cuối danh sách sẽ nằm dưới bàn phím và không cách nào với tới',
        );
      }
    }
  }
  /* And the wrap has to be worn by every branch, not just the one that was
     tested. A scaffold with three scroll views and two wraps is a page that
     works until somebody opens it in the other layout. */
  const screen = readFileSync(path.join(NATIVE, 'src/components/ascnd/screen.tsx'), 'utf8');
  const scrolls = [...screen.matchAll(/<ScrollView\n/g)].length;
  const frames = [...screen.matchAll(/<ScrollFrame on=\{keyboardAware\}>/g)].length;
  if (scrolls !== frames) {
    problems.push(
      `src/components/ascnd/screen.tsx: ${scrolls} ScrollView nhưng chỉ ${frames} cái được bọc ` +
        'ScrollFrame — nhánh không bọc sẽ im lặng không tránh bàn phím',
    );
  }
}

/*
  ── chặn ghi lần hai thì phải NÓI chỗ đi tiếp ──

  Tấm này chỉ nhận một lần lưu cho mỗi ngày, và luật ấy đúng: lỗi thường gặp là
  ghi hai lần cùng một buổi khi quay lại một ngày đã có. Chú thích của luật tự
  bào chữa bằng một câu — "the rare case has somewhere to go", ý là sổ ghi tự do
  vẫn nhận buổi thứ hai.

  Câu ấy đúng về mã và từng SAI về màn hình. Sau khi ghi xong, tấm chỉ đổi nút
  thành "Đã ghi buổi tập" rồi tắt, và cả màn Plan không có một liên kết nào tới
  `/log-workout`. Chủ dự án báo đúng hậu quả: tập hết template, hệ thống ghi
  xong, phát sinh thêm một bài, và từ chỗ đang đứng thì app trông như đã đóng
  cửa.

  Nên luật này gác cái CẶP: còn chặn thì còn phải có đường ra, và một bản sửa
  sau gỡ liên kết đi mà giữ nguyên chỗ chặn sẽ đỏ ở đây.
*/
{
  const panel = readFileSync(path.join(NATIVE, 'src/components/ascnd/day-plan.tsx'), 'utf8');
  const blocks = /const logged =/.test(panel) && /!logged/.test(panel);
  const wayOut = /nav\.push\('\/log-workout'\)/.test(panel);
  if (blocks && !wayOut) {
    problems.push(
      'tấm ngày CHẶN lần ghi thứ hai mà không có đường nào tới `/log-workout` — chú thích của chính ' +
        'luật ấy hứa "the rare case has somewhere to go", nên hoặc phải có chỗ đi, hoặc phải bỏ câu hứa',
    );
  }
  /* `\b` sau tên: tấm này đã có sẵn `nRdExtraName` (đặt tên cho bài thêm vào
     trong buổi), và một regex không chặn đuôi sẽ coi nhãn ấy là nhãn của liên
     kết — tức xanh trong khi liên kết không có tên nào cả. */
  if (wayOut && !/i18n\.nRdExtra\b/.test(panel)) {
    problems.push(
      'có đường tới `/log-workout` nhưng không có nhãn `nRdExtra` — một liên kết không tên thì người ' +
        'đang đứng trước nút đã tắt không biết nó dẫn đi đâu',
    );
  }
}

/*
  ── và nhánh NỐI THÊM phải gửi đúng `pendingRows` ──

  Phép chạy thật ngay dưới chứng minh `sessionTicks` tính đúng phần chênh; nó
  KHÔNG chứng minh được tấm gửi đúng phần ấy. Lỗi người ta thật sự mắc là gõ
  `doneRows` — cái tên nằm ngay trên, dùng cho nhánh ghi mới — và khi ấy mọi
  set đã ghi bị gửi lại lần nữa vào chính hàng cũ.
*/
{
  const panel = readFileSync(path.join(NATIVE, 'src/components/ascnd/day-plan.tsx'), 'utf8');
  const i = panel.indexOf('if (appending) {');
  if (i >= 0) {
    /* Cắt tới `append.mutate(`, KHÔNG tới `return;` đầu tiên: chốt offline ngay
       đầu nhánh cũng là một `return;`, nên lát cũ dừng trước cả dòng map và
       báo thiếu thứ đang có. Và cắt ở đây cũng loại được `doneRows.map(` của
       nhánh ghi mới, vốn nằm ngay sau nhánh này. */
    const block = panel.slice(i, panel.indexOf('append.mutate(', i));
    if (!/pendingRows\.map\(/.test(block)) {
      problems.push(
        'nhánh nối thêm không map qua `pendingRows` — nếu nó map qua `doneRows` thì mọi set buổi cũ ' +
          'đã chứng minh bị gửi lại lần nữa, tức nhân đôi ngay bên trong một hàng',
      );
    }
    if (/doneRows\.map\(/.test(block)) {
      problems.push('nhánh nối thêm đang map qua `doneRows` — xem ngay trên vì sao đó là nhân đôi');
    }
  }
}

/*
  ── nối thêm KHÔNG được gửi lại những hàng buổi cũ đã chứng minh ──

  Sau khi ngày đã có buổi ghi, tấm cho tích tiếp một bài phát sinh rồi NỐI nó
  vào chính buổi ấy. Phần dễ sai nhất là gửi nhầm cả nắm: `doneRows` lúc đó
  chứa CẢ những hàng mà buổi cũ đã chứng minh, vì `shown` trộn ô người dùng
  tích với bằng chứng từ buổi tập. Gửi cả nắm là nhân đôi mọi set đã ghi —
  đúng cái lỗi mà luật chặn ghi trùng sinh ra để tránh, chỉ là ở trong MỘT
  hàng thay vì hai, nên không ai nhìn ra bằng số buổi.

  Nên chạy thật `sessionTicks` và kiểm phần chênh.
*/
{
  const out = mkdtempSync(path.join(tmpdir(), 'ascnd-plan-'));
  try {
    const LIB = path.join(NATIVE, 'src', 'lib');
    const cfg = path.join(out, 'tsconfig.json');
    writeFileSync(
      cfg,
      JSON.stringify({
        compilerOptions: {
          module: 'commonjs', target: 'es2020', skipLibCheck: true, esModuleInterop: true,
          outDir: out, rootDir: LIB,
        },
        files: [path.join(LIB, 'day-progress.ts'), path.join(LIB, 'exercise-key.ts')],
      }),
    );
    try {
      execFileSync('npx', ['tsc', '-p', cfg], { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch {
      /* bí danh `@/` không phân giải lúc biên dịch — cố ý, xem `sleep-length.mjs` */
    }
    const orig = Module._resolveFilename;
    Module._resolveFilename = function (r, ...a) {
      if (r.startsWith('@/lib/')) return path.join(out, `${r.slice('@/lib/'.length)}.js`);
      return orig.call(this, r, ...a);
    };
    const { sessionTicks } = createRequire(import.meta.url)(path.join(out, 'day-progress.js'));
    const rows = [
      { key: 'bench#1', exerciseName: 'Bench Press' },
      { key: 'bench#2', exerciseName: 'Bench Press' },
      { key: 'pull#1', exerciseName: 'Pull-up' },
      { key: 'fly#1', exerciseName: 'Cable Fly' },
    ];
    const proven = sessionTicks(rows, [
      { exerciseName: 'Bench Press' }, { exerciseName: 'Bench Press' }, { exerciseName: 'Pull-up' },
    ]);
    const pending = rows.map((r) => r.key).filter((k) => !proven[k]);
    if (pending.join(',') !== 'fly#1') {
      problems.push(
        `phần NỐI THÊM sẽ gửi [${pending.join(', ')}] trong khi chỉ bài phát sinh mới được nối — ` +
          'gửi lại một hàng buổi cũ đã chứng minh là nhân đôi set ấy ngay bên trong một hàng',
      );
    }
    /* Và không có bài phát sinh nào thì KHÔNG có gì để nối — nút phải tắt. */
    const none = sessionTicks(rows.slice(0, 3), [
      { exerciseName: 'Bench Press' }, { exerciseName: 'Bench Press' }, { exerciseName: 'Pull-up' },
    ]);
    if (rows.slice(0, 3).some((r) => !none[r.key])) {
      problems.push('một ngày đã ghi đủ vẫn còn hàng "chưa chứng minh" — nút nối sẽ sống dậy không lý do');
    }
  } catch (e) {
    problems.push(`không chạy được \`sessionTicks\`: ${String(e.message ?? e).slice(0, 200)}`);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

if (problems.length) {
  console.log('số thật của buổi tập CÓ LỖI:\n');
  for (const p of problems.slice(0, 10)) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'buổi phát sinh có chỗ đi: tấm ngày chặn lần ghi thứ hai VÀ chỉ đường sang sổ ghi tự do — ' +
    'trước đây nó chỉ chặn, và cả màn Plan không có liên kết nào tới `/log-workout`.',
);
console.log(
  'số thật của buổi tập OK — panel lịch tập tuần ghi lại NHỮNG GÌ ĐÃ TẬP chứ không ghi lại kế hoạch: ' +
    'mỗi set có ô tạ và ô rep điền sẵn theo kế hoạch, phần nộp đi qua MỘT hàm performed() duy nhất ' +
    '(nên tổng khối lượng trên màn, đường nộp online và hàng đợi offline không thể nói khác nhau), ' +
    'số đổi đơn vị cả hai chiều (lb gõ vào không thành kg lưu xuống), "45s" đọc bằng cùng parseRepEntry ' +
    'với màn ghi buổi tập, những gì đã gõ và bài thêm trong ngày đều nằm trong điểm resume, bài thêm ' +
    'chảy vào chung danh sách rows thay vì một danh sách thứ hai, và key của thẻ không chứa cái tên ' +
    'mà người dùng đang gõ',
);
