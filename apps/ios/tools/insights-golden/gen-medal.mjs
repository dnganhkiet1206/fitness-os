#!/usr/bin/env node
/**
 * Golden cho dáng đĩa huy chương (#527) — `components/ascnd/medal.tsx` @ fac9ac2:
 * `polyPath` / `starPath` / `squirclePath` / `shieldPath` / `medalPath`
 * (`:230–290`, không export — chép NGUYÊN VĂN, chỉ bỏ kiểu TS), ở hai bán kính
 * màn vẽ (`:378–379`: vành 33, mặt 28) và vài bán kính khác.
 *
 *   node gen-medal.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/medal-golden.json
 */
function polyPath(r, sides, rotate = -Math.PI / 2) {
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const a = rotate + (i * 2 * Math.PI) / sides;
    pts.push(`${(36 + r * Math.cos(a)).toFixed(2)},${(36 + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M ${pts.join(' L ')} Z`;
}

/** Hoa thị / tia: bán kính so le giữa `r` và `r * inner`. */
function starPath(r, points, inner) {
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 === 0 ? r : r * inner;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    pts.push(`${(36 + rad * Math.cos(a)).toFixed(2)},${(36 + rad * Math.sin(a)).toFixed(2)}`);
  }
  return `M ${pts.join(' L ')} Z`;
}

/** Vuông bo tròn mạnh — cái gối. */
function squirclePath(r) {
  const k = r * 0.55;
  const a = r * 0.92;
  return [
    `M ${36 - a + k} ${36 - a}`, `L ${36 + a - k} ${36 - a}`,
    `Q ${36 + a} ${36 - a} ${36 + a} ${36 - a + k}`, `L ${36 + a} ${36 + a - k}`,
    `Q ${36 + a} ${36 + a} ${36 + a - k} ${36 + a}`, `L ${36 - a + k} ${36 + a}`,
    `Q ${36 - a} ${36 + a} ${36 - a} ${36 + a - k}`, `L ${36 - a} ${36 - a + k}`,
    `Q ${36 - a} ${36 - a} ${36 - a + k} ${36 - a}`, 'Z',
  ].join(' ');
}

/** Khiên: vai vuông trên, mũi dưới. */
function shieldPath(r) {
  const w = r * 0.9;
  return [
    `M ${36 - w} ${36 - r + r * 0.16}`,
    `Q ${36 - w} ${36 - r} ${36 - w * 0.8} ${36 - r}`,
    `L ${36 + w * 0.8} ${36 - r}`,
    `Q ${36 + w} ${36 - r} ${36 + w} ${36 - r + r * 0.16}`,
    `L ${36 + w} ${36 - r * 0.3}`,
    `Q ${36 + w} ${36 + r * 0.3} ${36} ${36 + r}`,
    `Q ${36 - w} ${36 + r * 0.3} ${36 - w} ${36 - r * 0.3}`,
    'Z',
  ].join(' ');
}

function medalPath(type, r) {
  switch (type) {
    case 'streak': return starPath(r, 12, 0.8);
    case 'first_workout':
    case 'volume_milestone': return shieldPath(r);
    case 'pr': return starPath(r, 5, 0.45);
    case 'steps_goal': return polyPath(r, 6);
    case 'nutrition': return polyPath(r, 8, -Math.PI / 8);
    case 'water': return polyPath(r, 4, -Math.PI / 2);
    case 'sleep': return squirclePath(r);
    default: return null; /* cân nặng: hình tròn */
  }
}

const types = ['streak', 'first_workout', 'volume_milestone', 'pr', 'steps_goal', 'nutrition', 'water', 'sleep', 'body', 'other'];
const radii = [33, 28, 40, 12.5];
const cases = [];
for (const type of types) for (const r of radii) cases.push({ type, r, d: medalPath(type, r) });
process.stdout.write(JSON.stringify({ cases }, null, 1) + '\n');
