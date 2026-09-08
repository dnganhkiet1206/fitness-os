import * as Sentry from '@sentry/react-native';

import { scrubBreadcrumb, scrubEvent, type Crumb, type TelemetryEvent } from '@/lib/telemetry-scrub';

/**
 * Chỗ app kể lại chuyện nó chết, cho lớp lỗi mà JS không nghe thấy.
 *
 * ── vì sao thêm một dịch vụ ngoài, sau khi đã có hai lớp bắt lỗi ──
 *
 * App đã có `crash-log.ts` (ErrorUtils) và `AppErrorBoundary` (React). Cả hai
 * đều là mã JS, và **cả hai đều mù với đúng lớp lỗi đã xảy ra thật**: A9 là một
 * `EXC_BAD_ACCESS` ở tầng native. Tiến trình chết. Không có JS nào chạy sau đó,
 * nên không có gì để ghi và không có gì để bắt.
 *
 * Cách duy nhất để chẩn đoán A9, ghi trong `SO-GHI-LOI.md`, là chủ dự án cầm
 * máy và tự đọc **Cài đặt → Quyền riêng tư → Dữ liệu phân tích** của iOS. Đó
 * không phải một quy trình; đó là chỗ trống mà tệp này lấp.
 *
 * ── và vì sao nó KHÔNG làm gì khi chưa có DSN ──
 *
 * Không đặt `EXPO_PUBLIC_SENTRY_DSN` thì hàm này trả về ngay và app chạy y hệt
 * hôm nay — không một request nào, không một byte nào rời máy. Đó là điều kiện
 * để thêm một dịch vụ theo dõi vào một app đang chạy được: bản không cấu hình
 * phải bằng đúng bản trước khi có nó.
 *
 * ── hai móc, không phải một, và lý do nằm ở chữ "native" ──
 *
 * `beforeSend` chỉ chạy cho những sự kiện mà **JS còn sống** để xử lý. Một sự cố
 * native thì không: lớp native bắt nó, dựng báo cáo, và gửi ở lần mở app sau —
 * `beforeSend` của JS không bao giờ chạy cho nó.
 *
 * Thứ DUY NHẤT của JS còn đi được vào một báo cáo như thế là breadcrumb, vì SDK
 * chuyển tiếp từng cái sang native lúc chúng xảy ra. Nên `beforeBreadcrumb` là
 * chỗ chặn duy nhất cho lớp lỗi mà cả tệp này sinh ra để phục vụ.
 *
 * Bỏ nó đi thì Sentry vẫn "chạy", vẫn gửi được sự cố native, và mỗi báo cáo
 * mang theo một chuỗi URL PostgREST có `user_id=eq.<uuid>` cùng tên bảng sức
 * khoẻ. Đó là chế độ hỏng tệ nhất ở đây: nó trông như thành công.
 */

/** Không có DSN thì không có gì cả. Đọc một lần, ở chỗ duy nhất biết. */
const dsn = () => process.env.EXPO_PUBLIC_SENTRY_DSN?.trim() || null;

let started = false;

export function initObservability(): void {
  if (started) return;
  const url = dsn();
  if (!url) return;
  started = true;

  Sentry.init({
    dsn: url,

    /*
      Mặc định của Sentry cho `sendDefaultPii` là false, và ở đây nó được VIẾT RA
      chứ không để mặc định lo. Một giá trị mặc định đúng hôm nay là một giá trị
      có thể đổi ở bản sau mà không ai đọc changelog; một dòng viết thẳng thì
      không đổi sau lưng. Nó chặn IP và header của request.
    */
    sendDefaultPii: false,

    /*
      KHÔNG chụp màn hình, KHÔNG cây view, KHÔNG replay.

      Ba thứ này là những tính năng thật của SDK và ở một app khác chúng đáng
      bật. Ở đây màn hình app LÀ dữ liệu sức khoẻ — cân nặng, calo, giấc ngủ,
      ảnh bữa ăn — nên một ảnh chụp màn hình lúc sự cố là hồ sơ sức khoẻ gửi ra
      ngoài, và không bộ lọc chữ nào đọc được một tấm ảnh.

      Chúng mặc định đã tắt. Viết ra vì cùng lý do với `sendDefaultPii`.
    */
    attachScreenshot: false,
    attachViewHierarchy: false,

    /*
      Không lấy mẫu hiệu năng. Trace mang theo tên và tham số của mọi request,
      tức đúng thứ bộ lọc đang phải gỡ ra — và thứ cần ở đây là SỰ CỐ, không
      phải biểu đồ độ trễ. Bật nó là mở một đường rò thứ hai để lấy một thứ chưa
      ai hỏi.
    */
    tracesSampleRate: 0,
    enableAutoPerformanceTracing: false,

    /*
      Sự kiện phía JS.

      Hai lần `as unknown as` là CỐ Ý, không phải cẩu thả. `telemetry-scrub.ts`
      không import Sentry — đó là điều kiện để luật riêng tư không nằm trong tay
      thứ nó đang canh, và để đổi nhà cung cấp không phải viết lại luật. Cái giá
      là hai kiểu dữ liệu mô tả cùng một hình dạng lúc chạy nhưng đến từ hai hệ
      kiểu độc lập, nên TypeScript không nối được chúng.

      Phép ép nằm ở ĐÂY, đúng một chỗ, thay vì làm `TelemetryEvent` nới lỏng ra
      cho khớp — nới lỏng nó là làm yếu chính bộ lọc để việc nối vào dễ hơn.
    */
    beforeSend: (event) => scrubEvent(event as unknown as TelemetryEvent) as unknown as typeof event,

    /*
      Và đây là móc quan trọng hơn — xem phần đầu tệp. Nó chạy TRƯỚC khi
      breadcrumb sang native, nên nó là thứ duy nhất bảo vệ được một báo cáo sự
      cố native, thứ mà `beforeSend` không bao giờ thấy.
    */
    beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb as unknown as Crumb) as unknown as typeof crumb,
  });
}
