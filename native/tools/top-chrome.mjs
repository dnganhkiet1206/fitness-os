/**
 * Hàng nút góc trên chỉ có MỘT đường về: đỉnh trang.
 *
 * ── ba bản, và hai bản đầu đều do người dùng bác ──
 *
 *   1. Buộc vào VỊ TRÍ cuộn (mờ dần theo 96 điểm đầu). Cuộn lên phải về tận
 *      đỉnh mới lấy lại được — nhưng nó cũng không đi ngay khi bắt đầu cuộn, và
 *      người dùng báo "không có gì thay đổi".
 *   2. Dùng chung tín hiệu với thanh tab. Đi theo hướng, nhưng thừa hưởng hẹn
 *      giờ nghỉ 800ms: dừng lại đọc một tấm thẻ giữa trang thì ba cái nút tự bò
 *      vào góc, đè lên nội dung, không ai gọi chúng.
 *   3. Bản này: đi khi trang trôi xuống, về khi trang chạm đỉnh. Không vế thứ
 *      ba, không hẹn giờ nào chạm vào nó.
 *
 * ── vì sao LÁI THẬT chứ không dò chữ ──
 *
 * Cả ba bản đều "trông đúng" khi đọc mã. Chúng khác nhau ở HÀNH TRÌNH — thứ chỉ
 * hiện ra khi cho một chuỗi khung hình chạy qua và xem trạng thái ở từng chặng.
 * Một regex ghim `y <= TOP_AT` sẽ xanh với cả bản có thêm nhánh cuộn-lên, và
 * xanh với cả bản mà hẹn giờ nghỉ vẫn kéo hàng nút về.
 *
 * Nên tệp này dịch `tab-bar-visibility.ts`, thay Reanimated bằng vỏ ghi lại,
 * rồi bơm một hành trình cuộn thật vào `tabScrollFrame`.
 *
 * ── và luật canh HAI tầng ──
 *
 * Thanh tab PHẢI giữ nguyên hành vi cũ: nó là điều hướng, nó quay lại khi cuộn
 * lên và khi ngừng cuộn. Một luật chỉ canh hàng nút trên sẽ xanh với bản mà ai
 * đó "dọn cho gọn" bằng cách áp luật mới cho cả hai — và lúc ấy thanh tab biến
 * mất giữa trang cho tới khi người dùng cuộn hết về đầu.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = 'src/lib/tab-bar-visibility.ts';
const CACHE = path.join(NATIVE, 'node_modules', '.cache', 'top-chrome');

/* Hẹn giờ nghỉ thật là 800ms; chờ ngần ấy trong một bước kiểm là chấp nhận
   được, và nó kiểm ĐÚNG cái hẹn giờ đang chạy thay vì một bản giả. */
const IDLE_WAIT = 900;

const SHIM = `
  /* \`withSpring\`/\`withTiming\` nhảy thẳng tới đích: tệp này canh ĐÍCH nào được
     chọn, không canh đường đi tới đó. */
  module.exports = {
    makeMutable: (v) => ({ value: v }),
    withSpring: (to) => to,
    withTiming: (to) => to,
    Easing: { cubic: (t) => t, out: () => (t) => t },
  };`;

function build(dir, mutate) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  try {
    execFileSync(
      'npx',
      ['tsc', SRC, '--ignoreConfig', '--outDir', dir, '--rootDir', 'src', '--module', 'commonjs',
        '--target', 'es2020', '--skipLibCheck', '--lib', 'es2020'],
      { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch {
    /* import không phân giải được ngoài bundler; bản emit vẫn được ghi ra. */
  }
  const js = path.join(dir, 'lib/tab-bar-visibility.js');
  let code = readFileSync(js, 'utf8');
  if (mutate) code = mutate(code);
  /*
    Hai thứ được thay bằng vỏ, và cái thứ hai là mới.

    `tab-bar-visibility.ts` nay gọi `resetKoaBand()` khi đổi tab — dải mà Koa
    đứng phải được đặt lại cùng lúc với thanh tab, nếu không một màn ngắn không
    bắn `onScroll` sẽ thừa hưởng câu trả lời của màn trước. Tệp này dịch MỘT
    module một mình nên `@/lib/koa-band` không phân giải được, và bước kiểm đổ
    với `Cannot find module` — một lỗi trông như app hỏng và không phải.

    Vỏ chứ không phải bỏ lời gọi: thứ tệp này đo là hành vi của thanh tab, và
    `koa-band` là một shared value không liên quan. Việc "đổi tab thì đặt lại
    dải" được canh ở `tools/koa-boundary.mjs`, đúng chỗ của nó.
  */
  writeFileSync(
    js,
    code
      .replace(/require\("react-native-reanimated"\)/g, `require("../rea.cjs")`)
      .replace(/require\("@\/lib\/koa-band"\)/g, `require("../koa-band.cjs")`),
  );
  writeFileSync(path.join(dir, 'rea.cjs'), SHIM);
  writeFileSync(path.join(dir, 'koa-band.cjs'), 'exports.resetKoaBand = () => {};\n');
  return js;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Lái một hành trình cuộn thật và đọc trạng thái ở từng chặng.
 *
 * Trả về danh sách sai lệch.
 */
async function journey(js) {
  const m = await import(`file://${js}?v=${Math.random()}`);
  const bad = [];
  const top = () => m.topChromeVisible.value;
  const tab = () => m.tabBarVisible.value;

  /*
    Mỗi "cú vuốt" là nhiều khung hình, đúng như UIScrollView bắn ra.

    `now` là thời gian THẬT, không phải một đồng hồ giả chạy trước. Bản nháp đầu
    bơm `Date.now() + t` với `t` cộng 16ms mỗi khung — sau bốn chục khung thì
    `lastScrollAt` nằm ~600ms trong tương lai, nên hẹn giờ nghỉ 800ms không bắn
    trong lúc `sleep(900)` và cả hai vế của bước 3 đọc ra sai. Hẹn giờ ấy là
    thứ đang được kiểm, nên nó phải chạy trên đồng hồ nó thật sự dùng.
  */
  let last = NaN;
  const frames = (from, to, step) => {
    let y = from;
    for (; step > 0 ? y <= to : y >= to; y += step) {
      if (m.tabScrollFrame(y, Date.now())) m.armTabBarRestore();
      last = y;
    }
    /*
      Và luôn bắn ĐÚNG khung hình cuối ở `to`.

      Bản nháp đầu để vòng lặp tự dừng, nên `frames(380, 0, -40)` kết thúc ở
      y=20 — chưa bao giờ chạm đỉnh, và phép kiểm "về đỉnh thì hàng nút quay
      lại" đỏ trên mã hoàn toàn đúng. UIScrollView thì luôn bắn một khung hình ở
      vị trí nghỉ cuối cùng, nên bỏ nó đi là mô phỏng sai chính cái khoảnh khắc
      đang được kiểm.
    */
    if (last !== to) {
      if (m.tabScrollFrame(to, Date.now())) m.armTabBarRestore();
      last = to;
    }
  };

  m.resetTabBar();
  if (top() !== 1) bad.push('mở màn ở đỉnh mà hàng nút đã ẩn');

  /* 1. rời đỉnh — hàng nút phải đi NGAY, trong quãng ngắn hơn thanh tab cần */
  frames(0, 40, 10);
  if (top() !== 0) bad.push('cuộn 40 điểm mà hàng nút chưa ẩn — nó phải đi ngay khi trang bắt đầu trôi');
  if (tab() !== 1) {
    bad.push(
      'thanh tab cũng ẩn ở 40 điểm — ngưỡng của nó (y > 80) là CÓ CHỦ ĐÍCH, vì nó là điều hướng và không ' +
        'nên biến mất vì một cú chạm hụt',
    );
  }

  /* 2. cuộn tiếp cho thanh tab cũng ẩn, rồi CUỘN LÊN giữa trang */
  frames(60, 400, 20);
  if (tab() !== 0) bad.push('cuộn sâu mà thanh tab chưa ẩn');
  frames(380, 260, -20);
  if (top() !== 0) {
    bad.push(
      'cuộn LÊN giữa trang mà hàng nút hiện lại — tiêu đề lớn của iOS chỉ nở lại khi về tới đỉnh, chứ không ' +
        'nở ra mỗi lần người ta nhích ngược vài dòng để đọc lại một câu',
    );
  }
  if (tab() !== 1) bad.push('cuộn lên mà thanh tab KHÔNG hiện lại — nó là điều hướng, luật của nó không đổi');

  /* 3. ngừng cuộn hẳn — hẹn giờ nghỉ chỉ được chạm vào thanh tab */
  frames(260, 400, 20);
  if (tab() !== 0) bad.push('cuộn xuống lại mà thanh tab chưa ẩn');
  await sleep(IDLE_WAIT);
  if (top() !== 0) {
    bad.push(
      'ngừng cuộn thì hàng nút tự hiện lại — dừng lại đọc một tấm thẻ giữa trang mà ba cái nút bò vào góc đè ' +
        'lên nội dung là thứ người dùng đã bác',
    );
  }
  if (tab() !== 1) {
    bad.push(
      'ngừng cuộn mà thanh tab KHÔNG quay lại — hẹn giờ nghỉ là của nó, và bỏ nó đi là để điều hướng ngoài ' +
        'tầm với giữa trang',
    );
  }

  /* 4. về đỉnh — đường về DUY NHẤT */
  frames(380, 0, -40);
  if (top() !== 1) bad.push('về tới đỉnh trang mà hàng nút không quay lại — đó là đường về duy nhất của nó');

  /*
    5. ĐỔI TAB giữa trang — hàng nút phải ở nguyên nơi vị trí cuộn để nó lại.

    Đây là chặng mà bản trước KHÔNG có, và vì thế bước kiểm này xanh suốt trong
    khi lỗi vẫn ở đó: `resetTabBar` ép `topChromeVisible` về 1 mỗi lần đổi tab.
    Người dùng bấm sang tab khác rồi quay lại một Today còn cuộn dở, và ba cái
    nút nở ra đè lên nội dung.

    Diễn đàn nhà phát triển của Apple mô tả đúng triệu chứng ấy ở tiêu đề lớn
    của `UINavigationBar` trong tab, và gọi nó là glitch — trạng thái nở/thu là
    một hàm của vị trí cuộn, còn vị trí cuộn thì được giữ nguyên khi đổi tab.
  */
  frames(0, 400, 20);
  if (top() !== 0) bad.push('cuộn sâu mà hàng nút chưa ẩn (chặng 5 chưa vào được đúng trạng thái)');
  m.resetTabBar();
  if (top() !== 0) {
    bad.push(
      'đổi tab thì hàng nút TỰ HIỆN LẠI dù trang vẫn đang ở giữa — quay lại Today là ba cái nút nở ra đè ' +
        'lên nội dung, đúng thứ Apple gọi là glitch ở tiêu đề lớn trong tab',
    );
  }
  if (tab() !== 1) {
    bad.push(
      'đổi tab mà thanh tab KHÔNG hiện lại — nó là điều hướng, và một tab vừa mở ra với thanh điều hướng ' +
        'đang ẩn là một màn hình không có lối ra',
    );
  }

  /*
    6. MÀN KHÁC cuộn — không được chạm vào hàng nút của Today.

    `handleTabScroll` là đường cuộn của `screen.tsx`, tức của mọi màn KHÁC;
    Today đi qua `tabScrollFrame`. Bản trước cho nó gọi `applyTop` với lý do
    "màn nào cũng phải nuôi cả hai tầng chrome" — nên cuộn Dinh dưỡng về đầu
    trang sẽ bật hàng nút của Today lên, và quay lại Today vẫn ở giữa trang.
  */
  m.handleTabScroll(0);
  if (top() !== 0) {
    bad.push(
      'một màn KHÁC cuộn về đầu trang của nó mà hàng nút của Today hiện lên — hàng nút chỉ tồn tại trên ' +
        'Today, nên chỉ cú cuộn của Today mới được quyết định trạng thái của nó',
    );
  }

  /*
    7. Đường về CÓ CHỦ Ý — chạm lại đúng tab đang mở.

    Đây là chỗ duy nhất còn được phép gọi hàng nút về mà không qua vị trí cuộn,
    vì nó đi kèm một cú `scrollActiveToTop()` thật. Bước này canh hàm ấy còn
    sống: nếu ai đó xoá `showTopChrome` cho gọn thì hàng nút chỉ về được ở khung
    hình cuối của chuyển động cuộn, chậm hơn cú chạm khoảng ba phần mười giây.
  */
  if (typeof m.showTopChrome !== 'function') {
    bad.push('không còn `showTopChrome` — chạm lại tab đang mở sẽ không gọi được hàng nút về');
  } else {
    m.showTopChrome();
    if (top() !== 1) bad.push('gọi showTopChrome mà hàng nút không hiện lại');
  }

  return bad;
}

const problems = await journey(build(path.join(CACHE, 'real')));

/* ── phép tự kiểm ─────────────────────────────────────────────────────────── */
const SELF = [
  {
    name: 'trả nhánh cuộn-lên cho hàng nút (bản bị bác lần hai)',
    mutate: (s) => s.replace('if (y <= TOP_AT)', 'if (delta < -8 || y <= TOP_AT)'),
    expect: /cuộn LÊN giữa trang mà hàng nút hiện lại/,
  },
  {
    name: 'trả hẹn giờ nghỉ cho hàng nút (bản bị bác lần một)',
    /* Bám vào bản EMIT (`exports.tabBarVisible`), không bám vào mã nguồn: bản
       nháp đầu thay một chuỗi chỉ tồn tại trước khi tsc chạy, nên nó "không đổi
       được gì" — và phép tự kiểm nói ra điều đó thay vì lặng lẽ cho qua. */
    mutate: (s) => s.replace(
      'idleTimer = undefined;\n        target.value = 1;',
      'idleTimer = undefined;\n        target.value = 1;\n        topTarget.value = 1;\n        exports.topChromeVisible.value = 1;',
    ),
    expect: /ngừng cuộn thì hàng nút tự hiện lại/,
  },
  {
    name: 'áp luật của hàng nút cho CẢ thanh tab',
    mutate: (s) => s.replace(
      'if (delta < -THRESHOLD || y < 30)',
      'if (y < 30)',
    ),
    expect: /cuộn lên mà thanh tab KHÔNG hiện lại/,
  },
  {
    name: 'ép hàng nút hiện lại khi đổi tab (lỗi người dùng báo)',
    /*
      Neo vào ĐẦU thân hàm, không vào cuối.

      Bản đầu thay chuỗi kết thúc `…withSpring(1, SPRING);\n}`, tức nó chỉ khớp
      khi `resetTabBar` kết thúc đúng ở dòng ấy. Tôi thử làm hỏng mã THẬT theo
      đúng cách người dùng đã báo — thêm lại hai dòng ép hàng nút về 1 — và bước
      kiểm ra `exit 2 · không dựng được bản hỏng` thay vì nói ra điều nó vừa
      thấy. Đúng là khác không, nên `check.mjs` vẫn đỏ; nhưng một guard chỉ hữu
      ích khi nó gọi tên được thứ nó bắt.

      `lastYUI.value = 0;` chỉ xuất hiện trong `resetTabBar` (chỗ khác là
      `lastYUI.value = y;`), nên nó là cái neo ổn định bất kể thân hàm kết thúc
      thế nào.
    */
    mutate: (s) => s.replace(
      'lastYUI.value = 0;',
      'lastYUI.value = 0;\n    topTarget.value = 1;\n    exports.topChromeVisible.value = 1;',
    ),
    expect: /đổi tab thì hàng nút TỰ HIỆN LẠI/,
  },
  {
    name: 'để màn khác lái hàng nút của Today',
    mutate: (s) => s.replace(
      'lastScrollAt.value = Date.now();',
      'lastScrollAt.value = Date.now();\n    applyTop(decideTop(y, delta));',
    ),
    expect: /một màn KHÁC cuộn về đầu trang/,
  },
  {
    name: 'bỏ đường về của hàng nút',
    mutate: (s) => s.replace('if (y <= TOP_AT)\n        return 1;', 'if (false)\n        return 1;'),
    expect: /về tới đỉnh trang mà hàng nút không quay lại/,
  },
];

const selfFail = [];
for (const [i, s] of SELF.entries()) {
  const dir = path.join(CACHE, `break-${i}`);
  let js;
  try {
    js = build(dir, (code) => {
      const out = s.mutate(code);
      if (out === code) throw new Error('không đổi được gì');
      return out;
    });
  } catch (e) {
    selfFail.push(`${s.name}: không dựng được bản hỏng (${e.message})`);
    continue;
  }
  const found = await journey(js);
  if (found.length === 0) selfFail.push(`${s.name}: bản hỏng vẫn XANH — luật này không bắt được gì`);
  else if (!found.some((f) => s.expect.test(f))) {
    selfFail.push(`${s.name}: đỏ, nhưng không đúng chỗ đã dự đoán (${s.expect}); thật ra: ${found.join('; ')}`);
  }
}

rmSync(CACHE, { recursive: true, force: true });

if (selfFail.length) {
  console.error('phép tự kiểm hỏng — đừng tin kết quả:\n');
  for (const s of selfFail) console.error(`  ${s}`);
  process.exit(2);
}
if (problems.length) {
  console.log('hàng nút góc trên sai:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'hàng nút góc trên OK — LÁI THẬT một hành trình cuộn qua tabScrollFrame chứ không dò chữ, vì cả ba bản của ' +
    'hành vi này đều "trông đúng" khi đọc mã và chỉ khác nhau ở hành trình. Hàng nút đi ngay khi trang trôi ' +
    'được 40 điểm; cuộn LÊN giữa trang nó vẫn ở yên; ngừng cuộn hẳn nó cũng vẫn ở yên (hai bản trước bị ' +
    'người dùng bác đúng ở hai chỗ ấy); và nó chỉ quay lại khi trang chạm ĐỈNH — một đường về duy nhất. ' +
    'ĐỔI TAB không đưa nó về: vị trí cuộn được giữ nguyên nên trạng thái cũng phải được giữ nguyên, và hành ' +
    'vi ngược lại chính là thứ diễn đàn Apple ghi nhận như một glitch của tiêu đề lớn trong tab. Một màn ' +
    'KHÁC cuộn về đầu trang của nó cũng không chạm được vào nó — hàng nút chỉ tồn tại trên Today. Luật ' +
    'canh cả tầng dưới để không ai "dọn cho gọn" thành một luật chung: thanh tab vẫn giữ ngưỡng riêng (còn ' +
    'hiện ở 40 điểm), vẫn quay lại khi cuộn lên, và vẫn quay lại sau 800ms ngừng cuộn — hẹn giờ ấy là của ' +
    `nó, vì nó là điều hướng và phải luôn với tới được. ${SELF.length} phép thử ngược — ép hàng nút hiện ` +
    'lại khi đổi tab, để màn khác lái nó, trả lại nhánh ' +
    'cuộn-lên, trả lại hẹn giờ, áp luật hàng nút cho cả thanh tab, và bỏ hẳn đường về — đều đỏ đúng chỗ đã ' +
    'dự đoán và tất cả xanh trên bản thật',
);
