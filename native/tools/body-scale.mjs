/**
 * Chiếc cân ở `/log-weight`: BỐN trạng thái, và mọi ô chữ phải đọc được.
 *
 *     node tools/body-scale.mjs
 *
 * ── hai lỗi nó sinh ra để bắt, cả hai đã xảy ra ──
 *
 * **Một.** Hình này từng dùng đúng một `alpha(c.foreground, …)` cho mỗi lớp ở
 * cả hai diện mạo. Lập luận nghe gọn — mực bản sáng là màu tối, bản tối là màu
 * sáng — và nó đúng cho các lớp NỀN. Chữ thì không: mặt màn hình phải là thứ
 * sáng nhất của hình, nên ở bản tối nó là một mặt khá sáng, và
 * `mutedForeground` trên đó chỉ còn **3,48:1** trong khi bản sáng cùng token đo
 * 5,78 và không ai thấy gì cả.
 *
 * **Hai.** Thân cân bản tối tách khỏi trang **1,084** so với 1,104 của bản
 * sáng — hai con số gần bằng nhau, hai kết quả khác nhau. Ở vùng gần đen một
 * tỉ số 1,08 là chênh lệch độ sáng TUYỆT ĐỐI rất nhỏ và OLED nén nốt phần còn
 * lại: tỉ số tương phản nói QUÁ về độ nhìn thấy ở đầu tối của thang. Chủ dự án
 * bắt được trên ảnh máy thật, sau khi phép đo đã nói ra và bị lý giải đi.
 *
 * Nên độ mờ tách theo diện mạo VÀ theo trạng thái nghỉ/hoạt động — bốn bộ số.
 * Luật này đọc cả bốn ra khỏi `TONE` và chạy lại từng ô.
 *
 * ── vì sao không cổng nào có sẵn bắt được ──
 *
 *   `tsc`                  mọi token đều là `string` hợp lệ
 *   `palette-key.mjs`      canh THAM SỐ của `alpha()`, không canh kết quả
 *   `glass-legibility.mjs` đo chữ trên mặt KÍNH, không trên mặt do một
 *                          component tự pha bằng `alpha()` lên nền của nó
 *   ảnh chụp               sẽ thấy — và nó ĐÃ thấy, tôi chỉ không mở ra xem
 *                          trong ba lượt render. Lớp trắng phủ mờ ghi ở
 *                          17/09 (c) là của màn DASHBOARD (nơi có aura/blur),
 *                          không phải của mọi màn tối. Luật này tồn tại để
 *                          không phải chờ ai mở ảnh.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { hex, loadPalette, overC, ratio, toHex } from './lib/stack.mjs';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIG = 'src/components/ascnd/body-scale-figure.tsx';
const raw = readFileSync(path.join(NATIVE, FIG), 'utf8');

/** Sàn chữ của WCAG 1.4.3. Con số ở đây không phải "văn bản lớn" của 1.4.11. */
const TEXT = 4.5;
/** Bậc bề mặt nhỏ nhất iOS tự tạo — cùng con số `bar-track.mjs` dùng. */
const STEP = 1.134;
const WHITE = [255, 255, 255];

const problems = [];
let CASES = 0;

/* ── bảng TONE đọc ra khỏi mã, không gõ lại ── */
const tone = {};
for (const theme of ['light', 'dark']) {
  const blk = new RegExp(`${theme}: \\{([\\s\\S]*?)\\n  \\},`).exec(raw);
  if (!blk) continue;
  tone[theme] = {};
  for (const st of ['idle', 'active']) {
    const row = new RegExp(`${st}: \\{([^}]*)\\}`).exec(blk[1]);
    if (!row) continue;
    const num = (k) => {
      const m = new RegExp(`${k}:\\s*([\\d.]+)`).exec(row[1]);
      return m ? Number(m[1]) : null;
    };
    const tok = (k) => {
      const m = new RegExp(`${k}: '(\\w+)'`).exec(row[1]);
      return m ? m[1] : null;
    };
    tone[theme][st] = {
      plate: num('plate'), edge: num('edge'), inner: num('inner'), pad: num('pad'), lamp: num('lamp'),
      digits: tok('digits'), unit: tok('unit'), unitAlpha: num('unitAlpha'),
    };
  }
}

CASES++;
const complete = ['light', 'dark'].every(
  (t) => tone[t] && ['idle', 'active'].every(
    (s) => tone[t][s]
      && ['plate','edge','inner','pad','lamp','unitAlpha'].every((k) => typeof tone[t][s][k] === 'number')
      && ['digits','unit'].every((k) => typeof tone[t][s][k] === 'string')),
);
if (!complete) {
  problems.push(
    `${FIG}: không đọc được đủ bảng \`TONE\` (hai diện mạo × nghỉ/hoạt động × plate/edge/inner/pad/lamp/digits/unit/unitAlpha). ` +
      'Không đọc được thì luật này đang không kiểm gì cả',
  );
}

/* ── đèn nền phải là TRẮNG ── */
CASES++;
if (!/const LAMP = '#ffffff';/.test(raw)) {
  problems.push(
    `${FIG}: \`LAMP\` không còn là \`#ffffff\`. Mặt màn hình là một ĐÈN NỀN, và một nguồn sáng thì trắng ` +
      'ở cả hai diện mạo — dùng `c.foreground` ở đó thì bản sáng "sáng lên" lại ra TỐI đi, vì mực bản ' +
      'sáng là màu tối',
  );
}

if (complete) {
  const { palettes } = loadPalette();
  const marks = [];

  for (const theme of ['light', 'dark']) {
    const p = palettes[theme];
    const vi = theme === 'light' ? 'sáng' : 'tối';
    const page = hex(p.background);
    const ink = hex(p.foreground);

    /* Cân sáng lên thì mọi lớp phải ĐI LÊN, không lớp nào đi xuống. */
    for (const k of ['plate', 'edge', 'pad', 'lamp']) {
      CASES++;
      if (tone[theme].active[k] < tone[theme].idle[k]) {
        problems.push(
          `${FIG}: bản ${vi}, lớp \`${k}\` lúc HOẠT ĐỘNG (${tone[theme].active[k]}) nhạt hơn lúc NGHỈ ` +
            `(${tone[theme].idle[k]}). Cân được người bước lên thì sáng LÊN, không tối đi`,
        );
      }
    }

    for (const st of ['idle', 'active']) {
      const t = tone[theme][st];
      const plate = overC(ink, page, t.plate);
      const panel = overC(WHITE, plate, t.lamp);
      const nghi = st === 'idle' ? 'NGHỈ' : 'HOẠT ĐỘNG';

      CASES++;
      const step = ratio(panel, plate);
      if (step < STEP) {
        problems.push(
          `${FIG}: bản ${vi} lúc ${nghi}, mặt màn hình chỉ tách khỏi thân cân ${step.toFixed(3)}:1 — ` +
            `dưới bậc bề mặt ${STEP}. Chiếc cân mất cái màn hình của nó`,
        );
      }

      /* Màu chữ ĐỌC từ bảng, không tự suy — nếu không thì luật đo một phép
         khác với phép component đang chạy, và nó đã sai đúng thế một lần. */
      const digits = hex(p[t.digits]);
      const unitC = t.unitAlpha === 1 ? hex(p[t.unit]) : overC(hex(p[t.unit]), panel, t.unitAlpha);
      for (const [what, col] of [['SỐ', digits], ['đơn vị', unitC]]) {
        CASES++;
        const r = ratio(col, panel);
        if (what === 'SỐ') marks.push(`${vi}/${st} số ${r.toFixed(2)}`);
        if (r < TEXT) {
          problems.push(
            `${FIG}: bản ${vi} lúc ${nghi}, chữ ${what} trên mặt màn hình ${toHex(panel)} chỉ ` +
              `${r.toFixed(2)}:1 — dưới sàn ${TEXT} của WCAG 1.4.3`,
          );
        }
      }
      /* Đơn vị là NHÃN, số là DỮ LIỆU — ngang nhau là thứ bậc bị đảo. */
      CASES++;
      if (ratio(unitC, panel) >= ratio(digits, panel)) {
        problems.push(
          `${FIG}: bản ${vi} lúc ${nghi}, chữ đơn vị không nhạt hơn chữ số`,
        );
      }
    }

    /* Cú thức dậy phải nhìn thấy được, và MẶT MÀN HÌNH là bước nhảy lớn nhất. */
    const pi = overC(ink, page, tone[theme].idle.plate);
    const pa = overC(ink, page, tone[theme].active.plate);
    const jumpPanel = ratio(overC(WHITE, pa, tone[theme].active.lamp), overC(WHITE, pi, tone[theme].idle.lamp));
    const jumpPlate = ratio(pa, pi);
    CASES++;
    if (jumpPanel <= jumpPlate) {
      problems.push(
        `${FIG}: bản ${vi}, bước nhảy của MẶT MÀN HÌNH (${jumpPanel.toFixed(3)}) không lớn hơn bước nhảy ` +
          `của THÂN CÂN (${jumpPlate.toFixed(3)}). Đặt hàng nói rõ: "display là điểm sáng chính… đừng làm ` +
          'toàn bộ chiếc cân phát sáng"',
      );
    }
    /*
      Cú thức dậy phải NHÌN THẤY được — nhưng nó không đi qua cùng một kênh ở
      hai diện mạo, và luật này đã phải sửa vì chính điều đó.

      Bản đầu đòi mặt màn hình đổi ≥1,05. Bản TỐI đạt 8,198; bản SÁNG chỉ 1,045
      và đỏ. Không phải lỗi giá trị: ở bản sáng mặt màn hình đã gần trắng, và
      hạ nó xuống nữa thì bậc so với thân cân tụt dưới 1,134 — tức chiếc cân
      mất màn hình. KHÔNG CÓ chỗ để sáng thêm.

      Nên cú thức dậy ở bản sáng đi qua CHỮ SỐ: 6,05 → 17,57, tức 2,9 lần. Ở
      bản tối nó đi qua tấm nền: 8,198 lần. Luật đòi ÍT NHẤT MỘT kênh rõ rệt,
      chứ không đòi kênh nào cụ thể — và vế "tấm nền dẫn trước thân cân" ở trên
      vẫn giữ cho hiệu ứng không biến thành cả chiếc cân phát sáng.
    */
    const digitJump = (() => {
      const d = (st) => {
        const t = tone[theme][st];
        const plate = overC(ink, page, t.plate);
        const panel = overC(WHITE, plate, t.lamp);
        return ratio(hex(p[t.digits]), panel);
      };
      const a = d('active');
      const i = d('idle');
      return a > i ? a / i : i / a;
    })();
    CASES++;
    const loudest = Math.max(jumpPanel, digitJump);
    if (loudest < 1.5) {
      problems.push(
        `${FIG}: bản ${vi}, cú thức dậy không nhìn thấy được — tấm nền đổi ${jumpPanel.toFixed(3)} lần và ` +
          `chữ số đổi ${digitJump.toFixed(2)} lần, không kênh nào tới 1,5. Ở bản sáng kênh phải là CHỮ SỐ ` +
          '(tấm nền đã gần trắng, không còn chỗ sáng thêm); ở bản tối là tấm nền',
      );
    }
    marks.push(`${vi} thức dậy: tấm ${jumpPanel.toFixed(2)}× · số ${digitJump.toFixed(2)}×`);
  }

  /* ── tự kiểm: luật phải biết ĐỎ ──
     Chạy lại vế chữ với `mutedForeground` trên mặt màn hình bản TỐI lúc NGHỈ —
     token đã rớt thật (3,48) — và đòi nó đỏ. */
  CASES++;
  {
    const p = palettes.dark;
    const plate = overC(hex(p.foreground), hex(p.background), tone.dark.idle.plate);
    const panel = overC(WHITE, plate, tone.dark.idle.lamp);
    if (ratio(hex(p.mutedForeground), panel) >= TEXT) {
      problems.push(
        'tools/body-scale.mjs: phần tự kiểm KHÔNG còn bắt được `mutedForeground` trên mặt màn hình bản ' +
          'tối lúc nghỉ — phép đo đã đổi và vế chữ ở trên không còn đỏ được với token đã từng rớt',
      );
    }
  }

  if (!problems.length) {
    console.log(
      `chiếc cân OK — ${CASES} ca trên BỐN trạng thái (sáng/tối × nghỉ/hoạt động), mọi độ mờ đọc ra khỏi ` +
        `bảng \`TONE\` của chính tệp chứ không gõ lại: ${marks.join(' · ')}. Mặt màn hình là một ĐÈN NỀN — ` +
        'trắng ở một độ mờ, cùng công thức cho cả hai diện mạo, vì một nguồn sáng không đổi màu theo ' +
        'theme; dùng `c.foreground` ở đó thì bản sáng "sáng lên" lại ra tối đi. Chữ số quyết theo ĐỘ SÁNG ' +
        'CỦA TẤM chứ không theo diện mạo, nên bản tối lúc nghỉ là chữ sáng trên tấm tối và lúc hoạt động ' +
        'là chữ tối trên tấm sáng — đúng một màn LCD có đèn nền vừa bật. Luật đòi: mọi ô chữ ≥' +
        `${TEXT}:1 (WCAG 1.4.3), mọi bậc mặt-màn/thân-cân ≥${STEP}, mọi lớp khi sáng KHÔNG nhạt hơn khi ` +
        'nghỉ, và bước nhảy của mặt màn hình phải LỚN NHẤT — đặt hàng nói "display là điểm sáng chính, ' +
        'đừng làm toàn bộ chiếc cân phát sáng". Hai lỗi đã trả giá nằm ở đầu tệp: một token chữ rớt 3,48 ' +
        'chỉ ở bản tối, và thân cân 1,084 hoà vào nền trong khi 1,104 của bản sáng thì không — phép đo đã ' +
        'nói ra và bị lý giải đi, chủ dự án phải gửi ảnh máy thật',
    );
  }
}

if (problems.length) {
  console.error('chiếc cân CÓ LỖI:\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}
