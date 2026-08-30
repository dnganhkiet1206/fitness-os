/**
 * Một lò xo phải nói ra được nó sẽ nảy bao nhiêu.
 *
 * ── lỗi đã sửa ──
 *
 * `{ damping: 18, stiffness: 260 }` không nói cho ai biết điều gì. Muốn biết
 * thì phải tự tính tỉ số tắt dần, và không ai tính — nên các con số được chọn
 * bằng cách thử, mỗi lò xo một lần thử khác. Đo lại toàn bộ lò xo của trình
 * sắp xếp widget thì ra:
 *
 *     LIFT        bounce 0,44   ← nảy hơn cả preset nảy nhất iOS ship
 *     GAP_SPRING  bounce 0,26   ← thứ "nhường chỗ" mà lại vượt quá đích
 *     RELEASE     bounce 0,13
 *
 * Không ai chọn 0,44. Nó rơi ra từ hai con số gõ tay, và nó chạy ở BỐN chỗ
 * trong cùng một cử chỉ. Đó là cái người dùng gọi là "chưa được".
 *
 * ── cách đo, mượn từ Apple ──
 *
 * Từ iOS 17, SwiftUI tham số hoá lò xo bằng `Spring(duration:bounce:)`.
 * Reanimated dùng CÙNG mô hình vật lý (khối–lò xo–giảm chấn), chỉ khác tên
 * gọi, nên quy đổi được chính xác:
 *
 *     mass      = 1
 *     stiffness = (2π / duration)²
 *     damping   = 4π(1 − bounce) / duration          (bounce ≥ 0)
 *     damping   = 4π / (duration × (1 + bounce))     (bounce < 0)
 *
 * Công thức chiếu trong WWDC23 session 10158 SAI ở vế damping và Apple đã đính
 * chính trên diễn đàn (thread 739811). Tệp này không tin bản nào cả: nó kiểm
 * `spring()` của app chống lại định nghĩa vật lý gốc — `ζ = 1 − bounce` và
 * `damping = 2ζ√(k·m)` — nên nếu ai chép nhầm bản WWDC vào code thì bước này
 * đỏ.
 *
 * ── và cái trần ──
 *
 * `.bouncy` (bounce 0,30) là mức nảy nhất iOS ship cho giao diện thường. Vượt
 * quá nó là ra khỏi khoảng mà hệ điều hành này coi là còn nghiêm túc. Rig nhân
 * vật được miễn — nó là diễn xuất, không phải giao diện — cùng ranh giới mà
 * `constants/motion.ts` đã vạch cho thang nhịp.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const MOTION = 'src/constants/motion.ts';
const problems = [];

/* ── trích `spring()` THẬT ra khỏi mã nguồn ──────────────────────────────────
   Chạy chính hàm app chạy, không phải một bản chép tay sẽ lệch đi ở lần sửa
   sau — cùng cách `drag-reorder.mjs` và `drag-settle.mjs` làm. */
const motionSrc = read(MOTION);
const body = /export function spring\(duration: number, bounce: number\) \{([\s\S]*?)\n\}/.exec(motionSrc)?.[1];
if (!body) problems.push(`${MOTION}: không trích được \`spring()\` — luật dưới không kiểm được gì`);
const spring = body ? new Function('duration', 'bounce', body.replace(/: number/g, '')) : null;

/** Trần Apple ship cho giao diện thường. */
const MAX_BOUNCE = 0.3;

/**
 * Mọi lò xo trong một tệp, ở CẢ HAI cách viết.
 *
 * Bản đầu chỉ bắt dạng object `{ damping, stiffness }` và tìm được 3 cái. Dạng
 * builder của Reanimated — `.damping(26).stiffness(180)` — là cách 8 lò xo còn
 * lại được viết, gồm cả `rise`, tức là hiệu ứng vào của gần như mọi thẻ trong
 * app. Một luật bỏ sót hai phần ba đối tượng của nó không phải một luật.
 */
function springsIn(src) {
  const out = [];
  for (const m of src.matchAll(
    /\{\s*damping:\s*([\d.]+)\s*,\s*stiffness:\s*([\d.]+)\s*(?:,\s*mass:\s*([\d.]+)\s*)?,?\s*\}/g,
  )) {
    out.push({
      damping: Number(m[1]),
      stiffness: Number(m[2]),
      mass: m[3] ? Number(m[3]) : 1,
      text: m[0].replace(/\s+/g, ' '),
    });
  }
  /* Hai thứ tự, vì cả hai đều có thật trong repo này. */
  for (const m of src.matchAll(
    /\.damping\((\d[\d.]*)\)\s*\.stiffness\((\d[\d.]*)\)|\.stiffness\((\d[\d.]*)\)\s*\.damping\((\d[\d.]*)\)/g,
  )) {
    out.push({
      damping: Number(m[1] ?? m[4]),
      stiffness: Number(m[2] ?? m[3]),
      mass: 1,
      text: m[0].replace(/\s+/g, ''),
    });
  }
  return out;
}

/** Đọc ngược một lò xo ra `bounce` và chu kỳ cảm nhận được. */
function shapeOf({ stiffness, damping, mass = 1 }) {
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  return { zeta, bounce: 1 - zeta, duration: (2 * Math.PI) / Math.sqrt(stiffness / mass) };
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/*
  Rig nhân vật được miễn, và đó là một ranh giới đã có sẵn.

  `constants/motion.ts` đã vạch nó cho thang nhịp: "Koa's blink, nod, squash and
  weight-shift, the celebration sequences, the studio loop… they are
  choreography". Một cú nảy trong diễn xuất là biểu cảm; một cú nảy trong danh
  sách widget là giao diện không đứng yên được.
*/
const RIG = /\/(koa|mascot|studio|shop|celebrat)/;

/*
  Thân MỌI luật là một hàm, và phần tự kiểm ở cuối tệp gọi lại đúng hàm này
  trên một thế giới hỏng — chép tay lại điều kiện vào phần tự kiểm thì xoá luật
  đi vẫn xanh, lỗi đã phải vá ở `rest-timer.mjs` và `drag-settle.mjs`.
*/
function audit(W) {
  const out = [];

  /* ── 1. `spring()` khớp ĐỊNH NGHĨA VẬT LÝ, không phải khớp lời kể ─────────
     `ζ = 1 − bounce` và `damping = 2ζ√(k·m)`, dựng độc lập ở đây rồi so với
     thứ hàm trong app trả về. Bản WWDC sai ở vế damping, nên nếu ai chép nó
     vào thì bước này đỏ. */
  if (W.spring) {
    for (const duration of [0.2, 0.34, 0.4, 0.46, 0.5, 0.8]) {
      for (const bounce of [-0.5, -0.2, 0, 0.15, 0.3, 0.6]) {
        const got = W.spring(duration, bounce);
        const wantK = ((2 * Math.PI) / duration) ** 2;
        const zeta = bounce >= 0 ? 1 - bounce : 1 / (1 + bounce);
        const wantC = 2 * zeta * Math.sqrt(wantK * 1);
        if (Math.abs(got.stiffness - wantK) > 1e-9) {
          out.push(`${MOTION}: spring(${duration}, ${bounce}).stiffness = ${got.stiffness}, phải là ${wantK}`);
        }
        if (Math.abs(got.damping - wantC) > 1e-9) {
          out.push(
            `${MOTION}: spring(${duration}, ${bounce}).damping = ${got.damping.toFixed(4)}, phải là ` +
              `${wantC.toFixed(4)} — đây là vế mà slide WWDC23 ghi sai và Apple đã đính chính`,
          );
        }
        if (got.mass !== 1) out.push(`${MOTION}: spring() trả về mass ${got.mass}, mô hình này đòi 1`);
      }
    }
    /* KHÔNG có luật riêng cho "bounce 0 là tắt dần tới hạn".

       Bản đầu có, và bộ đo xoá-từng-luật cho thấy nó xoá được mà tệp vẫn xanh:
       một lò xo qua được phép so damping ở trên TẠI bounce 0 thì tự khắc đã
       tới hạn — ζ = damping / 2√k = 2·1·√k / 2√k = 1. Nó là hệ quả, không phải
       một sự thật thứ hai, và một luật không thể đỏ một mình là một luật giả
       làm bảng kết quả dài ra. */
  }

  /* ── 2. không lò xo giao diện nào nảy quá trần Apple ─────────────────────
     Quét mọi `{ damping: …, stiffness: … }` viết thẳng trong src. Một lò xo gõ
     tay không tự nói ra mức nảy của nó, nên đây là chỗ duy nhất con số ấy được
     đọc ra thành lời. */
  let scanned = 0;
  for (const f of W.files) {
    if (RIG.test(f.path)) continue;
    for (const m of springsIn(f.src)) {
      scanned += 1;
      const shape = shapeOf(m);
      if (shape.bounce > MAX_BOUNCE + 1e-9) {
        out.push(
          `${f.path}: lò xo \`${m.text}\` có bounce ${shape.bounce.toFixed(2)} — ` +
            `quá trần ${MAX_BOUNCE} mà iOS ship (\`.bouncy\`). Viết bằng \`spring(duration, bounce)\` ` +
            'thì mức nảy nằm ngay trong lời gọi thay vì phải tính ra mới biết',
        );
      }
    }
  }

  /* Và luật trên chỉ có nghĩa nếu nó THẤY được lò xo. Một bộ quét không khớp
     gì cả sẽ báo "không cái nào vượt trần" mãi mãi — đúng chế độ hỏng mà
     `linked.mjs` gọi tên: "passing by measuring nothing". Sàn đặt dưới số
     hiện có một bậc, đủ để một lần đổi cách viết làm bước này đỏ thay vì làm
     nó câm. */
  if (scanned < 8) {
    out.push(
      `chỉ quét được ${scanned} lò xo giao diện — bộ quét hỏng hoặc lò xo đã đổi sang cách viết khác, ` +
        'đừng tin kết quả "không cái nào vượt trần"',
    );
  }

  /* ── 3. trình sắp xếp widget dùng thang ấy, không quay về số gõ tay ─────── */
  const drag = W.drag;
  for (const [name, want] of [
    ['LIFT', /const LIFT = spring\(([\d.]+), BOUNCE\.(\w+)\);/],
    ['GAP_SPRING', /const GAP_SPRING = spring\(([\d.]+), BOUNCE\.(\w+)\);/],
    ['RELEASE', /const RELEASE = spring\(([\d.]+), BOUNCE\.(\w+)\);/],
  ]) {
    const m = want.exec(drag);
    if (!m) {
      out.push(
        `src/components/ascnd/drag-reorder.tsx: \`${name}\` không còn viết bằng \`spring(duration, BOUNCE.…)\` ` +
          '— quay về hai số gõ tay là quay lại chỗ bounce 0,44 không ai chọn mà vẫn ship',
      );
      continue;
    }
    if (name === 'GAP_SPRING' && m[2] !== 'smooth') {
      out.push(
        `src/components/ascnd/drag-reorder.tsx: khe trống nhường chỗ dùng \`${m[2]}\` — thứ đang TRÁNH ` +
          'ĐƯỜNG mà vượt quá ô mới rồi bò ngược lại thì đọc ra là mất ổn định, không phải mềm mại',
      );
    }
  }

  /* ── 4. cụm nút của chế độ sắp xếp dùng thang, không phải số gõ tay ──────
     KHÔNG có luật nào ở đây về hiệu ứng cấp TRANG, và đó là cố ý. Tôi đã thử
     cho cả khối editor một `entering={rise(0)}`, và `drag-reorder.mjs` bắt
     đúng nó bằng một luật cũ hơn ghi lại quyết định của chính người dùng: "mờ
     cả trang đọc ra như trang vừa được TẢI LẠI, trong khi thứ vừa xảy ra là
     bạn đổi chế độ của một trang vẫn đang ở đó. Apple Music làm ngược: trang
     đứng yên, và những điều khiển MỚI trượt vào từ mép phải."

     Nên chuyển động của việc đổi chế độ nằm ở ĐÂY — cụm nút trượt vào — và
     việc duy nhất còn phải canh là nó trượt bằng thang chung. */
  if (!/withSpring\(1, spring\([\d.]+, BOUNCE\.\w+\)\)/.test(W.today)) {
    out.push(
      'src/app/(tabs)/index.tsx: cụm nút chế độ sắp xếp không còn trượt vào bằng `spring(duration, BOUNCE.…)` ' +
        '— bản trước là `{ damping: 22, stiffness: 240 }`, tức bounce 0,29, và với translateX 28 điểm thì nó ' +
        'vượt QUA chỗ của mình khoảng 8 điểm rồi kéo ngược lại',
    );
  }

  return out;
}

const files = walk(path.join(NATIVE, 'src')).map((p) => ({
  path: path.relative(NATIVE, p),
  src: strip(readFileSync(p, 'utf8')),
}));

const WORLD = {
  spring,
  files,
  drag: strip(read('src/components/ascnd/drag-reorder.tsx')),
  today: strip(read('src/app/(tabs)/index.tsx')),
};
problems.push(...audit(WORLD));

/* ── tự kiểm ─────────────────────────────────────────────────────────────── */
{
  const fail = (name) => {
    console.error(`phép tự kiểm hỏng — thế giới "${name}" đáng lẽ phải bị bắt, đừng tin kết quả`);
    process.exit(1);
  };
  const broken = (name, patch, want) => {
    if (!audit({ ...WORLD, ...patch }).some((p) => want.test(p))) fail(name);
  };

  /* Bản WWDC SAI — đúng công thức Apple đã đính chính. Nếu ai chép nó vào app
     thì luật 1 phải đỏ, và đây là bằng chứng nó đỏ. */
  broken(
    'chép công thức damping sai của slide WWDC',
    {
      spring: (d, b) => ({
        mass: 1,
        stiffness: ((2 * Math.PI) / d) ** 2,
        damping: b >= 0 ? 1 - (4 * Math.PI * b) / d : (4 * Math.PI) / (d + 4 * Math.PI * b),
      }),
    },
    /slide WWDC23 ghi sai/,
  );
  broken('stiffness sai hệ số', { spring: (d, b) => ({ mass: 1, stiffness: Math.PI / d, damping: 1 - b }) }, /stiffness/);
  broken('spring trả mass khác 1', { spring: (d, b) => ({ ...spring(d, b), mass: 0.5 }) }, /mass/);

  /* Luật 2 — một lò xo giao diện nảy quá trần. Đây đúng là giá trị đã ship. */
  broken(
    'lò xo giao diện quay về bounce 0,44',
    { files: [{ path: 'src/components/ascnd/fake.tsx', src: 'const X = { damping: 18, stiffness: 260 };' }] },
    /quá trần/,
  );
  broken(
    'lò xo dạng builder vượt trần',
    { files: [{ path: 'src/x.tsx', src: '.damping(6).stiffness(300)' }] },
    /quá trần/,
  );
  broken(
    'bộ quét thôi khớp gì cả',
    { files: [{ path: 'src/x.tsx', src: 'const nothing = 1;' }] },
    /chỉ quét được 0 lò xo/,
  );
  /* Và rig vẫn được miễn — nếu không thì luật này sẽ đi bắt cả diễn xuất. */
  if (
    audit({
      ...WORLD,
      files: [{ path: 'src/components/ascnd/koa/koa-blink.tsx', src: 'const X = { damping: 6, stiffness: 300 };' }],
    }).some((p) => /quá trần/.test(p))
  ) {
    fail('rig nhân vật đáng lẽ được miễn');
  }

  /* Luật 3 và 4 */
  broken(
    'LIFT quay về hai số gõ tay',
    { drag: WORLD.drag.replace(/const LIFT = spring\([^)]*\);/, 'const LIFT = { damping: 18, stiffness: 260 };') },
    /`LIFT` không còn viết bằng/,
  );
  broken(
    'khe trống nhường chỗ lại nảy',
    { drag: WORLD.drag.replace('const GAP_SPRING = spring(0.46, BOUNCE.smooth);', 'const GAP_SPRING = spring(0.46, BOUNCE.snappy);') },
    /nhường chỗ dùng/,
  );
  broken(
    'cụm nút chế độ sắp xếp quay về số gõ tay',
    { today: WORLD.today.replace(/withSpring\(1, spring\([\d.]+, BOUNCE\.\w+\)\)/, 'withSpring(1, { damping: 22, stiffness: 240 })') },
    /không còn trượt vào bằng/,
  );
}

if (problems.length) {
  console.error('mô hình lò xo CÓ LỖI:\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}

const shapes = ['LIFT', 'GAP_SPRING', 'RELEASE'].map((n) => {
  const m = new RegExp(`const ${n} = spring\\(([\\d.]+), BOUNCE\\.(\\w+)\\);`).exec(WORLD.drag);
  return `${n} ${m?.[2]}`;
});

console.log(
  'mô hình lò xo OK — `spring(duration, bounce)` được TRÍCH ra khỏi mã thật và chạy trên 36 tổ hợp, so ' +
    'với định nghĩa vật lý gốc dựng độc lập (ζ = 1 − bounce, damping = 2ζ√(k·m)) chứ không so với lời kể: ' +
    'công thức damping trên slide WWDC23 SAI và đã được Apple đính chính, nên một bản chép từ slide sẽ đỏ ' +
    `ở đây — đã chứng minh bằng cách chạy thử chính bản sai ấy. Ba lò xo của trình sắp xếp (${shapes.join(', ')}) ` +
    'viết bằng thang ấy chứ không bằng số gõ tay: bản trước là `{damping:18, stiffness:260}`, quy ra bounce ' +
    '0,44 — nảy hơn cả `.bouncy`, mức nảy nhất iOS ship — và nó chạy ở bốn chỗ trong một cử chỉ. Thứ NHƯỜNG ' +
    'CHỖ buộc phải là `smooth`: tắt dần tới hạn, không vượt quá ô rồi bò ngược lại. Không lò xo giao diện ' +
    `nào trong ${files.length} tệp src vượt trần ${MAX_BOUNCE}; rig nhân vật được miễn vì nó là diễn xuất. ` +
    'Và cụm nút của chế độ sắp xếp trượt vào bằng chính thang ấy thay vì bounce 0,29 — ở translateX 28 điểm thì cái nảy đó đưa nó vượt qua chỗ của mình 8 điểm rồi kéo ngược lại. Hiệu ứng cấp TRANG cố ý không có: `drag-reorder.mjs` đã ghi lại quyết định của người dùng rằng mờ cả trang đọc ra như trang vừa được tải lại',
);
