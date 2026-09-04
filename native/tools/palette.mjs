/**
 * Hai bảng màu, và mọi thứ khiến bản sáng không phải một phép đổi mã màu.
 *
 * ── phép đo đã lái cả thiết kế này ──
 *
 * Trước khi có bản sáng, đo 26 token của bản tối trên một nền giấy: chúng nằm
 * giữa 1,10:1 và 3,64:1. KHÔNG cái nào tới sàn 4,5:1 của chữ. Đó là lý do bản
 * sáng là một bảng THỨ HAI được dẫn ra, không phải bảng cũ hạ độ sáng.
 *
 * Bước này chạy lại đúng phép đo ấy trên CẢ HAI bảng, mỗi lần. Một token mới
 * thêm vào, hoặc một mã màu ai đó chỉnh cho "trông đẹp hơn", sẽ đỏ ở đây chứ
 * không đỏ trên điện thoại của người dùng.
 *
 * ── parity thì KHÔNG kiểm ở đây, và đó là chủ ý ──
 *
 * `Palette` trong `constants/theme.ts` là ánh xạ trên `keyof typeof colors`,
 * nên thiếu một token là lỗi BIÊN DỊCH. Viết thêm một luật parity ở đây là dựng
 * cái lưới thứ hai dưới một cái lưới không có lỗ — và cái thứ hai sẽ là cái
 * người ta tin, rồi ai đó nới nó.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { inCode } from './lib/code-mask.mjs';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(NATIVE, p), 'utf8');
const problems = [];

/* Bảng màu được BIÊN DỊCH ra rồi import, không dò bằng regex: một mã màu viết
   trong chú thích hay một token dẫn từ token khác đều sẽ làm phép dò sai, còn
   giá trị thật thì không. Cùng cách `tools/plausible.mjs` lấy BOUNDS. */
const out = mkdtempSync(path.join(tmpdir(), 'palette-'));
execFileSync(
  'npx',
  ['tsc', 'src/constants/palette.ts', '--ignoreConfig', '--outDir', out,
   '--module', 'esnext', '--target', 'es2020', '--moduleResolution', 'bundler', '--skipLibCheck',
  ],
  { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
);
const { palettes, materials, alpha } = await import(
  pathToFileURL(path.join(out, 'palette.js')).href
);

const lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
function lum(hex) {
  const h = hex.replace('#', '');
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map(lin);
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const r2 = (v) => Math.round(v * 100) / 100;

/**
 * Ngưỡng theo VIỆC token làm, không một con số chung.
 *
 * `text` là thứ có người đọc chữ trên nó → 4,5:1. `graphic` là vòng, thanh,
 * nét icon → 3:1, đúng sàn WCAG cho đồ hoạ phi văn bản. Xếp một token đồ hoạ
 * vào nhóm chữ sẽ đòi nó tối hơn mức cần và làm bản tối xấu đi; xếp ngược lại
 * là để chữ 4pt xám nhạt lọt qua.
 */
const ROLE = {
  foreground: 'text',
  /* Nhận diện: nó xuất hiện dưới dạng CHỮ (dấu thương hiệu, nhãn tab đang
     chọn), nên sàn của nó là sàn chữ chứ không phải sàn đồ hoạ. */
  brand: 'text',
  mutedForeground: 'text',
  secondaryForeground: 'text',
  glassMuted: 'text',
  primary: 'text',
  champagne: 'text',
  goldLight: 'text',
  destructive: 'text',
  readinessGreen: 'text',
  readinessYellow: 'text',
  readinessRed: 'text',
  metricBlue: 'text',
  metricPurple: 'text',
  metricCyan: 'text',
  metricOrange: 'text',
  metricRose: 'text',
  /* Chỉ là đường trên biểu đồ cân nặng — không có chữ nào mang màu này. */
  metricBeige: 'graphic',
};
const FLOOR = { text: 4.5, graphic: 3 };

/** Bề mặt — không phải màu để đọc chữ, nên chúng có luật riêng bên dưới. */
const SURFACES = ['background', 'card', 'secondary', 'muted', 'accent', 'border', 'input', 'ringTrack'];

export function checkPalette(name, p) {
  const bad = [];
  /* Mỗi token nội dung phải đọc được trên CẢ nền trang LẪN mặt thẻ: một màu
     đạt trên nền mà trượt trên thẻ sẽ hỏng ở đúng nơi mọi con số sống. */
  for (const [token, role] of Object.entries(ROLE)) {
    if (token === 'glassMuted') continue; // nền của nó là mặt kính, xét riêng
    const floor = FLOOR[role];
    for (const [where, ground] of [['nền', p.background], ['thẻ', p.card]]) {
      const cr = contrast(p[token], ground);
      if (cr < floor) {
        bad.push(`${name}.${token} ${p[token]} trên ${where} ${ground}: ${r2(cr)}:1, dưới sàn ${floor}:1 (${role})`);
      }
    }
  }
  /* Chữ trên nút chính — cặp này lật hoàn toàn giữa hai theme, nên nó là chỗ
     dễ sai nhất và không được kiểm bằng mắt. */
  const btn = contrast(p.primaryForeground, p.primary);
  if (btn < 4.5) bad.push(`${name}: chữ trên nút chính chỉ ${r2(btn)}:1 (${p.primaryForeground} trên ${p.primary})`);

  /* THỨ TỰ prominence phải giống nhau ở hai theme.
     Mắt học "đậm hơn = quan trọng hơn" ở bản tối; đảo nó ở bản sáng là bắt
     học lại một thứ đã học. */
  const order = ['foreground', 'secondaryForeground', 'mutedForeground'];
  const crs = order.map((t) => contrast(p[t], p.card));
  for (let i = 1; i < crs.length; i++) {
    if (crs[i] >= crs[i - 1]) {
      bad.push(
        `${name}: ${order[i]} (${r2(crs[i])}:1) không mờ hơn ${order[i - 1]} (${r2(crs[i - 1])}:1) — ` +
          'thứ tự nổi bật của chữ bị đảo so với theme kia',
      );
    }
  }

  /* Bề mặt phải PHÂN BIỆT được với nhau: hai tầng cùng một màu là một tầng. */
  const seen = new Map();
  for (const s of SURFACES) {
    const prev = seen.get(p[s]);
    if (prev) bad.push(`${name}: bề mặt \`${prev}\` và \`${s}\` cùng một màu ${p[s]} — một tầng biến mất`);
    seen.set(p[s], s);
  }

  /* Hai token NHẬN DIỆN không được rơi vào cùng một màu: hạ máy móc cả hai từ
     bản tối cho ra #6c6f79 và #6d6f76, và bản sáng phải tách chúng ra. */
  if (p.champagne === p.goldLight) {
    bad.push(`${name}: champagne và goldLight cùng một màu ${p.champagne} — mất một bậc của dải nhận diện`);
  }
  return bad;
}

/** Chất liệu: bản tối KHÔNG được có bóng đổ, bản sáng PHẢI có. */
export function checkMaterial(name, m) {
  const bad = [];
  /*
    CẢ HAI nền tảng, không phải "một trong hai".

    Bản đầu viết `shadowOpacity > 0 || elevation > 0`, và phép thử ngược KHÔNG
    CẮN: bỏ `shadowOpacity` về 0 mà vẫn còn `elevation: 2` thì luật im. Nhưng
    `elevation` chỉ có nghĩa trên Android; trên iPhone `shadowOpacity: 0` là
    KHÔNG có bóng, và thẻ giấy mất hẳn thứ duy nhất tách nó khỏi trang.

    Một cái lưới xanh cho một bản hỏng trên nền tảng chính của app thì không
    phải cái lưới.
  */
  const ios = m.shadow.shadowOpacity > 0 && m.shadow.shadowRadius > 0;
  const android = m.shadow.elevation > 0;
  const hasShadow = ios && android;
  if (name === 'dark' && (ios || android)) {
    bad.push(
      'dark: chất liệu có bóng đổ — `glass-card.tsx` ghi lại rằng RN vẽ bóng trên nền tối thành một VÀNH SÁNG ' +
        'cứng chứ không phải một vệt mềm, nên chiều sâu ở bản tối là gradient + viền + mép sáng',
    );
  }
  if (name === 'light' && !hasShadow) {
    bad.push(
      `light: thiếu bóng ở ${!ios ? 'iOS (shadowOpacity/shadowRadius)' : 'Android (elevation)'} — ` +
        'trên giấy, bóng LÀ thứ tách thẻ khỏi trang, và một nền tảng có một nền tảng không là hai app khác nhau',
    );
  }
  if (name === 'light' && m.lit) bad.push('light: vẫn bật mặt gradient — một dải sáng-tối 8% trên mặt trắng là một vệt bẩn');
  if (name === 'dark' && !m.lit) bad.push('dark: tắt mặt gradient — đó là toàn bộ chiều sâu của bản tối');
  if (name === 'light' && m.highlight) bad.push('light: vẫn có mép sáng trên — giấy không phát sáng');
  return bad;
}

for (const [name, p] of Object.entries(palettes)) problems.push(...checkPalette(name, p));
for (const [name, m] of Object.entries(materials)) problems.push(...checkMaterial(name, m));

/* `glassMuted` trên mặt kính của chính theme đó. Ở bản tối mặt sáng nhất đã
   được `tools/glass-legibility.mjs` đo là #5d4d47; ở bản sáng mặt kính là chính
   mặt thẻ trắng phủ lên giấy, nên xấp xỉ #fbf9f5. */
for (const [name, ground] of [['dark', '#5d4d47'], ['light', '#fbf9f5']]) {
  const cr = contrast(palettes[name].glassMuted, ground);
  if (cr < 4.5) problems.push(`${name}.glassMuted ${palettes[name].glassMuted} trên mặt kính ${ground}: ${r2(cr)}:1`);
}

/*
  ── ba trạng thái sẵn sàng phải ĐỀU NHAU về độ nổi ──

  Xanh / vàng / đỏ mã hoá ba trạng thái NGANG HÀNG: chúng nói người dùng đang ở
  đâu, không nói cái nào đáng chú ý hơn cái nào. Nếu một trong ba nổi hơn hai
  cái kia thì bảng màu đã chấm điểm trước khi người ta kịp đọc con số — và một
  ngày xấu sẽ trông êm hơn một ngày tốt chỉ vì đỏ mờ hơn vàng.

  Sàn 4,5:1 ở trên KHÔNG bắt được điều đó: ba màu đều đạt sàn mà vẫn lệch nhau
  gấp đôi. Đây là phép đo thứ hai, về QUAN HỆ giữa ba màu chứ không về từng màu.

  Chỉ áp cho bản SÁNG. Bản tối trải 14,62 (vàng) → 5,78 (đỏ) = 2,5×, tức nó
  KHÔNG đạt tính chất này — và nó đã ship như vậy. Bắt nó tuân luật bây giờ là
  đổi bản tối, đúng thứ giai đoạn này hứa không làm. Con số ấy được ghi ra ở
  đây để nó là một điều đã biết chứ không phải một điều bị bỏ sót.
*/
{
  const TRIAD = ['readinessGreen', 'readinessYellow', 'readinessRed'];
  /* 0,1 điểm tương phản: dưới ngưỡng mà mắt tách được hai màu khác sắc thành
     hai bậc. Nới rộng hơn là cho phép đúng cái thiên vị mà luật này cấm. */
  const ISO = 0.1;
  for (const ground of ['background', 'card']) {
    const crs = TRIAD.map((k) => contrast(palettes.light[k], palettes.light[ground]));
    const spread = Math.max(...crs) - Math.min(...crs);
    if (spread > ISO) {
      problems.push(
        `bộ ba sẵn sàng của bản SÁNG lệch ${r2(spread)} điểm tương phản trên \`${ground}\` ` +
          `(${TRIAD.map((k, i) => `${k} ${r2(crs[i])}`).join(', ')}) — ba trạng thái ngang hàng ` +
          `phải đọc ra ngang hàng, ngưỡng ${ISO}`,
      );
    }
  }
}

/* ── `alpha()` phải từ chối một token đã có alpha, không đoán ── */
{
  if (alpha('#ff3b5c', 0.35) !== 'rgba(255,59,92,0.35)') problems.push('alpha() tính sai trên #rrggbb');
  if (alpha('#abc', 1) !== 'rgba(170,187,204,1)') problems.push('alpha() tính sai trên #rgb');
  let threw = false;
  try { alpha('rgba(1,2,3,0.5)', 0.5); } catch { threw = true; }
  if (!threw) problems.push('alpha() nhận một màu đã có alpha — hai độ mờ nhân nhau sẽ "gần đúng" ở một theme và sai ở theme kia');
}

/* ── cấu hình native: nếu thiếu, lựa chọn "theo máy" là một nút không làm gì ── */
{
  const app = JSON.parse(read('app.json')).expo;
  if (app.userInterfaceStyle !== 'automatic') {
    problems.push(
      `app.json: userInterfaceStyle = "${app.userInterfaceStyle}" — iOS sẽ ghim app vào một theme và ` +
        '`useColorScheme()` luôn trả về đúng theme ấy, nên mục "theo máy" trong Cài đặt là một nút không làm gì',
    );
  }
  const splash = app.plugins.find((x) => Array.isArray(x) && x[0] === 'expo-splash-screen')?.[1];
  if (!splash?.dark?.image) {
    problems.push('app.json: màn chờ không có biến thể `dark` — app sẽ mở ra bằng nền sáng ngay cả ở theme tối');
  }
  for (const f of [splash?.image, splash?.dark?.image].filter(Boolean)) {
    if (!existsSync(path.join(NATIVE, f))) problems.push(`app.json: màn chờ trỏ tới ${f}, tệp không tồn tại`);
  }
}

/* ── và ĐẾM phần còn nợ, để "xong" không bị đọc thành "xong hết" ── */
const frozen = [];
function tsFiles(dir) {
  const out2 = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out2.push(...tsFiles(full));
    else if (/\.tsx?$/.test(name)) out2.push(full);
  }
  return out2;
}
for (const full of tsFiles(path.join(NATIVE, 'src'))) {
  const src = readFileSync(full, 'utf8');
  /*
    Dấu hiệu của một tệp CHƯA chuyển: stylesheet ở phạm vi module VÀ có đọc
    token. Một trong hai thứ ấy một mình thì không phải nợ.

    ── và cả hai câu hỏi đều phải hỏi về MÃ, không phải về chú thích ──

    Bản trước hỏi bằng `/\bcolors\./` trần và báo còn 3 tệp. Cả ba đều sai:
    `constants/theme.ts` và `app/_layout.tsx` DẪN LẠI hình dạng cũ trong chú
    thích để giải thích vì sao nó bị bỏ, còn `pick-row.tsx` kể lại một lỗi cũ
    mà stylesheet của nó không có lấy một màu nào.

    Một luật lỏng hơn thứ nó phải bắt không chỉ báo thừa. Nó ĐÓNG BĂNG con số:
    "còn 3" là trạng thái vĩnh viễn, nên một tệp đóng băng THẬT thứ tư sẽ trông
    y hệt như không có gì thay đổi.
  */
  if (!inCode(src, 'const styles = StyleSheet.create(')) continue;
  if (!inCode(src, 'colors.')) continue;
  frozen.push(path.relative(NATIVE, full));
}

/*
  Còn 0 tệp, nên nó thôi là một con số để đọc và thành một LUẬT.

  Suốt đợt chuyển, dòng này in ra "còn N tệp" để không ai đọc "xong bước này"
  thành "xong tất cả". Bây giờ N = 0, và một con số 0 in ra mỗi lần chạy không
  bắt được gì: tệp thứ 116 đóng băng bảng màu sẽ chỉ làm nó thành 1, và một
  dòng OK có chữ "còn 1 tệp" vẫn là một dòng OK.
*/
for (const f of frozen) {
  problems.push(
    `${f} còn \`StyleSheet.create\` ở phạm vi module đọc \`colors.\` — ` +
      'màu bị đóng băng lúc import, nên theme sáng không với tới được nó. ' +
      'Chạy `node tools/theme-migrate.mjs <tệp>`',
  );
}

if (problems.length) {
  console.log('bảng màu CÓ LỖI:\n');
  for (const p of problems.slice(0, 14)) console.log(`  • ${p}`);
  process.exit(1);
}

const litTokens = Object.keys(ROLE).length;
console.log(
  `bảng màu OK — hai bảng, ${Object.keys(palettes.dark).length} token mỗi bảng (parity do KIỂU giữ, không do luật ở đây); ` +
    `${litTokens} token nội dung đều đạt sàn trên CẢ nền lẫn thẻ của chính theme mình (4,5:1 cho chữ, 3:1 cho đồ hoạ), ` +
    'chữ trên nút chính đạt ở cả hai dù cặp ấy lật hoàn toàn, thứ tự nổi bật của ba bậc chữ giống nhau ở hai theme, ' +
    'không hai bề mặt nào trùng màu, và champagne không rơi vào cùng một xám với goldLight; ' +
    'chất liệu tối không có bóng (RN vẽ bóng trên nền tối thành vành sáng) còn chất liệu sáng phải có; ' +
    'userInterfaceStyle là automatic nên mục "theo máy" có thật, và màn chờ có cả hai biến thể; ' +
    'và không tệp nào còn đóng băng bảng màu trong một `StyleSheet.create` ở phạm vi module',
);
