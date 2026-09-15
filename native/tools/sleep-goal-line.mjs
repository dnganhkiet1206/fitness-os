/**
 * Đường mốc và các cột phải đo từ CÙNG MỘT GỐC.
 *
 *     node tools/sleep-goal-line.mjs
 *
 * ── lỗi nó sinh ra để chặn ──
 *
 * Chủ dự án gửi ảnh màn "Giấc Ngủ — 7 Ngày" kèm câu: "sao thứ 2 ngủ được 8
 * tiếng mà đồng hồ không chạm đích 8 tiếng vậy".
 *
 * Đo trên chính ảnh ấy: cột Chủ nhật 10h cao 420px, cột thứ Hai 8h cao 336px —
 * tỉ lệ 0,800, tức HAI CỘT ĐÚNG. Nét mốc thì nằm ở y=1207 trong khi mốc 8h thật
 * ở y=1234: cao hơn 27px, tức 9 điểm trên màn 3×.
 *
 * Chín điểm ấy là hai phỏng đoán về chiều cao chữ cộng lại:
 *
 *   +2  `LABEL_H = 22` đoán hàng nhãn thứ-trong-tuần dưới cột cao 22 điểm;
 *       thật ra nhãn ~14 cộng khe 6 là 20
 *   +7  `bottom` neo MÉP DƯỚI của hàng chứa đường, nhưng thứ người ta đọc là
 *       nét kẻ nằm GIỮA hàng ấy — cao hơn nửa chiều cao hàng
 *
 * ── vì sao không luật nào có sẵn bắt được, và vì sao mắt cũng không ──
 *
 *   `tsc`            hai số cộng nhau, đúng kiểu
 *   bộ chạy web      vẽ ra đúng cái sai ấy, không có gì đỏ
 *   nhìn ảnh         9 điểm trên 140 là 6% — nhỏ hơn cả bề dày một cột, nên
 *                    nó chỉ lộ ra ở đúng một ca: một đêm BẰNG ĐÚNG mục tiêu
 *
 * Và chú thích ngay cạnh đường mốc còn tự tin rằng nó "đặt theo cùng phép tỉ lệ
 * mà các cột dùng nên không thể lệch khỏi chúng". Đúng về TỈ LỆ, sai về GỐC —
 * hạng lỗi mà một lời trấn an viết sẵn làm cho khó thấy hơn.
 *
 * ── luật đọc gì ──
 *
 * Ba vế, và vế cuối là vế có răng:
 *
 *   1. CẤU TRÚC  đường mốc phải là con của đúng khung chứa cột, và khung ấy
 *                phải cao đúng `BAR_H`. Cùng cha thì cùng gốc — đây mới là
 *                thứ ngăn lỗi quay lại, chứ không phải một con số chỉnh tay.
 *   2. KHÔNG ĐOÁN không hằng nào đoán chiều cao hàng nhãn được sống lại, và
 *                `TAG_LINE_H` phải thật sự được ÁP vào `lineHeight` của nhãn
 *                mốc — nếu không thì phép dời nửa chiều cao là phỏng đoán thứ hai
 *   3. CHẠY      với mọi `maxH` hợp lệ, tâm nét mốc phải trùng ĐỈNH của một cột
 *                bằng đúng mục tiêu, tính bằng chính mô hình flex mà cột dùng
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCREEN = 'src/app/sleep-insights.tsx';
const src = readFileSync(path.join(NATIVE, SCREEN), 'utf8');
const problems = [];
let CASES = 0;

/** Một hằng số khai ở đầu tệp, đọc RA khỏi mã chứ không gõ lại vào đây. */
const constOf = (name) => {
  const m = new RegExp(`const ${name} = (\\d+(?:\\.\\d+)?);`).exec(src);
  return m ? Number(m[1]) : null;
};
const BAR_H = constOf('BAR_H');
const TAG_LINE_H = constOf('TAG_LINE_H');
CASES++;
if (BAR_H == null || TAG_LINE_H == null) {
  problems.push(`không đọc được BAR_H (${BAR_H}) hoặc TAG_LINE_H (${TAG_LINE_H}) ở ${SCREEN}`);
}

/* ── 1. cấu trúc: đường mốc nằm TRONG khung cột ── */
{
  CASES++;
  const bars = /<View style={styles\.bars}>([\s\S]*?)\n {14}<\/View>/.exec(src);
  if (!bars) {
    problems.push(`${SCREEN}: không tìm thấy khung \`styles.bars\` bọc các cột`);
  } else if (!bars[1].includes('styles.targetLine')) {
    problems.push(
      `${SCREEN}: đường mốc KHÔNG nằm trong khung \`bars\`. Đặt nó ra ngoài là đo từ một gốc khác ` +
        'với các cột, và đó đúng là lỗi "đêm 8 tiếng không chạm mốc 8 tiếng"',
    );
  }

  CASES++;
  const barsStyle = /\n {2}bars: \{([^}]*)\}/.exec(src);
  if (!barsStyle) {
    problems.push(`${SCREEN}: không đọc được style \`bars\``);
  } else {
    if (!/height: BAR_H\b/.test(barsStyle[1])) {
      problems.push(
        `${SCREEN}: \`bars\` không cao đúng \`BAR_H\` (${barsStyle[1].trim()}). Khung chứa đường mốc ` +
          'phải cao bằng rãnh cột, không thì `bottom` của đường đo từ một đáy khác',
      );
    }
    CASES++;
    if (/padding|border/.test(barsStyle[1])) {
      problems.push(
        `${SCREEN}: \`bars\` có padding/border — chúng dời đáy khung ra khỏi đáy cột, tức dựng lại ` +
          'đúng cái lệch gốc mà luật này canh',
      );
    }
  }
}

/* ── 2. không phỏng đoán nào sống lại ── */
{
  CASES++;
  if (/const LABEL_H\b/.test(src)) {
    problems.push(
      `${SCREEN}: \`LABEL_H\` quay lại. Đó là một con số ĐOÁN hàng nhãn cao bao nhiêu, và nó đã đoán ` +
        'sai 2 điểm; chiều cao hàng nhãn không phải việc của đường mốc nữa',
    );
  }
  CASES++;
  const tag = /\n {2}targetTag: \{([\s\S]*?)\n {2}\},/.exec(src);
  if (!tag) {
    problems.push(`${SCREEN}: không đọc được style \`targetTag\``);
  } else if (!/lineHeight: TAG_LINE_H\b/.test(tag[1])) {
    problems.push(
      `${SCREEN}: \`targetTag\` không áp \`lineHeight: TAG_LINE_H\`. Thiếu nó thì chiều cao hàng chứa ` +
        'đường do phông quyết định, và phép dời `TAG_LINE_H / 2` trở lại thành phỏng đoán',
    );
  }
}

/* ── 3. CHẠY: tâm nét mốc trùng đỉnh cột, ở mọi maxH ──

   Mô hình cột được ĐỌC RA khỏi mã chứ không chép: khoảng đệm phía trên mang
   `flexGrow: maxH - total_h`, hộp cột mang `flexGrow: total_h`, cả hai
   `flexBasis: 0`. Nên cột chiếm `total_h / maxH` của `BAR_H`, tính từ đáy. */
{
  CASES++;
  const spacer = /flexGrow: Math\.max\(0, maxH - n\.total_h\)/.test(src);
  const grow = /flexGrow: n\.total_h/.test(src);
  const basis = (src.match(/flexBasis: 0/g) ?? []).length >= 2;
  if (!spacer || !grow || !basis) {
    problems.push(
      `${SCREEN}: mô hình cột không còn là "đệm ${'maxH - total_h'} · hộp total_h · flexBasis 0" ` +
        `(đệm ${spacer}, hộp ${grow}, basis ${basis}) — phép tính dưới đây đang mô phỏng một thứ ` +
        'không còn đúng, nên nó phải đỏ thay vì im lặng',
    );
  }

  /* Biểu thức `bottom` được LẤY RA khỏi mã rồi CHẠY, không chép lại vào đây.
     Bản đầu của luật này viết lại phép tính bằng tay và ra một phép đồng nhất:
     nó cộng rồi trừ đúng `TAG_LINE_H / 2`, nên nó xanh với MỌI mã nguồn — kể cả
     bản đã hỏng. Một luật không thể đỏ là một luật không tồn tại. */
  const raw = /bottom: ([^}]+?) \}\]/.exec(src);
  CASES++;
  if (!raw) {
    problems.push(`${SCREEN}: không lấy được biểu thức \`bottom\` của đường mốc để chạy`);
  } else {
    const bottomOf = new Function('BAR_H', 'TAG_LINE_H', 'targetHours', 'maxH', `return ${raw[1]};`);

    /* Tâm nét kẻ = mép dưới hàng + nửa chiều cao hàng. Hàng cao đúng
       `TAG_LINE_H` vì vế 2 đã bắt `lineHeight` phải được áp, và `alignItems:
       'center'` đặt nét kẻ vào giữa. */
    const barTop = (h, maxH) => (BAR_H * h) / maxH;
    const ruleCentre = (target, maxH) =>
      bottomOf(BAR_H, TAG_LINE_H, target, maxH) + TAG_LINE_H / 2;

    /* `maxH` thật: `Math.max(targetHours * 1.15, ...đêm)`. Chạy qua dải mục tiêu
       và dải đêm dài nhất mà một người dùng thật có thể có. */
    for (const target of [6, 7, 7.5, 8, 8.5, 9, 10]) {
      for (const longest of [0, 6, 8, 9.2, 10, 12, 14]) {
        const maxH = Math.max(target * 1.15, longest);
        CASES++;
        const delta = Math.abs(ruleCentre(target, maxH) - barTop(target, maxH));
        if (delta > 1e-9) {
          problems.push(
            `mục tiêu ${target}h, đêm dài nhất ${longest}h (maxH ${maxH.toFixed(2)}): tâm nét mốc lệch ` +
              `đỉnh cột ${delta.toFixed(3)} điểm — một đêm đúng bằng mục tiêu sẽ không chạm mốc`,
          );
        }
      }
    }

    /* ── răng của luật: nó phải ĐỎ trên đúng hai bản đã hỏng ──
       Chạy lại chính phép so ở trên với hai biểu thức `bottom` cũ. Nếu vế nào
       không đỏ thì phép so trên đang mù, và luật nói ra thay vì để nó nằm lại. */
    for (const [tên, expr] of [
      ['bản đã ship (cộng LABEL_H, neo mép dưới)', 'BAR_H * (targetHours / maxH) + 22'],
      ['bản chỉ sửa hằng (bỏ LABEL_H, vẫn neo mép dưới)', 'BAR_H * (targetHours / maxH)'],
    ]) {
      const f = new Function('BAR_H', 'TAG_LINE_H', 'targetHours', 'maxH', `return ${expr};`);
      const d = Math.abs(f(BAR_H, TAG_LINE_H, 8, 9.2) + TAG_LINE_H / 2 - barTop(8, 9.2));
      if (d <= 1e-9) {
        problems.push(`tự kiểm hỏng — phép so không đỏ trên ${tên}`);
      }
    }
  }
}

if (problems.length) {
  console.log('đường mốc giấc ngủ CÓ LỖI:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  `đường mốc giấc ngủ OK — ${CASES} ca. Đường mốc và các cột đo từ CÙNG MỘT GỐC: nó là con của khung ` +
    'cao đúng BAR_H chứ không phải của cả thẻ, nên không hằng nào phải nhớ hàng nhãn cao bao nhiêu. ' +
    '49 tổ hợp mục tiêu × đêm dài nhất được CHẠY qua chính mô hình flex mà cột dùng (đệm maxH-total_h, ' +
    'hộp total_h, flexBasis 0, đọc ra khỏi mã chứ không chép), và ở mọi tổ hợp, tâm nét mốc trùng đỉnh ' +
    'của một cột bằng đúng mục tiêu. Luật này có vì bản cũ cộng hai phỏng đoán về chiều cao chữ — một ' +
    'hằng LABEL_H đoán 22 khi nhãn ~14, và một phép neo lấy MÉP DƯỚI hàng chứa đường trong khi người ' +
    'ta đọc nét kẻ ở GIỮA hàng — thành 9 điểm lệch mà tsc thấy đúng kiểu, bộ chạy web vẽ ra y như thế, ' +
    'và mắt chỉ bắt được ở đúng một ca: một đêm bằng ĐÚNG mục tiêu. Chủ dự án bắt được ca ấy trước ' +
    'công cụ. Phép dựng lại bản hỏng được chạy trong chính luật, nên một luật đã mất răng sẽ đỏ',
);
