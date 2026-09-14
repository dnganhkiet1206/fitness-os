/**
 * Cái cốc trên thẻ Nước: đầy đúng theo mục tiêu, và không tràn.
 *
 * ── luật do chủ dự án đặt ──
 *
 * "Bỏ icon này giữ lại chữ nước uống nhưng ghi to hơn, vẽ cái cốc ở vị trí bên
 * phải, mỗi lần log mực nước trong cốc sẽ dâng lên theo mục tiêu cho tới khi
 * đầy là hoàn thành 100%."
 *
 * Vế cuối là một phát biểu ĐO ĐƯỢC, nên nó được canh bằng cách CHẠY phép tính
 * chứ không bằng cách đọc lại JSX.
 *
 * ── và một luật mà bản dựng web không bao giờ thấy ──
 *
 * `useAnimatedProps` chạy trên luồng UI. Gọi một hàm thường nhập từ module khác
 * ở trong đó sẽ ném trên máy thật — "non-worklet function on the UI thread" —
 * còn trên web thì KHÔNG ném, vì web không có luồng UI riêng để mà ném.
 *
 * Đây đúng loại lỗi `live.mjs` mù: ảnh chụp đẹp, máy thật trắng màn. Nên phép
 * tính mực nước phải ở ngoài worklet, và bước này canh đúng chuyện đó.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(path.join(tmpdir(), 'water-glass-'));
const read = (p) => readFileSync(path.join(NATIVE, p), 'utf8');

const blank = (s) => s.replace(/[^\n]/g, ' ');
const stripComments = (s) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, lead) => lead + blank(m.slice(lead.length)));

try {
  execFileSync(
    'npx',
    ['tsc', 'src/lib/water-glass.ts', 'src/constants/palette.ts', '--ignoreConfig', '--outDir', out,
      '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const { waterFill, clampFill, waterPath, WATER_CEIL, WATER_FLOOR, WATER_SPAN, WAVE_AMP, GLASS_W, GLASS_PATH } =
    createRequire(import.meta.url)(path.join(out, 'lib', 'water-glass.js'));

  const problems = [];
  let cases = 0;
  const eq = (what, got, want) => {
    cases++;
    if (Math.abs(got - want) > 1e-9) problems.push(`${what}: ${got}, đáng lẽ ${want}`);
  };

  const SPAN = WATER_FLOOR - WATER_CEIL;

  /* Chưa uống ngụm nào thì cốc RỖNG — không phải một vệt xanh mỏng ở đáy, thứ
     đọc ra là "đã uống một chút". */
  eq('0% thì không có nước', waterFill(0).height, 0);
  eq('0% thì mặt nước nằm ở đáy', waterFill(0).y, WATER_FLOOR);

  /* Đầy là đầy tới trong lòng cốc, không tràn qua vành. */
  eq('100% thì đầy cốc', waterFill(100).height, SPAN);
  eq('100% thì mặt nước ở mức đầy', waterFill(100).y, WATER_CEIL);

  eq('nửa mục tiêu thì nửa cốc', waterFill(50).height, SPAN / 2);

  /*
    Vượt mục tiêu là ca THẬT, xảy ra mỗi ngày ai đó uống nhiều hơn mục tiêu.
    Không kẹp thì cột nước dâng quá vành và — vì nó bị cắt theo thành cốc —
    phần thừa biến thành một mảng xanh phủ kín cả cái cốc.
  */
  eq('vượt mục tiêu vẫn là đầy, không tràn', waterFill(150).height, SPAN);
  eq('… và không đẩy mặt nước lên quá vành', waterFill(150).y, WATER_CEIL);
  eq('số âm thì vẫn rỗng', waterFill(-20).height, 0);
  eq('không phải số thì vẫn rỗng', waterFill(Number.NaN).height, 0);

  /*
    Đáy cột nước ĐỨNG YÊN: `y + height` luôn bằng mặt trong của đáy. Nếu hai giá
    trị ấy trôi khỏi nhau thì trong lúc chuyển động cột nước sẽ nhấc khỏi đáy —
    một cái cốc có nước lơ lửng ở giữa.
  */
  for (const p of [0, 1, 17, 50, 83, 99.5, 100, 400]) {
    cases++;
    const f = waterFill(p);
    if (Math.abs(f.y + f.height - WATER_FLOOR) > 1e-9) {
      problems.push(`${p}%: đáy cột nước rời khỏi đáy cốc (y+height=${f.y + f.height}, đáy=${WATER_FLOOR})`);
    }
  }

  /* Uống thêm không bao giờ làm mực nước TỤT. */
  let prev = -1;
  for (let p = 0; p <= 120; p += 2.5) {
    cases++;
    const h = waterFill(p).height;
    if (h < prev - 1e-9) problems.push(`mực nước tụt xuống ở ${p}%`);
    prev = h;
  }

  /*
    ── phép kẹp, và con số đã ĐO ──

    `waterFill` kẹp phần trăm nên ĐÍCH luôn hợp lệ. Cái không hợp lệ là một
    khung hình ở giữa: `withDelay(200, withTiming(...))` phát đúng một khung có
    tiến độ ÂM trước khi phần trễ kết thúc. Đo trên trình duyệt, ghi từng lượt
    ghi lên thuộc tính của `<rect>`, ra `y = 92,31` và `height = −42,31` — giải
    ngược là tiến độ −1,36.

    Nên ca đầu tiên dưới đây là CHÍNH con số đã đo, không phải một số tròn tôi
    nghĩ ra.
  */
  eq('khung tiến độ âm đã đo vẫn cho chiều cao hợp lệ', clampFill(-42.31762386200287).height, 0);
  eq('… và mép trên về đúng đáy cốc', clampFill(-42.31762386200287).y, WATER_FLOOR);
  eq('vọt quá đầy thì dừng ở đầy', clampFill(WATER_SPAN + 20).height, WATER_SPAN);
  eq('… và không lên quá vành', clampFill(WATER_SPAN + 20).y, WATER_CEIL);
  eq('NaN thì rỗng', clampFill(Number.NaN).height, 0);
  eq('giá trị hợp lệ thì đi thẳng qua', clampFill(17.5).height, 17.5);

  /*
    Kẹp CHIỀU CAO rồi SUY RA mép trên, chứ không kẹp hai giá trị độc lập: kẹp
    riêng thì cả hai có thể hợp lệ mà vẫn không ăn khớp, và cột nước nhấc khỏi
    đáy cốc trong một khung.
  */
  for (const h of [-100, -42.3, 0, 1, 22.25, 44.5, 60, 1e9]) {
    cases++;
    const f = clampFill(h);
    if (Math.abs(f.y + f.height - WATER_FLOOR) > 1e-9) {
      problems.push(`clampFill(${h}): y+height=${f.y + f.height}, đáng lẽ ${WATER_FLOOR}`);
    }
  }

  /* Thành cốc phải LOE: đáy hẹp hơn miệng, nếu không thì nó là một cái hộp. */
  /*
    Đọc MỌI điểm cuối, kể cả điểm cuối của cung `A` — bản đầu chỉ bắt `M`/`L`,
    nên hai góc đáy bo (vốn là điểm cuối của hai cung) bị bỏ qua và phép thử
    ngược "biến cốc thành hộp" đi lọt. Một bộ dò đọc thiếu nửa hình thì nó
    không đo cái hình ấy.
  */
  const NUM = '(-?\\d+(?:\\.\\d+)?)';
  const xs = [
    ...[...GLASS_PATH.matchAll(new RegExp(`[ML] ?${NUM}[ ,]${NUM}`, 'g'))],
    ...[...GLASS_PATH.matchAll(new RegExp(`A ?${NUM}[ ,]${NUM} ${NUM} ${NUM} ${NUM} ${NUM}[ ,]${NUM}`, 'g'))].map(
      (m) => [m[0], m[6], m[7]],
    ),
  ].map((m) => [Number(m[1]), Number(m[2])]);
  const rim = xs.filter(([, y]) => y <= 4).map(([x]) => x);
  const base = xs.filter(([, y]) => y >= 45).map(([x]) => x);
  cases++;
  if (rim.length < 2 || base.length < 2) {
    problems.push('không đọc được miệng và đáy từ đường viền cốc');
  } else if (Math.max(...base) - Math.min(...base) >= Math.max(...rim) - Math.min(...rim)) {
    problems.push('cốc không loe — đáy rộng bằng hoặc hơn miệng, nên nó đọc ra là một cái hộp');
  }

  /* ── thẻ vẽ đúng thứ đã hứa ── */
  /*
    ── mặt sóng ──

    Chủ dự án xem bản `<rect>` rồi nói "chuyển động xấu, không phải không có":
    một mặt phẳng tuyệt đối trượt lên là chuyển động của một cái THANH. Nước bị
    đổ thêm thì động trước, lặng sau.

    Nên `waterPath` nhận một biên độ, và mọi ca dưới đây kiểm CHÍNH chuỗi nó trả
    về chứ không kiểm ý định.
  */
  const flat = waterPath(20, 0, 0);
  cases++;
  if (/Q/.test(flat)) problems.push('biên độ 0 mà mặt nước vẫn cong — lúc lặng phải là mặt phẳng, không phải một đường răng cưa');
  cases++;
  if (!/Q/.test(waterPath(20, WAVE_AMP, 0))) problems.push('có biên độ mà mặt nước vẫn phẳng — sóng không được vẽ');

  /*
    Chu kỳ đúng bằng bề ngang cốc, nên dịch TRỌN một chu kỳ phải ra hình y hệt.
    Không có tính chất này thì sóng trượt tới cuối vòng sẽ nhảy một cái.
  */
  cases++;
  if (waterPath(20, WAVE_AMP, 0) !== waterPath(20, WAVE_AMP, 1)) {
    problems.push('dịch trọn một chu kỳ ra hình khác — sóng sẽ nhảy ở chỗ nối');
  }
  cases++;
  if (waterPath(20, WAVE_AMP, 0.25) !== waterPath(20, WAVE_AMP, 3.25)) {
    problems.push('pha không lấy phần lẻ — sóng chạy lâu sẽ trôi ra khỏi cốc');
  }

  /* Phủ kín bề ngang cốc ở MỌI pha, kể cả pha lẻ: hụt một đầu là một mép nước
     bị cắt cụt lộ ra giữa thân cốc. */
  for (const ph of [0, 0.17, 0.5, 0.83, 0.99]) {
    cases++;
    const xs = [...waterPath(20, WAVE_AMP, ph).matchAll(/[ML]?(-?\d+(?:\.\d+)?) -?\d/g)].map((m) => Number(m[1]));
    if (Math.min(...xs) > 0 || Math.max(...xs) < GLASS_W) {
      problems.push(`pha ${ph}: đường nước chỉ phủ ${Math.min(...xs)}..${Math.max(...xs)}, không kín 0..${GLASS_W}`);
    }
  }

  /* Cùng luật kẹp với `clampFill`: số âm và quá đầy đều phải hiền. */
  cases++;
  if (waterPath(-999, WAVE_AMP, 0) !== waterPath(0, WAVE_AMP, 0)) {
    problems.push('chiều cao âm không được kẹp về rỗng trong waterPath');
  }
  cases++;
  if (waterPath(WATER_SPAN + 999, 0, 0) !== waterPath(WATER_SPAN, 0, 0)) {
    problems.push('quá đầy không được kẹp về đầy trong waterPath');
  }

  /* Mặt nước cao dần theo lượng uống — đọc thẳng toạ độ y đầu tiên của chuỗi. */
  const topOf = (h) => Number(waterPath(h, 0, 0).match(/^M-?[\d.]+ (-?[\d.]+)/)[1]);
  let prevTop = Infinity;
  for (let h = 0; h <= WATER_SPAN; h += WATER_SPAN / 20) {
    cases++;
    const t = topOf(h);
    if (t > prevTop + 1e-9) problems.push(`mặt nước tụt xuống ở chiều cao ${h.toFixed(1)}`);
    prevTop = t;
  }
  cases++;
  if (Math.abs(topOf(WATER_SPAN) - WATER_CEIL) > 1e-9) {
    problems.push(`đầy 100% thì mặt nước ở ${topOf(WATER_SPAN)}, đáng lẽ ${WATER_CEIL}`);
  }

  const card = stripComments(read('src/components/ascnd/dashboard-cards.tsx'));
  const water = card.slice(card.indexOf('export function WaterWidget'), card.indexOf('export function StepsWidget'));
  if (!/figure=\{<WaterGlass/.test(water)) {
    problems.push('WaterWidget không còn vẽ cái cốc ở cuối hàng');
  }
  if (/icon=\{/.test(water) || /ring=\{/.test(water)) {
    problems.push(
      'WaterWidget lại mang huy hiệu icon hoặc vòng tròn — cái cốc đã là hình của nó, hai hình cho một con số là một hình thừa',
    );
  }
  if (!/\blead\b/.test(water)) {
    problems.push('WaterWidget bỏ mất `lead` — chữ "Nước uống" tụt về dòng phụ 12 điểm, trong khi không còn huy hiệu nào gọi tên thẻ');
  }

  /*
    Phần trăm rời khỏi màn hình nên phải quay lại bằng LỜI. Một cái hình mang
    nghĩa mà không có lời đi kèm là một cái hình chỉ người sáng mắt đọc được.
  */
  if (!/const a11y = figure \? `\$\{label\}: \$\{valueText\}, \$\{pct\}%`/.test(card)) {
    problems.push('CompactWidget: nhãn trợ năng không còn mang phần trăm — người dùng VoiceOver mất hẳn con số khi nó nhường chỗ cho cái cốc');
  }
  if (!/accessibilityLabel=\{a11y\}/.test(card)) {
    problems.push('CompactWidget: nhãn trợ năng được tính nhưng không được gắn vào chỗ bấm');
  }

  /*
    Và luật mà web mù: phép tính mực nước KHÔNG được nằm trong worklet.
  */
  /*
    Tìm theo HÌNH DẠNG, không theo một dòng cụ thể.

    Bản đầu neo vào đúng chuỗi `useAnimatedProps(() => ({ y: top.value` — và
    phép thử ngược đã cho thấy vì sao đó là sai: bản phá thay chính dòng ấy,
    nên bộ dò không tìm thấy neo và báo "đang tự xanh" thay vì báo đúng lỗi nó
    sinh ra để bắt. Một luật chỉ bắt được bản mã đã đúng thì nó không bắt gì.
  */
  const body = card.slice(card.indexOf('function WaterGlass'), card.indexOf('function CompactWidget'));
  if (!body.includes('useAnimatedProps(')) {
    problems.push('WaterGlass không còn worklet nào vẽ mực nước — bộ dò này đang tự xanh');
  }
  for (const m of body.matchAll(/useAnimatedProps\(/g)) {
    /* Lát cắt tới dấu đóng của lời gọi, đếm ngoặc chứ không đoán. */
    let i = m.index + m[0].length - 1;
    let depth = 0;
    let end = body.length;
    for (; i < body.length; i++) {
      if (body[i] === '(') depth++;
      else if (body[i] === ')') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (/waterFill\s*\(/.test(body.slice(m.index, end))) {
      problems.push(
        'waterFill() bị gọi TRONG useAnimatedProps — một hàm nhập từ module khác chạy trên luồng UI sẽ ném trên máy thật, và bản dựng web không bao giờ lộ nó',
      );
    }
  }
  /* Và nó PHẢI được gọi ở đâu đó trong component, trên luồng JS. */
  if (!/waterFill\(pct\)/.test(body)) {
    problems.push('WaterGlass không gọi waterFill(pct) — mực nước lại được tính tại chỗ, ngoài tầm với của bước gác này');
  }
  /*
    Worklet PHẢI đi qua `clampFill`, không được đọc thẳng shared value: đọc
    thẳng là trả lại đúng khung hình âm đã đo ở trên.
  */
  if (!/waterPath\(/.test(body)) {
    problems.push('WaterGlass không dựng đường nước qua waterPath — mực nước lại được vẽ tại chỗ, ngoài tầm với của bước gác này');
  }
  /*
    Và `clampFill` — thứ DUY NHẤT được phép chạy trong worklet ở đây — phải
    mang chỉ thị `'worklet'`. Thiếu nó thì nó là một hàm thường nằm giữa luồng
    UI: ném trên máy thật, im lặng trên web.
  */
  const lib = read('src/lib/water-glass.ts');
  for (const fnName of ['clampFill', 'waterPath']) {
    cases++;
    const fn = lib.slice(lib.indexOf(`export function ${fnName}`));
    if (!/^\s*'worklet';\s*$/m.test(fn.slice(0, fn.indexOf('return')))) {
      problems.push(`${fnName} thiếu chỉ thị 'worklet' — nó chạy trên luồng UI, và thiếu chỉ thị thì nó ném trên máy thật trong khi web không nói gì`);
    }
  }

  /*
    ── cái cốc phải NHÌN THẤY ĐƯỢC khi rỗng ──

    Đây là bài học đã ghi sẵn ở `tools/activity.mjs` cho vòng hoạt động: rãnh
    vòng đo 1,01:1 so với thẻ, nên một vòng ở mức 0 "sẽ không thấy gì", và lỗi
    được báo là "nhìn hơi placeholder" chứ không ai gọi tên được nó.

    Cái cốc có đúng rủi ro ấy, mạnh hơn: lòng cốc rỗng ở MỌI mức alpha chỉ cho
    1,1–1,4:1, nên nó không bao giờ gánh nổi việc hiện hình. VIỀN gánh, và viền
    phải qua sàn 3:1 của WCAG 1.4.11 cho đồ hoạ mang nghĩa — trên CẢ HAI diện
    mạo, vì bản đầu qua được bản tối mà trượt bản sáng thì vẫn là trượt.

    Giá trị đọc THẲNG từ mã đang ship, không gõ tay: một con số chép lại là một
    con số sẽ lệch ở lần sửa kế tiếp.
  */
  const pal = createRequire(import.meta.url)(path.join(out, 'constants', 'palette.js'));
  const chan = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const lum = (h) => {
    const [r, g, b] = chan(h).map(lin);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const over = (fg, a, bg) => {
    const f = chan(fg);
    const b = chan(bg);
    return '#' + f.map((v, i) => Math.round((v * a + b[i] * (1 - a)) * 255).toString(16).padStart(2, '0')).join('');
  };
  /* Mặt thẻ: giấy là trắng (đo trên ảnh dựng); tối là glass 6% trắng trên nền. */
  const SURFACE = { 'giấy': '#ffffff', 'tối': over('#ffffff', 0.06, '#070708') };
  const TOKEN = { 'giấy': pal.lightPalette, 'tối': pal.colors ?? pal.darkPalette };

  /* Viền phải là token ĐẶC, không phải một lớp mờ. */
  /* Cắt đúng thân `WaterGlass` trước khi dò: bản đầu quét cả tệp và bắt trúng
     `stroke={c[TRACK]}` của `MiniRing` ở phía trên — một bộ dò tìm thấy thứ
     đầu tiên hợp dạng là một bộ dò trả lời câu hỏi khác. */
  const glassBody = card.slice(card.indexOf('function WaterGlass'), card.indexOf('function CompactWidget'));
  const strokeLine = glassBody.match(/stroke=\{([^}]+)\}\s+strokeWidth/);
  if (!strokeLine || !/^tint$/.test(strokeLine[1].trim())) {
    problems.push(
      `viền cốc không còn là token đặc (đọc được "${strokeLine?.[1]?.trim() ?? 'không thấy'}") — bản mờ 0,5 đo được 2,11:1 trên giấy, dưới sàn 3:1`,
    );
  }
  /* Nước dùng khoá RIÊNG, không dùng chung với viền: dùng chung thì thành cốc
     tan vào mặt nước đúng lúc cốc đầy. */
  if (!/graphicOf\(c, 'waterFill'\)/.test(glassBody)) {
    problems.push('nước không còn đọc khoá `waterFill` — dùng chung khoá với viền thì thành cốc tan vào mặt nước đúng lúc cốc đầy');
  }
  for (const [name, surf] of Object.entries(SURFACE)) {
    cases++;
    const tint = TOKEN[name].metricBlue;
    const cStroke = contrast(tint, surf);
    if (cStroke < 3) {
      problems.push(`viền cốc ${tint} chỉ ${cStroke.toFixed(2)}:1 so với mặt thẻ bản ${name} — dưới sàn 3:1, và ở mức 0% cái cốc là thứ DUY NHẤT còn nhìn thấy`);
    }
    cases++;
    const w = TOKEN[name].waterFill;
    if (!w) {
      problems.push(`bảng màu bản ${name} chưa có khoá waterFill`);
      continue;
    }
    const cWater = contrast(w, surf);
    if (cWater < 3) {
      problems.push(`nước ${w} chỉ ${cWater.toFixed(2)}:1 so với mặt thẻ bản ${name} — dưới sàn 3:1 của WCAG 1.4.11`);
    }
    /*
      ── một luật ĐÃ VIẾT RỒI GỠ, và lý do ở lại ──

      Bản đầu của bước này đòi thành cốc phải tương phản ≥1,5:1 với mặt nước,
      sợ rằng cốc đầy thì mất hình. Nó đỏ ngay: 1,34:1 trên giấy, 1,13:1 bản
      tối.

      Nhưng kết luận ấy SAI, và cái sai nằm ở chỗ nó đo một đại lượng có thật
      rồi suy ra một hậu quả không có thật. Nét viền vẽ CHỒNG LÊN đường biên,
      tức một nửa nét nằm ngoài đường ấy. Nước thì bị cắt theo ĐÚNG đường ấy,
      nên nó chỉ dâng tới TIM nét. Nửa ngoài của nét — 1,25 trên nét 2,5 — luôn
      nằm trên mặt thẻ, và nó đo 5,00:1 trên giấy.

      Nên hình cái cốc do nửa ngoài giữ, và nó không phụ thuộc mực nước chút
      nào. Thứ đáng canh là nét-với-mặt-thẻ, và nó đã được canh ngay trên.

      Ghi lại thay vì xoá lặng lẽ: con số 1,34:1 là thật, và người tiếp theo
      nhìn thấy nó sẽ muốn "sửa" đúng như tôi đã suýt làm.
    */
  }
  /*
    Và nước phải là XANH NƯỚC. `metricCyan` trên giấy là #077b8b — một sắc teal
    sẫm — nên bản đầu cho một mặt nước xanh lục. Đo bằng sắc độ, không bằng tên.
  */
  cases++;
  if (/metricCyan/.test(glassBody)) {
    problems.push("cốc lại dùng metricCyan — trên giấy nó là #077b8b, teal sẫm, nên mặt nước đọc ra xanh lục chứ không phải xanh nước");
  }

  if (problems.length) {
    console.error('cốc nước sai:\n');
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }

  console.log(
    `cốc nước OK — ${cases} ca CHẠY THẬT: rỗng là rỗng hẳn, đầy là đầy tới trong lòng cốc, vượt mục tiêu vẫn là đầy chứ không tràn, đáy cột nước đứng yên tuyệt đối, và mực nước không bao giờ tụt khi uống thêm. Thẻ bỏ huy hiệu + vòng tròn, tên thẻ tự đứng, phần trăm rời màn hình nhưng quay lại bằng lời cho VoiceOver. Phép tính đích nằm NGOÀI worklet, còn phép kẹp ở trong và mang chỉ thị 'worklet'. Ca kẹp đầu tiên là CHÍNH con số đo được trên trình duyệt (−42,31), không phải số tròn nghĩ ra. Viền cốc qua sàn 3:1 của WCAG 1.4.11 trên CẢ HAI diện mạo — vì ở mức 0% nó là thứ duy nhất còn nhìn thấy — và nước có khoá RIÊNG cũng qua sàn ấy. Mặt sóng: lặng thì phẳng, động thì cong, dịch trọn một chu kỳ ra đúng hình cũ nên không nhảy ở chỗ nối, và phủ kín bề ngang ở mọi pha`,
  );
} finally {
  rmSync(out, { recursive: true, force: true });
}
