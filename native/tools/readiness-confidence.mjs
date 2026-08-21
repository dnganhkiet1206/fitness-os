/**
 * Missing data must not become reassurance, a thin number must not wear a thick
 * one's confidence, and a recovery question must not be asked of a number that
 * measured no recovery.
 *
 * ── the two faults this was written for ──
 *
 * **1. `acwr` was never null.** `getACWR(0, 0, …)` returns `0`, so an account
 * that had never logged a session stored exactly what somebody who trained hard
 * for a month and then took a full rest week stored. Those are opposite states —
 * *nothing is known* against *thoroughly rested* — and the app had given the
 * missing one a number, which is a claim.
 *
 * That is precisely the shape this repository keeps finding: `acwr ?? 0`,
 * `meals?.length ?? 0`, an unread day scored as an empty one. The absent value
 * gets a numeral, the numeral gets used, and nothing anywhere reports a fault.
 *
 * **2. The score carried no trace of how thin it was.** The engine drops the
 * dimensions it cannot measure and renormalises the rest, which is right. But it
 * meant a readiness of 72 built from sleep alone rendered identically to a 72
 * built from HRV, resting heart rate, sleep and training load. This is the
 * screen on which somebody decides whether to train hard today.
 *
 * ── and why the banding lives in one place ──
 *
 * The engine knows the dimension count directly; the dashboard recovers it from
 * `readiness_explain`. Two routes to the same count, so the *banding* must not
 * be typed twice — a threshold copied is a threshold that drifts, six times
 * over in this repository. `readinessConfidence` is exported and both call it.
 *
 * ══ Chain AH added the four below ══
 *
 * **BUG-108.** Nulling the ratio was only half the job. `green_watch` was the
 * fallthrough from `acwr != null && acwr <= 1.2`, so a **null** ratio — which
 * fails that test — landed on copy reading *"Theo dõi khối lượng — ACWR hơi
 * cao."* Measured: 520 minutes asleep and nothing else scores 92, status green,
 * `acwr` null, and the app told that person their ACWR was high. It had never
 * computed one. The very fault section 1 exists for, one branch further down.
 *
 * **BUG-109 / BUG-110.** `readiness_score` and `readiness_status` cross every
 * consumer boundary carrying no record of what produced them. For somebody with
 * a heavy 28-day base and one small session in the last week — measured in all
 * six timezones:
 *
 *     45 · red · acwr 0.01 · explain "load:45"
 *
 * ACWR **0.01**. Nothing about their sleep, heart rate or HRV was measured at
 * all. Two screens then read that red as a recovery failure: weekly-review
 * offered *"Cân nhắc tuần deload: giảm 40-50% volume"* three lines under its own
 * *"ACWR thấp. Có thể tăng 10-15% volume"*, and `suggestLoad` turned an `up`
 * into a `hold` over *"điểm sẵn sàng hôm nay đang đỏ"*. Both told somebody who
 * is barely training to train less. The confidence chip already knew — it is
 * the only consumer that did.
 *
 * **BUG-111.** And the chip itself counted a tile it never drew: `hrv` was
 * parsed out of the token, counted, and dropped before the tile row, so
 * `"hrv:50"` rendered as *"Dựa trên 1 chỉ số đo được"* above nothing.
 *
 * ── what this file runs ──
 *
 * Sections 1–8 drive the **real** `computeReadiness`, `readinessConfidence`,
 * `hasRecoverySignal`, `deloadWarranted` and `suggestLoad` in process. Section
 * 10 drives the real `recomputeDailyLog` against a **real PostgreSQL 16.13**
 * built from every migration, in six timezones including both DST days, scored
 * by an oracle that states component availability from the raw rows and never
 * reads `daily_logs`. If PostgreSQL or `pg` is missing that half **skips
 * loudly**; everything above it still runs.
 */import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(NATIVE, '..');
const out = mkdtempSync(path.join(tmpdir(), 'readyconf-'));
const problems = [];
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const want = (ok, message) => { if (!ok) problems.push(message); };

try {
  try {
    execFileSync(
      'npx',
      ['tsc', 'src/lib/readiness-engine.ts', 'src/lib/readiness-i18n.ts', 'src/lib/training-card.ts',
       'src/lib/local-date.ts', 'src/lib/readiness-week.ts', 'src/lib/load-progression.ts',
       'src/lib/goal-training.ts', 'src/lib/prescription.ts', 'src/lib/user-state.ts',
       '--ignoreConfig', '--outDir', out,
       '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
      { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch {
    /* no project tsconfig here — tsc exits non-zero over the `@/` mapping and
       still emits, which is all this uses */
  }
  const req = createRequire(import.meta.url);
  /* `@/lib/x` has no mapping outside the project tsconfig; the emit keeps the
     specifier verbatim, and everything here lands in one flat directory. */
  for (const f of readdirSync(out).filter((f) => f.endsWith('.js'))) {
    const p = path.join(out, f);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/require\("@\/lib\/(.*?)"\)/g, 'require("./$1")'));
  }
  const { computeReadiness, readinessConfidence } = req(path.join(out, 'readiness-engine.js'));
  const { readinessSubscores, hasRecoverySignal, RECOVERY_COMPONENTS, readinessRecoText } =
    req(path.join(out, 'readiness-i18n.js'));
  const { deloadWarranted, recoveryBackedDays } = req(path.join(out, 'readiness-week.js'));
  const { suggestLoad } = req(path.join(out, 'load-progression.js'));
  if (typeof hasRecoverySignal !== 'function' || typeof deloadWarranted !== 'function'
      || typeof suggestLoad !== 'function') {
    console.error('tự kiểm hỏng: không nạp được hasRecoverySignal/deloadWarranted/suggestLoad thật — đừng tin kết quả');
    process.exit(1);
  }

  /** Everything absent unless named, so each case says exactly what it has. */
  const run = (over) =>
    computeReadiness({
      hrv_today: undefined,
      hrv_history_28d: [],
      rhr_today: undefined,
      rhr_history_28d: [],
      sleep_min_lastnight: undefined,
      sleep_target_min: 480,
      sleep_debt_7d_min: 0,
      training_load_7d: 0,
      training_load_28d: 0,
      training_days_28d: 28,
      ...over,
    });

  const FULL = {
    hrv_today: 60,
    hrv_history_28d: [58, 60, 62, 59, 61, 60],
    rhr_today: 55,
    rhr_history_28d: [55, 56, 54, 55, 57],
    sleep_min_lastnight: 450,
    training_load_7d: 2400,
    training_load_28d: 9000,
  };

  /* ── 1. no chronic base → acwr is null, never 0 ── */
  {
    const fresh = run({ sleep_min_lastnight: 450 });
    if (!fresh) {
      problems.push('một tài khoản chỉ có giấc ngủ mà computeReadiness trả null — bộ quét hỏng');
    } else if (fresh.acwr !== null) {
      problems.push(
        `tài khoản chưa từng ghi buổi tập nào ra acwr = ${fresh.acwr} thay vì null. 0 là một KHẲNG ĐỊNH ` +
          '— nó nói "tuần này không tập, so với nền của bạn" — còn ở đây không có nền nào cả. ' +
          'Chính là hình dạng `acwr ?? 0` mà repo này đã sửa nhiều lần: thiếu dữ liệu được gán một ' +
          'con số, con số đó được dùng, và không đâu báo lỗi',
      );
    }
  }

  /* ── 2. …and 0 keeps its real meaning when a base exists ──

     A full rest week after a month of training is a fact worth having, and it
     must not be collapsed into the same value as an empty account. */
  {
    const rested = run({ ...FULL, training_load_7d: 0, training_load_28d: 9000 });
    if (!rested || rested.acwr !== 0) {
      problems.push(
        `một tuần nghỉ hoàn toàn SAU một tháng tập ra acwr = ${rested?.acwr} thay vì 0 — đây là một ` +
          'trạng thái có thật (nghỉ ngơi đầy đủ) và phải phân biệt được với tài khoản trống',
      );
    }
  }

  /* ── 3. confidence tracks the number of dimensions, and only that ──

     `dims` is what the case *intends* to supply, and it is checked against what
     the engine actually measured before the confidence is judged. Without that
     step this section grades itself: the first draft handed resting heart rate
     a three-reading baseline, the engine correctly refused it (a median and a
     MAD need five), and the case then failed as though the *banding* were
     wrong. A fixture that quietly supplies less than it claims turns every
     assertion below it into a statement about nothing — the same shape as the
     product bugs this repository keeps finding, in the tool meant to catch
     them. Checking the measured count separately also catches the opposite
     fault, an engine that silently stops scoring a dimension it used to. */
  {
    const RHR_BASE = [55, 56, 54, 55, 57];
    const CASES = [
      { name: 'chỉ có giấc ngủ', over: { sleep_min_lastnight: 450 }, want: 'low', dims: 1 },
      {
        name: 'giấc ngủ + nhịp nghỉ',
        over: { sleep_min_lastnight: 450, rhr_today: 55, rhr_history_28d: RHR_BASE },
        want: 'medium',
        dims: 2,
      },
      {
        name: 'giấc ngủ + nhịp nghỉ + tải',
        over: {
          sleep_min_lastnight: 450,
          rhr_today: 55,
          rhr_history_28d: RHR_BASE,
          training_load_7d: 2400,
          training_load_28d: 9000,
        },
        want: 'high',
        dims: 3,
      },
      { name: 'đủ bốn chiều', over: FULL, want: 'high', dims: 4 },
    ];
    for (const c of CASES) {
      const r = run(c.over);
      if (!r) {
        problems.push(`"${c.name}" trả null — phải có điểm`);
        continue;
      }
      const measured = Object.values(r.subscores).filter((v) => v !== undefined).length;
      if (measured !== c.dims) {
        problems.push(
          `"${c.name}" định cấp ${c.dims} chiều nhưng engine chỉ chấm được ${measured} — hoặc dữ liệu ` +
            'mẫu thiếu (một baseline nhịp tim cần 5 lần đo, không phải 3), hoặc engine đã lặng lẽ bỏ ' +
            'chấm một chiều nó từng chấm. Cả hai đều khiến các khẳng định bên dưới nói về một thứ khác',
        );
        continue;
      }
      if (r.confidence !== c.want) {
        problems.push(
          `"${c.name}" (${c.dims} chiều) ra độ tin cậy '${r.confidence}' nhưng phải là '${c.want}' — ` +
            'một điểm dựng từ MỘT phép đo không được trông giống hệt một điểm dựng từ bốn',
        );
      }
      /* and the dashboard recovers the same count from the stored token */
      const recovered = Object.keys(readinessSubscores(r.explainToken)).length;
      if (readinessConfidence(recovered) !== r.confidence) {
        problems.push(
          `"${c.name}": engine nói '${r.confidence}' còn màn hình đọc lại từ readiness_explain ra ` +
            `'${readinessConfidence(recovered)}' (${recovered} chiều) — hai đường tới cùng một con số ` +
            'mà không khớp, tức người dùng thấy một mức tin cậy khác với mức engine đã tính',
        );
      }
    }
  }

  /* ── 4. a thin score is still a real score ──

     The opposite failure, and the tempting one: refusing to score at all until
     everything is measured would leave most people with a blank gauge for
     weeks. Thin is fine; thin *pretending to be thick* is not. */
  {
    const thin = run({ sleep_min_lastnight: 450 });
    if (!thin || typeof thin.score !== 'number' || thin.score <= 0) {
      problems.push('một chỉ số đo được vẫn phải ra một điểm thật — từ chối chấm là bỏ trống màn hình hàng tuần');
    }
    const nothing = run({});
    if (nothing !== null) {
      problems.push(
        `không đo được gì mà vẫn ra điểm (${nothing?.score}) — không dữ liệu thì phải là null, ` +
          'chứ một số 0 đỏ chót là lời khẳng định sai về cơ thể người ta',
      );
    }
  }

  /* ── 5. the banding is a ladder and has no gaps ── */
  {
    for (const n of [0, 1, 2, 3, 4, 9]) {
      const c = readinessConfidence(n);
      if (!['low', 'medium', 'high'].includes(c)) {
        problems.push(`readinessConfidence(${n}) ra '${c}' — ngoài ba mức`);
      }
    }
    if (readinessConfidence(1) !== 'low' || readinessConfidence(2) !== 'medium' || readinessConfidence(3) !== 'high') {
      problems.push('thang độ tin cậy không còn là 1 → low, 2 → medium, 3+ → high');
    }
  }

  /* ── 6. and the gauge really says it ── */
  {
    const gauge = readFileSync(path.join(NATIVE, 'src/components/ascnd/readiness-gauge.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    if (!/readinessConfidence\(/.test(gauge)) {
      problems.push(
        'gauge không gọi readinessConfidence — hoặc nó không nói gì về độ tin cậy, hoặc nó tự gõ lại ' +
          'ngưỡng, và ngưỡng gõ lại là ngưỡng sẽ lệch',
      );
    }
    if (/confidence !== 'high'/.test(gauge) === false) {
      problems.push('gauge không ẩn dòng độ tin cậy khi đã đủ chiều — một dòng luôn hiện là một dòng thôi được đọc');
    }
    /* BUG-111: the chip counts Object.keys(subs), so every key it can count has
       to have a tile. hrv was parsed, counted, and never drawn. */
    if (!/subs\.hrv != null/.test(gauge) || !/label: 'HRV'/.test(gauge)) {
      problems.push(
        "gauge không vẽ ô HRV — chip vẫn đếm nó, nên explain 'hrv:50' hiện 'Dựa trên 1 chỉ số đo được' " +
          'phía trên một hàng ô trống, đúng thứ false precision mà chip sinh ra để bỏ (BUG-111)',
      );
    }
    if (!/const measured = Object\.keys\(subs\)\.length/.test(gauge)) {
      problems.push('chip không còn đếm từ chính subs mà các ô được vẽ ra — hai bên lại có thể lệch nhau');
    }
    for (const key of ['hrv', 'rhr', 'sleep', 'load']) {
      const drawn = new RegExp('subs\\.' + key + ' != null').test(gauge);
      if (!drawn) {
        problems.push(
          'gauge không vẽ ô cho ' + key + ' — readinessSubscores trả về nó và chip đếm nó, nên số ' +
            'chỉ số công bố sẽ lớn hơn số ô hiện ra',
        );
      }
    }
  }


  /* ── 7. BUG-108: the ACWR recommendation branches, all five ──

     Driven through the real engine rather than through fixtures, because the
     point is the *branch* and the loads can be stated exactly here. `acwr` is
     null for one reason only — `training_load_28d` is 0 — which is the same
     condition that makes `loadScore` null, so "green with a null ratio" is
     precisely "green, and no training was logged". */
  {
    const SLEEPY = { sleep_min_lastnight: 560, rhr_today: 55, rhr_history_28d: [55, 56, 54, 55, 57] };
    const BRANCHES = [
      {
        name: 'xanh, acwr chưa tính được',
        over: { ...SLEEPY, training_load_7d: 0, training_load_28d: 0 },
        status: 'green', acwr: null, key: 'green_no_load',
      },
      {
        name: 'xanh, acwr <= 1.2',
        over: { ...SLEEPY, training_load_7d: 2250, training_load_28d: 9000 },
        status: 'green', acwr: 'number', key: 'green_optimal',
      },
      {
        /* acwr = 4·load7d/load28d, so 2813/9000 is 1.25 — just over the 1.2 the
           branch turns on, and still inside the 0.8–1.3 band that scores 80, so
           the day stays green and the branch is the thing being measured. */
        name: 'xanh, acwr > 1.2',
        over: { ...SLEEPY, training_load_7d: 2813, training_load_28d: 9000 },
        status: 'green', acwr: 'number', key: 'green_watch',
      },
      {
        name: 'vàng, acwr chưa tính được',
        over: { sleep_min_lastnight: 330, training_load_7d: 0, training_load_28d: 0 },
        status: 'yellow', acwr: null, key: null,
      },
      {
        name: 'đỏ, acwr chưa tính được',
        over: { sleep_min_lastnight: 130, training_load_7d: 0, training_load_28d: 0 },
        status: 'red', acwr: null, key: null,
      },
    ];
    for (const b of BRANCHES) {
      const r = run(b.over);
      if (!r) { problems.push(`nhánh "${b.name}" trả null — bộ quét lạc mục tiêu`); continue; }
      if (r.status !== b.status) {
        problems.push(
          `nhánh "${b.name}" ra trạng thái '${r.status}' chứ không phải '${b.status}' (điểm ${r.score}) — ` +
            'dữ liệu mẫu không còn dựng ra nhánh nó định dựng, mọi khẳng định dưới đây nói về thứ khác',
        );
        continue;
      }
      if (b.acwr === null && r.acwr !== null) {
        problems.push(`nhánh "${b.name}" ra acwr = ${r.acwr} chứ không phải null`);
        continue;
      }
      if (b.acwr === 'number' && typeof r.acwr !== 'number') {
        problems.push(`nhánh "${b.name}" không ra acwr số — không kiểm được nhánh`);
        continue;
      }
      if (b.key && r.recommendationKey !== b.key) {
        problems.push(
          `nhánh "${b.name}" ra khoá '${r.recommendationKey}' chứ không phải '${b.key}'` +
            (b.key === 'green_no_load'
              ? " — acwr chưa đo được lại rơi vào lời khuyên nói ACWR CAO, về đúng một tỉ số app chưa từng tính (BUG-108)"
              : ' — hai nhánh có acwr đo được phải giữ nguyên khoá cũ của chúng'),
        );
      }
      /* and no branch with a null ratio may make a claim about one */
      if (r.acwr === null) {
        for (const lang of ['vi', 'en']) {
          const text = readinessRecoText(r.recommendationKey, lang);
          if (/hơi cao|a bit high|ACWR cao/.test(text)) {
            problems.push(
              `nhánh "${b.name}" (acwr null) hiện câu "${text}" — một khẳng định về tỉ số chưa được tính (BUG-108)`,
            );
          }
        }
      }
    }
    /* the copy has to exist, or the gauge renders the raw key */
    for (const lang of ['vi', 'en']) {
      const t = readinessRecoText('green_no_load', lang);
      if (!t || t === 'green_no_load') {
        problems.push(`READINESS_RECO thiếu bản ${lang} cho green_no_load — gauge sẽ hiện nguyên khoá thô`);
      }
    }
  }

  /* ── 8. BUG-109/110: what counts as a recovery measurement ──

     The predicate reads a string that a database wrote, so the hostile cases
     are the point: absent, empty, old prose, an unknown key, a duplicated key,
     a number long enough to overflow. None may throw, and none may invent a
     recovery signal. */
  {
    const HOSTILE = [
      ['rỗng', '', false],
      ['null', null, false],
      ['undefined', undefined, false],
      ['rác', 'khong-phai-token', false],
      ['văn xuôi cũ', 'HRV: thấp (30) · Giấc ngủ: kém (20)', false],
      ['điểm phi số', 'hrv:abc|sleep:def', false],
      ['khoá lạ', 'foo:50|bar:60', false],
      ['chỉ tải', 'load:45', false],
      ['tải + khoá lạ', 'load:45|foo:99', false],
      ['khoá trùng, phục hồi', 'sleep:10|sleep:90', true],
      ['khoá trùng, tải', 'load:10|load:90', false],
      ['ngủ lẫn rác', 'zzz|sleep:40|', true],
      ['dấu phân cách lạ', 'sleep=40', false],
      ['khoảng trắng quanh khoá', ' sleep:40 ', false],
      ['tải khổng lồ', 'load:' + '9'.repeat(400), false],
      ['ngủ khổng lồ', 'sleep:' + '9'.repeat(400), true],
      ['hrv một mình', 'hrv:50', true],
      ['rhr một mình', 'rhr:50', true],
      ['bốn chiều', 'hrv:50|rhr:50|sleep:65|load:80', true],
    ];
    for (const [label, stored, expectRecovery] of HOSTILE) {
      let got = null; let threw = null;
      try { got = hasRecoverySignal(stored); } catch (e) { threw = String(e.message).slice(0, 60); }
      if (threw !== null) {
        problems.push(`hasRecoverySignal("${label}") NÉM: ${threw} — một hàng cũ đọc không được phải là false, không phải một màn hình trắng`);
      } else if (got !== expectRecovery) {
        problems.push(
          `hasRecoverySignal("${label}") ra ${got}, đáng lẽ ${expectRecovery}` +
            (expectRecovery === false
              ? ' — một chuỗi KHÔNG có phép đo phục hồi vừa được đọc là có, tức lời khuyên deload và ' +
                'cổng giữ tải lại bắn cho người chỉ ghi buổi tập (BUG-109/110)'
              : ' — một phép đo phục hồi CÓ THẬT bị bỏ, tức cảnh báo đúng bị chặn'),
        );
      }
    }
    if (RECOVERY_COMPONENTS.length !== 3 || RECOVERY_COMPONENTS.includes('load')) {
      problems.push(
        `RECOVERY_COMPONENTS = ${JSON.stringify(RECOVERY_COMPONENTS)} — phục hồi là ba phép đo ` +
          '(hrv, rhr, sleep) và tải tập KHÔNG phải một trong số đó: đó chính là BUG-109/110',
      );
    }
    /* and the deload gate, with the mean and the threshold held exactly still */
    const D = (explains) => explains.map((e) => ({ readiness_score: 45, readiness_explain: e }));
    const GATES = [
      ['A · ba ngày chỉ có tải', ['load:45', 'load:45', 'load:45'], false],
      ['B · ba ngày chỉ có giấc ngủ', ['sleep:30', 'sleep:30', 'sleep:30'], true],
      ['C · ba ngày chỉ có sinh trắc', ['hrv:30|rhr:35', 'hrv:30|rhr:35', 'hrv:30|rhr:35'], true],
      ['D · ba ngày trộn tải + phục hồi', ['sleep:30|load:45', 'hrv:30|load:45', 'rhr:30|load:45'], true],
      ['E · hai ngày có phục hồi, một ngày chỉ tải', ['sleep:30', 'sleep:30', 'load:45'], false],
      ['E · một ngày có phục hồi', ['sleep:30', 'load:45', 'load:45'], false],
    ];
    for (const [label, explains, expect] of GATES) {
      const logs = D(explains);
      const got = deloadWarranted(logs, 45, 3);
      if (got !== expect) {
        problems.push(
          `cổng deload "${label}" ra ${got}, đáng lẽ ${expect} (ngày có phục hồi = ${recoveryBackedDays(logs)})` +
            (expect === false
              ? ' — "giảm 40-50% volume" nói với người mà app chưa đo được gì về phục hồi (BUG-109)'
              : ' — một cảnh báo deload ĐÚNG vừa bị chặn'),
        );
      }
    }
    /* the two numbers this round must not have moved */
    if (deloadWarranted(D(['sleep:30', 'sleep:30', 'sleep:30']), 50, 3) !== false) {
      problems.push('ngưỡng trung bình < 50 đã đổi — vòng này KHÔNG được đụng vào nó');
    }
    if (deloadWarranted(D(['sleep:30', 'sleep:30']), 45, 2) !== false) {
      problems.push('ngưỡng "đủ 3 ngày có điểm" đã đổi — vòng này KHÔNG được đụng vào nó');
    }
    /* a day with no score is not a day with a recovery measurement */
    const withNull = [{ readiness_score: null, readiness_explain: 'sleep:30' }];
    if (recoveryBackedDays(withNull) !== 0) {
      problems.push('một ngày KHÔNG có điểm sẵn sàng vẫn được đếm là ngày có đo phục hồi — nó không nằm trong trung bình, nên nó không được mở cổng cho trung bình');
    }
  }

  /* ── 9. BUG-110: the red hold, through the real suggestLoad ──

     Reported effort far below target, which is the branch that can say "up".
     Only the red gate may move; everything else stays where it was. */
  {
    const light = { reported: [5, 5, 5, 5, 5], target: 8, goal: 'strength' };
    const CASES = [
      ['đỏ chỉ từ tải', { ...light, readiness: 'red', readinessExplain: 'load:45' }, 'up'],
      ['đỏ từ giấc ngủ', { ...light, readiness: 'red', readinessExplain: 'sleep:20' }, 'hold'],
      ['đỏ từ sinh trắc', { ...light, readiness: 'red', readinessExplain: 'hrv:20|rhr:25' }, 'hold'],
      ['đỏ trộn', { ...light, readiness: 'red', readinessExplain: 'sleep:20|load:45' }, 'hold'],
      ['không có điểm', { ...light }, 'up'],
      ['điểm null tường minh', { ...light, readiness: null, readinessExplain: null }, 'up'],
      ['xanh', { ...light, readiness: 'green', readinessExplain: 'sleep:90|load:80' }, 'up'],
      ['vàng', { ...light, readiness: 'yellow', readinessExplain: 'sleep:60|load:65' }, 'up'],
    ];
    for (const [label, input, wantAdvice] of CASES) {
      const got = suggestLoad(input).advice;
      if (got !== wantAdvice) {
        problems.push(
          `suggestLoad "${label}" ra '${got}', đáng lẽ '${wantAdvice}'` +
            (label === 'đỏ chỉ từ tải'
              ? ' — điểm đỏ dựng từ MỖI tải tập vẫn chặn lời khuyên tăng tải, tức chặn đúng ở người ' +
                'mà vấn đề đo được duy nhất là tập quá ít (BUG-110)'
              : ' — nhánh này KHÔNG được đổi trong vòng này'),
        );
      }
    }
    /* the safety direction is untouched: too heavy still eases off */
    const heavy = suggestLoad({ reported: [10, 10, 10], target: 7, readiness: 'red', readinessExplain: 'load:45' });
    if (heavy.advice !== 'down') {
      problems.push(`suggestLoad: buổi quá nặng ra '${heavy.advice}' chứ không phải 'down' — cổng đỏ đã ăn sang nhánh khác`);
    }
    /* the other two gates keep their own reasons */
    const over = suggestLoad({ ...light, situation: 'overreaching', situationConfidence: 'high' });
    if (over.advice !== 'hold') {
      problems.push(`suggestLoad: 'overreaching' ra '${over.advice}' chứ không phải 'hold' — cổng an toàn khác vừa mất`);
    }
  }

  /* ── 10. structural: one definition, and it lives in code ──

     Comments are stripped first, so a predicate described in prose satisfies
     none of this. */
  {
    const i18nSrc = strip(readFileSync(path.join(NATIVE, 'src/lib/readiness-i18n.ts'), 'utf8'));
    const engine = strip(readFileSync(path.join(NATIVE, 'src/lib/readiness-engine.ts'), 'utf8'));
    const week = strip(readFileSync(path.join(NATIVE, 'src/lib/readiness-week.ts'), 'utf8'));
    const prog = strip(readFileSync(path.join(NATIVE, 'src/lib/load-progression.ts'), 'utf8'));
    const review = strip(readFileSync(path.join(NATIVE, 'src/app/weekly-review.tsx'), 'utf8'));
    const logw = strip(readFileSync(path.join(NATIVE, 'src/app/log-workout.tsx'), 'utf8'));

    const fn = i18nSrc.match(/export function hasRecoverySignal[\s\S]*?\n}/)?.[0] ?? '';
    want(fn !== '', 'không tìm thấy hasRecoverySignal trong mã — bộ dò lạc mục tiêu, đừng tin phần còn lại');
    want(
      /readinessSubscores\(/.test(fn) && /RECOVERY_COMPONENTS/.test(fn),
      'hasRecoverySignal không còn dựng trên readinessSubscores + RECOVERY_COMPONENTS — nó vừa trở thành ' +
        'ĐỊNH NGHĨA THỨ HAI về chuỗi explain, đúng lớp lỗi repo này đã dính sáu lần',
    );

    /* BUG-108, in the source: the null test exists and comes first */
    const iNull = engine.search(/status === 'green' && acwr == null/);
    const iOpt = engine.search(/status === 'green' && acwr != null && acwr <= 1\.2/);
    const iWatch = engine.search(/recommendationKey = 'green_watch'/);
    want(iNull !== -1, "readiness-engine không còn nhánh riêng cho green + acwr null — acwr chưa tính được " +
      "sẽ lại rơi vào green_watch và app nói 'ACWR hơi cao' về một tỉ số nó chưa từng tính (BUG-108)");
    want(iOpt !== -1, 'readiness-engine không còn nhánh green_optimal với acwr đo được');
    want(iNull !== -1 && iOpt !== -1 && iNull < iOpt,
      'nhánh acwr null không còn đứng TRƯỚC nhánh acwr <= 1.2 — thứ tự chính là phép sửa');
    want(iNull !== -1 && iWatch !== -1 && iNull < iWatch,
      'nhánh acwr null không còn đứng trước green_watch — null lại chảy vào lời khuyên "ACWR hơi cao"');

    /* BUG-109, in the source */
    want(/recoveryBackedDays\(logs\) >= 3/.test(week),
      'deloadWarranted không còn đòi 3 ngày CÓ ĐO phục hồi — cảnh báo deload lại bắn cho người ACWR 0.01 (BUG-109)');
    want(/avgReadiness < 50/.test(week) && /readinessDays >= 3/.test(week),
      'ngưỡng cũ (trung bình < 50, đủ 3 ngày có điểm) đã bị đổi — vòng này KHÔNG được đụng vào chúng');
    want(/hasRecoverySignal\(/.test(week), 'readiness-week không còn gọi hasRecoverySignal');
    want(/deloadWarranted\(/.test(review),
      'weekly-review không còn hỏi deloadWarranted — cổng deload đã quay về ngưỡng trần');
    want(/readiness_explain/.test(review),
      'weekly-review không còn lấy readiness_explain về — vị từ phục hồi sẽ luôn thấy undefined và im lặng ' +
        'chặn MỌI cảnh báo deload, kể cả cái đúng');

    /* BUG-110, in the source */
    want(/input\.readiness === 'red' && hasRecoverySignal\(input\.readinessExplain\)/.test(prog),
      "load-progression giữ nguyên 'red → hold' mà không hỏi có đo phục hồi không — lời khuyên tăng tải " +
        'bị chặn đúng ở người cần tăng (BUG-110)');
    want(/readinessExplain: /.test(logw),
      'log-workout không còn truyền readinessExplain vào suggestLoad — cổng đỏ sẽ luôn thấy undefined');

    /* nobody reads the token by hand */
    for (const [name, src] of [['weekly-review', review], ['load-progression', prog],
      ['log-workout', logw], ['readiness-week', week]]) {
      const adhoc = /readiness_?[eE]xplain[\s\S]{0,220}?\.(?:includes|indexOf|split|match|startsWith)\(/.test(src)
        || /(?:test|match)\([^)]*(?:hrv|rhr|sleep)\s*:/.test(src);
      want(!adhoc,
        `${name}: đọc chuỗi readiness_explain bằng tay thay vì qua parser chính tắc — định nghĩa thứ hai về ` +
          '"thế nào là phục hồi" sẽ lệch khỏi cái thật mà không có triệu chứng');
    }
  }


  /* ── 11. the same rules, end to end, on a real database ──

     Everything above drives the functions directly. This drives the real
     `recomputeDailyLog` against a real PostgreSQL built from every migration,
     so what `hasRecoverySignal` reads is a string the app actually wrote rather
     than one this file typed. The oracle states component availability from the
     raw rows and never reads `daily_logs`. Six timezones, both DST days, and a
     thousand randomized states in each. */
  const PGBIN = ['/usr/lib/postgresql/16/bin', '/usr/lib/postgresql/15/bin', '/usr/local/pgsql/bin']
    .find((d) => existsSync(path.join(d, 'initdb'))) ?? null;
  const PGCLIENT = path.join(NATIVE, 'node_modules', 'pg');

  if (!PGBIN || !existsSync(PGCLIENT)) {
    console.log(
      'độ tin cậy điểm sẵn sàng: BỎ QUA phần cơ sở dữ liệu — không có PostgreSQL hoặc client pg.\n' +
        '  Mọi phần chạy thẳng hàm và phần cấu trúc đã chạy. Một phép thử im lặng không chạy còn tệ hơn không có phép thử.',
    );
  } else {
    const pgOut = mkdtempSync(path.join(tmpdir(), 'rconf-pg-'));
    const PORT = 20000 + (Array.from(pgOut).reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 9000, 617));
    const DATA = path.join(pgOut, 'pg');
    const sh = (cmd) => {
      try { return { code: 0, text: execFileSync('bash', ['-lc', cmd], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
      catch (e) { return { code: e.status ?? 1, text: (e.stdout || '') + (e.stderr || '') }; }
    };
    const stopPg = () => sh(`su postgres -c "${PGBIN}/pg_ctl -D ${DATA} stop -m immediate" 2>/dev/null`);
    try {
      mkdirSync(DATA, { recursive: true });
      sh(`chmod 755 ${pgOut} && chown postgres:postgres ${DATA} && chmod 700 ${DATA}`);
      sh(`su postgres -c "${PGBIN}/initdb -D ${DATA} -U postgres --auth=trust"`);
      const started = sh(`su postgres -c "${PGBIN}/pg_ctl -D ${DATA} -o '-p ${PORT} -c listen_addresses=127.0.0.1 -k ${DATA} -c max_connections=200' -l ${DATA}/log -w -t 60 start"`);
      if (started.code !== 0) throw new Error(`không khởi động được PostgreSQL: ${started.text.slice(0, 300)}`);

      const psql = (sql, db = 'postgres') => {
        const f = path.join(pgOut, 'q.sql');
        writeFileSync(f, sql);
        return sh(`psql -h 127.0.0.1 -p ${PORT} -U postgres -d ${db} -v ON_ERROR_STOP=1 -q -f ${f}`);
      };
      /* An orphan postmaster on this port would measure a different database
         entirely. Chain Z lost three break-tests to exactly that, so this is an
         assertion and not a comment. */
      const live = sh(`psql -h 127.0.0.1 -p ${PORT} -U postgres -tAc "SHOW data_directory"`).text.trim();
      if (live !== DATA) throw new Error(`nói chuyện với cluster KHÁC: ${live} != ${DATA}`);

      psql('CREATE DATABASE app;');
      psql(
        'CREATE SCHEMA IF NOT EXISTS auth;' +
        ' CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT \'{}\'::jsonb, created_at timestamptz DEFAULT now());' +
        ' CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $x$ SELECT NULLIF(current_setting(\'request.jwt.claim.sub\', true), \'\')::uuid $x$;' +
        ' CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $x$ SELECT COALESCE(NULLIF(current_setting(\'request.jwt.claim.role\', true), \'\'), \'anon\') $x$;' +
        ' CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;' +
        ' DO $x$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $x$;' +
        ' DO $x$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $x$;' +
        ' DO $x$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $x$;' +
        ' GRANT USAGE ON SCHEMA public, auth, extensions TO anon, authenticated, service_role;',
        'app',
      );
      for (const m of execFileSync('bash', ['-lc', `ls ${path.join(ROOT, 'supabase', 'migrations')}/*.sql | sort`], { encoding: 'utf8' }).trim().split('\n')) {
        sh(`psql -h 127.0.0.1 -p ${PORT} -U postgres -d app -q -f ${m} 2>/dev/null`);
      }
      psql("INSERT INTO auth.users (id,email) VALUES ('11111111-1111-1111-1111-111111111111','a@x') ON CONFLICT DO NOTHING;", 'app');

      /* the driver needs the whole lib, laid out under its own root */
      const drvOut = path.join(pgOut, 'js');
      mkdirSync(drvOut, { recursive: true });
      const LIB = readdirSync(path.join(NATIVE, 'src/lib')).filter((f) => f.endsWith('.ts')).map((f) => `src/lib/${f}`);
      try {
        execFileSync('npx', ['tsc', ...LIB, '--ignoreConfig', '--outDir', drvOut, '--rootDir', 'src',
          '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck', '--lib', 'es2020,dom'],
          { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] });
      } catch { /* unmapped @/ raises TS2307; the emit is still written */ }
      for (const rel of LIB) {
        const js = path.join(drvOut, rel.replace(/^src\//, '').replace(/\.tsx?$/, '.js'));
        writeFileSync(js, readFileSync(js, 'utf8')
          .replace(/require\("@\/(.*?)"\)/g, (_, p) => `require("../${p}")`)
          .replace(/require\("\.\.\/integrations\/supabase\/client"\)/g, 'require("../sb.cjs")')
          .replace(/require\("\.\/integrations\/supabase\/client"\)/g, 'require("../sb.cjs")'));
      }
      writeFileSync(path.join(drvOut, 'sb.cjs'), 'let c = null; module.exports = { get supabase() { return c; }, _use: (x) => { c = x; } };');
      writeFileSync(path.join(drvOut, 'shim.cjs'), SHIM(PORT, PGCLIENT));
      writeFileSync(path.join(drvOut, 'drive.cjs'), DRIVER());

      for (const TZ of ['UTC', 'America/New_York', 'America/Los_Angeles', 'America/Chicago',
        'Asia/Ho_Chi_Minh', 'Australia/Lord_Howe']) {
        const today = execFileSync('node', ['-e', "const d=new Date();console.log(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'))"],
          { encoding: 'utf8', env: { ...process.env, TZ } }).trim();
        const raw = execFileSync('node', [path.join(drvOut, 'drive.cjs')], {
          cwd: drvOut, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 900000,
          env: { ...process.env, TZ, RC_TODAY: today, RC_RUNS: process.env.RC_RUNS || '1000' },
        });
        const r = JSON.parse(raw.trim().split('\n').filter((l) => l.startsWith('{')).pop());
        if (r.harnessError) throw new Error(`${TZ}: ${r.harnessError.slice(0, 400)}`);
        if (process.env.RC_DUMP) console.log(TZ, JSON.stringify(r.cases, null, 1));
        for (const c of r.cases) want(c.ok, `${TZ} · ${c.label}: ${c.why}`);
      }
    } catch (e) {
      problems.push(`không dựng được phép thử trên cơ sở dữ liệu: ${e.message}`);
    } finally {
      stopPg();
      rmSync(pgOut, { recursive: true, force: true });
    }
  }

  if (problems.length) {
    console.log('độ tin cậy điểm sẵn sàng CÓ LỖI:\n');
    for (const p of problems.slice(0, 12)) console.log(`  • ${p}`);
    if (problems.length > 12) console.log(`  … và ${problems.length - 12} lỗi nữa`);
    process.exit(1);
  }

  console.log(
    'độ tin cậy điểm sẵn sàng OK — acwr là null khi CHƯA CÓ nền để so, và 0 giữ nguyên nghĩa thật khi nền ' +
      'tồn tại; độ tin cậy bám theo SỐ CHIỀU đo được (1 → low, 2 → medium, 3+ → high), engine và màn hình ' +
      'tới cùng con số ấy bằng hai đường khác nhau và chia mức ở MỘT chỗ; gauge vẽ đủ bốn ô cho bốn chiều ' +
      'nó đếm, nên số "chỉ số đo được" không còn lớn hơn số ô hiện ra. Cả năm nhánh lời khuyên theo acwr ' +
      'chạy qua computeReadiness THẬT: xanh mà chưa có buổi tập nào ra green_no_load chứ không phải câu ' +
      '"ACWR hơi cao" về một tỉ số app chưa từng tính, còn hai nhánh có acwr đo được giữ nguyên khoá cũ. ' +
      'Phục hồi là ba phép đo (hrv, rhr, sleep) và KHÔNG có tải tập: mười chín chuỗi explain — rỗng, null, ' +
      'rác, văn xuôi cũ, khoá lạ, khoá trùng, số tràn — không dựng ra tín hiệu phục hồi và không ném; cổng ' +
      'deload THẬT từ chối ba ngày chỉ có tải, nhận ba ngày có ngủ, có sinh trắc hoặc trộn, và vẫn từ chối ' +
      'khi chỉ hai ngày có đo phục hồi; suggestLoad THẬT không còn giữ tải trên một điểm đỏ dựng từ mỗi tải ' +
      'tập, nhưng vẫn giữ trên đỏ có ngủ, có sinh trắc và trộn, và vẫn hạ tải khi buổi tập quá nặng. Trên ' +
      'PostgreSQL 16.13 dựng từ toàn bộ migration, ở SÁU múi giờ gồm Australia/Lord_Howe (bước DST nửa giờ): ' +
      'ma trận tám tổ hợp cộng 1000 trạng thái ngẫu nhiên mỗi múi giờ, chuỗi explain luôn ghi đúng những gì ' +
      'nguồn đo được, chấm bằng oracle đọc bảng nguồn chứ không đọc daily_logs. KHÔNG có ca nào chấm điểm ' +
      'một ngày DST trong quá khứ: cửa sổ lịch sử neo ở new Date() (BUG-106) nên ngày đó không chấm được, ' +
      'và một ca luôn xanh dù mã hỏng thì tệ hơn không có ca.',
  );
} finally {
  rmSync(out, { recursive: true, force: true });
}

function SHIM(PORT, PGCLIENT) {
  return String.raw`const { Client, types } = require(${JSON.stringify(PGCLIENT)});
types.setTypeParser(1184, (v) => v);
types.setTypeParser(1114, (v) => v);
types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
const q = (i) => '"' + String(i).replace(/"/g, '""') + '"';
class B {
  constructor(c, t) { this.c = c; this.t = t; this.cols = '*'; this.f = []; this.o = []; this.l = null; }
  select(c) { if (this.mode) { this.ret = c || '*'; return this; } this.cols = c || '*'; return this; }
  eq(c, v) { this.f.push([c, '=', v]); return this; }
  gte(c, v) { this.f.push([c, '>=', v]); return this; }
  lt(c, v) { this.f.push([c, '<', v]); return this; }
  lte(c, v) { this.f.push([c, '<=', v]); return this; }
  order(c, o) { this.o.push(q(c) + (o && o.ascending === false ? ' DESC' : ' ASC')); return this; }
  limit(n) { this.l = n; return this; }
  insert(p) { this.mode = 'insert'; this.p = p; return this; }
  update(p) { this.mode = 'update'; this.p = p; return this; }
  upsert(p, o) { this.mode = 'upsert'; this.p = p; this.conf = o && o.onConflict; return this; }
  maybeSingle() { this.s = 'maybe'; return this; }
  single() { this.s = 'one'; return this; }
  _w(v) { if (!this.f.length) return ''; return ' WHERE ' + this.f.map(([c, op, x]) => { v.push(x); return q(c) + ' ' + op + ' $' + v.length; }).join(' AND '); }
  async _run() {
    const v = []; let sql;
    if (this.mode === 'insert' || this.mode === 'upsert') {
      const rows = Array.isArray(this.p) ? this.p : [this.p];
      const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
      sql = 'INSERT INTO public.' + q(this.t) + ' (' + cols.map(q).join(',') + ') VALUES ' +
        rows.map((r) => '(' + cols.map((c) => { v.push(r[c] === undefined ? null : r[c]); return '$' + v.length; }).join(',') + ')').join(',');
      if (this.mode === 'upsert') {
        const keys = (this.conf || 'id').split(',').map((x) => x.trim());
        sql += ' ON CONFLICT (' + keys.map(q).join(',') + ') DO UPDATE SET ' +
          cols.filter((c) => !keys.includes(c)).map((c) => q(c) + ' = EXCLUDED.' + q(c)).join(',');
      }
    } else if (this.mode === 'update') {
      const cols = Object.keys(this.p);
      sql = 'UPDATE public.' + q(this.t) + ' SET ' + cols.map((c) => { v.push(this.p[c]); return q(c) + ' = $' + v.length; }).join(',') + this._w(v);
    } else {
      sql = 'SELECT ' + (this.cols === '*' ? '*' : this.cols.split(',').map((c) => q(c.trim())).join(',')) +
        ' FROM public.' + q(this.t) + this._w(v) +
        (this.o.length ? ' ORDER BY ' + this.o.join(',') : '') + (this.l != null ? ' LIMIT ' + Number(this.l) : '');
    }
    if (this.ret) sql += ' RETURNING ' + (this.ret === '*' ? '*' : this.ret.split(',').map((c) => q(c.trim())).join(','));
    let res;
    try { res = await this.c.query(sql, v); }
    catch (e) { return { data: null, error: { code: e.code, message: e.message } }; }
    const rows = res.rows;
    if (this.s === 'one') return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } };
    if (this.s === 'maybe') return rows.length > 1 ? { data: null, error: { code: 'PGRST116', message: 'many' } } : { data: rows[0] ?? null, error: null };
    if (this.mode && !this.ret) return { data: null, error: null };
    return { data: rows, error: null };
  }
  then(a, b) { return this._run().then(a, b); }
}
async function conn() {
  const c = new Client({ host: '127.0.0.1', port: ${PORT}, user: 'postgres', database: 'app' });
  await c.connect();
  return c;
}
module.exports = { client: (c) => ({ from: (t) => new B(c, t) }), conn };`;
}

/* No backticks inside — String.raw, and one stray backtick silently ends it. */
function DRIVER() {
  return String.raw`
const { client, conn } = require('./shim.cjs');
const sb = require('./sb.cjs');
const { recomputeDailyLog } = require('./lib/daily-log-service.js');
const { hasRecoverySignal, readinessSubscores, readinessRecoText, RECOVERY_COMPONENTS } = require('./lib/readiness-i18n.js');
const { deloadWarranted, recoveryBackedDays } = require('./lib/readiness-week.js');
const { suggestLoad } = require('./lib/load-progression.js');
const A = '11111111-1111-1111-1111-111111111111';
const TZ = process.env.TZ;
const out = { cases: [] };
const add = (label, ok, why) => out.cases.push({ label, ok, why });

(async () => {
  const admin = await conn();
  const c = await conn();
  sb._use(client(c));
  const q = (s, p) => admin.query(s, p || []);
  const D0 = process.env.RC_TODAY;
  const at = async (d, h) => (await q("SELECT ($1::text||' '||$2::text)::timestamp AT TIME ZONE $3::text t", [d, h, TZ])).rows[0].t;
  const shift = async (d, n) => (await q('SELECT ($1::date + $2::int)::text d', [d, n])).rows[0].d;
  const wipe = () => q('DELETE FROM workout_sessions; DELETE FROM sleep_logs; DELETE FROM biometric_samples; DELETE FROM daily_logs;');

  const night = async (day, min) => q(
    'INSERT INTO sleep_logs (user_id,bedtime,waketime,asleep_min,quality) VALUES ($1,$2,$3,$4,8)',
    [A, await at(await shift(day, -1), '23:00'), await at(day, '07:00'), min === undefined ? 430 : min]);
  const bio = async (day, hr, sdnn) => q(
    "INSERT INTO biometric_samples (user_id,date_time,hr_bpm,hrv_sdnn_ms,source) VALUES ($1,$2,$3,$4,'manual')",
    [A, await at(day, '06:00'), hr === undefined ? 55 : hr, sdnn === undefined ? 60 : sdnn]);
  const lifted = async (day, rpe, reps) => q(
    "INSERT INTO workout_sessions (user_id,date_time,volume_load,session_rpe,sets,source) VALUES ($1,$2,3000,$3,$4,'manual')",
    [A, await at(day, '18:00'), rpe === undefined ? 8 : rpe, JSON.stringify([{ reps: reps === undefined ? 50 : reps, weight_kg: 60 }])]);
  const row = async (d) => (await q(
    'SELECT readiness_score, readiness_status, readiness_explain, readiness_recommendation, acwr FROM daily_logs WHERE user_id=$1 AND date=$2', [A, d])).rows[0] || null;

  /*
    ── ORACLE ──
    Says which components a fixture CAN support, straight from the raw rows and
    the documented floors (HRV and RHR need five readings of history; sleep
    needs a night; load needs a session that can be scored). It never reads
    daily_logs and never calls computeReadiness, so a token that drops or
    invents a component cannot agree with it.
  */
  const oracle = async (day) => {
    const lo = await at(day, '00:00');
    const hi = await at(await shift(day, 1), '00:00');
    const todayBio = (await q(
      'SELECT hr_bpm, hrv_sdnn_ms, hrv_rmssd_ms FROM biometric_samples WHERE user_id=$1 AND date_time >= $2 AND date_time < $3 ORDER BY date_time DESC LIMIT 1',
      [A, lo, hi])).rows[0] || null;
    /* anchored at NOW because recomputeDailyLog anchors its history windows
       there; anchoring on the target day is the mistake Chain AG made */
    const hist = (await q(
      "SELECT hr_bpm, hrv_sdnn_ms, hrv_rmssd_ms FROM biometric_samples WHERE user_id=$1 AND date_time >= now() - interval '28 days'", [A])).rows;
    const nights7 = (await q(
      "SELECT count(*)::int n FROM sleep_logs WHERE user_id=$1 AND waketime >= now() - interval '7 days'", [A])).rows[0].n;
    const sleepRow = (await q(
      'SELECT asleep_min, bedtime, waketime FROM sleep_logs WHERE user_id=$1 AND waketime >= $2 AND waketime < $3 ORDER BY waketime DESC LIMIT 1',
      [A, lo, hi])).rows[0] || null;
    const load28 = Number((await q(
      "SELECT COALESCE(SUM(rpe*reps),0)::float t FROM (" +
      "  SELECT session_rpe::float rpe, (SELECT COALESCE(SUM((e->>'reps')::float),0) FROM jsonb_array_elements(sets) e) reps" +
      "  FROM workout_sessions WHERE user_id=$1 AND date_time >= now() - interval '28 days'" +
      ") x WHERE rpe BETWEEN 1 AND 10 AND reps > 0", [A])).rows[0].t);

    const usingSdnn = todayBio != null && todayBio.hrv_sdnn_ms != null;
    const fam = hist.map((b) => (usingSdnn ? b.hrv_sdnn_ms : b.hrv_rmssd_ms)).filter((v) => v != null);
    const hrvToday = todayBio == null ? null : (usingSdnn ? todayBio.hrv_sdnn_ms : todayBio.hrv_rmssd_ms);
    const sleepMin = sleepRow == null ? 0
      : (sleepRow.asleep_min != null && Number(sleepRow.asleep_min) > 0 ? Number(sleepRow.asleep_min)
        : Math.max(0, Math.round((Date.parse(sleepRow.waketime) - Date.parse(sleepRow.bedtime)) / 60000)));
    const comp = [];
    if (hrvToday != null && fam.length >= 5) comp.push('hrv');
    if (todayBio != null && todayBio.hr_bpm != null && hist.filter((b) => b.hr_bpm != null).length >= 5) comp.push('rhr');
    if (sleepMin > 0) comp.push('sleep');
    if (load28 > 0) comp.push('load');
    const gate = hist.length >= 3 || nights7 >= 3 || load28 > 0;
    const scored = gate && comp.length > 0;
    return {
      components: comp, scored,
      /* the whole point: recovery is the three, never load */
      recovery: comp.some((k) => k === 'hrv' || k === 'rhr' || k === 'sleep'),
    };
  };

  /* ══ 1 · the component matrix ══ */
  const CASES = [
    ['A · không có gì', async () => {}],
    ['B · chỉ giấc ngủ', async () => { for (const k of [0, 1, 2]) await night(await shift(D0, -k)); }],
    ['C · chỉ sinh trắc', async () => { for (let k = 0; k <= 6; k++) await bio(await shift(D0, -k)); }],
    ['D · chỉ tải tập', async () => { for (let k = 0; k < 14; k += 2) await lifted(await shift(D0, -k)); }],
    ['E · ngủ + sinh trắc', async () => { for (let k = 0; k <= 6; k++) { await night(await shift(D0, -k)); await bio(await shift(D0, -k)); } }],
    ['F · ngủ + tải', async () => { for (const k of [0, 1, 2]) await night(await shift(D0, -k)); for (let k = 0; k < 14; k += 2) await lifted(await shift(D0, -k)); }],
    ['G · sinh trắc + tải', async () => { for (let k = 0; k <= 6; k++) await bio(await shift(D0, -k)); for (let k = 0; k < 14; k += 2) await lifted(await shift(D0, -k)); }],
    ['H · đủ cả bốn', async () => { for (let k = 0; k <= 6; k++) { await night(await shift(D0, -k)); await bio(await shift(D0, -k)); } for (let k = 0; k < 14; k += 2) await lifted(await shift(D0, -k)); }],
  ];
  for (const [label, build] of CASES) {
    await wipe(); await build();
    await recomputeDailyLog(A, D0);
    const r = await row(D0);
    const e = await oracle(D0);
    const subs = readinessSubscores(r && r.readiness_explain);
    const keys = Object.keys(subs);
    const rec = hasRecoverySignal(r && r.readiness_explain);
    const okComp = e.scored
      ? keys.length === e.components.length && e.components.every((k) => subs[k] != null)
      : (r == null || r.readiness_score == null);
    add('ma trận · ' + label + ' · explain ghi đúng thành phần', okComp,
      'explain=' + JSON.stringify(r && r.readiness_explain) + ' oracle=' + JSON.stringify(e.components));
    add('ma trận · ' + label + ' · tín hiệu phục hồi', rec === (e.scored && e.recovery),
      'hasRecoverySignal=' + rec + ' oracle=' + (e.scored && e.recovery));
  }

  /* ══ 13 · the ACWR branches ══
     green + acwr null must not claim a high ratio; the two measured branches
     keep the keys they always had. */
  {
    await wipe();
    for (const k of [0, 1, 2]) await night(await shift(D0, -k), 520);
    await recomputeDailyLog(A, D0);
    const r = await row(D0);
    const key = r && r.readiness_recommendation;
    const vi = readinessRecoText(key, 'vi');
    const en = readinessRecoText(key, 'en');
    add('acwr · xanh mà acwr null → không nói ACWR cao',
      r != null && r.readiness_status === 'green' && r.acwr == null
        && key === 'green_no_load' && !/hơi cao/.test(vi) && !/a bit high/.test(en),
      'điểm=' + (r && r.readiness_score) + ' trạng thái=' + (r && r.readiness_status) +
      ' acwr=' + (r && r.acwr) + ' khoá=' + key + ' | vi=' + vi);
  }
  {
    /* even training → ACWR ~1.0, plus a good night so the score reaches green */
    await wipe();
    for (let k = 0; k < 28; k++) await lifted(await shift(D0, -k), 7, 40);
    for (const k of [0, 1, 2]) await night(await shift(D0, -k), 560);
    await recomputeDailyLog(A, D0);
    const r = await row(D0);
    add('acwr · xanh với acwr <= 1.2 → green_optimal',
      r != null && r.readiness_status === 'green' && r.acwr != null && Number(r.acwr) <= 1.2
        && r.readiness_recommendation === 'green_optimal',
      'acwr=' + (r && r.acwr) + ' khoá=' + (r && r.readiness_recommendation));
  }
  /*
    The acwr > 1.2 branch is NOT driven from a fixture here. Getting a ratio
    above 1.2 out of real sessions means a load spike, and a load spike scores
    35 or 55, which drags the day out of green — so the case could only ever
    assert "if this happened to be green, then…", and a rule with a hypothesis
    that never holds is a rule that cannot go red. Section 7 drives that branch
    through the real computeReadiness with the two loads stated exactly.
  */
  {
    /* yellow and red with no ACWR at all must keep their own keys */
    await wipe();
    for (const k of [0, 1, 2]) await night(await shift(D0, -k), 330);
    await recomputeDailyLog(A, D0);
    const r = await row(D0);
    add('acwr · vàng/đỏ với acwr null giữ khoá cũ',
      r != null && r.acwr == null && ['yellow_sleep', 'yellow_reduce', 'red_rest', 'red_recover'].includes(r.readiness_recommendation),
      'trạng thái=' + (r && r.readiness_status) + ' acwr=' + (r && r.acwr) + ' khoá=' + (r && r.readiness_recommendation));
  }

  /*
    ── the four reds, which is what BUG-109 and BUG-110 are about ──

    Each builds three consecutive days whose readiness is red, differing only in
    WHICH components could be measured. The load-only one is somebody with a
    heavy 28-day base and one small recent session — under-trained, not tired.
  */
  const redDays = async (kind) => {
    await wipe();
    if (kind === 'load' || kind === 'mixed') {
      for (let k = 8; k <= 27; k++) await lifted(await shift(D0, -k), 9, 120);
      await lifted(await shift(D0, -6), 6, 5);
    }
    if (kind === 'sleep' || kind === 'mixed') {
      for (let k = 0; k <= 6; k++) await night(await shift(D0, -k), 150);
    }
    if (kind === 'bio') {
      /* a resting heart rate far above this person's own baseline */
      for (let k = 3; k <= 12; k++) await bio(await shift(D0, -k), 52, 60);
      for (const k of [0, 1, 2]) await bio(await shift(D0, -k), 95, 20);
    }
    const logs = [];
    for (const k of [0, 1, 2]) {
      const d = await shift(D0, -k);
      await recomputeDailyLog(A, d);
      const r = await row(d);
      if (r) logs.push({ readiness_score: r.readiness_score == null ? null : Number(r.readiness_score), readiness_explain: r.readiness_explain, acwr: r.acwr, status: r.readiness_status });
    }
    const scored = logs.filter((l) => l.readiness_score != null);
    const avg = scored.length ? scored.reduce((s, l) => s + l.readiness_score, 0) / scored.length : 0;
    return { logs, scored, avg, days: scored.length };
  };

  const REDS = [
    ['9 · đỏ CHỈ từ tải tập', 'load', false],
    ['10 · đỏ từ giấc ngủ', 'sleep', true],
    ['11 · đỏ từ sinh trắc', 'bio', true],
    ['12 · đỏ trộn tải + phục hồi', 'mixed', true],
  ];
  for (const [label, kind, mayAdvise] of REDS) {
    const f = await redDays(kind);
    const allRed = f.days === 3 && f.scored.every((l) => l.status === 'red');
    add(label + ' · dựng được ba ngày đỏ', allRed,
      'ngày=' + f.days + ' ' + JSON.stringify(f.scored.map((l) => l.readiness_score + '/' + l.status + '/' + l.readiness_explain)));
    if (!allRed) continue;

    /* BUG-109 — the real deload decision */
    const fires = deloadWarranted(f.logs, f.avg, f.days);
    add(label + ' · cảnh báo deload', fires === mayAdvise,
      'deloadWarranted=' + fires + ' đáng lẽ=' + mayAdvise +
      ' (trung bình=' + Math.round(f.avg) + ' ngày=' + f.days + ' ngày có phục hồi=' + recoveryBackedDays(f.logs) + ')');

    /* BUG-110 — the real suggestLoad, sessions reported far below target */
    const s = suggestLoad({ reported: [5, 5, 5, 5, 5], target: 8, goal: 'strength',
      readiness: 'red', readinessExplain: f.logs[0].readiness_explain });
    add(label + ' · suggestLoad', (s.advice === 'hold') === mayAdvise,
      "advice='" + s.advice + "' explain=" + JSON.stringify(f.logs[0].readiness_explain) + ' đáng lẽ giữ=' + mayAdvise);
  }

  /* ══ suggestLoad · the branches that must not move ══ */
  {
    const base = { reported: [5, 5, 5, 5, 5], target: 8, goal: 'strength' };
    const noReadiness = suggestLoad(base);
    add('suggestLoad · không có điểm sẵn sàng → như cũ', noReadiness.advice === 'up',
      "advice='" + noReadiness.advice + "'");
    for (const st of ['green', 'yellow']) {
      const s = suggestLoad({ ...base, readiness: st, readinessExplain: 'sleep:20|load:45' });
      add('suggestLoad · ' + st + ' → như cũ', s.advice === 'up', "advice='" + s.advice + "'");
    }
    const heavy = suggestLoad({ reported: [10, 10, 10], target: 7, readiness: 'red', readinessExplain: 'load:45' });
    add('suggestLoad · quá nặng vẫn ra down dù đỏ load-only', heavy.advice === 'down', "advice='" + heavy.advice + "'");
  }

  /* ══ 3-6 · hostile, missing, unknown and duplicate tokens ══ */
  const HOSTILE = [
    ['rỗng', '', false],
    ['null', null, false],
    ['undefined', undefined, false],
    ['rác', 'khong-phai-token', false],
    ['văn xuôi cũ', 'HRV: thấp (30) · Giấc ngủ: kém (20)', false],
    ['điểm phi số', 'hrv:abc|sleep:def', false],
    ['khoá lạ', 'foo:50|bar:60', false],
    ['chỉ tải', 'load:45', false],
    ['tải + khoá lạ', 'load:45|foo:99', false],
    ['khoá trùng, phục hồi', 'sleep:10|sleep:90', true],
    ['khoá trùng, tải', 'load:10|load:90', false],
    ['ngủ lẫn rác', 'zzz|sleep:40|', true],
    ['dấu phân cách lạ', 'sleep=40', false],
    ['khoảng trắng', ' sleep:40 ', false],
    ['khổng lồ', 'load:' + '9'.repeat(400), false],
    ['phục hồi khổng lồ', 'sleep:' + '9'.repeat(400), true],
  ];
  for (const [label, stored, expect] of HOSTILE) {
    let got = null; let threw = null;
    try { got = hasRecoverySignal(stored); } catch (e) { threw = String(e.message).slice(0, 60); }
    add('chuỗi hỏng · ' + label, threw === null && got === expect,
      'hasRecoverySignal=' + got + ' đáng lẽ=' + expect + ' ném=' + threw);
  }
  add('chuỗi hỏng · tập thành phần phục hồi là ba, không có tải',
    RECOVERY_COMPONENTS.length === 3 && !RECOVERY_COMPONENTS.includes('load'),
    JSON.stringify(RECOVERY_COMPONENTS));

  /* ══ 2 · randomized states ══ */
  {
    let seed = 7331; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const RUNS = Number(process.env.RC_RUNS || 1000);
    let bad = 0; const sample = [];
    for (let t = 0; t < RUNS; t++) {
      await wipe();
      const nN = Math.floor(rnd() * 8), nB = Math.floor(rnd() * 8), nW = Math.floor(rnd() * 8);
      for (let i = 0; i < nN; i++) await night(await shift(D0, -Math.floor(rnd() * 7)), Math.floor(rnd() * 600));
      for (let i = 0; i < nB; i++) await bio(await shift(D0, -Math.floor(rnd() * 10)), 40 + Math.floor(rnd() * 60), 20 + Math.floor(rnd() * 100));
      for (let i = 0; i < nW; i++) await lifted(await shift(D0, -Math.floor(rnd() * 20)), 6 + Math.floor(rnd() * 5), 10 + Math.floor(rnd() * 60));
      let threw = null;
      try { await recomputeDailyLog(A, D0); } catch (e) { threw = String(e.message).slice(0, 60); }
      const r = await row(D0);
      const e = await oracle(D0);
      const subs = readinessSubscores(r && r.readiness_explain);
      const why = [];
      if (threw) why.push('ném: ' + threw);
      if (e.scored) {
        if (Object.keys(subs).length !== e.components.length) why.push('đo được ' + Object.keys(subs).length + ' ≠ oracle ' + e.components.length);
        for (const k of e.components) if (subs[k] == null) why.push('thiếu ' + k);
        if (hasRecoverySignal(r && r.readiness_explain) !== e.recovery) why.push('phục hồi ' + hasRecoverySignal(r && r.readiness_explain) + ' ≠ ' + e.recovery);
        /* a score with no recovery component must never license a deload */
        if (!e.recovery && r != null && recoveryBackedDays([{ readiness_score: r.readiness_score, readiness_explain: r.readiness_explain }]) !== 0) {
          why.push('ngày không đo phục hồi vẫn được đếm là có');
        }
      } else if (r != null && r.readiness_score != null) {
        why.push('có điểm mà oracle nói không');
      }
      if (why.length) { bad++; if (sample.length < 3) sample.push(why.join('; ') + ' | explain=' + JSON.stringify(r && r.readiness_explain) + ' oracle=' + JSON.stringify(e.components)); }
    }
    add('ngẫu nhiên · ' + RUNS + ' trạng thái', bad === 0, 'lệch=' + bad + ' ' + JSON.stringify(sample));
  }

  /*
    ── why there is no case dated 2026-03-08 or 2026-11-01 here ──

    There was, and it asserted nothing. recomputeDailyLog anchors its history
    windows at new Date() rather than at the day being rebuilt, so a day five
    months in the past has no biometrics, no nights and no training inside the
    windows the gate reads: it scores zero days, deloadWarranted is trivially
    false, and the case passes however the code is broken. Measured:

        DST 2026-03-08 : ngay co phuc hoi=0 trung binh=0 ngay=0

    That anchoring is recorded as BUG-106 and is deliberately not fixed, so this
    file does not paper over it with a rule that cannot go red, and does not add
    one that blesses it either. The 23-hour and 25-hour days are still crossed:
    this whole driver runs in six zones on the current local day, including
    Australia/Lord_Howe, whose DST step is thirty minutes rather than an hour,
    and the randomized states below place sleep, biometrics and sessions across
    the preceding twenty days in each of them.
  */

  await c.end(); await admin.end();
  console.log(JSON.stringify(out));
})().catch((e) => { out.harnessError = String((e && e.stack) || e); console.log(JSON.stringify(out)); });
`;
}
