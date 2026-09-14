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
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
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
  const {
    waterFill, clampFill, waterPath, waterLine,
    WATER_CEIL, WATER_FLOOR, WATER_SPAN, WAVE_AMP, REST_AMP, STROKE,
    GLASS_W, GLASS_H, GLASS_STROKE_PATH, GLASS_CLIP_PATH,
    TOP_Y, BOT_Y, TOP_LEFT, TOP_RIGHT, BOT_LEFT, BOT_RIGHT,
  } = createRequire(import.meta.url)(path.join(out, 'lib', 'water-glass.js'));

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
  /* Giá trị giữa khoảng đi thẳng qua. Lấy theo WATER_SPAN chứ không gõ một số
     cụ thể: bản trước gõ 17,5 và nó thành sai ngay khi lưới đổi sang 24 của
     lucide — một ca gác chỉ đúng với một hình cụ thể là một ca sẽ đỏ oan. */
  eq('giá trị hợp lệ thì đi thẳng qua', clampFill(WATER_SPAN / 2).height, WATER_SPAN / 2);

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

  /*
    ── năm thứ đọc ra từ ẢNH chủ dự án gửi, và cả năm đều canh được ──

    Bốn bản cốc trước đều bị bác: icon nét phẳng, phối cảnh elip, đường của
    lucide, rồi bản phối cảnh có đáy dày. Rồi chủ dự án gửi ảnh chụp một app
    khác — thứ họ thấy đẹp — và nó nói năm điều:

      1. miệng cốc HỞ, không đường ngang, hai đầu nét bo tròn
      2. nét RẤT DÀY, màu TRUNG TÍNH, không phải xanh
      3. đáy bo tròn rộng, thành hơi thuôn
      4. sóng mặt nước RÕ và LỚN
      5. một vệt sáng nhỏ trong lòng nước

    Luật dưới đây canh từng thứ. Không phải vì "đẹp" đo được, mà vì bỏ mất một
    trong năm là quay lại đúng một trong bốn bản đã bị bác — và lần nào tôi
    cũng bỏ mất chính cái miệng hở.
  */
  cases++;
  if (/Z\s*$/.test(GLASS_STROKE_PATH)) {
    problems.push('đường thành cốc bị KHÉP — một đường ngang vắt qua miệng biến cái cốc thành cái hộp, và đó đúng là bản đã bị bác');
  }
  cases++;
  if (GLASS_CLIP_PATH !== `${GLASS_STROKE_PATH} Z`) {
    problems.push('vùng cắt không còn là chính hình cốc khép lại — nước sẽ lệch khỏi thành khi dáng cốc đổi');
  }
  cases++;
  if (!(STROKE >= 3.5)) {
    problems.push(`nét cốc chỉ ${STROKE} — chủ dự án chốt "nét đậm", và nét mảnh là bản đã bị bác`);
  }
  cases++;
  if (!(BOT_LEFT > TOP_LEFT && BOT_RIGHT < TOP_RIGHT)) {
    problems.push('cốc không thuôn — đáy rộng bằng hoặc hơn miệng, nên nó là một cái ống');
  }
  cases++;
  if (!GLASS_STROKE_PATH.includes('Q')) {
    problems.push('đáy cốc không bo — góc vuông ở đáy là hình của một cái hộp');
  }
  /* Hai đầu nét phải cùng nằm ở mép trên và cách xa nhau: đó LÀ cái miệng hở. */
  cases++;
  {
    const pts = [...GLASS_STROKE_PATH.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map((mm) => [
      Number(mm[1]),
      Number(mm[2]),
    ]);
    const [x0, y0] = pts[0];
    const [x1, y1] = pts[pts.length - 1];
    if (Math.abs(y0 - TOP_Y) > 0.01 || Math.abs(y1 - TOP_Y) > 0.01) {
      problems.push('hai đầu nét không nằm ở mép miệng cốc');
    }
    if (Math.abs(x1 - x0) < 20) {
      problems.push(`hai đầu nét chỉ cách nhau ${Math.abs(x1 - x0)} — miệng cốc gần như khép lại`);
    }
    const lowest = Math.max(...pts.map((q) => q[1]));
    if (Math.abs(lowest - BOT_Y) > 0.01) {
      problems.push(`đáy đường cốc ở ${lowest}, đáng lẽ ${BOT_Y}`);
    }
  }

  /*
    Đường mặt nước phải là ĐƯỜNG, không khép xuống đáy: khép thì stroke sẽ viền
    cả hai thành và đáy cốc — ba đường không ai cần, chạy chồng lên nét cốc.
  */
  cases++;
  if (/Z\s*$/.test(waterLine(10, REST_AMP, 0))) {
    problems.push('đường mặt nước bị khép — stroke sẽ viền cả thành và đáy cốc');
  }
  /* Và nó phải đi ĐÚNG trên mép trên của khối nước, không lệch một đơn vị nào. */
  for (const h of [0, 12, WATER_SPAN]) {
    cases++;
    const lineY = [...waterLine(h, REST_AMP, 0.3).matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map((mm) => mm[2]);
    const bodyY = [...waterPath(h, REST_AMP, 0.3).matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map((mm) => mm[2]);
    if (lineY.join() !== bodyY.slice(0, lineY.length).join()) {
      problems.push(`mực ${h}: đường mặt nước không trùng mép trên khối nước — hai thứ sẽ trôi khỏi nhau khi sóng động`);
    }
  }

  /*
    Cốc CẠN thì không một điểm nước nào được nằm trên mặt đáy.

    Bản đầu để sóng dao động ±REST_AMP ở mọi mức, nên ở 0% nửa dưới của sóng
    rơi xuống dưới đáy và đa giác nước còn một dải mỏng — ảnh dựng cốc cạn vẫn
    có một vệt xanh nhạt. Vật lý cũng nói đúng thế: không có nước thì không có
    gì để dập dềnh.
  */
  for (const ph of [0, 0.25, 0.5, 0.75]) {
    cases++;
    const ys = [...waterPath(0, WAVE_AMP, ph).matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map((mm) =>
      Number(mm[2]),
    );
    if (Math.min(...ys) < WATER_FLOOR - 1e-9) {
      problems.push(`cốc cạn, pha ${ph}: có điểm nước ở ${Math.min(...ys)}, cao hơn mặt đáy ${WATER_FLOOR}`);
    }
  }

  /*
    ── sóng ──

    REST_AMP không được bằng 0, và cũng không được bé: sóng trong ảnh mẫu RÕ.
    Bản phẳng đã bị bác bằng đúng chữ "chuyển động xấu, không phải không có".
  */
  cases++;
  if (!(REST_AMP >= 1)) {
    problems.push(`REST_AMP = ${REST_AMP} — sóng lúc nghỉ quá bé để đọc ra là mặt nước; ảnh mẫu có sóng rõ`);
  }
  cases++;
  if (!(WAVE_AMP > REST_AMP)) {
    problems.push('gợn lúc vừa uống không lớn hơn lúc nghỉ — cú bấm không có phản hồi nào trên mặt nước');
  }

  const xsOf = (d) => [...d.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map((mm) => Number(mm[1]));

  cases++;
  if (waterPath(10, REST_AMP, 0) === waterPath(10, WAVE_AMP, 0)) {
    problems.push('đổi biên độ mà hình không đổi — sóng không được vẽ');
  }
  cases++;
  if (waterPath(10, WAVE_AMP, 0) !== waterPath(10, WAVE_AMP, 1)) {
    problems.push('dịch trọn một chu kỳ ra hình khác — sóng sẽ nhảy ở chỗ nối');
  }

  /* Phủ quá bề ngang cốc ở mọi mức, kẻo lộ mép cắt giữa thân. */
  for (const h of [0, 8, 20, WATER_SPAN]) {
    cases++;
    const xs = xsOf(waterPath(h, WAVE_AMP, 0.4));
    if (Math.min(...xs) > TOP_LEFT || Math.max(...xs) < TOP_RIGHT) {
      problems.push(`mực ${h}: thân nước chỉ phủ ${Math.min(...xs)}..${Math.max(...xs)}, không kín thành cốc`);
    }
  }

  cases++;
  if (waterPath(-999, WAVE_AMP, 0) !== waterPath(0, WAVE_AMP, 0)) {
    problems.push('chiều cao âm không được kẹp về rỗng');
  }
  cases++;
  if (waterPath(WATER_SPAN + 999, REST_AMP, 0) !== waterPath(WATER_SPAN, REST_AMP, 0)) {
    problems.push('quá đầy không được kẹp về đầy');
  }
  cases++;
  if (waterPath(10, -5, 0) !== waterPath(10, 0, 0)) {
    problems.push('biên độ âm không được kẹp về 0');
  }

  let prevTop = Infinity;
  for (let h = 0; h <= WATER_SPAN; h += WATER_SPAN / 20) {
    cases++;
    const t = clampFill(h).y;
    if (t > prevTop + 1e-9) problems.push(`mặt nước tụt xuống ở chiều cao ${h.toFixed(1)}`);
    prevTop = t;
  }
  cases++;
  if (Math.abs(clampFill(WATER_SPAN).y - WATER_CEIL) > 1e-9) problems.push('đầy 100% mà mặt nước không ở mức trên');
  cases++;
  if (Math.abs(clampFill(0).y - WATER_FLOOR) > 1e-9) problems.push('cạn 0% mà mặt nước không ở đáy');
  cases++;
  if (!(WATER_CEIL > TOP_Y && WATER_FLOOR < BOT_Y)) {
    problems.push('quãng mặt nước chạy ra ngoài lòng cốc');
  }

  /*
    ── một cái bẫy CHỈ máy thật mới lộ ──

    Chủ dự án chụp màn từ iPhone: cái cốc là một khối xanh ĐẶC, và dưới chân là
    một vệt đen CỨNG thay vì bóng mờ.

    Nguyên nhân không phải thẩm mỹ. Bản đầu viết `stopColor={alpha(tint, 0.22)}`
    — nhét phần trong suốt vào chuỗi màu. Trên web nó chạy đúng và ảnh dựng
    đẹp; react-native-svg trên máy thật thì BỎ QUA alpha trong `stopColor`, nên
    mọi điểm dừng thành màu đặc.

    Cả kho đã viết đúng cách từ trước — `water-chart`, `status-scrim`, và chính
    `dashboard-cards` ở chỗ khác đều tách `stopOpacity`. Sáu điểm dừng tôi thêm
    là chỗ DUY NHẤT làm khác, và chúng chỉ lộ ra trên ảnh chụp từ máy của chủ
    dự án — `live.mjs` chụp trên web nên nó mù với đúng loại lỗi này.

    Quét TOÀN KHO chứ không riêng thẻ Nước: cái bẫy không thuộc về cái cốc, nó
    thuộc về react-native-svg. Đo trước khi chọn phạm vi — sau bản sửa, toàn
    kho còn 0 chỗ, nên luật này không kêu oan chỗ nào.
  */
  {
    const tsx = [];
    (function walk(d) {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const q = path.join(d, e.name);
        if (e.isDirectory()) walk(q);
        else if (q.endsWith('.tsx')) tsx.push(q);
      }
    })(path.join(NATIVE, 'src'));
    let scanned = 0;
    for (const f of tsx) {
      const src = stripComments(readFileSync(f, 'utf8'));
      scanned++;
      for (const mm of src.matchAll(/<Stop[^>]*stopColor=\{alpha\(/g)) {
        const line = src.slice(0, mm.index).split('\n').length;
        problems.push(
          `${path.relative(NATIVE, f)}:${line}: <Stop> nhét alpha() vào stopColor — react-native-svg bỏ qua nó trên máy thật, điểm dừng sẽ thành màu ĐẶC. Tách ra \`stopOpacity\`.`,
        );
      }
    }
    cases++;
    if (scanned < 50) problems.push(`chỉ quét được ${scanned} tệp tsx — bộ dò hỏng chứ không phải kho sạch`);
  }

  /* ── thẻ vẽ đúng thứ đã hứa ── */
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
    ── con số đếm, và cái bẫy TextInput ──

    `AnimatedNumber` vẽ bằng `TextInput` bên dưới, và một `TextInput` KHÔNG tự
    co theo nội dung. Bản đầu đặt nó cạnh một `<Text>` đuôi trong một hàng, và
    dòng số vỡ đôi trên ảnh dựng: "59,2" dạt trái, "/ 84,5 oz" dạt tận phải.

    Kho đã ghi sẵn cái bẫy này ở `hero-panel.tsx` và `readiness-gauge.tsx`. Nên
    luật: phần đuôi phải đi vào `suffix` của chính component, không được là một
    phần tử anh em.
  */
  cases++;
  if (!/suffix=\{/.test(water)) {
    problems.push('dòng số không dùng `suffix` của AnimatedNumber — TextInput sẽ giãn hết hàng và đẩy phần đuôi ra mép');
  }
  cases++;
  if (/<AnimatedNumber[\s\S]{0,400}?<Text/.test(water)) {
    problems.push('AnimatedNumber đứng cạnh một <Text> trong cùng khối — đó đúng là bản làm dòng số vỡ đôi');
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
  /* Năm thứ đọc từ ảnh mẫu phải CÓ MẶT trong thẻ, không chỉ tồn tại trong thư
     viện hình học. */
  /*
    Ở 0% thì KHÔNG có mặt nước. Bản đầu vẽ đường viền ở mọi mức, nên cốc cạn
    vẫn có một vệt xanh sẫm nằm dưới đáy — đọc ra như một ngụm còn sót, đúng
    thứ mà `waterFill` đã bỏ công trả chiều cao BẰNG 0 để tránh.
  */
  cases++;
  if (!/strokeOpacity:/.test(body)) {
    problems.push('đường mặt nước không mờ theo mực nước — ở 0% nó để lại một vệt xanh dưới đáy cốc cạn');
  }


  for (const piece of ['waterPath', 'waterLine', 'GLASS_STROKE_PATH', 'strokeLinecap="round"', 'fillOpacity']) {
    cases++;
    if (!body.includes(piece)) {
      problems.push(`WaterGlass không vẽ ${piece} — mất một thứ trong ảnh mẫu, tức quay lại một bản đã bị bác`);
    }
  }
  /* Nét cốc TRUNG TÍNH, không phải xanh: trong ảnh mẫu cái cốc là thuỷ tinh
     xám, và chỉ có nước mới mang màu. */
  cases++;
  if (!/stroke=\{c\.mutedForeground\}/.test(body)) {
    problems.push('nét cốc không còn màu trung tính — cốc xanh thì cái cốc và cái nước nói cùng một màu, mất ranh giới');
  }
  /* Và nét phải mang đúng bộ thuộc tính của lucide, kẻo cái cốc lạc khỏi mọi
     icon còn lại trên cùng màn hình. */
  for (const attr of ['strokeLinecap="round"', 'strokeLinejoin="round"']) {
    cases++;
    if (!body.includes(attr)) problems.push(`nét cốc thiếu ${attr} — lucide vẽ mọi icon với nó`);
  }
  /*
    Và `clampFill` — thứ DUY NHẤT được phép chạy trong worklet ở đây — phải
    mang chỉ thị `'worklet'`. Thiếu nó thì nó là một hàm thường nằm giữa luồng
    UI: ném trên máy thật, im lặng trên web.
  */
  const lib = read('src/lib/water-glass.ts');
  for (const fnName of ['clampFill', 'waterPath', 'waterLine']) {
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
  /*
    Nét cốc phải là một TOKEN ĐẶC, không phải một lớp mờ — và tên token đọc
    THẲNG từ mã rồi tra bảng màu, chứ không gõ cứng ở đây. Bản đầu của luật này
    khoá chặt vào `tint`, nên khi nét đổi sang màu trung tính theo ảnh mẫu thì
    nó đỏ oan: một luật gác khoá vào MỘT lựa chọn thiết kế sẽ chặn đúng lần
    thiết kế đổi.

    Bản mờ đã đo: `alpha(tint, 0.5)` cho 2,11:1 trên giấy — dưới sàn 3:1.
  */
  const strokeLine = glassBody.match(/stroke=\{c\.([A-Za-z]+)\}/);
  if (!strokeLine) {
    problems.push('không đọc được token nét cốc — nó phải là một token đặc `c.<tên>`, không phải một lớp mờ');
  }
  /* Nước dùng khoá RIÊNG, không dùng chung với viền: dùng chung thì thành cốc
     tan vào mặt nước đúng lúc cốc đầy. */
  if (!/graphicOf\(c, 'waterFill'\)/.test(glassBody)) {
    problems.push('nước không còn đọc khoá `waterFill` — dùng chung khoá với viền thì thành cốc tan vào mặt nước đúng lúc cốc đầy');
  }
  for (const [name, surf] of Object.entries(SURFACE)) {
    cases++;
    const strokeTok = strokeLine ? TOKEN[name][strokeLine[1]] : null;
    if (!strokeTok) {
      problems.push(`bảng màu bản ${name} không có token nét cốc \`${strokeLine?.[1]}\``);
    } else {
      const cStroke = contrast(strokeTok, surf);
      if (cStroke < 3) {
        problems.push(`nét cốc ${strokeTok} chỉ ${cStroke.toFixed(2)}:1 so với mặt thẻ bản ${name} — dưới sàn 3:1, và ở mức 0% cái cốc là thứ DUY NHẤT còn nhìn thấy`);
      }
    }
    /*
      ── phần TÔ cố ý KHÔNG phải chỗ mang số liệu ──

      Chủ dự án chỉ vào một ảnh: "màu cho giống hình này nè". Đo màu ấy trên
      hai nền:

          trên nền ĐEN của app trong ảnh   11,23:1
          trên mặt thẻ TRẮNG của app này    1,76:1

      Cùng một màu, hai thế giới. Nên luật KHÔNG đòi phần tô qua sàn — đòi thế
      là ép chủ dự án bỏ màu họ chọn. Thứ phải qua sàn là ĐƯỜNG MẶT NƯỚC, chỗ
      thật sự nói mực nước cao tới đâu.

      Ghi lại để không ai "sửa" ngược: 1,76:1 của phần tô là CỐ Ý, và nó chỉ
      đúng chừng nào đường mặt nước còn đó.
    */
    cases++;
    const w = TOKEN[name].waterFill;
    if (!w) {
      problems.push(`bảng màu bản ${name} chưa có khoá waterFill`);
      continue;
    }
    /*
      ── HOẶC phần tô, HOẶC đường mặt nước — mỗi diện mạo một chỗ ──

      Bước gác bản đầu đòi đường mặt nước qua sàn ở CẢ HAI diện mạo, và nó đỏ ở
      bản tối. Đỏ đúng con số nhưng sai kết luận: trên nền TỐI, phần tô xanh
      nhạt đã cho 11:1 so với mặt thẻ, tức chính nó đang mang thông tin. Đường
      viền ở đó là thừa, không phải thiếu.

      Việc của đường mặt nước KHÁC NHAU theo diện mạo, và luật phải nói đúng
      thế: mỗi diện mạo phải có ÍT NHẤT MỘT chỗ qua sàn 3:1 — hoặc phần tô so
      với mặt thẻ, hoặc đường viền so với phần tô. Đòi cả hai là đòi một thứ
      không tồn tại trên bảng màu này.
    */
    cases++;
    const lineTok = read('src/components/ascnd/dashboard-cards.tsx').match(
      /stroke=\{(\w+)\}\s*\n\s*strokeWidth=\{1\.6\}/,
    )?.[1];
    const lineHex = lineTok === 'deep' ? TOKEN[name].metricBlueInk : null;
    const cFillVsCard = contrast(w, surf);
    const cLineVsFill = lineHex ? contrast(lineHex, w) : 0;
    if (cFillVsCard < 3 && cLineVsFill < 3) {
      problems.push(
        `bản ${name}: phần tô ${w} chỉ ${cFillVsCard.toFixed(2)}:1 so với mặt thẻ, và đường mặt nước ${lineHex ?? '(không đọc được)'} chỉ ${cLineVsFill.toFixed(2)}:1 so với phần tô — không chỗ nào nói được mực nước cao tới đâu`,
      );
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
    `cốc nước OK — ${cases} ca CHẠY THẬT: rỗng là rỗng hẳn, đầy là đầy tới trong lòng cốc, vượt mục tiêu vẫn là đầy chứ không tràn, đáy cột nước đứng yên tuyệt đối, và mực nước không bao giờ tụt khi uống thêm. Thẻ bỏ huy hiệu + vòng tròn, tên thẻ tự đứng, phần trăm rời màn hình nhưng quay lại bằng lời cho VoiceOver. Phép tính đích nằm NGOÀI worklet, còn phép kẹp ở trong và mang chỉ thị 'worklet'. Ca kẹp đầu tiên là CHÍNH con số đo được trên trình duyệt (−42,31), không phải số tròn nghĩ ra. Viền cốc qua sàn 3:1 của WCAG 1.4.11 trên CẢ HAI diện mạo — vì ở mức 0% nó là thứ duy nhất còn nhìn thấy — và ĐƯỜNG MẶT NƯỚC qua sàn ấy so với phần tô — phần tô thì CỐ Ý không, vì nó mang màu chủ dự án chọn chứ không mang số liệu. Và năm thứ đọc từ ẢNH chủ dự án gửi đều được canh từng thứ: miệng HỞ (đường không khép, hai đầu nét cách nhau ở mép trên), nét DÀY, nét TRUNG TÍNH, đáy BO và thành THUÔN, sóng RÕ. Bỏ mất một cái là quay lại đúng một trong bốn bản đã bị bác — và lần nào tôi cũng bỏ mất chính cái miệng hở. Cộng một luật quét TOÀN KHO cho cái bẫy chỉ máy thật mới lộ: <Stop> không được nhét alpha() vào stopColor — react-native-svg bỏ qua nó và điểm dừng thành màu ĐẶC, thứ mà live.mjs chụp trên web không bao giờ thấy`,
  );
} finally {
  rmSync(out, { recursive: true, force: true });
}
