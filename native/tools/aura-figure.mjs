/**
 * The background must stay a background.
 *
 * ── what changed, and what it put at risk ──
 *
 * The assistant screens' backdrop used to be four planes of drifting specks.
 * Two of them were replaced by a picture of a body, and a body is not a speck:
 * it is the one shape a person's eye finds before it finds anything else on a
 * screen. `assistant-aura.tsx` has said from its first version that anything
 * back there bright enough to be looked at will win against the numbers in
 * front of it. Putting a figure there is the strongest test that claim has had.
 *
 * ── and the failure that would not look like a failure ──
 *
 * The artwork is a glow on **black**, exported with alpha. Re-export it without
 * the alpha channel — a different tool, a "flatten" checkbox, a jpeg round-trip
 * — and nothing breaks. There is no error. The screen simply gains a black
 * rectangle with straight edges down its sides, because `#000` is not
 * `#070708`, sitting over the cards. It ships.
 *
 * So the rules below are about the *shape* of that: an asset whose background
 * came back, an asset nobody compressed, a layer brighter than the thing it is
 * a background for, and an animation nobody stopped.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const Jimp = require('jimp-compact');
const problems = [];

const AURA = path.join(NATIVE, 'src/components/ascnd/assistant-aura.tsx');
const PNG = path.join(NATIVE, 'assets/aura/figure.png');
const src = readFileSync(AURA, 'utf8');
/* Comments stripped before any rule reads the file: a rule about what the code
   does must not be satisfiable by prose describing it. */
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const num = (re, what) => {
  const m = code.match(re);
  if (!m) {
    problems.push(`không đọc được ${what} (${re}) — bộ quét hỏng, không phải code sạch`);
    return null;
  }
  return Number(m[1]);
};

/* ── 1. the asset still has its background removed ── */
{
  let img = null;
  try {
    img = await new Promise((res, rej) => Jimp.read(PNG, (e, i) => (e ? rej(e) : res(i))));
  } catch (e) {
    problems.push(`không đọc được ${path.relative(NATIVE, PNG)}: ${e.message}`);
  }
  if (img) {
    const W = img.bitmap.width;
    const H = img.bitmap.height;
    const corners = [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]].map(([x, y]) =>
      Jimp.intToRGBA(img.getPixelColor(x, y)),
    );
    const opaqueCorners = corners.filter((c) => c.a > 8).length;
    if (opaqueCorners > 0) {
      problems.push(
        `${opaqueCorners}/4 góc của figure.png còn ĐỤC — nền chưa được khử, hoặc file đã bị xuất lại ` +
          'không có kênh alpha. Không có ngoại lệ nào ném ra và app vẫn chạy: màn hình chỉ đơn giản ' +
          `có thêm một hình chữ nhật đen viền thẳng nằm đè lên các thẻ, vì #000 không phải nền app`,
      );
    }

    /* …and it is still a picture, not an empty canvas. The mirror failure: a key
       applied twice, or applied to an already-keyed file, erases everything and
       leaves four transparent corners that pass the test above. */
    let visible = 0;
    const d = img.bitmap.data;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) visible++;
    const pct = (visible / (W * H)) * 100;
    if (pct < 5) {
      problems.push(
        `chỉ ${pct.toFixed(1)}% điểm ảnh của figure.png còn nhìn thấy được — ảnh gần như trống. Bốn góc ` +
          'trong suốt là điều kiện CẦN, không phải đủ: một phép khử nền chạy hai lần cũng cho bốn góc ' +
          'trong suốt, trên một tấm ảnh không còn gì',
      );
    }

    /* Wide enough to survive being drawn at ~1047px on a 3× screen. Below this
       the particle texture — the whole character of the artwork — smears. */
    if (W < 512) {
      problems.push(
        `figure.png chỉ rộng ${W}px. Hình vẽ ra ~349pt, tức 1047px trên màn 3×, và dưới 512 thì kết cấu ` +
          'hạt nát thành một vệt mờ — đó không phải "nhẹ hơn một chút", đó là bức tranh thôi được làm ' +
          'bằng hạt',
      );
    }

    const bytes = statSync(PNG).size;
    const MAX = 420 * 1024;
    if (bytes > MAX) {
      problems.push(
        `figure.png nặng ${(bytes / 1024).toFixed(0)} KB > ${MAX / 1024} KB — nhiều khả năng ảnh gốc bị ` +
          'thả thẳng vào mà chưa chạy tools/make-aura-figure.mjs (bản gốc là 2074 KB)',
      );
    }
  }
}

/* ── 2. the figure is dimmer than the specks it replaced ── */
{
  const peak = num(/const FIGURE_PEAK = ([\d.]+)/, 'FIGURE_PEAK');
  /* The brightest plane that used to exist, from the file's own history. Not a
     number typed here twice: the point is that a *body* at a speck's opacity is
     not a speck's worth of presence, so it has to sit under the old maximum. */
  const OLD_BRIGHTEST = 0.19;
  if (peak != null && !(peak > 0 && peak <= OLD_BRIGHTEST)) {
    problems.push(
      `FIGURE_PEAK = ${peak}, phải nằm trong (0, ${OLD_BRIGHTEST}]. Một hình NGƯỜI dễ đọc hơn một đốm ` +
        'bụi rất nhiều, nên để nó ngang mức đốm sáng nhất từng có là đã sáng hơn thứ nó thay thế. ' +
        'Chú thích lâu đời nhất của file này: thứ gì phía sau đủ sáng để được NHÌN thì sẽ thắng các con số',
    );
  }

  /* And it must not be the brightest thing back there at all. */
  const dust = [...code.matchAll(/opacity: ([\d.]+), count:/g)].map((m) => Number(m[1]));
  if (dust.length !== 2) {
    problems.push(`đếm được ${dust.length} lớp bụi, chờ 2 — bộ quét hỏng hoặc các lớp đã đổi hình dạng`);
  } else {
    const [far, haze] = dust;
    /* The 1.5× spacing IS the depth. Dim the two planes by different factors and
       they stop being two planes and become one flat sheet of specks — the
       failure the layering exists to prevent, and the file says so. */
    const ratio = far / haze;
    if (!(ratio > 1.2 && ratio < 1.9)) {
      problems.push(
        `hai lớp bụi còn lại lệch nhau ${ratio.toFixed(2)}× (chờ ~1.5×) — khoảng cách giữa các lớp CHÍNH ` +
          'LÀ chiều sâu; dim lệch nhau thì hai mặt phẳng sập thành một tấm phẳng',
      );
    }
  }
}

/* ── 3. it is inside the faded group, and the fade comes last ── */
{
  /*
    ── khớp NGOẶC, không dùng regex lười ──

    Bản trước là `/\{box \? \([\s\S]*?\) : null\}/`. Cái `*?` dừng ở dấu
    `) : null}` ĐẦU TIÊN nó gặp — và từ lúc `AuraFigure` cùng các lớp bụi được
    bọc trong một nhánh `{m.lit ? ( … ) : null}` của riêng chúng, dấu ấy nằm
    NGAY GIỮA nhóm. Bộ quét cắt nhóm làm đôi rồi báo "không còn lớp EdgeFade"
    cho một lớp vẫn nằm nguyên tại chỗ.

    Một nhóm JSX lồng nhau thì phải đếm ngoặc mới đọc được. Đây là cùng bài học
    mà `frozen-surface.mjs` đã ghi cho ngoặc nhọn.
  */
  const open = code.indexOf('{box ? (');
  let group = null;
  if (open >= 0) {
    let depth = 0;
    for (let i = code.indexOf('(', open); i < code.length; i++) {
      if (code[i] === '(') depth++;
      else if (code[i] === ')') {
        depth--;
        if (!depth) {
          group = code.slice(open, i + 1);
          break;
        }
      }
    }
  }
  if (!group) {
    problems.push('không tìm thấy nhóm được làm mờ mép — bộ quét hỏng');
  } else {
    const g = group;
    if (!/<AuraFigure\b/.test(g)) {
      problems.push(
        'AuraFigure nằm NGOÀI nhóm được làm mờ mép — nó sẽ kết thúc ở đúng nơi cái hộp của nó kết ' +
          'thúc, tức một đường ngang thẳng băng cắt qua một bức tranh mà mọi thứ khác đều mờ dần. ' +
          'Đây đúng là lỗi mà lớp mờ đã được thêm vào để sửa cho phần bụi',
      );
    }
    if (!/<EdgeFade \/>/.test(g)) {
      problems.push('nhóm không còn lớp EdgeFade — hình và bụi sẽ cắt ngang ở mép hộp');
    } else if (g.lastIndexOf('<EdgeFade') < g.lastIndexOf('<AuraFigure')) {
      problems.push(
        'EdgeFade được vẽ TRƯỚC AuraFigure — nó là một lớp PHỦ màu nền, nên phải nằm cuối cùng để ' +
          'phủ lên thứ nó cần làm mờ; vẽ trước thì nó bị hình đè lên và không làm gì cả',
      );
    }
  }

  /*
    ── and the mask must not come back ──

    `@react-native-masked-view/masked-view` ships a web build that is one line:
    it drops `children` and renders the MASK. So on web this layer was not
    dimmed at its edges, it was not drawn at all, and the mask's own white
    gradient became a white block on a near-black screen.

    That is bad on its own, and it is worse for this project than for most: the
    only tool that looks at these screens is a headless browser, so a layer
    rendered through `MaskedView` is a layer nothing can check. This rule exists
    because the obvious future edit — "the fade should really be a mask" — is
    correct on iOS and silently blinds the harness.
  */
  if (/MaskedView/.test(code)) {
    problems.push(
      'assistant-aura.tsx dùng lại MaskedView. Bản web của thư viện đó vứt bỏ children và render ' +
        'CHÍNH cái mặt nạ, nên lớp này vừa biến mất khỏi web vừa để lại một khối trắng — và live.mjs, ' +
        'thứ duy nhất nhìn được các màn này, sẽ không kiểm được gì ở đây nữa',
    );
  }
}

/* ── 3b. no svg id is a literal ──

   Two auras are alive at the same moment: the coach screen is pushed over the
   assistant tab and each mounts one. On web an svg `id` belongs to the whole
   document, so a constant id means two definitions of one name and the one
   registered last wins for both screens.

   Mostly that is invisible, because the copies are identical — except for the
   `auraState` pool, which is recoloured by today's **readiness**. The two
   screens read that from different places, so when they disagree one screen
   paints the other's verdict about somebody's recovery.

   `status-scrim.tsx` already carries this fix and this note: *"This has caught
   the app three times; `useId` is the rule."* The rule is written here as
   *shape* — a literal string in an `id` prop — rather than as a list of names,
   because the next gradient somebody adds will be added the way the last four
   were. */
{
  const literals = [...code.matchAll(/\bid=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\}|\{"([^"]*)"\})/g)]
    .map((m) => ({ raw: m[0], value: m[1] ?? m[2] ?? m[3] ?? m[4] ?? '' }))
    /* A template literal is fine as long as something in it varies per mount. */
    .filter((m) => !/\$\{/.test(m.value));
  for (const m of literals) {
    problems.push(
      `assistant-aura.tsx có id SVG viết cứng: ${m.raw} — hai màn trợ lý cùng gắn một aura, và trên ` +
        'web id là toàn cục cho cả tài liệu, nên hai định nghĩa trùng tên tranh nhau và cái đăng ký ' +
        'sau thắng cho cả hai. Với pool auraState — thứ đổi màu theo ĐỘ SẴN SÀNG hôm nay — đó là màn ' +
        'này vẽ kết luận của màn kia về sự phục hồi của người dùng. Dùng useId() như status-scrim.tsx',
    );
  }
  /* And the ids that do vary must vary by `useId`, not by something that
     happens to differ today. */
  const uses = [...code.matchAll(/useId\(\)/g)].length;
  const svgs = [...code.matchAll(/<(?:RadialGradient|SvgLinearGradient|LinearGradient)\b/g)].length;
  if (svgs > 0 && uses === 0) {
    problems.push('assistant-aura.tsx định nghĩa gradient SVG nhưng không gọi useId() ở đâu cả');
  }
}

/* ── 4. and the animation stops when nobody is looking ── */
{
  const body = code.match(/function AuraFigure\([\s\S]*?\n}/);
  if (!body) {
    problems.push('không tìm thấy AuraFigure — bộ quét hỏng');
  } else {
    if (!/if \(!moving\)[\s\S]{0,80}cancelAnimation/.test(body[0])) {
      problems.push(
        'AuraFigure không dừng khi `moving` là false. Cả hai màn trợ lý đều gắn một aura, và trước đây ' +
          'các hoạt hoạ ở đây chạy tiếp suốt đời app trên MỌI tab khác — mở coach đè lên assistant là ' +
          'mười sáu hoạt hoạ cùng lúc',
      );
    }
    if (!/<AuraFigure moving=\{moving\}/.test(code)) {
      problems.push('AuraFigure không được truyền `moving` — cổng dừng có tồn tại nhưng không ai bật nó');
    }
    /* Reduce Motion reaches it through the same `moving` both dust and pools
       use, so there is nothing separate to check — but there IS something to
       check about what is animated. */
    if (/<Image[^>]*\bstyle=\{\[/.test(body[0])) {
      problems.push(
        'style của <Image> trong AuraFigure là một mảng động — prop của ảnh đổi mỗi khung hình sẽ buộc ' +
          'raster lại cả lớp, đúng thứ mà cả file này được viết để tránh',
      );
    }
  }
}

/* ── 5. tsc has to be able to find the file the screen requires ── */
{
  const req = src.match(/require\('([^']*figure[^']*\.png)'\)/);
  if (!req) {
    problems.push('không tìm thấy require(...figure.png) trong assistant-aura.tsx');
  } else {
    const resolved = path.resolve(path.dirname(AURA), req[1]);
    try {
      statSync(resolved);
    } catch {
      problems.push(`assistant-aura.tsx require '${req[1]}' nhưng file đó không tồn tại`);
    }
  }
}

if (problems.length) {
  console.log('hình nền trợ lý CÓ LỖI:\n');
  for (const p of problems.slice(0, 12)) console.log(`  • ${p}`);
  if (problems.length > 12) console.log(`  … và ${problems.length - 12} lỗi nữa`);
  process.exit(1);
}

const bytes = statSync(PNG).size;
console.log(
  `hình nền trợ lý OK — figure.png còn alpha thật (4/4 góc trong suốt) và VẪN là một bức tranh, không ` +
    `phải khung trống; rộng ≥ 512 nên kết cấu hạt sống được ở tỉ lệ 1047px của màn 3×; ${(bytes / 1024).toFixed(0)} KB ` +
    'dưới trần chặn hồi quy (ảnh gốc 2074 KB). Hình mờ hơn lớp bụi sáng nhất từng có (0.19) — một hình ' +
    'NGƯỜI ở cùng mức opacity với một đốm bụi thì không phải cùng mức hiện diện; hai lớp bụi còn lại ' +
    'giữ khoảng cách ~1.5× nên vẫn là hai mặt phẳng chứ không phải một tấm. Hình nằm TRONG MaskedView ' +
    'nên tan dần ở trên dưới thay vì cắt ngang một đường thẳng, không id SVG nào viết cứng (hai màn ' +
    'cùng gắn aura, id trùng thì màn này vẽ kết luận sức khoẻ của màn kia), hoạt hoạ dừng theo `moving` (ngoài màn ' +
    'hoặc Reduce Motion), và prop của <Image> không đổi sau khi mount',
);
