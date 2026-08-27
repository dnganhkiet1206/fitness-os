/**
 * `Expander` mở ra bằng thứ đúng với việc nó đang mở: một lớp mờ, hoặc mép cắt.
 *
 * ── lỗi có thật mà tệp này tồn tại vì nó ──
 *
 * `Expander` chạy MỘT style duy nhất cho mọi chỗ gọi:
 *
 *     useAnimatedStyle(() => ({ height: grow.value * h.value, opacity: grow.value }))
 *
 * Với hàng chấm của `card-deck.tsx` — tám cái chấm, cao 18 điểm — đó là đúng,
 * và chỗ gọi ấy nói ra vì sao: hàng chấm phải mờ đi ĐÚNG LÚC nó co lại.
 *
 * Với phần chi tiết của thẻ điểm sẵn sàng thì cùng dòng ấy là thứ khác hẳn.
 * Nhóm ở đó gồm năm ô đo, một nhận xét, nút `?` và cả khối giải thích — và
 * `opacity` đặt trên một view NHIỀU CON buộc iOS gộp cả nhóm ra một bề mặt
 * ngoài màn rồi mới pha vào, mỗi khung hình, suốt cú mở. Trên đúng màn hình mà
 * cả tuần vừa rồi là chuyện gỡ tải khỏi đường cuộn.
 *
 * Và nó không mua gì: nội dung ấy không từ đâu tới cả, nó vốn nằm sẵn sau một
 * mép đóng. Tệ hơn, độ mờ đi theo cùng đường cong dốc với chiều cao, nên quá
 * nửa thời gian thì chữ đã gần đậm hẳn trong khi mép dưới vẫn xén ngang dòng.
 *
 * ── vì sao phải CHẠY component chứ không dò chữ ──
 *
 * Một luật viết bằng regex ("`readiness-gauge.tsx` phải có `reveal=\"clip\"`")
 * ghim một CÁCH VIẾT. Nó xanh với bản đúng, và cũng xanh với một bản mà
 * `'clip'` vẫn trả về `opacity` — tức là đúng cái lỗi đang sửa, chỉ khác cái
 * tên. Nên tệp này dịch `expander.tsx` sang JS, thay Reanimated bằng những cái
 * vỏ ghi lại, gọi `Grow` với cả hai chế độ, rồi ĐỌC RA style thật sự sinh ra và
 * cấu hình thật sự đưa vào `withTiming`.
 *
 * ── và vì sao đường cong được ĐO chứ không được đọc tên ──
 *
 * Ở `'fade'`, mép cắt chỉ là một nửa của cú mở. Ở `'clip'` nó là tất cả — nên
 * nó không được phép bật ra từ vận tốc tối đa. `Easing.out(cubic)` xuất phát ở
 * gấp ~2,94 lần vận tốc trung bình; trên khối chi tiết cao khoảng 400 điểm thì
 * đó là ~5 điểm mỗi mili giây ngay ở khung hình đầu, và một mép duy nhất chạy
 * như thế đọc ra là "bung" chứ không phải "mở".
 *
 * Luật ở đây GỌI đường cong thật với đầu vào thật và đo độ dốc lúc t≈0. Đó là
 * bất biến chứ không phải chính tả: nó bắt `Easing.out(cubic)`, bắt cả
 * `Easing.out(quad)`, bắt cả một bezier gõ tay có cùng tật — những thứ mà một
 * regex tìm chữ "out" sẽ bỏ sót hoặc bắt nhầm.
 *
 * ── luật canh HAI chiều ──
 *
 * Một luật chỉ đẩy về phía `'clip'` sẽ xanh với bản đặt `'clip'` làm mặc định —
 * bản làm hàng chấm co lại mà vẫn đậm màu, đúng thứ chú thích ở `card-deck.tsx`
 * đã nói ra để tránh. Nên nhánh `'fade'` phải CÒN `opacity`, và mặc định phải
 * CÒN là `'fade'`.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(NATIVE, rel), 'utf8');

const SRC = 'src/components/ascnd/expander.tsx';
const GAUGE = 'src/components/ascnd/readiness-gauge.tsx';
const DECK = 'src/components/ascnd/card-deck.tsx';
const CACHE = path.join(NATIVE, 'node_modules', '.cache', 'reveal-clip');

/* Chiều cao dùng để chạy thử. Xấp xỉ khối chi tiết thật của thẻ sẵn sàng — nó
   là con số biến "vận tốc lúc t=0" thành điểm-trên-mili-giây thay vì một tỉ lệ
   trừu tượng. */
const BODY_H = 400;

/* ── các module giả ─────────────────────────────────────────────────────────
   Đủ để component chạy tới `return`, và không hơn. `Easing` là bản TOÁN THẬT
   chứ không phải cái nhãn, vì độ dốc mới là thứ đang được canh. */
const SHIMS = {
  '__h.cjs': `
    /* Tên \`__h\` chứ không phải \`h\`: \`Grow\` có một shared value tên \`h\`, và một
       jsxFactory tên \`h\` bị chính nó che — \`h(...)\` thành gọi một object. */
    module.exports = function __h(type, props, ...kids) {
      const flat = [];
      const push = (k) => {
        if (k === null || k === undefined || k === false) return;
        if (Array.isArray(k)) { k.forEach(push); return; }
        flat.push(k);
      };
      kids.forEach(push);
      return { type, props: props || {}, children: flat };
    };`,
  /* \`useState\` ở tệp này chỉ có MỘT chỗ dùng: \`bodyH\`. Trả về một chiều cao
     đã đo sẵn để \`Expander\` đi qua nhánh placeholder và trả ra node \`Grow\`
     thật — chính là chỗ đọc được prop mặc định. */
  'react.cjs': `
    module.exports = {
      useState: () => [${BODY_H}, () => {}],
      useEffect: (fn) => { fn(); },
    };`,
  'react-native.cjs': `
    module.exports = { View: 'View', StyleSheet: { create: (o) => o } };`,
  'reanimated.cjs': `
    /* Toán thật của Reanimated: bezier không cần, ba cái này là đủ cho những gì
       tệp thật dùng, và bất kỳ curve nào khác vẫn gọi được qua \`bezier\`. */
    const cubic = (t) => t * t * t;
    const quad = (t) => t * t;
    const out = (e) => (t) => 1 - e(1 - t);
    const inn = (e) => (t) => e(t);
    const inOut = (e) => (t) => (t < 0.5 ? e(2 * t) / 2 : 1 - e(2 - 2 * t) / 2);
    const linear = (t) => t;
    const bezier = (x1, y1, x2, y2) => ({
      factory: () => (t) => {
        /* Xấp xỉ đủ tốt để đo độ dốc: giải x(t) bằng chia đôi rồi lấy y. */
        let lo = 0, hi = 1, u = t;
        for (let i = 0; i < 32; i++) {
          u = (lo + hi) / 2;
          const x = 3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u;
          if (x < t) lo = u; else hi = u;
        }
        return 3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u;
      },
    });
    const calls = [];
    module.exports = {
      __esModule: true,
      default: { View: 'Animated.View' },
      Easing: { cubic, quad, linear, out, in: inn, inOut, bezier },
      useReducedMotion: () => false,
      useSharedValue: (v) => ({ value: v }),
      useAnimatedStyle: (fn) => fn(),
      withTiming: (to, cfg) => { calls.push(cfg); return to; },
      _calls: calls,
      _reset: () => { calls.length = 0; },
    };`,
  'motion.cjs': `module.exports = { duration: { toggle: 180, appear: 200, move: 240, swap: 320 } };`,
};

/** Dịch tệp thật (có thể đã bị làm hỏng có chủ ý) rồi nối vào các module giả. */
function build(dir, mutate) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  try {
    execFileSync(
      'npx',
      ['tsc', SRC, '--ignoreConfig', '--outDir', dir, '--rootDir', 'src', '--module', 'commonjs',
        '--target', 'es2020', '--jsx', 'react', '--jsxFactory', '__h', '--skipLibCheck', '--lib', 'es2020,dom'],
      { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch {
    /* `@/constants/motion` không phân giải được ngoài bundler nên tsc báo
       TS2307; bản emit vẫn được ghi ra, và đó là thứ cần. */
  }
  const js = path.join(dir, 'components/ascnd/expander.js');
  let code = readFileSync(js, 'utf8');
  if (mutate) code = mutate(code);
  code =
    `const __h = require('../../__h.cjs');\n` +
    code
      .replace(/require\("react"\)/g, `require("../../react.cjs")`)
      .replace(/require\("react-native"\)/g, `require("../../react-native.cjs")`)
      .replace(/require\("react-native-reanimated"\)/g, `require("../../reanimated.cjs")`)
      .replace(/require\("@\/constants\/motion"\)/g, `require("../../motion.cjs")`) +
    /* `Grow` là thứ đang được canh và nó không được export — đây là cái tay
       nắm của phép thử, không phải một thay đổi hành vi. */
    `\nmodule.exports.__Grow = Grow;\n`;
  writeFileSync(js, code);
  for (const [name, body] of Object.entries(SHIMS)) writeFileSync(path.join(dir, name), body);
  return js;
}

/**
 * Chạy một bản dựng và đọc ra HÀNH VI thật của cả hai chế độ.
 *
 * Trả về, cho mỗi chế độ: style thật sự áp lên hộp cắt khi mở, khi đóng, và
 * đường cong thật sự đưa vào `withTiming` — cùng độ dốc của nó lúc t≈0.
 */
async function probe(js) {
  const rea = await import(`file://${path.join(path.dirname(js), '../../reanimated.cjs')}`);
  const mod = await import(`file://${js}?v=${Math.random()}`);
  const R = rea.default;
  const out = {};

  for (const reveal of ['fade', 'clip']) {
    R._reset();
    const opened = mod.__Grow({ open: true, height: BODY_H, reveal, children: null });
    const openCfg = R._calls[R._calls.length - 1];
    R._reset();
    const closed = mod.__Grow({ open: false, height: BODY_H, reveal, children: null });

    const styleOf = (node) => {
      const arr = Array.isArray(node.props.style) ? node.props.style : [node.props.style];
      /* Phần tử đầu là `styles.clip` tĩnh; phần động là cái mang `height`. */
      return arr.find((s) => s && typeof s === 'object' && 'height' in s) ?? {};
    };

    /*
      Cú trượt nằm trên một view CON bên trong hộp cắt, nên phải đi xuống một
      tầng để đọc. Trả về null khi không có con nào mang `transform` — và
      "không có" chính là một câu trả lời mà luật bên dưới đọc được.
    */
    const slideOf = (node) => {
      const kid = node.children?.[0];
      if (!kid || typeof kid !== 'object' || !kid.props) return null;
      const arr = Array.isArray(kid.props.style) ? kid.props.style : [kid.props.style];
      const t = arr.find((s) => s && typeof s === 'object' && Array.isArray(s.transform));
      if (!t) return null;
      const ty = t.transform.find((x) => x && typeof x.translateY === 'number');
      return ty ? ty.translateY : null;
    };

    const ease = openCfg?.easing;
    /* Vận tốc lúc xuất phát, tính theo BỘI SỐ của vận tốc trung bình. Một
       đường cong tuyến tính cho 1; `out(cubic)` cho ~2,94. */
    const dt = 0.02;
    const fn = typeof ease === 'function' ? ease : ease?.factory?.();
    const v0 = typeof fn === 'function' ? fn(dt) / dt : null;

    out[reveal] = {
      open: styleOf(opened),
      closed: styleOf(closed),
      slideOpen: slideOf(opened),
      slideClosed: slideOf(closed),
      duration: openCfg?.duration ?? null,
      v0,
    };
  }
  return out;
}

/**
 * Hợp đồng, nói bằng hành vi.
 *
 * Trả về danh sách sai lệch cho một kết quả `probe`.
 */
function judge(p) {
  const bad = [];

  /* ── 1. `'clip'` không được để lại một khoá `opacity` nào ──────────────── */
  if ('opacity' in p.clip.open || 'opacity' in p.clip.closed) {
    bad.push(
      "chế độ 'clip' vẫn trả về `opacity` — đó chính là lượt gộp ngoài màn đang " +
        'phải gỡ: một `opacity` trên view nhiều con buộc iOS vẽ cả nhóm ra bề mặt riêng mỗi khung hình',
    );
  }

  /* ── 2. `'fade'` PHẢI còn `opacity` ────────────────────────────────────── */
  if (!('opacity' in p.fade.open)) {
    bad.push(
      "chế độ 'fade' không còn `opacity` — hàng chấm của card-deck.tsx sẽ co lại mà vẫn đậm màu, " +
        'và chú thích ở chỗ gọi ấy nói thẳng rằng chiều cao và độ mờ phải đi cùng một shared value',
    );
  }

  /* ── 3. cả hai vẫn phải THẬT SỰ chạy chiều cao ─────────────────────────── */
  for (const k of ['fade', 'clip']) {
    if (p[k].open.height !== BODY_H || p[k].closed.height !== 0) {
      bad.push(
        `chế độ '${k}': chiều cao mở/đóng là ${p[k].open.height}/${p[k].closed.height}, phải là ${BODY_H}/0 — ` +
          'chiều cao là CƠ CHẾ ở đây (nó là giá trị layout, nên thứ nằm dưới bị đẩy xuống theo, mỗi khung hình)',
      );
    }
    if (p[k].duration === null) bad.push(`chế độ '${k}': không đưa nhịp nào vào withTiming`);
  }

  /* ── 3b. `'clip'` phải TRƯỢT, và trượt đúng chiều ──────────────────────── */
  /*
    Gỡ lớp mờ ra rồi thì nếu không có gì thay chỗ nó, `'clip'` là một tấm rèm
    kéo lên: nội dung đứng im tuyệt đối, chỉ có cái lỗ lớn dần — nó nói "thứ này
    vừa hết bị che", không nói "thứ này vừa tới". Cú trượt là phần bù, nên nó
    phải có mặt và luật phải biết đỏ khi ai đó lặng lẽ bỏ nó đi.
  */
  if (p.clip.slideOpen === null || p.clip.slideClosed === null) {
    bad.push(
      "chế độ 'clip' không còn trượt — bỏ cả lớp mờ LẪN cú trượt thì cú mở thành một tấm rèm kéo lên: " +
        'nội dung đứng im tuyệt đối, chỉ cái lỗ lớn dần, và mắt đọc ra là "vừa hết bị che" chứ không phải "vừa tới"',
    );
  } else {
    if (p.clip.slideOpen !== 0) {
      bad.push(
        `chế độ 'clip': mở hết rồi mà nội dung vẫn lệch ${p.clip.slideOpen} điểm — trạng thái nghỉ phải là 0, ` +
          'nếu không thì phần chi tiết sống vĩnh viễn ở sai chỗ',
      );
    }
    if (!(p.clip.slideClosed < 0)) {
      bad.push(
        `chế độ 'clip': lúc đóng nội dung ở ${p.clip.slideClosed} — phải ÂM, tức nằm cao hơn chỗ nghỉ, để nó ` +
          'trượt XUỐNG vào chỗ. Số dương là nội dung dâng lên từ dưới, ngược chiều với một cú mở đi xuống',
      );
    }
    const span = Math.abs(p.clip.slideClosed);
    if (span > 24) {
      bad.push(
        `chế độ 'clip': quãng trượt ${span} điểm quá dài — nó phải NGẮN hơn hàng nội dung đầu tiên (hàng ô đo ` +
          'cao hơn 40 điểm), nếu không thì giữa cú mở người ta đọc phải một dòng bị cắt mất đầu',
      );
    }
  }

  /* ── 3c. `'fade'` KHÔNG được trượt ─────────────────────────────────────── */
  if (p.fade.slideClosed !== null) {
    bad.push(
      `chế độ 'fade' cũng trượt (${p.fade.slideClosed} điểm) — hàng chấm của card-deck cao 18 điểm, nên một cú ` +
        'trượt cỡ này là gần cả chiều cao của chính nó và cú mở đọc ra như một lỗi vẽ',
    );
  }

  /* ── 4. mép cắt đơn độc không được xuất phát ở vận tốc tối đa ──────────── */
  if (p.clip.v0 === null) {
    bad.push("chế độ 'clip': không đọc được đường cong");
  } else if (p.clip.v0 > 1) {
    const pps = ((p.clip.v0 * BODY_H) / (p.clip.duration ?? 240)).toFixed(1);
    bad.push(
      `chế độ 'clip': đường cong xuất phát ở ${p.clip.v0.toFixed(2)}× vận tốc trung bình (~${pps} điểm mỗi ` +
        'mili giây ở khung hình đầu). Ở đây mép cắt là TÍN HIỆU DUY NHẤT — không còn lớp mờ nào chở cú mở — ' +
        'nên nó phải xuất phát từ đứng yên, nếu không thì đọc ra là "bung" chứ không phải "mở"',
    );
  }

  return bad;
}

/* ── chạy trên bản thật ───────────────────────────────────────────────────── */
const real = await probe(build(path.join(CACHE, 'real')));
const problems = judge(real);

/* ── 5. dây nối: đúng chỗ gọi nào dùng chế độ nào ─────────────────────────── */
/*
  Bốn chỗ gọi `Expander`. Chỉ khối chi tiết của thẻ sẵn sàng đủ lớn để lượt gộp
  đáng kể, và chỉ nó có nội dung KHÔNG cần mờ (nó vốn nằm sẵn sau mép đóng).
  Hàng chấm phải giữ `'fade'`, và luật nói ra điều đó chứ không im lặng.
*/
const gauge = read(GAUGE);
if (!/<Expander open=\{detailOpen\} reveal="clip">/.test(gauge)) {
  problems.push(
    `${GAUGE}: khối chi tiết không còn mở bằng \`reveal="clip"\`. Đó là nhóm lớn nhất trong app đi qua ` +
      'Expander — năm ô đo, một nhận xét, nút `?` và cả khối giải thích — và chạy opacity lên cả nhóm ấy là ' +
      'một lượt vẽ ngoài màn mỗi khung hình, trên đúng màn hình vừa được gỡ tải khỏi đường cuộn',
  );
}
const deck = read(DECK);
if (/<Expander open=\{!locked\}[^>]*reveal=/.test(deck)) {
  problems.push(
    `${DECK}: hàng chấm bị đổi khỏi 'fade'. Chú thích ngay trên nó nói vì sao: 18 điểm co lại mà vẫn đậm màu ` +
      'là một hàng chấm mờ vẫn còn chiếm chỗ — ở kích thước ấy lượt gộp không đáng gì, còn cú co thì thấy rõ',
  );
}
/* ── 6. nhãn dưới mũi tên chồng mờ, và hộp của nó không đổi bề rộng ──────── */
/*
  Hai chỗ gợn của chính cú chạm, và một thay đổi gỡ cả hai: nhãn đổi TỨC THÌ
  cạnh một cú mở 240ms, và vì hai chuỗi dài ngắn khác nhau nên mũi tên NHẢY
  NGANG mỗi lần bấm.

  Luật này CHẠY hai biểu thức opacity chứ không đọc chữ: trích thân worklet ra
  và gọi nó với ba giá trị `spin`. Đó là bất biến — tổng phải luôn bằng 1, nên
  không có khoảnh khắc nào cả hai cùng mờ (một lỗ tối) hay cùng đậm (hai dòng
  chữ chồng lên nhau đọc thành cháo).
*/
const evalOpacity = (name) => {
  const m = new RegExp(`const ${name} = useAnimatedStyle\\(\\(\\) => \\(([\\s\\S]*?)\\)\\);`).exec(gauge);
  if (!m) return null;
  try {
    const fn = new Function('spin', `return (${m[1]});`);
    return (t) => fn({ value: t }).opacity;
  } catch {
    return null;
  }
};
const fClosed = evalOpacity('hintClosedStyle');
const fOpen = evalOpacity('hintOpenStyle');
if (!fClosed || !fOpen) {
  problems.push(
    `${GAUGE}: không còn hai biểu thức độ mờ cho nhãn dưới mũi tên — nhãn quay lại đổi TỨC THÌ cạnh một cú mở ` +
      '240ms và một mũi tên quay 180ms, tức một khung hình nhảy giữa những thứ đang trôi',
  );
} else {
  for (const [t, wantClosed] of [[0, 1], [0.5, 0.5], [1, 0]]) {
    const c = fClosed(t);
    const o = fOpen(t);
    if (Math.abs(c - wantClosed) > 1e-9 || Math.abs(o - (1 - wantClosed)) > 1e-9) {
      problems.push(
        `${GAUGE}: ở spin=${t} nhãn đóng/mở là ${c}/${o}, phải là ${wantClosed}/${1 - wantClosed} — hai bản ` +
          'phải chồng mờ theo cùng một shared value với mũi tên, nếu không chúng rời nhau khỏi cú quay',
      );
    }
    if (Math.abs(c + o - 1) > 1e-9) {
      problems.push(
        `${GAUGE}: ở spin=${t} tổng độ mờ là ${c + o} — phải luôn bằng 1, nếu không có khoảnh khắc cả hai cùng ` +
          'mờ (một lỗ tối giữa hàng) hoặc cùng đậm (hai dòng chữ chồng lên nhau)',
      );
    }
  }
}
/* Bản ghost giữ bề rộng phải chọn theo ĐỘ DÀI, không gõ cứng một chuỗi: hai
   ngôn ngữ có hai chuỗi dài khác nhau, nên chọn tay là chọn đúng một nửa số
   người dùng. */
if (!/const hintGhost = hint\w+\.length >= hint\w+\.length \? hint\w+ : hint\w+;/.test(gauge)) {
  problems.push(
    `${GAUGE}: bề rộng hộp nhãn không còn lấy theo chuỗi DÀI HƠN. Nếu nó co theo nhãn đang hiện thì mũi tên ` +
      'bên cạnh nhảy ngang mỗi lần bấm — ngay chỗ ngón tay vừa chạm xong',
  );
}
/* Và cách viết cũ — một `<Text>` đổi nội dung bằng `detailOpen ? … : …` — phải
   biến mất, nếu không thì hai cơ chế cùng chạy và cái nhảy vẫn còn. */
if (/<Text[^>]*>\s*\{detailOpen \?/.test(gauge)) {
  problems.push(`${GAUGE}: vẫn còn một <Text> đổi nội dung tức thì theo \`detailOpen\``);
}

/* Và mặc định phải còn là 'fade', nếu không thì ba chỗ gọi còn lại đổi im lặng. */
const def = (await import(`file://${path.join(CACHE, 'real', 'components/ascnd/expander.js')}?d=${Math.random()}`))
  .Expander({ open: true, children: null }).props.reveal;
if (def !== 'fade') {
  problems.push(
    `${SRC}: mặc định của \`reveal\` là ${JSON.stringify(def)}, phải là "fade" — ba chỗ gọi còn lại ` +
      '(hero-panel, activity-rings, exercise-insight) không nói gì cả, nên mặc định là thứ quyết định thay chúng',
  );
}

/* ── phép tự kiểm ─────────────────────────────────────────────────────────── */
/*
  Mỗi bản hỏng dựng ở MỘT thư mục riêng, vì require của Node có cache theo đường
  dẫn: hai bản trong cùng thư mục thì bản thứ hai trả về bản thứ nhất.
*/
const SELF = [
  {
    name: "trả `opacity` lại cho 'clip' (bản đã ship: một style cho mọi chỗ gọi)",
    mutate: (s) => s.replace(
      '({ height: grow.value * h.value })',
      '({ height: grow.value * h.value, opacity: grow.value })',
    ),
    expect: /'clip' vẫn trả về `opacity`/,
  },
  {
    name: "cho 'clip' mượn đường cong của 'fade' (mép đơn độc bật ra từ vận tốc tối đa)",
    mutate: (s) => s.replace('fade ? OPEN_EASE : CLIP_EASE', 'OPEN_EASE'),
    expect: /xuất phát ở [\d.]+× vận tốc trung bình/,
  },
  {
    name: "gỡ `opacity` khỏi 'fade' (hàng chấm co lại mà vẫn đậm màu)",
    mutate: (s) => s.replace(
      '({ height: grow.value * h.value, opacity: grow.value })',
      '({ height: grow.value * h.value })',
    ),
    expect: /'fade' không còn `opacity`/,
  },
  {
    name: 'đứng yên hẳn (chiều cao thôi chạy)',
    mutate: (s) => s.replace(/grow\.value \* h\.value/g, 'h.value'),
    expect: /chiều cao mở\/đóng là/,
  },
  {
    name: "bỏ cú trượt của 'clip' (cú mở thành một tấm rèm kéo lên)",
    mutate: (s) => s.replace('fade ? children :', 'true ? children :'),
    expect: /không còn trượt/,
  },
  {
    name: 'trượt ngược chiều (nội dung dâng lên từ dưới)',
    mutate: (s) => s.replace('(grow.value - 1) * CLIP_SLIDE', '(1 - grow.value) * CLIP_SLIDE'),
    expect: /phải ÂM/,
  },
  {
    name: 'trượt quá dài (nuốt trọn hàng ô đo đầu tiên)',
    mutate: (s) => s.replace(/CLIP_SLIDE = \d+;/, 'CLIP_SLIDE = 60;'),
    expect: /quãng trượt \d+ điểm quá dài/,
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
    selfFail.push(`${s.name}: không dựng được bản hỏng (${e.message}) — phép thử ngược đang thử một bản y hệt bản thật`);
    continue;
  }
  const found = judge(await probe(js));
  if (found.length === 0) selfFail.push(`${s.name}: bản hỏng vẫn XANH — luật này không bắt được gì`);
  else if (!found.some((f) => s.expect.test(f))) {
    selfFail.push(`${s.name}: đỏ, nhưng không đúng chỗ đã dự đoán (${s.expect}); thật ra: ${found.join('; ')}`);
  }
}
if (judge(real).length !== 0) selfFail.push(`phép kiểm đỏ ngay trên BẢN THẬT: ${judge(real).join('; ')}`);

rmSync(CACHE, { recursive: true, force: true });

if (selfFail.length) {
  console.error('phép tự kiểm hỏng — đừng tin kết quả:\n');
  for (const s of selfFail) console.error(`  ${s}`);
  process.exit(2);
}
if (problems.length) {
  console.log('cách Expander mở ra sai:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  `cách Expander mở ra OK — component được DỰNG THẬT (không dò chữ) ở cả hai chế độ và đọc ra style thật: ` +
    `'clip' chỉ trả về \`height\` (${BODY_H} khi mở, 0 khi đóng) và KHÔNG còn khoá \`opacity\` nào, nên nhóm ` +
    'nhiều con của khối chi tiết thẻ sẵn sàng — năm ô đo, một nhận xét, nút `?`, cả khối giải thích — thôi bị ' +
    "iOS gộp ra một bề mặt ngoài màn mỗi khung hình của cú mở. Luật canh cả chiều ngược lại: 'fade' VẪN còn " +
    '`opacity` và vẫn là mặc định, nên hàng chấm của card-deck vẫn mờ đi đúng lúc nó co lại (18 điểm biến mất ' +
    'mà vẫn đậm màu là thứ chú thích ở chỗ gọi ấy đã nói ra để tránh), và ba chỗ gọi không nói gì thì không đổi. ' +
    `Đường cong được ĐO chứ không đọc tên: 'fade' xuất phát ở ${real.fade.v0.toFixed(2)}× vận tốc trung bình ` +
    `(được phép — lớp mờ chở nửa cú mở), 'clip' ở ${real.clip.v0.toFixed(2)}× (phải ≤1: ở đó mép cắt là tín ` +
    `hiệu duy nhất, nên nó phải xuất phát từ đứng yên). Và vì lớp mờ đã đi, phải có thứ thay chỗ nó: nội dung ` +
    `TRƯỢT ${Math.abs(real.clip.slideClosed)} điểm xuống chỗ nghỉ (âm khi đóng, đúng 0 khi mở, ngắn hơn hàng ô ` +
    "đo đầu tiên) — 'fade' thì KHÔNG trượt, vì 14 điểm trên một hàng chấm cao 18 là gần cả chiều cao của nó. " +
    'Nhãn dưới mũi tên chồng mờ theo cùng shared value với cú quay, và hai biểu thức opacity được CHẠY ở ' +
    'spin 0/0.5/1: tổng luôn bằng 1, nên không có khung hình nào cả hai cùng mờ hay cùng đậm; hộp của nó lấy ' +
    `bề rộng theo chuỗi DÀI HƠN nên mũi tên không nhảy ngang mỗi lần bấm. ${SELF.length} phép thử ngược đều ` +
    'đỏ đúng chỗ đã dự đoán và tất cả xanh trên bản thật. CHƯA ĐO trên máy: lập luận về lượt gộp ngoài màn là ' +
    'từ cách iOS xử lý group opacity, không từ một lần đo Instruments',
);
