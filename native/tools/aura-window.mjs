/**
 * Chỉ dựng lớp aura của trang đang xem và hai trang kề.
 *
 * ── lỗi nó sửa ──
 *
 * Today dựng MỘT `ReadinessAura` cho mỗi trang hero, và cả năm đều mounted.
 * Mỗi lớp là một `<Svg>` phủ kín màn hình với vài gradient toả, nằm SAU tấm
 * kính của tấm nội dung — nên mỗi khung hình cuộn, `UIVisualEffectView` phải
 * lấy mẫu lại đúng chồng lớp ấy. Bốn trong năm lớp ở opacity 0: không vẽ ra gì,
 * vẫn nằm trong cây.
 *
 * ── và vì sao ±1 chứ không phải đúng một lớp ──
 *
 * Đây là vế dễ mất, và mất nó thì hỏng theo kiểu nhìn thấy được. Phép chồng-mờ
 * chạy theo NGÓN TAY: `AuraLayer` nội suy opacity từ `deckAt`, nên lúc vuốt
 * được nửa đường thì trang kề phải ĐANG hiện một nửa. Giữ đúng một lớp là nền
 * NHẢY MÀU ở khoảnh khắc cú vuốt chốt — chính điều mà chú thích ở chỗ vẽ nói ra
 * để tránh, và là lý do cơ chế này là chồng-mờ chứ không phải đổi màu.
 *
 * Nên luật này canh hai chiều: cửa sổ phải HẸP (nếu không thì không tiết kiệm
 * gì) và phải ĐỦ RỘNG cho trang kề (nếu không thì nền nhảy). Một luật chỉ canh
 * một chiều sẽ xanh với `<= 0` — bản làm hỏng hình ảnh — hoặc với `<= 99`, bản
 * không sửa gì cả.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(NATIVE, rel), 'utf8');
const TODAY = 'src/app/(tabs)/index.tsx';
const DECK = 'src/components/ascnd/card-deck.tsx';

const problems = [];
const today = read(TODAY);

/* ── 1. cửa sổ tồn tại, và nó đúng bằng ±1 ─────────────────────────────── */
const win = /Math\.abs\(i - (\w+)\) <= (\d+) \?/.exec(today);
if (!win) {
  problems.push(
    `${TODAY}: không còn cửa sổ quanh trang đang xem — cả ${'{n}'} lớp aura toàn màn lại nằm sau tấm ` +
      'kính, và mỗi khung hình cuộn UIVisualEffectView phải lấy mẫu lại tất cả',
  );
} else {
  const [, pageVar, span] = win;
  if (Number(span) < 1) {
    problems.push(
      `${TODAY}: cửa sổ aura hẹp hơn ±1 (±${span}). Trang kề phải ĐANG mounted trong lúc vuốt, vì opacity ` +
        'của nó nội suy từ `deckAt` — giữ đúng một lớp là nền NHẢY MÀU ở khoảnh khắc cú vuốt chốt',
    );
  }
  if (Number(span) > 1) {
    problems.push(
      `${TODAY}: cửa sổ aura rộng hơn ±1 (±${span}) — mỗi lớp thừa là một <Svg> phủ kín màn hình mà ` +
        'lớp kính phải lấy mẫu lại mỗi khung hình, để vẽ ra opacity 0',
    );
  }
  /* Biến trang phải là STATE của React, không phải shared value: một shared
     value không dựng lại cây, nên cửa sổ sẽ không bao giờ đổi. */
  if (!new RegExp(`const \\[${pageVar}, set\\w+\\] = useState`).test(today)) {
    problems.push(
      `${TODAY}: \`${pageVar}\` không phải React state — cửa sổ aura quyết định thứ được DỰNG, nên nó ` +
        'phải đổi qua một lần render; một shared value không dựng lại cây và cửa sổ sẽ đứng yên ở trang 0',
    );
  }
}

/* ── 2. nó được nuôi bởi tín hiệu CHỐT trang, không phải mỗi khung hình ── */
if (!/onPageChange=\{onHeroPageChange\}/.test(today)) {
  problems.push(`${TODAY}: deck không báo trang về — cửa sổ aura sẽ đứng yên`);
}
const handler = /const onHeroPageChange = useCallback\(\(([\s\S]*?)\n  \}, \[\]\);/.exec(today);
if (!handler) {
  problems.push(`${TODAY}: không đọc được onHeroPageChange`);
} else if (!/set\w*[Pp]age\(/.test(handler[1])) {
  problems.push(`${TODAY}: onHeroPageChange không ghi lại trang đang xem`);
}

/* ── 3. deck chỉ báo khi cú vuốt đã DỪNG ────────────────────────────────── */
/*
  Đây là điều kiện để mục 2 không kéo React vào đường cuộn. `card-deck.tsx` ghi
  rõ: "Báo ra ở JS khi đã CHỌN xong trang, không phải theo từng frame". Nếu ai
  đó dời lời gọi ấy vào `onUpdate`, cửa sổ aura biến thành một `setState` mỗi
  khung hình của mỗi cú vuốt — và cả phiên vừa rồi là chuyện gỡ đúng loại lỗi đó
  ra khỏi đường cuộn của Today.
*/
const deck = read(DECK);
const onUpdate = /\.onUpdate\(\(e\) => \{([\s\S]*?)\n    \}\)/.exec(deck);
if (onUpdate && /runOnJS\(/.test(onUpdate[1])) {
  problems.push(
    `${DECK}: \`onUpdate\` gọi runOnJS — đó là một cú nhảy UI→JS mỗi khung hình của mỗi cú vuốt, và ` +
      'cửa sổ aura sẽ thành một setState mỗi khung',
  );
}
if (!/if \(target !== Math\.round\(from\.value\)\) runOnJS\(settle\)\(target\);/.test(deck)) {
  problems.push(`${DECK}: deck không còn báo trang ở onEnd, hoặc báo cả khi trang KHÔNG đổi`);
}

/* ── phép tự kiểm ────────────────────────────────────────────────────────── */
const check = (src) => {
  const out = [];
  const m = /Math\.abs\(i - (\w+)\) <= (\d+) \?/.exec(src);
  if (!m) out.push('không còn cửa sổ');
  else {
    if (Number(m[2]) < 1) out.push('hẹp hơn ±1');
    if (Number(m[2]) > 1) out.push('rộng hơn ±1');
    if (!new RegExp(`const \\[${m[1]}, set\\w+\\] = useState`).test(src)) out.push('không phải React state');
  }
  return out;
};
const SELF = [
  { name: 'gỡ hẳn cửa sổ (bản đã ship: dựng cả năm lớp)', mutate: (s) => s.replace(/Math\.abs\(i - \w+\) <= \d+ \?/, 'true ?'), expect: /không còn cửa sổ/ },
  { name: 'siết còn đúng một lớp (nền nhảy màu khi vuốt)', mutate: (s) => s.replace(/(Math\.abs\(i - \w+\) <=) \d+/, '$1 0'), expect: /hẹp hơn ±1/ },
  { name: 'nới lên ±2 (không tiết kiệm gì)', mutate: (s) => s.replace(/(Math\.abs\(i - \w+\) <=) \d+/, '$1 2'), expect: /rộng hơn ±1/ },
];
const selfFail = [];
for (const s of SELF) {
  const broken = s.mutate(today);
  if (broken === today) { selfFail.push(`${s.name}: không đổi được gì`); continue; }
  const found = check(broken);
  if (found.length === 0) selfFail.push(`${s.name}: bản hỏng vẫn XANH — luật này không bắt được gì`);
  else if (!found.some((f) => s.expect.test(f))) {
    selfFail.push(`${s.name}: đỏ, nhưng không đúng chỗ dự đoán (${s.expect}); thật ra: ${found.join('; ')}`);
  }
}
if (check(today).length !== 0) selfFail.push(`phép kiểm đỏ ngay trên BẢN THẬT: ${check(today).join('; ')}`);

if (selfFail.length) {
  console.error('phép tự kiểm hỏng — đừng tin kết quả:\n');
  for (const s of selfFail) console.error(`  ${s}`);
  process.exit(2);
}
if (problems.length) {
  console.log('cửa sổ lớp aura sai:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'cửa sổ lớp aura OK — Today chỉ dựng lớp aura của trang đang xem và hai trang kề, thay vì cả năm lớp ' +
    '<Svg> phủ kín màn hình nằm sau tấm kính (bốn trong năm ở opacity 0: không vẽ gì, vẫn phải lấy mẫu ' +
    'lại mỗi khung hình cuộn). Luật canh HAI chiều: hẹp hơn ±1 thì nền NHẢY MÀU lúc cú vuốt chốt, vì ' +
    'opacity của trang kề nội suy theo ngón tay; rộng hơn ±1 thì không tiết kiệm gì. Trang đang xem phải ' +
    'là React state (một shared value không dựng lại cây, cửa sổ sẽ đứng yên ở trang 0), và nó được nuôi ' +
    'bởi tín hiệu CHỐT trang chứ không phải mỗi khung hình — deck vẫn chỉ báo ở onEnd và chỉ khi trang ' +
    `thật sự đổi, còn onUpdate không có runOnJS nào. ${SELF.length} phép thử ngược (gỡ hẳn cửa sổ, siết ` +
    'còn một lớp, nới lên ±2) đều đỏ đúng chỗ đã dự đoán, và cả ba đều xanh trên bản thật',
);
