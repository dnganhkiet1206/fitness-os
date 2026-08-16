/**
 * The one piece of advice in this app that could contribute to an injury.
 *
 * ── what is being checked ──
 *
 * `lib/load-progression.ts` compares the effort a saved workout *asks for*
 * against the effort somebody *reported* afterwards, and suggests moving the
 * load. Both halves have been in the database for a long time — `rpe` on the
 * template, `session_rpe` on the session — and nothing had ever put them
 * together.
 *
 * Every failure mode here is asymmetric, and that asymmetry is the whole design:
 *
 *   · suggesting **less** when somebody is finding it hard costs an easy week;
 *   · suggesting **more** when they are already overreaching, or on their first
 *     sessions back, or on a morning the app's own readiness reads red, is the
 *     app pushing somebody toward getting hurt.
 *
 * So "never says `up` when it must not" is swept over every combination rather
 * than spot-checked, and "always says `down` when the sessions are hard" is
 * checked to hold under *all* of those same gates — a guard that silences the
 * warning is the failure this arrangement is most likely to grow.
 *
 * ── and one session is never evidence ──
 *
 * Self-reported RPE is noisy, more so the newer somebody is, and a hard day has
 * a hundred causes that are not the programme: a bad night, a long shift, a
 * heavy meal an hour before. The minimum-session floor is what stops one
 * Tuesday from moving anybody's training, and it is swept too.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(path.join(tmpdir(), 'loadprog-'));
const problems = [];

try {
  try {
    execFileSync(
      'npx',
      ['tsc', 'src/lib/load-progression.ts', 'src/lib/prescription.ts',
       '--ignoreConfig', '--outDir', out,
       '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
      { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch {
    /* no project tsconfig here — tsc exits non-zero over the `@/` mapping and
       still emits, which is all this uses */
  }
  const p = path.join(out, 'load-progression.js');
  writeFileSync(p, readFileSync(p, 'utf8').replaceAll('@/lib/prescription', './prescription'));

  const { suggestLoad, MIN_SESSIONS, RPE_MARGIN, MAX_STEP } =
    createRequire(import.meta.url)(p);
  const { DEFAULT_RPE } = createRequire(import.meta.url)(path.join(out, 'prescription.js'));

  const rep = (n, value) => Array.from({ length: n }, () => value);

  /* ── 1. the cases with a specific answer ── */
  const CASES = [
    {
      name: 'ba buổi báo 9 trong khi mẫu tập đặt 7',
      input: { reported: [9, 9, 9], target: 7 },
      want: 'down',
      why: 'người báo 9 liên tục đang nói với app một điều, và không có bối cảnh nào khiến im lặng là đúng',
    },
    {
      name: 'ba buổi báo 6 trong khi mẫu tập đặt 8',
      input: { reported: [6, 6, 6], target: 8 },
      want: 'up',
      why: 'nhẹ đều qua nhiều buổi thì đề xuất tăng — đây chính là autoregulation',
    },
    {
      name: 'ba buổi đúng quanh mức đặt',
      input: { reported: [7, 7, 8], target: 7 },
      want: 'hold',
      why: 'lệch dưới một điểm là nhiễu của một thang tự báo bằng số nguyên',
    },
    {
      name: 'MỘT buổi nặng bất thường',
      input: { reported: [10], target: 7 },
      want: 'unknown',
      why:
        'một buổi không bao giờ là bằng chứng — một đêm mất ngủ, một ca làm dài, một bữa ăn nặng ' +
        'trước đó đều cho ra đúng con số này',
    },
    {
      name: 'hai buổi nặng',
      input: { reported: [9, 9], target: 7 },
      want: 'unknown',
      why: 'hai buổi có thể là một tuần tốt và một tuần tệ',
    },
    {
      name: 'nhẹ đều nhưng đang quá tải',
      input: { reported: [6, 6, 6], target: 8, situation: 'overreaching', situationConfidence: 'high' },
      want: 'hold',
      why:
        'thấy nhẹ KHÔNG phải bằng chứng phản bác một đợt tăng tải — nó thường là cảm giác của đợt ' +
        'tăng tải lúc đang đi vào',
    },
    {
      name: 'nhẹ đều nhưng là những buổi đầu quay lại',
      input: { reported: [6, 6, 6], target: 8, situation: 'returning', situationConfidence: 'medium' },
      want: 'hold',
      why: 'buổi đầu quay lại VỐN PHẢI nhẹ — cái nhẹ đó là ý đồ chứ không phải lỗi',
    },
    {
      name: 'nhẹ đều nhưng điểm sẵn sàng đỏ',
      input: { reported: [6, 6, 6], target: 8, readiness: 'red' },
      want: 'hold',
      why: 'hai phần của cùng một app nói ngược nhau trên cùng một màn còn tệ hơn cả hai cùng im',
    },
    {
      name: 'nhẹ đều, quá tải nhưng độ tin cậy none',
      input: { reported: [6, 6, 6], target: 8, situation: 'overreaching', situationConfidence: 'none' },
      want: 'up',
      why:
        'độ tin cậy none nghĩa là app không có quyền hành động theo phỏng đoán đó — nếu không, ' +
        'một trạng thái đoán mò sẽ chặn một đề xuất có bằng chứng',
    },
    {
      name: 'mẫu tập không đặt mức nào',
      input: { reported: [9, 9, 9] },
      want: 'down',
      why: `không đặt thì mặc định là ${DEFAULT_RPE}, đọc từ prescription.ts chứ không gõ lại`,
    },
    {
      name: 'có buổi không ai trả lời mức gắng sức',
      input: { reported: [9, null, 9, undefined, 9], target: 7 },
      want: 'down',
      why: 'null là "không trả lời", không phải 0 — gộp thành 0 sẽ kéo trung bình xuống và lật hẳn kết luận',
    },
    {
      name: 'chưa buổi nào có mức gắng sức',
      input: { reported: [null, null, null], target: 7 },
      want: 'unknown',
      why: 'không có gì để đọc thì không kết luận',
    },
  ];

  for (const c of CASES) {
    let got;
    try {
      got = suggestLoad(c.input);
    } catch (e) {
      problems.push(`"${c.name}" ném lỗi: ${e.message}`);
      continue;
    }
    if (got.advice !== c.want) {
      problems.push(
        `"${c.name}" ra '${got.advice}' nhưng phải là '${c.want}' — ${c.why} [vì: ${got.because}]`,
      );
    }
  }

  /* ── 2. never `up` where it must not be, over every combination ──

     The sweep, not a spot check: this is the failure with a body attached. */
  const SITUATIONS = ['settling_in', 'steady', 'slipping', 'returning', 'overreaching', 'stalled'];
  const CONFS = ['none', 'low', 'medium', 'high'];
  const READY = ['green', 'yellow', 'red', null, undefined];

  for (const situation of SITUATIONS) {
    for (const situationConfidence of CONFS) {
      for (const readiness of READY) {
        for (const rpe of [5, 6]) {
          const s = suggestLoad({
            reported: rep(6, rpe),
            target: 9,
            situation,
            situationConfidence,
            readiness,
          });
          const blocked =
            readiness === 'red' ||
            (situationConfidence !== 'none' &&
              (situation === 'overreaching' || situation === 'returning'));
          if (blocked && s.advice === 'up') {
            problems.push(
              `đề xuất TĂNG tải với situation='${situation}' (tin cậy ${situationConfidence}), ` +
                `sẵn sàng='${readiness}' — đây là lời khuyên duy nhất trong app có thể góp phần ` +
                'gây chấn thương, và mọi cổng chặn phải giữ',
            );
          }
          if (!blocked && s.advice !== 'up') {
            problems.push(
              `KHÔNG đề xuất tăng khi không có gì chặn (situation='${situation}', tin cậy ` +
                `${situationConfidence}, sẵn sàng='${readiness}') — cổng chặn đang quá tay và ` +
                `autoregulation không còn hoạt động [${s.because}]`,
            );
          }
        }
      }
    }
  }

  /* ── 3. and no gate may ever silence "ease off" ──

     The likeliest way this file rots: somebody adds a guard for `up`, applies it
     to the whole branch, and the warning that matters disappears. */
  for (const situation of SITUATIONS) {
    for (const situationConfidence of CONFS) {
      for (const readiness of READY) {
        const s = suggestLoad({
          reported: rep(6, 10),
          target: 6,
          situation,
          situationConfidence,
          readiness,
        });
        if (s.advice !== 'down') {
          problems.push(
            `báo 10 với mức đặt 6 mà KHÔNG khuyên giảm (situation='${situation}', sẵn sàng=` +
              `'${readiness}') — một cổng chặn đã bịt mất cảnh báo, đúng kiểu hỏng dễ xảy ra nhất ở đây`,
          );
        }
      }
    }
  }

  /* ── 4. one session never moves anything, swept ── */
  for (let n = 0; n < MIN_SESSIONS; n++) {
    for (const rpe of [5, 10]) {
      const s = suggestLoad({ reported: rep(n, rpe), target: 7 });
      if (s.advice !== 'unknown') {
        problems.push(`${n} buổi đã ra '${s.advice}' — dưới ${MIN_SESSIONS} buổi thì không được kết luận`);
      }
      if (s.confidence !== 'none') {
        problems.push(`${n} buổi mà độ tin cậy là '${s.confidence}' — phải là 'none'`);
      }
    }
  }

  /* ── 5. the step is bounded, and is a fraction ── */
  for (const gap of [1, 2, 3, 4, 8]) {
    const up = suggestLoad({ reported: rep(6, Math.max(1, 9 - gap)), target: 9 });
    const down = suggestLoad({ reported: rep(6, 10), target: Math.max(1, 10 - gap) });
    if (Math.abs(up.step) > MAX_STEP + 1e-9 || Math.abs(down.step) > MAX_STEP + 1e-9) {
      problems.push(
        `bước nhảy vượt trần ${MAX_STEP} (tăng ${up.step}, giảm ${down.step}) ở chênh lệch ${gap} điểm — ` +
          'một lần chỉnh không được phép nhảy quá xa dù chênh lệch có lớn đến đâu',
      );
    }
    if (up.advice === 'up' && !(up.step > 0)) problems.push('khuyên tăng mà bước nhảy không dương');
    if (down.advice === 'down' && !(down.step < 0)) problems.push('khuyên giảm mà bước nhảy không âm');
  }
  {
    const hold = suggestLoad({ reported: [7, 7, 7], target: 7 });
    if (hold.step !== 0) problems.push('giữ nguyên mà bước nhảy khác 0');
  }

  if (RPE_MARGIN < 1) {
    problems.push(
      `RPE_MARGIN ${RPE_MARGIN} dưới một điểm — thang RPE được tự báo bằng SỐ NGUYÊN, nên dưới một ` +
        'điểm là đang đọc nhiễu',
    );
  }

  if (problems.length) {
    console.log('điều chỉnh tải CÓ LỖI:\n');
    for (const p of problems.slice(0, 12)) console.log(`  • ${p}`);
    if (problems.length > 12) console.log(`  … và ${problems.length - 12} lỗi nữa`);
    process.exit(1);
  }

  console.log(
    `điều chỉnh tải OK — ${CASES.length} ca có đáp án cụ thể đều đúng, và hai bất biến được QUÉT qua ` +
      `${SITUATIONS.length}×${CONFS.length}×${READY.length} tổ hợp: không tổ hợp nào đề xuất TĂNG tải khi ` +
      'đang quá tải, khi vừa quay lại, hay khi điểm sẵn sàng đỏ (đây là lời khuyên duy nhất trong app ' +
      'có thể góp phần gây chấn thương) — mà cũng không cổng nào bịt mất lời khuyên GIẢM, thứ dễ hỏng ' +
      `nhất khi ai đó thêm một cổng chặn cho nhánh tăng. Dưới ${MIN_SESSIONS} buổi thì không kết luận gì ` +
      'và độ tin cậy là none: một buổi nặng bất thường có thể chỉ là một đêm mất ngủ. Bước nhảy là TỈ LỆ ' +
      `chứ không phải số kg, và bị chặn ở ${MAX_STEP * 100}% dù chênh lệch lớn đến đâu; mức đặt mặc định ` +
      'đọc từ prescription.ts chứ không gõ lại; và buổi không ai trả lời mức gắng sức bị BỎ QUA chứ không ' +
      'gộp thành 0',
  );
} finally {
  rmSync(out, { recursive: true, force: true });
}
