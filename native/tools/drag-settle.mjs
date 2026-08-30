/**
 * Cú ĐÁP khi thả tay: thẻ phải đi liên tục từ chỗ ngón tay rời tới ô của nó.
 *
 * ── lỗi đã sửa ──
 *
 * `onEnd` cũ:
 *
 *     runOnJS(onCommit)(from.value, to.value);
 *     dy.value = 0;          // ← luồng UI, ngay lập tức
 *     from.value = -1;
 *
 * Hai vế phải xảy ra cùng lúc nhưng chạy trên hai luồng. `dy.value = 0` xong
 * ngay khung hình đó; `onCommit` đi qua `runOnJS` → setState → JSON.stringify →
 * AsyncStorage → dựng lại cây, vài khung hình sau. Trong khe ấy màn hình hiện
 * thứ tự CŨ với mọi thứ đã về chỗ cũ, nên người dùng thấy:
 *
 *     thả tay → thẻ bật NGƯỢC về chỗ xuất phát → thẻ nhảy TỚI ô đích
 *
 * Chú thích cạnh dòng ấy lập luận rằng "cây sắp được dựng lại nên hàng đã ở
 * đúng chỗ". Đúng cho các hàng KHÁC — độ dịch của chúng bằng đúng độ đổi layout
 * nên về 0 là liên tục — và sai cho hàng đang kéo, vì `dy` là vị trí NGÓN TAY
 * chứ không phải vị trí ô đích. Lệch đúng bằng `visual − rest`.
 *
 * ── bất biến mà tệp này chứng minh ──
 *
 * Gọi `L(i)` là toạ độ ô thứ `i` trong bố cục CŨ, `L'(i)` trong bố cục MỚI.
 * Thẻ được thả ở `L(f) + visual`. Sau khi ghi thứ tự nó phải ở đúng chỗ ấy, rồi
 * mới chạy lò xo về `L'(t)`. Điều đó xảy ra khi và chỉ khi:
 *
 *     L(f) + restFor(f, t, h)  ==  L'(t)
 *
 * Vế trái là thứ mã nguồn TÍNH; vế phải là thứ layout THẬT SỰ làm. Tệp này
 * dựng cả hai bố cục từ mảng chiều cao, chạy `restFor` trích thẳng từ mã, và so
 * chúng trên mọi cặp (f, t) với nhiều hình dạng chiều cao khác nhau.
 *
 * Nếu hai vế lệch nhau một điểm thì tấm thẻ giật một điểm ở đúng khoảnh khắc
 * người dùng buông tay — thứ không có gì báo, không log, không đỏ, và chỉ đọc
 * ra là "hơi cấn".
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const DRAG = 'src/components/ascnd/drag-reorder.tsx';
const src = read(DRAG);
const code = strip(src);
const problems = [];

/* ── trích hàm thật ra khỏi mã nguồn ─────────────────────────────────────────
   Cùng cách `drag-reorder.mjs` làm với `target`: chạy chính đoạn mã app chạy,
   không phải một bản chép tay sẽ lệch đi ở lần sửa sau. */
function build(name, args, tail) {
  const re = new RegExp(
    `const ${name} = useCallback\\(\\s*\\(${args}\\) => \\{([\\s\\S]*?)\\n    \\},\\s*\\[${tail}\\],\\s*\\);`,
  );
  const m = re.exec(src);
  if (!m) return null;
  const body = m[1].replace(/'worklet';/, '').replace(/: number(\[\])?/g, '');
  return body;
}

const restBody = build('restFor', 'f: number, t: number, h: number\\[\\]', 'gap');
const clampBody = build('clampShift', 'f: number, shift: number, h: number\\[\\]', 'restFor, count');

if (!restBody) problems.push(`${DRAG}: không trích được \`restFor\` — luật dưới không kiểm được gì`);
if (!clampBody) problems.push(`${DRAG}: không trích được \`clampShift\``);

const restFor = restBody ? new Function('f', 't', 'h', 'gap', restBody) : null;
/* `clampShift` gọi `restFor`, nên bản dựng lại phải mang theo nó — cũng lấy từ
   chính mã nguồn, không phải một bản chép tay. `gap` là tham số của hàm ngoài
   nên hàm lồng bên trong nhìn thấy nó. */
const clampShift =
  clampBody && restBody
    ? new Function(
        'f',
        'shift',
        'h',
        'count',
        'gap',
        'RUBBER',
        `function restFor(f, t, h) {${restBody}}\n${clampBody}`,
      )
    : null;

const GAP = 16;
const RUBBER = Number(/const RUBBER = ([\d.]+);/.exec(code)?.[1] ?? NaN);

/** Toạ độ đỉnh của từng ô, cho một mảng chiều cao. */
function layout(h) {
  const out = [];
  let y = 0;
  for (const v of h) {
    out.push(y);
    y += v + GAP;
  }
  return out;
}

/** Bố cục sau khi cắt hàng `f` ra và chèn vào chỗ `t`. */
function reordered(h, f, t) {
  const next = [...h];
  const [x] = next.splice(f, 1);
  next.splice(t, 0, x);
  return next;
}

/*
  Thân MỌI luật là một hàm, và phần tự kiểm ở cuối tệp gọi lại đúng hàm này
  trên một thế giới hỏng.

  Bản đầu của tệp này chép tay lại điều kiện của từng luật vào phần tự kiểm, và
  đo được là cả CHÍN luật đều xoá được mà tệp vẫn báo OK — cùng lỗ hổng đã phải
  vá ở `rest-timer.mjs`. Một phép tự kiểm chép tay chỉ chứng minh một tính chất
  của thứ nó tự dựng, không chứng minh rằng luật còn ở đây.

  `W` là cả thế giới các luật đọc: hai hàm trích từ mã, mã đã bóc chú thích, hệ
  số cản, và bảng hình dạng chiều cao.
*/
const SHAPES = [
  { name: 'bốn thẻ cao khác nhau (hình dạng dashboard thật)', h: [200, 60, 60, 200] },
  { name: 'tất cả bằng nhau', h: [120, 120, 120, 120] },
  { name: 'một thẻ rất cao ở giữa', h: [80, 420, 80, 80, 80] },
  { name: 'cao dần', h: [40, 80, 120, 160, 200, 240] },
  { name: 'hai thẻ', h: [90, 300] },
];

const WIRES = [
  {
    re: /settleKey\.value = itemKey;/,
    what:
      'phần dư không còn khoá theo ID thẻ — khoá theo chỉ số thì nó trỏ nhầm thẻ ngay khi thứ tự ' +
      'được ghi, và cú đáp chạy trên một tấm thẻ khác',
  },
  {
    re: /settleY\.value = visual - rest;/,
    what: 'phần dư không còn là `visual − rest` — đó chính là con số làm hai vế triệt tiêu nhau ở ranh giới commit',
  },
  {
    re: /dy\.value = rest;/,
    what: 'khi thả, `dy` không đặt về `rest` — nếu nó về 0 thì thẻ bật ngược về chỗ xuất phát, đúng lỗi đã sửa',
  },
  {
    re: /settleY\.value = withSpring\(0, \{[\s\S]{0,200}?velocity:/,
    what: 'cú đáp không còn lò xo có vận tốc — kéo nhanh và kéo chậm sẽ đáp giống hệt nhau',
  },
  {
    re: /Math\.max\(-MAX_RELEASE_V, Math\.min\(MAX_RELEASE_V, e\.velocityY\)\)/,
    what: 'vận tốc không còn bị chặn — một cú vẩy mạnh sẽ làm thẻ vọt qua ô rồi bò ngược lại',
  },
  {
    re: /if \(from\.value !== -1\) return;/,
    what:
      'mất chốt một-cử-chỉ-một-lúc — hai ngón giữ hai thẻ cùng ghi vào một bộ shared value, và thứ tự ' +
      'lưu trên máy sẽ khác thứ tự trên màn hình',
  },
  {
    /* Ba giai đoạn của một cử chỉ, ba lần phải hỏi cùng một câu. Bản đầu chỉ
       chặn ở `onStart` và `onEnd`; `onUpdate` của ngón thứ hai vẫn ghi đè `dy`
       và `to` của cú kéo đang diễn ra. */
    /* Neo vào câu lệnh ĐẦU TIÊN. Bản đầu cho phép 600 ký tự ở giữa, và trong
       khoảng đó nó với sang được chốt của `onEnd` — nên gỡ chốt của `onUpdate`
       đi mà luật vẫn xanh. Một luật khớp nhầm sang chỗ khác là một luật không
       canh chỗ nào. */
    re: /\.onUpdate\(\(e\) => \{\s*if \(from\.value !== index\) return;/,
    what:
      '`onUpdate` không còn chốt "hàng này có đang được kéo không" — một cử chỉ bị `onStart` từ chối ' +
      'vẫn tiếp tục bắn onUpdate, và nó sẽ lái tấm thẻ đang nằm trên tay người dùng',
  },
  {
    re: /\.maxPointers\(1\)/,
    what: 'pan nhận nhiều hơn một ngón — quãng kéo thành trung bình của hai ngón',
  },
  {
    re: /press\.value = withDelay\(PRESS_DELAY, withSpring\(/,
    what:
      'mất phản hồi lúc chạm xuống, hoặc nó thôi được hoãn — không hoãn thì mỗi cú CUỘN đi qua thẻ ' +
      'cũng làm thẻ nhấp nháy',
  },
  {
    re: /settleKey\.value === itemKey \? settleY\.value : 0/,
    what: 'hàng không còn đọc phần dư theo ID — cú đáp sẽ không hiện trên thẻ nào cả',
  },
];

function audit(W) {
  const out = [];

  /* ── 1. bất biến liên tục: `restFor` phải bằng độ đổi layout THẬT ────────
     Đây là toàn bộ bản sửa, viết thành một đẳng thức. Lệch một điểm thì thẻ
     giật một điểm đúng lúc người dùng buông tay. */
  for (const shape of W.shapes) {
    const h = shape.h;
    const before = layout(h);
    for (let f = 0; f < h.length; f++) {
      for (let t = 0; t < h.length; t++) {
        const after = layout(reordered(h, f, t));
        const want = after[t] - before[f];
        const got = W.restFor(f, t, h, GAP);
        if (Math.abs(got - want) > 0.0001) {
          out.push(
            `${DRAG}: restFor(${f} → ${t}) ra ${got}, layout thật dịch ${want} — ${shape.name}. ` +
              'Lệch bao nhiêu thì thẻ giật bấy nhiêu điểm đúng lúc người dùng buông tay',
          );
        }
      }
    }
  }

  /* ── 2. răng: bản ĐÃ SHIP phải bị bảng hình dạng này bắt ─────────────────
     Bản cũ không tính `rest` gì cả — nó đặt `dy = 0`, tức coi độ dịch bằng 0
     với mọi cặp. Một bảng mà bản hỏng cũng đi qua được thì không chứng minh gì. */
  {
    let caught = 0;
    for (const shape of W.shapes) {
      const h = shape.h;
      const before = layout(h);
      for (let f = 0; f < h.length; f++) {
        for (let t = 0; t < h.length; t++) {
          const after = layout(reordered(h, f, t));
          if (Math.abs(0 - (after[t] - before[f])) > 0.0001) caught++;
        }
      }
    }
    if (caught === 0) {
      out.push('bảng hình dạng không còn bắt được bản đã ship (`dy = 0`) — luật 1 không chứng minh điều gì');
    }
  }

  /* ── 3. biên: kéo bao xa cũng không ra khỏi danh sách ────────────────────
     Bản cũ để `dy = e.translationY` không chặn, nên kéo thẻ đầu lên tám trăm
     điểm thì nó đi đủ tám trăm điểm — một hình chữ nhật trôi giữa màn hình. */
  {
    const h = [200, 60, 60, 200];
    for (let f = 0; f < h.length; f++) {
      const lo = W.restFor(f, 0, h, GAP);
      const hi = W.restFor(f, h.length - 1, h, GAP);
      for (const raw of [-4000, -800, -1, 0, 1, 800, 4000]) {
        const got = W.clampShift(f, raw, h, h.length, GAP, W.rubber);
        /* Trong biên thì không được đụng vào: kéo bình thường phải bám tay 1:1. */
        if (raw >= lo && raw <= hi && Math.abs(got - raw) > 0.0001) {
          out.push(`${DRAG}: clampShift sửa một quãng kéo NẰM TRONG biên (${raw} → ${got}) — thẻ thôi bám tay`);
        }
        /* Ngoài biên thì nặng dần, nhưng phải THẬT SỰ cản: 4000 điểm kéo thừa
           mà vẫn cho đi gần hết thì chẳng khác gì không chặn. */
        if (raw < lo) {
          const over = lo - got;
          if (over < 0) out.push(`${DRAG}: clampShift(${raw}) ra ${got}, vượt ngược qua biên dưới ${lo}`);
          else if (over > Math.abs(raw - lo) * (W.rubber + 0.01)) {
            out.push(`${DRAG}: clampShift(${raw}) đi quá xa dưới biên — không còn là cản, chỉ là chậm`);
          }
        }
        if (raw > hi) {
          const over = got - hi;
          if (over < 0) out.push(`${DRAG}: clampShift(${raw}) ra ${got}, vượt ngược qua biên trên ${hi}`);
          else if (over > Math.abs(raw - hi) * (W.rubber + 0.01)) {
            out.push(`${DRAG}: clampShift(${raw}) đi quá xa trên biên — không còn là cản, chỉ là chậm`);
          }
        }
      }
    }
  }

  /* ── 4. những dây nối mà cả cú đáp treo trên đó ──────────────────────────── */
  for (const w of WIRES) {
    if (!w.re.test(W.code)) out.push(`${DRAG}: ${w.what}`);
  }

  /* ── 5. việc dọn phải nằm CÙNG NHỊP với lệnh ghi thứ tự ──────────────────
     Nửa còn lại của bản sửa, và là thứ dễ bị hoàn nguyên nhất: dọn trong
     worklet "cho nhanh" là đúng cái đã gây ra lỗi. `commit` chạy trên luồng JS
     nên `setState` và các lệnh ghi shared value cùng đổ xuống một lượt cập
     nhật của luồng UI. Tách chúng ra là mở lại cái khe vài khung hình. */
  {
    const commit = /const commit = useCallback\(([\s\S]*?)\n  \);/.exec(W.code)?.[1] ?? '';
    if (!commit) {
      out.push(`${DRAG}: không tìm thấy \`commit\` — luật về việc dọn cùng nhịp không đọc được gì`);
    } else {
      for (const sv of ['from', 'to', 'dy']) {
        if (!new RegExp(`${sv}\\.value = -?[01];`).test(commit)) {
          out.push(
            `${DRAG}: \`commit\` không dọn \`${sv}\` — nếu việc dọn quay về worklet thì nó lại chạy sớm ` +
              'hơn lệnh ghi thứ tự vài khung hình, và thẻ bật ngược về chỗ cũ',
          );
        }
      }
      if (!/finally/.test(commit)) {
        out.push(`${DRAG}: \`commit\` dọn mà không có \`finally\` — \`onMove\` ném một lần là hàng kẹt lơ lửng`);
      }
    }
    const onEnd = /\.onEnd\(\(e\) => \{([\s\S]*?)\n    \}\)/.exec(W.code)?.[1] ?? '';
    if (onEnd && /from\.value = -1/.test(onEnd)) {
      out.push(
        `${DRAG}: \`onEnd\` lại tự dọn \`from\` — đó là bản cũ: luồng UI dọn ngay còn lệnh ghi thứ tự tới ` +
          'sau vài khung hình, và cái khe đó là chỗ thẻ bật ngược về chỗ xuất phát',
      );
    }
  }

  /* ── 6. cử chỉ bị CẮT NGANG cũng phải đáp, không được kẹt ────────────────
     Gọi điện tới, chuyển app, một cử chỉ khác cướp mất — `onEnd` không chạy,
     chỉ `onFinalize` chạy. */
  {
    const fin = /\.onFinalize\(\(\) => \{([\s\S]*?)\n    \}\);/.exec(W.code)?.[1] ?? '';
    if (!fin) {
      out.push(`${DRAG}: không tìm thấy \`onFinalize\``);
    } else {
      if (!/from\.value === index/.test(fin)) {
        out.push(`${DRAG}: \`onFinalize\` không kiểm hàng nào đang bị kéo — nó sẽ dọn cả cú kéo của hàng khác`);
      }
      if (!/withSpring\(0, RELEASE\)/.test(fin)) {
        out.push(
          `${DRAG}: cú huỷ không đáp bằng cùng lò xo với cú thả — một cú huỷ cũng là một cú buông, và hai ` +
            'kết cục của cùng một cử chỉ mà chuyển động khác nhau thì đọc ra là hai thứ khác nhau',
        );
      }
      if (!/press\.value = withSpring\(0, LIFT\);/.test(fin)) {
        out.push(
          `${DRAG}: cú giữ không được thu về trong \`onFinalize\` — một cú chạm rồi cuộn đi sẽ để thẻ ` +
            'phình ra vĩnh viễn',
        );
      }
    }
  }

  return out;
}

const WORLD = { restFor, clampShift, code, rubber: RUBBER, shapes: SHAPES };
if (restFor && clampShift && Number.isFinite(RUBBER)) problems.push(...audit(WORLD));

/* ── tự kiểm ─────────────────────────────────────────────────────────────────
   Mỗi luật một thế giới hỏng, và phần này gọi lại đúng `audit` đang chạy ở
   trên — nên xoá luật nào cũng thành đỏ. */
{
  const fail = (name) => {
    console.error(`phép tự kiểm hỏng — thế giới "${name}" đáng lẽ phải bị bắt, đừng tin kết quả`);
    process.exit(1);
  };
  const broken = (name, patch, want) => {
    if (!audit({ ...WORLD, ...patch }).some((p) => want.test(p))) fail(name);
  };
  /** Sửa mã nguồn ở MỌI lần xuất hiện — `settleKey.value = itemKey;` có hai chỗ
   *  (thả tay và huỷ cử chỉ), và thay một chỗ thì luật vẫn khớp ở chỗ kia. */
  const patched = (before, after) => {
    if (!code.includes(before)) {
      console.error(`phép tự kiểm hỏng — không tìm thấy \`${before}\``);
      process.exit(1);
    }
    return code.split(before).join(after);
  };

  // 1 — phép tính lệch đúng một điểm
  broken(
    'restFor lệch một điểm',
    { restFor: (f, t, h, g) => restFor(f, t, h, g) + (f === t ? 0 : 1) },
    /layout thật dịch/,
  );
  // 1 — và bản đã ship: không tính gì cả
  broken('restFor về bản đã ship (luôn 0)', { restFor: () => 0 }, /layout thật dịch/);
  // 2 — bảng hình dạng mất răng: chỉ còn những ca mà `dy = 0` vô tình đúng
  broken('bảng hình dạng mất răng', { shapes: [{ name: 'một thẻ', h: [100] }] }, /không còn bắt được bản đã ship/);
  // 3 — không chặn biên
  broken('biên bị gỡ, kéo tự do', { clampShift: (f, shift) => shift }, /không còn là cản/);
  // 3 — chặn cả trong biên
  broken('biên siết cả quãng kéo bình thường', { clampShift: () => 0 }, /NẰM TRONG biên/);
  /* Luật biên viết hai lần, một cho mỗi chiều — nên phải có một thế giới hỏng
     cho mỗi chiều, nếu không xoá một nửa đi mà nửa kia vẫn bắt được thì phép
     tự kiểm báo xanh cho một luật đã mất một nửa. Đo được đúng chuyện đó. */
  broken(
    'biên chỉ cản phía trên, thả tự do phía dưới',
    { clampShift: (f, shift, h, count, gap, rubber) => (shift > 0 ? clampShift(f, shift, h, count, gap, rubber) : shift) },
    /dưới biên/,
  );
  broken(
    'biên chỉ cản phía dưới, thả tự do phía trên',
    { clampShift: (f, shift, h, count, gap, rubber) => (shift < 0 ? clampShift(f, shift, h, count, gap, rubber) : shift) },
    /trên biên/,
  );
  // 4 — từng dây nối
  broken('phần dư khoá theo chỉ số', { code: patched('settleKey.value = itemKey;', 'settleKey.value = String(index);') }, /khoá theo ID thẻ/);
  broken('thả tay lại đặt dy về 0', { code: patched('dy.value = rest;', 'dy.value = 0;') }, /không đặt về `rest`/);
  broken('cú đáp mất vận tốc', { code: patched('velocity:', 'ignored:') }, /lò xo có vận tốc/);
  broken('mất chốt một-cử-chỉ', { code: patched('if (from.value !== -1) return;', 'if (false) return;') }, /một-cử-chỉ-một-lúc/);
  broken(
    'onUpdate mất chốt hàng đang kéo',
    { code: patched('      if (from.value !== index) return;\n      fingerY.value', '      fingerY.value') },
    /`onUpdate` không còn chốt/,
  );
  broken('phản hồi chạm xuống thôi được hoãn', { code: patched('withDelay(PRESS_DELAY, withSpring(', 'withSpring((') }, /thôi được hoãn/);
  broken('pan nhận nhiều ngón', { code: patched('.maxPointers(1)', '.minPointers(1)') }, /nhiều hơn một ngón/);
  // 5 — việc dọn quay về worklet
  broken('commit thôi dọn shared value', { code: patched('        from.value = -1;\n        to.value = -1;\n        dy.value = 0;', '        void 0;') }, /`commit` không dọn/);
  broken('worklet tự dọn from', { code: patched('runOnJS(onCommit)(f, t);', 'from.value = -1;\n      runOnJS(onCommit)(f, t);') }, /lại tự dọn/);
  broken('commit dọn mà không có finally', { code: patched('      } finally {', '      }\n      {') }, /không có `finally`/);
  // 6 — cú huỷ
  broken('cú huỷ không dùng lò xo của cú thả', { code: patched('settleY.value = withSpring(0, RELEASE);', 'settleY.value = 0;') }, /cùng lò xo với cú thả/);
  broken(
    'cú huỷ dọn cả cú kéo của hàng khác',
    { code: patched('if (from.value === index) {', 'if (from.value !== -1) {') },
    /không kiểm hàng nào đang bị kéo/,
  );
  broken('cú huỷ không thu cú giữ về', { code: patched('      press.value = withSpring(0, LIFT);\n      runOnJS(onScrolling)(false);', '      runOnJS(onScrolling)(false);') }, /thu về trong `onFinalize`/);
}

if (problems.length) {
  console.error('cú đáp khi thả CÓ LỖI:\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}

console.log(
  `cú đáp khi thả OK — \`restFor\` được TRÍCH ra khỏi mã thật và chạy trên ${SHAPES.length} hình dạng ` +
    'chiều cao × mọi cặp (từ, tới): con số nó tính LUÔN bằng đúng độ dịch mà layout thật sự làm, nên ở ' +
    'khoảnh khắc thứ tự được ghi, `dy` về 0 và layout dịch đi triệt tiêu nhau chính xác — phần dư khoá ' +
    'theo ID THẺ nên nó không đổi ở ranh giới ấy, và cú đáp chạy xuyên qua việc sắp lại mà không biết nó ' +
    'vừa xảy ra. Bản đã ship đặt `dy = 0` (coi độ dịch bằng 0 với mọi cặp) vẫn bị bắt. Quãng kéo bám tay ' +
    '1:1 trong biên và chỉ nặng dần khi ra ngoài. Việc dọn trạng thái nằm cùng nhịp JS với lệnh ghi thứ ' +
    'tự chứ không còn trong worklet — tách ra là mở lại cái khe vài khung hình mà thẻ bật ngược về chỗ ' +
    'xuất phát. Cử chỉ bị cắt ngang đáp bằng cùng lò xo với cú thả. 20 thế giới hỏng đều bị bắt',
);
