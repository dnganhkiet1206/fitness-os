import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { duration } from '@/constants/motion';

/**
 * Một nút trượt ra từ SAU nút bên phải nó.
 *
 * ── vì sao là chiều RỘNG chứ không phải một phép dịch ──
 *
 * Hàng nút này căn phải. Điều bắt buộc là **nút chủ không được xê dịch**: người
 * dùng chạm nó lần thứ nhất để mở ra rồi chạm lần thứ hai để đi tiếp, và một
 * cái nút nhảy đi giữa hai cú chạm là cách chắc chắn nhất để cú thứ hai trượt.
 *
 * Chỉ có một cách giữ đúng điều đó: chỗ trống phải mọc ra ở BÊN TRÁI nút chủ.
 * Đó là một giá trị layout, nên nó phải là layout thật — `expander.tsx` đã ghi
 * đúng lập luận này cho chiều cao: *"a height does carry them, because a height
 * is a layout value: whatever is below is pushed down by exactly as much as
 * this has grown, on every frame, for free."* Ở đây là trục ngang và là thứ
 * nằm bên TRÁI, nhưng cơ chế y hệt.
 *
 * Một `translateX` thuần sẽ rẻ hơn và sai: nó không đẩy được viên chuỗi ngày
 * sang trái, nên hoặc viên ấy bị đè lên, hoặc phải để sẵn một khoảng trống 52
 * điểm cạnh nút bánh răng suốt thời gian đóng — và một cái hố đúng bằng một nút
 * thì đọc ra là lỗi bố cục.
 *
 * ── vì sao chiều rộng là HẰNG SỐ, không phải số đo ──
 *
 * `Expander` phải đo vì nội dung của nó là chữ, và chữ cao bao nhiêu thì chỉ
 * máy mới biết. Ở đây thứ được giấu là một nút vuông có cạnh do thiết kế quy
 * định. Đo một con số đã biết là thêm một `onLayout`, một `setState` và một
 * khung hình ở kích thước 0 — để tìm lại đúng con số vừa gõ vào.
 *
 * ── con trượt nằm ở `left: 0` ──
 *
 * Hộp cắt lớn dần thì mép TRÁI của nó đi sang trái (hàng căn phải). Con neo ở
 * `left: 0` đi theo mép ấy, nên nút hiện ra bằng cách trượt sang trái từ dưới
 * nút chủ — đúng chuyện đang kể: nó vốn nằm sau nút kia. Neo ở `right: 0` thì
 * con đứng yên còn cái hộp lớn ra quanh nó, và cú mở đọc ra như một tấm rèm
 * kéo ngang.
 *
 * ── đường cong ──
 *
 * `out(cubic)`, khác với `reveal="clip"` của `expander.tsx`, và khác có lý do
 * đã đo: ở đó mép cắt là tín hiệu duy nhất trên một khối cao khoảng 400 điểm,
 * nên xuất phát ở 2,94× vận tốc trung bình đọc ra là "bung". Ở đây quãng là 44
 * điểm trong 180ms, nên cùng bội số ấy cho 0,72 điểm mỗi mili giây — dưới
 * ngưỡng mắt đọc ra một cú giật, và bù lại nó rời khỏi ngón tay ngay lập tức.
 */
const EASE = Easing.out(Easing.cubic);

export function ToolReveal({
  open,
  width,
  children,
}: {
  open: boolean;
  /** Bề rộng khi mở, tính cả khoảng cách tới nút bên phải. */
  width: number;
  children: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const grow = useSharedValue(open ? 1 : 0);

  /* Khởi động animation trong `useEffect`, KHÔNG trong worklet mapper. Mapper
     chạy lại mỗi lần một shared value nó đọc thay đổi — đặt `withTiming` ở đó
     là khởi động lại animation trên chính khung hình nó vừa tiến được một
     bước, và nó không bao giờ tới đích. `expander.tsx` cũng tách y như vậy. */
  useEffect(() => {
    const to = open ? 1 : 0;
    grow.value = reduceMotion ? to : withTiming(to, { duration: duration.toggle, easing: EASE });
  }, [open, reduceMotion, grow]);

  /* Bề rộng đi qua một shared value chứ không đọc thẳng prop: `useAnimatedStyle`
     tính style đầu MỘT lần rồi chỉ cập nhật từ các shared value trong mapper,
     nên một prop thuần sẽ đóng băng ở giá trị lúc dựng. Ở đây nó là hằng số nên
     hôm nay không sao — và đó đúng là hình dạng của lỗi mà
     `tools/measured-worklet.mjs` tồn tại vì nó. */
  const w = useSharedValue(width);
  useEffect(() => {
    w.value = width;
  }, [width, w]);

  const box = useAnimatedStyle(() => ({ width: grow.value * w.value }));

  return (
    <Animated.View style={[styles.clip, box]} pointerEvents={open ? 'box-none' : 'none'}>
      <Animated.View style={styles.slot}>{children}</Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden', alignSelf: 'stretch' },
  /* Neo trái — xem ghi chú ở đầu tệp. `top: 0` chứ không `bottom: 0` vì hàng
     này căn `flex-start` theo chiều dọc. */
  slot: { position: 'absolute', left: 0, top: 0 },
});
