/**
 * Chưa đo được thì không tô màu trạng thái — nhưng cũng không để trang đen.
 *
 * ── lỗi đã sửa ──
 *
 * `readiness-aura.tsx` từng `return null` khi không có số đo, kèm lý do:
 *
 *   "No reading, no colour. A default wash would be the screen asserting a
 *   state before anything has been measured."
 *
 * Nửa đầu của câu ấy đúng và tệp này canh cho nó đứng vững. Nửa sau là một kết
 * luận không theo sau: "không tô màu TRẠNG THÁI" không kéo theo "không tô gì".
 *
 * Hậu quả đo được trên máy thật: người dùng mở app, chưa nối Apple Health, và
 * Today là một màn hình đen tuyền với một vòng tròn xám ở giữa. Trang đọc ra
 * như hỏng chứ không như đang chờ — và với một tài khoản chưa nối nguồn dữ
 * liệu, đó không phải trạng thái thoáng qua mà là màn hình thường trực của họ.
 *
 * ── vì sao BẠC, và vì sao đó không phải một lời nói dối ──
 *
 * `constants/ascnd.ts` ghi thẳng về nhóm bạc: "It is an identity, not a
 * signal." Xanh/vàng/đỏ nằm trên một thang và mỗi màu là một phát biểu về cơ
 * thể người dùng; bạc không nằm trên thang ấy và không phát biểu gì. Đó chính
 * xác là thứ cần cho một trạng thái "chưa biết".
 *
 * Nên luật số một ở đây là luật cấm: wash nghỉ KHÔNG được lấy màu từ bảng
 * readiness. Một ngày nào đó ai đó sẽ thấy nó "hơi nhạt" và thay bằng xanh lá
 * cho ấm áp, và lúc ấy app bắt đầu nói với người dùng rằng họ đang hồi phục
 * tốt trong khi chưa hề đo gì.
 *
 * ── và cái trần độ mờ ──
 *
 * Bạc `#a8afbd` sáng hơn hẳn ba màu tín hiệu neon, nên cùng alpha nó nâng nền
 * lên nhiều hơn. Chữ phụ (`mutedForeground`) là cặp chặt nhất trong bảng màu,
 * và tệp này TÍNH lại tương phản chứ không tin con số viết trong chú thích.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const AURA = 'src/components/ascnd/readiness-aura.tsx';
/* Bảng màu đã dời sang `constants/palette.ts` — dữ liệu THUẦN, không import
   gì — để `tools/palette.mjs` biên dịch rồi chạy nó một mình mà đo tương phản
   trên giá trị thật. `ascnd.ts` giờ chỉ re-export nó dưới cái tên `colors`. */
const TOKENS = 'src/constants/palette.ts';
const problems = [];

/** Đọc một hằng số màu ra khỏi bảng token, không chép lại. */
function token(src, name) {
  return /^\s{2}(?:[\s\S]*?)$/.test('') ? null : new RegExp(`\\n  ${name}: '(#[0-9a-fA-F]{3,8})'`).exec(src)?.[1] ?? null;
}

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lin = (c) => {
  c /= 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const lum = (v) => 0.2126 * lin(v[0]) + 0.7152 * lin(v[1]) + 0.0722 * lin(v[2]);
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
/** Màu `fg` trên nền `bg` đã bị `wash` phủ ở độ mờ `a`. */
const over = (wash, bg, a) => wash.map((v, i) => v * a + bg[i] * (1 - a));

/*
  Thân MỌI luật là một hàm, và phần tự kiểm ở cuối gọi lại đúng hàm này trên một
  thế giới hỏng — chép tay lại điều kiện vào phần tự kiểm thì xoá luật đi vẫn
  xanh, lỗi đã phải vá ở `rest-timer.mjs`, `drag-settle.mjs`, `spring-model.mjs`
  và `entrance-app.mjs`.
*/
function audit(W) {
  const out = [];

  /* ── 1. trạng thái nghỉ TỒN TẠI ─────────────────────────────────────────
     Bản đã ship thoát sớm bằng `return null`, và đó là màn hình đen. */
  if (/if \(!tint\) return null;/.test(W.aura)) {
    out.push(
      `${AURA}: quay lại \`if (!tint) return null\` — chưa có số đo thì cả trang là màu nền trần, và ` +
        'với một tài khoản chưa nối nguồn dữ liệu thì đó là màn hình THƯỜNG TRỰC của họ, không phải ' +
        'một khoảnh khắc chờ',
    );
  }
  if (!/const resting = !tint;/.test(W.aura)) {
    out.push(`${AURA}: không còn phân biệt trạng thái nghỉ — không có gì để vẽ khi chưa đo được`);
  }

  /* ── 2. wash nghỉ KHÔNG lấy màu từ thang readiness ───────────────────────
     Luật quan trọng nhất trong tệp. Xanh/vàng/đỏ là phát biểu về cơ thể người
     dùng; dùng một trong ba khi chưa đo gì là app tự bịa ra một kết quả. */
  /*
    `c.` chứ không còn `colors.`.

    Bảng màu bây giờ đọc lúc chạy, nên `readiness-aura.tsx` viết `c.primary` —
    `c` là bảng màu của theme đang bật. Neo cũ (`colors\.`) thôi khớp, và tệp
    này ĐỔ đúng như nó phải đổ: chốt "không đọc được hai màu" nổ và cả bước
    kiểm báo HỎNG thay vì báo xanh trên một luật nó không còn kiểm được gì.

    Đó là lý do chốt ấy tồn tại. Giữ nguyên nó, chỉ dời neo.
  */
  const restingLine = /const paint = tint \?\? (c\.\w+);/.exec(W.aura)?.[1];
  const secondLine = /const second = resting \? (c\.\w+)/.exec(W.aura)?.[1];
  if (!restingLine || !secondLine) {
    out.push(`${AURA}: không đọc được hai màu của trạng thái nghỉ — luật dưới không kiểm được gì`);
  } else {
    for (const [what, expr] of [
      ['tông chính', restingLine],
      ['tông thứ hai', secondLine],
    ]) {
      const name = expr.split('.')[1];
      if (W.signals.includes(name)) {
        out.push(
          `${AURA}: ${what} của trạng thái nghỉ là \`${expr}\` — đó là một màu TÍN HIỆU trên thang ` +
            'xanh–vàng–đỏ, và tô nó khi chưa có số đo là app tự bịa ra một kết quả về cơ thể người dùng. ' +
            'Nhóm bạc tồn tại đúng cho việc này: `constants/ascnd.ts` ghi "It is an identity, not a signal"',
        );
      } else if (!W.identity.includes(name)) {
        out.push(
          `${AURA}: ${what} của trạng thái nghỉ là \`${expr}\`, không thuộc nhóm bạc nhận diện ` +
            `(${W.identity.join(', ')}) — một màu ngoài nhóm ấy sẽ đọc ra như đang nói điều gì đó`,
        );
      }
    }
  }

  /* ── 3. trần độ mờ, TÍNH lại chứ không tin chú thích ─────────────────────
     Chữ phụ trên nền đã bị wash phủ phải giữ được 4,5:1 — ngưỡng mà
     `constants/ascnd.ts` đã bỏ công đưa `mutedForeground` từ 3,39 lên 4,71 để
     đạt. Một wash ăn lại tỉ số ấy là một hồi quy mà bảng màu không thấy được. */
  const alpha = Number(/const RESTING_ALPHA = ([\d.]+);/.exec(W.aura)?.[1]);
  if (!Number.isFinite(alpha)) {
    out.push(`${AURA}: không đọc được \`RESTING_ALPHA\``);
  } else {
    const got = ratio(rgb(W.muted), over(rgb(W.silver), rgb(W.bg), alpha));
    if (got < 4.5) {
      out.push(
        `${AURA}: RESTING_ALPHA = ${alpha} đưa chữ phụ xuống ${got.toFixed(2)}:1 trên nền đã phủ — ` +
          'dưới 4,5:1. `constants/ascnd.ts` ghi lại cả phép đo đưa `mutedForeground` lên 4,71:1; một ' +
          'wash ăn lại tỉ số ấy là hồi quy mà bảng màu không nhìn thấy',
      );
    }
  }

  /* ── 4. chỉ trạng thái NGHỈ mới trôi ─────────────────────────────────────
     Wash màu là một phát biểu về hôm nay, và một phát biểu thì đứng yên. Cho
     cả hai cùng trôi là làm màu trạng thái bớt dứt khoát để đổi lấy một chuyển
     động không ai xin. */
  if (!/const moving = resting && focused && !reduceMotion;/.test(W.aura)) {
    out.push(
      `${AURA}: cờ trôi không phải \`resting && focused && !reduceMotion\` — thiếu \`resting\` thì wash ` +
        'MÀU cũng trôi, và một phát biểu về hôm nay thì phải đứng yên',
    );
  }

  /* ── 5. lớp luôn LỚN HƠN màn hình đủ để nuốt hết biên độ trôi ────────────
     Một cú dịch mà lớp vẫn đúng cỡ màn hình là một dải không vẽ gì ở mép đối
     diện — và pool thứ hai nằm ở cx=88%, nên chỗ hở ấy có màu ngay bên cạnh:
     một đường dọc cứng vắt qua màn hình. Đo được ở bản đầu của chính bản sửa
     này: `scale: 1 + t*0.04` hở 3% bề ngang ở `t = 0`.

     Scale `s` nới mỗi bên `(s − 1) / 2`; quãng dịch lớn nhất là `DRIFT / 2`.
     Nên `s ≥ 1 + DRIFT`, và đó là bất đẳng thức luật này chấm. */
  const drift0 = Number(/const DRIFT = ([\d.]+);/.exec(W.aura)?.[1]);
  const overscale = Number(/const OVERSCALE = ([\d.]+);/.exec(W.aura)?.[1]);
  if (!Number.isFinite(drift0) || !Number.isFinite(overscale)) {
    out.push(`${AURA}: không đọc được \`DRIFT\` hoặc \`OVERSCALE\` — luật hở mép không kiểm được gì`);
  } else if (overscale < 1 + drift0) {
    out.push(
      `${AURA}: OVERSCALE ${overscale} nhỏ hơn 1 + DRIFT (${(1 + drift0).toFixed(3)}) — lớp aura sẽ hở ` +
        'một dải không vẽ gì ở mép khi trôi tới biên, và pool thứ hai nằm sát mép phải nên chỗ hở đó ' +
        'là một đường dọc cứng vắt qua màn hình',
    );
  }

  /* ── 6. chỉ transform chạy, SVG đứng yên ─────────────────────────────────
     `assistant-aura.tsx` đã đo và ghi: `react-native-svg` vẽ lại cả `<Svg>`
     khi bất kỳ prop con nào đổi, nên animate một `<Stop>` là cách đắt nhất để
     làm một vệt mờ chuyển động. */
  if (!/transform: \[/.test(W.drift) || /stopOpacity=\{[a-z]\w*\.value/.test(W.aura)) {
    out.push(
      `${AURA}: cú trôi không còn chỉ là transform — animate thuộc tính của SVG bắt react-native-svg vẽ ` +
        'lại cả lớp mỗi khung hình, thứ `assistant-aura.tsx` đã đo và tránh',
    );
  }

  return out;
}

const tokensSrc = read(TOKENS);
const auraSrc = strip(read(AURA));
const WORLD = {
  aura: auraSrc,
  drift: /const drift = useAnimatedStyle\(\(\) => \(\{([\s\S]*?)\}\)\);/.exec(auraSrc)?.[1] ?? '',
  /* Đọc từ bảng token, không chép lại — một bản sao ở đây là một lời hứa sẽ
     lệch đi ở lần ai đó chỉnh bảng màu. */
  bg: token(tokensSrc, 'background'),
  silver: token(tokensSrc, 'primary'),
  muted: token(tokensSrc, 'mutedForeground'),
  signals: ['readinessGreen', 'readinessYellow', 'readinessRed', 'destructive'],
  identity: ['primary', 'goldLight', 'champagne'],
};

for (const [k, v] of Object.entries({ bg: WORLD.bg, silver: WORLD.silver, muted: WORLD.muted })) {
  if (!v) problems.push(`${TOKENS}: không đọc được màu \`${k}\` — luật tương phản không kiểm được gì`);
}
if (WORLD.bg && WORLD.silver && WORLD.muted) problems.push(...audit(WORLD));

/* ── tự kiểm ─────────────────────────────────────────────────────────────── */
{
  const fail = (name) => {
    console.error(`phép tự kiểm hỏng — thế giới "${name}" đáng lẽ phải bị bắt, đừng tin kết quả`);
    process.exit(1);
  };
  const broken = (name, patch, want) => {
    if (!audit({ ...WORLD, ...patch }).some((p) => want.test(p))) fail(name);
  };
  const patched = (before, after) => {
    if (!WORLD.aura.includes(before)) {
      console.error(`phép tự kiểm hỏng — không tìm thấy \`${before}\``);
      process.exit(1);
    }
    return WORLD.aura.split(before).join(after);
  };

  /* Bản ĐÃ SHIP: thoát sớm, màn hình đen. */
  broken(
    'quay lại return null khi chưa đo được',
    { aura: `${WORLD.aura}\n  if (!tint) return null;` },
    /màn hình THƯỜNG TRỰC|màu nền trần/,
  );
  broken('mất phân biệt trạng thái nghỉ', { aura: patched('const resting = !tint;', 'const r2 = !tint;') }, /không còn phân biệt/);

  /* Luật 2 — và đây là ca đáng sợ nhất: ai đó thấy bạc "hơi nhạt". */
  broken(
    'wash nghỉ chuyển sang màu tín hiệu',
    { aura: patched('const paint = tint ?? c.primary;', 'const paint = tint ?? c.readinessGreen;') },
    /màu TÍN HIỆU/,
  );
  broken(
    'tông thứ hai ra ngoài nhóm nhận diện',
    { aura: patched('const second = resting ? c.goldLight', 'const second = resting ? c.metricBlue') },
    /không thuộc nhóm bạc/,
  );

  /*
    Hai chốt "mất điểm neo". Chúng dễ bị bỏ quên vì trông như phòng hờ, nhưng
    chúng mới là thứ giữ cho cả tệp khỏi im lặng: một luật không đọc được đầu
    vào của nó mà vẫn báo xanh thì tệ hơn không có luật, vì nó phát ra một lời
    bảo đảm nó không hề kiểm.
  */
  broken(
    'không đọc được hai màu của trạng thái nghỉ',
    { aura: patched('const paint = tint ?? c.primary;', 'const paint = pickColour();') },
    /không đọc được hai màu/,
  );
  broken(
    'không đọc được RESTING_ALPHA',
    { aura: patched('const RESTING_ALPHA = 0.1;', 'const RESTING_A = 0.1;') },
    /không đọc được `RESTING_ALPHA`/,
  );

  /* Luật 3 — trần độ mờ, và phép tính phải THẬT SỰ chấm. */
  broken('độ mờ vượt trần tương phản', { aura: patched('const RESTING_ALPHA = 0.1;', 'const RESTING_ALPHA = 0.2;') }, /dưới 4,5:1|xuống 3\./);

  /* Luật 4 — wash màu bị kéo vào cuộc trôi. */
  broken(
    'wash màu cũng trôi',
    { aura: patched('const moving = resting && focused && !reduceMotion;', 'const moving = focused && !reduceMotion;') },
    /phải đứng yên/,
  );

  /* Luật 5 — hở mép. Bản hỏng là ĐÚNG bản đầu của chính bản sửa này. */
  broken('lớp đúng cỡ màn hình, hở mép khi trôi', { aura: patched('const OVERSCALE = 1.08;', 'const OVERSCALE = 1;') }, /hở ` + 'một dải|hở /);
  broken('không đọc được DRIFT', { aura: patched('const DRIFT = 0.06;', 'const DRIFT_X = 0.06;') }, /không đọc được/);

  /* Luật 6 — quay về animate thuộc tính SVG. */
  broken('trôi bằng cách animate SVG', { drift: 'opacity: t.value' }, /chỉ là transform/);
}

if (problems.length) {
  console.error('aura trạng thái nghỉ CÓ LỖI:\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}

const alpha = Number(/const RESTING_ALPHA = ([\d.]+);/.exec(WORLD.aura)?.[1]);
const got = ratio(rgb(WORLD.muted), over(rgb(WORLD.silver), rgb(WORLD.bg), alpha));

console.log(
  `aura trạng thái nghỉ OK — chưa có số đo thì trang KHÔNG đen nữa, và cũng KHÔNG tô màu trạng thái. ` +
    'Bản đã ship `return null` ở đó, nên một tài khoản chưa nối Apple Health nhận một Today đen tuyền ' +
    'với một vòng tròn xám — không phải khoảnh khắc chờ mà là màn hình thường trực của họ. Wash nghỉ ' +
    `dùng nhóm bạc NHẬN DIỆN (${WORLD.identity.join(', ')}), thứ mà constants/ascnd.ts ghi là "an ` +
    'identity, not a signal": nó không nằm trên thang xanh–vàng–đỏ nên không có cách đọc nhầm nào. Luật ' +
    'cấm là luật chính ở đây — một ngày ai đó sẽ thấy bạc hơi nhạt và thay bằng xanh lá cho ấm, và lúc ' +
    `ấy app nói người dùng đang hồi phục tốt trong khi chưa đo gì. Độ mờ ${alpha} được TÍNH lại từ bảng ` +
    `token chứ không tin chú thích: chữ phụ giữ ${got.toFixed(2)}:1 trên nền đã phủ, trên ngưỡng 4,5 mà ` +
    'bảng màu đã bỏ công đạt. Chỉ trạng thái nghỉ mới trôi — wash màu là một phát biểu về hôm nay và ' +
    'phát biểu thì đứng yên — cú trôi chỉ chạm transform chứ không chạm thuộc tính SVG nào, và lớp luôn lớn hơn màn hình đủ để nuốt hết biên độ trôi — bản đầu của chính bản sửa này hở 3% bề ngang ở mép phải, ngay cạnh pool thứ hai',
);
