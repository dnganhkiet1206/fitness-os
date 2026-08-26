/**
 * Nhân vật đứng hình trong lúc trang cuộn — và chạy lại sau đó.
 *
 * ── lỗi có thật mà tệp này tồn tại vì nó ──
 *
 * `KoaFigure` chạy một `useFrameCallback` nuôi 36 vòng chuyển động ở nhịp của
 * màn hình, tới 120 khung hình một giây. Chú thích của chính nó gọi đó là "cost
 * driver của cả nhân vật: mọi lớp có hiệu ứng đều tính lại khi nó nhích", và
 * nói rõ cổng duy nhất của đồng hồ ấy là prop `animated`, do CHỖ GỌI chịu
 * trách nhiệm.
 *
 * Trên dashboard, chỗ gọi truyền `animated={focused}`. Đúng cho việc chuyển
 * tab, và vô nghĩa trong lúc cuộn: đang xem dashboard thì `focused` luôn true.
 * Nên suốt mỗi cú vuốt, cái rig ấy chạy hết công suất trên đúng luồng UI đang
 * phải trộn lại lớp kính của tấm nội dung, bốn viên quick-log, dải trên đỉnh và
 * ba `useAnimatedStyle`. Chi phí của nó không đều — 36 vòng có chu kỳ khác nhau
 * nên vài khung hình đắt hơn hẳn — nên nó đọc ra là "thỉnh thoảng giật nhẹ" chứ
 * không phải chậm đều, và đó đúng là thứ đã bị báo lại.
 *
 * `mascot-room.tsx` gặp đúng lỗi này trước và ghi lại: *"một cú cuộn (bắt đầu
 * và dừng) là phần còn lại của cú giật"*. Cơ chế `scrollPause` ra đời từ đó và
 * xuyên sẵn qua `MascotFigure` xuống `KoaFigure`. Thứ duy nhất còn thiếu suốt
 * từ đó là chưa ai nối nó ở dashboard.
 *
 * ── vì sao nối dây thôi thì CHƯA đủ để yên tâm ──
 *
 * Chế độ hỏng của bản sửa này tệ hơn chính lỗi nó sửa: một `scrollPause` bị kẹt
 * ở `true` không làm chậm gì cả — nó làm nhân vật THÔI THỞ, vĩnh viễn, cho tới
 * khi đổi tab. Và nó kẹt rất dễ: một cú kéo chậm rồi thả tay KHÔNG sinh đà, nên
 * nó không bao giờ nhận `onMomentumEnd`. Một bản sửa chỉ nghe hai sự kiện đà sẽ
 * đúng với mọi cú vuốt mạnh — tức là với mọi lần thử tay — và hỏng đúng ở cú
 * kéo chậm.
 *
 * Nên tệp này không kiểm dây nối. Nó DỰNG LẠI máy trạng thái từ chính mã nguồn
 * đang chạy — trích đúng đối tượng truyền cho `useAnimatedScrollHandler` ở
 * `index.tsx`, không chép lại một bản — rồi lái nó qua mọi chuỗi sự kiện mà
 * `UIScrollView` thật sự bắn ra, và đòi hai điều ở mọi chuỗi:
 *
 *   · trong lúc cuộn, `scrollPause` phải là TRUE  (nếu không thì không sửa gì)
 *   · khi mọi thứ đã dừng, phải là FALSE          (nếu không thì nhân vật chết)
 *
 * Vế đầu là răng của luật. Không có nó, một bộ xử lý không bao giờ đặt pause
 * vẫn xanh — mà đó chính là bản đã xuất xưởng.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(NATIVE, rel), 'utf8');

const TODAY = 'src/app/(tabs)/index.tsx';
const MASCOT = 'src/components/ascnd/mascot.tsx';
const FIGURE = 'src/components/ascnd/mascot-figure.tsx';

const problems = [];

/** Cắt ra biểu thức trong ngoặc, đếm ngoặc cân bằng và bỏ qua chuỗi/chú thích. */
function balanced(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i) + 1; continue; }
    if (c === "'" || c === '"' || c === '`') {
      const q = c;
      for (i += 1; i < src.length; i += 1) {
        if (src[i] === '\\') { i += 1; continue; }
        if (src[i] === q) break;
      }
      continue;
    }
    if (c === '(' || c === '{') depth += 1;
    if (c === ')' || c === '}') { depth -= 1; if (depth === 0) return src.slice(open, i + 1); }
  }
  return null;
}

/* ── 1. dây nối ─────────────────────────────────────────────────────────────
   Không phải để thay cho phần hành vi bên dưới, mà vì một máy trạng thái đúng
   không nối vào nhân vật thì cũng chẳng làm gì. */
const today = read(TODAY);
const mascotSrc = read(MASCOT);
const figureSrc = read(FIGURE);

const passedTo = /<Mascot\b[^>]*\bscrollPause=\{(\w+)\}/.exec(today);
if (!passedTo) {
  problems.push(`${TODAY}: <Mascot> không nhận scrollPause — đồng hồ 36 vòng của KoaFigure chạy suốt cú cuộn`);
} else {
  const name = passedTo[1];
  if (!new RegExp(`const\\s+${name}\\s*=\\s*useSharedValue\\(`).test(today)) {
    problems.push(`${TODAY}: scrollPause truyền cho <Mascot> (\`${name}\`) không phải useSharedValue — đọc trên luồng UI là cả điểm của cơ chế này`);
  }
  if (!new RegExp(`${name}\\.value\\s*=`).test(today)) {
    problems.push(`${TODAY}: \`${name}\` không bao giờ được GHI — một cờ không ai bật thì không dừng gì cả`);
  }
}
if (!/scrollPause=\{scrollPause\}/.test(mascotSrc)) {
  problems.push(`${MASCOT}: Mascot không chuyển tiếp scrollPause xuống MascotFigure`);
}
if (!/scrollPause=\{scrollPause\}/.test(figureSrc)) {
  problems.push(`${FIGURE}: MascotFigure không chuyển tiếp scrollPause xuống KoaFigure`);
}

/* ── 2. máy trạng thái, chạy thật ───────────────────────────────────────────
   Trích đúng đối tượng đang chạy, không chép lại. */
const anchor = today.indexOf('useAnimatedScrollHandler(');
if (anchor < 0) {
  problems.push(`${TODAY}: không tìm thấy useAnimatedScrollHandler — luật này không còn chỗ bám, sửa luật chứ đừng bỏ`);
}
const argSrc = anchor < 0 ? null : balanced(today, today.indexOf('(', anchor));
if (anchor >= 0 && (!argSrc || !argSrc.includes('onBeginDrag'))) {
  problems.push(
    `${TODAY}: useAnimatedScrollHandler không còn nhận dạng ĐỐI TƯỢNG có onBeginDrag — ` +
      'dạng một-hàm chỉ nghe onScroll, nên không có chỗ nào biết cú kéo bắt đầu hay kết thúc',
  );
}

/**
 * Dựng lại bộ xử lý từ mã nguồn.
 *
 * Mọi thứ nó với tới ngoài `scrollPause` đều được thay bằng hàm rỗng: tệp này
 * kiểm đúng một máy trạng thái, và kéo cả `tabScrollFrame` thật vào đây sẽ
 * biến nó thành một bài kiểm về thanh tab.
 */
function machine(src) {
  const pause = { value: false };
  const scrollY = { value: 0 };
  const make = new Function(
    'scrollPause', 'scrollY', 'tabScrollFrame', 'runOnJS', 'armTabBarRestore', 'Date',
    `return ${src.replace(/^\(/, '').replace(/\)$/, '')};`,
  );
  const h = make(pause, scrollY, () => false, () => () => {}, () => {}, Date);
  return { pause, h };
}

/** Mọi chuỗi sự kiện mà một `UIScrollView` thật sự bắn ra. */
const SEQUENCES = [
  {
    name: 'kéo chậm rồi thả tay, KHÔNG sinh đà',
    /* Ca chết người: không có onMomentumEnd nào để mà đợi. */
    events: ['onBeginDrag', 'onScroll', 'onScroll', 'onEndDrag'],
  },
  {
    name: 'vuốt mạnh rồi để đà chạy hết',
    events: ['onBeginDrag', 'onScroll', 'onEndDrag', 'onMomentumBegin', 'onScroll', 'onScroll', 'onMomentumEnd'],
  },
  {
    name: 'chộp lại giữa đà rồi thả',
    events: ['onBeginDrag', 'onEndDrag', 'onMomentumBegin', 'onScroll', 'onBeginDrag', 'onScroll', 'onEndDrag'],
  },
  {
    name: 'cuộn bằng lệnh (scrollTo có hiệu ứng), không có ngón tay nào',
    events: ['onMomentumBegin', 'onScroll', 'onMomentumEnd'],
  },
  {
    name: 'chạm rồi nhấc, không nhích một điểm nào',
    events: ['onBeginDrag', 'onEndDrag'],
  },
];

if (argSrc) {
  for (const seq of SEQUENCES) {
    let m;
    try {
      m = machine(argSrc);
    } catch (e) {
      problems.push(`không dựng lại được bộ xử lý cuộn từ ${TODAY}: ${e.message}`);
      break;
    }
    let paused = false;
    for (const name of seq.events) {
      m.h[name]?.({ contentOffset: { y: 40 }, contentSize: { height: 2000 }, layoutMeasurement: { height: 800 } });
      if (m.pause.value) paused = true;
    }
    /* Răng: nếu chưa lần nào đông cứng thì bản sửa không tồn tại. */
    if (!paused) {
      problems.push(`"${seq.name}": scrollPause KHÔNG BAO GIỜ bật — đồng hồ nhân vật chạy suốt cú cuộn`);
    }
    /* Và chế độ hỏng tệ hơn: kẹt ở true thì nhân vật thôi thở vĩnh viễn. */
    if (m.pause.value) {
      problems.push(`"${seq.name}": mọi thứ đã dừng mà scrollPause vẫn TRUE — nhân vật đứng hình cho tới khi đổi tab`);
    }
  }
}

/* ── 3. phép tự kiểm ────────────────────────────────────────────────────────
   Hai bản hỏng dựng từ chính mã nguồn đang chạy, mỗi bản gỡ đúng một tay cầm,
   và mỗi bản phải đỏ ĐÚNG ở chỗ đã dự đoán. */
const SELF = argSrc
  ? [
      {
        name: 'gỡ onBeginDrag',
        /* Bản đã xuất xưởng: không có chỗ nào biết cú kéo bắt đầu. */
        mutate: (s) => s.replace(/onBeginDrag:\s*\(\)\s*=>\s*\{[^}]*\},?/, ''),
        expect: /KHÔNG BAO GIỜ bật/,
      },
      {
        name: 'gỡ onEndDrag (chỉ còn nghe đà)',
        mutate: (s) => s.replace(/onEndDrag:\s*\(\)\s*=>\s*\{[^}]*\},?/, ''),
        expect: /vẫn TRUE — nhân vật đứng hình/,
      },
    ]
  : [];

const selfFail = [];
for (const s of SELF) {
  const broken = s.mutate(argSrc);
  if (broken === argSrc) {
    selfFail.push(`${s.name}: không gỡ được gì — phép thử ngược đang thử một bản y hệt bản thật`);
    continue;
  }
  const found = [];
  for (const seq of SEQUENCES) {
    let m;
    try {
      m = machine(broken);
    } catch (e) {
      selfFail.push(`${s.name}: bản hỏng không chạy được — ${e.message}`);
      break;
    }
    let paused = false;
    for (const name of seq.events) {
      m.h[name]?.({ contentOffset: { y: 40 }, contentSize: { height: 2000 }, layoutMeasurement: { height: 800 } });
      if (m.pause.value) paused = true;
    }
    if (!paused) found.push(`"${seq.name}": scrollPause KHÔNG BAO GIỜ bật`);
    if (m.pause.value) found.push(`"${seq.name}": vẫn TRUE — nhân vật đứng hình`);
  }
  if (found.length === 0) selfFail.push(`${s.name}: bản hỏng vẫn XANH — luật này không bắt được gì`);
  else if (!found.some((f) => s.expect.test(f))) {
    selfFail.push(`${s.name}: đỏ, nhưng không đúng chỗ đã dự đoán (${s.expect}); thật ra báo: ${found.join('; ')}`);
  }
}

if (selfFail.length) {
  console.error('phép tự kiểm hỏng — đừng tin kết quả:\n');
  for (const s of selfFail) console.error(`  ${s}`);
  process.exit(2);
}

if (problems.length) {
  console.log('đồng hồ nhân vật không dừng khi cuộn:\n');
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}

console.log(
  'đồng hồ nhân vật khi cuộn OK — Koa trên dashboard nhận scrollPause, và cờ ấy là shared value được GHI ' +
    'trong chính bộ xử lý cuộn (đọc trên luồng UI, không một chuyến sang JS nào, không một hẹn giờ nào); ' +
    'Mascot → MascotFigure → KoaFigure chuyển tiếp đủ ba chặng; ' +
    `và máy trạng thái được TRÍCH ra khỏi index.tsx rồi lái qua ${SEQUENCES.length} chuỗi sự kiện thật của UIScrollView ` +
    '(kéo chậm không sinh đà, vuốt mạnh có đà, chộp lại giữa đà, scrollTo không ngón tay, chạm-nhấc tại chỗ): ' +
    'chuỗi nào cũng đông cứng trong lúc cuộn VÀ trở lại chạy khi dừng — vế sau là chế độ hỏng tệ hơn chính lỗi ' +
    'được sửa, vì một cờ kẹt true không làm chậm gì cả, nó làm nhân vật thôi thở; ' +
    `${SELF.length} phép thử ngược gỡ đúng một tay cầm mỗi bản và cả hai đều đỏ đúng ô đã dự đoán`,
);
