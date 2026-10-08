#!/usr/bin/env node
/**
 * Golden cho thước chiều cao / cân nặng của onboarding (#424, #527 1.3): phép
 * tính của `HeightBody` / `WeightBody` (`onboarding-flow.tsx`) + `useRulerIndex`
 * trên CHÍNH `native/src/lib/units.ts` và `BOUNDS` của `plausible.ts` @ fac9ac2.
 *
 * Hai hàm dưới đây chép nguyên văn biểu thức của màn RN (không có hàm nào
 * export để gọi thẳng), phần số học thì gọi đúng hàm RN.
 *
 *   ./build.sh && node gen-ruler.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/ruler-golden.json
 */
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const units = require('./out/units.js');
const { BOUNDS } = require('./out/plausible.js');

/** `HeightBody` / `WeightBody`: thang, vạch hạt giống, câu ghi của một vạch. */
function ruler(q, unit, text) {
  const display = q === 'height' ? units.displayHeight : units.displayWeight;
  const toMetric = q === 'height' ? units.heightToCm : units.weightToKg;
  const b = q === 'height' ? BOUNDS.height_cm : BOUNDS.weight_kg;
  const min10 = Math.ceil(display(b.min, unit) * 10);
  const max10 = Math.floor(display(b.max, unit) * 10);
  const count = max10 - min10 + 1;
  const seed = Math.max(0, Math.min(count - 1, Math.round(display(Number(text) || 0, unit) * 10) - min10));
  // `useRulerIndex`: value = (min10 + index) / 10; `commit` ghi chuỗi này.
  const commit = (i) => String(Math.round(toMetric((min10 + i) / 10, unit) * 10) / 10);
  const value = (i) => (min10 + i) / 10;
  return { min10, count, seed, commit, value };
}

const cases = [];
const texts = {
  height: ['170', '', 'abc', '0', '99', '100', '250', '251', '169.9', '182.5', '152.4', '200', '135.3', '1e9'],
  weight: ['70', '', 'abc', '0', '19.9', '20', '400', '401', '69.9', '81.3', '58', '120.5', '45.4'],
};
for (const [q, us] of [['height', ['cm', 'in']], ['weight', ['kg', 'lbs']]]) {
  for (const unit of us) {
    for (const text of texts[q]) {
      const r = ruler(q, unit, text);
      const picks = [...new Set([0, 1, r.seed, Math.floor(r.count / 2), r.count - 2, r.count - 1])];
      cases.push({
        q, unit, text, min10: r.min10, count: r.count, seed: r.seed,
        commits: picks.map((i) => ({
          index: i,
          value: r.value(i),
          text: r.commit(i),
          valueFixed: r.value(i).toFixed(1),
          // Hai dòng của hệ imperial ở màn chiều cao.
          ...(q === 'height' ? { formatted: units.formatHeight(units.heightToCm(r.value(i), unit), unit) } : {}),
        })),
      });
    }
  }
}

// Mọi vạch của từng thang: câu ghi khép kín (ghi rồi đọc lại đúng vạch) là
// điều màn native dựa vào để đặt kim sau khi đổi màn.
const sweeps = [];
for (const [q, unit] of [['height', 'cm'], ['height', 'in'], ['weight', 'kg'], ['weight', 'lbs']]) {
  const r = ruler(q, unit, q === 'height' ? '170' : '70');
  const texts = [];
  const seeds = [];
  for (let i = 0; i < r.count; i++) {
    const t = r.commit(i);
    texts.push(t);
    seeds.push(ruler(q, unit, t).seed);
  }
  sweeps.push({ q, unit, texts, seeds });
}

// Nước của màn kế hoạch: ml là số nguyên, oz một chữ số lẻ.
const water = [1400, 1575, 2000, 2450, 2500, 3150, 4200, 5000].map((ml) => ({
  ml,
  ml_display: Math.round(units.displayVolume(ml, 'ml')),
  oz_fixed: units.displayVolume(ml, 'oz').toFixed(1),
}));

// Chiều cao imperial theo cm (dòng lớn `5'7"`), kể cả biên làm tròn inch.
const feet = [100, 150, 152.4, 167.6, 169.9, 170, 175, 182.88, 190.5, 213.3, 249.9, 250].map((cm) => ({
  cm,
  in: units.formatHeight(cm, 'in'),
  cm_label: units.formatHeight(cm, 'cm'),
}));

console.log(JSON.stringify({ source: 'native/src/lib/units.ts + plausible.ts @ fac9ac2', cases, sweeps, water, feet }));
