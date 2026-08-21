/**
 * The icons, checked against the rules that only bite after you ship.
 *
 * ── why this file exists ──
 *
 * Nothing in an app tells you its icon is wrong. It is not imported, nothing
 * renders it, no screen can be opened to look at it, and every build succeeds
 * whatever is in the file. The feedback arrives from App Store Connect, or from
 * somebody's home screen.
 *
 * Two of these are genuinely invisible until then:
 *
 * **An alpha channel on the iOS icon.** Apple rejects it at submission. Not at
 * build, not at install — at the moment you are trying to release. Any tool
 * that re-exports the png can add one back without saying so.
 *
 * **Rounded corners baked into the artwork.** The source artwork *is* a rounded
 * square on a white page, and iOS applies its own mask on top. Ship it unfilled
 * and the corners get rounded twice, leaving four pale slivers around the mask.
 * It looks like a rendering bug and it is in the file.
 *
 * And one that breaks only on other people's phones: Android's adaptive icon
 * safe zone is a **circle**, so artwork that fits the frame's width can still
 * have its corners shaved by the stock Pixel launcher — which masks to a
 * circle — while looking perfect on the squircle launcher you happen to own.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const Jimp = require('jimp-compact');
const problems = [];

const app = JSON.parse(readFileSync(path.join(NATIVE, 'app.json'), 'utf8')).expo;
const read = (rel) => new Promise((res, rej) => Jimp.read(path.join(NATIVE, rel), (e, i) => (e ? rej(e) : res(i))));
const rgba = (img, x, y) => Jimp.intToRGBA(img.getPixelColor(x, y));

/* ── 1. every asset path in app.json points at a file that exists ──

   A dead path surfaces at build time on somebody else's machine, or worse, as a
   silently-default icon. */
const declared = [
  ['icon', app.icon],
  ['android.adaptiveIcon.foregroundImage', app.android?.adaptiveIcon?.foregroundImage],
  ['android.adaptiveIcon.backgroundImage', app.android?.adaptiveIcon?.backgroundImage],
  ['android.adaptiveIcon.monochromeImage', app.android?.adaptiveIcon?.monochromeImage],
  ['web.favicon', app.web?.favicon],
  ['splash image', app.plugins?.find((p) => Array.isArray(p) && p[0] === 'expo-splash-screen')?.[1]?.image],
].filter(([, v]) => typeof v === 'string');

for (const [field, rel] of declared) {
  if (!existsSync(path.join(NATIVE, rel))) {
    problems.push(`app.json khai ${field} = '${rel}' nhưng file đó không tồn tại`);
  }
}

/* ── 2. the iOS icon: square, full-bleed, and carrying no alpha at all ── */
let iconBg = null;
if (existsSync(path.join(NATIVE, app.icon))) {
  const icon = await read(app.icon);
  const W = icon.bitmap.width;
  const H = icon.bitmap.height;

  if (W !== H) {
    problems.push(`icon.png là ${W}×${H}, không vuông — tài liệu Expo nói "exactly square"`);
  }
  if (W < 1024) {
    problems.push(`icon.png chỉ ${W}px, Expo khuyến nghị 1024×1024`);
  }

  /*
    Read from the file's own header, not from the decoder.

    The first version of this asked `icon.hasAlpha()`, which reads nothing of
    the sort: measured on two files written from the same bitmap as colourType 2
    and colourType 6, it returned **false for both**. Jimp keeps every image as
    RGBA in memory, so the question "does this file carry an alpha channel"
    simply is not one the object can answer — and the rule was green against the
    exact export it existed to catch.

    A png's IHDR puts the colour type at byte 25: 0 grey, 2 RGB, 3 palette,
    4 grey+alpha, 6 RGBA. That is the fact App Store Connect looks at, so it is
    the fact checked here. `tRNS` is included because a palette image can carry
    transparency without the colour type saying so.
  */
  const raw = readFileSync(path.join(NATIVE, app.icon));
  const colourType = raw[25];
  const hasTRNS = raw.includes(Buffer.from('tRNS'));
  if (colourType === 4 || colourType === 6 || hasTRNS) {
    problems.push(
      `icon.png CÓ kênh alpha (IHDR colour type ${colourType}${hasTRNS ? ' + chunk tRNS' : ''}). ` +
        'App Store Connect từ chối icon có alpha — và nó từ chối lúc NỘP, không phải lúc build, nên ' +
        'mọi bản build vẫn xanh cho tới đúng lúc bạn định phát hành. Phải xuất bằng colorType(2)',
    );
  }
  let clear = 0;
  const d = icon.bitmap.data;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] < 255) clear++;
  if (clear > 0) {
    problems.push(`icon.png có ${clear} điểm ảnh không đục hoàn toàn — icon phải lấp kín ô vuông`);
  }

  /*
    The corners must be the background, not paper.

    This is the fault the whole fill step exists for: the artwork arrives as a
    rounded square on white, iOS rounds it a second time, and the leftover white
    shows around the mask. Compared against the icon's own centre-top rather
    than against a colour typed here, so it keeps working when the brand colour
    changes.
  */
  /*
    The background colour as the MEDIAN of the whole icon, not a sampled pixel.

    The first version read one pixel at top-centre, which is the background in
    this artwork and is not a property of artwork in general — a mark that
    reaches the top edge would have made every comparison below run against the
    logo's own colour, and the rule would have reported nonsense while looking
    like it worked. The background covers 86% of the frame, so the median simply
    is it, whatever the artwork does.
  */
  iconBg = (() => {
    const rs = [];
    const gs = [];
    const bs = [];
    const px = icon.bitmap.data;
    /* Every 16th pixel: the median of a large uniform field does not need all
       million of them, and this keeps the step quick. */
    for (let i = 0; i < px.length; i += 4 * 16) {
      rs.push(px[i]);
      gs.push(px[i + 1]);
      bs.push(px[i + 2]);
    }
    const mid = (a) => a.sort((x, y) => x - y)[a.length >> 1];
    return { r: mid(rs), g: mid(gs), b: mid(bs) };
  })();
  for (const [name, x, y] of [
    ['trên-trái', 2, 2],
    ['trên-phải', W - 3, 2],
    ['dưới-trái', 2, H - 3],
    ['dưới-phải', W - 3, H - 3],
  ]) {
    const c = rgba(icon, x, y);
    const diff = Math.max(Math.abs(c.r - iconBg.r), Math.abs(c.g - iconBg.g), Math.abs(c.b - iconBg.b));
    if (diff > 12) {
      problems.push(
        `góc ${name} của icon.png là rgb(${c.r},${c.g},${c.b}) trong khi nền icon là ` +
          `rgb(${iconBg.r},${iconBg.g},${iconBg.b}) — góc bo của ảnh gốc chưa được tô. iOS sẽ bo góc ` +
          'LẦN THỨ HAI lên một ảnh đã bo sẵn, để lại bốn mẩu sáng thò ra quanh mặt nạ',
      );
    }
  }
}

/* ── 3. the Android background colour is the icon's own ── */
{
  const hex = app.android?.adaptiveIcon?.backgroundColor;
  if (!hex) {
    problems.push('android.adaptiveIcon.backgroundColor không được khai — mặc định của Expo là TRẮNG');
  } else if (iconBg) {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (!m) {
      problems.push(`backgroundColor '${hex}' không phải mã hex 6 ký tự`);
    } else {
      const [r, g, b] = m.slice(1).map((v) => parseInt(v, 16));
      const diff = Math.max(Math.abs(r - iconBg.r), Math.abs(g - iconBg.g), Math.abs(b - iconBg.b));
      if (diff > 12) {
        problems.push(
          `adaptiveIcon.backgroundColor là ${hex} nhưng nền của chính icon.png là ` +
            `rgb(${iconBg.r},${iconBg.g},${iconBg.b}) — lệch nhau là hai icon khác nhau trên hai nền ` +
            'tảng. Màu này được ĐỌC TỪ ẢNH chứ không gõ lại, nên đổi artwork thì bước kiểm sẽ bắt',
        );
      }
    }
  }
}

/* ── 4. the splash mark is a mark, not a filled square ── */
{
  const rel = app.plugins?.find((p) => Array.isArray(p) && p[0] === 'expo-splash-screen')?.[1]?.image;
  if (rel && existsSync(path.join(NATIVE, rel))) {
    const sp = await read(rel);
    const d = sp.bitmap.data;
    const n = d.length / 4;
    let clear = 0;
    let ghost = 0;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3];
      if (a < 8) clear++;
      /* A background that was keyed by raw luminance keeps ~6% alpha — invisible
         one pixel at a time and a full ghost square once it covers the frame. */
      else if (a < 40) ghost++;
    }
    const spRaw = readFileSync(path.join(NATIVE, rel));
    if (spRaw[25] !== 6 && spRaw[25] !== 4) {
      problems.push('ảnh splash KHÔNG có kênh alpha — nó phải nổi trên nền splash, không phải một khối');
    }
    if (clear / n < 0.4) {
      problems.push(
        `ảnh splash chỉ ${((clear / n) * 100).toFixed(0)}% trong suốt — nó phải là dấu hiệu nổi trên ` +
          'nền splash, không phải một khối đặc. Một khối đặc sẽ hiện thành hình chữ nhật trên nền #08080a',
      );
    }
    if (ghost / n > 0.25) {
      problems.push(
        `ảnh splash có ${((ghost / n) * 100).toFixed(0)}% điểm ảnh mờ (alpha 8–40) — dấu hiệu bị tách ` +
          'bằng độ sáng THÔ, nên nền icon giữ lại ~6% alpha và cả hình vuông hiện thành một bóng ma',
      );
    }
  }
}

/* ── 5. the Android layers survive a circular mask ── */
for (const key of ['foregroundImage', 'monochromeImage']) {
  const rel = app.android?.adaptiveIcon?.[key];
  if (!rel || !existsSync(path.join(NATIVE, rel))) continue;
  const img = await read(rel);
  const S = img.bitmap.width;
  const d = img.bitmap.data;
  const c = (S - 1) / 2;
  let worst = 0;
  for (let y = 0; y < img.bitmap.height; y++) {
    for (let x = 0; x < S; x++) {
      if (d[(y * S + x) * 4 + 3] > 128) {
        const r = Math.hypot(x - c, y - c);
        if (r > worst) worst = r;
      }
    }
  }
  /* 108dp canvas, 72dp guaranteed — and that 72 is a DIAMETER. */
  const limit = (S * (2 / 3)) / 2;
  if (worst > limit) {
    problems.push(
      `${key}: điểm xa tâm nhất là ${worst.toFixed(0)}px, quá giới hạn ${limit.toFixed(0)}px của vùng ` +
        'an toàn. Vùng an toàn của adaptive icon là một HÌNH TRÒN đường kính 66.6%, không phải hình ' +
        'vuông — artwork rộng lọt bài kiểm theo bề ngang vẫn bị launcher mặt nạ tròn (mặc định của ' +
        'Pixel) gọt mất góc, trong khi máy dùng squircle của bạn nhìn vẫn hoàn hảo',
    );
  }
  if (worst === 0) {
    problems.push(`${key} rỗng — không có điểm ảnh nào đục`);
  }
}

if (problems.length) {
  console.log('icon app CÓ LỖI:\n');
  for (const p of problems.slice(0, 12)) console.log(`  • ${p}`);
  if (problems.length > 12) console.log(`  … và ${problems.length - 12} lỗi nữa`);
  process.exit(1);
}

console.log(
  `icon app OK — ${declared.length} đường dẫn asset trong app.json đều có file thật; icon vuông ≥1024, ` +
    'lấp kín ô vuông và KHÔNG mang kênh alpha (App Store từ chối alpha ở khâu NỘP, sau khi mọi bản ' +
    'build đã xanh); bốn góc icon cùng màu với nền icon nên iOS không bo góc lần thứ hai lên một ảnh ' +
    'đã bo sẵn; màu nền Android được ĐỌC TỪ chính icon.png chứ không gõ lại, nên artwork đổi màu thì ' +
    'bước này bắt; ảnh splash là dấu hiệu trên nền trong suốt chứ không phải khối đặc, và không mang ' +
    'lớp alpha ~6% biến cả hình vuông thành bóng ma; và hai lớp Android nằm trong vùng an toàn tính ' +
    'theo BÁN KÍNH — vùng ấy là hình tròn, nên artwork rộng lọt bài kiểm bề ngang vẫn bị launcher ' +
    'mặt nạ tròn gọt góc',
);
