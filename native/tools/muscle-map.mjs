/**
 * Which diagram every stored `muscle_group` lands on, run against the real
 * strings the database actually holds.
 *
 * ── why this is worth a tool ──
 *
 * The mapping is the only thing standing between the library grid and a lie.
 * A group name that misses the table produces a tile reading "0 bài" over a
 * shelf that has exercises on it — and nothing about that looks broken. It is
 * a number, it is plausible, and the exercises are still findable through the
 * full list, so nobody reports it.
 *
 * That is not hypothetical. The first version of the table was written from the
 * *picker's* labels and missed three of the ten seeded exercises, because the
 * seed migration spells them differently:
 *
 *   Dumbbell Curl      `Bắp tay trước`   picker says `Tay trước`
 *   Romanian Deadlift  `Hamstring`       picker says `Hamstrings`
 *   Deadlift           `Lưng/Chân`       two groups in one field
 *
 * Biceps read 0 with a curl sitting in the library.
 *
 * ── what is checked ──
 *
 * 1. every group in the seed migration maps to at least one diagram
 * 2. the compound `Lưng/Chân` maps to *both*, not to whichever came first
 * 3. the near-misses map, and map to the right muscle
 * 4. longest-first containment holds — `bắp chân` is calves, never legs
 * 5. a string with nothing to do with anatomy maps to nothing, rather than
 *    being swept into whichever alias happens to be a substring of it
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(path.join(tmpdir(), 'musclemap-'));

try {
  execFileSync('npx', ['tsc', 'src/lib/muscle-group.ts', '--ignoreConfig', '--outDir', out,
    '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] });
  const { muscleArtKeysFor } = createRequire(import.meta.url)(path.join(out, 'muscle-group.js'));

  const problems = [];
  const keys = (s) => muscleArtKeysFor(s).sort().join('+');

  // ── 1: every group the seed migration writes ──
  const SEED = {
    'Chân': 'legs',
    'Ngực': 'chest',
    'Lưng/Chân': 'back+legs',
    'Vai': 'shoulders',
    'Lưng': 'back',
    'Bắp tay trước': 'biceps',
    'Hamstring': 'legs',
  };
  for (const [group, want] of Object.entries(SEED)) {
    const got = keys(group);
    if (got !== want) problems.push(`seed "${group}" → "${got}", đáng lẽ "${want}"`);
  }

  // ── 3: both pickers' labels, in both languages ──
  const PICKERS = {
    Chest: 'chest', Back: 'back', Shoulders: 'shoulders', Biceps: 'biceps',
    Triceps: 'triceps', Quads: 'legs', Hamstrings: 'legs', Glutes: 'glutes',
    Abs: 'abs', 'Full Body': 'cardio', Cardio: 'cardio',
    'Ngực': 'chest', 'Lưng': 'back', 'Vai': 'shoulders', 'Tay trước': 'biceps',
    'Tay sau': 'triceps', 'Chân trước': 'legs', 'Chân sau': 'legs',
    'Mông': 'glutes', 'Bụng': 'abs', 'Toàn thân': 'cardio',
  };
  for (const [group, want] of Object.entries(PICKERS)) {
    const got = keys(group);
    if (got !== want) problems.push(`picker "${group}" → "${got}", đáng lẽ "${want}"`);
  }

  // ── 4: the containment trap ──
  if (keys('Bắp chân') !== 'calves') problems.push(`"Bắp chân" → "${keys('Bắp chân')}", phải là calves chứ không phải legs`);
  if (keys('bap chan trai') !== 'calves') problems.push('biến thể của bắp chân phải vẫn ra calves');

  // ── 5: nothing anatomical means nothing ──
  for (const junk of ['', '   ', 'Forearms', 'Neck', '???']) {
    if (muscleArtKeysFor(junk).length !== 0) {
      problems.push(`"${junk}" → "${keys(junk)}", đáng lẽ không khớp gì`);
    }
  }
  if (muscleArtKeysFor(null).length !== 0 || muscleArtKeysFor(undefined).length !== 0) {
    problems.push('null/undefined phải trả mảng rỗng');
  }

  /*
    Self-test: the bug this file was written for, rebuilt.

    An exact-only lookup — the first version — must fail on the seed's three odd
    spellings. If it passes, the checks above are not testing what they claim to.
  */
  const exactOnly = (g) => (['chan','nguc','lung','vai','tay truoc','hamstrings'].includes(
    String(g).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()) ? ['x'] : []);
  const missed = ['Bắp tay trước', 'Hamstring', 'Lưng/Chân'].filter((g) => exactOnly(g).length === 0);
  if (missed.length !== 3) {
    console.error('phép tự kiểm hỏng — cách tra cũ đáng lẽ phải trượt cả ba, đừng tin kết quả');
    process.exit(1);
  }

  if (problems.length) {
    console.error('bảng tra nhóm cơ sai:\n');
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }

  const n = Object.keys(SEED).length + Object.keys(PICKERS).length;
  console.log(`bảng tra nhóm cơ OK — ${n} tên thật, "Lưng/Chân" vào cả back lẫn legs, "Bắp chân" không lẫn vào legs`);
} finally {
  rmSync(out, { recursive: true, force: true });
}
