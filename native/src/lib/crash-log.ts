import AsyncStorage from '@react-native-async-storage/async-storage';

import { scrubText } from '@/lib/telemetry-scrub';

/**
 * Cái app ghi lại khi nó chết.
 *
 * ── vì sao tệp này tồn tại ──
 *
 * Người dùng báo: "thi thoảng tôi chạm vào vùng này thì app bị crash". Tôi thử
 * bốn giả thuyết và **cả bốn đều bị bác bằng phép đo**:
 *
 *   · chữ huy chương rỗng      → 29/29 khoá đều có chữ
 *   · thiếu chuỗi i18n cho nhận xét ngủ → cả năm khoá đều có ở hai bảng
 *   · lỗi JS khi chạm          → 24 lần chạm + vuốt trên bản dựng, 0 lỗi
 *   · NaN lọt vào hình học SVG → 20 lần chạm, 0 thuộc tính hình học nào hỏng
 *
 * Rồi tôi đi tìm xem app ghi lại cái gì khi nó chết, và câu trả lời là KHÔNG
 * GÌ CẢ: `src/` không có `ErrorBoundary`, không `ErrorUtils.setGlobalHandler`,
 * không Sentry/Crashlytics. Ở bản dev thì lỗi hiện ra một hộp đỏ rồi biến mất
 * cùng lần tải lại; ở bản phát hành thì app đóng lặng lẽ.
 *
 * Nên không phải "tôi chưa tìm ra nguyên nhân" — mà là **không ai tìm được**,
 * kể cả người đang cầm máy. Thứ thiếu không phải một bản sửa, mà là một chỗ
 * để lỗi tự khai tên.
 *
 * ── vì sao KHÔNG nuốt lỗi ──
 *
 * Handler này ghi rồi GỌI TIẾP handler cũ. Nuốt đi thì hộp đỏ của bản dev biến
 * mất và mọi lỗi trở nên khó thấy hơn trước — đúng cái bẫy mà `catch {}` ở nút
 * chia sẻ huy chương vừa phải sửa trong phiên này.
 *
 * ── vì sao ghi xuống đĩa chứ không giữ trong bộ nhớ ──
 *
 * Vì lỗi chí mạng thì tiến trình kết thúc ngay sau đó. Thứ còn lại sau khi app
 * chết là thứ duy nhất đọc được ở lần mở sau, và lần mở sau là lần duy nhất còn
 * có người để đọc nó.
 */

const KEY = 'ascnd_crash_log';
/** Giữ năm lần gần nhất: đủ để thấy một lỗi LẶP LẠI, chưa đủ để thành một tệp. */
const KEEP = 5;

/*
  Mọi mục ghi vào đây đều đi qua bộ lọc riêng tư — và lý do nằm ở
  `settings.tsx:126`.

  Nhật ký này KHÔNG ở lại trên máy. Màn Cài đặt có nút "chạm để gửi đi", và nó
  gọi `Share.share({ message: … })` với toàn bộ nội dung. Tức đây là một đường
  telemetry thật, chỉ khác là người bấm nút là người dùng chứ không phải app.

  Thông điệp và stack của một lỗi thật mang theo những gì lỗi ấy chạm vào: một
  URL PostgREST có `user_id=eq.<uuid>`, một câu 401 kèm access token, một
  `image_base64` của scan-food. Người dùng gửi nhật ký cho ai đó để nhờ giúp thì
  họ đang gửi cả những thứ ấy, mà không biết.

  Nên lọc ở CHỖ GHI, không ở chỗ chia sẻ: một đường gửi thứ hai được thêm sau
  này sẽ tự động sạch, còn một bộ lọc đặt ở nút chia sẻ thì không.
*/
export interface CrashEntry {
  at: string;
  fatal: boolean;
  message: string;
  /** Cắt ngắn: một stack đầy đủ của bundle đã minify dài hàng chục nghìn ký tự,
     và phần nói lên điều gì luôn nằm ở đầu. */
  stack: string;
}

export async function readCrashLog(): Promise<CrashEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    /* Bản ghi hỏng không được làm hỏng lần mở app. */
    return [];
  }
}

export async function clearCrashLog(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    /* không xoá được thì thôi — nó chỉ là nhật ký */
  }
}

/**
 * Hàng đợi ghi, và nó KHÔNG phải cho gọn.
 *
 * ── lỗi mà phép thử bắt được ──
 *
 * Bản đầu là `đọc → unshift → ghi`, bất đồng bộ, không xếp hàng.
 * `tools/crash-log.mjs` ném tám lỗi liên tiếp và nhật ký còn lại **hai** mục:
 * cả tám lần `append` cùng đọc một danh sách rồi mỗi lần ghi đè lên lần trước —
 * lost update kinh điển.
 *
 * Nó không phải một tình huống bịa ra. Một sự cố thật hiếm khi là MỘT lỗi: lỗi
 * gốc ném ra, rồi React ném tiếp khi dựng lại cây, rồi một effect nữa. Chúng
 * cách nhau vài mili giây, và thứ bị mất trong cuộc đua là mục ĐẦU TIÊN — đúng
 * cái nói ra nguyên nhân.
 *
 * Nối đuôi vào một promise thì mỗi lần ghi đọc được kết quả của lần trước.
 */
let queue: Promise<void> = Promise.resolve();

function append(entry: CrashEntry): void {
  queue = queue
    .then(async () => {
      const list = await readCrashLog();
      list.unshift(entry);
      await AsyncStorage.setItem(KEY, JSON.stringify(list.slice(0, KEEP)));
    })
    .catch(() => {
      /* Ghi nhật ký hỏng không được ném thêm một lỗi nữa từ trong tay lỗi — và
         không được làm đứt hàng đợi cho những lần sau. */
    });
}

let installed = false;

/**
 * Gắn một lần, ở đầu vòng đời app.
 *
 * `ErrorUtils` là API toàn cục của React Native, không có kiểu trong `@types`,
 * nên nó được đọc qua `globalThis` và kiểm tra sự tồn tại — trên web nó không
 * có, và ở đó tệp này chỉ đơn giản là không làm gì.
 */
export function installCrashHandler(): void {
  if (installed) return;
  const EU = (globalThis as { ErrorUtils?: {
    getGlobalHandler: () => (e: unknown, isFatal?: boolean) => void;
    setGlobalHandler: (h: (e: unknown, isFatal?: boolean) => void) => void;
  } }).ErrorUtils;
  if (!EU?.setGlobalHandler) return;
  installed = true;

  const prev = EU.getGlobalHandler();
  EU.setGlobalHandler((e, isFatal) => {
    recordCrash(e, !!isFatal);
    /* Handler cũ CHẠY TIẾP — xem ghi chú "không nuốt lỗi" ở đầu tệp. */
    prev?.(e, isFatal);
  });
}

/**
 * Ghi một lỗi vào nhật ký, đã lọc.
 *
 * ── vì sao nó là một hàm xuất ra, không chỉ là thân của handler ──
 *
 * `ErrorUtils` KHÔNG thấy một lỗi đã bị một React error boundary bắt. Đó là
 * đúng theo thiết kế của React — một lỗi đã được xử lý thì không còn là lỗi
 * chưa bắt — nhưng nó có một hệ quả dễ bỏ sót: thêm một boundary vào app sẽ
 * làm nhật ký này THÔI ghi đúng loại lỗi mà nó được viết ra để bắt.
 *
 * Nghĩa là đổi khả năng nhìn thấy lấy khả năng hồi phục. Không cần đổi: chỗ nào
 * bắt được lỗi thì chỗ ấy gọi hàm này.
 *
 * Nó không bao giờ ném. Nó chạy từ trong tay một lỗi, và một lỗi thứ hai sinh
 * ra từ chỗ ghi lỗi thứ nhất là chỗ tệ nhất để có một lỗi.
 */
export function recordCrash(e: unknown, fatal: boolean, componentStack?: string): void {
  try {
    const err = e as { message?: string; stack?: string } | undefined;
    /* `componentStack` là cây React dẫn tới chỗ ném — thứ duy nhất nói được
       MÀN NÀO hỏng, và stack của bundle đã minify thì không. Nối vào cuối để
       phần đầu (nguyên nhân) không bị đẩy ra khỏi giới hạn cắt. */
    const stack = `${String(err?.stack ?? '')}${componentStack ? `\n--\n${componentStack}` : ''}`;
    append({
      at: new Date().toISOString(),
      fatal,
      message: scrubText(String(err?.message ?? e ?? 'unknown')),
      stack: scrubText(stack).slice(0, 1500),
    });
  } catch {
    /* Xem trên. */
  }
}
