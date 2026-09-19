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
      plate: num('plate'), edge: num('edge'), inner: num('inner'),
      pad: num('pad'), padEdge: num('padEdge'), padW: num('padW'),
      lamp: num('lamp'), bezel: num('bezel'), bezelW: num('bezelW'), bezelOn: tok('bezelOn'),
      digits: tok('digits'), unit: tok('unit'), unitAlpha: num('unitAlpha'),
    };
  }
}

const NUMS = ['plate', 'edge', 'inner', 'pad', 'padEdge', 'padW', 'lamp', 'bezel', 'bezelW', 'unitAlpha'];
const TOKS = ['bezelOn', 'digits', 'unit'];

CASES++;
const complete = ['light', 'dark'].every(
  (t) => tone[t] && ['idle', 'active'].every(
    (s) => tone[t][s]
      && NUMS.every((k) => typeof tone[t][s][k] === 'number')
      && TOKS.every((k) => typeof tone[t][s][k] === 'string')),
);
if (!complete) {
  problems.push(
    `${FIG}: không đọc được đủ bảng \`TONE\` (hai diện mạo × nghỉ/hoạt động × ` +
      `${[...NUMS, ...TOKS].join('/')}). Không đọc được thì luật này đang không kiểm gì cả`,
  );
}

/*
  ── HAI HÌNH XẾP LỚP phải là một CROSS-FADE, không phải một phép CỘNG ──

  Đây là vế đắt nhất của cả tệp, và nó sinh ra sau khi mọi vế khác đã xanh.

  Chiếc cân chuyển trạng thái bằng hai hình tĩnh xếp lên nhau, đổi `opacity` —
  vì `react-native-svg` raster lại cả hình khi một prop con đổi. Bản đầu chỉ lái
  độ mờ của hình SÁNG; hình nghỉ nằm dưới ở opacity 1 mãi mãi.

  Nhưng mọi lớp của chiếc cân là `alpha(c.foreground, …)`, tức TRONG SUỐT, nên
  xếp hai hình trong suốt lên nhau thì độ mờ CỘNG chứ không thay thế: thân cân
  ra 0,2124 thay vì 0,115 — gần GẤP ĐÔI con số đã chọn. Đó đúng là
  *"brightness filter cho toàn bộ cái cân"* mà chủ dự án bác.

  Và mọi vế đo ở dưới vẫn XANH suốt vòng đó, vì chúng dựng lại MỘT hình trên
  trang trong khi app vẽ HAI. Bài học chung, đã trả giá hai lần trong một phiên:
  **một phép đo chỉ đúng khi nó mô hình hoá đúng thứ app vẽ ra.** Nên vế này
  không đo màu — nó canh cái GIẢ THIẾT mà mọi vế đo còn lại đứng trên.
*/
CASES++;
{
  const SHEET = 'src/app/log-weight.tsx';
  const sheet = readFileSync(path.join(NATIVE, SHEET), 'utf8');
  const figs = [...sheet.matchAll(/<BodyScaleFigure[\s\S]{0,200}?\/>/g)];
  /*
    Canh cái được DÙNG, không phải cái được KHAI BÁO.

    Bản đầu của vế này tìm `opacity: 1 - glow.value` trong cả tệp. Tôi phá thử
    bằng cách bỏ `<Animated.View style={restFace}>` đi — và luật vẫn XANH, vì
    dòng `const restFace = useAnimatedStyle(…)` còn nguyên ở trên. Một luật canh
    lời khai báo thì không canh gì cả: lỗi thật là style KHÔNG được gắn vào hình.

    Nên vế này canh THỨ TỰ trong JSX: mỗi hình phải có một lớp bọc mang độ mờ
    của riêng nó, ngay TRƯỚC nó.
  */
  const decl = (name, body) => new RegExp(`const ${name} = useAnimatedStyle\\(\\(\\) => \\(\\{ opacity: ${body} \\}\\)\\)`).test(sheet);
  /* Vị trí một tên xuất hiện trong MỘT prop `style=`, không phải ở chỗ khai báo. */
  const usedAt = (name) => {
    const m = new RegExp(`style=\\{\\[?[^}]*\\b${name}\\b`).exec(sheet);
    return m ? m.index : -1;
  };
  const litFig = figs.find((f) => /\blit\b/.test(f[0]));
  const restFig = figs.find((f) => !/\blit\b/.test(f[0]));
  const bad = [];
  if (figs.length >= 2) {
    if (!decl('restFace', '1 - glow\\.value')) bad.push('không có `restFace` với `opacity: 1 - glow.value`');
    if (!decl('litFace', 'glow\\.value')) bad.push('không có `litFace` với `opacity: glow.value`');
    const uR = usedAt('restFace');
    const uL = usedAt('litFace');
    if (uR < 0) bad.push('`restFace` không được GẮN vào một prop `style=` nào');
    if (uL < 0) bad.push('`litFace` không được GẮN vào một prop `style=` nào');
    if (uR >= 0 && restFig && !(uR < restFig.index)) bad.push('`restFace` không bọc hình NGHỈ');
    if (uL >= 0 && litFig && !(uL < litFig.index)) bad.push('`litFace` không bọc hình SÁNG');
    if (uR >= 0 && uL >= 0 && !(uR < uL)) bad.push('hai lớp bọc đảo thứ tự — hình sáng phải nằm TRÊN');
  }
  if (bad.length) {
    problems.push(
      `${SHEET}: ${figs.length} hình chiếc cân xếp lớp, nhưng ${bad.join('; ')}. Mọi lớp của chiếc cân là ` +
        '`alpha(…)`, tức TRONG SUỐT, nên hai hình xếp lên nhau CỘNG độ mờ chứ không thay thế: thân cân ra ' +
        '0,2124 thay vì 0,115, gần GẤP ĐÔI. Cả chiếc cân sáng lên — đúng thứ chủ dự án đã bác — và mọi vế ' +
        'đo màu trong tệp này vẫn xanh, vì chúng dựng lại MỘT hình trong khi app vẽ HAI',
    );
  }
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

  /*
    MỘT chỗ dựng lại chồng mặt, dùng cho cả bảng đang ship và cho phần tự kiểm ở
    cuối tệp. Hai đường đo khác nhau thì phần tự kiểm không chứng minh được gì.
  */
  const surfaces = (theme, t) => {
    const p = palettes[theme];
    const page = hex(p.background);
    const ink = hex(p.foreground);
    const plate = overC(ink, page, t.plate);
    const panel = overC(WHITE, plate, t.lamp);
    const pad = overC(ink, plate, t.pad);
    return {
      plate, panel, pad,
      /* Hai đường VIỀN của thân cân. Chúng cũng là thân cân, và chúng đã trốn
         được trần "thân đóng băng" đúng một vòng vì trần chỉ soi mặt. */
      edge: overC(ink, page, t.edge),
      inner: overC(ink, plate, t.inner),
      /* Rim của tấm cảm biến: `null` nghĩa là KHÔNG có mép, không phải "mép mờ". */
      rim: t.padEdge > 0 ? overC(ink, pad, t.padEdge) : null,
      bezel: overC(hex(p[t.bezelOn]), panel, t.bezel),
    };
  };
  /*
    Trần của "thân cân đóng băng" — 1,03 — và trần của "tấm cảm biến không sáng
    lên" — 1,05. Hai con số này không rơi từ trên trời: chúng nằm GIỮA bộ số
    đang ship và bộ số chủ dự án đã bác. Xem `REJECTED` ở cuối tệp.
  */
  const BODY_CEIL = 1.03;
  const PAD_CEIL = 1.05;
  /** Rim phải NHÌN THẤY được như một đường nét, không phải một vệt mờ. */
  const RIM = 1.5;

  for (const theme of ['light', 'dark']) {
    const p = palettes[theme];
    const vi = theme === 'light' ? 'sáng' : 'tối';
    const page = hex(p.background);
    const ink = hex(p.foreground);
    const si = surfaces(theme, tone[theme].idle);
    const sa = surfaces(theme, tone[theme].active);

    /*
      ── kênh 3 · bốn tấm cảm biến phản ứng bằng HÌNH DẠNG, không bằng độ sáng ──

      Chủ dự án chỉ thẳng vào phần này — *"đây là phần tôi muốn bạn chú ý hơn"* —
      và nói nó phải giống *cảm biến áp lực đang được kích hoạt*. Nên luật đòi
      đúng hai điều, và chúng NGƯỢC nhau: mặt tấm gần như bất động, mà tấm vẫn
      phải phản ứng rõ.
    */
    CASES++;
    if (tone[theme].idle.padEdge !== 0 || tone[theme].active.padEdge <= 0) {
      problems.push(
        `${FIG}: bản ${vi}, \`padEdge\` phải là 0 lúc NGHỈ và >0 lúc HOẠT ĐỘNG (đang là ` +
          `${tone[theme].idle.padEdge} → ${tone[theme].active.padEdge}). Cú phản ứng của bốn tấm cảm ` +
          'biến LÀ đường rim mọc ra — bỏ nó đi thì chúng chỉ còn cách sáng lên, tức quay về đúng cái ' +
          'brightness filter đã bị bác',
      );
    }
    CASES++;
    const rimSeen = sa.rim ? ratio(sa.rim, sa.pad) : 1;
    if (rimSeen < RIM) {
      problems.push(
        `${FIG}: bản ${vi}, đường rim của tấm cảm biến chỉ ${rimSeen.toFixed(3)}:1 so với mặt tấm — ` +
          `dưới ${RIM}. Nó là toàn bộ phản ứng của bốn tấm; mờ hơn thế thì tấm cảm biến không phản ứng gì`,
      );
    }
    CASES++;
    const jumpPad = ratio(sa.pad, si.pad);
    if (jumpPad > PAD_CEIL) {
      problems.push(
        `${FIG}: bản ${vi}, mặt tấm cảm biến SÁNG LÊN ${jumpPad.toFixed(4)}× — trên trần ${PAD_CEIL}. ` +
          'Bốn tấm phải phản ứng bằng `padEdge` (một đường mép mọc ra), không bằng độ sáng: bộ số đã bị ' +
          'bác nâng 0,06→0,12 và đo 1,3263×, và đó là lý do trần này tồn tại',
      );
    }

    /*
      ── kênh 4 · bề dày nét ──
      Ở đây vì chủ dự án nói rõ: *"đừng cố ép mọi thay đổi vào một opacity duy
      nhất"*. Một đường nét dày lên đọc ra "chắc lại", không phải "sáng lên".
    */
    for (const k of ['padW', 'bezelW']) {
      CASES++;
      if (tone[theme].active[k] <= tone[theme].idle[k]) {
        problems.push(
          `${FIG}: bản ${vi}, \`${k}\` không dày lên khi hoạt động (${tone[theme].idle[k]} → ` +
            `${tone[theme].active[k]}). Bề dày là kênh thứ tư của cú thức dậy — mất nó thì cả hiệu ứng ` +
            'lại chỉ còn là mấy con số độ mờ',
        );
      }
    }

    /*
      ── kênh 2 · khung kính ĐẢO CHIỀU ──

      Trên máy thật, ánh sáng không đi qua cái khung nhựa quanh kính, nên khi đèn
      bật thì viền quanh màn hình là đường TỐI NHẤT của mặt cân. Đó là chi tiết
      làm một tấm sáng đọc ra *màn hình* chứ không phải *một lỗ trắng*.

      Suy ra: viền ấy phải tối hơn tấm nền lúc HOẠT ĐỘNG. Ở bản tối điều đó buộc
      `bezelOn` đổi token (`foreground` → `background`), vì tấm nền đi từ gần đen
      sang gần trắng — một độ mờ đi lên trên cùng một token thì KHÔNG làm được.
    */
    CASES++;
    if (sa.bezel[0] >= sa.panel[0]) {
      problems.push(
        `${FIG}: bản ${vi}, khung màn hình lúc HOẠT ĐỘNG (${toHex(sa.bezel)}) không TỐI hơn tấm nền ` +
          `(${toHex(sa.panel)}). Đèn bật thì khung là đường tối nhất của mặt cân — ánh sáng không đi qua ` +
          `khung. Ở bản tối, vế này là lý do \`bezelOn\` phải đảo token, đang là \`${tone[theme].active.bezelOn}\``,
      );
    }
    CASES++;
    const bezA = ratio(sa.bezel, sa.panel);
    if (bezA < RIM) {
      problems.push(
        `${FIG}: bản ${vi}, khung màn hình lúc HOẠT ĐỘNG chỉ ${bezA.toFixed(3)}:1 so với tấm nền — dưới ` +
          `${RIM}. Không đủ để tấm sáng đọc ra một cái màn hình có khung`,
      );
    }
    CASES++;
    const bezI = ratio(si.bezel, si.panel);
    if (bezI < STEP) {
      problems.push(
        `${FIG}: bản ${vi}, khung màn hình lúc NGHỈ chỉ ${bezI.toFixed(3)}:1 so với tấm nền — dưới bậc ` +
          `bề mặt ${STEP}. Lúc nghỉ chiếc cân vẫn phải còn cái màn hình của nó`,
      );
    }

    /* Cân sáng lên thì mọi lớp phải ĐI LÊN, không lớp nào đi xuống. `bezel` KHÔNG
       nằm trong danh sách này: nó đổi TOKEN giữa hai trạng thái ở bản tối, nên so
       hai độ mờ của hai token khác nhau là một phép so vô nghĩa — vế của nó là
       hai luật hướng/độ rõ ngay trên. */
    for (const k of ['plate', 'edge', 'pad', 'lamp', 'padEdge']) {
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
      const { plate, panel } = st === 'idle' ? si : sa;
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
    const jumpPanel = ratio(sa.panel, si.panel);
    const jumpPlate = ratio(sa.plate, si.plate);
    CASES++;
    if (jumpPanel <= jumpPlate) {
      problems.push(
        `${FIG}: bản ${vi}, bước nhảy của MẶT MÀN HÌNH (${jumpPanel.toFixed(3)}) không lớn hơn bước nhảy ` +
          `của THÂN CÂN (${jumpPlate.toFixed(3)}). Đặt hàng nói rõ: "display là điểm sáng chính… đừng làm ` +
          'toàn bộ chiếc cân phát sáng"',
      );
    }
    /*
      ── THÂN CÂN phải ĐÓNG BĂNG, và đây là vế đắt nhất của luật này ──

      Vế ngay trên — "tấm nền nhảy xa hơn thân cân" — là ĐIỀU KIỆN CẦN mà KHÔNG
      ĐỦ, và bộ số đã bị bác chứng minh đúng điều đó: nó có tấm nền nhảy 8,198×
      trên một thân cân nhảy 1,0908×, tức nó QUA được vế trên, và vẫn bị chủ dự
      án bác bằng mắt: *"❌ brightness filter cho toàn bộ cái cân"*.

      Bài học: một tỉ lệ giữa hai lớp không nói được lớp nền có tự sáng lên hay
      không. Cần một TRẦN TUYỆT ĐỐI trên chính thân cân.

          thân cân đổi     bộ đã bị bác      bộ này
          sáng             1,0375×           1,0092×
          tối              1,0908×           1,0119×

      Trần 1,03 nằm giữa hai cột, có biên cả hai phía. Phần tự kiểm ở cuối tệp
      chạy lại đúng bộ đã bị bác qua CÙNG hàm `surfaces()` và đòi trần này đỏ —
      nên nó là một luật đã được chứng minh, không phải một lời hứa.

      ── và bản đầu của trần này chỉ soi MẶT, nên hai đường VIỀN trốn được ──

      Vòng sau, chủ dự án chốt nguyên tắc *"Body và outer border gần như giữ
      nguyên"*. Đo lại từng lớp thì mặt thân đúng là đóng băng — nhưng hai đường
      VIỀN của thân cân là hai lớp động mạnh nhất cả hình sau display:

          lớp             sáng      tối
          viền ngoài      1,0930×   1,1926×
          viền trong      1,0708×   1,1054×
          mặt thân        1,0092×   1,0119×

      Cái 1,1926× nâng sáng cả CHU VI chiếc cân — một bản nhẹ của *"viền sáng
      xung quanh"* trong danh sách cấm — và còn lớn hơn cú nhảy thân cân của bộ
      đã bị bác (1,0908×). Không vế nào thấy, vì trần chỉ soi mặt.

      Bài học lặp lại lần thứ ba trong phiên: **một cái trần chỉ chặn được đúng
      cái nó đo.** Nên trần nay áp cho CẢ BA lớp thân cân.
    */
    for (const [k, vn] of [['plate', 'MẶT THÂN CÂN'], ['edge', 'VIỀN NGOÀI'], ['inner', 'VIỀN TRONG']]) {
      CASES++;
      const jump = ratio(sa[k], si[k]);
      if (jump > BODY_CEIL) {
        problems.push(
          `${FIG}: bản ${vi}, ${vn} tự sáng lên ${jump.toFixed(4)}× — trên trần ${BODY_CEIL}. Đặt hàng nói ` +
            'rõ: "Body và outer border gần như giữ nguyên". Nâng cả thân cân lên là `brightness filter cho ' +
            'toàn bộ cái cân`, thứ đã bị bác một lần; nâng riêng chu vi lên là `viền sáng xung quanh`, thứ ' +
            'cũng nằm trong danh sách cấm. Chỉ tấm đèn, khung kính và rim của bốn tấm cảm biến được phản ứng',
        );
      }
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
    const { panel } = surfaces('dark', tone.dark.idle);
    if (ratio(hex(p.mutedForeground), panel) >= TEXT) {
      problems.push(
        'tools/body-scale.mjs: phần tự kiểm KHÔNG còn bắt được `mutedForeground` trên mặt màn hình bản ' +
          'tối lúc nghỉ — phép đo đã đổi và vế chữ ở trên không còn đỏ được với token đã từng rớt',
      );
    }
  }

  /*
    ── tự kiểm 2: bộ số CHỦ DỰ ÁN ĐÃ BÁC phải làm luật này đỏ ──

    Đây là bản ghi của một vòng đã trả giá. Bộ dưới là đúng những con số tôi ship
    ở vòng trước; chủ dự án xem render và bác — *"Đây không được là chuyện đổi màu
    cái cân từ tối sang sáng"*, *"❌ brightness filter cho toàn bộ cái cân"*.

    Ba vế mới của luật này (trần thân cân, trần mặt tấm cảm biến, rim bắt buộc)
    được chọn để đỏ với chính bộ ấy. Chạy lại nó qua CÙNG hàm `surfaces()` là
    cách duy nhất chứng minh điều đó — nếu ai sau này nới trần lên cho tiện, vế
    này đỏ và nói ra rằng cái lỗi cũ vừa được mời quay lại.
  */
  {
    const REJECTED = {
      light: {
        idle: { plate: 0.05, edge: 0.13, inner: 0.07, pad: 0.08, padEdge: 0, lamp: 0.75, bezelOn: 'foreground', bezel: 0.07 },
        active: { plate: 0.07, edge: 0.17, inner: 0.09, pad: 0.12, padEdge: 0, lamp: 1, bezelOn: 'foreground', bezel: 0.09 },
      },
      dark: {
        idle: { plate: 0.11, edge: 0.17, inner: 0.06, pad: 0.06, padEdge: 0, lamp: 0.06, bezelOn: 'foreground', bezel: 0.06 },
        active: { plate: 0.14, edge: 0.22, inner: 0.09, pad: 0.12, padEdge: 0, lamp: 0.8, bezelOn: 'foreground', bezel: 0.09 },
      },
    };
    for (const theme of ['light', 'dark']) {
      const vi = theme === 'light' ? 'sáng' : 'tối';
      const ri = surfaces(theme, REJECTED[theme].idle);
      const ra = surfaces(theme, REJECTED[theme].active);
      const caught = [
        ['trần thân cân', ratio(ra.plate, ri.plate) > BODY_CEIL],
        ['trần mặt tấm cảm biến', ratio(ra.pad, ri.pad) > PAD_CEIL],
        ['rim bắt buộc', REJECTED[theme].active.padEdge <= 0],
        /* Bộ ấy mang luôn hai đường viền đã nâng cả chu vi lên (tối 0,17→0,22 =
           1,1926×), nên nó cũng là bằng chứng cho trần viền. */
        ['trần viền ngoài', ratio(ra.edge, ri.edge) > BODY_CEIL],
        ['trần viền trong', ratio(ra.inner, ri.inner) > BODY_CEIL],
      ];
      for (const [what, fires] of caught) {
        CASES++;
        if (!fires) {
          problems.push(
            `tools/body-scale.mjs: vế **${what}** KHÔNG còn đỏ với bộ số bản ${vi} chủ dự án đã bác ` +
              `(thân ${ratio(ra.plate, ri.plate).toFixed(4)}× · tấm cảm biến ` +
              `${ratio(ra.pad, ri.pad).toFixed(4)}× · padEdge ${REJECTED[theme].active.padEdge}). ` +
              'Luật đã bị nới đến mức cho phép lại đúng cái nó sinh ra để chặn',
          );
        }
      }
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
        'đừng làm toàn bộ chiếc cân phát sáng". Cú thức dậy đi qua BỐN KÊNH KHÁC NHAU, và luật canh từng ' +
        `kênh riêng: (1) độ sáng — chỉ tấm đèn được bật; (2) đảo chiều — khung kính phải TỐI hơn tấm nền ` +
        'khi đèn bật (ở bản tối vế này buộc `bezelOn` đổi token `foreground`→`background`, vì một độ mờ ' +
        `đi lên trên cùng một token không làm được); (3) hình dạng — bốn tấm cảm biến KHÔNG sáng lên ` +
        `(trần ${PAD_CEIL}×) mà mọc ra một đường rim ≥${RIM}:1; (4) bề dày — \`padW\`/\`bezelW\` phải dày ` +
        `lên. Và THÂN CÂN có một trần TUYỆT ĐỐI ${BODY_CEIL}×: vế "tấm nền nhảy xa hơn thân cân" là cần ` +
        'mà không đủ, vì bộ số chủ dự án đã bác QUA được nó (tấm 8,198× trên thân 1,0908×) rồi vẫn bị ' +
        'bác bằng mắt là "brightness filter cho toàn bộ cái cân". Phần tự kiểm chạy lại chính bộ ấy qua ' +
        'cùng hàm `surfaces()` và đòi ba vế mới đỏ với nó. Hai lỗi đã trả giá nằm ở đầu tệp: một token chữ rớt 3,48 ' +
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
