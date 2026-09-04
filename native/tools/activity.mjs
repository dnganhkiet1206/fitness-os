/**
 * That the Activity card shows numbers somebody actually produced.
 *
 * ── the failure this exists to prevent ──
 *
 * The card shipped drawing three rings from `active_kcal`, `active_minutes`
 * and `steps`. Two of those columns were written by nothing anywhere in the
 * app — they existed in the migration, in the generated types, and on the one
 * line that read them, and nowhere else. So two thirds of the card had been
 * pinned at zero since the day it landed, and because the ring track measured
 * 1.01:1 against the card behind it, a ring at zero drew *nothing at all*. The
 * bug reported was "nhìn hơi placeholder". It was not a design problem.
 *
 * That is a whole class of failure — a screen reading a column with no writer
 * — and it does not announce itself. It typechecks, it renders, it is simply
 * always zero. So the checks below are mostly about provenance: who writes
 * what, which number the card is allowed to show, and whether an estimate is
 * still visibly an estimate by the time it reaches the glass.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(path.join(tmpdir(), 'activity-'));
const read = (p) => readFileSync(path.join(NATIVE, p), 'utf8');

/* ── colour maths, so "visible" is measured and not admired ── */
const chan = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const lum = (h) => {
  const [r, g, b] = chan(h).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const over = (fg, alpha, bg) => {
  const f = chan(fg);
  const b = chan(bg);
  return (
    '#' +
    f
      .map((c, i) => Math.round((c * alpha + b[i] * (1 - alpha)) * 255).toString(16).padStart(2, '0'))
      .join('')
  );
};

try {
  execFileSync(
    'npx',
    ['tsc', 'src/lib/activity.ts', '--ignoreConfig', '--outDir', out,
      '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const { activityModel, trainingMinutes } = createRequire(import.meta.url)(
    path.join(out, 'activity.js'),
  );

  const problems = [];
  const eq = (what, got, want) => {
    if (got !== want) problems.push(`${what}: ${got}, đáng lẽ ${want}`);
  };

  /* ── how long a set list took ── */
  eq('không set nào thì không phút nào', trainingMinutes([]), 0);
  eq('set không có rep cũng là không phút', trainingMinutes([{ reps: 0 }, { reps: null }]), 0);
  // 10 sets × (8 reps × 3s + 90s rest) = 1140s = 19 phút
  eq(
    '10 set × 8 rep, nghỉ mặc định',
    trainingMinutes(Array.from({ length: 10 }, () => ({ reps: 8 }))),
    19,
  );
  // nghỉ dài hơn thì buổi tập dài hơn — 10 × (24 + 180) = 2040s = 34 phút
  eq(
    'nghỉ 180s thì lâu hơn',
    trainingMinutes(Array.from({ length: 10 }, () => ({ reps: 8, restSeconds: 180 }))),
    34,
  );
  {
    const mixed = trainingMinutes([{ reps: 8 }, { reps: 0 }, { reps: 12 }]);
    const clean = trainingMinutes([{ reps: 8 }, { reps: 12 }]);
    eq('set rỗng xen giữa không tính thêm', mixed, clean);
  }

  /* ── which number each ring is allowed to show ── */
  const base = { moveKcal: null, healthMinutes: null, loggedMinutes: 0, steps: 0, stepsTarget: 10000 };
  const ring = (input, key) => activityModel({ ...base, ...input }).rings.find((r) => r.key === key);

  /*
    ── the Move target has to stay attached to where it came from ──

    It was 600, under a comment calling it "Apple's own daily default". Apple
    ships no fixed Move goal: it derives one during setup from activity level
    plus age, sex, height and weight, and the values it proposes run roughly
    150–400 kcal, typically starting near 300. 600 was about double that, on a
    ring nobody in this app can adjust.

    So the bound is the source, not a taste: a future edit that moves this
    number outside the range Apple actually proposes has to come with a reason
    that is not "it felt low".

    Exercise is left alone — 30 minutes genuinely is Apple's default, and it is
    the WHO's 150 minutes a week divided by five.
  */
  const moveTarget = ring({}, 'move').target;
  if (moveTarget < 150 || moveTarget > 400) {
    problems.push(
      `mục tiêu vòng Move là ${moveTarget} kcal, ngoài khoảng 150–400 mà Apple thực sự đề xuất — ` +
        'một vòng không thể đóng và không thể chỉnh thì không phải là mục tiêu',
    );
  }
  eq('mục tiêu vòng Exercise là mặc định của Apple', ring({}, 'exercise').target, 30);

  eq('chưa có gì thì không vẽ', activityModel(base).hasAny, false);
  eq('chưa có gì thì nguồn là "none"', ring({}, 'move').source, 'none');
  eq('có bước chân là có dữ liệu', activityModel({ ...base, steps: 300 }).hasAny, true);

  eq('đo được thì dùng số đo', ring({ healthMinutes: 42, loggedMinutes: 19 }, 'exercise').current, 42);
  eq('đo được thì ghi rõ là đo', ring({ healthMinutes: 42, loggedMinutes: 19 }, 'exercise').source, 'measured');
  eq('không đo được thì ước tính', ring({ loggedMinutes: 19 }, 'exercise').current, 19);
  eq('ước tính phải nói là ước tính', ring({ loggedMinutes: 19 }, 'exercise').source, 'estimated');
  /*
    The case the whole rule turns on. Health reporting *zero* exercise minutes
    is Health saying it watched you sit still — it is not a statement about the
    barbell session it never saw. A measured zero must not displace a logged
    workout, or the person who trains without a watch gets an empty ring on
    exactly the days they trained.
  */
  eq('số đo bằng 0 không đè lên buổi tập đã ghi', ring({ healthMinutes: 0, loggedMinutes: 34 }, 'exercise').current, 34);
  eq('… và vẫn là ước tính', ring({ healthMinutes: 0, loggedMinutes: 34 }, 'exercise').source, 'estimated');
  /*
    A measurement *smaller* than the estimate is still the measurement. Apple's
    exercise minutes miss most of a lifting session, so this case is common,
    and it is where the temptation to "just take the bigger one" bites: 12 is
    the number a watch stands behind, and the card says so.
  */
  eq('số đo nhỏ hơn ước tính vẫn thắng', ring({ healthMinutes: 12, loggedMinutes: 40 }, 'exercise').current, 12);
  eq('… và vẫn là số đo', ring({ healthMinutes: 12, loggedMinutes: 40 }, 'exercise').source, 'measured');

  eq('không có mục tiêu bước thì về mặc định', ring({ steps: 5000, stepsTarget: 0 }, 'steps').target, 10000);
  eq('vượt mục tiêu vẫn báo đúng phần trăm', ring({ steps: 15000 }, 'steps').pct, 1.5);
  eq('đủ 3 vòng thì đếm 3', activityModel({ moveKcal: 600, healthMinutes: 30, loggedMinutes: 0, steps: 10000, stepsTarget: 10000 }).closed, 3);

  /*
    Self-test: the version that took the larger of the two.

    "Both are lower bounds, so use the bigger one" is the rule that feels
    generous and cannot be labelled — the ring would silently change which kind
    of number it holds.

    The two rules agree almost everywhere, which is the point: they part only
    when the watch reports *less* than the sets imply, so that is the case the
    self-test has to use. Written first with 42 against 19 — where both say 42
    — and this check failed itself, correctly.
  */
  const larger = (health, logged) => Math.max(health ?? 0, logged);
  if (larger(12, 40) === ring({ healthMinutes: 12, loggedMinutes: 40 }, 'exercise').current) {
    console.error('phép tự kiểm hỏng — bản "lấy số lớn hơn" đáng lẽ phải khác bản thật ở ca 12 vs 40, đừng tin kết quả');
    process.exit(1);
  }

  /* ── one writer per column ── */
  const sync = read('src/hooks/use-health-sync.ts');
  for (const col of ['active_kcal', 'active_minutes']) {
    if (!sync.includes(col)) {
      problems.push(`use-health-sync: không ghi ${col} — vòng tròn sẽ đứng yên ở 0 như trước`);
    }
  }
  /*
    And that the daily-log rebuild still keeps its hands off them. It upserts a
    fixed column list after every meal, workout and sleep entry; the day it
    starts naming these two, a sync in the morning is erased by a sandwich at
    noon. That is the exact bug shape this project has been bitten by before,
    and it would look like "Health sync doesn't stick sometimes".
  */
  const recompute = read('src/lib/daily-log-service.ts');
  for (const col of ['active_kcal', 'active_minutes', 'steps']) {
    if (new RegExp(`^\\s*${col}[,:]`, 'm').test(recompute)) {
      problems.push(`daily-log-service: đang ghi ${col} — cột này của Health, hai nơi cùng ghi thì sẽ đè nhau`);
    }
  }

  /* ── the health module has to actually ask for them ── */
  const health = read('src/lib/health.ts');
  for (const id of ['HKQuantityTypeIdentifierActiveEnergyBurned', 'HKQuantityTypeIdentifierAppleExerciseTime']) {
    if (!health.includes(id)) {
      problems.push(`health: chưa xin quyền đọc ${id} — truy vấn sẽ luôn trả về rỗng`);
    }
  }

  /* ── and the card has to be visible and drawable ── */
  const card = read('src/components/ascnd/activity-rings.tsx');
  /*
    Màu rãnh nay nằm ở BẢNG MÀU, không phải một hằng số trong tệp này.

    Nó từng là `const TRACK = '#3a3a42'` ngay trong `activity-rings.tsx`, và
    chính chỗ cất đó là lỗi ở tầng trên: kết luận đúng chỉ chữa được ba vòng của
    tệp chứa nó, còn năm vòng khác trong app ở lại trên giá trị vô hình cho tới
    khi người dùng gặp chúng lúc dựng giao diện sáng.

    Phép ĐO ở đây thì giữ nguyên và vẫn đáng giữ: `tools/ring-track.mjs` đo rãnh
    so với NỀN TRANG, còn ba vòng này nằm trên một thẻ kính — một mặt sáng hơn,
    tức một phép thử khác và chặt hơn. Bỏ nó đi là mất đúng con số đã bắt được
    lỗi 1,01:1 lần đầu.
  */
  const track = read('src/constants/palette.ts')
    .slice(0, read('src/constants/palette.ts').indexOf('export type PaletteKey'))
    .match(/\n\s*ringTrack: '(#[0-9a-fA-F]{6})'/)?.[1];
  /*
    Khớp CHÍNH DÒNG GÁN, không khớp chữ "ringTrack" ở bất cứ đâu trong tệp.

    Bản đầu viết `/ringTrack/.test(card)` và nó xanh cho một bản đã đổi token
    sang `'border'` — vì đoạn chú thích ngay trên chỗ gán vẫn nhắc tên
    `ringTrack`. Guard khớp chữ trong văn xuôi là guard xanh cho chính lỗi nó
    sinh ra để bắt; `text-color.mjs` đã dính đúng chuyện này một lần trong repo.
  */
  if (!/const TRACK = 'ringTrack' satisfies PaletteKey;/.test(card)) {
    problems.push(
      "activity-rings: `const TRACK` không còn trỏ vào token `ringTrack` — rãnh sẽ lấy một màu khác, " +
        'và nó không còn được phép đo nào ở đây canh nữa',
    );
  }
  if (!track) {
    problems.push('palette.ts: không đọc được `ringTrack` của bản tối để đo');
  } else {
    // glass.bg rgba(255,255,255,0.06) trên nền #070708
    const surface = over('#ffffff', 0.06, '#070708');
    const ratio = contrast(track, surface);
    if (ratio < 1.4) {
      problems.push(
        `activity-rings: rãnh vòng ${track} chỉ ${ratio.toFixed(2)}:1 so với thẻ — vòng ở mức 0 sẽ không thấy gì, đúng lỗi cũ (1.01:1)`,
      );
    }
  }
  /*
    SVG ids are document-global on native. A hardcoded gradient id is fine
    until the card renders twice, and then both cards share one gradient and
    nobody can work out why. `useId` is the standing answer here; it has been
    relearned three times in this codebase.
  */
  if (!/useId\(\)/.test(card)) {
    problems.push('activity-rings: id gradient không đi qua useId() — id SVG là toàn cục trên native');
  }
  if (/id=["'`]ring-grad-|id=["'`]act-[a-z]+["'`]/.test(card)) {
    problems.push('activity-rings: còn id gradient viết cứng');
  }

  if (problems.length) {
    console.error('vòng hoạt động sai:\n');
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }

  console.log(
    'vòng hoạt động OK — 18 ca; số đo thắng ước tính nhưng số đo 0 thì không, ước tính luôn bị đánh dấu; Health là nơi duy nhất ghi active_kcal/active_minutes; rãnh vòng nhìn thấy được; bản "lấy số lớn hơn" vẫn bị bắt',
  );
} finally {
  rmSync(out, { recursive: true, force: true });
}
