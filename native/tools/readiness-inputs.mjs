/**
 * Một đầu vào chỉ được kể tên trong tài liệu nếu có thứ thật sự cấp nó.
 *
 *     node tools/readiness-inputs.mjs
 *
 * ── lỗi nó sinh ra để sửa ──
 *
 * `docs/fitness-scores.md` mở đầu bằng lời hứa của chính nó: mỗi con số app nói
 * ra được trả lời bằng tám câu, và câu quan trọng nhất là *"thiếu dữ liệu thì
 * sao"*. Dòng **Đầu vào** của điểm sẵn sàng ghi:
 *
 *     HRV, nhịp tim nghỉ, giấc ngủ đêm qua, tải tập 7d/28d (+ cờ ốm, cờ đau,
 *     mức đau nhức)
 *
 * Ba thứ trong ngoặc không bao giờ tới được engine:
 *
 *     readiness-engine.ts:202   soreness > 6         → trừ điểm tải tập
 *     readiness-engine.ts:365   illness_flag         → chặn trần 35
 *     readiness-engine.ts:366   pain_flag_max >= 7   → chặn trần 45
 *
 *     daily-log-service.ts      soreness_today: undefined
 *                               illness_flag: false
 *                               pain_flag_max: undefined
 *
 * Đó là chỗ DUY NHẤT dựng `ReadinessInput` trong cả app. Không màn nào hỏi ba
 * câu ấy, nên ba nhánh trên chưa chạy một lần nào trong đời app — và tài liệu
 * thì kể chúng ra như đầu vào đang hoạt động.
 *
 * Cùng hình dạng với `pain_flags: []` mà `empty-writer.mjs` bắt ở đường GHI:
 * **một giá trị hằng đi vào chỗ đáng lẽ là dữ liệu**. Khác ở chỗ hằng này không
 * đi xuống cơ sở dữ liệu, nó đi lên một công thức — nên không luật nào của kho
 * nhìn thấy, và bản duy nhất mô tả nó là văn xuôi.
 *
 * ── vì sao `score-doc.mjs` không bắt được ──
 *
 * `score-doc.mjs` canh đúng tệp này, và canh rất chặt: mọi CON SỐ trong tài liệu
 * được lấy ngược ra và so với giá trị app dùng thật. Dòng **Đầu vào** không có
 * con số nào — nó là một danh sách TÊN. Vùng mù không phải ở tệp, mà ở kiểu
 * khẳng định: một cái tên sai trôi qua một luật chỉ biết đọc số.
 *
 * ── luật, hai vế ──
 *
 * 1. Tài liệu **không được** kể tên một đầu vào bị gõ cứng thành hằng.
 * 2. Tài liệu **phải** kể tên mọi đầu vào thật sự được cấp — nếu không nó đi
 *    theo hướng ngược lại, thành mơ hồ, và `score-doc.mjs` đã ghi vì sao mơ hồ
 *    cũng là hỏng: *"một khẳng định không chốt được chính là thứ sẽ trôi"*.
 *
 * Và một vế gác, cùng khuôn `muted-ground.mjs` đặt cho `mutedOnInset`: mục giải
 * thích ba nhánh chết trong tài liệu chỉ đúng chừng nào ba nhánh ấy CÒN chết.
 * Ngày nào có ô nhập thật, `illness_flag` thôi là `false` gõ cứng, thì mục ấy
 * thành sai theo chiều ngược — và luật phải nói ra thay vì để nó nằm đó.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { NATIVE } from './lib/stack.mjs';

const problems = [];
const SERVICE = 'src/lib/daily-log-service.ts';
const ENGINE = 'src/lib/readiness-engine.ts';
const DOC = 'docs/fitness-scores.md';

const read = (rel) => readFileSync(path.join(NATIVE, rel), 'utf8');
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/.*$/gm, '');

/**
 * Các trường của `ReadinessInput`, tách theo dấu phẩy ở CẤP NGOÀI CÙNG.
 *
 * Không tách bằng `split(',')`: `rhr_today` là một biểu thức ba ngôi có `?.[0]`
 * và một lời gọi `Number(...)`, và một trong các nhánh của nó đúng là chữ
 * `undefined`. Cắt thô sẽ đọc ra "`rhr_today` bị gõ cứng thành undefined" —
 * một lời tố cáo sai nhắm vào đầu vào quan trọng thứ hai của cả công thức.
 */
function fieldsOf(src) {
  const start = src.indexOf('const input: ReadinessInput = {');
  if (start < 0) return null;
  let i = src.indexOf('{', start) + 1;
  let depth = 0;
  let buf = '';
  const parts = [];
  for (; i < src.length; i++) {
    const ch = src[i];
    if (depth === 0 && ch === '}') break;
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) {
      parts.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  parts.push(buf);
  const out = new Map();
  for (const p of parts) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:([\s\S]*)$/.exec(p);
    if (m) out.set(m[1], m[2].trim());
  }
  return out;
}

/** Một giá trị KHÔNG mang tin: hằng gõ thẳng tại chỗ. */
const isConstant = (v) => /^(undefined|null|true|false|-?\d+(\.\d+)?|\[\]|\{\})$/.test(v);

/**
 * Tên tiếng Việt mà tài liệu dùng cho từng trường.
 *
 * `history` và `target`/`debt` là phụ kiện của bốn chiều chính (nền để chuẩn hoá,
 * mục tiêu để so) chứ không phải chiều thứ năm, nên chúng không đòi có tên riêng
 * trong dòng một dòng ấy — `needsName: false`.
 */
const FIELDS = {
  hrv_today: { alias: [/\bHRV\b/], needsName: true },
  rhr_today: { alias: [/nhịp tim nghỉ/i], needsName: true },
  sleep_min_lastnight: { alias: [/giấc ngủ/i], needsName: true },
  training_load_7d: { alias: [/tải tập/i], needsName: true },
  training_load_28d: { alias: [/tải tập/i], needsName: true },
  soreness_today: { alias: [/đau nhức/i, /\bsoreness\b/i], needsName: true },
  illness_flag: { alias: [/cờ ốm/i, /\bốm\b/i], needsName: true },
  pain_flag_max: { alias: [/cờ đau/i], needsName: true },
  sleep_target_min: { needsName: false },
  sleep_debt_7d_min: { needsName: false },
  training_days_28d: { needsName: false },
  hrv_history_28d: { needsName: false },
  rhr_history_28d: { needsName: false },
};

const service = stripComments(read(SERVICE));
const fields = fieldsOf(service);
if (!fields) {
  console.error('không tìm được chỗ dựng đầu vào điểm sẵn sàng:');
  console.error(
    `  ✗ ${SERVICE}: không còn \`const input: ReadinessInput = {\` — chỗ DUY NHẤT dựng đầu vào của engine `
      + 'đã đổi hình. Luật này đang canh một thứ không tồn tại; đọc lại bằng mắt rồi sửa nó',
  );
  process.exit(1);
}

/* Dòng "Đầu vào" của MỤC 1, không phải của mục khác: tài liệu có tám mục và mỗi
   mục có một dòng cùng tên. */
const doc = read(DOC);
const sec = doc.slice(
  doc.indexOf('## 1. Điểm sẵn sàng'),
  doc.indexOf('## 2.') > 0 ? doc.indexOf('## 2.') : undefined,
);
const rowM = /\|\s*\*\*Đầu vào\*\*\s*\|([^|]*)\|/.exec(sec);
if (!rowM) {
  console.error('không tìm được dòng "Đầu vào" của điểm sẵn sàng:');
  console.error(
    `  ✗ ${DOC}: mục 1 không còn hàng \`| **Đầu vào** |\`. Bảng tám câu là hình dạng cả tài liệu dựa vào; `
      + 'nếu nó đổi thật thì sửa luật, đừng để luật xanh suông',
  );
  process.exit(1);
}
const row = rowM[1];

const supplied = [];
const dead = [];
for (const [name, spec] of Object.entries(FIELDS)) {
  if (!fields.has(name)) {
    problems.push(
      `${SERVICE}: đầu vào \`${name}\` không còn được truyền cho engine. Nếu nó bị bỏ thật thì bỏ luôn `
        + `khỏi \`FIELDS\` ở đây và khỏi ${DOC}; còn nếu đây là sơ suất thì engine đang chấm thiếu một chiều`,
    );
    continue;
  }
  const constant = isConstant(fields.get(name));
  (constant ? dead : supplied).push(name);
  if (!spec.needsName) continue;
  const named = spec.alias.some((re) => re.test(row));

  /* Vế 1 — kể tên một thứ không tồn tại. */
  if (constant && named) {
    problems.push(
      `${DOC}: dòng "Đầu vào" của điểm sẵn sàng kể \`${name}\`, nhưng ${SERVICE} gõ cứng nó thành `
        + `\`${fields.get(name)}\` — một hằng, ở chỗ DUY NHẤT dựng \`ReadinessInput\`. Không màn nào hỏi câu `
        + 'ấy, nên nhánh trong engine chưa chạy lần nào. Tài liệu này tồn tại để nói con số dựa trên gì; '
        + 'kể ra một đầu vào không có thật là đúng thứ nó hứa sẽ không làm',
    );
  }
  /* Vế 2 — có thật mà không kể. */
  if (!constant && !named) {
    problems.push(
      `${DOC}: \`${name}\` ĐƯỢC cấp thật (\`${fields.get(name).slice(0, 40)}\`) nhưng dòng "Đầu vào" không `
        + 'kể tên nó. Một danh sách đầu vào thiếu một đầu vào thì người đọc kết luận sai về chỗ con số đến từ '
        + 'đâu, và đó là câu hỏi duy nhất mục ấy có nhiệm vụ trả lời',
    );
  }
}

/*
  Vế gác: mục giải thích ba nhánh chết chỉ đúng chừng nào chúng CÒN chết.

  Hai điều kiện, và phải đủ cả hai. Engine còn nhánh (nếu không thì mục giải
  thích nói về mã không tồn tại), và không có gì cấp cho nhánh ấy (nếu đã có thì
  câu "chưa từng chạy một lần nào" thành sai theo chiều ngược lại). Cùng khuôn
  `muted-ground.mjs` đặt cho `mutedOnInset`: một ngoại lệ phải chết khi lý do của
  nó chết.
*/
const engine = stripComments(read(ENGINE));
const NOTE = 'Ba đầu vào mà dòng trên từng kể ra';
if (doc.includes(NOTE)) {
  for (const name of ['soreness_today', 'illness_flag', 'pain_flag_max']) {
    const short = name.replace('_today', '').replace('_flag_max', '').replace('_flag', '');
    if (!engine.includes(short)) {
      problems.push(
        `${ENGINE}: không còn nhắc \`${short}\` — mục "${NOTE}" trong ${DOC} mô tả một nhánh engine đã bị `
          + 'gỡ. Mục ấy nay nói về mã không tồn tại; xoá nó đi',
      );
    }
    if (fields.has(name) && !isConstant(fields.get(name))) {
      problems.push(
        `${DOC}: \`${name}\` nay được cấp thật, nên mục "${NOTE}" — nói ba nhánh ấy "chưa từng chạy một lần `
          + 'nào" — thành SAI theo chiều ngược lại. Có ô nhập rồi thì kể nó vào dòng "Đầu vào" và bỏ mục giải '
          + 'thích đi, đừng để một lời cảnh báo đã hết hiệu lực nằm lại',
      );
    }
  }
}

/*
  Và một chỗ thứ hai, vì cái giá ở đó khác hẳn.

  `GLOBAL-LAUNCH.md` mục 4 là chữ để viết vào **ghi chú duyệt HealthKit** —
  người đọc nó là người duyệt của Apple, không phải lập trình viên. Dòng ấy từng
  ghi *"HR/HRV/sleep/steps feed the daily readiness score"*. `ReadinessInput`
  không có trường bước chân nào, và sheet trong app nói ngược lại bằng đúng một
  câu mà `readiness-copy.mjs` đang giữ: *"Bước chân và calo hoạt động không nằm
  trong công thức nào"*.

  Bước chân CÓ đi qua HealthKit — vào vòng hoạt động và thử thách tuần. Nên cái
  sai không phải "app không dùng bước chân", mà là **gán nó cho đúng một công
  thức nó không thuộc về**, trong hồ sơ nộp cho một bên hand-review.
*/
const LAUNCH = 'GLOBAL-LAUNCH.md';
const launch = readFileSync(path.join(NATIVE, LAUNCH), 'utf8');
const claimM = /Explain in the review notes that ([\s\S]{0,200}?)readiness\s+score/.exec(launch);
if (!claimM) {
  problems.push(
    `${LAUNCH}: không còn câu "Explain in the review notes that … readiness score" — mục ghi chú duyệt `
      + 'HealthKit đã viết lại, và đó là chỗ luật này canh. Đọc lại bằng mắt',
  );
} else {
  const listed = claimM[1];
  for (const [word, re] of [['steps', /\bsteps?\b/i], ['active energy', /active (energy|calories)/i]]) {
    if (!re.test(listed)) continue;
    problems.push(
      `${LAUNCH}: ghi chú duyệt HealthKit kể \`${word}\` là thứ nuôi điểm sẵn sàng. \`ReadinessInput\` `
        + 'không có trường nào cho nó, và sheet trong app nói thẳng "Bước chân và calo hoạt động không nằm '
        + 'trong công thức nào". Người đọc dòng ấy là người duyệt của Apple — mô tả một luồng HealthKit '
        + 'không tồn tại là thứ không ai muốn phải giải thích lại sau',
    );
  }
}

if (problems.length) {
  console.error('tài liệu kể sai đầu vào của điểm sẵn sàng:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  `đầu vào điểm sẵn sàng OK — đọc chỗ DUY NHẤT dựng \`ReadinessInput\` (${SERVICE}), tách ${fields.size} `
    + `trường theo dấu phẩy CẤP NGOÀI CÙNG rồi chia hai: ${supplied.length} được cấp thật `
    + `(${supplied.join(', ')}) và ${dead.length} gõ cứng thành hằng (${dead.join(', ')}). Dòng "Đầu vào" `
    + 'của tài liệu phải kể đủ nhóm đầu và không được kể nhóm sau. Vùng mù nó lấp: `score-doc.mjs` canh '
    + 'đúng tệp ấy nhưng chỉ lấy ngược ra các CON SỐ, mà một danh sách TÊN thì không có số nào — nên ba '
    + 'cái tên sai trôi qua từ ngày tài liệu ra đời. Vế gác: nếu một trong ba thôi là hằng thì mục giải '
    + 'thích "chưa từng chạy một lần nào" thành sai theo chiều ngược, và luật nói ra thay vì để nó nằm lại. '
    + 'Chỗ thứ hai được canh là ghi chú duyệt HealthKit ở `GLOBAL-LAUNCH.md` — nó từng kể `steps` là thứ '
    + 'nuôi điểm sẵn sàng, và người đọc dòng ấy là người duyệt của Apple chứ không phải lập trình viên',
);
