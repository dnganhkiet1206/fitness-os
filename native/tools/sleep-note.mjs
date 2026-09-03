/**
 * Chất lượng giấc ngủ dùng để NÓI, và không bao giờ để TÍNH.
 *
 * ── quyết định sản phẩm nó canh ──
 *
 * *"cái này không cần tính bất kì chỉ số gì mà chỉ dựa vào đó để đưa ra nhận
 * xét hoặc lời khuyên có cơ sở giúp người dùng ở trong ringcard ở dashboard"*.
 *
 * Hai vế, và vế thứ hai là vế dễ mất: một hằng số nhỏ thêm vào
 * `computeSleepScore` sẽ không làm gãy gì cả, không đổi một ảnh chụp nào, và
 * sẽ biến MỌI dòng chữ trong bản này thành lời nói dối — vì cả bốn nhận xét
 * đều đứng trên khẳng định "điểm chấm theo THỜI LƯỢNG".
 *
 * ── lỗi nó sửa ──
 *
 * Ô chọn mặt cười 1–10 được lưu vào `sleep_logs.quality`, chiếu sang
 * `daily_logs.sleep_quality`, rồi KHÔNG NƠI NÀO ĐỌC — quét cả `src/` chỉ ra ba
 * dòng, cả ba là type sinh tự động của Supabase. Một ô nhập chết: người dùng
 * trả lời một câu hỏi mỗi sáng và app không bao giờ dùng câu trả lời.
 *
 * ── vì sao CHẠY THẬT chứ không đọc chữ ──
 *
 * Vì thứ đáng sai ở đây là RANH GIỚI VÙNG, và ranh giới thì không đọc ra được:
 * đúng 95% mục tiêu là "đủ giờ" hay "thiếu"? mặt ở giữa có sinh nhận xét không?
 * `sleep_quality` bằng 0 (khởi tạo khi chưa có đêm nào) có bị đọc thành "chấm 0
 * điểm" không? Cả ba đều là một dòng chữ SAI hiện lên thẻ, và không phép đo nào
 * khác trong repo này nhìn thấy chúng.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(NATIVE, rel), 'utf8');
const OUT = path.join(NATIVE, 'node_modules', '.cache', 'sleep-note');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
try {
  execFileSync(
    'npx',
    ['tsc', 'src/lib/sleep-note.ts', '--ignoreConfig', '--outDir', OUT, '--rootDir', 'src',
      '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck', '--lib', 'es2020,dom'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
  );
} catch { /* emit vẫn được ghi */ }
const req = createRequire(import.meta.url);
const JS = path.join(OUT, 'lib/sleep-note.js');
const { sleepNote } = req(JS);

const problems = [];
const T = 480; // mục tiêu 8 tiếng

/** Mọi ca đều có ĐÁP ÁN CỤ THỂ, không có ca nào chỉ "không ném". */
const CASES = [
  // hai con số ĐỒNG Ý
  { n: 'ngủ 8h, tự chấm 9 → khớp, tốt', q: 9, m: 480, want: 'aligned_good', short: 0 },
  { n: 'ngủ 5h, tự chấm 2 → khớp, kém', q: 2, m: 300, want: 'aligned_poor', short: 180 },
  // hai con số KHÔNG khớp — đây mới là phần mang thông tin
  { n: 'ngủ 8h nhưng tự chấm 2 → đủ giờ mà vẫn mệt', q: 2, m: 480, want: 'felt_worse_than_clock', short: 0 },
  { n: 'ngủ 5h nhưng tự chấm 9 → thiếu giờ mà thấy khoẻ', q: 9, m: 300, want: 'felt_better_than_clock', short: 180 },
  // mặt ở giữa: không mâu thuẫn với phép đo nào
  { n: 'tự chấm 5 (mặt bình thường) → không nhận xét', q: 5, m: 300, want: null },
  { n: 'tự chấm 6 → không nhận xét', q: 6, m: 480, want: null },
  // ranh giới vùng, đúng tại mốc
  { n: 'tự chấm ĐÚNG 7 là "thấy khoẻ"', q: 7, m: 480, want: 'aligned_good', short: 0 },
  { n: 'tự chấm ĐÚNG 4 là "thấy mệt"', q: 4, m: 480, want: 'felt_worse_than_clock', short: 0 },
  // ranh giới "đủ giờ" ở 95%
  { n: 'ngủ đúng 95% mục tiêu (456p) vẫn là ĐỦ giờ', q: 9, m: 456, want: 'aligned_good', short: 0 },
  { n: 'ngủ 455p (dưới 95%) là THIẾU giờ', q: 9, m: 455, want: 'felt_better_than_clock', short: 25 },
  // chưa có gì để so
  { n: 'chưa ghi đêm nào (0 phút)', q: 9, m: 0, want: null },
  { n: 'sleep_quality = 0 là CHƯA CHẤM, không phải chấm 0 điểm', q: 0, m: 480, want: null },
  { n: 'chưa chấm (null)', q: null, m: 480, want: null },
  // rác
  { n: 'chất lượng ngoài thang (11)', q: 11, m: 480, want: null },
  { n: 'chất lượng âm', q: -3, m: 480, want: null },
  { n: 'NaN', q: Number.NaN, m: 480, want: null },
  { n: 'phút âm', q: 9, m: -60, want: null },
];

const run = (fn) => {
  const bad = [];
  for (const c of CASES) {
    const got = fn({ quality: c.q, durationMin: c.m, targetMin: T });
    const key = got === null ? null : got.key;
    if (key !== c.want) bad.push(`"${c.n}": ra ${JSON.stringify(key)}, phải là ${JSON.stringify(c.want)}`);
    else if (got && c.short !== undefined && got.shortBy !== c.short) {
      bad.push(`"${c.n}": thiếu ${got.shortBy} phút, phải là ${c.short}`);
    }
  }
  return bad;
};
problems.push(...run(sleepNote));

/* Mục tiêu là của NGƯỜI DÙNG, không phải hằng số 480 gõ cứng. */
if (sleepNote({ quality: 9, durationMin: 380, targetMin: 400 })?.key !== 'aligned_good') {
  problems.push('mục tiêu 400 phút: 380 phút phải là "đủ giờ" — ngưỡng 95% đang bám vào một hằng số thay vì mục tiêu');
}

/* ── vế thứ hai, và là vế dễ mất: KHÔNG được vào công thức ────────────────── */
const engine = read('src/lib/readiness-engine.ts');
if (/quality/i.test(engine)) {
  problems.push(
    'src/lib/readiness-engine.ts: engine đã nhắc tới "quality" — chất lượng tự chấm không được vào công thức, ' +
      'và mọi câu chữ trong bản này đang nói với người dùng rằng điểm chấm theo THỜI LƯỢNG',
  );
}
const types = read('src/lib/types.ts');
const inputType = /interface ReadinessInput \{([\s\S]*?)\n\}/.exec(types);
if (inputType && /quality/i.test(inputType[1])) {
  problems.push('src/lib/types.ts: ReadinessInput đã nhận một trường chất lượng — nó phải ở ngoài công thức');
}
/* Và `computeSleepScore` vẫn chỉ nhận đúng ba thứ nó vẫn nhận. */
if (!/function computeSleepScore\(sleepMin: number \| undefined, targetMin: number, debtMin: number\)/.test(engine)) {
  problems.push(
    'src/lib/readiness-engine.ts: chữ ký computeSleepScore đã đổi — câu "chỉ THỜI LƯỢNG được chấm" ' +
      'trong sheet giải thích và trong nhận xét phải được xem lại cùng lúc',
  );
}

/* ── mọi khoá đều có chữ, ở cả hai ngôn ngữ, và mọi chữ đều được dùng ────── */
const i18n = read('src/lib/i18n.ts');
/*
  Nhận xét được vẽ ở MỘT component, `sleep-note-block.tsx`, và hai thẻ cùng
  dùng nó.

  Bản trước quét thẳng `readiness-gauge.tsx` vì hồi đó đó là chỗ duy nhất vẽ.
  Khi khối được tách ra để thẻ Giấc ngủ cũng hiện được nhận xét, guard mất dấu
  và báo đỏ — nó khớp CHÍNH TẢ trong một tệp, không khớp HÀNH VI.

  Trỏ vào component là mạnh hơn chứ không yếu đi: trước kiểm một chỗ vẽ, nay
  kiểm chỗ vẽ duy nhất mà cả hai thẻ đi qua. Và thêm một luật mới ở dưới: cả
  hai thẻ phải THẬT SỰ dùng nó — vì lý do người dùng yêu cầu chuyện này là
  nhận xét đúng nhưng đứng sai chỗ, và một guard không kiểm chỗ đứng thì không
  ngăn được nó lùi về chỗ cũ.
*/
const block = read('src/components/ascnd/sleep-note-block.tsx');
const lib = read('src/lib/sleep-note.ts');
const KEYS = ['sleepNoteAlignedGood', 'sleepNoteAlignedPoor', 'sleepNoteFeltWorse', 'sleepNoteFeltBetter'];
for (const k of KEYS) {
  const n = (i18n.match(new RegExp(`\\b${k}:\\s*\\n?\\s*'`, 'g')) ?? []).length;
  if (n !== 2) problems.push(`${k}: cần đúng 2 bản dịch, thấy ${n}`);
  /* Khoá sống trong bảng `sleepNoteText` ở `lib/sleep-note.ts`; component chỉ
     gọi bảng ấy. Kiểm ở nơi khoá THẬT SỰ nằm, không ở nơi nó đi qua. */
  if (!lib.includes(`${k}:`)) problems.push(`${k}: thiếu trong bảng sleepNoteText`);
}
/* Hai câu có chỗ điền số phải THẬT SỰ được thay, nếu không người dùng đọc
   nguyên chữ "{short}" trên thẻ. */
for (const k of ['sleepNoteAlignedPoor', 'sleepNoteFeltBetter']) {
  for (const m of i18n.matchAll(new RegExp(`\\b${k}:\\s*\\n?\\s*'((?:[^'\\\\]|\\\\.)*)'`, 'g'))) {
    if (!m[1].includes('{short}')) problems.push(`${k}: câu này phải nói ra số phút thiếu ({short})`);
  }
}
if (!/replace\('\{short\}'/.test(block)) {
  problems.push('sleep-note-block.tsx: không thay {short} bằng số — người dùng sẽ đọc nguyên chữ "{short}"');
}
/* Câu "không tính vào điểm" phải đứng cạnh nhận xét, nếu không nhận xét đọc ra
   thành "cảm giác của bạn đã làm điểm đổi". */
if (!/i18n\.sleepNoteScoreIsDuration/.test(block)) {
  problems.push('sleep-note-block.tsx: nhận xét hiện mà không kèm câu "chất lượng không tính vào điểm"');
}

/*
  Và nhận xét phải tới được CẢ HAI thẻ.

  Lỗi người dùng báo không phải "nhận xét sai" mà là "nhận xét đúng, ở chỗ
  không ai thấy": nó chỉ hiện trong phần chi tiết của thẻ Sẵn sàng, cách thẻ
  Giấc ngủ — nơi con số chất lượng nằm — một thẻ và một cú bấm. Nên chỗ ĐỨNG
  là một phần của bản sửa, và guard phải canh nó.
*/
for (const [f, tên] of [
  ['src/components/ascnd/readiness-gauge.tsx', 'thẻ Sẵn sàng'],
  ['src/components/ascnd/hero-pages.tsx', 'thẻ Giấc ngủ'],
]) {
  if (!read(f).includes('<SleepNoteBlock')) {
    problems.push(`${tên} (${f.split('/').pop()}) không vẽ nhận xét — nó lại nằm ở chỗ người dùng không thấy`);
  }
}
/* Và sheet giải thích nói cùng điều đó, ở cả hai ngôn ngữ. */
const sheet = read('src/components/ascnd/readiness-explainer.tsx');
if (!/chất lượng bạn tự chọn|Mức chất lượng bạn tự chọn/i.test(sheet) || !/quality face you pick/i.test(sheet)) {
  problems.push('readiness-explainer.tsx: mục SLEEP không nói rằng chỉ thời lượng được chấm, ở cả hai ngôn ngữ');
}

/* ── phép tự kiểm ────────────────────────────────────────────────────────── */
const SELF = [
  {
    name: 'coi sleep_quality = 0 là một mức chấm hợp lệ',
    mutate: (src) => src.replace('q < 1 || q > 10', 'q < 0 || q > 10'),
    expect: /CHƯA CHẤM/,
  },
  {
    name: 'bỏ ngưỡng 95%, đòi đúng 100% mục tiêu mới là đủ giờ',
    mutate: (src) => src.replace('const ENOUGH = 0.95;', 'const ENOUGH = 1;'),
    expect: /95% mục tiêu/,
  },
  {
    name: 'cho mặt ở giữa cũng sinh nhận xét',
    mutate: (src) => src.replace('const FELT_POOR = 4;', 'const FELT_POOR = 6;'),
    expect: /mặt bình thường|tự chấm 6/,
  },
];
const selfFail = [];
for (const [i, s] of SELF.entries()) {
  const original = readFileSync(JS, 'utf8');
  const broken = s.mutate(original);
  if (broken === original) {
    selfFail.push(`${s.name}: không đổi được gì — phép thử ngược đang thử một bản y hệt bản thật`);
    continue;
  }
  const p = path.join(OUT, 'lib', `__break-${i}.js`);
  writeFileSync(p, broken);
  const bad = run(req(p).sleepNote);
  if (bad.length === 0) selfFail.push(`${s.name}: bản hỏng vẫn XANH — luật này không bắt được gì`);
  else if (!bad.some((b) => s.expect.test(b))) {
    selfFail.push(`${s.name}: đỏ, nhưng không đúng ca đã dự đoán (${s.expect}); thật ra hỏng ở: ${bad.join('; ')}`);
  }
}
rmSync(OUT, { recursive: true, force: true });

if (selfFail.length) {
  console.error('phép tự kiểm hỏng — đừng tin kết quả:\n');
  for (const s of selfFail) console.error(`  ${s}`);
  process.exit(2);
}
if (problems.length) {
  console.log('nhận xét giấc ngủ sai:\n');
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}

console.log(
  `nhận xét giấc ngủ OK — CHẠY THẬT sleepNote qua ${CASES.length} ca có đáp án cụ thể. Chất lượng tự chấm dùng để ` +
    'NÓI chứ không để TÍNH, và cả hai vế đều được canh: engine không nhắc tới "quality", ReadinessInput không nhận ' +
    'trường nào cho nó, và chữ ký computeSleepScore vẫn đúng ba tham số thời lượng/mục tiêu/nợ — một hằng số nhỏ ' +
    'thêm vào đó sẽ không làm gãy gì cả và sẽ biến mọi dòng chữ ở đây thành lời nói dối. Nhận xét là phép SO hai con ' +
    'số chứ không phải đọc lại con số người dùng vừa gõ: hai ca chúng KHÔNG khớp (đủ giờ mà mệt, thiếu giờ mà khoẻ) ' +
    'là hai ca mang thông tin, còn mặt ở giữa không sinh nhận xét nào vì nó không mâu thuẫn với phép đo. Ranh giới ' +
    'được canh bằng số: đúng 7 là "thấy khoẻ", đúng 4 là "thấy mệt", đúng 95% mục tiêu vẫn là đủ giờ còn 455/480 thì ' +
    'không; sleep_quality = 0 là CHƯA CHẤM chứ không phải chấm 0 điểm (thang bắt đầu từ 1, và 0 là giá trị khởi tạo ' +
    'khi chưa có đêm nào); ngưỡng bám mục tiêu của người dùng chứ không bám hằng số 480. Cả 4 khoá có đủ hai bản ' +
    'dịch, đều được vẽ ra, hai câu có {short} đều được thay bằng số thật, và câu "chất lượng không tính vào điểm" ' +
    `đứng cạnh nhận xét cũng như trong sheet giải thích ở cả hai ngôn ngữ. ${SELF.length} phép thử ngược đều đỏ đúng ca đã dự đoán`,
);
