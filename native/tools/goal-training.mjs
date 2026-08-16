/**
 * A goal that only moves a calorie number is a label.
 *
 * ── what was wrong ──
 *
 * `profiles.goal` reached exactly two functions — `calcTargetCalories` and
 * `calcMacros` — and nothing else. Grepping it across `training-card.ts`,
 * `prescription.ts`, `load-progression.ts`, `user-state.ts`,
 * `readiness-engine.ts` and `koa-decide.ts` returned nothing at all. Somebody
 * could pick "build strength", watch their calorie target move, and find the
 * training half of the app had never heard of it.
 *
 * ── the two things this rule protects ──
 *
 * **Nobody drops below the public-health floor.** WHO's 2020 guidance for
 * adults is muscle-strengthening work on two or more days a week *plus* 150–300
 * minutes of moderate aerobic activity, and the strengthening half applies to
 * every adult whatever they are training for. So the floor is swept across
 * every goal, including the ones that might look like exceptions — an
 * "endurance" goal does not opt out of strength work — and including goals the
 * app has never heard of, which must land on the floor rather than on zero.
 *
 * **Nothing is invented above the floor.** This is the rule that keeps the file
 * from quietly becoming this app's own exercise science: a goal may sit above
 * the WHO floor only where something published says so, and every other goal
 * must be *exactly* at it. The check below is therefore two-sided — it fails a
 * goal that is too low, and it fails a goal that has been given a number nobody
 * can point at a source for.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(path.join(tmpdir(), 'goaltrain-'));
const problems = [];

try {
  try {
    execFileSync(
      'npx',
      ['tsc', 'src/lib/goal-training.ts', 'src/lib/load-progression.ts', 'src/lib/prescription.ts',
       '--ignoreConfig', '--outDir', out,
       '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
      { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch {
    /* no project tsconfig here — tsc exits non-zero over the `@/` mapping and
       still emits, which is all this uses */
  }
  const lp = path.join(out, 'load-progression.js');
  writeFileSync(
    lp,
    readFileSync(lp, 'utf8')
      .replaceAll('@/lib/prescription', './prescription')
      .replaceAll('@/lib/goal-training', './goal-training'),
  );
  const req = createRequire(import.meta.url);
  const {
    goalTraining,
    goalRpeTarget,
    WHO_STRENGTH_DAYS,
    WHO_AEROBIC_MIN,
    WHO_AEROBIC_MIN_EXTRA,
  } = req(path.join(out, 'goal-training.js'));
  const { suggestLoad } = req(lp);

  /** Every goal the app offers, plus the ones only older rows can hold. */
  const OFFERED = ['bulk', 'cut', 'maintain', 'strength', 'endurance', 'recomp'];
  const STRANGERS = ['', '   ', 'muscle_gain', 'unknown-goal', null, undefined];

  /* ── 1. the WHO floor holds for every goal, including strangers ── */
  for (const goal of [...OFFERED, ...STRANGERS]) {
    const g = goalTraining(goal);
    if (!(g.strengthDays >= WHO_STRENGTH_DAYS)) {
      problems.push(
        `mục tiêu '${goal}' ra ${g.strengthDays} ngày tập cơ/tuần, dưới sàn WHO ${WHO_STRENGTH_DAYS} — ` +
          'khuyến nghị tập cơ áp dụng cho MỌI người lớn bất kể họ đang tập vì mục tiêu gì, ' +
          'nên mục tiêu sức bền cũng không được miễn',
      );
    }
    if (!(g.aerobicMin >= WHO_AEROBIC_MIN)) {
      problems.push(
        `mục tiêu '${goal}' ra ${g.aerobicMin} phút aerobic/tuần, dưới sàn WHO ${WHO_AEROBIC_MIN}`,
      );
    }
    const [lo, hi] = g.rpeBand;
    if (!(lo >= 1 && hi <= 10 && lo <= hi)) {
      problems.push(`mục tiêu '${goal}' có dải RPE vô lý [${lo}, ${hi}]`);
    }
  }

  /* ── 2. a stranger gets the floor exactly, not a guess ── */
  for (const goal of STRANGERS) {
    const g = goalTraining(goal);
    if (g.strengthDays !== WHO_STRENGTH_DAYS || g.aerobicMin !== WHO_AEROBIC_MIN) {
      problems.push(
        `mục tiêu lạ '${goal}' ra ${g.strengthDays}/${g.aerobicMin} — một giá trị app chưa từng ` +
          'nghe tên phải rơi về đúng khuyến nghị công cộng, không phải 0 và cũng không phải một phỏng đoán',
      );
    }
  }

  /* ── 3. nothing above the floor without a published reason ──

     The other half of the rule, and the half that stops this file becoming the
     app's own exercise science. Each entry names the source it is allowed to
     exceed the floor by; anything not listed must sit exactly on the floor. */
  const JUSTIFIED = {
    strength: { strengthDays: 3, why: 'tập cơ thường xuyên hơn là chính mục đích của mục tiêu này' },
    bulk: { strengthDays: 3, why: 'như trên' },
    endurance: {
      aerobicMin: WHO_AEROBIC_MIN_EXTRA,
      why: 'đầu trên của chính dải WHO, mức họ gọi là "additional benefits" — không phải số mới',
    },
  };
  for (const goal of OFFERED) {
    const g = goalTraining(goal);
    const j = JUSTIFIED[goal] ?? {};
    const wantDays = j.strengthDays ?? WHO_STRENGTH_DAYS;
    const wantAero = j.aerobicMin ?? WHO_AEROBIC_MIN;
    if (g.strengthDays !== wantDays) {
      problems.push(
        `mục tiêu '${goal}' ra ${g.strengthDays} ngày tập cơ nhưng phải là ${wantDays} — ` +
          (j.strengthDays
            ? `được vượt sàn vì: ${j.why}`
            : 'không có cơ sở nào để nó khác sàn, và đặt một con số không chỉ được nguồn ' +
              'là app tự bịa ra khoa học thể thao'),
      );
    }
    if (g.aerobicMin !== wantAero) {
      problems.push(
        `mục tiêu '${goal}' ra ${g.aerobicMin} phút aerobic nhưng phải là ${wantAero} — ` +
          (j.aerobicMin ? `được vượt sàn vì: ${j.why}` : 'không có cơ sở nào để nó khác sàn'),
      );
    }
  }

  /* ── 4. and the goal really reaches the load engine ──

     The whole point: `goal` used to touch calories and nothing else. If this
     stops being true the file above is just a table nobody reads. */
  {
    /* Six sessions all reported at 8. Against a `maintain` band centred on 7.5
       that is within the margin — hold. Against a `strength` band centred on
       8.5 it is also within the margin — hold. The difference shows at 7: easy
       for strength, on target for maintain. */
    const atSeven = (goal) => suggestLoad({ reported: [7, 7, 7, 7, 7, 7], goal }).advice;
    if (atSeven('maintain') !== 'hold') {
      problems.push(`báo 7 với mục tiêu 'maintain' ra '${atSeven('maintain')}' — dải của nó tâm ở 7.5, phải là hold`);
    }
    if (atSeven('strength') !== 'up') {
      problems.push(
        `báo 7 với mục tiêu 'strength' ra '${atSeven('strength')}' — dải của mục tiêu sức mạnh tâm ở ` +
          '8.5, nên 7 là nhẹ hơn một điểm rưỡi và phải đề xuất tăng. Nếu ra hold thì mục tiêu vẫn ' +
          'chưa chạm tới engine và nó vẫn chỉ là một cái nhãn',
      );
    }
    /* and a template that states its own effort still wins */
    const withTemplate = suggestLoad({ reported: [7, 7, 7, 7, 7, 7], target: 7, goal: 'strength' }).advice;
    if (withTemplate !== 'hold') {
      problems.push(
        `mẫu tập ghi rõ mức 7 mà vẫn bị mục tiêu ghi đè (ra '${withTemplate}') — người viết buổi tập ` +
          'biết về nó nhiều hơn một cái nhãn mục tiêu',
      );
    }
  }

  /* ── 5. the midpoint helper agrees with the band ── */
  for (const goal of OFFERED) {
    const [lo, hi] = goalTraining(goal).rpeBand;
    const mid = goalRpeTarget(goal);
    if (Math.abs(mid - (lo + hi) / 2) > 1e-9) {
      problems.push(`goalRpeTarget('${goal}') = ${mid} không phải tâm của dải [${lo}, ${hi}]`);
    }
  }

  if (problems.length) {
    console.log('mục tiêu → tập luyện CÓ LỖI:\n');
    for (const p of problems.slice(0, 12)) console.log(`  • ${p}`);
    if (problems.length > 12) console.log(`  … và ${problems.length - 12} lỗi nữa`);
    process.exit(1);
  }

  console.log(
    `mục tiêu → tập luyện OK — ${OFFERED.length} mục tiêu app đang có và ${STRANGERS.length} giá trị lạ ` +
      `đều ≥ sàn WHO (${WHO_STRENGTH_DAYS} ngày tập cơ/tuần, ${WHO_AEROBIC_MIN} phút aerobic/tuần), và ` +
      'mục tiêu sức bền KHÔNG được miễn phần tập cơ; một giá trị app chưa từng nghe tên rơi về ĐÚNG sàn ' +
      'chứ không phải 0. Luật hai chiều: mục tiêu nào vượt sàn phải có nguồn ghi kèm (strength/bulk lên ' +
      `3 ngày, endurance lên ${WHO_AEROBIC_MIN_EXTRA} phút — đầu trên của chính dải WHO), mọi mục tiêu ` +
      'còn lại phải nằm ĐÚNG trên sàn, nên không ai đặt thêm được một con số không chỉ được nguồn. Và ' +
      "mục tiêu THẬT SỰ chạm tới engine: báo 7 ra 'hold' với maintain nhưng 'up' với strength — trước đây " +
      'goal chỉ chạm calo và macro, không một file tập luyện nào biết nó tồn tại; mẫu tập có ghi mức ' +
      'gắng sức riêng thì vẫn thắng',
  );
} finally {
  rmSync(out, { recursive: true, force: true });
}
