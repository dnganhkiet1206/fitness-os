/**
 * `LiquidGlass` dựng đúng những gì nó vẽ — không hơn.
 *
 * ── lỗi có thật mà tệp này tồn tại vì nó ──
 *
 * `LiquidGlass` có hai chất liệu. `glass` vẽ bốn hình: lớp wash theo `tint`,
 * cộng ba lớp thấu kính (mặt sáng chéo, bóng đổ chéo, vệt specular trên mép).
 * `blur` bỏ đúng ba lớp thấu kính ấy.
 *
 * Hai thứ KHÔNG đi theo khi ba lớp kia bị bỏ:
 *
 *   1. **Ba `<LinearGradient>` trong `<Defs>` vẫn dựng vô điều kiện.** Ở chế độ
 *      `blur` không có một `<Rect>` nào tham chiếu tới chúng, nhưng
 *      `react-native-svg` vẫn tạo ba đối tượng gradient native cộng sáu
 *      `<Stop>` cho MỖI tấm. Chú thích ngay bên trên chúng lại ghi "định nghĩa
 *      cũng chỉ dựng khi cần" — một câu mô tả thứ mã không làm.
 *
 *   2. **Cái vỏ đo vẫn dựng khi không còn hình nào để vẽ.** `blur` + không
 *      `tint` loại cả bốn hình, thế mà `<View onLayout>` vẫn gắn, vẫn gọi
 *      `setState` một lần cho mỗi tấm, và một `<Svg>` rỗng vẫn nằm trong cây.
 *
 * Cả hai đều vô hình trong ảnh chụp: màn hình trông đúng như thiết kế. Chúng
 * chỉ hiện ra ở chỗ chúng làm hỏng — đường cuộn, nơi mỗi node thừa là công phải
 * trộn lại mỗi khung hình. Viên trạng thái của Health Assistant và ô soạn tin
 * của AI Coach đều là `blur` không tint, và cả hai nằm trên đường cuộn.
 *
 * ── vì sao ĐẾM NODE chứ không dò chữ ──
 *
 * Một luật viết bằng regex trên mã nguồn ("phải có `lens ?` trước
 * `<LinearGradient>`") ghim một CÁCH VIẾT, nên nó xanh với bản đúng và cũng
 * xanh với bất kỳ bản nào tình cờ viết giống thế. Đổi tên biến gate là đỏ giả;
 * gate sai điều kiện là xanh giả.
 *
 * Nên tệp này DỰNG THẬT component: dịch `liquid-glass.tsx` sang JS với
 * `--jsxFactory h`, đưa vào một `h` chỉ dựng cây thuần, gọi `LiquidGlass` với
 * đủ bốn tổ hợp (chất liệu × có tint), rồi đếm số node từng loại thật sự sinh
 * ra. Bảng ở `EXPECT` là hợp đồng, và nó nói bằng số chứ không bằng cách viết.
 *
 * ── phép thử ngược ──
 *
 * Cuối tệp dựng lại MỘT bản đã hoàn nguyên đúng hai chỗ sửa (gỡ gate của ba
 * gradient, gỡ gate của cái vỏ đo) và đòi bảng phải đỏ ĐÚNG ở hai ô đã dự đoán.
 * Một máy dò không tự chứng minh mình bắt được lỗi thì chỉ là một dòng chữ
 * xanh.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = 'src/components/ascnd/liquid-glass.tsx';
const OUT = path.join(NATIVE, 'node_modules', '.cache', 'glass-material');

/* ── các module giả ─────────────────────────────────────────────────────────
   Chỉ đủ để component chạy tới `return`. Mỗi "component" là một CHUỖI tên, nên
   cây dựng ra tự nói nó gồm những gì. */
const SHIMS = {
  'h.cjs': `
    /* Một React đủ để dựng cây và không hơn: h(type, props, ...children). */
    module.exports = function h(type, props, ...kids) {
      const flat = [];
      const push = (k) => {
        if (k === null || k === undefined || k === false) return;
        if (Array.isArray(k)) { k.forEach(push); return; }
        flat.push(k);
      };
      kids.forEach(push);
      return { type, props: props || {}, children: flat };
    };`,
  'react.cjs': `
    /* \`size\` được điều khiển từ ngoài: null = chưa đo, object = đã đo. Đó là
       hai lần vẽ có thật của component, và chỉ lần thứ hai mới có hình. */
    let size = null;
    module.exports = {
      useId: () => 'uid',
      useState: () => [size, () => {}],
      _size: (v) => { size = v; },
    };`,
  'react-native.cjs': `
    module.exports = {
      View: 'View',
      StyleSheet: { create: (o) => o, absoluteFill: { __absoluteFill: true } },
    };`,
  'expo-blur.cjs': `module.exports = { BlurView: 'BlurView' };`,
  'react-native-svg.cjs': `
    module.exports = {
      __esModule: true,
      default: 'Svg',
      Defs: 'Defs',
      LinearGradient: 'LinearGradient',
      RadialGradient: 'RadialGradient',
      Rect: 'Rect',
      Stop: 'Stop',
    };`,
  'ascnd.cjs': `
    module.exports = {
      glass: { radius: 16, borderWidth: 1, border: 'rgba(255,255,255,0.10)' },
      radius: { lg: 16, full: 999 },
    };`,
};

/**
 * Dịch tệp thật rồi nối nó vào các module giả.
 *
 * `mutate` cho phép dựng một bản ĐÃ HỎNG từ chính mã nguồn đang chạy, thay vì
 * chép tay một bản cũ — hai thứ chỉ khác nhau đúng ở chỗ đang thử.
 */
function build(dir, mutate) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  try {
    execFileSync(
      'npx',
      ['tsc', SRC, '--ignoreConfig', '--outDir', dir, '--rootDir', 'src', '--module', 'commonjs',
        '--target', 'es2020', '--jsx', 'react', '--jsxFactory', 'h', '--skipLibCheck', '--lib', 'es2020,dom'],
      { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch {
    /* `@/constants/ascnd` không phân giải được ngoài bundler nên tsc báo
       TS2307; bản emit vẫn được ghi ra, và đó là thứ cần. */
  }
  const js = path.join(dir, 'components/ascnd/liquid-glass.js');
  let code = readFileSync(js, 'utf8');
  if (mutate) code = mutate(code);
  code =
    `const h = require('../../h.cjs');\n` +
    code
      .replace(/require\("react"\)/g, `require("../../react.cjs")`)
      .replace(/require\("react-native"\)/g, `require("../../react-native.cjs")`)
      .replace(/require\("expo-blur"\)/g, `require("../../expo-blur.cjs")`)
      .replace(/require\("react-native-svg"\)/g, `require("../../react-native-svg.cjs")`)
      .replace(/require\("@\/constants\/ascnd"\)/g, `require("../../ascnd.cjs")`);
  writeFileSync(js, code);
  for (const [name, body] of Object.entries(SHIMS)) writeFileSync(path.join(dir, name), body);
  return js;
}

/** Đếm mọi node theo tên loại, đi hết cây. */
function census(node, acc = {}) {
  if (!node || typeof node !== 'object') return acc;
  const name = typeof node.type === 'string' ? node.type : '?';
  acc[name] = (acc[name] ?? 0) + 1;
  if (node.props && typeof node.props.onLayout === 'function') acc.onLayout = (acc.onLayout ?? 0) + 1;
  for (const kid of node.children) census(kid, acc);
  return acc;
}

/**
 * Hợp đồng, nói bằng số.
 *
 * `Svg`, `LinearGradient`, `RadialGradient`, `Rect` là những hình thật sự vẽ ra;
 * `onLayout` là phép đo kéo theo một `setState` cho mỗi tấm. `BlurView` là chính
 * chất liệu — nó có mặt ở CẢ HAI chế độ, và một bản "tối ưu" làm nó biến mất là
 * một bản đã đổi thiết kế chứ không phải đã tối ưu.
 */
const EXPECT = [
  { material: 'glass', tint: '#ff9f0a', want: { BlurView: 1, Svg: 1, LinearGradient: 3, RadialGradient: 1, Rect: 4, onLayout: 1 } },
  { material: 'glass', tint: undefined, want: { BlurView: 1, Svg: 1, LinearGradient: 3, RadialGradient: 0, Rect: 3, onLayout: 1 } },
  { material: 'blur', tint: '#ff9f0a', want: { BlurView: 1, Svg: 1, LinearGradient: 0, RadialGradient: 1, Rect: 1, onLayout: 1 } },
  /* Không hình nào để vẽ — nên không đo, không Svg, không node nào cả. */
  { material: 'blur', tint: undefined, want: { BlurView: 1, Svg: 0, LinearGradient: 0, RadialGradient: 0, Rect: 0, onLayout: 0 } },
];

const label = (c) => `${c.material}${c.tint ? ' + tint' : ' (không tint)'}`;

/** Chạy cả bốn tổ hợp trên một bản dựng và trả về danh sách sai lệch. */
async function run(js) {
  const react = await import(`file://${path.join(path.dirname(js), '../../react.cjs')}`);
  const mod = await import(`file://${js}?v=${Math.random()}`);
  const bad = [];
  for (const c of EXPECT) {
    /* Lần vẽ đầu chưa có kích thước; lần thứ hai là sau khi `onLayout` trả về.
       Chỉ lần thứ hai mới sinh ra hình, nên đó là lần được đếm. */
    react.default._size({ w: 120, h: 44 });
    const got = census(mod.LiquidGlass({ material: c.material, tint: c.tint }));
    for (const [k, n] of Object.entries(c.want)) {
      const have = got[k] ?? 0;
      if (have !== n) bad.push(`${label(c)}: ${k} = ${have}, phải là ${n}`);
    }
    /* Và bản chưa đo không được vẽ hình nào, ở mọi tổ hợp — nếu không thì
       phần trăm-thay-vì-điểm-ảnh đã quay lại (xem chú thích trong tệp gốc). */
    react.default._size(null);
    const early = census(mod.LiquidGlass({ material: c.material, tint: c.tint }));
    if ((early.Rect ?? 0) !== 0) bad.push(`${label(c)}: vẽ ${early.Rect} <Rect> khi CHƯA đo được hộp`);
  }
  return bad;
}

const good = build(path.join(OUT, 'ok'), null);
const problems = await run(good);

if (problems.length) {
  console.log('chất liệu kính dựng thừa:\n');
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}

/* ── phép thử ngược ──────────────────────────────────────────────────────────
   Hoàn nguyên đúng hai chỗ sửa, trên chính mã nguồn đang chạy. */
const BREAKS = [
  /*
    Hoàn nguyên bằng cách VÔ HIỆU HOÁ điều kiện, không bằng cách xoá ba toán tử
    ba ngôi: xoá `lens ?` để lại một `: null` lơ lửng và bản dựng chết vì cú
    pháp, mà một bản không chạy được thì không chứng minh được gì. `true ?` giữ
    nguyên hình dạng biểu thức và cho ra ĐÚNG hành vi của bản đã xuất xưởng.
  */
  {
    name: 'gỡ gate của ba <LinearGradient> trong <Defs>',
    mutate: (code) => {
      const n = (code.match(/lens \? \(h\(react_native_svg_1\.LinearGradient/g) ?? []).length;
      if (n !== 3) throw new Error(`phép thử ngược sai chỗ: thấy ${n} gate gradient, phải là 3`);
      return code.replace(/lens \? \(h\(react_native_svg_1\.LinearGradient/g, 'true ? (h(react_native_svg_1.LinearGradient');
    },
    /*
      Chỉ `blur + tint` thấy được. `blur` không tint không dựng cái vỏ nào cả
      (bản sửa thứ hai), nên ở đó chẳng có `<Defs>` để mà dựng thừa — hai bản
      sửa che nhau đúng một nửa, và bảng nói ra điều đó thay vì giấu đi.
    */
    expect: [/blur \+ tint: LinearGradient = 3, phải là 0/],
  },
  {
    name: 'gỡ gate của cái vỏ đo',
    mutate: (code) => {
      const n = (code.match(/face \? \(h\(react_native_1\.View/g) ?? []).length;
      if (n !== 1) throw new Error(`phép thử ngược sai chỗ: thấy ${n} gate vỏ đo, phải là 1`);
      return code.replace(/face \? \(h\(react_native_1\.View/, 'true ? (h(react_native_1.View');
    },
    /* Chỉ `blur` không tint mới thấy — ba tổ hợp kia vốn đã dựng cái vỏ này. */
    expect: [/blur \(không tint\): Svg = 1, phải là 0/, /blur \(không tint\): onLayout = 1, phải là 0/],
  },
];

const selfFail = [];
for (const [i, b] of BREAKS.entries()) {
  let broke;
  try {
    /*
      Mỗi bản hỏng một THƯ MỤC riêng, và đó là bắt buộc.

      Bản emit là CommonJS, nên `import()` của nó đi qua bộ nhớ đệm của
      `require` — thứ đánh khoá theo đường dẫn đã phân giải, không theo chuỗi
      truy vấn. Dựng cả hai bản hỏng vào cùng một chỗ thì lần thứ hai nhận lại
      module của lần thứ nhất, và phép thử ngược báo cáo về một bản không phải
      bản nó vừa dựng. Đúng lỗi ấy đã xảy ra ở đây một lần.
    */
    broke = await run(build(path.join(OUT, `break-${i}`), b.mutate));
  } catch (e) {
    selfFail.push(`${b.name}: không dựng được bản hỏng — ${e.message}`);
    continue;
  }
  if (broke.length === 0) {
    selfFail.push(`${b.name}: bản hỏng vẫn XANH — luật này không bắt được gì`);
    continue;
  }
  for (const want of b.expect) {
    if (!broke.some((p) => want.test(p))) {
      selfFail.push(`${b.name}: đỏ, nhưng không đúng chỗ đã dự đoán (${want}); thật ra báo: ${broke.join('; ')}`);
    }
  }
}
rmSync(OUT, { recursive: true, force: true });

if (selfFail.length) {
  console.error('phép tự kiểm hỏng — đừng tin kết quả:\n');
  for (const s of selfFail) console.error(`  ${s}`);
  process.exit(2);
}

console.log(
  `chất liệu kính OK — dựng THẬT LiquidGlass ở ${EXPECT.length} tổ hợp (glass/blur × có/không tint) và đếm node sinh ra: ` +
    'blur bỏ đúng ba lớp thấu kính VÀ ba <LinearGradient> định nghĩa chúng (trước đây vẫn dựng cho mỗi tấm dù không Rect nào dùng); ' +
    'blur không tint không dựng vỏ đo, không <Svg>, không setState nào — vì nó không còn hình nào để vẽ; ' +
    'BlurView vẫn có ở cả hai chất liệu (bỏ nó là đổi thiết kế, không phải tối ưu); ' +
    'không chế độ nào vẽ <Rect> trước khi đo được hộp; ' +
    `${BREAKS.length} phép thử ngược hoàn nguyên đúng hai chỗ sửa và cả hai đều đỏ đúng ô đã dự đoán`,
);
