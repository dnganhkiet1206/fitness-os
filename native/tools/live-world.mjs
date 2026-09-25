import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The world the app wakes up in, for every tool that boots it.
 *
 * ── why this is its own file ──
 *
 * It was inside `live.mjs`. A second tool then needed the same identity, the
 * constants were copied across by hand, and **the project reference was typed
 * from memory and wrong** — so the app quietly rejected the seeded session,
 * every boot landed on the Sign In screen, and the tool measured a login form
 * while reporting on a mascot.
 *
 * That is the exact failure this codebase keeps finding in its own app code:
 * one rule, two copies, and the copy is wrong in a way nothing errors about.
 * A harness gets to make that mistake once.
 *
 * Everything here is fake and local. The reference names no real project, the
 * token is never verified by anything, and the rows exist so that the app has
 * a coherent day to render.
 */

/**
 * Đọc ra từ `backend.ts`, không gõ lại.
 *
 * Ref này dựng khoá localStorage `sb-<ref>-auth-token` mà supabase-js tìm phiên
 * đăng nhập trong đó. Gõ cứng thì nó lệch khỏi URL thật ngay lần đổi project
 * đầu tiên, và hậu quả không phải một lỗi — mà là MỌI ảnh chụp trở thành màn
 * chưa đăng nhập, trông y như app hỏng. Lấy từ nguồn thì không lệch được.
 */
const backendTs = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'backend.ts'),
  'utf8',
);
const refMatch = backendTs.match(/https:\/\/([a-z0-9]+)\.supabase\.co/);
if (!refMatch) throw new Error('live-world: không đọc được project ref từ src/lib/backend.ts');
export const REF = refMatch[1];
export const UID = '11111111-2222-3333-4444-555555555555';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
export const jwt = () =>
  `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({
    sub: UID,
    role: 'authenticated',
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 86400 * 30,
    email: 'demo@ascnd.app',
  })}.signature-not-checked-here`;

export const day = (n) => new Date(Date.now() - n * 864e5).toISOString();
export const dayStr = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

/**
 * Một đêm ngủ có hình dạng của một đêm ngủ thật.
 *
 * ── ba thứ bộ cố định cũ nói dối, và cả ba đều che một lỗi ──
 *
 * 1. **Giờ.** `bedtime: day(1), waketime: day(0.7)` là "24 giờ trước" và "16,8
 *    giờ trước", nên ảnh chụp in ra `04:37 PM → 10:51 PM`: một đêm bắt đầu lúc
 *    bốn giờ chiều. Không ai nhìn một ảnh như thế mà tin được phần định dạng
 *    giờ của màn là đúng, và không lượt chạy nào từng thử một đêm VẮT QUA nửa
 *    đêm — tức hình dạng của mọi đêm thật.
 *
 * 2. **Thời gian trên giường bằng đúng thời gian ngủ.** `asleep_min` của đêm cũ
 *    khớp tới từng phút với `waketime - bedtime`, mà HealthKit không bao giờ
 *    ghi như vậy: luôn có thời gian nằm chờ ngủ và những lần tỉnh giấc. Hai con
 *    số ấy bằng nhau thì mọi chỗ trong app trộn lẫn chúng đều trông đúng.
 *    `inBedMin > asleepMin` là thứ phân biệt chúng, và bộ chạy cần sự phân biệt
 *    ấy để một chỗ nào đó dùng nhầm con số sẽ LỘ RA.
 *
 * 3. **Thứ trong tuần.** Bảy `day(n)` với phần lẻ khác nhau rơi vào chỉ năm
 *    ngày lịch — ảnh chụp có HAI thứ Bảy, HAI thứ Tư, không có thứ Ba và thứ
 *    Sáu. Neo theo giờ trên đồng hồ thì bảy đêm ra đúng bảy ngày liền nhau.
 *
 * Tầng ngủ vẫn cộng đúng bằng `asleepMin` — đó là điều HealthKit bảo đảm, và
 * một fixture tự mâu thuẫn sẽ che đúng loại lỗi biểu đồ sinh ra để bắt.
 *
 * Neo theo giờ UTC vì bộ chạy chạy ở UTC; đổi múi giờ của trình duyệt thì giờ
 * hiện ra đổi theo, y như trên máy thật.
 */
function night(daysAgo, bedH, bedM, inBedMin, asleepMin, { id, quality, deep, rem, light, source = 'apple_health' }) {
  if (deep + rem + light > 0 && deep + rem + light !== asleepMin) {
    throw new Error(`live-world: đêm ${id} có tầng cộng lại ${deep + rem + light} ≠ asleep_min ${asleepMin}`);
  }
  if (inBedMin < asleepMin) {
    throw new Error(`live-world: đêm ${id} ngủ ${asleepMin} phút trong ${inBedMin} phút trên giường`);
  }
  const bed = new Date(Date.now() - daysAgo * 864e5);
  bed.setUTCHours(bedH, bedM, 0, 0);
  const wake = new Date(bed.getTime() + inBedMin * 60000);
  return {
    id, user_id: UID,
    bedtime: bed.toISOString(),
    waketime: wake.toISOString(),
    quality,
    deep_min: deep, rem_min: rem, light_min: light,
    asleep_min: asleepMin,
    source,
  };
}

/**
 * `?order=…` và `?limit=…`, vì một bảng KHÔNG có thứ tự cố định nào đúng.
 *
 * ── lỗi nó sinh ra để sửa ──
 *
 * Máy chủ giả trả `FIXTURES[table]` nguyên bảng theo đúng thứ tự tôi gõ trong
 * tệp này. Đo được: trong 27 chỗ app gọi `.order()`, **sáu bảng** đang nằm ở
 * thứ tự app không bao giờ hỏi — nên mọi ảnh chụp và mọi kịch bản chạy trên
 * một danh sách đảo ngược, và không ai phân biệt được "app sắp sai" với
 * "fixture gõ ngược".
 *
 * Nó vừa xảy ra thật: biểu đồ bảy đêm của `sleep-insights` vẽ đêm mới nhất ở
 * BÊN TRÁI trong ảnh chụp — ngược mọi quy ước chuỗi thời gian — và app thì
 * đúng: `useSleepHistory` gọi `.order('waketime', { ascending: true })`.
 *
 * ── vì sao không sắp lại fixture bằng tay ──
 *
 * Vì không có thứ tự nào đúng được. `sleep_logs` bị hỏi `waketime.asc` bởi
 * `useSleepHistory` và `waketime.desc` bởi `useTodaySleep`, trong CÙNG một
 * phiên; `meal_entries` cũng thế với `date_time`. Một mảng chỉ có một thứ tự.
 * Nên thứ phải biết sắp xếp là máy chủ, đúng như Postgres — và khi máy chủ
 * biết sắp, thứ tự tôi gõ trong fixture thôi mang nghĩa gì, tức thôi nói dối
 * được.
 *
 * Lọc theo ngày (`gte`/`lt`) thì VẪN bị bỏ qua, và đó vẫn là giới hạn đã ghi
 * trong `live.mjs`. Đây chỉ là thứ tự và số lượng.
 */
/*
  ── bộ lọc: eq · neq · in · is, và dạng `not.` của chúng (#17) ──

  Trước #17 hàm này không lọc gì, và cái giá không nằm ở dữ liệu thừa mà ở
  `.maybeSingle()`: supabase-js nhận về MẢNG rồi ném PGRST116 khi có hơn một
  dòng. `useMyCommunityProfile` (`.eq('user_id', me).maybeSingle()`) vì thế
  LUÔN lỗi trong thế giới giả, và tab Cộng đồng — đúng như thiết kế — im lặng
  khi hồ sơ lỗi: ô soạn bài, lối vào của cả ba màn chia sẻ, chưa từng hiện
  trong một phép đo web nào mà không có gì báo ra (B tìm ra, #17).

  Chỉ lọc những gì app thật gửi và hiểu chắc chắn. Toán tử khác — `gte`, `lt`,
  `like`, `or=(…)`, cột lồng `bảng.cột` — được GIỮ NGUYÊN chứ không đoán: lọc
  sai là giấu hàng khỏi ảnh chụp, tệ hơn không lọc. Riêng `gte`/`lt` còn một
  lý do nữa: kịch bản "nhật ký ngày khác" trong `live.mjs` ghi rõ nó dựa vào
  việc chúng KHÔNG được lọc.

  So sánh theo chuỗi: URL chỉ chở chuỗi, fixture chở số và boolean, và
  PostgREST cũng so theo dạng chữ của giá trị ở phía này.
*/
const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns', 'or', 'and']);

function splitList(s) {
  /* `in.(a,"b c",d)` — dấu phẩy trong ngoặc kép không tách. */
  const out = [];
  let cur = '';
  let q = false;
  for (const ch of s) {
    if (ch === '"') q = !q;
    else if (ch === ',' && !q) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function filterFor(col, raw) {
  let expr = raw;
  let neg = false;
  if (expr.startsWith('not.')) {
    neg = true;
    expr = expr.slice(4);
  }
  const dot = expr.indexOf('.');
  if (dot < 0) return null;
  const op = expr.slice(0, dot);
  const val = expr.slice(dot + 1);
  const str = (v) => (v === null || v === undefined ? null : String(v));
  let test;
  if (op === 'eq') test = (r) => str(r[col]) === val;
  else if (op === 'neq') test = (r) => str(r[col]) !== null && str(r[col]) !== val;
  else if (op === 'in' && val.startsWith('(') && val.endsWith(')')) {
    const set = new Set(splitList(val.slice(1, -1)));
    test = (r) => str(r[col]) !== null && set.has(str(r[col]));
  } else if (op === 'is' && val === 'null') test = (r) => r[col] === null || r[col] === undefined;
  else if (op === 'is' && (val === 'true' || val === 'false')) test = (r) => r[col] === (val === 'true');
  else return null;
  return neg ? (r) => !test(r) : test;
}

export function applyQuery(rows, url) {
  let out = rows;

  for (const [col, raw] of url.searchParams) {
    if (RESERVED.has(col) || col.includes('.')) continue;
    const f = filterFor(col, raw);
    if (f) out = out.filter(f);
  }

  /* PostgREST: `order=col.asc,col2.desc.nullsfirst`. supabase-js nối nhiều lần
     gọi `.order()` vào cùng tham số ấy, nên tách theo dấu phẩy là đủ. */
  const order = url.searchParams.get('order');
  if (order) {
    const keys = order.split(',').map((part) => {
      const [col, ...mods] = part.split('.');
      const desc = mods.includes('desc');
      /* Mặc định của Postgres, không phải của JS: ASC đặt NULL sau cùng, DESC
         đặt NULL lên đầu. Gõ ngược thì một hàng thiếu dữ liệu sẽ nhảy lên đầu
         danh sách trong ảnh chụp và trông như một lỗi của app. */
      const nullsFirst = mods.includes('nullsfirst') ? true : mods.includes('nullslast') ? false : desc;
      return { col, desc, nullsFirst };
    });
    out = [...out].sort((a, b) => {
      for (const { col, desc, nullsFirst } of keys) {
        const x = a[col];
        const y = b[col];
        const xn = x === null || x === undefined;
        const yn = y === null || y === undefined;
        if (xn && yn) continue;
        if (xn || yn) return (xn ? 1 : -1) * (nullsFirst ? -1 : 1);
        /* Boolean trước số trước chuỗi: `is_favorite.desc` phải đưa `true` lên
           đầu, mà `true > false` chỉ đúng sau khi ép sang số. */
        const cx = typeof x === 'boolean' ? Number(x) : x;
        const cy = typeof y === 'boolean' ? Number(y) : y;
        const cmp = cx < cy ? -1 : cx > cy ? 1 : 0;
        if (cmp) return desc ? -cmp : cmp;
      }
      return 0;
    });
  }

  const limit = Number(url.searchParams.get('limit'));
  if (Number.isFinite(limit) && limit > 0) out = out.slice(0, limit);
  return out;
}

/**
 * What the server answers in `full` mode.
 *
 * The numbers are chosen so the canary can recognise them. `1,680 / 2,450 kcal`
 * is 69% with 770 remaining, and nothing but this app's own arithmetic over
 * this exact row produces that pair.
 */
export const FIXTURES = {
  profiles: [{
    /* `dob`, KHÔNG phải `date_of_birth`.

       Cột thật tên `dob` (migration gốc, dòng 11) và cả app đọc `profile.dob`.
       Fixture này gõ `date_of_birth` — một cột không tồn tại — nên mọi lần
       dựng đều thấy một hồ sơ KHÔNG CÓ NGÀY SINH, lặng lẽ, không ai đỏ. Bắt
       được nó khi ước lượng calo buổi tập ra 0 ở mọi màn: `energyProfileFrom`
       trả `null` vì thiếu `dob`, và một máy chủ giả sai kiểu này không báo lỗi
       — nó BỊA ra một thế giới nơi tính năng không chạy. */
    user_id: UID, name: 'Kiệt', sex: 'male', dob: '1996-04-12',
    height_cm: 174, weight_kg: 71.5, goal: 'recomp', activity_level: 'moderate',
    training_level: 'intermediate', onboarding_completed: true,
    tdee_target_kcal: 2450, macro_protein_g: 160, macro_carbs_g: 250,
    macro_fat_g: 75, macro_fiber_g: 30, sleep_target_hours: 8,
    /* Tên cột THẬT là `sleep_target_*`. Hai khoá cũ (`waketime`, `bedtime`)
       không tồn tại trong schema, nên `edit-profile` và onboarding luôn thấy
       mục tiêu giấc ngủ trống ở mọi lần dựng. */
    sleep_target_waketime: '06:30', sleep_target_bedtime: '23:00',
    dietary_preference: 'omnivore', coins: 1240,
  }],
  daily_logs: [{
    id: 'dl1', user_id: UID, date: dayStr(0), kcal: 1680, protein_g: 118,
    carbs_g: 165, fat_g: 52, fiber_g: 21, steps: 8432, active_kcal: 486,
    active_minutes: 41, readiness_score: 74,
    sleep_duration_min: 431, workout_count: 1, volume_load: 8450,
    acwr: 1.08,
    /* `updated_at` là TOKEN CAS của `recomputeDailyLog` (`.eq('updated_at',
       seen.updated_at)`). Thiếu nó, app gửi `updated_at=eq.undefined`; trước
       #17 bộ chạy không lọc nên PATCH vẫn "trúng" dòng, và lỗi fixture bị che.
       Từ #17 PATCH ấy trúng 0 dòng như PostgREST thật, và MỌI lần lưu buổi tập
       trong thế giới giả hỏng sau ba lượt thử — tìm ra khi đo lời mời chia sẻ
       sau buổi tập (#12). Trên database thật cột này NOT NULL và trigger đẩy
       nó mỗi lần UPDATE. */
    updated_at: day(0.2),
    /* `water_ml`, `hrv_today`, `rhr_today` đã bỏ: ba khoá ấy không phải cột
       của `daily_logs`. Nước đọc từ `water_logs`, còn HRV với nhịp nghỉ đọc
       từ `biometric_samples` — fixture vẫn có đủ cả hai bảng, nên không màn
       nào mất dữ liệu vì lần dọn này. */
  }],
  /*
    ── BẢY đêm, không phải một ──

    Một đêm là một biểu đồ suy biến: `sleep-insights` vẽ một cột duy nhất giữa
    một thẻ rỗng, nên không lượt chạy nào từng nhìn thấy hình dạng thật của nó
    — bảy cột cạnh nhau, cao thấp khác nhau, ba tầng chồng trong mỗi cột. Đúng
    hình dạng mà `meal_entry_items` đã thiếu.

    Sáu đêm có tầng (HealthKit ghi) và MỘT đêm không — `stagesKnown` là thứ
    phân biệt "bạn không ngủ sâu" với "không ai đo giấc sâu của bạn", và nhánh
    ấy chỉ chạy khi có một đêm như thế trong bảng.

    Độ dài đi từ 5,8h tới 8,1h quanh mục tiêu 8h, nên cả nhánh "thiếu giờ" lẫn
    nhánh "đạt mục tiêu" của câu tóm tắt đều có dữ liệu để chạy.
  */
  sleep_logs: [
    /* Đêm gõ tay: có giờ đi ngủ và giờ dậy, KHÔNG có tầng. Nhánh `stagesKnown`
       của biểu đồ và nhánh `avgDeep === null` của thẻ chỉ chạy nhờ đêm này —
       và đúng vì nó gõ tay nên `asleep_min` BẰNG thời gian trên giường. */
    night(7, 23, 25, 374, 374, { id: 's7', quality: 5, deep: 0, rem: 0, light: 0, source: 'manual' }),
    night(6, 23, 5, 470, 441, { id: 's6', quality: 7, deep: 95, rem: 88, light: 258 }),
    night(5, 22, 50, 482, 452, { id: 's5', quality: 8, deep: 88, rem: 112, light: 252 }),
    night(4, 23, 50, 375, 348, { id: 's4', quality: 6, deep: 61, rem: 74, light: 213 }),
    night(3, 22, 35, 515, 486, { id: 's3', quality: 9, deep: 104, rem: 118, light: 264 }),
    night(2, 23, 15, 448, 420, { id: 's2', quality: 7, deep: 78, rem: 96, light: 246 }),
    night(1, 23, 0, 460, 431, { id: 's1', quality: 8, deep: 92, rem: 104, light: 235 }),
  ],
  biometric_samples: [{
    id: 'b1', user_id: UID, date_time: day(0.2), hr_bpm: 54, hrv_sdnn_ms: 62,
    hrv_rmssd_ms: null, spo2_pct: 97, resp_rate_rpm: 14, vo2max_mlkgmin: 48,
    source: 'apple_health', confidence: 0.9,
  }],
  water_logs: [{ id: 'w1', user_id: UID, amount_ml: 1750, date: dayStr(0), logged_at: day(0.3) }],

  /*
    Ba thực đơn với ĐỘ LẤP KHÁC NHAU, và sự khác nhau đó là cả lý do chúng ở đây.

    Trước đây `FIXTURES` không có `meal_plans` nào, nên `live.mjs` luôn dựng ra
    trạng thái RỖNG của tab Thực đơn — và bảng tuần của từng thực đơn không bao
    giờ nhìn thấy được. Một công cụ mù đúng chỗ mình vừa sửa thì không kiểm được
    gì cả.

    "Tuần đầy" lấp gần hết, "Mới soạn" lấp hai ngày đầu, "Rỗng" không có món nào
    — ba trạng thái mà bảng phải phân biệt được bằng mắt. Một dữ liệu mẫu chỉ có
    một trạng thái thì không chứng minh được bảng đang kể chuyện gì.
  */
  meal_plans: [
    { id: 'mp1', user_id: UID, name: 'Tuần đầy', goal: 'maintain', meals_per_day: 3, start_date: null, end_date: null, created_at: day(1) },
    { id: 'mp2', user_id: UID, name: 'Mới soạn', goal: 'cut', meals_per_day: 4, start_date: null, end_date: null, created_at: day(4) },
    { id: 'mp3', user_id: UID, name: 'Rỗng', goal: 'bulk', meals_per_day: 6, start_date: null, end_date: null, created_at: day(9) },
  ],
  meal_plan_items: [
    /* mp1 — sáu ngày đầu đủ ba bữa, ngày cuối mới một bữa. */
    ...[0, 1, 2, 3, 4, 5].flatMap((d) =>
      ['breakfast', 'lunch', 'dinner'].map((m, k) => ({
        id: `mi-${d}-${k}`, meal_plan_id: 'mp1', day_index: d, meal_type: m,
        food_name: 'Cơm gà', serving_g: 300, kcal: 520, protein_g: 38, carbs_g: 55, fat_g: 14, food_item_id: null,
      })),
    ),
    { id: 'mi-6-0', meal_plan_id: 'mp1', day_index: 6, meal_type: 'breakfast', food_name: 'Phở', serving_g: 350, kcal: 430, protein_g: 26, carbs_g: 58, fat_g: 9, food_item_id: null },
    /* mp2 — hai ngày đầu, mỗi ngày hai trong bốn bữa. */
    ...[0, 1].flatMap((d) =>
      ['breakfast', 'lunch'].map((m, k) => ({
        id: `mj-${d}-${k}`, meal_plan_id: 'mp2', day_index: d, meal_type: m,
        food_name: 'Ức gà', serving_g: 200, kcal: 330, protein_g: 62, carbs_g: 0, fat_g: 7, food_item_id: null,
      })),
    ),
    /* mp3 — cố ý không có món nào. */
  ],
  weight_logs: [
    { id: 'g1', user_id: UID, weight_kg: 71.5, date: dayStr(0) },
    { id: 'g2', user_id: UID, weight_kg: 72.1, date: dayStr(7) },
    { id: 'g3', user_id: UID, weight_kg: 72.8, date: dayStr(21) },
  ],
  /*
    Ba lần đo vòng, vì trước ngày 24/09 bảng này KHÔNG có một hàng nào.

    Hệ quả: mọi ảnh dựng từng chụp mục Số đo chỉ chụp được trạng thái RỖNG —
    lưới số đo, biểu đồ xu hướng và bảng lịch sử chưa bao giờ được vẽ ra trên
    bộ chạy này, nên không ai nhìn thấy chúng trước khi lên máy thật. Đúng lúc
    ấy mục này được dời sang tab Tập luyện và dựng lại thành thẻ nhỏ, nên thiếu
    dữ liệu là thiết kế mù.

    Ba lần chứ không một: `MultiLineChart` cần ít nhất hai điểm mới vẽ được một
    đường, và bảng lịch sử cần nhiều hơn một dòng thì mới lộ ra chuyện cột lệch.
    Lần cũ nhất CỐ Ý bỏ trống bắp chân và vai — người thật không đo đủ mười hai
    chỗ mỗi lần, và một ô `null` phải được vẽ ra như ô trống chứ không như số 0.

    Đùi của lần mới nhất là 55,5 · 56,5 CÓ CHỦ Ý: đó là giá trị ghép dài nhất
    thẻ số đo phải chứa (11 ký tự, cả ở cm lẫn inch), nên bản dựng vẽ ra đúng
    ca xấu nhất thay vì một ca 9 ký tự luôn vừa.
  */
  /*
    Cộng đồng (giai đoạn 1). Từ #17 `applyQuery` lọc `eq`/`in`/`is`, nên
    fixture không còn phải xếp để lừa bộ chạy. Bản chú thích trước ghi "hồ sơ
    của UID đứng ĐẦU vì bộ chạy trả dòng đầu tiên" — và điều đó SAI: với hơn
    một dòng, `.maybeSingle()` ném PGRST116 chứ không lấy dòng đầu, nên hồ sơ
    của UID chưa từng đọc được trong một phép đo web nào (B tìm ra, #17).

    RLS thì bộ chạy KHÔNG mô phỏng: `community_likes`/`community_saves` vẫn
    chỉ chứa dòng của UID, và không có dòng nào mà người xem không được thấy.

    Ba người: chính mình, tài khoản ASCND chính thức (mẫu buổi tập, không có
    tạ), và một người dùng khác có buổi tập thật — tạ, tổng khối lượng, PR,
    chú thích, bình luận — để thẻ được vẽ ở cả hai hình dạng của nó.
  */
  community_profiles: [
    { user_id: UID, handle: 'kiet', display_name: 'Kiệt', bio: 'Push/Pull/Legs, 4 buổi mỗi tuần.', mascot_id: 'koa', is_official: false, created_at: day(20), updated_at: day(20) },
    { user_id: 'c0000000-0000-4000-8000-00000000a5cd', handle: 'ascnd', display_name: 'ASCND', bio: 'Buổi tập mẫu, thử thách và mẹo từ đội ngũ ASCND.', mascot_id: 'koa', is_official: true, created_at: day(60), updated_at: day(60) },
    { user_id: 'c0000000-0000-4000-8000-0000000011a1', handle: 'linh.pham', display_name: 'Linh Phạm', bio: '', mascot_id: 'blaze', is_official: false, created_at: day(40), updated_at: day(40) },
    { user_id: 'c0000000-0000-4000-8000-0000000022b2', handle: 'tuan.ng', display_name: 'Tuấn Nguyễn', bio: '', mascot_id: 'koa', is_official: false, created_at: day(30), updated_at: day(30) },
  ],
  community_follows: [
    { follower_id: UID, followee_id: 'c0000000-0000-4000-8000-0000000011a1', created_at: day(5) },
  ],
  /*
    Quyền riêng tư (#11): hai người đã chặn — một còn hồ sơ, một đã xoá hồ sơ
    (dòng chặn trỏ thẳng vào tài khoản nên vẫn còn), để hàng được vẽ ở cả hai
    hình dạng. Hồ sơ của người thứ nhất nằm CUỐI `community_profiles` để dòng
    đầu vẫn là của UID. Người ấy không có bài nào ở đây: bài của người bị chặn
    không bao giờ về tới client, và feed giả không lọc.
  */
  community_blocks: [
    { blocker_id: UID, blocked_id: 'c0000000-0000-4000-8000-0000000022b2', created_at: day(3) },
    { blocker_id: UID, blocked_id: 'c0000000-0000-4000-8000-0000000033c3', created_at: day(12) },
  ],
  community_settings: [{ user_id: UID, default_visibility: 'followers', updated_at: day(2) }],
  /*
    Hộp thông báo (#13): hai lượt thích CÙNG một bài (phải gộp thành "Linh và
    1 người khác"), một bình luận, một lượt theo dõi đã đọc. `post_id` trỏ vào
    một bài có sẵn chỉ để chạm mở được — hộp thư không vẽ nội dung bài, và
    thêm một bài của UID sẽ làm lệch mọi phép đo feed.
  */
  community_notifications: [
    { id: 'cn000000-0000-4000-8000-000000000001', user_id: UID, actor_id: 'c0000000-0000-4000-8000-0000000011a1', kind: 'like', post_id: 'cp000000-0000-4000-8000-000000000001', comment_id: null, created_at: day(0.02), read_at: null },
    { id: 'cn000000-0000-4000-8000-000000000002', user_id: UID, actor_id: 'c0000000-0000-4000-8000-00000000a5cd', kind: 'like', post_id: 'cp000000-0000-4000-8000-000000000001', comment_id: null, created_at: day(0.05), read_at: null },
    { id: 'cn000000-0000-4000-8000-000000000003', user_id: UID, actor_id: 'c0000000-0000-4000-8000-0000000011a1', kind: 'comment', post_id: 'cp000000-0000-4000-8000-000000000001', comment_id: 'cc000000-0000-4000-8000-000000000002', created_at: day(0.3), read_at: null },
    { id: 'cn000000-0000-4000-8000-000000000004', user_id: UID, actor_id: 'c0000000-0000-4000-8000-00000000a5cd', kind: 'follow', post_id: null, comment_id: null, created_at: day(2), read_at: day(1) },
  ],
  community_posts: [
    {
      id: 'cp000000-0000-4000-8000-000000000001', author_id: 'c0000000-0000-4000-8000-0000000011a1', kind: 'workout', source_id: 'c5000000-0000-4000-8000-000000000001',
      payload: {
        title: 'Push Day', performedAt: day(0.12), volumeKg: 12840, pr: true, minutes: 45, exerciseCount: 6,
        exercises: [
          { exerciseId: 'e1', exerciseName: 'Incline DB Press', library: true, sets: 4, weight: 24, reps: 10 },
          { exerciseId: 'e2', exerciseName: 'Flat DB Press', library: true, sets: 3, weight: 22, reps: 12 },
          { exerciseId: 'e3', exerciseName: 'Chest Machine Press', library: true, sets: 3, weight: 50, reps: 10 },
          { exerciseId: 'e4', exerciseName: 'Cable Fly', library: true, sets: 3, weight: 15, reps: 15 },
          { exerciseId: null, exerciseName: 'Lateral Raise', library: false, sets: 3, weight: 8, reps: 15 },
          { exerciseId: 'e6', exerciseName: 'Triceps Pushdown', library: true, sets: 3, weight: 25, reps: 12 },
        ],
      },
      caption: 'Cuối cùng cũng lên được incline hôm nay. Thấy khoẻ hơn hẳn 🔥', visibility: 'public',
      like_count: 128, comment_count: 2, save_count: 9, hidden: false, created_at: day(0.12),
    },
    {
      id: 'cp000000-0000-4000-8000-000000000002', author_id: 'c0000000-0000-4000-8000-00000000a5cd', kind: 'workout', source_id: null,
      payload: {
        title: 'Pull — Lưng dày', performedAt: day(1), volumeKg: 0, pr: false, minutes: 55, exerciseCount: 4,
        exercises: [
          { exerciseId: 'e7', exerciseName: 'Pull-up', library: true, sets: 4, weight: 0, reps: 6 },
          { exerciseId: 'e8', exerciseName: 'Barbell Row', library: true, sets: 4, weight: 0, reps: 8 },
          { exerciseId: 'e9', exerciseName: 'Lat Pulldown', library: true, sets: 3, weight: 0, reps: 10 },
          { exerciseId: 'e10', exerciseName: 'Dumbbell Curl', library: true, sets: 3, weight: 0, reps: 12 },
        ],
      },
      caption: 'Kéo xà trước khi mỏi, chèo tạ đòn giữ lưng thẳng. Chất lượng mỗi rep hơn số rep.', visibility: 'public',
      like_count: 86, comment_count: 0, save_count: 31, hidden: false, created_at: day(1),
    },
    /* Bài Progress (#8) — đúng mockup màn 4: 12 tuần, 52.1 → 55.4 kg, vòng eo
       và một bài sức mạnh, mỗi chuỗi một điểm mỗi tuần. */
    {
      id: 'cp000000-0000-4000-8000-000000000003', author_id: 'c0000000-0000-4000-8000-0000000011a1', kind: 'progress', source_id: null,
      payload: {
        weeks: 12, from: dayStr(84), to: dayStr(0),
        weight: { start: 52.1, end: 55.4, series: [52.1, 52.4, 52.6, 53.0, 53.1, 53.5, 53.9, 54.2, 54.6, 54.9, 55.1, 55.4] },
        waist: { start: 82.1, end: 80.0, series: [82.1, 81.9, 81.8, 81.5, 81.3, 81.1, 80.9, 80.7, 80.5, 80.4, 80.2, 80.0] },
        lift: { exerciseId: 'e11', name: 'Bench Press', start: 40, end: 55, series: [40, 42.5, 42.5, 45, 45, 47.5, 47.5, 50, 50, 52.5, 55, 55] },
      },
      caption: '12 tuần tập đều đặn. Vẫn còn nhiều việc phải làm nhưng rất tự hào về sự thay đổi này.', visibility: 'public',
      like_count: 342, comment_count: 0, save_count: 18, hidden: false, created_at: day(0.5),
    },
    /*
      Bài RECIPE (#7, người làm: B) — đúng hình mà `share_recipe` dựng phía
      server. Con số là của mockup (642 kcal · 52 · 68 · 17), và chúng ĐÚNG BẰNG
      tổng các dòng: 280+260+35+67 = 642, 45+5+2+0 = 52, 0+56+7+5 = 68,
      6+1+0+10 = 17. Một fixture có tổng lệch khỏi các dòng chính là thứ luật
      "số trên thẻ = tổng các dòng" sinh ra để bắt — nên nó không được lệch ở
      đây. Bốn nguyên liệu, để thẻ trên feed có cả dòng "+1 nguyên liệu khác".
      "Bơ" không có `grams`: một dòng gõ tay, và thẻ không được bịa ra khối
      lượng cho nó.
    */
    {
      id: 'cp000000-0000-4000-8000-000000000004', author_id: 'c0000000-0000-4000-8000-0000000011a1', kind: 'recipe', source_id: 'c3ea0000-0000-4000-8000-000000000001',
      payload: {
        title: 'High Protein Chicken Bowl', mealType: 'lunch',
        kcal: 642, protein: 52, carbs: 68, fat: 17, ingredientCount: 4,
        ingredients: [
          { name: 'Ức gà', grams: 180, kcal: 280, protein: 45, carbs: 0, fat: 6 },
          { name: 'Cơm trắng', grams: 200, kcal: 260, protein: 5, carbs: 56, fat: 1 },
          { name: 'Bông cải xanh', grams: 100, kcal: 35, protein: 2, carbs: 7, fat: 0 },
          { name: 'Bơ', grams: null, kcal: 67, protein: 0, carbs: 5, fat: 10 },
        ],
      },
      caption: 'Một bữa ăn đơn giản, dễ làm, giàu protein và rất phù hợp cho những ngày tập luyện.', visibility: 'public',
      like_count: 212, comment_count: 0, save_count: 24, hidden: false, created_at: day(0.6),
    },
  ],
  community_likes: [
    { post_id: 'cp000000-0000-4000-8000-000000000001', user_id: UID, created_at: day(0.1) },
  ],
  community_saves: [
    { post_id: 'cp000000-0000-4000-8000-000000000002', user_id: UID, created_at: day(0.9) },
    /* Thư viện Đã lưu (#10, B): bài Recipe (đăng day(0.6)) được lưu TRƯỚC bài
       Workout (đăng day(1)). Xếp theo lúc ĐĂNG thì Recipe đứng đầu; xếp theo
       lúc LƯU — thứ thư viện hứa — thì Workout đứng đầu. Hai thứ tự khác nhau
       là để phép đo phân biệt được chúng. */
    { post_id: 'cp000000-0000-4000-8000-000000000004', user_id: UID, created_at: day(0.95) },
  ],
  community_comments: [
    { id: 'cc000000-0000-4000-8000-000000000001', post_id: 'cp000000-0000-4000-8000-000000000001', author_id: UID, body: 'Incline 24kg × 10 là ngon rồi!', hidden: false, created_at: day(0.08) },
    { id: 'cc000000-0000-4000-8000-000000000002', post_id: 'cp000000-0000-4000-8000-000000000001', author_id: 'c0000000-0000-4000-8000-0000000011a1', body: 'Cảm ơn! Tuần sau thử 26.', hidden: false, created_at: day(0.05) },
  ],
  /* Thử thách (#9) chỉ được đọc qua RPC `community_challenges_overview`. Trước
     #38 RPC giả luôn trả `[]`, nên thẻ thử thách chưa từng được quét có dữ
     liệu. `tools/live-rpc.mjs` tính tổng quan TỪ hai bảng này: một thử thách
     đang chạy mà UID đã tham gia (tiến độ đếm từ `workout_sessions`), và một
     thử thách sắp mở mà UID chưa tham gia. */
  community_challenges: [
    {
      id: 'ch000000-0000-4000-8000-000000000001', title: '30 ngày kỷ luật',
      description: 'Tập ít nhất một buổi mỗi ngày. Ngày nào có buổi tập đã ghi thì được tính.',
      kind: 'workout_days', target: 30, starts_on: dayStr(20), ends_on: dayStr(-9), reward_coins: 300, created_at: day(25),
    },
    {
      id: 'c4a11e00-0000-4000-8000-000000000003', title: 'Tháng 7: 12 buổi',
      description: 'Mười hai ngày có tập trong một tháng.',
      kind: 'workout_days', target: 12, starts_on: dayStr(75), ends_on: dayStr(46), reward_coins: 150, created_at: day(80),
    },
    {
      id: 'ch000000-0000-4000-8000-000000000002', title: 'Tháng mới: 20 buổi',
      description: 'Hai mươi ngày có tập trong tháng tới.',
      kind: 'workout_days', target: 20, starts_on: dayStr(-7), ends_on: dayStr(-37), reward_coins: 200, created_at: day(3),
    },
  ],
  community_challenge_members: [
    { challenge_id: 'ch000000-0000-4000-8000-000000000001', user_id: UID, joined_at: day(20), claimed_at: null },
    { challenge_id: 'ch000000-0000-4000-8000-000000000001', user_id: 'c0000000-0000-4000-8000-0000000011a1', joined_at: day(19), claimed_at: null },
    /* #41: một thử thách UID đã HOÀN THÀNH và nhận thưởng, hết hạn 46 ngày
       trước — ngoài cửa sổ 7 ngày của tổng quan, nên nó chỉ sống trong
       `community_challenge_history`. */
    { challenge_id: 'c4a11e00-0000-4000-8000-000000000003', user_id: UID, joined_at: day(74), claimed_at: day(47) },
  ],
  /* Sổ xu: đúng MỘT dòng, là phần thưởng của thử thách đã nhận ở trên (#41) —
     lịch sử hiện số ĐÃ VÀO SỔ, nên thế giới giả phải có sổ để nó đọc. Ví xu
     của app cộng bảng này, nên ở chế độ đủ dữ liệu số dư là 150 thay vì 0. */
  mascot_transactions: [
    {
      id: 'c4a11e00-0000-4000-8000-0000000000f1', user_id: UID, amount: 150, reason: 'Thử thách: Tháng 7: 12 buổi',
      ref_key: 'cc:c4a11e00-0000-4000-8000-000000000003', created_at: day(47),
    },
  ],
  body_measurements: [
    {
      id: 'bm1', user_id: UID, date: dayStr(0), neck_cm: 37.5, shoulders_cm: 118, chest_cm: 99,
      waist_cm: 80.5, hips_cm: 95, bicep_left_cm: 34.5, bicep_right_cm: 35, thigh_left_cm: 55.5,
      thigh_right_cm: 56.5, calf_left_cm: 37, calf_right_cm: 37.5, body_fat_pct: 16.2, notes: null,
      created_at: day(0), updated_at: day(0),
    },
    {
      id: 'bm2', user_id: UID, date: dayStr(14), neck_cm: 37.5, shoulders_cm: 117, chest_cm: 98,
      waist_cm: 82, hips_cm: 95.5, bicep_left_cm: 34, bicep_right_cm: 34.5, thigh_left_cm: 55.5,
      thigh_right_cm: 56, calf_left_cm: 37, calf_right_cm: 37, body_fat_pct: 17.1, notes: null,
      created_at: day(14), updated_at: day(14),
    },
    {
      id: 'bm3', user_id: UID, date: dayStr(35), neck_cm: 38, shoulders_cm: null, chest_cm: 97,
      waist_cm: 84, hips_cm: 96, bicep_left_cm: 33.5, bicep_right_cm: 34, thigh_left_cm: 55,
      thigh_right_cm: 55.5, calf_left_cm: null, calf_right_cm: null, body_fat_pct: 18.4, notes: null,
      created_at: day(35), updated_at: day(35),
    },
  ],
  /*
    Two sessions, not one, and the second one is deliberately lighter.

    `sessions.tsx` draws each row's volume bar as `volume / peak`, so a fixture
    with a single session gives the only bar the runner can see a ratio of
    exactly 1 — permanently full, on every shot, forever. A full bar looks the
    same whether it grows from its left edge or from its own centre, so that
    fixture could not have caught `BarFill` losing `transformOrigin: 'left'`,
    which is the one way that component can draw a wrong quantity while
    type-checking clean and throwing nothing.

    3,200 / 8,450 is 38%: far enough from both ends that a wrong origin, a
    wrong clamp or a reversed direction all land somewhere visibly different.
  */
  /*
    The sessions carry real sets now, and there are enough of them to hold a
    trend.

    Two sessions with `sets: []` was enough for every screen that reads a
    session as a single row — the diary, the volume bar, the load windows — and
    it was nothing at all to Exercise Intelligence, which reads *inside* the
    sets and needs several sessions of the same movement before it will say
    anything. A fixture that produces INSUFFICIENT_DATA for every exercise
    cannot show whether the engine works.

    Two histories, chosen because they are the two the specification uses:
    a bench press that is progressing on reps at a fixed load, and a pull-up
    that is not moving. The pull-up is also the case where the body is the load,
    so it exercises the weigh-in lookup rather than only the arithmetic.
  */
  workout_sessions: [
    ...[
      /* days ago, bench reps, pull-up reps */
      [0.4, 10, 8],
      [2.4, 9, 8],
      [5.4, 9, 9],
      [8.4, 8, 8],
      [12.4, 8, 8],
      [15.4, 7, 9],
    ].map(([d, bench, pull], i) => ({
      id: `k${i + 1}`,
      user_id: UID,
      date_time: day(d),
      template_name: i % 2 === 0 ? 'Push A' : 'Pull A',
      volume_load: Math.round(55 * bench * 3),
      session_rpe: 7,
      sets: [
        /* A warm-up, so the flag is exercised on a real screen: it must not
           count toward the volume, the best set, or a record. */
        { exerciseId: '', exerciseName: 'Bench Press', setIndex: 0, weight: 30, reps: 12, warmup: true },
        ...Array.from({ length: 3 }, (_, n) => ({
          exerciseId: '', exerciseName: 'Bench Press', setIndex: n + 1, weight: 55, reps: bench,
        })),
        ...Array.from({ length: 3 }, (_, n) => ({
          exerciseId: '', exerciseName: 'Pull-up', setIndex: n + 4, weight: 0, reps: pull,
        })),
        /* A hold. Nothing else in this fixture has a duration, so without it the
           whole `timed` path — the kind, the seconds index, the card that shows
           them — is never drawn by anything. */
        { exerciseId: '', exerciseName: 'Plank', setIndex: 7, weight: 0, durationSec: 40 + (6 - i) * 4 },
        /*
          The one movement where the DECLARED kind and the inferred kind
          disagree, which is the only way a screenshot can show that the
          declaration is being read at all.

          A dumbbell curl is loaded, so inference calls it `compound` and
          computes an estimated one-rep-max for it. The library row says
          `isolation`, and `usesE1rm` refuses one — a curl's one-rep-max is not
          a smaller version of a squat's, it is a category error. Every other
          exercise in this fixture is classified the same either way, so without
          this row the authoritative branch was never drawn.
        */
        { exerciseId: '', exerciseName: 'Dumbbell Curl', setIndex: 8, weight: 12, reps: 10 + (6 - i) },
      ],
      source: 'manual',
    })),

  /*
    Two more histories, for the two states a screenshot could not otherwise
    reach: a movement abandoned months ago, and one whose sessions disagree.

    Both are cards that LOOK confident and must not be acted on, which is
    exactly the kind of thing only a rendered screen shows. They sit in their
    own sessions rather than in the six above, because a stale movement has to
    be absent from the recent ones to be stale at all.
  */
  ...[
    /* Overhead Press: four sessions, then nothing for ten weeks. */
    [96, 'Overhead Press', 35, 6],
    [89, 'Overhead Press', 35, 7],
    [82, 'Overhead Press', 35, 8],
    [75, 'Overhead Press', 35, 9],
    /*
      Lat Pulldown: trained recently, and the sessions disagree with each other.

      Every rep count is 10 or under on purpose. The first draft used 12 for one
      session and the estimate refused it — past `E1RM_MAX_REPS` there is no
      index — so that session was dropped, the series fell to three points, and
      the drawdown came out under the threshold. The fixture had stopped
      producing the state it existed to show.

      3 rather than 4 for the bad session, too: at 4 the drawdown is exactly
      15.0% and the rule is `> 15%`, so the fixture sat precisely on the
      boundary and produced neither state reliably. 3 gives 17.5%.
    */
    [24, 'Lat Pulldown', 50, 10],
    [17, 'Lat Pulldown', 50, 3],
    [10, 'Lat Pulldown', 50, 9],
    [3, 'Lat Pulldown', 50, 5],
  ].map(([d, name, w, r], i) => ({
    id: `x${i + 1}`,
    user_id: UID,
    date_time: day(d),
    template_name: name,
    volume_load: Math.round(w * r * 3),
    session_rpe: 7,
    sets: Array.from({ length: 3 }, (_, n) => ({
      exerciseId: '', exerciseName: name, setIndex: n + 1, weight: w, reps: r,
    })),
    source: 'manual',
  })),
  ],
  /*
    A library, so the DECLARED half of the taxonomy is exercised.

    `exercise_kind` is the authoritative answer and inference is the fallback;
    with no `exercises` rows at all, every screenshot in this repository was
    taken with inference doing the whole job, and the branch that reads a
    declaration had never been drawn. Plank is the case that matters: nothing in
    a duration says whether it is a hold or an isolation movement done slowly.
  */
  exercises: [
    { id: 'e1', user_id: null, name: 'Bench Press', muscle_group: 'Ngực', equipment: 'Barbell', exercise_kind: 'compound' },
    { id: 'e2', user_id: null, name: 'Pull-up', muscle_group: 'Lưng', equipment: 'Bodyweight', exercise_kind: 'bodyweight' },
    { id: 'e3', user_id: UID, name: 'Plank', muscle_group: 'Bụng', equipment: 'Bodyweight', exercise_kind: 'timed' },
    { id: 'e4', user_id: UID, name: 'Dumbbell Curl', muscle_group: 'Bắp tay trước', equipment: 'Dumbbell', exercise_kind: 'isolation' },
  ],
  /*
    A routine, so the week's day panel actually draws exercise rows.

    Every screenshot of Plan's day panel in this repository has been of a REST DAY:
    with no `routine_days` and no `workout_templates` in the fixture, the panel
    renders "this day has no workout on it" and the rows underneath — the set
    ticks, the effort chips, and now the trend chip beside each exercise name —
    have never once been drawn by anything.

    All seven days point at the same template on purpose: the harness runs on
    whatever weekday it happens to be, and a routine that only covers Monday
    produces a rest day six times out of seven.
  */
  workout_templates: [{
    id: 't1', user_id: UID, name: 'Push A', type: 'strength',
    created_at: day(30),
    exercises: [
      { exerciseName: 'Bench Press', sets: 3, reps: 10, weight: 55, rpe: 8, restSeconds: 120 },
      { exerciseName: 'Pull-up', sets: 3, reps: 8, weight: 0, rpe: 8, restSeconds: 120 },
      { exerciseName: 'Lat Pulldown', sets: 3, reps: 10, weight: 50, rpe: 7, restSeconds: 90 },
    ],
  }],
  routine_days: Array.from({ length: 7 }, (_, i) => ({
    id: `rd${i}`, user_id: UID, day_of_week: i, is_rest: false, is_deload: false,
    notes: '', template_id: 't1',
  })),
  /*
    ── hai bữa, và mỗi bữa CÓ MÓN ──

    Bảng này từng có `meal_entries` mà không có `meal_entry_items`, và hệ quả
    lớn hơn một dòng fixture thiếu: `live.mjs` **chưa bao giờ vẽ một thẻ bữa ăn
    có món**. Nhật ký mở ra rỗng ở mọi lượt chạy, nên phần mở thẻ, các hàng
    món, hai nút sửa/xoá trên từng hàng và sheet khẩu phần chưa từng được bộ
    chạy chạm tới — trong khi đó là đúng những thứ người dùng dùng để sửa một
    bữa ăn ghi nhầm.

    Tệ hơn: trạng thái mà bộ chạy ngồi trong suốt thời gian ấy — thẻ ghi đủ
    calo nhưng `0 món` — chính là trạng thái LỖI mà `useTodayLog` sinh ra khi
    nuốt lỗi đọc món. Bộ chạy sống trong bằng chứng của một lỗi mà không có
    cách nào nhận ra, vì nó không biết hình dạng ĐÚNG trông thế nào.

    Số liệu khớp theo HAI chiều, và cả hai đều cố ý:

      · tổng các món = tổng của bữa, từng macro một;
      · mỗi món tự khớp Atwater (P×4 + C×4 + F×9 = kcal của chính nó).

    Chiều thứ hai không bắt buộc với thức ăn thật — chất xơ, làm tròn, rượu đều
    làm lệch vài kcal — nhưng một fixture tự mâu thuẫn sẽ che đúng loại lỗi mà
    nhật ký sinh ra để bắt, nên ở đây nó khớp tuyệt đối.
  */
  /* Món của tôi (#49). Trước đây bảng này trống hoàn toàn trong thế giới giả,
     nên ngôi sao Yêu thích — một nút ghi có mặt trên tab Dinh dưỡng — chưa
     từng có mặt trong lượt quét nào, và không đo được nó làm gì khi mất mạng.
     Một món đã được yêu thích, một món chưa, một món của thư viện chung
     (`user_id` null) để `dedupeSeedShadows` có việc làm. */
  food_items: [
    {
      id: 'fi000000-0000-4000-8000-000000000001', user_id: UID, name: 'Cơm gà nhà làm', brand: null,
      serving_g: 350, kcal: 560, protein_g: 42, carbs_g: 68, fat_g: 12, fiber_g: 3, is_favorite: true,
      price_per_serving: null, tags: null, created_at: day(40), updated_at: day(5),
    },
    {
      id: 'fi000000-0000-4000-8000-000000000002', user_id: UID, name: 'Sinh tố chuối bơ đậu phộng', brand: null,
      serving_g: 400, kcal: 430, protein_g: 18, carbs_g: 55, fat_g: 16, fiber_g: 6, is_favorite: false,
      price_per_serving: null, tags: null, created_at: day(20), updated_at: day(20),
    },
    {
      id: 'fi000000-0000-4000-8000-000000000003', user_id: null, name: 'Yến mạch cán dẹt', brand: null,
      serving_g: 50, kcal: 190, protein_g: 7, carbs_g: 33, fat_g: 3.5, fiber_g: 5, is_favorite: false,
      price_per_serving: null, tags: null, created_at: day(300), updated_at: day(300),
    },
  ],
  meal_entries: [
    {
      id: 'm1', user_id: UID, date_time: day(0.25), meal_type: 'breakfast',
      total_kcal: 540, total_protein_g: 36, total_carbs_g: 63, total_fat_g: 16, total_fiber_g: 8,
    },
    {
      id: 'm2', user_id: UID, date_time: day(0.15), meal_type: 'lunch',
      total_kcal: 660, total_protein_g: 49, total_carbs_g: 71, total_fat_g: 20, total_fiber_g: 9,
    },
  ],
  meal_entry_items: [
    /* bữa sáng — 184+89+155+112 = 540 kcal · 36 P · 63 C · 16 F */
    { id: 'mi1', created_at: day(0.251), meal_entry_id: 'm1', food_name: 'Yến mạch 50g', servings: 1, kcal: 184, protein_g: 7, carbs_g: 30, fat_g: 4, fiber_g: 5 },
    { id: 'mi2', created_at: day(0.2503), meal_entry_id: 'm1', food_name: 'Sữa chua Hy Lạp 0% 150g', servings: 1, kcal: 89, protein_g: 15, carbs_g: 5, fat_g: 1, fiber_g: 0 },
    /* khẩu phần khác 1 — hàng DUY NHẤT hiện chữ `×2`, và là hàng để thử sheet
       sửa khẩu phần. Không có nó thì nhánh `it.servings !== 1` không bao giờ
       chạy trong bộ chạy. */
    { id: 'mi3', created_at: day(0.2496), meal_entry_id: 'm1', food_name: 'Trứng luộc', servings: 2, kcal: 155, protein_g: 13, carbs_g: 1, fat_g: 11, fiber_g: 0 },
    { id: 'mi4', created_at: day(0.2489), meal_entry_id: 'm1', food_name: 'Chuối', servings: 1, kcal: 112, protein_g: 1, carbs_g: 27, fat_g: 0, fiber_g: 3 },
    /* bữa trưa — 265+269+126 = 660 kcal · 49 P · 71 C · 20 F */
    { id: 'mi5', created_at: day(0.151), meal_entry_id: 'm2', food_name: 'Cơm trắng 200g', servings: 1, kcal: 265, protein_g: 8, carbs_g: 56, fat_g: 1, fiber_g: 1 },
    { id: 'mi6', created_at: day(0.1503), meal_entry_id: 'm2', food_name: 'Ức gà áp chảo 150g', servings: 1, kcal: 269, protein_g: 38, carbs_g: 0, fat_g: 13, fiber_g: 0 },
    { id: 'mi7', created_at: day(0.1496), meal_entry_id: 'm2', food_name: 'Rau xào 200g', servings: 1, kcal: 126, protein_g: 3, carbs_g: 15, fat_g: 6, fiber_g: 8 },
  ],
};
