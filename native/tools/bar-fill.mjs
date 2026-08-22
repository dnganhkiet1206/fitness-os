/**
 * The progress bars, checked for the two things that make one wrong.
 *
 * ── what this is guarding ──
 *
 * Six tracks in this app drew their fill by hand, and all six were the same
 * four lines with a percentage width. None of them moved: ticking an exercise
 * off, gaining XP or typing a gram repainted the bar at its new length between
 * two frames. One rule, six copies, none of the copies knowing it — the shape
 * this repository keeps finding, and the reason `BarFill` exists.
 *
 * Two failures are guarded here, and they are different in kind.
 *
 * The first is a SEVENTH copy. Nothing stops the next bar being hand-built with
 * `width: ${pct}%` again, and it would look completely normal in review — it is
 * what the code used to say everywhere.
 *
 * The second is `BarFill` itself quietly drawing the wrong picture. It moves by
 * `scaleX`, and a scale needs an origin: without `transformOrigin: 'left'` the
 * fill shrinks toward its own centre, so a 30% bar renders as a short segment
 * floating in the middle of the track instead of a length starting at the left
 * edge. That is not a crash and not a layout error — it is a *wrong quantity
 * shown confidently*, which is the class of bug this project cares most about,
 * and no type checker or unit test can see it.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPONENT = 'src/components/ascnd/bar-fill.tsx';
const src = readFileSync(path.join(NATIVE, COMPONENT), 'utf8');
const problems = [];

/* ── 1. nobody hand-builds a seventh one ── */
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
    for (const m of body.matchAll(/width: `\$\{/g)) {
      const line = body.slice(0, m.index).split('\n').length;
      problems.push(
        `${rel}:${line} dựng thanh tiến độ bằng width phần trăm — bản chép thứ bảy. Nó sẽ NHẢY CÓC khi ` +
          'số đổi (đúng như cả sáu bản cũ), và animate width là bắt layout chạy lại mỗi khung hình, thứ ' +
          'tools/motion.mjs cấm. Dùng <BarFill ratio={…} />',
      );
    }
  }
}

/* ── 2. it moves by transform, not by layout ── */
{
  const anim = src.match(/useAnimatedStyle\(\(\) => \(\{([\s\S]*?)\}\)\)/);
  if (!anim) {
    problems.push('bar-fill.tsx không còn useAnimatedStyle — thanh không còn chạy mượt nữa');
  } else {
    if (!/scaleX/.test(anim[1])) {
      problems.push('bar-fill.tsx không còn di chuyển bằng scaleX');
    }
    for (const prop of ['width', 'height', 'left', 'right', 'flex', 'margin']) {
      if (new RegExp(`\\b${prop}\\s*:`).test(anim[1])) {
        problems.push(
          `bar-fill.tsx animate \`${prop}\` trong useAnimatedStyle — đó là giá trị layout, mỗi khung ` +
            'hình phải chạy lại bố cục. Đúng luật tools/motion.mjs đã cấm',
        );
      }
    }
  }
}

/* ── 3. the origin, which is the difference between a bar and a floating stub ── */
{
  if (!/transformOrigin:\s*'left'/.test(src)) {
    problems.push(
      "bar-fill.tsx thiếu `transformOrigin: 'left'` — scaleX sẽ co về TÂM, nên thanh 30% vẽ ra thành " +
        'một đoạn ngắn lơ lửng giữa track thay vì một độ dài bắt đầu từ mép trái. Không crash, không ' +
        'sai kiểu: chỉ là một con số hiển thị sai một cách tự tin, đúng loại lỗi repo này tồn tại để chặn',
    );
  }
}

/* ── 4. Reduce Motion, and no fill-from-zero on mount ──

   The name check is not enough and this repository has the receipts: an earlier
   rule in `tools/segmented.mjs` tested for the string `useReducedMotion` and
   was satisfied by the import line alone. So this asks that the flag is read
   where the value is actually assigned. */
{
  const eff = src.match(/useEffect\(\(\) => \{([\s\S]*?)\}, \[/);
  if (!eff || !/reduceMotion \?/.test(eff[1])) {
    problems.push(
      'bar-fill.tsx không rẽ nhánh theo reduceMotion ngay tại chỗ gán giá trị — có import cờ mà không ' +
        'dùng thì Reduce Motion của hệ thống bị làm ngơ',
    );
  }
  const init = src.match(/useSharedValue\(([^)]*)\)/);
  if (!init || init[1].trim() !== 'target') {
    problems.push(
      `bar-fill.tsx khởi tạo shared value bằng \`${init ? init[1] : '?'}\` chứ không phải \`target\` — ` +
        'thanh sẽ chạy từ 0 mỗi lần mount. session-row vẽ một thanh cho MỖI buổi tập trong danh sách ' +
        'cuộn, nên nó sẽ chạy lại mỗi lần một dòng được tái sử dụng vào khung nhìn',
    );
  }
}

/* ── 5. a bar can only ever be a bar — the clamp, run rather than read ── */
{
  const line = src.match(/const target = ([^;]+);/);
  if (!line) {
    problems.push('bar-fill.tsx không còn dòng `const target = …` — không kiểm được nó kẹp giá trị');
  } else {
    const f = new Function('ratio', 'min', `return ${line[1]}`);
    const CASES = [
      [2, 0, 1, 'tỉ lệ > 1 phải bị kẹp về 1, nếu không thanh vẽ tràn ra ngoài track'],
      [-0.5, 0, 0, 'tỉ lệ âm phải về 0'],
      [NaN, 0, 0, 'NaN (chia cho 0: total = 0) phải về 0 — thiếu dữ liệu KHÔNG được thành một con số bất kỳ'],
      [Infinity, 0, 1, 'Infinity phải bị kẹp về 1'],
      [0.5, 0, 0.5, 'giá trị hợp lệ phải đi qua nguyên vẹn'],
      [0.001, 0.03, 0.03, 'sàn min phải nâng được một lượng có thật nhưng rất nhỏ lên mức thấy được'],
    ];
    for (const [r, mn, want, why] of CASES) {
      let got;
      try { got = f(r, mn); } catch (e) { got = `lỗi: ${e.message}`; }
      if (got !== want) problems.push(`BarFill(ratio=${r}, min=${mn}) = ${got}, phải là ${want} — ${why}`);
    }
  }
}

if (problems.length) {
  console.log('thanh tiến độ CÓ LỖI:\n');
  for (const p of problems.slice(0, 12)) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'thanh tiến độ OK — SÁU bản chép width phần trăm gộp về một <BarFill>, và không file nào dựng bản ' +
    'thứ bảy; nó di chuyển bằng scaleX chứ không animate width (motion.mjs cấm animate layout), có ' +
    "transformOrigin 'left' nên thanh mọc từ mép trái chứ không co về tâm — thứ chỉ sai ở PHẦN NHÌN " +
    'nên không công cụ nào khác thấy được; tôn trọng Reduce Motion ngay tại chỗ gán giá trị chứ không ' +
    'chỉ import cái tên; không chạy từ 0 lúc mount (session-row vẽ một thanh mỗi dòng trong danh sách ' +
    'cuộn); và phép kẹp được CHẠY THẬT với 2, -0.5, NaN, Infinity — total = 0 ra NaN phải thành 0 chứ ' +
    'không thành một độ dài tuỳ tiện',
);
