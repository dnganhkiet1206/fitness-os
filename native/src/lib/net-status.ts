import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

/**
 * Có mạng hay không — và cái khoảng ở giữa mà app trước đây không có tên để gọi.
 *
 * ── lỗi đã đo được ──
 *
 * `query-client.ts` báo cho React Query biết máy có mạng hay không bằng đúng
 * một dòng:
 *
 *     setOnline(state.isConnected !== false)
 *
 * `isConnected` trả lời câu "máy có ĐANG NỐI vào một mạng nào đó không" — sóng
 * Wi-Fi, sóng di động. Nó KHÔNG trả lời câu "mạng ấy có ra được internet
 * không". NetInfo tách hai câu ấy thành hai trường riêng, và app chỉ đọc trường
 * thứ nhất:
 *
 *     interface NetInfoConnectedState {
 *       isConnected: boolean;
 *       isInternetReachable: boolean | null;   // ← chưa ai đọc
 *     }
 *
 * Nên mọi trường hợp "có sóng mà không có mạng" đều bị app đọc thành ONLINE:
 * Wi-Fi quán cà phê chưa bấm đồng ý điều khoản, Wi-Fi khách sạn bắt đăng nhập,
 * router mất đường lên, 4G đủ vạch nhưng hết dung lượng. Đó không phải ca hiếm
 * — đó là dạng mất mạng PHỔ BIẾN NHẤT trên điện thoại, và là dạng khó chịu nhất
 * vì máy vẫn hiện đủ vạch sóng.
 *
 * Hậu quả không dừng ở cái dải báo bị ẩn. `offlineNow()` trong `offline.ts`
 * đọc cùng một nguồn, và nó là thứ quyết định có cho phép cập nhật lạc quan hay
 * không. Tức là ở đúng tình huống này, app vẽ ra con số người dùng vừa nhập —
 * nước đã uống, bữa đã ăn — trong khi không có gì được gửi đi. Chính cái nói
 * dối mà `offline.ts` được viết ra để chặn, đi lọt qua cửa nó không canh.
 *
 * ── ba trạng thái, không phải hai ──
 *
 * `online` / `offline` là một câu hỏi đóng/mở, và nó không mô tả được cái
 * khoảnh khắc người dùng quan tâm nhất: mạng vừa về, app đang tải lại những gì
 * đã lỡ. Trong khoảnh khắc ấy app không offline nữa, nhưng những gì đang hiện
 * vẫn là dữ liệu cũ. Gọi nó là "online" là nói sớm.
 *
 *   · `offline`      — CHẮC CHẮN không dùng được mạng
 *   · `reconnecting` — mạng vừa về, app đang lấy lại phần đã lỡ
 *   · `online`       — đã bắt kịp
 *
 * ── vì sao `null` KHÔNG bị tính là mất mạng ──
 *
 * `isInternetReachable` là `boolean | null`, và `null` nghĩa là NetInfo CHƯA
 * BIẾT — nó vẫn đang dò. Cửa sổ ấy tồn tại ở mỗi lần mở app. Tính `null` thành
 * mất mạng thì mỗi lần mở app đều nháy một dải báo đỏ rồi tự tắt, và một cảnh
 * báo sai vài lần sẽ dạy người dùng bỏ qua nó đúng lúc nó nói thật.
 *
 * Nên luật là: chỉ báo mất mạng khi có một câu trả lời DỨT KHOÁT là không.
 * `false` là dứt khoát; `null` là chưa biết, và chưa biết thì không được kết
 * tội.
 *
 * ── điều KHÔNG làm ở đây, và vì sao ──
 *
 * NetInfo cho đổi URL dò mạng (`NetInfo.configure({ reachabilityUrl })`). Mặc
 * định nó dò `clients3.google.com/generate_204`, tức là đo "có ra được Google
 * không" chứ không phải "có ra được Supabase không" — mà Supabase mới là thứ
 * app này cần. Trỏ sang Supabase thì phép đo ĐÚNG hơn.
 *
 * Không đổi, và đây là lý do: nếu URL hoặc phép thử sai, `isInternetReachable`
 * thành `false` vĩnh viễn, app kẹt ở "mất mạng" trong khi mạng vẫn tốt, và
 * `offlineNow()` sẽ chặn mọi cập nhật lạc quan trên toàn app. Đổi một phép đo
 * mà không chạy được nó trên máy thật là đánh đổi một lỗi đã biết lấy một lỗi
 * nặng hơn chưa biết. Lỗi gốc ở đây là app BỎ QUA HẲN `isInternetReachable`,
 * và đó là thứ tệp này sửa. Đổi URL là một quyết định riêng, cần một máy thật.
 */

export type NetStatus = 'online' | 'offline' | 'reconnecting';

/**
 * Mạng có DÙNG ĐƯỢC không, theo một trạng thái NetInfo.
 *
 * Hàm thuần, tách riêng để `tools/net-status.mjs` chạy được nó trên cả bảng
 * trạng thái mà không cần dựng app. Đây là toàn bộ luật; mọi chỗ khác chỉ gọi
 * lại nó, nên không thể có hai định nghĩa "có mạng" trong cùng một app.
 */
export function isUsable(state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>): boolean {
  if (state.isConnected === false) return false;
  if (state.isInternetReachable === false) return false;
  return true;
}

/*
  Trần cứng cho trạng thái "đang kết nối lại".

  Nó thoát khi app tải xong phần đã lỡ, nhưng "tải xong" phụ thuộc vào truy vấn,
  và một truy vấn treo thì không bao giờ xong. Không có trần này thì dải báo
  "đang kết nối lại" có thể nằm lại đó mãi — một lời nói về hiện tại mà thành
  sai vĩnh viễn. Hết 12 giây thì thôi, dù còn gì đang chạy hay không: người dùng
  đã có dữ liệu trước mắt, và một cái nhãn sai tệ hơn một cái nhãn biến mất.
*/
const RECONNECT_CAP_MS = 12_000;
/* Nhịp hỏi "đã tải xong chưa". Đủ thưa để không tốn gì, đủ mau để dải báo không
   nán lại sau khi mọi thứ đã về. */
const SETTLE_POLL_MS = 250;
/**
 * Sàn thời gian dải báo ở lại, kể cả khi không có gì để tải.
 *
 * Không có sàn thì có một cú NHÁY: mạng về, không truy vấn nào đang chạy, và
 * dải báo hiện ra rồi biến mất trong khoảng một phần tư giây — mà riêng hiệu
 * ứng hiện ra đã 200ms. Người dùng thấy một vệt xanh loé lên và không đọc kịp
 * gì, tức là một thông báo tốn chỗ mà không truyền được tin.
 *
 * Có một cuộc đua thật ở đây nữa: cả tệp này lẫn React Query đều nghe cùng một
 * sự kiện NetInfo, và không có gì bảo đảm ai chạy trước. Hỏi "còn truy vấn nào
 * đang chạy không" ngay tại thời điểm ấy có thể rơi vào đúng khoảnh khắc trước
 * khi các lần tải lại kịp bắt đầu, và câu trả lời "không" lúc đó là sai. Sàn
 * này cũng là khoảng nghỉ để câu hỏi ấy được hỏi vào lúc nó có nghĩa.
 */
const RECONNECT_MIN_MS = 600;

let status: NetStatus = 'online';
const listeners = new Set<(s: NetStatus) => void>();

/*
  Cách tệp này biết app "đã bắt kịp" mà KHÔNG import query-client.

  `query-client.ts` cần `isUsable` từ đây, nên nếu ở đây lại import ngược lên nó
  thì thành một vòng import ở tầng chạy — thứ `tools/import-layers.mjs` cấm, và
  cấm có lý do: repo này đã có một vòng ba cạnh sống sót chỉ vì mọi chỗ dùng đều
  nằm trong thân hàm. Nên chiều phụ thuộc chỉ có một: query-client → net-status,
  và nó TỰ ĐƯA vào đây cách hỏi "còn truy vấn nào đang chạy không".
*/
let busyProbe: (() => boolean) | null = null;

/** Gọi một lần từ `query-client.ts`. */
export function registerBusyProbe(fn: () => boolean) {
  busyProbe = fn;
}

function emit(next: NetStatus) {
  if (next === status) return;
  status = next;
  for (const fn of listeners) fn(next);
}

export function netStatus(): NetStatus {
  return status;
}

export function subscribeNetStatus(fn: (s: NetStatus) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

let settleTimer: ReturnType<typeof setInterval> | null = null;
let capTimer: ReturnType<typeof setTimeout> | null = null;
let floorTimer: ReturnType<typeof setTimeout> | null = null;

function stopSettleWatch() {
  if (settleTimer) clearInterval(settleTimer);
  if (capTimer) clearTimeout(capTimer);
  if (floorTimer) clearTimeout(floorTimer);
  settleTimer = null;
  capTimer = null;
  floorTimer = null;
}

/** Mạng vừa về: ở lại "đang kết nối lại" cho tới khi app tải xong phần đã lỡ. */
function beginReconnect() {
  stopSettleWatch();
  emit('reconnecting');
  /* Không có cách hỏi thì không có cách biết đã xong — về online ngay còn hơn
     kẹt ở một nhãn không bao giờ đổi. */
  if (!busyProbe) {
    emit('online');
    return;
  }
  /* Nhịp dò chỉ BẮT ĐẦU sau sàn, nên dải báo không thể tắt sớm hơn nó — xem
     `RECONNECT_MIN_MS` về cú nháy và về cuộc đua với React Query. */
  floorTimer = setTimeout(() => {
    floorTimer = null;
    if (status !== 'reconnecting') return;
    const settled = () => {
      if (status !== 'reconnecting') {
        stopSettleWatch();
        return;
      }
      if (!busyProbe || !busyProbe()) {
        stopSettleWatch();
        emit('online');
      }
    };
    settled();
    if (status === 'reconnecting') settleTimer = setInterval(settled, SETTLE_POLL_MS);
  }, RECONNECT_MIN_MS);
  capTimer = setTimeout(() => {
    stopSettleWatch();
    if (status === 'reconnecting') emit('online');
  }, RECONNECT_CAP_MS);
}

/**
 * Một trạng thái NetInfo đi vào, trạng thái app đi ra.
 *
 * Tách khỏi phần đăng ký lắng nghe để `tools/net-status.mjs` bơm được cả một
 * chuỗi sự kiện qua nó và đọc ra chuỗi trạng thái — thứ không kiểm được nếu
 * luật nằm trong thân một callback của NetInfo.
 */
export function applyNetInfo(state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>) {
  const usable = isUsable(state);
  if (!usable) {
    stopSettleWatch();
    emit('offline');
    return;
  }
  /* Chỉ CHUYỂN TỪ mất mạng lên mới là "kết nối lại". Mạng vẫn tốt mà NetInfo
     báo lại một lần nữa thì không có gì để bắt kịp, và hiện dải báo lúc ấy là
     dựng ra một sự cố chưa từng xảy ra. */
  if (status === 'offline') {
    beginReconnect();
    return;
  }
  if (status === 'online') return;
  // đang 'reconnecting' — cứ để nó tự thoát khi tải xong hoặc hết trần
}

let started = false;

/**
 * Bắt đầu theo dõi. Gọi một lần, ở tầng module của `query-client.ts`, cùng chỗ
 * và cùng lý do với `registerOfflineWrites`: xong trước khi có màn nào mount.
 */
export function startNetWatch(): () => void {
  if (started) return () => {};
  started = true;
  /* Trạng thái đầu tiên NetInfo trả về là hiện trạng, không phải một thay đổi.
     Nếu lúc mở app đã mất mạng thì `applyNetInfo` đặt thẳng 'offline', và lần
     mạng về sau đó mới đi qua nhánh 'reconnecting' — đúng thứ tự người dùng
     trải qua. */
  return NetInfo.addEventListener(applyNetInfo);
}

/**
 * "Thử lại" của người dùng.
 *
 * Hỏi lại NetInfo thay vì tự đặt trạng thái. Một nút thử lại tự tuyên bố đã có
 * mạng là một nút nói dối — nó phải đi đo, và trả lời bằng thứ đo được.
 */
export async function retryNow(): Promise<NetStatus> {
  try {
    const state = await NetInfo.refresh();
    applyNetInfo(state);
  } catch {
    /* Không đo được thì giữ nguyên thứ đang biết. Không hạ xuống 'offline':
       một phép đo hỏng không phải bằng chứng là mạng hỏng. */
  }
  return status;
}

/** Chỉ dùng cho kiểm thử — đặt lại về trạng thái sạch. */
export function __resetNetStatusForTest() {
  stopSettleWatch();
  status = 'online';
  listeners.clear();
  busyProbe = null;
  started = false;
}
