/**
 * Số LẦN phải mang nhãn, y như tạ mang `kg`.
 *
 *     node tools/rep-unit.mjs
 *
 * ── lỗi nó sinh ra để sửa, và ai tìm ra nó ──
 *
 * Chủ dự án khoanh đỏ cả một cột số ở màn Plan: "dãy số này là gì phải ghi rõ".
 *
 * Hàng set đọc ra `25 kg × 10`. Vế trái có đơn vị, vế phải không có gì, và hai
 * con số trông giống hệt nhau — cùng cỡ chữ, cùng màu, cùng kiểu số đều nét.
 * Không có gì trên màn nói con số thứ hai là số LẦN. Ba chỗ khác cùng lối viết:
 * đơn thuốc ở tiêu đề thẻ, dòng tóm tắt khi thẻ thu lại, và "Lần trước 25 kg ×
 * 10" ở `exercise-progress`.
 *
 * ── nhãn lấy ở đâu ──
 *
 * `i18n.nReps`, đã tồn tại ở cả hai ngôn ngữ, và đã là thứ VoiceOver đọc cho
 * chính ô ấy. Tức người dùng trình đọc màn hình vẫn luôn nghe "reps"; chỉ người
 * nhìn bằng mắt là không được cho biết. Dùng lại đúng cái tên ấy thì hai bên
 * nghe và thấy cùng một từ, và không có bản thứ hai để lệch.
 *
 * ── và ô nhập thì KHÓ hơn một đơn vị gắn cứng ──
 *
 * Ô số lần giữ HAI thứ (`lib/rep-entry.ts`): một số lần, hoặc một lần giữ tính
 * bằng giây khi gõ `60s`. Bản thứ hai tự mang đơn vị trong chữ của nó, nên dán
 * cứng sẽ ra `60s reps`. Nhãn phải hỏi `parseRepEntry` trước.
 *
 * ── vì sao luật này là một CÁI CHỐT, không phải một định luật ──
 *
 * Bản đầu định tổng quát: "mọi dấu `×` phải có đơn vị cho con số đuôi". Chạy
 * thử thì nó đỏ ở `grocery.tsx`, `log-meal.tsx`, `exercise-insight.tsx` — vì
 * `×` không phải dấu riêng của số lần. Nó còn là `×2` cho hai phần ăn, cho hai
 * món trong danh sách đi chợ, và ở đó `×2` tự nói hết nghĩa: hai CÁI. Một luật
 * đòi đơn vị ở những chỗ ấy là một luật kêu oan, và một luật kêu oan là một
 * luật bị tắt — đúng điều `today-fresh.mjs` và `tap-feedback.mjs` đã phải cân
 * nhắc trước khi chọn phạm vi.
 *
 * Thứ thật sự có rủi ro là SỐ LẦN, và nó chỉ hiện ở bốn chỗ. Nên luật này chốt
 * đúng bốn chỗ ấy, như `dark-frozen.mjs` chốt bảng màu: không tổng quát, không
 * kêu oan, và khi mã bị viết lại thì nó tự khai rằng nó đã mất mục tiêu chứ
 * không lặng lẽ xanh.
 *
 * ── vì sao không cửa nào khác bắt được ──
 *
 * `tsc` thấy một chuỗi hợp lệ. Mọi luật màu đo màu. `live.mjs` CHỤP được dãy số
 * ấy nhưng không đọc được nó: một con số thiếu nhãn trông y hệt một con số đủ
 * nhãn. Chỉ người đọc mới hỏi "10 là cái gì", và chủ dự án đã hỏi.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { NATIVE } from './lib/stack.mjs';

const LABEL = 'i18n.nReps';
const problems = [];

const strip = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/.*$/gm, (m) => ' '.repeat(m.length));

const read = (rel) => strip(readFileSync(path.join(NATIVE, rel), 'utf8'));

/**
 * Bốn chỗ số lần được vẽ ra, và cái neo để tìm lại từng chỗ.
 *
 * `anchor` là đoạn mã đặc trưng của chỗ ấy; mất nó nghĩa là chỗ ấy đã được
 * viết lại và cái chốt cần được đọc lại bằng mắt chứ không phải bỏ qua.
 */
const PINS = [
  {
    rel: 'src/components/ascnd/day-plan.tsx',
    what: 'ô nhập số lần trên mỗi hàng set',
    anchor: 'styles.fieldReps',
    /* Nhãn có điều kiện — `60s` là một lần giữ, không phải mười lần. */
    needs: [LABEL, 'parseRepEntry'],
    why: 'hàng đọc ra "25 kg × 10" và con số thứ hai không nói nó là gì. `parseRepEntry` phải có mặt '
      + 'cùng, vì ô ấy cũng giữ được một lần giữ tính bằng giây và dán cứng nhãn sẽ ra "60s reps"',
  },
  {
    rel: 'src/components/ascnd/day-plan.tsx',
    what: 'đơn thuốc ở tiêu đề thẻ bài tập',
    anchor: 'styles.exPrescription',
    needs: [LABEL],
    why: '"3 × 10" không nói 10 là gì. Gắn nhãn cho con số ĐUÔI là đủ: khi đuôi đã nói "reps" thì '
      + '"3 ×" ở đầu chỉ còn một nghĩa',
  },
  {
    rel: 'src/components/ascnd/day-plan.tsx',
    what: 'dòng tóm tắt khi thẻ đã xong và thu lại',
    anchor: 'kind === \'uniform\'',
    needs: [LABEL],
    why: 'thẻ thu lại thì các hàng biến mất, nên dòng này là chỗ DUY NHẤT còn nói kết quả — và nó nói '
      + 'bằng một con số trần',
  },
  {
    rel: 'src/components/ascnd/exercise-progress.tsx',
    what: 'dòng "Lần trước 25 kg × 10"',
    anchor: 'weightLabel(u)',
    needs: [LABEL],
    why: 'cùng câu hỏi ở một màn khác, và nếu chỉ sửa `day-plan` thì hai chỗ cạnh nhau trên cùng một '
      + 'thẻ sẽ nói hai kiểu',
  },
];

/*
  Cái neo phải khớp TRỌN, không khớp như một tiền tố.

  Bản đầu dùng `includes`, và phép thử ngược lộ ra ngay: đổi tên
  `styles.fieldReps` thành `styles.fieldRepsNew` thì cái neo vẫn "thấy" nó, nên
  luật xanh trong khi chỗ nó canh đã đi mất. Một cái neo bắt được cả thứ đã đổi
  tên thì không phải một cái neo.
*/
const anchored = (src, anchor) =>
  new RegExp(`${anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_])`).test(src);

for (const pin of PINS) {
  const src = read(pin.rel);
  if (!anchored(src, pin.anchor)) {
    problems.push(
      `${pin.rel}: không còn thấy \`${pin.anchor}\` — ${pin.what} đã được viết lại, nên cái chốt này `
        + 'đang canh một thứ không tồn tại. Đọc lại chỗ ấy bằng mắt rồi sửa luật, đừng để nó xanh suông',
    );
    continue;
  }
  /* Cả tệp, không phải quanh cái neo: nhãn có thể nằm cách vài dòng (ở hàng
     set nó là một `<Text>` anh em của ô nhập). Chốt này hỏi "tệp này còn gắn
     nhãn số lần không", và bốn chỗ đều nằm trong hai tệp. */
  for (const need of pin.needs) {
    if (src.includes(need)) continue;
    problems.push(
      `${pin.rel}: ${pin.what} — không thấy \`${need}\` trong tệp. ${pin.why}`,
    );
  }
}

/* Và nhãn phải là MỘT, ở bảng chuỗi, chứ không phải chữ gõ tay ở chỗ vẽ. */
const strings = readFileSync(path.join(NATIVE, 'src/lib/native-strings.ts'), 'utf8');
const langs = [...strings.matchAll(/^\s*nReps:\s*'([^']*)'/gm)].map((m) => m[1]);
if (langs.length < 2) {
  problems.push(
    `\`nReps\` chỉ có ${langs.length} bản trong \`native-strings.ts\` — app có hai ngôn ngữ, và một nhãn `
      + 'thiếu bản dịch sẽ hiện ra tiếng Anh giữa một màn tiếng Việt',
  );
}

if (problems.length) {
  console.error('một con số không nói nó là gì:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  `đơn vị số lần OK — chốt ${PINS.length} chỗ số lần được vẽ ra, mỗi chỗ dùng \`${LABEL}\` `
    + `(${langs.length} ngôn ngữ: ${langs.map((l) => `"${l}"`).join(', ')}), và ô nhập còn phải hỏi `
    + '`parseRepEntry` trước vì nó cũng giữ được một lần giữ tính bằng giây. Đây là một CÁI CHỐT chứ '
    + 'không phải một định luật, và đó là kết luận có đo: bản đầu đòi mọi dấu `×` phải có đơn vị cho con '
    + 'số đuôi, rồi đỏ ở `grocery`, `log-meal`, `exercise-insight` — vì `×2` cho hai phần ăn đã tự nói '
    + 'hết nghĩa. Một luật kêu oan là một luật bị tắt. Mỗi chốt mang theo cái neo của nó, nên mã bị viết '
    + 'lại thì luật tự khai đã mất mục tiêu chứ không lặng lẽ xanh',
);
