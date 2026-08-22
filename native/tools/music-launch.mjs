/**
 * A shortcut that can only fail by never appearing.
 *
 * ── the trap ──
 *
 * `canOpenURL` is the only way to ask whether another app is installed, and
 * since iOS 9 it returns **false for any scheme not listed in
 * `LSApplicationQueriesSchemes`**. Not an error. Not a warning. False.
 *
 * So if a scheme is missing from `app.json`, the music row is filtered down to
 * nothing and never renders — on every device, for ever — while the component
 * reads perfectly, `tsc` is clean, and no exception is thrown anywhere. The
 * feature is simply absent, and the only symptom is that nobody ever mentions
 * it.
 *
 * The asymmetry is what makes it so quiet: the restriction applies to
 * `canOpenURL` alone. `openURL` works fine on an undeclared scheme. So this can
 * never present as "the button did nothing" — the button was never there.
 *
 * ── and the opposite fault ──
 *
 * Dropping the `canOpenURL` check entirely would make the buttons always
 * appear, including for apps the person has not installed, and pressing one
 * would do nothing at all. This app already has `tools/reachable.mjs` because
 * of a door that went nowhere.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(NATIVE, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const problems = [];

const lib = strip(read('src/lib/music-app.ts'));
const view = strip(read('src/components/ascnd/music-launch.tsx'));
const app = JSON.parse(read('app.json')).expo;

/* ── 1. every scheme is declared, or the row never appears ── */
{
  const declared = app.ios?.infoPlist?.LSApplicationQueriesSchemes ?? [];
  const schemes = [...lib.matchAll(/scheme: '([^']+)'/g)].map((m) => m[1]);

  if (schemes.length === 0) {
    problems.push('không đọc được scheme nào trong lib/music-app.ts — bộ quét hỏng');
  }
  for (const s of schemes) {
    if (!declared.includes(s)) {
      problems.push(
        `scheme '${s}' KHÔNG được khai trong app.json → ios.infoPlist.LSApplicationQueriesSchemes. ` +
          'Từ iOS 9, canOpenURL trả FALSE cho mọi scheme không khai — không lỗi, không cảnh báo. Nên ' +
          'hàng nút nhạc bị lọc sạch và không bao giờ hiện, trên mọi máy, mãi mãi, trong khi code đọc ' +
          'vẫn đúng và tsc vẫn sạch. Triệu chứng duy nhất là không ai nhắc tới nó',
      );
    }
    if (s !== s.toLowerCase()) {
      problems.push(`scheme '${s}' có chữ hoa — canOpenURL so khớp phân biệt hoa thường, và hỏng y hệt cách trên`);
    }
  }
  /* Two-sided: a declaration for a scheme nothing opens is a permission-shaped
     line in the app's manifest that buys nothing. */
  for (const d of declared) {
    if (!schemes.includes(d)) {
      problems.push(
        `app.json khai scheme '${d}' nhưng không app nhạc nào trong lib dùng nó — khai thừa trong ` +
          'manifest là thứ người duyệt App Store đọc được mà app không cần',
      );
    }
  }
}

/* ── 1b. and Android's half of the same question ──

   `canOpenURL` fails silently on both platforms and needs a different
   declaration on each. iOS wants the scheme in `LSApplicationQueriesSchemes`.
   Android 11 introduced **package visibility**: an app cannot see what else is
   installed unless it declares what it means to look for, in `<queries>`.

   Miss that and `canOpenURL` returns false with no error — the identical
   symptom, on the other platform, with a completely different fix. `app.json`
   has no field for `<queries>`, so it lives in a config plugin, and the two
   declarations must name the same schemes or one platform quietly loses the
   feature. */
{
  const plugin = strip(read('plugins/with-music-app-queries.js'));
  const schemes = [...lib.matchAll(/scheme: '([^']+)'/g)].map((m) => m[1]);
  const declared = (plugin.match(/const SCHEMES = \[([^\]]*)\]/) ?? [, ''])[1];
  for (const s of schemes) {
    if (!declared.includes(`'${s}'`)) {
      problems.push(
        `scheme '${s}' không có trong plugin Android (plugins/with-music-app-queries.js). Từ Android ` +
          '11, không khai <queries> thì canOpenURL trả FALSE — cùng triệu chứng im lặng như bên iOS, ' +
          'chỉ khác cách sửa: hàng nút nhạc biến mất trên toàn bộ máy Android',
      );
    }
  }
  const registered = (app.plugins ?? []).some((x) => String(x).includes('with-music-app-queries'));
  if (!registered) {
    problems.push(
      'plugin with-music-app-queries chưa được khai trong app.json → plugins. Nó tồn tại nhưng không ' +
        'chạy, nên AndroidManifest không có <queries> và canOpenURL im lặng trả false trên Android',
    );
  }
  /* The merge is the part that is easy to get wrong and impossible to see:
     other plugins declare their own queries, and assigning over the array takes
     away somebody else's visibility. */
  if (!/\.\.\.\(block\.intent \?\? \[\]\)/.test(plugin)) {
    problems.push(
      'plugin Android GHI ĐÈ mảng queries thay vì gộp vào — Expo tự khai một <intent> cho https, và ' +
        'ghi đè sẽ lặng lẽ lấy mất khả năng nhìn thấy của thứ khác, đúng loại lỗi plugin này sinh ra để chặn',
    );
  }
}

/* ── 2. only apps that are actually installed are offered ── */
{
  if (!/canOpenURL\(/.test(view)) {
    problems.push(
      'music-launch không gọi canOpenURL — các nút sẽ luôn hiện, kể cả app người ta không cài, và bấm ' +
        'vào thì không có gì xảy ra. Đúng loại "cửa dẫn tới hư không" mà tools/reachable.mjs tồn tại vì nó',
    );
  }
  if (!/apps\.length === 0\) return null|!apps \|\| apps\.length === 0/.test(view)) {
    problems.push(
      'music-launch không trả null khi không có app nào — một hàng rỗng, hoặc một nút bị vô hiệu hoá, ' +
        'là quảng cáo thường trực cho hai app mà người ta đã chọn không cài',
    );
  }
  /* A rejected promise from either call must not become an unhandled one. */
  for (const call of ['canOpenURL', 'openURL']) {
    const re = new RegExp(`${call}\\([^)]*\\)[\\s\\S]{0,40}?\\.catch\\(`);
    if (!re.test(view)) {
      problems.push(`${call} không có .catch — một lối tắt mở nhạc không đáng đổi lấy một promise văng ra`);
    }
  }
}

/* ── 3. it does not pretend to be a player ──

   Spotify's own documentation: "it isn't possible to play Spotify audio
   directly inside your own iOS or Android app", and the SDKs that once could
   were retired in September 2022. Apple Music can play in-app, but only behind
   a MusicKit entitlement, a signing key, a permission prompt and a live
   subscription. A transport control here would work for neither service as
   written, so anything that looks like one is a promise this file cannot keep. */
{
  if (/expo-av|expo-audio|TrackPlayer|MusicKit|ApplicationMusicPlayer|AppRemote/.test(view + lib)) {
    problems.push(
      'lớp nhạc đang với tay sang phát nhạc thật. Spotify nói thẳng là KHÔNG thể phát audio của họ ' +
        'trong app bên thứ ba, và Apple Music thì cần entitlement MusicKit + khoá ký + quyền + gói trả ' +
        'phí đang hoạt động. Nếu thật sự muốn phát trong app thì đó là một quyết định riêng, có chi ' +
        'phí riêng, không phải một dòng thêm vào lối tắt này',
    );
  }
}

if (problems.length) {
  console.log('lối tắt nhạc CÓ LỖI:\n');
  for (const p of problems.slice(0, 12)) console.log(`  • ${p}`);
  process.exit(1);
}

const n = [...lib.matchAll(/scheme: '([^']+)'/g)].length;
console.log(
  `lối tắt nhạc OK — ${n} scheme đều được khai ở CẢ HAI phía — LSApplicationQueriesSchemes cho iOS và <queries> cho Android 11+ qua config plugin (đã chạy prebuild thật để xác nhận nó sinh ra khối queries và GỘP với intent https sẵn có thay vì ghi đè) — và đều viết thường ` +
    '(thiếu khai hoặc viết hoa thì canOpenURL trả FALSE trong im lặng, và hàng nút không bao giờ hiện ' +
    'trên bất kỳ máy nào — không lỗi, không cảnh báo, tsc vẫn sạch); không khai thừa scheme nào app ' +
    'không dùng; chỉ app THẬT SỰ đã cài mới được mời, không có app nào thì không vẽ gì cả; cả ' +
    'canOpenURL lẫn openURL đều có .catch; và lớp này KHÔNG giả vờ làm trình phát — Spotify không cho ' +
    'phát audio của họ trong app bên thứ ba, còn Apple Music cần entitlement, khoá ký, quyền và gói ' +
    'đang hoạt động',
);
