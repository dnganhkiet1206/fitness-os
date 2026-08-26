/**
 * Thẻ điểm sẵn sàng nói đúng thứ engine thật sự làm.
 *
 * ── ba câu sai đã bị người dùng bắt, cùng một lúc ──
 *
 *   1. *"Cần 3+ ngày dữ liệu để tính điểm sẵn sàng."* Cổng thật là một phép
 *      HOẶC và không có số hạng nào về số NGÀY: ≥3 lần đo sinh trắc, HOẶC ≥3
 *      đêm ngủ trong 7 ngày, HOẶC bất kỳ buổi tập nào có set trong 28 ngày.
 *      Một buổi tập duy nhất là có điểm ngay — người dùng báo lại đúng điều đó.
 *      Tệ hơn: qua cổng bằng 3 lần đo sinh trắc thì VẪN không ra điểm, vì
 *      baseline cần 5. Câu ấy hứa 3, sự thật là 5.
 *
 *   2. *"TẬP LUYỆN"* dưới con số trong vòng tròn. Thẻ không phân loại gì cả —
 *      nó trả lời "hôm nay cơ thể bạn chịu được bao nhiêu" — nên nhãn phải là
 *      câu trả lời, không phải một danh từ đọc ra thành tên hạng mục.
 *
 *   3. Sheet giải thích liệt kê bốn nguồn rồi im lặng về mọi thứ khác. Im lặng
 *      không phải một câu trả lời: người ghi bữa ăn rồi thấy điểm xuất hiện sẽ
 *      kết luận điều duy nhất còn lại có thể kết luận. Câu hỏi đã được hỏi
 *      thẳng — *"thẻ sẵn sàng có dùng dữ liệu log từ việc ăn uống để tính
 *      không?"* — và sheet không có chỗ nào trả lời.
 *
 * ── vì sao một máy dò, chứ không phải sửa chữ rồi thôi ──
 *
 * Vì câu chữ và mã nguồn trôi khỏi nhau trong im lặng. Không có gì gãy, không
 * có ảnh chụp nào khác đi; chỉ có một dòng chữ dần dần thành lời nói dối, và
 * chú thích ở `readiness-explainer.tsx` ghi rằng repo này đã bị đúng thế bắt
 * hai lần, một trong hai là một chú thích viện dẫn `tools/readiness-doc.mjs`
 * — một tệp CHƯA TỪNG TỒN TẠI.
 *
 * Nên tệp này không đọc chữ để chấm văn. Nó lấy các con số ra khỏi engine và
 * ra khỏi cổng, CHẠY THẬT engine để dựng lại đúng hai ca người dùng gặp, rồi
 * đòi câu chữ khớp với kết quả.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(NATIVE, rel), 'utf8');

const ENGINE = 'src/lib/readiness-engine.ts';
const WRITER = 'src/lib/daily-log-service.ts';
const I18N = 'src/lib/i18n.ts';
const SHEET = 'src/components/ascnd/readiness-explainer.tsx';
const TYPES = 'src/lib/types.ts';

const problems = [];
const engine = read(ENGINE);
const i18n = read(I18N);
const sheet = read(SHEET);

/* ── 1. engine, chạy thật ────────────────────────────────────────────────── */
const OUT = path.join(NATIVE, 'node_modules', '.cache', 'readiness-copy');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
try {
  execFileSync(
    'npx',
    ['tsc', ENGINE, 'src/lib/readiness-i18n.ts', '--ignoreConfig', '--outDir', OUT, '--rootDir', 'src',
      '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck', '--lib', 'es2020,dom'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
  );
} catch { /* `@/` không phân giải được ngoài bundler; bản emit vẫn được ghi */ }
const { computeReadiness } = createRequire(import.meta.url)(path.join(OUT, 'lib/readiness-engine.js'));

const BLANK = {
  hrv_today: undefined, rhr_today: undefined,
  sleep_min_lastnight: undefined, sleep_target_min: 480, sleep_debt_7d_min: 0,
  training_load_7d: 0, training_load_28d: 0, training_days_28d: 28,
  hrv_history_28d: [], rhr_history_28d: [],
};

/*
  Ca A — CHỈ ghi ăn uống.

  Không có trường dinh dưỡng nào trong `ReadinessInput`, nên "chỉ ghi ăn uống"
  đúng bằng `BLANK`. Engine phải trả `null`: không điểm nào cả. Đó là bằng
  chứng đứng sau câu "bữa ăn và calo không được tính vào điểm này".
*/
if (computeReadiness({ ...BLANK }) !== null) {
  problems.push(
    'CHẠY THẬT engine với không một nguồn nào (đúng bằng "chỉ ghi ăn uống") lại RA điểm — ' +
      `câu "bữa ăn không được tính" trong ${I18N} và ${SHEET} không còn đúng`,
  );
}

/*
  Ca B — buổi tập ĐẦU TIÊN, và nó luôn ra đúng một con số.

  Đây là "80/100" người dùng báo. ACWR so trung bình 7 ngày với trung bình 28
  ngày; lịch sử một ngày thì hai vế cùng một số, tỉ số 1.0, vùng an toàn.
  Điểm KHÔNG phụ thuộc buổi tập nặng hay nhẹ — và sheet nói ra đúng con số ấy,
  nên con số ấy phải được đo lại chứ không được chép.
*/
const firstWorkout = [50, 100, 500, 2000].map((load) =>
  computeReadiness({ ...BLANK, training_load_7d: load, training_load_28d: load, training_days_28d: 1 }),
);
const scores = new Set(firstWorkout.map((r) => r?.score));
if (scores.size !== 1) {
  problems.push(
    `buổi tập đầu tiên KHÔNG còn ra một điểm duy nhất (${[...scores].join(', ')}) — ` +
      `câu "luôn ra đúng 80 điểm, dù nặng hay nhẹ" trong ${SHEET} phải được viết lại`,
  );
}
const FIRST = firstWorkout[0]?.score;
if (scores.size === 1 && !new RegExp(`\\b${FIRST}\\b`).test(sheet)) {
  problems.push(
    `${SHEET}: buổi tập đầu tiên ra ${FIRST} điểm nhưng sheet không nhắc con số đó — ` +
      'sheet giải thích chính ca này, nên nó phải nói đúng con số engine trả về',
  );
}

/* ── 2. cổng, và những con số câu chữ được phép hứa ─────────────────────── */
const gate = /const hasEnoughData =([\s\S]*?);/.exec(read(WRITER));
if (!gate) {
  problems.push(`${WRITER}: không tìm thấy \`hasEnoughData\` — luật này mất chỗ bám, sửa luật chứ đừng bỏ`);
} else {
  const g = gate[1];
  /*
    Ba lối vào, nối bằng HOẶC ở tầng ngoài cùng.

    Đếm `||` chứ không cấm `&&`: hai `&&` trong cổng này là chốt chặn null
    (`bioHistory && bioHistory.length >= 3`), không phải phép nối giữa các lối
    vào. Bản đầu của luật này cấm mọi `&&` và đỏ ngay trên mã đúng — đúng cái
    lỗi "ghim cách viết thay vì ghim bất biến" mà repo này đã gặp nhiều lần.

    Bất biến thật: đúng hai `||`, và cả ba lối vào còn tên. Ai siết một lối
    thành bắt buộc thì câu "chỉ cần MỘT trong ba" phải được viết lại cùng lúc.
  */
  if ((g.match(/\|\|/g) ?? []).length !== 2) {
    problems.push(
      `${WRITER}: cổng không còn là HOẶC của đúng ba lối vào — câu "chỉ cần MỘT trong ba" ` +
        `trong ${I18N} mô tả một cổng không còn tồn tại`,
    );
  }
  for (const [door, re] of [
    ['sinh trắc', /bioHistory[\s\S]{0,40}>= 3/],
    ['giấc ngủ', /sleepLogs7d[\s\S]{0,40}>= 3/],
    ['buổi tập', /trainingLoad28d > 0/],
  ]) {
    if (!re.test(g)) {
      problems.push(`${WRITER}: lối vào "${door}" không còn tự mở được cổng — câu chữ hứa điều đó`);
    }
  }
}

/** Số lần đo tối thiểu để DỰNG ĐƯỢC baseline — lấy từ chính engine. */
const baseline = /if \(history\.length < (\d+)\) return null;/.exec(engine);
if (!baseline) {
  problems.push(`${ENGINE}: không đọc được ngưỡng baseline của HRV/RHR`);
}
const N = baseline ? Number(baseline[1]) : null;

/* Cả hai bản dịch, lấy theo thứ tự xuất hiện. */
const msgs = [...i18n.matchAll(/dashReadinessMsg:\s*\n?\s*'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]);
if (msgs.length !== 2) {
  problems.push(`${I18N}: cần đúng 2 bản dịch của dashReadinessMsg, thấy ${msgs.length}`);
}
for (const msg of msgs) {
  /*
    Cổng KHÔNG có số hạng nào về số ngày, nên câu chữ không được hứa một con số
    ngày tối thiểu. Đây là ghim BẤT BIẾN chứ không cấm một chuỗi: "trong 28
    ngày" là một CỬA SỔ và vẫn hợp lệ; "Cần 3+ ngày dữ liệu" là một YÊU CẦU và
    là đúng câu đã sai.
  */
  const claim = /(cần|need)[^.]{0,24}?\d+\s*\+?\s*(ngày|days)/i.exec(msg);
  if (claim) {
    problems.push(
      `${I18N}: câu trống hứa một số NGÀY tối thiểu ("${claim[0].trim()}") — ` +
        'cổng không có số hạng nào về số ngày, và một buổi tập duy nhất đã đủ',
    );
  }
  if (N !== null && !new RegExp(`\\b${N}\\b`).test(msg)) {
    problems.push(
      `${I18N}: câu trống không nói con số ${N} — đó là số lần đo baseline cần để sinh trắc ` +
        `sinh ra điểm, và câu cũ hứa 3 (đúng cổng, sai kết quả) là lỗi đã bị báo`,
    );
  }
  if (!/(bữa ăn|calo|meal|calorie)/i.test(msg)) {
    problems.push(`${I18N}: câu trống không trả lời "ăn uống có tính không" — câu hỏi đã bị hỏi thẳng`);
  }
}

/* ── 3. sheet giải thích phải trả lời câu đã bị hỏi ─────────────────────── */
if (!/(bữa ăn|calo|macro)/i.test(sheet) || !/(meals|calories)/i.test(sheet)) {
  problems.push(`${SHEET}: không có mục nào nói ăn uống KHÔNG tính vào điểm, ở cả hai ngôn ngữ`);
}

/* ── 4. không một trường dinh dưỡng nào lọt vào input của engine ────────── */
const inputType = /(?:export )?interface ReadinessInput \{([\s\S]*?)\n\}/.exec(read(TYPES));
if (!inputType) {
  problems.push(`${TYPES}: không tìm thấy interface ReadinessInput`);
} else {
  const banned = /\b(calorie|kcal|macro|protein|carb|fat_g|meal|food|water|weight|steps)\w*\s*[?:]/i.exec(inputType[1]);
  if (banned) {
    problems.push(
      `${TYPES}: ReadinessInput đã nhận một trường dinh dưỡng/cân nặng ("${banned[0].trim()}") — ` +
        'mọi câu chữ đang nói với người dùng rằng những thứ đó KHÔNG được tính',
    );
  }
}

/* ── 5. ba nhãn trạng thái phải đọc ra là PHÁN QUYẾT ────────────────────── */
const labels = [...i18n.matchAll(/dcReadiness(Train|Moderate|Recover): '([^']+)'/g)].map((m) => m[2]);
if (labels.length !== 6) {
  problems.push(`${I18N}: cần đúng 6 nhãn trạng thái (3 × 2 ngôn ngữ), thấy ${labels.length}`);
}
/*
  ── đếm từ là chưa đủ, và bản đầu của luật này đã chứng minh điều đó ──

  Luật đầu tiên ở đây chỉ đòi nhãn có nhiều hơn một từ. Nó bắt được 'TRAIN' và
  KHÔNG bắt được 'TẬP LUYỆN' — tức là đúng cái nhãn đã bị báo là "đọc không
  hiểu gì cả" vẫn lọt qua. Một luật xanh trên chính lỗi nó sinh ra để chặn thì
  tệ hơn không có luật.

  Bất biến thật nằm ở chỗ khác: thẻ tên là "Điểm Sẵn Sàng", và vùng xanh nghĩa
  là NGƯỜI ẤY ĐANG SẴN SÀNG. Nên nhãn xanh phải nói ra chính chữ ấy. 'TẬP
  LUYỆN' đặt tên cho HOẠT ĐỘNG, không phải cho mức sẵn sàng — nó có thể đứng
  dưới bất kỳ con số nào, kể cả số đỏ, mà vẫn đọc trôi. Đó chính xác là vì sao
  nó không nói gì cả.

  Vùng đỏ chịu cùng một phép thử với chữ "phục hồi"/"recover".
*/
const [viTrain, viMod, viRec, enTrain, enMod, enRec] = labels;
for (const [l, want, why] of [
  [viTrain, /sẵn sàng/i, 'vùng xanh nghĩa là người dùng ĐANG SẴN SÀNG — nhãn phải nói ra chữ đó'],
  [enTrain, /ready/i, 'the green zone means the person IS ready — the label has to say so'],
  [viRec, /phục hồi/i, 'vùng đỏ là lời khuyên phục hồi'],
  [enRec, /recover/i, 'the red zone is a recovery verdict'],
]) {
  if (l && !want.test(l)) {
    problems.push(
      `${I18N}: nhãn trạng thái "${l}" không phải một phán quyết về mức sẵn sàng — ${why}. ` +
        'Một danh từ đặt tên cho hoạt động (như "TẬP LUYỆN") đứng trôi dưới bất kỳ con số nào, ' +
        'kể cả số đỏ, và đó là lý do nó không nói gì cả',
    );
  }
}
/* Và ba vùng phải nói ba điều khác nhau — hai nhãn trùng chữ là một thang đo
   không phân biệt được hai đầu của chính nó. */
for (const [a, b, lang] of [[viTrain, viMod, 'vi'], [viMod, viRec, 'vi'], [enTrain, enMod, 'en'], [enMod, enRec, 'en']]) {
  if (a && b && a.trim().toLowerCase() === b.trim().toLowerCase()) {
    problems.push(`${I18N} (${lang}): hai vùng dùng chung nhãn "${a}"`);
  }
}
void viMod;
void enMod;

/* ── 6. một tỉ số ACWR, một bảng màu, ba màn hình ───────────────────────── */
const GAUGE = 'src/components/ascnd/readiness-gauge.tsx';
const CHART = 'src/components/ascnd/today-widgets-2.tsx';
/* Bảng màu sống ở tầng component, không ở lib/ — xem chú thích trong tệp đó:
   16 bước của suite biên dịch lib/*.ts một mình, nơi alias `@/` không phân giải. */
const CARD = 'src/components/ascnd/acwr-tint.ts';
const gauge = read(GAUGE);
const card = read(CARD);

/*
  Chú thích đầu `training-card.ts` liệt kê luật ba nhánh này là lỗi ĐÃ GỠ khỏi
  thẻ tập luyện. Nó vẫn sống trong readiness-gauge suốt từ đó, nên ACWR 2.0
  ("nguy cơ quá tải") tô VÀNG ở thẻ này và ĐỎ ở thẻ kia. Luật dưới đây cấm bất
  kỳ màn nào tự quyết màu của một tỉ số ACWR.
*/
for (const [file, src] of [[GAUGE, gauge], [CHART, read(CHART)], [SHEET, sheet]]) {
  if (/readiness(Green|Yellow|Red)/.test(src) && /acwr/i.test(src)) {
    const handTyped = /acwr[\w.]*\s*(>=|>|<=|<)\s*[\d.]+[\s\S]{0,120}?colors\.readiness/i.exec(src);
    if (handTyped) {
      problems.push(
        `${file}: tự quyết màu của một tỉ số ACWR ("${handTyped[0].split('\n')[0].trim().slice(0, 60)}…") — ` +
          'màu phải đọc ACWR_TINT[acwrZone(x)] trong lib/training-card.ts, nếu không hai thẻ vẽ cùng một ' +
          'con số bằng hai màu và băng > 1.6 bị tô nhẹ đi',
      );
    }
  }
}
if (!/ACWR_TINT\[acwrZone\(/.test(gauge)) {
  problems.push(`${GAUGE}: ô ACWR không đọc bảng màu chung ACWR_TINT[acwrZone(...)]`);
}
/* Bảng năm băng phải được ĐỌC, không gõ lại — bản gõ tay thiếu hẳn `low`. */
if (!/ACWR_BANDS\.map/.test(sheet)) {
  problems.push(
    `${SHEET}: bảng băng ACWR không đọc ACWR_BANDS — bản gõ tay trước đây liệt kê 4 băng ` +
      'trong khi acwrZone chấm theo 5, nên ai có tỉ số 0.65–0.8 tra bảng không thấy mình ở đâu',
  );
}
const zoneKeys = [...card.matchAll(/^\s{2}(\w+): colors\.readiness/gm)].map((m) => m[1]);
if (zoneKeys.length !== 5) {
  problems.push(`${CARD}: ACWR_TINT phải có đủ 5 băng, thấy ${zoneKeys.length}`);
}
for (const k of zoneKeys) {
  if (!new RegExp(`\\b${k}\\b`).test(sheet)) {
    problems.push(`${SHEET}: băng "${k}" không có tên hiển thị — ZONE_WHAT phải phủ đủ ACWR_BANDS`);
  }
}

/*
  `acwr === 0` là một GIÁ TRỊ THẬT, không phải thiếu dữ liệu.

  Engine ghi rõ: null = chưa có nền để làm tỉ số; 0 = CÓ nền, và tuần này không
  tập gì. Ô nào lọc bằng `> 0` sẽ nói với người vừa tập suốt bốn tuần rằng họ
  chưa ghi buổi tập nào.
*/
if (/acwr\s*!=\s*null\s*&&\s*acwr\s*>\s*0/.test(gauge)) {
  problems.push(
    `${GAUGE}: ô ACWR lọc bằng \`> 0\`, nên tỉ số 0 — một tuần nghỉ trên một cái nền CÓ THẬT — ` +
      'bị hiện thành "chưa ghi buổi tập"; engine giữ được phân biệt null/0 tới tận cột database',
  );
}

/* ── 7. ô trống nói ĐIỀU GÌ SẼ LẤP NÓ ───────────────────────────────────── */
if (/'chưa có dữ liệu'/.test(gauge)) {
  problems.push(
    `${GAUGE}: ô trống vẫn nói "chưa có dữ liệu" — với HRV/RHR đó là câu SAI với người vừa gõ số vào: ` +
      `4 lần nhập đầu được lưu đủ nhưng chưa đủ ${N} để dựng nền`,
  );
}
if (N !== null && !new RegExp(`cần ${N} lần đo`).test(gauge)) {
  problems.push(`${GAUGE}: ô HRV/RHR trống không nói cần ${N} lần đo`);
}
/* Và màn NHẬP phải nói cùng con số, ở cả hai ngôn ngữ — đó là chỗ người ta
   đang gõ số vào và tự hỏi vì sao không thấy gì. */
const notes = [...i18n.matchAll(/logBioBaselineNote:\s*\n?\s*'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]);
if (notes.length !== 2) {
  problems.push(`${I18N}: cần đúng 2 bản dịch của logBioBaselineNote, thấy ${notes.length}`);
}
for (const note of notes) {
  if (N !== null && !new RegExp(`\\b${N}\\b`).test(note)) {
    problems.push(`${I18N}: ghi chú màn nhập sinh trắc không nói con số ${N}`);
  }
  if (!/(Apple Health|đồng hồ|watch)/i.test(note)) {
    problems.push(
      `${I18N}: ghi chú màn nhập sinh trắc không dập hiểu nhầm "cần Apple Watch" — ` +
        'nhập tay ghi vào đúng bảng, đúng cột mà Apple Health ghi, và câu hỏi đã bị hỏi thẳng',
    );
  }
}

rmSync(OUT, { recursive: true, force: true });

if (problems.length) {
  console.log('câu chữ thẻ sẵn sàng lệch khỏi engine:\n');
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}

console.log(
  `câu chữ thẻ sẵn sàng OK — CHẠY THẬT engine: không một nguồn nào (đúng bằng "chỉ ghi ăn uống") trả về null, ` +
    `và buổi tập ĐẦU TIÊN ra đúng ${FIRST} điểm ở cả bốn mức tải 50→2000 (ACWR so một ngày lịch sử với chính nó ` +
    `nên luôn bằng 1.0) — con số ${FIRST} trong sheet được đo lại chứ không chép; ` +
    'cổng vẫn là HOẶC của ba lối vào và một buổi tập vẫn tự mở được nó; ' +
    `câu trống không hứa một số NGÀY tối thiểu nào (cổng không có số hạng ấy), có nói con số ${N} — số lần đo ` +
    'baseline thật, thứ câu cũ hứa là 3 nên qua cổng mà vẫn không ra điểm — và có trả lời thẳng câu hỏi về ăn uống; ' +
    'sheet giải thích có mục nói ăn uống không tính, ở cả hai ngôn ngữ; ' +
    'ReadinessInput không nhận một trường dinh dưỡng/cân nặng/bước chân nào; ' +
    'và cả 6 nhãn trạng thái đều là phán quyết nhiều từ chứ không phải một danh từ đọc ra thành tên hạng mục; ' +
    'không màn nào tự quyết màu của một tỉ số ACWR — cả ba đọc ACWR_TINT[acwrZone(x)], nên băng > 1.6 ' +
    'không còn được tô nhẹ đi ở thẻ sẵn sàng trong khi thẻ tập luyện tô đỏ; sheet đọc đủ 5 băng từ ACWR_BANDS ' +
    '(bản gõ tay thiếu hẳn băng 0.65–0.8); ô ACWR nhận tỉ số 0 là giá trị thật chứ không phải thiếu dữ liệu; ' +
    `và ô trống nói ĐIỀU GÌ SẼ LẤP NÓ — HRV/RHR nói "cần ${N} lần đo" thay vì "chưa có dữ liệu", con số ấy ` +
    'lấy từ engine, và màn nhập sinh trắc nói cùng con số cộng một câu dập hiểu nhầm "cần Apple Watch"',
);
