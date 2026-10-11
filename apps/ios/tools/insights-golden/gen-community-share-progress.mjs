#!/usr/bin/env node
/**
 * Golden cho chia sẻ tiến trình (#527, lát 12) @ fac9ac2 — `lifts` của
 * `app/community-share-progress.tsx` chép nguyên văn: bài có tạ trong các
 * buổi 90 ngày, hay tập nhất trước, 6 bài.
 *
 *   node gen-community-share-progress.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/community-share-progress-golden.json
 */
const LIFT_CHOICES = 6;
function lifts(sessions) {
  const count = new Map();
  for (const s of sessions ?? []) {
    for (const x of Array.isArray(s.sets) ? s.sets : []) {
      if (!x.exerciseId || x.warmup || !(Number(x.weight) > 0)) continue;
      const cur = count.get(x.exerciseId) ?? { name: x.exerciseName ?? '?', n: 0 };
      cur.n += 1;
      count.set(x.exerciseId, cur);
    }
  }
  return [...count.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, LIFT_CHOICES);
}

let seed = 9191;
const rnd = (n) => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return Math.floor(seed / 65536) % n;
};
const pick = (xs) => xs[rnd(xs.length)];

const EX = [['e1', 'Squat'], ['e2', 'Bench'], ['e3', 'Deadlift'], ['e4', 'Row'], ['e5', 'OHP'], ['e6', 'Curl'], ['e7', 'Dip'], ['e8', 'Lunge'], ['', 'Plank'], [null, 'Run']];
const cases = [];
for (let i = 0; i < 150; i++) {
  const sessions = Array.from({ length: rnd(7) }, () => ({
    sets: rnd(12) === 0 ? pick([null, 'x']) : Array.from({ length: rnd(10) }, () => {
      const [id, name] = pick(EX);
      const x = { weight: pick([0, 20, 60, '40', null, 'abc', -5, 100]), warmup: pick([false, false, true, 1, undefined]) };
      if (id !== null) x.exerciseId = id;
      if (rnd(8)) x.exerciseName = rnd(10) ? name : pick(['', null]);
      return x;
    }),
  }));
  cases.push({ sessions, out: lifts(sessions).map(([id, v]) => ({ id, name: v.name, n: v.n })) });
}
process.stdout.write(JSON.stringify({ cases }, null, 1) + '\n');
