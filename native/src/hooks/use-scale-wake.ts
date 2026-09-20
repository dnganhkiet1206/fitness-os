import { useCallback, useEffect, useRef } from 'react';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { duration } from '@/constants/motion';

/**
 * Chiếc cân thức dậy, giữ sáng, rồi ngủ lại.
 *
 * ── vì sao nó ra khỏi `log-weight.tsx` ──
 *
 * Màn onboarding sắp có một chiếc cân nữa, và nó phải cư xử GIỐNG HỆT. Cách
 * duy nhất chắc chắn giống là cùng đọc một chỗ: "một bản thứ hai luôn trôi
 * khỏi bản đầu" là câu repo này đã trả giá nhiều lần để viết ra.
 *
 * ── hook này chịu trách nhiệm gì, và KHÔNG chịu gì ──
 *
 * CÓ:  sự kiện chạm · trạng thái thức · hẹn giờ giữ · đặt lại hẹn giờ · dọn dẹp
 * KHÔNG: hình chiếc cân, hình học của nó, hai lớp, hay bất cứ thứ gì riêng của
 *        một màn. Chỗ dùng tự dựng hai `BodyScaleFigure` và tự đặt style lên.
 *
 * Hai style `lit`/`rest` thì Ở LẠI đây, và đó là một quyết định: chúng là MỘT
 * cú cross-fade chứ không phải hai hiệu ứng rời. Chú thích dưới ghi lại vì sao
 * — trả một lần bằng một lỗi thật — và nếu chỗ dùng tự viết lấy thì chỗ dùng
 * thứ hai chỉ cần quên `rest` là lỗi ấy quay lại nguyên vẹn.
 *
 * Thời lượng, mốc giữ, cú đặt lại hẹn giờ, phép dọn dẹp: chuyển sang đây
 * NGUYÊN VĂN, kể cả các chú thích. Đây là một lượt DỜI CHỖ, không phải một
 * lượt sửa.
 */

/**
 * Cân giữ trạng thái SÁNG bao lâu sau cú tương tác cuối.
 *
 * Đặt hàng: *"3 giây không có tương tác → scale bắt đầu giảm độ sáng"*. Mỗi lần
 * chạm lại vào thước là hẹn giờ được đặt lại, nên kéo–dừng–kéo không bao giờ
 * làm cân tắt giữa chừng.
 */
const HOLD_MS = 3000;

export function useScaleWake() {
  /*
    ── cân "thức dậy", và vì sao nó là HAI HÌNH XẾP LỚP ──

    `react-native-svg` raster lại cả hình khi một prop con đổi — bài học đã ghi
    ở `weight-goal-ruler.tsx`. Nội suy từng thuộc tính của chiếc cân theo một
    shared value là bắt nó raster lại mỗi khung hình trong suốt cú kéo.

    Nên hai hình dựng SẴN, một nghỉ một sáng, xếp lên nhau; chỉ `opacity` của
    hình sáng chạy. Đó là thứ compositor làm được mà không vẽ lại gì cả.

    Vào 240ms (`duration.move`, trong khoảng 200–400 được đặt hàng), ra 320ms
    (`duration.swap`, trong khoảng 300–500).
  */
  const glow = useSharedValue(0);
  const wake = useRef<ReturnType<typeof setTimeout> | null>(null);

  const touch = useCallback(() => {
    glow.value = withTiming(1, { duration: duration.move });
    if (wake.current) clearTimeout(wake.current);
    wake.current = setTimeout(() => {
      glow.value = withTiming(0, { duration: duration.swap });
    }, HOLD_MS);
  }, [glow]);

  /* Hẹn giờ phải chết cùng màn hình: thoát ra giữa lúc cân đang sáng thì cú
     `withTiming` sau đó chạy trên một component đã đi. */
  useEffect(() => () => {
    if (wake.current) clearTimeout(wake.current);
  }, []);

  /*
    ── HAI độ mờ, và vì sao một cái là không đủ ──

    Bản đầu chỉ có `litFace`: hình nghỉ nằm dưới ở opacity 1 mãi mãi, hình sáng
    chồng lên ở `glow`. Nghe như một cú cross-fade. Nó KHÔNG phải.

    Mọi lớp của chiếc cân là `alpha(c.foreground, …)` — tức TRONG SUỐT. Xếp hai
    hình trong suốt lên nhau thì độ mờ KHÔNG thay thế, nó CỘNG:

        lớp            bảng TONE nói    app thật sự vẽ
        thân           0,115            1−(1−0,11)(1−0,115) = 0,2124
        viền ngoài     0,22             0,3526
        tấm cảm biến   0,06             0,1164
        viền trong     0,09             0,1446

    Thân cân gần GẤP ĐÔI mực so với con số tôi đã chọn, cân nhắc và đo. Đó đúng
    là *"brightness filter cho toàn bộ cái cân"* mà chủ dự án bác — và nó không
    nằm ở bảng `TONE` dòng nào cả, nên cả vòng chỉnh bảng ấy không chạm được
    tới. `tools/body-scale.mjs` cũng xanh, vì nó dựng lại MỘT hình trên trang
    trong khi app vẽ HAI. Lần thứ hai trong phiên này một phép đo mô hình hoá
    thứ app không hề vẽ.

    Nên cú cross-fade phải là cross-fade thật: hình nghỉ mờ ĐI đúng bằng lúc
    hình sáng hiện RA. Ở hai đầu chỉ còn đúng một hình, tức đúng bảng `TONE`.
    Giữa đường hai hình cùng hiện một phần, và phép cộng ở đó ra 0,108 khi
    `glow` = 0,5 — nằm giữa hai đầu, không có cú nhồi sáng nào.

    Thời lượng, mốc giữ, cú đặt lại hẹn giờ: KHÔNG đổi gì. Đây là sửa phép VẼ.
  */
  const lit = useAnimatedStyle(() => ({ opacity: glow.value }));
  const rest = useAnimatedStyle(() => ({ opacity: 1 - glow.value }));

  return { touch, lit, rest };
}
