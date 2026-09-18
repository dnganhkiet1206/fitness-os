/**
 * Chiếc cân ở màn `/log-weight`: chữ trên mặt màn hình phải đọc được ở CẢ HAI
 * diện mạo.
 *
 *     node tools/body-scale.mjs
 *
 * ── lỗi nó sinh ra để bắt ──
 *
 * Hình này cố ý dùng `alpha(c.foreground, …)` cho gần hết các lớp: mực của bản
 * sáng là màu tối, của bản tối là màu sáng, nên MỘT dòng cho ra "đậm hơn mặt
 * dưới" ở sáng và "sáng hơn mặt dưới" ở tối. Rất gọn, và nó đúng — cho các lớp
 * NỀN.
 *
 * Chữ thì không đi theo được, và đó đúng là chỗ đã hỏng. Mặt màn hình phải là
 * thứ SÁNG NHẤT của cả hình; ở bản tối điều đó có nghĩa là `alpha(ink, 0.13)` =
 * #2f2f2f, một mặt khá sáng. Trên nó `mutedForeground` chỉ còn **3,48:1**, dưới
 * sàn 4,5 của WCAG 1.4.3 — trong khi ở bản sáng cùng token ấy đo 5,78 và không
 * ai thấy gì cả. Một diện mạo đúng, một diện mạo rớt, cùng một dòng mã.
 *
 * ── vì sao không cổng nào có sẵn bắt được ──
 *
 *   `tsc`                  hai token đều là `string` hợp lệ
 *   `palette-key.mjs`      canh tham số của `alpha()`, không canh kết quả
 *   `glass-legibility.mjs` đo chữ trên mặt KÍNH, không trên mặt do một
 *                          component tự pha bằng `alpha()` lên nền của nó
 *   ảnh chụp               bản dựng web ở diện mạo tối bị một lớp trắng phủ mờ
 *                          cả trang (AUDIT_STATE 17/09 c) — điểm ảnh bản tối
 *                          không dùng được, nên MẮT không phải một cửa ở đây
 *
 * ── luật ──
 *
 * Đọc độ mờ của mặt màn hình và TÊN TOKEN của hai dòng chữ ra khỏi chính tệp,
 * dựng lại đúng chồng mặt (trang → thân cân → mặt màn) từ bảng màu đang ship,
 * rồi đòi cả hai qua 4,5:1 ở cả hai diện mạo. Đổi token sang một cái rớt sàn là
 * ĐỎ, chứ không phải xanh vì luật vẫn đang đo token cũ.
 *
 * Và một vế nữa, vì nó là ràng buộc đã ép ra lựa chọn trên: mặt màn hình phải
 * còn là một BẬC thật so với thân cân (1,134 — bậc nhỏ nhất iOS tự tạo). Thiếu
 * vế ấy thì cách "sửa" rẻ nhất là hạ độ đậm mặt màn cho chữ dễ thở, và chiếc
 * cân mất cái màn hình của nó.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { styleBody } from './lib/code-mask.mjs';
import { hex, loadPalette, overC, ratio, toHex } from './lib/stack.mjs';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIG = 'src/components/ascnd/body-scale-figure.tsx';
const raw = readFileSync(path.join(NATIVE, FIG), 'utf8');

/** Sàn chữ của WCAG 1.4.3 — con số 28px KHÔNG phải "văn bản lớn" theo 1.4.11? */
const TEXT = 4.5;
/** Bậc bề mặt nhỏ nhất iOS tự tạo — cùng con số `bar-track.mjs` dùng. */
const STEP = 1.134;
/** Độ mờ của thân cân trên trang, đọc ra dưới đây. */

const problems = [];
let CASES = 0;

/* Ba con số phải lấy ra khỏi mã, không được gõ lại. */
const plateA = /fill=\{alpha\(c\.foreground,\s*([\d.]+)\)\}/.exec(raw);
const screenA = /fill=\{m\.lit \? alpha\(c\.foreground,\s*([\d.]+)\)\s*:\s*c\.(\w+)\}/.exec(raw);
const valueTok = /color:\s*c\.(\w+)\s*\}/.exec(styleBody(raw, 'value') ?? '');
const unitTok = /color:\s*c\.(\w+)\s*,/.exec(styleBody(raw, 'unit') ?? '');

CASES++;
if (!plateA || !screenA || !valueTok || !unitTok) {
  problems.push(
    `${FIG}: không đọc được một trong bốn thứ cần đo (độ mờ thân cân, mặt màn hình, token của số, token ` +
      'của đơn vị). Không đọc được thì luật này đang không kiểm gì cả',
  );
} else {
  const { palettes } = loadPalette();
  const marks = [];

  for (const theme of ['light', 'dark']) {
    const p = palettes[theme];
    const vi = theme === 'light' ? 'sáng' : 'tối';
    const page = hex(p.background);
    const ink = hex(p.foreground);
    const plate = overC(ink, page, Number(plateA[1]));
    /* Bản tối pha bằng `alpha`; bản sáng dùng thẳng một token. */
    const screen = theme === 'dark' ? overC(ink, plate, Number(screenA[1])) : hex(p[screenA[2]]);

    CASES++;
    const step = ratio(screen, plate);
    if (step < STEP) {
      problems.push(
        `${FIG}: mặt màn hình chỉ tách khỏi thân cân ${step.toFixed(3)}:1 ở bản ${vi} — dưới bậc bề mặt ` +
          `${STEP}. Chiếc cân mất cái màn hình của nó, và đó là cách "sửa" rẻ nhất khi chữ trên đó rớt sàn`,
      );
    }

    for (const [what, tok] of [['số cân nặng', valueTok[1]], ['đơn vị', unitTok[1]]]) {
      CASES++;
      const r = ratio(hex(p[tok]), screen);
      marks.push(`${vi} ${what} ${r.toFixed(2)}`);
      if (r < TEXT) {
        problems.push(
          `${FIG}: chữ ${what} (\`${tok}\`) trên mặt màn hình ${toHex(screen)} chỉ ${r.toFixed(2)}:1 ở bản ` +
            `${vi} — dưới sàn ${TEXT} của WCAG 1.4.3. Đây đúng là chỗ \`mutedForeground\` đã rớt (3,48 ở ` +
            'bản tối) trong khi bản sáng của nó đo 5,78 và không ai thấy gì cả',
        );
      }
    }

    /* Thứ bậc: đơn vị phải NHẠT hơn con số. Một "kg" to bằng con số là một
       nhãn tranh chỗ với dữ liệu. */
    CASES++;
    const rv = ratio(hex(p[valueTok[1]]), screen);
    const ru = ratio(hex(p[unitTok[1]]), screen);
    if (ru >= rv) {
      problems.push(
        `${FIG}: ở bản ${vi}, chữ đơn vị (${ru.toFixed(2)}:1) không nhạt hơn con số (${rv.toFixed(2)}:1). ` +
          'Đơn vị là nhãn, con số là dữ liệu — ngang nhau là thứ bậc bị đảo',
      );
    }
  }

  /* ── tự kiểm: luật phải biết ĐỎ ──
     Chạy lại đúng vế chữ với `mutedForeground`, token đã rớt, và đòi nó đỏ ở
     bản tối. Xoá vế trên đi thì phần này xanh suông và nói ra. */
  CASES++;
  {
    const p = palettes.dark;
    const plate = overC(hex(p.foreground), hex(p.background), Number(plateA[1]));
    const screen = overC(hex(p.foreground), plate, Number(screenA[1]));
    if (ratio(hex(p.mutedForeground), screen) >= TEXT) {
      problems.push(
        'tools/body-scale.mjs: phần tự kiểm KHÔNG còn bắt được `mutedForeground` ở bản tối — tức phép đo ' +
          'đã đổi và vế chữ ở trên không còn đỏ được với token đã từng rớt',
      );
    }
  }

  if (!problems.length) {
    console.log(
      `chiếc cân OK — ${CASES} ca. Chữ trên mặt màn hình của chiếc cân được ĐO trên bảng màu đang ship ở ` +
        `cả hai diện mạo, với độ mờ và TÊN TOKEN đọc ra khỏi chính tệp chứ không gõ lại: ${marks.join(' · ')}. ` +
        'Luật này có vì hình ấy cố ý dùng `alpha(c.foreground, …)` cho các lớp NỀN — một dòng đúng ở cả hai ' +
        'diện mạo — nhưng CHỮ thì không đi theo được: mặt màn hình phải là thứ sáng nhất của hình, nên ở bản ' +
        'tối nó là #2f2f2f, và `mutedForeground` trên đó chỉ còn 3,48:1 trong khi bản sáng cùng token đo ' +
        '5,78 và không ai thấy gì. Không cổng nào có sẵn bắt được: `tsc` thấy hai string hợp lệ, ' +
        '`palette-key` canh THAM SỐ của `alpha()` chứ không canh kết quả, `glass-legibility` đo chữ trên mặt ' +
        'KÍNH chứ không trên mặt do một component tự pha, và ảnh chụp thì vô dụng ở đây vì bản dựng web ở ' +
        'diện mạo tối bị một lớp trắng phủ mờ cả trang. Kèm hai vế nữa: mặt màn hình phải còn là một BẬC ' +
        `thật so với thân cân (${STEP}) — thiếu nó thì cách sửa rẻ nhất là hạ độ đậm mặt màn và chiếc cân ` +
        'mất màn hình — và chữ đơn vị phải NHẠT hơn con số, vì đơn vị là nhãn còn con số là dữ liệu',
    );
  }
}

if (problems.length) {
  console.error('chiếc cân CÓ LỖI:\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}
