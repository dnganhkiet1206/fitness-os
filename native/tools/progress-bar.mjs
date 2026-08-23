/**
 * One progress bar, and the three ways it has already gone wrong.
 *
 * ── what this is guarding ──
 *
 * `progress-bar.tsx` is the app's bar. Six other tracks were drawn by hand
 * beside it, all six the same four lines with a percentage width, none of them
 * animating and none of them knowing the file existed:
 *
 *     <View style={styles.barTrack}>
 *       <View style={[styles.barFill, { width: `${pct}%` }]} />
 *     </View>
 *
 * Then a seventh was written — by me, in the commit that gathered the other six
 * — using `scaleX`, which `progress-bar.tsx` had already tried and rejected by
 * rendering both at 6×. Eight implementations of a rectangle. Nothing in the
 * repository pointed at the file that had done the work, so every rule below
 * exists to make the next person land on it instead of beside it.
 *
 * Three failure shapes, and all three have actually happened here:
 *
 *   1. A new hand-built copy. It looks completely normal in review, because it
 *      is what the code used to say in six places.
 *   2. The reflex rewrite to `scaleX`. The fill has rounded ends; scaling
 *      squashes the cap horizontally until it reads as cut off. The file
 *      records that it rendered both against the original at 6× rather than
 *      reasoning about it — a conclusion that cost a measurement and that a
 *      plausible-sounding argument will otherwise undo.
 *   3. The measurement bug. `useAnimatedStyle` freezes the style computed on
 *      its first render, so mounting the worklet before the track is measured
 *      froze `translateX: 0` — a FULL bar — and only 0% ever showed it, because
 *      at every other value the mapper corrects the position on its first
 *      frame. It shipped as "every macro bar full on a day with nothing
 *      logged". The fix was structural: the fill is its own component and is
 *      not mounted until the width is known. A tidy-up that inlines it back
 *      brings the bug with it, silently, on empty days only.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPONENT = 'src/components/ascnd/progress-bar.tsx';
const src = readFileSync(path.join(NATIVE, COMPONENT), 'utf8');
const problems = [];

/* ── 1. nobody hand-builds another one ── */
{
  const walk = (dir) =>
    readdirSync(dir).flatMap((e) => {
      const p = path.join(dir, e);
      return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(e) ? [p] : [];
    });
  for (const file of walk(path.join(NATIVE, 'src'))) {
    const rel = path.relative(NATIVE, file);
    if (rel === COMPONENT) continue;
    const body = readFileSync(file, 'utf8');
    /* `\s*` after the colon, not a literal space. The first draft asked for
       `width: \`` and a sabotage copy written as `width:\`` walked straight
       through it — a rule that depends on a formatter having run is a rule that
       is off whenever it matters most. */
    for (const m of body.matchAll(/width:\s*`\$\{/g)) {
      const line = body.slice(0, m.index).split('\n').length;
      problems.push(
        `${rel}:${line} dựng thanh tiến độ bằng width phần trăm — thêm một bản chép nữa. Nó sẽ NHẢY CÓC ` +
          'khi số đổi (đúng như sáu bản trước), và animate width là bắt layout chạy lại mỗi khung hình. ' +
          'Dùng <ProgressBar pct={…} />',
      );
    }
  }
}

/* ── 2. it slides; it does not scale ──

   Not a style preference. The component measured it. */
{
  const anim = src.match(/useAnimatedStyle\(\(\) => \(\{([\s\S]*?)\}\)\)/);
  if (!anim) {
    problems.push('progress-bar.tsx không còn useAnimatedStyle — thanh không còn chạy nữa');
  } else {
    if (!/translateX/.test(anim[1])) {
      problems.push('progress-bar.tsx không còn di chuyển bằng translateX');
    }
    if (/scale[XY]?\s*:/.test(anim[1])) {
      problems.push(
        'progress-bar.tsx quay lại dùng scale — file này ĐÃ thử và đã bác bỏ bằng cách render cả hai ở ' +
          '6×: co ngang làm bẹp đầu bo tròn (ở 15% thì bán kính 2pt còn 0,3pt và đầu thanh đọc ra như bị ' +
          'cắt cụt). Trượt thì đầu phải giữ đúng bán kính, còn đầu trái do chính track bo. Đây là kết ' +
          'luận phải trả giá bằng một phép đo, và một lập luận nghe hợp lý sẽ lật lại nó',
      );
    }
    for (const prop of ['width', 'height', 'left', 'right', 'flex', 'margin']) {
      if (new RegExp(`\\b${prop}\\s*:`).test(anim[1])) {
        problems.push(
          `progress-bar.tsx animate \`${prop}\` — đó là giá trị layout, mỗi khung hình phải chạy lại bố ` +
            'cục. Đúng luật tools/motion.mjs đã cấm, và đúng thứ bản cũ của chính file này đã làm',
        );
      }
    }
  }
}

/* ── 3. the worklet must not be mounted before the measurement exists ──

   The one bug in this file that shipped, and the one a tidy-up would undo. */
{
  if (!/function Fill\(/.test(src)) {
    problems.push(
      'progress-bar.tsx không còn tách <Fill> thành component riêng — useAnimatedStyle ĐÓNG BĂNG style ' +
        'nó tính ở lần render đầu, nên nếu worklet được gắn khi track vẫn là 0 thì giá trị đóng băng là ' +
        'translateX: 0, tức thanh ĐẦY. Đã ship đúng như thế: mọi thanh macro đầy tràn trong một ngày ' +
        'chưa ăn gì, và CHỈ 0% mới lộ ra, vì ở mọi giá trị khác mapper sửa lại vị trí ngay khung đầu',
    );
  }
  if (!/\{track > 0 \?/.test(src)) {
    problems.push(
      'progress-bar.tsx không còn gắn phần chạy CÓ ĐIỀU KIỆN theo track > 0 — nghĩa là worklet lại được ' +
        'gắn trước khi đo xong, và lỗi "thanh đầy trong ngày trống" quay lại nguyên vẹn',
    );
  }
}

/* ── 4. a bar can only ever be a bar — the clamp, run rather than read ── */
{
  const line = src.match(/const target = ([^;]+);/);
  if (!line) {
    problems.push('progress-bar.tsx không còn dòng `const target = …` — không kiểm được nó kẹp giá trị');
  } else {
    const f = new Function('pct', `return ${line[1]}`);
    const CASES = [
      [150, 100, 'quá 100% phải bị kẹp, nếu không thanh trượt qua khỏi track'],
      [-5, 0, 'phần trăm âm phải về 0'],
      [NaN, 0, 'NaN (have/0 với have = 0) phải về 0 — thiếu dữ liệu KHÔNG được thành một transform NaN. ' +
               'Bản width phần trăm sống sót được là do may: RN bỏ qua `width: "NaN%"`'],
      [Infinity, 100, 'Infinity (have/0 với have dương) là trường hợp duy nhất chắc chắn nghĩa là ĐẦY'],
      [50, 50, 'giá trị hợp lệ phải đi qua nguyên vẹn'],
      [0, 0, '0% phải là 0% — chính giá trị này là giá trị duy nhất từng lộ ra lỗi đo đạc'],
    ];
    for (const [v, want, why] of CASES) {
      let got;
      try { got = f(v); } catch (e) { got = `lỗi: ${e.message}`; }
      if (got !== want) problems.push(`ProgressBar(pct=${v}) = ${got}, phải là ${want} — ${why}`);
    }
  }
}

if (problems.length) {
  console.log('thanh tiến độ CÓ LỖI:\n');
  for (const p of problems.slice(0, 12)) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'thanh tiến độ OK — MỘT bản dựng duy nhất: sáu bản chép width phần trăm và một bản scaleX tôi tự ' +
    'thêm vào đều đã gỡ, và không file nào dựng bản mới; nó TRƯỢT bằng translateX chứ không co bằng ' +
    'scale — kết luận file này đã trả giá bằng một lần render cả hai ở 6×, vì co ngang làm bẹp đầu bo ' +
    'tròn; không animate giá trị layout nào; phần chạy vẫn là component riêng chỉ gắn khi track > 0, ' +
    'nếu không thì useAnimatedStyle đóng băng translateX: 0 ở lần render đầu và mọi thanh macro hiện ' +
    'ĐẦY trong một ngày chưa ăn gì (đã ship đúng như thế, và chỉ 0% mới lộ ra); và phép kẹp được CHẠY ' +
    'THẬT với 150, −5, NaN, Infinity, 0 — NaN phải thành 0 chứ không thành một transform NaN',
);
