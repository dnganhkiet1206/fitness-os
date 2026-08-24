/**
 * That an inline picker comes from the control that opened it, and goes back
 * into it.
 *
 * ── the shape of the bug this is about ──
 *
 * The effort picker used to be `FadeIn` in and `FadeOut` out. That is the
 * default reach, and it fails twice in a way that is hard to see in a diff:
 *
 *   · A fade holds the box at FULL HEIGHT for the whole exit and then removes
 *     it in one frame. The panel dissolves politely and everything below it
 *     jumps. Only a height fixes that, because only a height is a layout value
 *     — `today-meals.tsx` measured the alternative and found a 94px hole.
 *   · A fade happens in place, so nothing ties the panel to the chip you
 *     pressed. On a card holding three sets, "near" is not "from".
 *
 * ── and the timing, which is not mine ──
 *
 * WWDC20's *Design with iOS pickers, menus and actions*, on menus dismissing
 * when you choose: the transition is "very fast and light, it's SHORTER but it
 * still feels smooth, and it's less drastic". So the exit being shorter than
 * the entrance is a rule, not a preference, and symmetry is the regression.
 *
 * Every number below is read out of the source and resolved through the real
 * `duration` tokens, because each is a value somebody could "harmonise"
 * without knowing what it was doing.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPONENT = 'src/components/ascnd/retract.tsx';
const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');
const src = read(COMPONENT);
const problems = [];

/* The animation bodies, split so a rule about the exit cannot be satisfied by
   something written in the entrance. Bounded by the closing `};` of each
   builder rather than by brace counting, which trips over the nested config
   objects. */
const between = (from, to) => {
  const a = src.indexOf(from);
  if (a < 0) return '';
  const b = src.indexOf(to, a);
  return b < 0 ? src.slice(a) : src.slice(a, b);
};
const grow = between('const growIn', 'const retractOut');
const shut = between('const retractOut', 'export function Retract');

/* ── 1. the exit moves a height, not only an opacity ── */
{
  for (const [name, body] of [
    ['growIn', grow],
    ['retractOut', shut],
  ]) {
    if (!body) {
      problems.push(`${COMPONENT}: không tìm thấy ${name} — hai nửa của hiệu ứng phải cùng nằm ở đây`);
      continue;
    }
    /* Inside `animations:`, not `initialValues:` — a height that is only ever
       set as a starting value is a height that never moves. */
    const anim = body.slice(body.indexOf('animations:'));
    if (!/height:\s*withTiming/.test(anim)) {
      problems.push(
        `${COMPONENT}: ${name} không animate height — nếu chỉ mờ dần thì chiều cao vẫn nhảy ` +
          'một khung hình và mọi thứ bên dưới giật theo; today-meals.tsx đã đo: hở 94px',
      );
    }
    if (!/scale:\s*withTiming/.test(anim)) {
      problems.push(
        `${COMPONENT}: ${name} không animate scale — không có gì nối tấm này với cái chip đã mở nó`,
      );
    }
  }
}

/* ── 2. the clip, and the corner it shrinks toward ──

   A height that changes with nothing clipping it is a number changing: the
   contents keep their full size and hang out of the box. And a scale with no
   origin shrinks toward the centre, which points at nothing. Both live in the
   style the component itself applies, so neither can be forgotten by a caller
   — that is why this is a component rather than two exported animations, and
   this rule is what keeps it one. */
{
  const styles = src.slice(src.indexOf('StyleSheet.create'));
  if (!/overflow:\s*'hidden'/.test(styles)) {
    problems.push(
      `${COMPONENT}: thiếu overflow: 'hidden' — height chạy mà không cắt thì nội dung tràn ra ngoài hộp`,
    );
  }
  const origin = styles.match(/transformOrigin:\s*'([^']+)'/);
  if (!origin) {
    problems.push(
      `${COMPONENT}: thiếu transformOrigin — scale không có neo thì thu về TÂM, mà tâm không trỏ vào đâu cả`,
    );
  } else if (!/top/.test(origin[1])) {
    problems.push(
      `${COMPONENT}: transformOrigin là '${origin[1]}' — chip nằm PHÍA TRÊN tấm này, nên neo phải ở cạnh trên`,
    );
  }
  /* The component has to actually wear it. A style defined and never applied is
     the same as no style, and it reads as done. */
  if (!/style=\{\[styles\.clip/.test(src)) {
    problems.push(`${COMPONENT}: styles.clip có định nghĩa nhưng Animated.View không dùng — style không gắn thì bằng không có`);
  }
}

/* ── 3. the exit is shorter than the entrance ──

   Resolved through `constants/motion.ts`, so renaming a token or changing what
   one is worth is caught here rather than quietly making the two equal. */
{
  const tokens = read('src/constants/motion.ts');
  const value = (name) => {
    const m = tokens.match(new RegExp(`\\b${name}:\\s*(\\d+)`));
    return m ? Number(m[1]) : null;
  };
  const ms = (constName) => {
    const m = src.match(new RegExp(`const ${constName}\\s*=\\s*duration\\.(\\w+)`));
    if (!m) return { err: `${constName} không lấy từ token duration.* — đừng đặt số trần` };
    const v = value(m[1]);
    return v === null ? { err: `${constName} trỏ tới duration.${m[1]}, mà token đó không tồn tại` } : { v, tok: m[1] };
  };
  const open = ms('OPEN_MS');
  const shutMs = ms('SHUT_MS');
  for (const r of [open, shutMs]) if (r.err) problems.push(`${COMPONENT}: ${r.err}`);
  if (open.v && shutMs.v && !(shutMs.v < open.v)) {
    problems.push(
      `${COMPONENT}: đóng (${shutMs.v}ms) không ngắn hơn mở (${open.v}ms) — WWDC20 nói về menu khi ` +
        'chọn xong: "it\'s shorter but it still feels smooth". Đối xứng chính là lỗi ở đây',
    );
  }
  /* Nothing else in the file may carry its own millisecond. The token file
     says why: four values exist so the eighth place does not invent 190. */
  for (const m of src.matchAll(/duration:\s*(\d+)/g)) {
    problems.push(`${COMPONENT}: duration: ${m[1]} viết cứng — phải đi qua token duration.*`);
  }
}

/* ── 4. the two curves are not the same curve ──

   The asymmetry IS the feel: decelerating into place on the way open,
   accelerating away on the way shut, so the last part of the exit is the
   fastest and the panel looks pulled in rather than let go of. Two `out`
   curves would pass every rule above and still feel like a fade. */
{
  const ease = (n) => (src.match(new RegExp(`const ${n}\\s*=\\s*Easing\\.(\\w+)`)) || [])[1];
  const o = ease('OPEN_EASE');
  const s = ease('SHUT_EASE');
  if (!o || !s) problems.push(`${COMPONENT}: thiếu OPEN_EASE/SHUT_EASE`);
  else if (o === s) {
    problems.push(
      `${COMPONENT}: mở và đóng dùng chung Easing.${o} — chiều thu lại phải TĂNG TỐC về cuối, ` +
        'nếu không thì nó là một cú mờ dần có thêm chiều cao',
    );
  }
}

/* ── 5. one definition, and the picker actually inside it ──

   The recurring failure in this repository is one rule with N copies that
   drift. `day-plan.tsx` is where the picker lives; the rule checks the effort
   options are WRAPPED, not merely that the name appears — an import line on
   its own has satisfied a rule of mine before. */
{
  const day = read('src/components/ascnd/day-plan.tsx');
  const open = day.indexOf('<Retract');
  const close = day.indexOf('</Retract>');
  if (open < 0 || close < open) {
    problems.push('day-plan.tsx: bảng chọn không nằm trong <Retract> — nó sẽ mờ dần rồi giật chiều cao');
  } else {
    const inside = day.slice(open, close);
    if (!/RPE_CHOICES\.map/.test(inside)) {
      problems.push(
        'day-plan.tsx: <Retract> có đó nhưng dãy nút RPE không nằm trong — bọc nhầm chỗ thì hiệu ứng ' +
          'chạy cho một cái hộp rỗng',
      );
    }
    if (/entering=\{Fade|exiting=\{Fade/.test(inside.slice(inside.indexOf('>')))) {
      problems.push('day-plan.tsx: vẫn còn một cặp Fade tự dựng bên trong <Retract> — hai hiệu ứng chồng nhau');
    }
  }
  /* And nowhere else may grow its own. One file defines the pair. */
  const dir = path.join(NATIVE, 'src');
  const walk = (d) =>
    readdirSync(d).flatMap((e) => {
      const p = path.join(d, e);
      return statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsx') || p.endsWith('.ts') ? [p] : [];
    });
  for (const abs of walk(dir)) {
    const rel = path.relative(NATIVE, abs);
    if (rel === COMPONENT) continue;
    if (/initialValues:\s*\{[^}]*height:/.test(read(rel))) {
      problems.push(`${rel}: tự dựng một hiệu ứng thu chiều cao riêng — dùng <Retract>, một luật một bản`);
    }
  }
}

if (problems.length) {
  console.log('hiệu ứng thu lại CÓ LỖI:\n');
  for (const p of problems.slice(0, 10)) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'hiệu ứng thu lại OK — tấm chọn MỌC RA từ chip và THU VỀ chip: chiều cao thật (nên danh sách bên ' +
    'dưới đi theo từng khung hình thay vì giật một cái khi mờ xong), scale neo ở cạnh trên phía chip ' +
    '(tâm thì không trỏ vào đâu cả), có overflow ẩn để chiều cao thật sự cắt được nội dung, và đóng ' +
    'NGẮN HƠN mở với đường cong tăng tốc về cuối — WWDC20 nói đúng câu đó về menu khi chọn xong: ' +
    '"it\'s shorter but it still feels smooth". Mọi mốc thời gian đi qua token duration.*, và không ' +
    'file nào khác tự dựng bản thứ hai',
);
