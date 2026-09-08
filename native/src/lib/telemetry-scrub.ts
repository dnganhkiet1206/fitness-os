/**
 * Cái được phép rời khỏi máy người dùng khi app chết.
 *
 * ── vì sao tệp này tồn tại TRƯỚC khi Sentry được cài ──
 *
 * Một dịch vụ theo dõi sự cố gửi đi nhiều hơn hẳn cái người ta tưởng nó gửi.
 * SDK của React Native tự thêm breadcrumb cho mọi lời gọi mạng, và mạng của app
 * này là PostgREST — nên một URL bình thường của nó trông như:
 *
 *     https://<ref>.supabase.co/rest/v1/daily_logs?select=*
 *       &user_id=eq.6f1c…&date=eq.2026-09-08
 *
 * Tức là: người này là ai, họ đọc BẢNG SỨC KHOẺ nào, và vào ngày nào. Không lỗi
 * nào cần ba thứ đó để chẩn đoán được, nhưng cả ba sẽ đi cùng mọi báo cáo nếu
 * không ai chặn.
 *
 * Nặng hơn: `scan-food` gửi `image_base64`. Một chuỗi base64 lọt vào thông điệp
 * lỗi hay một breadcrumb là **bức ảnh bữa ăn của người dùng** nằm trong một hệ
 * thống theo dõi sự cố.
 *
 * Nên bộ lọc được viết và kiểm TRƯỚC, không phải sau. Bật theo dõi rồi mới lọc
 * là đã gửi đi một lần rồi — và cái đã gửi thì không gọi về được.
 *
 * ── vì sao nó không import Sentry ──
 *
 * Không một dòng nào ở đây phụ thuộc vào SDK. Ba lý do, và lý do thứ ba là lý
 * do thật:
 *
 *   1. Nó chạy và kiểm được ở máy này, nơi không dựng được bản native.
 *   2. Đổi nhà cung cấp theo dõi sự cố không phải viết lại luật riêng tư.
 *   3. Luật riêng tư không nên nằm trong tay thứ nó đang canh.
 *
 * Kiểu dữ liệu bên dưới là kiểu CẤU TRÚC, khớp với hình dạng `beforeSend` của
 * Sentry mà không cần biết tên nó. Ngày cài SDK, nó được truyền thẳng vào.
 *
 * ── và cái nó KHÔNG làm ──
 *
 * Nó không ẩn danh hoá. Một stack trace vẫn nói tên tệp và tên hàm, và đó chính
 * là thứ cần gửi. Việc của nó hẹp hơn: **không để dữ liệu của NGƯỜI DÙNG đi
 * cùng dữ liệu của LỖI.**
 */

/** Hình dạng tối thiểu của một sự kiện — khớp cấu trúc với Sentry, không import. */
export interface Crumb {
  message?: unknown;
  data?: Record<string, unknown>;
  [k: string]: unknown;
}

export interface TelemetryEvent {
  message?: unknown;
  exception?: { values?: { type?: unknown; value?: unknown }[] };
  breadcrumbs?: Crumb[];
  request?: { url?: unknown; query_string?: unknown; data?: unknown; headers?: unknown };
  user?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  [k: string]: unknown;
}

export const REDACTED = '[đã ẩn]';

/*
  Thứ tự các luật ở đây có ý nghĩa, và nó là thứ tự TỪ HẸP TỚI RỘNG.

  JWT phải bị bắt trước base64 chung, vì một JWT CŨNG là ba khối base64 — để
  luật rộng chạy trước thì thông điệp chỉ còn "[đã ẩn]" và không ai biết cái vừa
  bị ẩn là một khoá hay một bức ảnh. Và UUID phải bắt trước chuỗi hex dài, cùng
  lý do.
*/
const RULES: [RegExp, string][] = [
  /* JWT: `eyJ` + hai dấu chấm. Cả anon key lẫn access token của người dùng đều
     có hình dạng này, và cả hai đều không bao giờ được rời máy qua đường này. */
  [/\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]+/g, `${REDACTED}:jwt`],
  /* `Bearer <gì đó>` — kể cả khi phần sau không phải JWT. */
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, `Bearer ${REDACTED}`],
  /* Khoá API của Supabase ở dạng mới. */
  [/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]{8,}/g, `${REDACTED}:key`],
  /* Email. Người dùng đăng nhập bằng email, nên nó là ĐỊNH DANH, không phải một
     chuỗi ngẫu nhiên. */
  [/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, `${REDACTED}:email`],
  /* UUID — `user_id` của mọi bảng trong app này. */
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, `${REDACTED}:id`],
  /* Data URL của ảnh: cắt TRƯỚC luật base64 chung để phần `data:image/jpeg`
     còn lại — biết đó là một bức ảnh bị cắt thì đọc được, còn một khối
     "[đã ẩn]" trần thì không. */
  [/\bdata:image\/[a-z+]+;base64,[A-Za-z0-9+/=\s]+/gi, `data:image/…;base64,${REDACTED}`],
  /* Và mọi khối base64 dài còn lại. Ngưỡng 120 ký tự: đủ dài để không phải một
     từ tình cờ, đủ ngắn để bắt được một mảnh ảnh bị cắt cụt trong log. */
  [/[A-Za-z0-9+/]{120,}={0,2}/g, `${REDACTED}:blob`],
];

/**
 * Một chuỗi bất kỳ, đã bỏ những thứ không được rời máy.
 *
 * Cắt ở 2000 ký tự SAU khi lọc: một thông điệp dài hơn thế gần như luôn là dữ
 * liệu bị dán vào chứ không phải một câu mô tả lỗi, và cắt trước khi lọc thì
 * một khối bị cắt đôi sẽ không còn khớp luật nào.
 */
export function scrubText(value: unknown): string {
  if (typeof value !== 'string') return typeof value === 'undefined' ? '' : String(value);
  let out = value;
  for (const [re, to] of RULES) out = out.replace(re, to);
  return out.length > 2000 ? `${out.slice(0, 2000)}…` : out;
}

/**
 * Một URL, còn lại đủ để biết app đang gọi CÁI GÌ và không hơn.
 *
 * ── vì sao bỏ SẠCH query chứ không lọc từng tham số ──
 *
 * Một danh sách "tham số được phép" là một danh sách phải nhớ cập nhật, và chỗ
 * quên cập nhật thì im lặng. PostgREST lại đặt cả bộ lọc vào query, nên tham số
 * mới xuất hiện mỗi lần ai đó viết một truy vấn mới — tức danh sách ấy sẽ luôn
 * trễ hơn mã một nhịp.
 *
 * Đường dẫn thì giữ: `/rest/v1/daily_logs` nói đủ để chẩn đoán một lỗi mạng, và
 * nó không nói người dùng nào.
 */
export function scrubUrl(value: unknown): string {
  const raw = typeof value === 'string' ? value : String(value ?? '');
  if (!raw) return '';
  /* `URL` có ở cả Hermes lẫn web. Nhưng một breadcrumb có thể mang một chuỗi
     không phải URL, và ném từ trong bộ lọc thì cả sự kiện mất — nên nó rơi về
     phép lọc chữ thay vì rơi ra ngoài. */
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return scrubText(raw);
  }
  const hadQuery = u.search.length > 0;
  /* Đường dẫn vẫn phải qua bộ lọc: ảnh tiến trình nằm ở
     `/storage/v1/object/progress-photos/<uuid>/…`, tức UUID nằm trong PATH. */
  return `${u.origin}${scrubText(u.pathname)}${hadQuery ? '?…' : ''}`;
}

/**
 * Một breadcrumb đã lọc.
 *
 * ── vì sao nó là một hàm RIÊNG, không chỉ là một vòng lặp trong `scrubEvent` ──
 *
 * Với một sự cố JS, `beforeSend` thấy cả sự kiện và lọc là đủ. Với một sự cố
 * NATIVE thì không: tiến trình chết, không mã JS nào chạy, và báo cáo được lớp
 * native dựng lên rồi gửi ở lần mở app sau. `beforeSend` của JS **không bao giờ
 * chạy cho nó**.
 *
 * Nhưng breadcrumb thì đi sang native TRƯỚC đó — SDK chuyển tiếp từng cái qua
 * `RNSentry.addBreadcrumb` để lớp native có ngữ cảnh khi nó tự dựng báo cáo.
 * Trên đường ấy có đúng một chỗ chặn được: `beforeBreadcrumb`.
 *
 * Nên hàm này là biên riêng tư cho lớp lỗi mà cả `crash-log.ts` lẫn error
 * boundary đều không với tới được — tức đúng lớp lỗi của A9, và đúng lý do
 * Sentry được thêm vào.
 */
export function scrubBreadcrumb(b: Crumb): Crumb {
  const data = b.data ? { ...b.data } : undefined;
  if (data) {
    /* `url` là trường mà SDK tự điền cho mọi lời gọi mạng — chỗ rò nhiều nhất,
       và chỗ duy nhất cần biết tên riêng. */
    if ('url' in data) data.url = scrubUrl(data.url);
    for (const k of Object.keys(data)) {
      if (k !== 'url' && typeof data[k] === 'string') data[k] = scrubText(data[k]);
    }
  }
  return { ...b, message: scrubText(b.message), ...(data ? { data } : {}) };
}

/**
 * Sự kiện đã lọc — hoặc `null` để KHÔNG gửi gì cả.
 *
 * Truyền thẳng làm `beforeSend`. Trả `null` chỉ khi sự kiện không còn nghĩa gì,
 * chứ không phải khi nó chứa dữ liệu nhạy cảm: một sự kiện bị chặn là một lỗi
 * không ai biết, và mục đích của cả việc này là để lỗi khai được tên nó.
 */
export function scrubEvent(event: TelemetryEvent | null | undefined): TelemetryEvent | null {
  if (!event) return null;
  const e: TelemetryEvent = { ...event };

  if ('message' in e) e.message = scrubText(e.message);

  if (e.exception?.values) {
    e.exception = {
      ...e.exception,
      values: e.exception.values.map((v) => ({ ...v, value: scrubText(v.value) })),
    };
  }

  if (Array.isArray(e.breadcrumbs)) e.breadcrumbs = e.breadcrumbs.map(scrubBreadcrumb);

  if (e.request) {
    /*
      Thân và query của request bị BỎ HẲN, không lọc.

      Thân của một request trong app này là dữ liệu sức khoẻ — đó là toàn bộ nội
      dung của nó, không phải một phần phụ. Lọc một thứ mà mọi trường đều nhạy
      cảm thì phần còn lại vô nghĩa, và giữ nó lại chỉ để chờ một luật lọc bị
      sót. Header cũng bỏ: `apikey` và `Authorization` ở trong đó.
    */
    e.request = { url: scrubUrl(e.request.url) };
  }

  /*
    Người dùng: không gửi gì cả.

    Ngay cả `id` — nó là UUID của tài khoản, nên nó nối một báo cáo sự cố với một
    hồ sơ sức khoẻ trong cùng một cơ sở dữ liệu. Cái mất là câu "bao nhiêu người
    dính lỗi này", và đó là một cái mất THẬT. Cách lấy lại nó mà không nối vào
    tài khoản là một mã ngẫu nhiên theo LẦN CÀI, sinh tại máy và không bao giờ
    gửi lên đâu khác — chưa làm ở đây vì chưa cần, và ghi ra để người sau khỏi
    tưởng dòng này là một sơ suất.
  */
  if (e.user) delete e.user;

  /* `extra` và `contexts` là nơi mã của app tự nhét thứ nó muốn vào. Hôm nay
     app không nhét gì, nhưng luật phải có trước chứ không phải sau lần đầu ai
     đó nhét. Lọc chứ không bỏ: chúng cũng là nơi đặt số phiên bản, cờ tính
     năng — thứ vô hại và có ích. */
  for (const bag of ['extra', 'contexts'] as const) {
    const v = e[bag];
    if (v && typeof v === 'object') {
      const copy: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        copy[k] = typeof val === 'string' ? scrubText(val) : val;
      }
      e[bag] = copy;
    }
  }

  return e;
}
