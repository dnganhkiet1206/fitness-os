/**
 * Cái được phép rời khỏi máy người dùng — CHẠY THẬT.
 *
 * ── vì sao bước này tồn tại trước cả khi Sentry được cài ──
 *
 * Bộ lọc riêng tư là loại mã mà một lỗi không bao giờ tự khai. Nó không ném,
 * không làm app chậm, không hiện ra ở đâu — nó chỉ lặng lẽ để một thứ đi qua.
 * Và thứ đi qua thì đã đi rồi: gọi về được một bản sửa, không gọi về được một
 * lần gửi.
 *
 * Nên các ca ở đây không phải chuỗi bịa ra. Chúng là hình dạng THẬT mà app này
 * sinh ra: URL PostgREST với `user_id=eq.<uuid>`, một access token của Supabase,
 * một data URL ảnh của `scan-food`, đường dẫn ảnh tiến trình trong Storage.
 *
 * ── và phép thử ngược canh chiều còn lại ──
 *
 * Một bộ lọc ẩn quá tay cũng hỏng, chỉ theo cách khác: nó biến mọi báo cáo sự
 * cố thành "[đã ẩn]" và ngày cần đọc thì không đọc được gì. Nên mỗi luật đều có
 * một ca chứng minh phần PHẢI CÒN LẠI thì còn lại — tên tệp, tên hàm, số dòng,
 * đường dẫn bảng.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const want = (ok, msg) => { if (!ok) problems.push(msg); };

/* ── biên dịch module thật ra CommonJS rồi GỌI nó ─────────────────────────── */
const out = mkdtempSync(path.join(tmpdir(), 'scrub-'));
try {
  execFileSync('npx', ['tsc', 'src/lib/telemetry-scrub.ts',
    '--ignoreConfig', '--outDir', out, '--module', 'commonjs', '--target', 'es2022',
    '--skipLibCheck', '--lib', 'es2022,dom'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) {
  console.error('lọc telemetry: không biên dịch được src/lib/telemetry-scrub.ts');
  console.error(String(e.stdout || '') + String(e.stderr || ''));
  process.exit(1);
}
const req = createRequire(path.join(out, 'x.cjs'));
const { scrubText, scrubUrl, scrubEvent, REDACTED } = req('./telemetry-scrub.js');

/** Còn sót một thứ đáng lẽ phải ẩn? */
const leaks = (s, secret) => String(s).includes(secret);

/* ═══ 1. URL PostgREST — hình dạng thật của mọi truy vấn trong app ═══ */
{
  const UID = '6f1c2a3b-4d5e-6f70-8192-a3b4c5d6e7f8';
  const url = `https://abcdefghijklmno.supabase.co/rest/v1/daily_logs`
    + `?select=*&user_id=eq.${UID}&date=eq.2026-09-08`;
  const got = scrubUrl(url);
  want(!leaks(got, UID), `URL còn user_id: ${got}`);
  want(!leaks(got, '2026-09-08'), `URL còn ngày của người dùng: ${got}`);
  want(got.includes('/rest/v1/daily_logs'),
    `URL mất luôn đường dẫn: ${got} — bỏ hết thì một lỗi mạng không chẩn đoán được nữa, `
    + 'và bộ lọc ẩn quá tay cũng là một bộ lọc hỏng');
  want(got.endsWith('?…'), `URL không đánh dấu là ĐÃ CÓ query: ${got} — "không có tham số" và "có tham số đã bỏ" là hai chuyện khác nhau`);

  /* Không có query thì đừng bịa ra dấu. */
  const plain = scrubUrl('https://abcdefghijklmno.supabase.co/functions/v1/ai-coach');
  want(plain.endsWith('/functions/v1/ai-coach'), `URL không query bị thêm dấu: ${plain}`);

  /* UUID nằm trong PATH, không phải query — ảnh tiến trình trong Storage. */
  const storage = scrubUrl(`https://x.supabase.co/storage/v1/object/progress-photos/${UID}/2026-09-08.jpg`);
  want(!leaks(storage, UID), `đường dẫn Storage còn UUID: ${storage} — UUID ở đây nằm trong PATH chứ không trong query`);
  want(storage.includes('progress-photos'), `mất tên bucket: ${storage}`);

  /* Một chuỗi không phải URL không được làm ném từ trong bộ lọc — ném ở đây thì
     mất CẢ sự kiện, tức lỗi thật biến mất vì phép che nó. */
  let threw = null;
  try { scrubUrl('không phải url'); } catch (e) { threw = e; }
  want(threw === null, `scrubUrl ném trên một chuỗi không phải URL: ${threw}`);
}

/* ═══ 2. Khoá và token ═══ */
{
  const JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  for (const [label, text, secret] of [
    ['access token trong thông điệp', `PostgREST 401 với token ${JWT}`, JWT],
    ['header Authorization', `Authorization: Bearer ${JWT}`, JWT],
    ['bearer không phải JWT', 'Authorization: Bearer abc123def456ghi789', 'abc123def456ghi789'],
    ['khoá dạng mới', 'apikey=sb_publishable_AbCdEf123456789', 'sb_publishable_AbCdEf123456789'],
  ]) {
    const got = scrubText(text);
    want(!leaks(got, secret), `${label}: còn nguyên trong "${got}"`);
  }
  /* Và phần mô tả lỗi phải còn: một báo cáo chỉ có "[đã ẩn]" không dùng được. */
  want(scrubText(`PostgREST 401 với token ${JWT}`).includes('PostgREST 401'),
    'lọc token cũng nuốt luôn câu mô tả lỗi');
}

/* ═══ 3. Email và UUID ═══ */
{
  const got = scrubText('không đọc được hồ sơ của an.nguyen+test@example.com (6f1c2a3b-4d5e-6f70-8192-a3b4c5d6e7f8)');
  want(!leaks(got, 'an.nguyen+test@example.com'), `email còn nguyên: ${got}`);
  want(!leaks(got, '6f1c2a3b-4d5e-6f70-8192-a3b4c5d6e7f8'), `UUID còn nguyên: ${got}`);
  want(got.includes('không đọc được hồ sơ'), `mất câu mô tả: ${got}`);
}

/* ═══ 4. Ảnh của scan-food ═══

   Đây là ca nặng nhất và cũng là ca dễ quên nhất: `scan-food` gửi
   `image_base64`. Một chuỗi ấy lọt vào breadcrumb là BỨC ẢNH BỮA ĂN của người
   dùng nằm trong hệ thống theo dõi sự cố của bên thứ ba. */
{
  const blob = 'A'.repeat(4000);
  const got = scrubText(`gửi ảnh data:image/jpeg;base64,${blob} thất bại`);
  want(!leaks(got, blob), 'data URL ảnh còn nguyên trong thông điệp lỗi');
  want(got.includes('data:image/'),
    `mất luôn dấu vết là một bức ảnh: ${got.slice(0, 60)} — biết "một ảnh bị cắt" thì đọc được, một khối trống thì không`);
  want(got.length < 500, `thông điệp vẫn dài ${got.length} ký tự sau khi lọc`);

  /* Base64 trần, không có tiền tố `data:` — hình dạng mà `image_base64` đi qua
     JSON body. */
  const bare = scrubText(`{"image_base64":"${blob}"}`);
  want(!leaks(bare, blob), 'base64 trần (không tiền tố data:) còn nguyên');

  /* Và một từ dài bình thường KHÔNG được ẩn — ngưỡng phải là ngưỡng, không phải
     một cái lưới bắt mọi thứ. */
  const word = 'ReadinessGaugeComponentDidCatchError';
  want(scrubText(`lỗi ở ${word}`).includes(word), `tên hàm dài bị ẩn nhầm: ${scrubText(`lỗi ở ${word}`)}`);
}

/* ═══ 5. Thứ tự luật: JWT phải bị bắt TRƯỚC base64 chung ═══

   Một JWT cũng là ba khối base64. Nếu luật rộng chạy trước, thông điệp chỉ còn
   một khối "[đã ẩn]" và không ai biết cái vừa bị ẩn là một KHOÁ hay một bức
   ảnh — hai chuyện cần hai phản ứng khác nhau. */
{
  const JWT = `eyJ${'a'.repeat(200)}.eyJ${'b'.repeat(200)}.${'c'.repeat(200)}`;
  const got = scrubText(JWT);
  want(got.includes('jwt'),
    `một JWT dài bị ẩn như một blob: ${got} — thứ tự luật sai thì báo cáo không phân biệt được khoá với ảnh`);
}

/* ═══ 6. scrubEvent — toàn bộ sự kiện ═══ */
{
  const UID = '6f1c2a3b-4d5e-6f70-8192-a3b4c5d6e7f8';
  const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.aaaaaaaaaaaa';
  const ev = {
    message: `hỏng cho ${UID}`,
    exception: { values: [{ type: 'TypeError', value: `null tại /rest/v1/weight_logs?user_id=eq.${UID}` }] },
    breadcrumbs: [
      { message: 'fetch', data: { url: `https://x.supabase.co/rest/v1/sleep_logs?user_id=eq.${UID}`, method: 'GET' } },
      { message: `đăng nhập ai@example.com`, data: { token: JWT } },
    ],
    request: {
      url: `https://x.supabase.co/rest/v1/daily_logs?user_id=eq.${UID}`,
      query_string: `user_id=eq.${UID}`,
      data: { weight_kg: 61.4, hrv: 48 },
      headers: { apikey: JWT, Authorization: `Bearer ${JWT}` },
    },
    user: { id: UID, email: 'ai@example.com', ip_address: '203.0.113.7' },
    extra: { screen: 'today', note: `mở bởi ${UID}` },
    contexts: { app: { app_version: '1.4.0' } },
  };
  const got = scrubEvent(ev);
  const flat = JSON.stringify(got);

  want(!leaks(flat, UID), `sự kiện còn UUID ở đâu đó: ${flat.slice(0, 200)}`);
  want(!leaks(flat, JWT), 'sự kiện còn token');
  want(!leaks(flat, 'ai@example.com'), 'sự kiện còn email');
  want(!leaks(flat, '203.0.113.7'), 'sự kiện còn địa chỉ IP');
  want(!leaks(flat, '61.4') && !leaks(flat, '"hrv"'),
    'thân request còn dữ liệu sức khoẻ — thân của app này TOÀN LÀ dữ liệu sức khoẻ, nên nó bị bỏ hẳn chứ không lọc');
  want(got.user === undefined, `còn khối user: ${JSON.stringify(got.user)}`);
  want(got.request && got.request.query_string === undefined && got.request.headers === undefined,
    `request còn query_string hoặc headers: ${JSON.stringify(got.request)}`);

  /* …và phần chẩn đoán được thì PHẢI còn. */
  want(got.exception.values[0].type === 'TypeError', 'mất kiểu ngoại lệ');
  want(flat.includes('weight_logs') && flat.includes('sleep_logs'),
    'mất tên bảng — đó là thứ nói lên lỗi nằm ở đâu, và nó không nói người dùng nào');
  want(flat.includes('1.4.0'), 'mất số phiên bản app trong contexts');
  want(flat.includes('today'), 'mất tên màn hình trong extra');
  want(got.breadcrumbs[0].data.method === 'GET', 'mất method của breadcrumb');

  want(scrubEvent(null) === null, 'scrubEvent(null) phải là null');
  want(scrubEvent(undefined) === null, 'scrubEvent(undefined) phải là null');
  /* Một sự kiện trống vẫn phải đi — một lỗi không có chi tiết vẫn là một lỗi. */
  want(scrubEvent({}) !== null, 'scrubEvent({}) trả null — một sự kiện bị chặn là một lỗi không ai biết');
}

/* ═══ 7. Bộ lọc phải được NỐI VÀO, không chỉ tồn tại ═══

   Ngày Sentry được cài, `scrubEvent` phải là `beforeSend`. Một bộ lọc viết xong
   rồi để đó là bộ lọc không lọc gì — và đó là một chế độ hỏng lặng lẽ hơn hẳn
   việc không có bộ lọc, vì có tệp thì người ta tin là đã xong.

   Hôm nay chưa có SDK nên luật này chỉ canh chiều ngược: nếu Sentry ĐÃ được cài
   mà `scrubEvent` không được truyền vào `beforeSend`, đỏ. */
{
  const { readFileSync, existsSync } = await import('node:fs');
  const pkg = JSON.parse(readFileSync(path.join(NATIVE, 'package.json'), 'utf8'));
  const hasSdk = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
    .some((d) => /^@sentry\//.test(d));
  if (hasSdk) {
    const { readdirSync, statSync } = await import('node:fs');
    const src = path.join(NATIVE, 'src');
    let wired = false;
    const walk = (d) => {
      for (const e of readdirSync(d)) {
        const f = path.join(d, e);
        if (statSync(f).isDirectory()) { walk(f); continue; }
        if (!/\.tsx?$/.test(f)) continue;
        const t = readFileSync(f, 'utf8');
        if (/beforeSend/.test(t) && /scrubEvent/.test(t)) wired = true;
      }
    };
    if (existsSync(src)) walk(src);
    want(wired,
      'SDK theo dõi sự cố đã được cài nhưng `scrubEvent` không được truyền làm `beforeSend` ở đâu cả — '
      + 'một bộ lọc không được nối vào thì mọi thứ tệp này liệt kê đều đang rời khỏi máy người dùng');
  }
}

if (problems.length) {
  console.error('lọc telemetry CÓ LỖI:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  `lọc telemetry OK — CHẠY THẬT scrubText/scrubUrl/scrubEvent trên hình dạng dữ liệu mà chính app này sinh ra. `
  + 'URL PostgREST bỏ SẠCH query (một danh sách "tham số được phép" sẽ luôn trễ hơn mã một nhịp, vì PostgREST '
  + 'đặt cả bộ lọc vào query) và giữ đường dẫn; UUID trong PATH của ảnh Storage cũng bị ẩn. JWT, Bearer, khoá '
  + 'sb_*, email, UUID đều không rời máy — và JWT bị bắt TRƯỚC luật base64 chung, nếu không một khoá và một bức '
  + 'ảnh sẽ ẩn thành cùng một khối. Ảnh của scan-food: cả data URL lẫn base64 trần đều bị cắt, còn lại dấu vết '
  + '"đây là một ảnh". Toàn sự kiện: user bị bỏ HẲN (id là UUID tài khoản, nó nối báo cáo sự cố với hồ sơ sức '
  + 'khoẻ), thân + query + header của request bị bỏ hẳn (thân app này toàn là dữ liệu sức khoẻ). Và chiều ngược '
  + 'được canh bằng số ca riêng: tên tệp, tên bảng, kiểu ngoại lệ, method, phiên bản app và tên màn hình đều '
  + `PHẢI còn — một bộ lọc ẩn quá tay cũng là một bộ lọc hỏng. Dấu ẩn: ${REDACTED}`,
);
