/**
 * That the character hung over a card is hung from the end its head is on.
 *
 * ── the bug this was written for ──
 *
 * `CardPeek` clips a band the height of the peek, ends it flush with the card's
 * top edge, and slides the figure out of it. Every part of that was fine. The
 * figure was hung with `justifyContent: 'flex-end'` — the end without the head
 * on it — inside a band shorter than the figure, and that one word produced two
 * bugs at once:
 *
 *   - **at rest**, a box taller than its container overflows it, so 40 points of
 *     Koa's head stood permanently over every widget on the dashboard;
 *   - **at full rise**, the window had slid down the body, so the celebration
 *     was the character's stomach coming into view.
 *
 * Nothing in the suite could see it. Each number was defensible alone; only
 * their sum was absurd, and a sum is not what a type checker adds up.
 * `tools/koa-studio/peek.mjs` renders the frames so a person can look — this is
 * the part that does not need a person.
 *
 * ── the rule ──
 *
 * Three things, all about the same band:
 *
 *   1. the clip hangs its child from the **top** (`flex-start`, or nothing at
 *      all — React Native's default);
 *   2. the figure is **taller than the band**, or the band is not a window onto
 *      a head, it is a frame with air under the feet;
 *   3. the geometry is **imported**, not retyped. A literal `46` or a `deg`
 *      built from a bare number in the component is a number that can drift
 *      away from the one the renderer draws, and then the picture stops being
 *      evidence about the app.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');

const COMPONENT = 'src/components/ascnd/card-peek.tsx';
const GEOMETRY = 'src/lib/peek-frame.ts';

/** the numbers, straight out of the module both the app and the renderer use */
function geometry() {
  const src = read(GEOMETRY);
  const num = (name) => {
    const m = src.match(new RegExp(`export const ${name} = (-?[\\d.]+)`));
    return m ? Number(m[1]) : null;
  };
  return { PEEK: num('PEEK'), PEEK_FIGURE: num('PEEK_FIGURE'), LEAN_DEG: num('LEAN_DEG') };
}

/** the artboard's proportions, from the file that owns them */
const KOA_ASPECT = (() => {
  const src = read('src/components/ascnd/koa/koa-frame.ts');
  const w = src.match(/export const KOA_W = (\d+)/);
  const h = src.match(/export const KOA_H = (\d+)/);
  return w && h ? Number(h[1]) / Number(w[1]) : null;
})();

/**
 * @param src the component's source
 * @param geo the geometry module's numbers
 */
export function problems(src, geo) {
  const out = [];

  // ── 1: the band hangs from the top ──
  const clip = src.match(/clip:\s*\{[\s\S]*?\}/);
  if (!clip) {
    out.push('không tìm thấy style `clip` — băng cắt là chỗ duy nhất giấu được nhân vật');
  } else if (/justifyContent:\s*'flex-end'/.test(clip[0])) {
    out.push(
      "băng cắt treo hình từ `justifyContent: 'flex-end'` — đầu Koa sẽ thò ra vĩnh viễn " +
        'khi nghỉ, và lúc nhô lên thì cửa sổ trượt xuống bụng',
    );
  } else if (/justifyContent:\s*'(center|space-\w+)'/.test(clip[0])) {
    out.push('băng cắt căn giữa hình theo chiều dọc — cửa sổ không còn nhìn vào đầu nữa');
  }
  if (clip && !/overflow:\s*'hidden'/.test(clip[0])) {
    out.push("băng cắt thiếu `overflow: 'hidden'` — thẻ kính trong suốt không giấu được gì");
  }

  // ── 2: the figure is taller than the band ──
  if (geo.PEEK != null && geo.PEEK_FIGURE != null && KOA_ASPECT != null) {
    const h = geo.PEEK_FIGURE * KOA_ASPECT;
    if (h <= geo.PEEK) {
      out.push(
        `hình cao ${Math.round(h)}pt mà băng cắt cao ${geo.PEEK}pt — hình thấp hơn băng thì ` +
          'lúc nhô lên sẽ thấy cả bàn chân lơ lửng trên thẻ',
      );
    }
  }

  // ── 3: nothing is drawn while nothing is happening ──
  if (!/if \(!enabled \|\| !playing\)/.test(src)) {
    out.push(
      'không thấy chốt chặn `!enabled || !playing` — băng cắt sẽ gắn một KoaFigure đầy đủ ' +
        'vĩnh viễn cho MỌI widget tham gia peek (7 cái trên trang Hôm nay), vẽ và chạy đồng hồ ' +
        'khung hình trong khi không có gì nhìn thấy được',
    );
  }
  if (!/PEEK_TAIL_MS/.test(src)) {
    out.push('không thấy PEEK_TAIL_MS — không có gì gỡ nhân vật xuống sau khi diễn xong');
  }

  // ── 4: nobody performs to an empty room ──
  if (!/usePeekSignal\(quest, focused\)/.test(src)) {
    out.push(
      'PeekHost không truyền trạng thái focus vào usePeekSignal — màn diễn sẽ chạy trong lúc ' +
        'người dùng đang ở tab khác, mà log bữa ăn TỪ tab Dinh dưỡng mới là đường đi chính',
    );
  }
  if (!/useIsFocused/.test(src)) {
    out.push('không thấy useIsFocused — không có gì biết được màn này có đang ở trước mặt ai không');
  }

  // ── 5: the focus gate does not leave the figure mounted, or replay itself ──
  if (!/if \(!signal\) \{\s*setPlaying\(false\);/.test(src)) {
    out.push(
      'mất focus thì signal về 0, effect chạy lại và cleanup huỷ mất timer hạ nhân vật xuống — ' +
        'thiếu setPlaying(false) ở nhánh đó thì `playing` kẹt true vĩnh viễn và nhân vật ở lại',
    );
  }
  if (!/played\.current === signal/.test(src)) {
    out.push(
      'quay lại tab làm signal từ 0 lên lại đúng số cũ — đó là một thay đổi, nên cùng một màn ' +
        'ăn mừng sẽ diễn lần thứ hai nếu không nhớ lần đã diễn',
    );
  }

  // ── 6: the decoration is not read out, and the moment is felt ──
  if (!/accessibilityElementsHidden/.test(src) || !/no-hide-descendants/.test(src)) {
    out.push(
      'băng cắt không được ẩn khỏi trình đọc màn hình — viên xu là một <Text>, nên VoiceOver ' +
        'có thể dừng lại ở một "+15" trôi nổi không ngữ cảnh, tự hiện rồi tự biến mất',
    );
  }
  if (!/Haptics\.impactAsync/.test(src)) {
    out.push('màn diễn không có phản hồi rung — một lời chúc mừng không chạm vào tay là nửa lời');
  }
  if (/Haptics\.notificationAsync/.test(src)) {
    out.push(
      'peek dùng rung mức "notification" — đó là mức của huy hiệu; một nhiệm vụ hằng ngày và ' +
        'một huy hiệu mà rung như nhau thì thứ bậc cảm giác biến mất',
    );
  }

  // ── 7: the numbers are imported, not retyped ──
  const body = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  for (const [name, value] of Object.entries(geo)) {
    if (value == null) continue;
    // the import line itself is not a copy of the number
    const uses = body.split('\n').filter((l) => !/^import\b/.test(l.trim()));
    if (uses.some((l) => new RegExp(`(^|[^\\w.])${value}([^\\d.]|$)`).test(l))) {
      out.push(`\`${value}\` viết thẳng trong component — đó là ${name}, phải import từ peek-frame`);
    }
  }
  if (!/from '@\/lib\/peek-frame'/.test(src)) {
    out.push('component không import peek-frame — hình học phải có đúng một nguồn');
  }

  return out;
}

/* Only run the checks when invoked directly, so the self-test below can import
   `problems` without the file also auditing the app on the way in. */
if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  if (!existsSync(path.join(NATIVE, COMPONENT))) {
    console.log(`không thấy ${COMPONENT}`);
    process.exit(1);
  }

  const geo = geometry();
  for (const [k, v] of Object.entries(geo)) {
    if (v == null) {
      console.log(`peek-frame thiếu ${k}`);
      process.exit(1);
    }
  }

  const found = problems(read(COMPONENT), geo);

  /* ── self-test, on fixtures rather than on the live file ──
     A first draft rebuilt the bug by editing `card-peek.tsx` itself, which is
     how a tool ends up reporting "không dựng lại được bản hỏng" instead of the
     collision it was written for. The shipped mistake is one word; it is
     written out here in full. */
  const FIXED = read(COMPONENT);
  const SHIPPED = FIXED.replace("justifyContent: 'flex-start'", "justifyContent: 'flex-end'");
  const RETYPED = FIXED.replace('{ rotate: `${f.rotate}deg` }', '{ rotate: `${lean.value * 7}deg` }');
  const ALWAYS_ON = FIXED.replace('if (!enabled || !playing)', 'if (!enabled)');
  const BLIND = FIXED.replace('usePeekSignal(quest, focused)', 'usePeekSignal(quest, true)');
  const STUCK = FIXED.replace('if (!signal) {\n      setPlaying(false);\n      return;\n    }', 'if (!signal) return;');
  const REPLAY = FIXED.replace('if (played.current === signal) return;', '');
  const LOUD = FIXED.replace('accessibilityElementsHidden', 'accessible');
  const NUMB = FIXED.replace('Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)', 'Promise.resolve()');

  const selftest = [];
  if (SHIPPED === FIXED) selftest.push('không dựng lại được bản đã ship (flex-end)');
  else if (!problems(SHIPPED, geo).length) selftest.push('bản flex-end đã ship vẫn lọt');
  if (RETYPED === FIXED) selftest.push('không dựng lại được bản gõ tay số độ nghiêng');
  else if (!problems(RETYPED, geo).length) selftest.push('số 7 gõ thẳng vào component vẫn lọt');
  if (ALWAYS_ON === FIXED) selftest.push('không dựng lại được bản gắn nhân vật vĩnh viễn');
  else if (!problems(ALWAYS_ON, geo).length) selftest.push('bản gắn nhân vật vĩnh viễn vẫn lọt');
  if (BLIND === FIXED) selftest.push('không dựng lại được bản diễn khi không ai xem');
  else if (!problems(BLIND, geo).length) selftest.push('bản diễn khi không ai xem vẫn lọt');
  if (STUCK === FIXED) selftest.push('không dựng lại được bản kẹt nhân vật khi mất focus');
  else if (!problems(STUCK, geo).length) selftest.push('bản kẹt nhân vật khi mất focus vẫn lọt');
  if (REPLAY === FIXED) selftest.push('không dựng lại được bản diễn lại lần hai');
  else if (!problems(REPLAY, geo).length) selftest.push('bản diễn lại lần hai vẫn lọt');
  if (LOUD === FIXED) selftest.push('không dựng lại được bản để trình đọc màn hình chạm vào');
  else if (!problems(LOUD, geo).length) selftest.push('bản để trình đọc màn hình chạm vào vẫn lọt');
  if (NUMB === FIXED) selftest.push('không dựng lại được bản không rung');
  else if (!problems(NUMB, geo).length) selftest.push('bản không rung vẫn lọt');
  if (!problems(FIXED, { ...geo, PEEK: Math.ceil(geo.PEEK_FIGURE * KOA_ASPECT) + 1 }).length) {
    selftest.push('băng cao hơn hình vẫn lọt');
  }

  if (found.length || selftest.length) {
    console.log('peek sau thẻ:\n');
    for (const p of found) console.log(`  • ${p}`);
    for (const p of selftest) console.log(`  • tự kiểm: ${p}`);
    process.exit(1);
  }

  console.log(
    `peek OK — băng ${geo.PEEK}pt, hình ${geo.PEEK_FIGURE}×` +
      `${Math.round(geo.PEEK_FIGURE * KOA_ASPECT)}pt (thấy ` +
      `${Math.round((geo.PEEK / (geo.PEEK_FIGURE * KOA_ASPECT)) * 100)}% chiều cao hình, tính từ đỉnh đầu); ` +
      'nhân vật chỉ được gắn khi đang diễn, chỉ diễn khi màn hình đang ở trước mặt, ' +
      'ẩn khỏi trình đọc màn hình và rung ở mức nhẹ hơn huy hiệu; ' +
      'bản flex-end đã ship, bản gõ tay số độ nghiêng, bản băng cao hơn hình, bản gắn vĩnh viễn ' +
      'và bản diễn khi không ai xem đều bị bắt',
  );
}
