import AsyncStorage from '@react-native-async-storage/async-storage';

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
    const err = e as { message?: string; stack?: string } | undefined;
    append({
      at: new Date().toISOString(),
      fatal: !!isFatal,
      message: String(err?.message ?? e ?? 'unknown'),
      stack: String(err?.stack ?? '').slice(0, 1500),
    });
    /* Handler cũ CHẠY TIẾP — xem ghi chú "không nuốt lỗi" ở đầu tệp. */
    prev?.(e, isFatal);
  });
}
