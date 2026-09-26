/**
 * Một khoá không màn nào dựng là chữ chết, và chữ chết thì mọc.
 *
 * ── lỗi mà luật này ghim ──
 *
 * Luồng onboarding bảy màn bị thay bằng mười ba màn ở Giai đoạn 3. Màn thì
 * thay được; chữ của chúng thì nằm lại. Đếm sau lượt ấy: 49 khoá `onboarding*`
 * không chỗ nào trong `src/` dựng nữa — tên riêng của bảy cái bước không còn
 * tồn tại, `onboardingSelectSupplements` cho một màn đã biến mất, và cả một bộ
 * `onboardingGoal*` trùng nghĩa với bộ `obGoal*` vừa được viết cạnh nó.
 *
 * Không luật nào thấy. `tools/i18n.mjs` nói thẳng ra vì sao: *"Unused keys are
 * ignored. The dictionaries are shared with the web app and a string nobody
 * renders is not a defect in this one."* Câu ấy ĐÃ đúng. Nay thì không:
 * `origin/main` là app web và nó mang `src/lib/i18n.ts` của RIÊNG nó, còn
 * nhánh này xoá `src/` ở gốc và dựng `native/src/lib/i18n.ts` — hai tệp, hai
 * đường dẫn, không tệp nào là tệp kia. Cái lý do giữ rác còn nguyên trong chú
 * thích; sự thật đỡ nó thì đã đi.
 *
 * ── vì sao là một CUỐN SỔ chứ không phải "không được có khoá chết" ──
 *
 * Đo lúc dựng luật này: 440 khoá chết trên 1.468 khoá của hai từ điển — 30%.
 * Một luật đòi số 0 sẽ đỏ ngay phút nó ra đời, và một luật đỏ sẵn thì bị tắt
 * trong một tuần. Nên nó ghim cái đã biết và chặn cái mới: sổ này liệt kê
 * đúng những khoá đang chết HÔM NAY, và
 *
 *     một khoá chết KHÔNG có trong sổ  →  ĐỎ   (rác mới, chặn tại chỗ sinh)
 *     một dòng sổ KHÔNG còn chết nữa   →  ĐỎ   (sổ phải ngắn đi, không dài ra)
 *
 * Vế thứ hai mới là cái làm sổ này khác một danh sách bỏ qua: xoá một khoá
 * chết BẮT BUỘC phải xoá dòng sổ của nó, nên cuốn sổ không thể phình lên và
 * không thể nói dối về kích thước của mình. Nó là một khoản nợ có số dư, và
 * số dư chỉ được giảm.
 *
 * ── tiền tố ghép động được ĐỌC NGƯỢC ra khỏi mã, không gõ tay ──
 *
 * `exercise-insight.tsx` dựng khoá lúc chạy: i18n[`nXiTrend${i.trend}`]. Một
 * phép quét tên khoá không thấy `nXiTrendPLATEAU` ở đâu cả và sẽ khai tử một
 * khoá đang được dựng. Nên luật tìm chính cái khuôn ấy — [`TÊN${ — trong mã
 * và miễn trừ mọi khoá mang tiền tố tìm được. Gõ tay danh sách ấy nghĩa là
 * người thêm một họ khoá động mới sẽ bị luật khai tử nhầm, đúng lúc họ không
 * hiểu vì sao.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(NATIVE, 'src');

/** Hai từ điển của app. Đường dẫn tương đối với `src/`. */
const DICTS = ['lib/i18n.ts', 'lib/native-strings.ts'];

function walk(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.tsx?$/.test(e.name)) acc.push(p);
  }
  return acc;
}

const dictPaths = DICTS.map((d) => path.join(SRC, d));
const files = walk(SRC);
const usage = files.filter((f) => !dictPaths.includes(f)).map((f) => readFileSync(f, 'utf8')).join('\n');

/* Mọi tiền tố mà mã nguồn ghép khoá từ đó lúc chạy. Đọc ra, không gõ vào. */
const dynamic = [...new Set([...usage.matchAll(/\[`([A-Za-z][A-Za-z0-9_]*)\$\{/g)].map((m) => m[1]))];

const dead = [];
const counts = {};
for (const dp of dictPaths) {
  const text = readFileSync(dp, 'utf8');
  const keys = [...new Set([...text.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9_]*)\??:/gm)].map((m) => m[1]))];
  const gone = keys.filter(
    (k) => !new RegExp(`\\b${k}\\b`).test(usage) && !dynamic.some((p) => k.startsWith(p)),
  );
  counts[path.relative(SRC, dp)] = { keys: keys.length, gone: gone.length };
  dead.push(...gone);
}
const now = new Set(dead);

/*
  ── SỔ NỢ ──

  Mỗi dòng là một khoá không màn nào dựng, tính đến lượt chốt sổ. Thêm một
  dòng vào đây là một quyết định phải giải trình trong commit message; xoá một
  dòng là việc đúng đắn và không cần giải trình gì cả.
*/
const LEDGER = new Set([
  'grocerySubtitle',
  'mealPlanTitle',
  'nSessions',
  'nSteps',
  'nXiE1rmNote',
  'workoutsVolume',
]);

const problems = [];

const fresh = [...now].filter((k) => !LEDGER.has(k)).sort();
if (fresh.length) {
  problems.push(
    `${fresh.length} khoá chết KHÔNG có trong sổ — không màn nào dựng chúng: ${fresh.slice(0, 12).join(', ')}` +
      (fresh.length > 12 ? `, … (+${fresh.length - 12})` : '') +
      '. Hoặc dựng chúng, hoặc xoá chúng. Ghi thêm vào sổ là lựa chọn cuối cùng và phải nói rõ vì sao.',
  );
}

const stale = [...LEDGER].filter((k) => !now.has(k)).sort();
if (stale.length) {
  problems.push(
    `${stale.length} dòng sổ không còn đúng — khoá ấy đã được xoá hoặc đã được dựng lại: ${stale.slice(0, 12).join(', ')}` +
      (stale.length > 12 ? `, … (+${stale.length - 12})` : '') +
      '. Xoá những dòng ấy khỏi sổ: sổ chỉ được phép ngắn đi.',
  );
}

if (problems.length) {
  console.error('khoá mồ côi CÓ LỖI:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

const total = Object.values(counts).reduce((a, c) => a + c.keys, 0);
console.log(
  `khoá mồ côi OK — ${LEDGER.size} khoá chết đã ghi sổ trên ${total} khoá của hai từ điển ` +
    `(${Object.entries(counts).map(([f, c]) => `${f}: ${c.gone}/${c.keys}`).join(' · ')}); ` +
    `không có khoá chết nào ngoài sổ, và không dòng sổ nào đã hết đúng — nên cuốn sổ này chỉ ngắn đi được. ` +
    `${dynamic.length} tiền tố ghép động (${dynamic.join(', ')}) được đọc NGƯỢC ra khỏi mã và miễn trừ, ` +
    `nên một họ khoá dựng bằng template literal không bị khai tử nhầm`,
);
