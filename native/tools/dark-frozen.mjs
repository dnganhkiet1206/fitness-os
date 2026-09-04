/**
 * Bản TỐI không được đổi một ký tự nào trong suốt Giai đoạn 2.
 *
 *     node tools/dark-frozen.mjs
 *
 * ── vì sao không phải một phép `git diff` ──
 *
 * Giai đoạn 1 đã chứng minh điều này bằng cách biên dịch palette.ts ở `HEAD`
 * rồi so với bản đang sửa. Phép ấy đúng đúng MỘT lần: `HEAD` di chuyển theo
 * từng commit, nên đến commit thứ hai nó chỉ còn so bản mới với bản mới hơn —
 * một thay đổi đã lọt qua ở commit trước thì từ đó về sau không bao giờ bị bắt
 * nữa. Một cái mốc trôi theo thứ nó đo thì không phải một cái mốc.
 *
 * Nên các giá trị dưới đây được ĐÓNG BĂNG thành dữ liệu, đọc ra từ bản tối
 * đang chạy ở commit 9d04d55 (cuối Giai đoạn 1, trước mọi thay đổi Daylight).
 * Chúng không dẫn từ palette.ts, nên chúng không đổi theo palette.ts.
 *
 * ── và vì sao vẫn phải BIÊN DỊCH RỒI CHẠY ──
 *
 * Một nửa bảng sáng dẫn từ token (`alpha(lightPalette.card, 0.62)`), và bản tối
 * dùng chung `Material` với nó. Dò bằng regex sẽ đọc chữ trong chú thích và
 * không đọc được giá trị dẫn xuất. Ở đây chạy thật, so giá trị thật.
 *
 * Token MỚI thêm vào bản tối không phải là lỗi — `brand` sẽ là một trong số đó.
 * Thứ bị cấm là ĐỔI hoặc BỎ một giá trị đã có. Nên phép so là một chiều: mọi
 * khoá trong mốc phải còn đó và còn nguyên giá trị.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Bản tối tại 9d04d55 — 26 token. Đọc ra bằng cách chạy, không chép bằng mắt. */
const FROZEN_PALETTE = {
  background: '#070708',
  card: '#0e0e11',
  secondary: '#18181b',
  muted: '#161618',
  accent: '#1d1d20',
  border: '#2b2b31',
  input: '#303036',
  ringTrack: '#17171c',
  foreground: '#ededed',
  mutedForeground: '#828282',
  glassMuted: '#c8ccd4',
  secondaryForeground: '#999999',
  primary: '#a8afbd',
  primaryForeground: '#070708',
  goldLight: '#c7cad1',
  champagne: '#9fa3ad',
  destructive: '#ff3b5c',
  readinessGreen: '#2bf5a8',
  readinessYellow: '#ffd93d',
  readinessRed: '#ff3b5c',
  metricBlue: '#3ba6ff',
  metricPurple: '#b45cff',
  metricCyan: '#22e3ff',
  metricOrange: '#ff9130',
  metricRose: '#e6485c',
  metricBeige: '#ffe6bd',
};

/** Chất liệu tối tại 9d04d55 — cả bảy trường, kể cả ba giá trị lồng bên trong. */
const FROZEN_MATERIAL = {
  bg: 'rgba(255,255,255,0.06)',
  border: 'rgba(255,255,255,0.12)',
  highlight: 'rgba(255,255,255,0.08)',
  lit: true,
  borderWidth: 0.5,
  radius: 20,
  ink: '#ffffff',
  /* Vai này ra đời ở GĐ2 và không có trong `materials.dark` lúc 9d04d55 — nhưng
     giá trị của nó thì CÓ: nó là nguyên văn lớp phủ mà `hero-panel.tsx` vẽ rãnh
     HeroRing ở commit ấy. Đóng băng ở đây vì cái mốc là "bản tối RA SAO trên
     màn hình", không phải "palette.ts chứa những khoá nào". */
  ringTrack: 'rgba(255,255,255,0.08)',
  inset: { bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.12)', borderWidth: 0.5 },
  aura: {
    hair: 'rgba(255,255,255,0.035)',
    base: 'rgba(13,13,18,0.62)',
    blurTint: 'dark',
    scrim: '#000000',
  },
  shadow: {
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
};

const out = mkdtempSync(path.join(tmpdir(), 'dark-frozen-'));
execFileSync(
  'npx',
  ['tsc', 'src/constants/palette.ts', '--ignoreConfig', '--outDir', out,
   '--module', 'esnext', '--target', 'es2020', '--moduleResolution', 'bundler', '--skipLibCheck'],
  { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
);
const { palettes, materials } = await import(pathToFileURL(path.join(out, 'palette.js')).href);

const problems = [];

/** So từng lá của mốc với thứ đang chạy. Khoá THỪA ở bên chạy là hợp lệ. */
function compare(trail, frozen, live) {
  if (frozen !== null && typeof frozen === 'object') {
    if (live === null || typeof live !== 'object') {
      problems.push(`${trail}: mốc là một đối tượng, bản đang chạy là ${JSON.stringify(live)}`);
      return;
    }
    for (const k of Object.keys(frozen)) {
      if (!(k in live)) {
        problems.push(`${trail}.${k}: đã BỎ — mốc có \`${JSON.stringify(frozen[k])}\``);
        continue;
      }
      compare(`${trail}.${k}`, frozen[k], live[k]);
    }
    return;
  }
  if (frozen !== live) {
    problems.push(`${trail}\n      mốc 9d04d55: ${JSON.stringify(frozen)}\n      đang chạy:   ${JSON.stringify(live)}`);
  }
}

compare('darkPalette', FROZEN_PALETTE, palettes.dark);
compare('materials.dark', FROZEN_MATERIAL, materials.dark);

/* Bóng đổ của bản tối phải ở mọi vai: `elevation` là Android, `shadow*` là iOS,
   và chú thích của `glass-card.tsx` đã ghi vì sao bản tối KHÔNG có bóng — RN vẽ
   nó thành một vành sáng cứng. Một vai bóng mới thêm cho bản sáng mà quên đặt
   bản tối về 0 là đúng cái vành ấy quay lại, ở một chỗ chưa ai nhìn. */
for (const [role, sh] of Object.entries(materials.dark.elevation ?? {})) {
  if (sh.shadowOpacity !== 0 || sh.elevation !== 0) {
    problems.push(
      `materials.dark.elevation.${role}: bản tối phải là NO_SHADOW — ` +
        `nhận shadowOpacity=${sh.shadowOpacity}, elevation=${sh.elevation}. ` +
        'RN vẽ bóng trên nền tối thành một vành sáng cứng; đó là lý do bản tối không có bóng',
    );
  }
}

if (problems.length) {
  console.log('BẢN TỐI ĐÃ ĐỔI:\n');
  for (const p of problems) console.log(`  • ${p}`);
  console.log('\nGiai đoạn 2 hứa bản tối không đổi một ký tự. Nếu một thay đổi ở đây là CỐ Ý,');
  console.log('nó cần một quyết định riêng — không phải một tác dụng phụ của việc sửa bản sáng.');
  process.exit(1);
}

const roles = Object.keys(materials.dark.elevation ?? {});
console.log(
  `bản tối ĐÓNG BĂNG OK — ${Object.keys(FROZEN_PALETTE).length} token và ${Object.keys(FROZEN_MATERIAL).length} ` +
    'trường chất liệu khớp từng ký tự với mốc 9d04d55, đo bằng cách biên dịch rồi CHẠY bảng màu' +
    (roles.length ? `; ${roles.length} vai bóng mới đều là NO_SHADOW ở bản tối` : ''),
);
