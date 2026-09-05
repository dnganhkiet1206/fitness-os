import { makeMutable } from 'react-native-reanimated';

/**
 * Dải mà Koa đứng có ĐANG TRỐNG không — biết, chứ không đoán.
 *
 * ── lỗi này bắt được từ ảnh chụp máy thật ──
 *
 * Koa đứng đè lên thanh chọn của màn Tiến trình, và lên thẻ Nước của màn Dinh
 * dưỡng. Không phải vì nó đi lạc: cả sáu chỗ đậu của nó đều nằm trong 42 điểm
 * sát đáy khung nhìn, và nó không bao giờ lên cao hơn thế.
 *
 * Nó đè vì NỘI DUNG đi tới chỗ nó.
 *
 * `koa-companion.tsx` là một lớp phủ neo theo KHUNG NHÌN, và chú thích của nó
 * khẳng định dải ấy là "chỗ đã được dành sẵn" — `BottomTabInset`, thứ mọi màn
 * đều chừa ra. Câu ấy đúng khi trang đứng yên ở cuối, và SAI ở mọi vị trí cuộn
 * khác: khoảng chừa nằm ở CUỐI NỘI DUNG, không nằm ở một chỗ cố định trên
 * khung nhìn. Dừng cuộn giữa trang thì thứ đang nằm trong dải ấy là bất cứ cái
 * gì trôi tới đó — và Koa hiện lại ngay trên nó, vì nó chỉ chờ "hết cuộn" chứ
 * không hỏi "bên dưới có gì".
 *
 * Thanh chọn của Tiến trình nằm ở đầu nội dung (progress.tsx:454) và thẻ Nước ở
 * giữa trang (nutrition.tsx:570). Cả hai đều đi qua dải ấy khi cuộn.
 *
 * ── nên câu hỏi đổi ──
 *
 * Từ "người dùng đã ngừng cuộn chưa" thành "phần đang nằm dưới chân Koa có
 * đúng là khoảng chừa không". Câu thứ hai trả lời được, và nó chính là lời hứa
 * mà chú thích cũ đã đưa ra:
 *
 *     còn lại tới đáy = contentHeight − layoutHeight − y
 *     dải trống  ⟺  còn lại ≤ BottomTabInset
 *
 * Trang KHÔNG cuộn được thì vế trái ≤ 0, nên nó luôn trống — đúng như trực
 * giác: không có gì trôi qua được một trang không cuộn.
 *
 * ── vì sao là một shared value, không phải state ──
 *
 * Nó được ghi từ worklet cuộn, mỗi khung hình. Một `setState` ở đó là một cú
 * nhảy UI→JS mỗi khung hình trên đúng luồng mà React đang dựng — chính lỗi mà
 * `lib/tab-bar-visibility.ts` đã bỏ công gỡ ra và ghi lại lý do.
 */
export const koaBandClear = makeMutable(1);

/**
 * Mặc định là TRỐNG, và mặc định ấy phải là 1 chứ không phải 0.
 *
 * Một màn không cuộn được thì không bắn `onScroll` lần nào, nên giá trị này giữ
 * nguyên thứ màn TRƯỚC để lại. Nếu mặc định là 0 thì Koa biến mất trên mọi màn
 * ngắn — một lỗi im lặng, vì không có gì để nhìn thấy. Đổi tab thì gọi
 * `resetKoaBand()`; xem `resetTabBar` cạnh nó, cùng một lý do và cùng một chỗ.
 */
export function resetKoaBand() {
  koaBandClear.value = 1;
}

/**
 * Đọc một khung hình cuộn và nói dải ấy có trống không.
 *
 * `reserve` là khoảng mà màn hình đã chừa ở cuối nội dung — chỗ gọi truyền
 * `BottomTabInset` vào, cùng hằng số mà `koa-companion.tsx` dùng để đặt đáy
 * lớp của mình. Hai bên phải đọc CÙNG một con số, nếu không dải mà một bên
 * tưởng là trống lại là dải bên kia đang vẽ.
 */
export function noteKoaBand(y: number, contentHeight: number, layoutHeight: number, reserve: number) {
  'worklet';
  const remaining = contentHeight - layoutHeight - y;
  koaBandClear.value = remaining <= reserve ? 1 : 0;
}
