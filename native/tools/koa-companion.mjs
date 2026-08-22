/**
 * A companion on every screen is a companion that can ruin every screen.
 *
 * ── what it is ──
 *
 * Koa used to think everywhere and appear in one place: `useKoaContext` is read
 * across the app while the only thing that drew the character was a 46pt figure
 * on Today. `KoaCompanion` gives it a body that follows you.
 *
 * ── and why that is dangerous in a way the Today figure never was ──
 *
 * Mounted once, at the root, it is now present on the shop, the settings page,
 * every list and every pushed route. Three faults that were harmless in one
 * component become app-wide there:
 *
 * **A query.** `useMascot()` is four subscriptions deep and `useMascotEmotion()`
 * adds more. On every screen that is an observer on `daily_log` and
 * `today_meals` everywhere, and React Query refetches a stale query the moment
 * an observer mounts. This app has paid that bill twice already — six queries
 * fired by opening Awards, and the `LoadFailed` oscillation that `live.mjs`
 * found as twenty-five blank routes.
 *
 * **A layout animation.** Animating `left`/`top` re-runs layout every frame, on
 * every screen. `tools/motion.mjs` caught the first draft of this file doing it.
 *
 * **A missing off switch.** Something that follows you everywhere and cannot be
 * turned off is not a companion.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(NATIVE, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const problems = [];

const FILE = 'src/components/ascnd/koa-companion.tsx';
const code = strip(read(FILE));

/* ── 1. nothing here may subscribe to a query ── */
{
  /** Hooks that are known to mount observers, and what they cost. */
  const BANNED = [
    ['useMascot', '4 truy vấn: hồ sơ, log hôm nay, bữa hôm nay, nước'],
    ['useMascotEmotion', 'kéo theo useMascotMood → daily_log + today_meals'],
    ['useMascotMood', 'daily_log + today_meals'],
    ['useMascotInventory', 'mascot_inventory'],
    ['useMascotWallet', 'mascot_wallet'],
    ['useDailyStreak', 'mascot_streak'],
    ['useDailyLog', 'daily_log'],
    ['useTodayMeals', 'today_meals'],
    ['useProfile', 'profiles'],
    ['useDailyQuests', 'nhiều truy vấn'],
  ];
  for (const [hook, cost] of BANNED) {
    if (new RegExp(`\\b${hook}\\s*\\(`).test(code)) {
      problems.push(
        `${FILE} gọi ${hook}() — ${cost}. Thành phần này gắn ở MỌI màn, nên đó là một observer trên ` +
          'cửa hàng, trang cài đặt và mọi danh sách; React Query fetch lại một truy vấn cũ ngay khi ' +
          'có observer mount. App này đã trả giá hai lần: mở màn Huy hiệu bắn sáu truy vấn, và ' +
          'LoadFailed đọc chính thứ nó được render VÌ nó hỏng đã tạo vòng lặp 25 màn trắng',
      );
    }
  }
  /* And the positive form: it has to be reading the cache-only sources. */
  for (const need of ['useKoaContext', 'useMascotIdentity']) {
    if (!new RegExp(`\\b${need}\\s*\\(`).test(code)) {
      problems.push(`${FILE} không dùng ${need}() — đó là nguồn không tốn truy vấn dành cho lớp này`);
    }
  }
}

/* ── 2. it can be switched off, and the switch is reachable ── */
{
  if (!/!\s*enabled/.test(code) || !/!\s*companion/.test(code)) {
    problems.push(
      `${FILE} không gác theo CẢ HAI công tắc. 'enabled' là "tôi không muốn linh vật" và phải tắt ` +
        "sạch; 'companion' là \"tôi thích Koa nhưng không muốn nó đi lại trong lúc tôi đọc\" — người " +
        'nghĩ vế sau không nên phải từ bỏ nhân vật để nói ra điều đó',
    );
  }
  const settings = strip(read('src/app/settings.tsx'));
  if (!/setCompanion\(/.test(settings)) {
    problems.push(
      'màn Cài đặt không có công tắc cho companion — một thứ đi theo bạn khắp nơi mà không tắt được ' +
        'thì không phải bạn đồng hành',
    );
  }
}

/* ── 3. movement is caused, never timed ── */
{
  if (/setInterval|setTimeout\s*\([^)]*\d{3,}/.test(code)) {
    problems.push(
      `${FILE} dời chỗ theo đồng hồ. Một nhân vật trôi theo hẹn giờ là một vật thể chuyển động ở rìa ` +
        'mắt trong lúc người ta đang đọc một con số, và chuyển động luôn thắng chữ. Nó chỉ được dời ' +
        'khi trạng thái đổi',
    );
  }
  if (/Math\.random\s*\(/.test(code)) {
    problems.push(`${FILE} dùng Math.random để chọn chỗ — vị trí sẽ nhảy mỗi lần render`);
  }
}

/* ── 4. every tab has the character, in some form ──

   The route gate is a whitelist, and the reason is drift: the companion is
   mounted above the `Stack`, so it draws over pushed routes and over all six
   modal presentations. A blacklist would need every future modal remembering,
   and the cost of forgetting one is a koala floating on somebody's meal sheet.

   What a whitelist can get wrong instead is *omission* — a tab added later and
   never listed, silently without a companion. So the list is checked against
   the tabs that actually exist, and a tab may be missing only with a reason
   written here. */
{
  const perch = strip(read('src/lib/koa-perch.ts'));

  /** Tabs that have Koa some other way, and how. */
  const OTHER_FORM = {
    '/': 'màn Today đã render <Mascot /> 54pt kèm bong bóng thoại — đó là GIỌNG của nhân vật, và hai Koa trên một màn là thừa một',
    '/assistant': 'màn trợ lý đã có hình người particle làm nền — thêm một con koala đứng lên đó là hai chủ thể tranh nhau một nền',
  };

  const tabs = readdirSync(path.join(NATIVE, 'src/app/(tabs)'))
    .filter((f) => f.endsWith('.tsx') && f !== '_layout.tsx')
    .map((f) => (f === 'index.tsx' ? '/' : `/${f.replace(/\.tsx$/, '')}`));

  const listed = code.match(/const COMPANION_ROUTES = \[([\s\S]*?)\]/);
  if (!listed) {
    problems.push(`không tìm thấy COMPANION_ROUTES trong ${FILE} — bộ quét hỏng`);
  } else {
    for (const tab of tabs) {
      const on = listed[1].includes(`'${tab}'`);
      if (!on && !OTHER_FORM[tab]) {
        problems.push(
          `tab ${tab} không có Koa dưới bất kỳ dạng nào: nó không nằm trong COMPANION_ROUTES và cũng ` +
            'không có lý do ghi lại. Một tab thêm sau này mà quên khai sẽ lặng lẽ không có bạn đồng hành',
        );
      }
      if (on && OTHER_FORM[tab]) {
        problems.push(
          `tab ${tab} vừa có companion vừa được ghi là đã có Koa dạng khác (${OTHER_FORM[tab]}) — hai ` +
            'nhân vật trên một màn',
        );
      }
    }
  }

  /* And it must not be a blacklist again. */
  if (/NO_COMPANION/.test(code)) {
    problems.push(
      `${FILE} quay lại dùng danh sách LOẠI TRỪ. Thành phần này vẽ trên cả route đẩy lẫn 6 modal, nên ` +
        'một modal thêm sau mà quên loại trừ là một con koala nổi trên sheet ghi bữa ăn của người ta',
    );
  }
}

/* ── 4b. every shared value the style reads is actually written ──

   Caught while writing this: `surfaced` was multiplied into the opacity and
   into the translate, and the effect meant to set it never landed in the file.
   `tsc` was clean, every other rule here was green, and the companion was
   permanently invisible — a shared value that starts at 0 and is never assigned
   silently multiplies the whole character away.

   Nothing throws on that, and nothing looks wrong in review. The only two
   things that would have found it are a rendered screenshot and this. */
{
  const declared = [...code.matchAll(/const (\w+) = useSharedValue\(/g)].map((m) => m[1]);
  const styleBlock = code.match(/useAnimatedStyle\(\(\) => \(\{[\s\S]*?\}\)\)/);
  if (!styleBlock) {
    problems.push(`không tìm thấy useAnimatedStyle trong ${FILE} — bộ quét hỏng`);
  }
  for (const name of declared) {
    const readInStyle = styleBlock && new RegExp(`\\b${name}\\.value`).test(styleBlock[0]);
    if (!readInStyle) continue;
    /* Assigned anywhere outside the style itself. */
    const assigned = new RegExp(`\\b${name}\\.value\\s*=`).test(code);
    if (!assigned) {
      problems.push(
        `${FILE}: '${name}' được style ĐỌC nhưng không chỗ nào GÁN — nó đứng yên ở giá trị khởi tạo. ` +
          'Với một hệ số nhân vào opacity thì đó là nhân vật vô hình vĩnh viễn, tsc vẫn sạch, và ' +
          'không có ngoại lệ nào ném ra',
      );
    }
  }
}

/* ── 5. and it does not talk ── */
{
  if (/Bubble|bubble|mascotLine|useMascotMessage/.test(code)) {
    problems.push(
      `${FILE} nói. Được NHÌN THẤY nhiều hơn và NGẮT LỜI nhiều hơn là hai chuyện khác nhau, và chỉ ` +
        'chuyện thứ hai bị định lượng: mascot-budget.ts giữ trần 3 lần/ngày cho mọi câu Koa nói. ' +
        'File này làm nhân vật hiện diện, không làm nó ồn hơn',
    );
  }
}

if (problems.length) {
  console.log('bạn đồng hành Koa CÓ LỖI:\n');
  for (const p of problems.slice(0, 12)) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'bạn đồng hành Koa OK — không hook nào ở đây mount observer truy vấn (10 hook đắt bị cấm tên; nguồn ' +
    'là useKoaContext + useMascotIdentity, cả hai đọc cache/settings), nên gắn nó ở mọi màn không làm ' +
    'màn nào fetch thêm; tắt được bằng CẢ HAI công tắc và công tắc companion có thật trong Cài đặt; ' +
    'chỗ đứng chỉ đổi khi TRẠNG THÁI đổi — không hẹn giờ, không Math.random — nên nó không trôi ở rìa ' +
    'mắt lúc người ta đang đọc; nó tránh 3 màn vốn đã có nhân vật cỡ lớn, mọi chỗ đậu nằm trong lề ' +
    'trái/phải và đứng CHÌM ở mép dưới (rise ≤ 1, top đo từ đáy) chứ không giữa nội dung; MỌI tab đều có Koa dưới dạng nào đó (whitelist, không phải blacklist — nên một modal thêm sau không thể lọt); và nó KHÔNG nói — trần 3 câu/ngày của mascot-budget giữ nguyên',
);
