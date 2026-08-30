/**
 * Đang tải KHÁC với không có gì. Một màn hình không được lẫn hai thứ ấy.
 *
 * ── lỗi đã sửa ──
 *
 * Ba tab dựng trạng thái rỗng của chúng từ dữ liệu chưa về, nên trong suốt lúc
 * tải chúng nói sai về dữ liệu của người dùng:
 *
 *   · `progress.tsx`  — `photos && photos.length > 0 ? … : "Chưa có ảnh"`.
 *     `photos` là `undefined` khi đang tải, nên nhánh "chưa có" chạy. Khối số
 *     đo còn tệ hơn: nó hiện `EmptyState` "Chưa có số đo" KÈM nút "Thêm số đo"
 *     — mời người ta nhập lại thứ họ đã nhập rồi, đang trên đường về.
 *   · `nutrition.tsx` — vòng calo vẽ từ `Number(dailyLog?.kcal) || 0`, ra 0, và
 *     thẻ lớn nhất màn hình hiện "0 / 2.200" y như một ngày chưa ăn gì.
 *   · `workouts/index.tsx` — `templates` chưa về → `EmptyState` "chưa có mẫu
 *     tập nào".
 *
 * Cả ba đều ĐÃ CÓ cổng `isError`, và không cái nào có cổng `isPending`. Tức là
 * người viết đã nghĩ tới chuyện "đọc hỏng thì đừng bịa", rồi bỏ sót đúng nhánh
 * chạy ở MỌI lần mở app nguội chứ không phải chỉ khi có sự cố.
 *
 * ── vì sao không có gì HỎNG, và vì sao đó là vấn đề ──
 *
 * Không có lỗi runtime, không có màn trắng, không cảnh báo nào. Trang dựng đẹp,
 * chỉ là nó nói sai, rồi vài trăm mili giây sau nó tự sửa. Trên máy tốt với
 * mạng tốt thì không ai kịp thấy. Trên mạng yếu, hoặc đúng cái lúc mất mạng cần
 * kết nối lại, nó nằm đó đủ lâu để đọc — và thứ đọc được là "dữ liệu của bạn
 * không còn".
 *
 * ── luật ──
 *
 * Một truy vấn có trạng thái rỗng thì phải có đủ BA nhánh: đang tải → bóng;
 * lỗi → báo lỗi; đã xong và rỗng → trạng thái rỗng. Thiếu nhánh đầu thì nhánh
 * cuối nói thay nó, và nó nói sai.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const problems = [];

/*
  Bốn tab, và cái mỗi tab phải chứng minh.

  `pending` là tên biến `isPending` được đặt lại trong tệp ấy; `shows` là thứ nó
  phải dựng khi biến đó đúng. Cả hai đều được tìm trong nguồn đã BÓC CHÚ THÍCH —
  tệp này giải thích chính những đoạn mã ấy, và một luật đọc trúng lời giải
  thích của chính nó là một luật tự khen mình.
*/
const TABS = [
  {
    file: 'src/app/(tabs)/index.tsx',
    label: 'Hôm nay',
    pending: 'dayPending',
    shows: 'TodaySkeleton',
  },
  {
    file: 'src/app/(tabs)/nutrition.tsx',
    label: 'Dinh dưỡng',
    pending: 'dayPending',
    shows: 'NutritionSkeleton',
  },
  {
    file: 'src/app/(tabs)/workouts/index.tsx',
    label: 'Tập luyện',
    pending: 'templatesPending',
    shows: 'WorkoutsSkeleton',
  },
  {
    file: 'src/app/(tabs)/progress.tsx',
    label: 'Tiến trình',
    pending: 'measurementsPending',
    shows: 'ProgressSkeleton',
  },
  {
    file: 'src/app/(tabs)/progress.tsx',
    label: 'Tiến trình (ảnh)',
    pending: 'photosPending',
    shows: 'ProgressSkeleton',
  },
  {
    file: 'src/app/(tabs)/progress.tsx',
    label: 'Tiến trình (cân nặng)',
    pending: 'weightPending',
    shows: 'ProgressSkeleton',
    /* Tab này gác bằng `&&` chứ không phải `?:` — nó là một khối riêng cạnh
       khối `!weightPending`, không phải hai nhánh của một ternary. Luật 1 phải
       chấp nhận cả hai hình dạng, vì cả hai đều dựng đúng thứ cần dựng. */
    gate: '&&',
  },
];

/*
  Thân mọi luật là MỘT hàm, và phần tự kiểm ở cuối tệp gọi lại đúng hàm này trên
  một thế giới hỏng. Phần tự kiểm chép tay lại biểu thức của luật thì nó chỉ
  chứng minh một tính chất của chuỗi nó tự dựng, không phải rằng luật còn ở đây —
  đo được: cả năm luật trong tệp này từng xoá được mà vẫn báo OK.

  `W.src(file)` trả về nguồn đã bóc chú thích của một tệp; `W.all` là toàn bộ
  src gộp lại. Thế giới hỏng chỉ cần chồng lên một trong hai.
*/
function audit(W) {
  const out = [];

  // ── 1. mỗi tab lấy được `isPending` và DÙNG nó để dựng bóng ──
  for (const t of TABS) {
    const src = W.src(t.file);
    if (!new RegExp(`isPending:\\s*${t.pending}\\b`).test(src)) {
      out.push(
        `${t.label}: không còn lấy \`isPending: ${t.pending}\` — thiếu nó thì "đang tải" và ` +
          '"đã tải xong, không có gì" là cùng một nhánh, và nhánh ấy nói sai về dữ liệu người dùng',
      );
      continue;
    }
    /* Lấy ra mà không dùng thì y như không lấy. */
    const gate = t.gate === '&&' ? '&&' : '\\?';
    if (!new RegExp(`${t.pending}\\s*${gate}[\\s\\S]{0,200}?<${t.shows}`).test(src)) {
      out.push(
        `${t.label}: \`${t.pending}\` có được lấy nhưng không dẫn tới <${t.shows}> — ` +
          'một biến đọc ra rồi bỏ đó không dựng được gì lên màn hình',
      );
    }
    /* ── 4. bóng KHÔNG được che dữ liệu thật ──
       Quyết định của người dùng, ghi ở đây vì nó dễ bị lật ngược bởi một người
       nghĩ "hiện bóng lúc tải lại" là tử tế hơn: app persist cache lên đĩa đúng
       để có cái hiện ngay khi mở và khi mất mạng. Gác bằng `isFetching` sẽ che
       dữ liệu ĐANG ĐÚNG bằng ô xám ở mỗi lần refetch nền, kể cả lúc mạng tốt. */
    if (new RegExp(`isFetching[\\s\\S]{0,120}?<${t.shows}`).test(src)) {
      out.push(
        `${t.label}: <${t.shows}> bị gác bằng \`isFetching\` — nó sẽ che dữ liệu cache đang đúng ` +
          'bằng ô xám ở mỗi lần tải nền. Cổng phải là `isPending`',
      );
    }
  }

  // ── 2. nhánh "đang tải" phải đứng TRƯỚC nhánh rỗng ──
  //    Lỗi về THỨ TỰ, không phải về sự tồn tại: ternary lấy nhánh khớp đầu tiên,
  //    nên một `isPending` đặt sau nhánh rỗng không cứu được gì.
  {
    const src = W.src('src/app/(tabs)/progress.tsx');
    for (const c of ORDER) {
      const iPending = src.indexOf(c.pending.endsWith('&&') ? c.pending : `${c.pending} ?`);
      const iEmpty = src.indexOf(`i18n.${c.empty}`);
      if (iPending === -1 || iEmpty === -1) {
        out.push(`Tiến trình (${c.name}): không tìm thấy cả hai nhánh để so thứ tự`);
      } else if (iPending > iEmpty) {
        out.push(
          `Tiến trình (${c.name}): nhánh "đang tải" nằm SAU nhánh "chưa có" — ternary lấy nhánh ` +
            'khớp đầu tiên, nên trạng thái rỗng vẫn chạy trước và vẫn nói sai',
        );
      }
    }
  }

  // ── 3. bóng vẽ đúng cỡ: mỗi khoá được ĐO ở đâu đó ──
  //    `heightFor` trả về `FALLBACK_HEIGHT` cho khoá chưa ai đo. Bóng vẫn vẽ,
  //    không có gì đỏ — nó chỉ vẽ SAI CỠ, và trang giật khi dữ liệu về. Đó đúng
  //    là thứ `widget-heights.ts` tồn tại để chặn.
  {
    const keys = [...W.skeleton.matchAll(/^\s{2}(\w+): '([^']+)',$/gm)]
      .filter(([, , v]) => v.includes(':'))
      .map(([, name, value]) => ({ name, value }));
    if (keys.length === 0) {
      out.push('skeleton.tsx: không đọc được khoá nào trong `SK` — luật này không kiểm được gì');
    }
    for (const k of keys) {
      if (!new RegExp(`<Measured id=\\{SK\\.${k.name}\\}`).test(W.all)) {
        out.push(
          `SK.${k.name} ('${k.value}') được vẽ bóng nhưng không khối thật nào bọc ` +
            `\`<Measured id={SK.${k.name}}>\` — không ai đo thì \`heightFor\` trả về chiều cao dự ` +
            'phòng, bóng sai cỡ, và trang nhảy khi dữ liệu về',
        );
      }
    }
  }

  return out;
}

const ORDER = [
  { name: 'số đo', pending: 'measurementsPending', empty: 'progressNoMeasurements' },
  { name: 'ảnh', pending: 'photosPending', empty: 'progressNoPhotos' },
  { name: 'cân nặng', pending: 'weightPending &&', empty: 'nNotEnoughData' },
];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const SOURCES = new Map();
const WORLD = {
  src: (f) => {
    if (!SOURCES.has(f)) SOURCES.set(f, strip(read(f)));
    return SOURCES.get(f);
  },
  skeleton: read('src/components/ascnd/skeleton.tsx'),
  all: walk(path.join(NATIVE, 'src'))
    .map((p) => strip(readFileSync(p, 'utf8')))
    .join('\n'),
};
problems.push(...audit(WORLD));

/* ── tự kiểm ─────────────────────────────────────────────────────────────────
   Mỗi luật một thế giới hỏng, dựng bằng cách sửa NGUỒN THẬT đúng một chỗ, và
   phần này gọi lại đúng `audit` đang chạy ở trên — nên xoá luật nào cũng thành
   đỏ. Thế giới hỏng của luật 2 là chính bản ĐÃ SHIP: không có nhánh đang tải
   nào cả, nên nhánh rỗng chạy trước. */
{
  const fail = (name) => {
    console.error(`phép tự kiểm hỏng — thế giới "${name}" đáng lẽ phải bị bắt, đừng tin kết quả`);
    process.exit(1);
  };
  /** Sửa một tệp đúng một chỗ, giữ mọi tệp khác nguyên bản thật. */
  const broken = (name, file, before, after, want) => {
    const orig = WORLD.src(file);
    if (!orig.includes(before)) {
      console.error(`phép tự kiểm hỏng — không tìm thấy \`${before}\` để dựng "${name}"`);
      process.exit(1);
    }
    const patched = orig.replace(before, after);
    const W = {
      ...WORLD,
      src: (f) => (f === file ? patched : WORLD.src(f)),
      all: WORLD.all.replace(before, after),
    };
    if (!audit(W).some((p) => want.test(p))) fail(name);
  };

  const WK = 'src/app/(tabs)/workouts/index.tsx';
  const PG = 'src/app/(tabs)/progress.tsx';

  broken('cổng isPending bị gỡ', WK, 'isPending: templatesPending', 'isStale: templatesStale', /không còn lấy/);
  broken('bóng bị thay bằng khối rỗng', WK, '<WorkoutsSkeleton />', '<View />', /không dẫn tới/);
  broken('cổng đổi sang isFetching', WK, 'templatesPending ?', 'isFetching ?', /gác bằng `isFetching`/);
  /*
    Hai thế giới hỏng khác nhau, vì luật 2 có hai nhánh và một ca chỉ chạm được
    một. Bỏ hẳn nhánh đang tải → "không tìm thấy". ĐỔI CHỖ nó xuống sau nhánh
    rỗng → "nằm SAU", và đó mới là bản đã ship: ternary lấy nhánh khớp đầu
    tiên, nên một `isPending` đặt muộn thì không cứu được gì.
  */
  broken('nhánh đang tải bị bỏ hẳn', PG, ') : photosPending ? (', ') : false ? (', /không tìm thấy cả hai nhánh/);
  {
    const orig = WORLD.src(PG);
    const moved = orig.replace(') : photosPending ? (', ') : false ? (') + '\nphotosPending ? null : null;\n';
    const W = { ...WORLD, src: (f) => (f === PG ? moved : WORLD.src(f)) };
    if (!audit(W).some((p) => /nằm SAU/.test(p))) {
      console.error('phép tự kiểm hỏng — thế giới "nhánh đang tải nằm sau nhánh rỗng" đáng lẽ phải bị bắt');
      process.exit(1);
    }
  }
  broken('khoá được vẽ bóng mà không ai đo', PG, '<Measured id={SK.progressPhotos}>', '<View>', /không khối thật nào bọc/);

  /* Và luật 3 nhìn từ phía `SK`: thêm một khoá chưa ai đo phải đỏ ngay. */
  {
    const W = { ...WORLD, skeleton: WORLD.skeleton.replace("  nutritionRing: 'nutrition:ring',", "  nutritionRing: 'nutrition:ring',\n  ghostKey: 'ghost:none',") };
    if (!audit(W).some((p) => /SK\.ghostKey/.test(p))) fail('khoá mới thêm mà không ai đo');
  }
}

if (problems.length) {
  console.error('bóng khi tải CÓ LỖI:\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}

console.log(
  `bóng khi tải OK — ${TABS.length} cổng trên 4 tab: đang tải dựng BÓNG chứ không dựng trạng thái ` +
    'rỗng. Bản đã ship nói sai về dữ liệu người dùng ở mọi lần mở app nguội — "Chưa có số đo" kèm ' +
    'nút mời nhập lại, "Chưa có ảnh", "chưa có mẫu tập nào", và một vòng calo "0 / 2.200" y như một ' +
    'ngày chưa ăn gì — vì cả ba tab đều có cổng isError mà không có cổng isPending. Thứ tự nhánh ' +
    'được kiểm chứ không chỉ sự tồn tại: một `isPending` đặt sau nhánh rỗng thì không cứu được gì. ' +
    'Mọi khoá được vẽ bóng đều có một khối thật ĐO nó, nên bóng đúng cỡ và trang không nhảy. Và bóng ' +
    'gác bằng `isPending` chứ không phải `isFetching`, nên nó không bao giờ che dữ liệu cache đang ' +
    'đúng — đó là lý do app lưu cache lên đĩa',
);
