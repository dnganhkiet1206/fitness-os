/**
 * A session of pull-ups is not a session that cost nothing.
 *
 * ── the hole this rule was written for ──
 *
 * Training load was tonnage — `Σ (weight × reps)` — applied to every session
 * whatever was in it. A barbell day scores; a day of pull-ups, press-ups and
 * dips scores **0**; a run imported from a watch scores 0 too, deliberately,
 * because a run has no tonnage.
 *
 * Zero then travelled:
 *
 *     volume_load 0
 *       → trainingLoad28d 0
 *       → readiness-engine: `if (load28d <= 0) return null`
 *       → the readiness score loses its training dimension
 *       → daily_logs.acwr null
 *       → user-state: `overreaching` cannot fire
 *       → load-progression: the gate that refuses to say "add load" to
 *         somebody in a load spike never closes for them
 *
 * So everyone who trains without a barbell was invisible to the fitness system,
 * and was the only group whose load-increase advice had nothing behind it.
 *
 * ── what replaced it, and the invariant that makes it safe ──
 *
 * Internal load by the session-RPE method: `RPE × total reps`. Both halves were
 * already stored. The dangerous part of the change is not the formula, it is
 * that **the unit of the acute:chronic ratio changed for everybody who already
 * trains with weights** — and their readiness score must not move because of a
 * change of unit.
 *
 * It does not, and the reason is worth stating precisely rather than trusting:
 * ACWR is a *ratio*. Scale every session in both windows by the same factor and
 * the ratio is identical, so the 0.8–1.3 bands in `readiness-engine` keep
 * meaning what they meant. That is an arithmetic claim, so this file **runs**
 * it over a spread of factors instead of asserting it in a comment.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(path.join(tmpdir(), 'sessload-'));
const problems = [];

try {
  try {
    execFileSync(
      'npx',
      ['tsc', 'src/lib/session-load.ts', 'src/lib/readiness-engine.ts', 'src/lib/training-card.ts',
       'src/lib/local-date.ts', 'src/lib/user-state.ts', 'src/lib/load-progression.ts',
       'src/lib/prescription.ts', 'src/lib/goal-training.ts',
       '--ignoreConfig', '--outDir', out,
       '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
      { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch {
    /* no project tsconfig here — tsc exits non-zero over the `@/` mapping and
       still emits, which is all this uses */
  }
  const req = createRequire(import.meta.url);
  const { sessionLoad, loadWindow, totalReps, RPE_MAX } = req(path.join(out, 'session-load.js'));
  /* `computeReadiness` and not the internal `getACWR`, which is deliberately
     unexported. Exporting a private helper so a test can reach it turns the
     test into a statement about a function nobody calls; going through the
     public entry point tests the path the app actually takes, and the returned
     `acwr` is the same number the dashboard shows. */
  const { computeReadiness } = req(path.join(out, 'readiness-engine.js'));
  /* The last two links of the chain. `@/lib/x` → `./x` so `require` resolves. */
  for (const f of ['user-state', 'load-progression', 'training-card']) {
    const p = path.join(out, `${f}.js`);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/@\/lib\//g, './'));
  }
  const { userStateFrom, OVERREACH_ACWR } = req(path.join(out, 'user-state.js'));
  const { suggestLoad } = req(path.join(out, 'load-progression.js'));

  /** A readiness input with everything but the two loads held still. */
  const ready = (load7, load28, days = 28) =>
    computeReadiness({
      hrv_today: 60,
      hrv_history_28d: [58, 60, 62, 59, 61, 60],
      rhr_today: 55,
      rhr_history_28d: [55, 56, 54, 55, 57],
      sleep_min_lastnight: 450,
      sleep_target_min: 480,
      sleep_debt_7d_min: 20,
      training_load_7d: load7,
      training_load_28d: load28,
      training_days_28d: days,
    });

  const sets = (...reps) => reps.map((r, i) => ({ exerciseName: 'X', setIndex: i + 1, weight: 0, reps: r }));

  /* ── 1. the cases, each with the reason it is here ── */
  const CASES = [
    {
      name: 'buổi tay không: 3 bài × 3 hiệp × 10 reps, RPE 8',
      s: { session_rpe: 8, sets: sets(...Array(9).fill(10)) },
      want: 8 * 90,
      why:
        'đây là ca cả bản sửa tồn tại vì nó: theo tấn tạ thì buổi này bằng 0, và số 0 đó lan xuống ' +
        'điểm sẵn sàng, acwr, overreaching và cổng an toàn của gợi ý tăng tải',
    },
    {
      name: 'buổi tạ nặng, ít reps',
      s: { session_rpe: 9, sets: sets(5, 5, 5, 3, 3) },
      want: 9 * 21,
      why: 'ít reps ở cường độ cao vẫn ra tải, và thấp hơn một buổi nhiều reps cùng RPE',
    },
    {
      name: 'buổi nhập từ đồng hồ: không RPE, sets rỗng',
      s: { session_rpe: null, sets: [] },
      want: null,
      why:
        'null chứ KHÔNG phải 0. 0 nói "có tập và tốn 0", null nói "không đo được" — và null bị loại ' +
        'khỏi CẢ HAI vế của tỉ lệ thay vì kéo trung bình xuống',
    },
    {
      name: 'có sets nhưng không ai trả lời RPE',
      s: { session_rpe: null, sets: sets(10, 10, 10) },
      want: null,
      why: 'thiếu một vế thì không nhân được — đoán RPE là bịa ra cường độ không ai báo',
    },
    {
      name: 'có RPE nhưng sets rỗng',
      s: { session_rpe: 8, sets: [] },
      want: null,
      why: 'cũng vậy, thiếu vế còn lại',
    },
    {
      name: 'RPE ngoài thang (0)',
      s: { session_rpe: 0, sets: sets(10) },
      want: null,
      why: 'không nằm trên thang RPE nào thì đọc là vắng mặt, không phải kẹp về 1',
    },
    {
      name: 'RPE ngoài thang (99)',
      s: { session_rpe: 99, sets: sets(10) },
      want: null,
      why: 'kẹp về 10 sẽ bịa ra một cường độ người ta không báo',
    },
    {
      name: 'reps âm và reps rác lẫn trong sets',
      s: { session_rpe: 7, sets: [{ reps: 10 }, { reps: -5 }, { reps: 'x' }, { reps: null }, { reps: 8 }] },
      want: 7 * 18,
      why: 'một dòng hỏng đóng góp 0 chứ không TRỪ đi — reps âm không phải lượng việc âm',
    },
    {
      name: 'sets không phải mảng (dòng cũ trong DB)',
      s: { session_rpe: 7, sets: null },
      want: null,
      why: 'JSON lạ không được làm hỏng cả chuỗi tính của ngày',
    },
  ];

  for (const c of CASES) {
    let got;
    try {
      got = sessionLoad(c.s);
    } catch (e) {
      problems.push(`"${c.name}" ném lỗi: ${e.message}`);
      continue;
    }
    if (got !== c.want) {
      problems.push(`"${c.name}" ra ${got} nhưng phải là ${c.want} — ${c.why}`);
    }
  }

  /* ── 2. the invariant the whole change rests on: ACWR is unit-free ──

     Every existing weight-training account has its readiness score computed
     from this ratio. If changing the unit moved the ratio, the change would
     silently re-score everybody. It does not, and this proves it by running a
     real window through `getACWR` at several scale factors. */
  {
    const acute = [120, 300, 80];
    const chronic = [120, 300, 80, 200, 150, 90, 240, 110];
    const sum = (xs) => xs.reduce((a, b) => a + b, 0);
    const base = ready(sum(acute), sum(chronic));
    if (!base) {
      problems.push('computeReadiness trả null trên đầu vào đầy đủ — bộ quét hỏng');
    } else {
      for (const k of [0.001, 0.5, 2, 37, 1000]) {
        const scaled = ready(sum(acute.map((x) => x * k)), sum(chronic.map((x) => x * k)));
        if (!scaled || Math.abs(scaled.acwr - base.acwr) > 1e-9) {
          problems.push(
            `ACWR đổi khi nhân mọi tải với ${k} (${base.acwr} → ${scaled?.acwr}) — nếu vậy thì việc ` +
              'đổi đơn vị tải sẽ chấm lại điểm sẵn sàng của MỌI người đang tập tạ, và các dải ' +
              '0.8–1.3 trong readiness-engine thôi còn nghĩa cũ',
          );
        }
        /* and the score itself, which is what a person actually sees */
        if (scaled && scaled.score !== base.score) {
          problems.push(
            `điểm sẵn sàng đổi từ ${base.score} sang ${scaled.score} chỉ vì nhân tải với ${k} — ` +
              'đổi đơn vị không được phép chấm lại điểm của ai',
          );
        }
      }
    }
  }

  /* ── 3. the window drops what it cannot measure, on both sides ── */
  {
    const weighted = { session_rpe: 8, sets: sets(10, 10, 10) };
    const run = { session_rpe: null, sets: [] };
    const only = loadWindow([weighted]);
    const withRuns = loadWindow([weighted, run, run, run]);
    if (only !== withRuns) {
      problems.push(
        `ba buổi chạy không đo được làm đổi tổng tải (${only} → ${withRuns}) — chúng phải bị BỎ ` +
          'khỏi tổng chứ không cộng vào 0, nếu không một tuần chạy bộ sẽ kéo trung bình mạn tính xuống',
      );
    }
    if (loadWindow([]) !== 0) problems.push('cửa sổ rỗng phải ra 0');
    if (loadWindow([run, run]) !== 0) problems.push('cửa sổ toàn buổi không đo được phải ra 0');
  }

  /* ── 4. and a bodyweight trainee now reaches the safety gate ──

     The end of the chain, run rather than reasoned about: their load is
     non-zero, so `computeLoadScore` scores it instead of returning null, which
     is what lets `acwr` exist, which is what lets `overreaching` fire, which is
     what closes the one gate that refuses to tell somebody in a load spike to
     add weight. */
  {
    const bodyweight = Array.from({ length: 12 }, () => ({
      session_rpe: 8,
      sets: sets(...Array(9).fill(10)),
    }));
    const load28 = loadWindow(bodyweight);
    const load7 = loadWindow(bodyweight.slice(0, 3));
    if (!(load28 > 0)) {
      problems.push('người tập tay không vẫn ra tải 28 ngày bằng 0 — cả chuỗi phía sau vẫn mù');
    }
    const r = ready(load7, load28);
    if (!r || !Number.isFinite(r.acwr) || r.acwr <= 0) {
      problems.push(`ACWR của người tập tay không ra ${r?.acwr} — vẫn không dùng được`);
    }
    if (!r || r.subscores?.load == null) {
      problems.push(
        'điểm sẵn sàng của người tập tay không VẪN không có thành phần tải — đây là đúng cái đầu ' +
          'kia của chuỗi, và nếu nó trống thì overreaching vẫn không bao giờ bật được cho họ',
      );
    }

    /* ── and the two links this comment used to only assert ──

       The paragraph above says the load reaching the engine "is what lets
       `overreaching` fire, which is what closes the one gate that refuses to
       tell somebody in a load spike to add weight". That was a sentence. The
       chain stopped at `subscores.load`, so the last two steps — the ones the
       whole change was for — were reasoned about and never run. That is the
       exact shape this repository has already been caught by twice: a comment
       describing a test that does not exist.

       So: give the same bodyweight trainee a genuine spike, take the `acwr` the
       engine returns, and walk it the rest of the way. */
    const spike = ready(loadWindow(bodyweight.slice(0, 3).map((s) => ({ ...s, session_rpe: 10 }))) * 2.2, load28);
    if (!spike || !(spike.acwr >= OVERREACH_ACWR)) {
      problems.push(
        `không dựng nổi một ca quá tải cho người tập tay không (acwr = ${spike?.acwr}, cần ≥ ` +
          `${OVERREACH_ACWR}) — bộ quét hỏng chứ không phải app đúng`,
      );
    } else {
      /* Enough history that the state engine is allowed to conclude anything at
         all, and a cadence that is otherwise unremarkable, so the only thing
         the verdict can be about is the load. */
      const today = '2025-06-30';
      const loggedDates = Array.from({ length: 40 }, (_, i) => {
        const d = new Date(`${today}T12:00:00.000Z`);
        d.setUTCDate(d.getUTCDate() - i);
        return d.toISOString().slice(0, 10);
      });
      const st = userStateFrom({ loggedDates, today, acwr: spike.acwr, sessions: [] });
      if (st.situation !== 'overreaching') {
        problems.push(
          `acwr ${spike.acwr} của người tập tay không ra trạng thái '${st.situation}' chứ không phải ` +
            "'overreaching' — mắt xích này đứt thì tải nội sinh tính ra cũng không tới được cổng an toàn",
        );
      }

      /* Reported effort well under target: on its own this is a clear "add
         load". The gate is the only reason it must not be. */
      const easy = [6, 6, 6, 6, 6, 6];
      const ungated = suggestLoad({ reported: easy, target: 9 }).advice;
      if (ungated !== 'up') {
        problems.push(
          `báo ${easy[0]} liên tục với mức đặt 9 mà KHÔNG ra 'up' (ra '${ungated}') — ca kiểm bên dưới ` +
            'chỉ có nghĩa nếu bản không có cổng chặn thật sự khuyên tăng tải',
        );
      }
      const gated = suggestLoad({
        reported: easy,
        target: 9,
        situation: st.situation,
        situationConfidence: st.confidence,
      }).advice;
      if (gated === 'up') {
        problems.push(
          'người tập tay không đang quá tải VẪN được khuyên tăng tải — đây là đầu cuối của cả chuỗi ' +
            'và là lời khuyên duy nhất trong app có thể góp phần gây chấn thương. Trước khi có tải ' +
            'nội sinh, nhóm này không bao giờ tới được cổng chặn này vì acwr của họ luôn là null',
        );
      }
    }
  }

  /* ── 5. totalReps, on its own ── */
  {
    if (totalReps(undefined) !== 0) problems.push('totalReps(undefined) phải là 0');
    if (totalReps([]) !== 0) problems.push('totalReps([]) phải là 0');
    if (totalReps([{ reps: '12' }]) !== 12) problems.push('reps dạng chuỗi (JSON) phải đọc được');
    if (RPE_MAX !== 10) problems.push(`RPE_MAX = ${RPE_MAX} — thang RPE dừng ở 10`);
  }

  /* ── 6. and the service really uses it ── */
  {
    const src = readFileSync(path.join(NATIVE, 'src/lib/daily-log-service.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    if (/trainingLoad(7|28)d\s*=\s*load\d+d\?\.reduce/.test(src)) {
      problems.push(
        'daily-log-service vẫn cộng volume_load cho tải tập luyện — tấn tạ là chỉ số NGOẠI SINH và ' +
          'bằng 0 với mọi buổi không có tạ',
      );
    }
    if (!/loadWindow\(/.test(src)) {
      problems.push('daily-log-service không gọi loadWindow — luật ở trên không nói gì về app nữa');
    }
    /* the chronic span must describe the same sessions the sum contains, or a
       sum from three weighted sessions gets divided by a span reaching back to
       a run four weeks ago */
    if (!/sessionLoad\(row\) != null/.test(src) || !/chronicDays\(measured28d\)/.test(src)) {
      problems.push(
        'nhịp mạn tính không lọc theo cùng phép đo với tổng tải — chia một tổng của ba buổi tạ cho ' +
          'một khoảng kéo ngược tới buổi chạy bốn tuần trước sẽ ra một cú vọt giả',
      );
    }
    /* tonnage must survive as its own metric — the brief forbids collapsing
       strength and cardio into one invented score */
    if (!/volume_load/.test(src)) {
      problems.push('daily-log-service không còn ghi volume_load — tấn tạ phải ở lại như một chỉ số riêng');
    }
  }

  /* ── 7. and the training card's pair is a pair about its own verdict ──

     Found in the second audit of this very change, and it is the same fault the
     card was fixed for once already. The card's stated purpose is that the two
     figures it prints divide to the percentage printed above them. That
     percentage comes from `acwr`, which is now the *internal* load ratio; the
     figures were tonnage. A bodyweight trainee would have read "18% heavier
     than your habit" directly above **0 kg / 0 kg**.

     So the pair is the load pair and tonnage rides along as a labelled
     sub-line — a real quantity, simply not the one the sentence is about. */
  {
    const card = readFileSync(path.join(NATIVE, 'src/components/ascnd/today-widgets-2.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    if (!/const weekLoad = loadWindow\(/.test(card) || !/const habitLoad = averageWeek\(/.test(card)) {
      problems.push(
        'thẻ tập luyện không tính cặp số theo tải nội sinh — câu "nặng hơn X%" lấy từ acwr (tải nội ' +
          'sinh) mà hai con số bên dưới lại là tấn tạ, nên người tập tay không đọc được "nặng hơn ' +
          '18%" ngay trên "0 kg / 0 kg"',
      );
    }
    /* the verdict and the pair must come from the same quantity */
    const pairIsTonnage = /compareValue}>\{kg\(weekVolume\)\}/.test(card);
    if (pairIsTonnage) {
      problems.push('cặp số của thẻ vẫn là tấn tạ trong khi lời phán quyết là về tải nội sinh');
    }
    /* and tonnage must not vanish — it is readable and real */
    if (!/kg\(weekVolume\)/.test(card)) {
      problems.push('tấn tạ biến mất khỏi thẻ — nó là một đại lượng thật và dễ đọc, chỉ là không phải thứ câu kia nói về');
    }
  }

  if (problems.length) {
    console.log('tải buổi tập CÓ LỖI:\n');
    for (const p of problems.slice(0, 12)) console.log(`  • ${p}`);
    if (problems.length > 12) console.log(`  … và ${problems.length - 12} lỗi nữa`);
    process.exit(1);
  }

  console.log(
    `tải buổi tập OK — ${CASES.length} ca có đáp án cụ thể đều đúng. Tải nội sinh = RPE × tổng reps ` +
      '(phương pháp session-RPE), tính từ dữ liệu ĐÃ LƯU nên không cần migration: buổi tay không 9×10 ' +
      'reps ở RPE 8 giờ ra 720 thay vì 0 — theo tấn tạ thì buổi đó bằng 0 và số 0 ấy lan xuống điểm ' +
      'sẵn sàng, acwr, overreaching và cổng an toàn của gợi ý tăng tải. Buổi không đo được trả null ' +
      'chứ KHÔNG phải 0, và bị bỏ khỏi cả hai vế của tỉ lệ (ba buổi chạy không làm đổi tổng). ' +
      'ACWR được CHẠY THẬT qua 5 hệ số nhân và không đổi — đó là lý do đổi đơn vị không chấm lại điểm ' +
      'sẵn sàng của người đang tập tạ, và các dải 0.8–1.3 giữ nguyên nghĩa. Nhịp mạn tính lọc theo cùng ' +
      'phép đo với tổng. Và tấn tạ VẪN ở lại như một chỉ số ngoại sinh riêng, không bị gộp. Cả chuỗi ' +
      'được CHẠY tới đầu cuối chứ không chỉ tới acwr: buổi tay không → tải > 0 → điểm sẵn sàng có ' +
      'thành phần tải → acwr vượt ngưỡng → userStateFrom ra "overreaching" → suggestLoad TỪ CHỐI ' +
      'khuyên tăng tải (cùng đầu vào mà bỏ trạng thái đi thì nó khuyên "up", nên ca kiểm có răng). ' +
      'Hai mắt xích cuối trước đây chỉ được KHẲNG ĐỊNH trong một dòng chú thích — đúng hình dạng ' +
      '"chú thích mô tả một bài kiểm không tồn tại" mà repo này đã dính hai lần',
  );
} finally {
  rmSync(out, { recursive: true, force: true });
}
