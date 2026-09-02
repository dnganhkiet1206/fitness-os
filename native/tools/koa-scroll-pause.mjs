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
 * và dừng) là phần còn lại của cú giật"*. Cơ chế `hold` ra đời từ đó và
 * xuyên sẵn qua `MascotFigure` xuống `KoaFigure`. Thứ duy nhất còn thiếu suốt
 * từ đó là chưa ai nối nó ở dashboard.
 *
 * ── vì sao nối dây thôi thì CHƯA đủ để yên tâm ──
 *
 * Chế độ hỏng của bản sửa này tệ hơn chính lỗi nó sửa: một `hold` bị kẹt
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
 *   · trong lúc cuộn, `hold` phải là TRUE  (nếu không thì không sửa gì)
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

const passedTo = /<Mascot\b[^>]*\bhold=\{(\w+)\}/.exec(today);
if (!passedTo) {
  problems.push(`${TODAY}: <Mascot> không nhận hold — đồng hồ 36 vòng của KoaFigure chạy suốt cú cuộn`);
} else {
  const name = passedTo[1];
  /*
    `useDerivedValue` HOẶC `useSharedValue` — cả hai đều đọc được trên luồng UI,
    và đó là cả điểm của cơ chế.

    Hai luật ở đây từng đòi đúng `useSharedValue` và đòi thấy một phép GHI
    `x.value =`. Cả hai đều mô tả bản một-lý-do: hồi ấy bộ xử lý cuộn ghi thẳng
    vào cờ chung. Với bốn lý do thì cờ chung là một phép OR — nó KHÔNG được ghi,
    và đúng ra là không được ghi: mỗi người ghi phải nhớ OR ba lý do còn lại là
    hình dạng mà thay đổi ấy sinh ra để bỏ.

    Nên luật đọc đúng bất biến mới: nó phải đọc được trên luồng UI, và phải có
    thứ gì đó khiến nó ĐỔI — hoặc một phép ghi trực tiếp, hoặc một phép suy ra
    từ các cờ lý do.
  */
  const derived = new RegExp(`const\\s+${name}\\s*=\\s*useDerivedValue\\(`).test(today);
  const shared = new RegExp(`const\\s+${name}\\s*=\\s*useSharedValue\\(`).test(today);
  if (!derived && !shared) {
    problems.push(`${TODAY}: hold truyền cho <Mascot> (\`${name}\`) không phải useSharedValue/useDerivedValue — đọc trên luồng UI là cả điểm của cơ chế này`);
  }
  if (!derived && !new RegExp(`${name}\\.value\\s*=`).test(today)) {
    problems.push(`${TODAY}: \`${name}\` không bao giờ được GHI — một cờ không ai bật thì không dừng gì cả`);
  }
}
if (!/hold=\{hold\}/.test(mascotSrc)) {
  problems.push(`${MASCOT}: Mascot không chuyển tiếp hold xuống MascotFigure`);
}
if (!/hold=\{hold\}/.test(figureSrc)) {
  problems.push(`${FIGURE}: MascotFigure không chuyển tiếp hold xuống KoaFigure`);
}

/* ── 2. máy trạng thái, chạy thật ───────────────────────────────────────────
   Trích đúng đối tượng đang chạy, không chép lại. */
const anchor = today.indexOf('useAnimatedScrollHandler(');
if (anchor < 0) {
  problems.push(`${TODAY}: không tìm thấy useAnimatedScrollHandler — luật này không còn chỗ bám, sửa luật chứ đừng bỏ`);
}
const argSrc = anchor < 0 ? null : balanced(today, today.indexOf('(', anchor));

/*
  Phép OR bốn lý do, trích từ chính `useDerivedValue`. Nếu nó biến mất thì bước
  này KHÔNG được xanh: cờ chung khi ấy do ai đó ghi thẳng, và mỗi người ghi phải
  nhớ OR đủ ba lý do còn lại — hình dạng mà thay đổi này sinh ra để bỏ.
*/
const orM = /const hold = useDerivedValue\(\s*\(\) =>([\s\S]*?),?\s*\);/.exec(today);
if (!orM) {
  problems.push(`${TODAY}: không tìm thấy \`const hold = useDerivedValue(...)\` — bốn lý do lại đang được ghi thẳng vào một cờ chung`);
}
const orSrc = orM ? orM[1].trim().replace(/,$/, '') : null;
if (anchor >= 0 && (!argSrc || !argSrc.includes('onBeginDrag'))) {
  problems.push(
    `${TODAY}: useAnimatedScrollHandler không còn nhận dạng ĐỐI TƯỢNG có onBeginDrag — ` +
      'dạng một-hàm chỉ nghe onScroll, nên không có chỗ nào biết cú kéo bắt đầu hay kết thúc',
  );
}

/**
 * Dựng lại bộ xử lý VÀ phép OR từ mã nguồn.
 *
 * ── vì sao phải trích cả hai ──
 *
 * Bộ xử lý cuộn không còn ghi thẳng vào cờ chung. Nó ghi vào một LÝ DO
 * (`dragging`), và kết quả là một `useDerivedValue` OR bốn lý do lại. Một tệp
 * kiểm chỉ chạy bộ xử lý sẽ không bao giờ thấy phép OR ấy — và phép OR mới là
 * chỗ dễ sót một vế nhất.
 *
 * Nên cả hai được TRÍCH ra khỏi mã thật rồi chạy. Không chép lại: một bản chép
 * ở đây xanh trong khi mã thật thiếu một vế là đúng cái bẫy repo này đã bắt sáu
 * lần.
 *
 * Mọi thứ khác nó với tới đều là hàm rỗng: tệp này kiểm một máy trạng thái, và
 * kéo `tabScrollFrame` thật vào đây sẽ biến nó thành một bài kiểm về thanh tab.
 */
function machine(src, orSrc, world = {}) {
  const { focus = 0, idle = false, offscreen = false, koaTop = 0, koaH = 100, vh = 800 } = world;

  /*
    Bốn lý do, mỗi cái một cờ — đúng hình dạng mà mã thật dùng.

    `focusSV`, `idle` và hình học của `measure` đều là CHIỀU của bảng ca, không
    phải giá trị cấp cho xong. Bài học của `pick-row.mjs` với `pillInset`: cấp 0
    cho một chiều là làm bước kiểm xanh lại và mù đúng nửa mà chiều ấy sinh ra
    để canh.
  */
  const dragging = { value: false };
  const off = { value: offscreen };
  const idleSV = { value: idle };
  const focusSV = { value: focus };
  const scrollY = { value: 0 };
  const viewportH = { value: vh };
  const maxScroll = { value: 0 };

  /*
    `measure` giả, trả về hình học ĐƯỢC ĐẶT: bước này kiểm biểu thức quyết định
    "ngoài màn hay không", nên nó phải lái được cả hai phía của biểu thức ấy.
    `null` là ca thứ ba và là ca quan trọng nhất — không đo được thì KHÔNG giữ.
  */
  const measure = () => (koaTop === null ? null : { pageY: koaTop, height: koaH });

  let woke = 0;
  const make = new Function(
    'dragging', 'offscreen', 'idle', 'focusSV', 'scrollY', 'viewportH', 'maxScroll',
    'measure', 'koaRef', 'runOnJS', 'wake', 'settleOffscreen', 'tabScrollFrame',
    'armTabBarRestore', 'Date',
    `return ${src.replace(/^\(/, '').replace(/\)$/, '')};`,
  );
  const settleOffscreen = () => {
    const m = measure();
    off.value = m === null ? false : m.pageY + m.height <= 0 || m.pageY >= viewportH.value;
  };
  const h = make(
    dragging, off, idleSV, focusSV, scrollY, viewportH, maxScroll,
    measure, {}, (f) => f, () => { woke++; }, settleOffscreen, () => false,
    () => {}, Date,
  );

  /* Phép OR, trích từ chính `useDerivedValue`. */
  const orFn = new Function(
    'dragging', 'offscreen', 'idle', 'focusSV',
    `return ${orSrc};`,
  );
  const hold = () => orFn(dragging, off, idleSV, focusSV);
  return { hold, h, woke: () => woke };
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

const EVT = { contentOffset: { y: 40 }, contentSize: { height: 2000 }, layoutMeasurement: { height: 800 } };

/** Chạy một chuỗi sự kiện trong một THẾ GIỚI và trả về trạng thái giữ. */
function run(src, orSrc, seq, world) {
  const m = machine(src, orSrc, world);
  let paused = false;
  for (const name of seq.events) {
    m.h[name]?.(EVT);
    if (m.hold()) paused = true;
  }
  return { paused, end: m.hold(), woke: m.woke() };
}

/**
 * Bốn thế giới, và kỳ vọng ở trạng thái CUỐI ngược nhau giữa chúng.
 *
 *   · thu lại, có người, đang nhìn thấy → phải THẢ. Kẹt true là nhân vật thôi
 *     thở cho tới khi đổi tab, và đó là chế độ hỏng tệ hơn chính lỗi được sửa.
 *   · chế độ tập trung → phải GIỮ: tấm nội dung, và Koa trong nó, bị hộp cắt
 *     thu về chiều cao 0.
 *   · đã cuộn khỏi tầm nhìn → phải GIỮ: lớp aura có luật này rồi, nhân vật thì
 *     chưa, và nó chạy suốt cả nửa dưới của trang.
 *   · không ai chạm đủ lâu → phải GIỮ: đây là trạng thái mặc định của một app
 *     đang mở lâu, và là toàn bộ nội dung của báo cáo "máy nóng".
 */
const WORLDS = [
  { name: 'thu lại, đang nhìn thấy', world: {}, endHeld: false },
  { name: 'chế độ tập trung', world: { focus: 1 }, endHeld: true },
  { name: 'đã cuộn khỏi tầm nhìn', world: { koaTop: -300, koaH: 100 }, endHeld: true },
  { name: 'không ai chạm đủ lâu', world: { idle: true }, endHeld: true },
  /* Không đo được thì KHÔNG giữ: đóng băng một thứ có thể đang hiện ra là lỗi
     tệ hơn hẳn cái đang được sửa. */
  { name: 'không đo được vị trí', world: { koaTop: null }, endHeld: false },
];

function audit(src, orSrc) {
  const bad = [];
  for (const seq of SEQUENCES) {
    for (const w of WORLDS) {
      let r;
      try {
        r = run(src, orSrc, seq, w.world);
      } catch (e) {
        bad.push(`không dựng lại được bộ xử lý cuộn từ ${TODAY}: ${e.message}`);
        return bad;
      }
      /* Răng: nếu chưa lần nào đông cứng thì bản sửa không tồn tại. */
      if (!r.paused) {
        bad.push(`"${seq.name}" / ${w.name}: hold KHÔNG BAO GIỜ bật — đồng hồ nhân vật chạy suốt cú cuộn`);
      }
      if (r.end !== w.endHeld) {
        bad.push(
          w.endHeld
            ? `"${seq.name}" / ${w.name}: cuộn xong hold về false — nhân vật chạy lại 36 vòng của nó ở một chỗ không ai nhìn thấy`
            : `"${seq.name}" / ${w.name}: mọi thứ đã dừng mà hold vẫn TRUE — nhân vật đứng hình cho tới khi đổi tab`,
        );
      }
    }
    /* Và cú kéo phải ĐÁNH THỨC: `onTouchStart` của lớp bọc không thấy cú kéo
       khi ScrollView đã giành quyền, nên nếu `onBeginDrag` không tự gọi `wake`
       thì cuộn suốt mười phút vẫn bị tính là "không ai chạm". */
    if (seq.events.includes('onBeginDrag')) {
      const r = run(src, orSrc, seq, { idle: true });
      if (r.woke === 0) {
        bad.push(`"${seq.name}": cú kéo KHÔNG đánh thức — cuộn mãi vẫn bị tính là không ai chạm`);
      }
    }
  }
  return bad;
}

if (argSrc && orSrc) {
  problems.push(...audit(argSrc, orSrc));
}

/* ── 3. phép tự kiểm ────────────────────────────────────────────────────────
   Hai bản hỏng dựng từ chính mã nguồn đang chạy, mỗi bản gỡ đúng một tay cầm,
   và mỗi bản phải đỏ ĐÚNG ở chỗ đã dự đoán. */
const SELF = argSrc && orSrc
  ? [
      {
        name: 'gỡ onBeginDrag',
        /* Bản đã xuất xưởng: không có chỗ nào biết cú kéo bắt đầu. */
        mutate: (h) => h.replace(/onBeginDrag:\s*\(\)\s*=>\s*\{[^}]*\},?/, ''),
        expect: /KHÔNG BAO GIỜ bật/,
      },
      {
        name: 'gỡ onEndDrag (chỉ còn nghe đà)',
        mutate: (h) => h.replace(/onEndDrag:\s*\(\)\s*=>\s*\{[^}]*\},?/, ''),
        expect: /vẫn TRUE — nhân vật đứng hình/,
      },
      {
        /* Bản đã xuất xưởng của lý do 3: không ai hỏi nhân vật còn trên màn
           không. Nó chạy suốt cả nửa dưới của trang. */
        name: 'gỡ settleOffscreen (thôi hỏi nhân vật còn trên màn không)',
        mutate: (h) => h.replace(/\n\s*settleOffscreen\(\);/g, ''),
        expect: /đã cuộn khỏi tầm nhìn/,
      },
      {
        /* Và cú kéo thôi đánh thức: cuộn mãi vẫn bị tính là không ai chạm. */
        name: 'gỡ runOnJS(wake) khỏi onBeginDrag',
        mutate: (h) => h.replace(/\n\s*runOnJS\(wake\)\(\);/, ''),
        expect: /KHÔNG đánh thức/,
      },
      {
        /* Sót một vế của phép OR — chỗ dễ sót nhất, và chỗ mà một tệp kiểm chỉ
           chạy bộ xử lý sẽ không bao giờ nhìn thấy. */
        name: 'sót vế `offscreen` trong phép OR',
        or: (o) => o.replace(/offscreen\.value \|\| /, ''),
        expect: /đã cuộn khỏi tầm nhìn/,
      },
      {
        name: 'sót vế `idle` trong phép OR',
        or: (o) => o.replace(/idle\.value \|\| /, ''),
        expect: /không ai chạm đủ lâu/,
      },
    ]
  : [];

/*
  Phép tự kiểm GỌI `audit`, không chép lại nó.

  Một phép tự kiểm chép lại luật nó canh thì xoá luật đi vẫn xanh — dạng lỗi mà
  repo này đã bắt sáu lần.
*/
const selfFail = [];
for (const s of SELF) {
  const h = s.mutate ? s.mutate(argSrc) : argSrc;
  const o = s.or ? s.or(orSrc) : orSrc;
  if (h === argSrc && o === orSrc) {
    selfFail.push(`${s.name}: không gỡ được gì — phép thử ngược đang thử một bản y hệt bản thật`);
    continue;
  }
  const found = audit(h, o);
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
  'đồng hồ nhân vật OK — Koa trên dashboard nhận `hold`, đọc trên luồng UI (không một chuyến sang JS ' +
    'nào, không một hẹn giờ nào), và Mascot → MascotFigure → KoaFigure chuyển tiếp đủ ba chặng. ' +
    `Bộ xử lý cuộn VÀ phép OR bốn lý do đều được TRÍCH ra khỏi index.tsx rồi CHẠY, qua ${SEQUENCES.length} ` +
    'chuỗi sự kiện thật của UIScrollView (kéo chậm không sinh đà, vuốt mạnh có đà, chộp lại giữa đà, ' +
    `scrollTo không ngón tay, chạm-nhấc tại chỗ) × ${WORLDS.length} thế giới. ` +
    'Bốn lý do giữ nhân vật đứng hình, và mỗi lý do là một CHIỀU của bảng ca chứ không phải một giá ' +
    'trị cấp cho xong — bài học của `pillInset`: cấp 0 cho một chiều là làm bước kiểm xanh lại và mù ' +
    'đúng nửa mà chiều ấy sinh ra để canh. (1) đang cuộn: đông cứng trong lúc cuộn và TRỞ LẠI CHẠY khi ' +
    'dừng — vế sau là chế độ hỏng tệ hơn chính lỗi được sửa, vì một cờ kẹt true không làm chậm gì cả, ' +
    'nó làm nhân vật thôi thở. (2) chế độ tập trung: tấm nội dung, và Koa trong nó, bị hộp cắt thu về ' +
    'chiều cao 0. (3) đã cuộn khỏi tầm nhìn: lớp aura có luật này từ lâu và nhân vật thì chưa, nên nó ' +
    'chạy ở nhịp màn hình suốt cả nửa dưới của trang. (4) không ai chạm đủ lâu: đây là trạng thái MẶC ' +
    'ĐỊNH của một app đang mở lâu, và là toàn bộ nội dung của báo cáo "máy nóng". Không đo được vị trí ' +
    'thì KHÔNG giữ — đóng băng một thứ có thể đang hiện ra là lỗi tệ hơn hẳn cái đang được sửa. Và cú ' +
    'kéo phải ĐÁNH THỨC, vì `onTouchStart` của lớp bọc không thấy cú kéo khi ScrollView đã giành quyền. ' +
    `${SELF.length} phép thử ngược đều đỏ đúng ô đã dự đoán — kể cả hai bản SÓT MỘT VẾ của phép OR, ` +
    'thứ mà một tệp kiểm chỉ chạy bộ xử lý sẽ không bao giờ nhìn thấy — và phép tự kiểm GỌI `audit` ' +
    'chứ không chép lại nó',
);

