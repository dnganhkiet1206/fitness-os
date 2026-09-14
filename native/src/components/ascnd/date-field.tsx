import RNDateTimePicker, {
  type IOSNativeProps,
  type AndroidNativeProps,
} from '@react-native-community/datetimepicker';

import { useMaterial, usePalette } from '@/hooks/use-palette';

/**
 * Bộ chọn ngày/giờ của hệ thống, ĐÃ biết app đang ở diện mạo nào.
 *
 * ── lỗi nó sinh ra để sửa ──
 *
 * Mười chỗ trong năm tệp gọi `<DateTimePicker>` với `themeVariant="dark"` GÕ
 * CỨNG. Đây là một component NATIVE: cờ ấy bảo UIKit tô nó bằng bảng màu của
 * chế độ tối — chữ sáng trên nền mờ — và app thì có bản sáng. Kết quả trên máy
 * thật, chủ dự án chụp lại: viên nang ngày trong sheet "Nhập số đo" là chữ
 * TRẮNG trên nền XÁM NHẠT, trên một trang giấy.
 *
 * Không cửa nào bắt được, và lý do rất cụ thể: mọi luật màu của kho này đọc
 * `StyleSheet` của React Native. `themeVariant` không phải một màu — nó là một
 * chỉ thị gửi sang UIKit, và màu thật do hệ điều hành chọn ở phía bên kia.
 * `tsc` thấy một literal hợp lệ; ảnh chụp web không thấy vì
 * `@react-native-community/datetimepicker` trên web là một `<input>` của trình
 * duyệt, không phải cái viên nang ấy.
 *
 * ── vì sao là một component thay vì mười lần sửa ──
 *
 * Mười chỗ gõ cùng một hằng là mười chỗ sẽ lệch nhau; câu hỏi chỉ là khi nào —
 * và ở đây nó đã lệch khỏi chính app suốt cả hai diện mạo. Một cửa thì diện
 * mạo được quyết ĐÚNG MỘT LẦN, và `tools/date-field.mjs` canh cho không ai mở
 * cửa thứ hai.
 *
 * ── và vì sao ngày có màu ──
 *
 * Ở dạng `compact`, UIDatePicker vẽ ngày thành một viên nang tô bằng TINT của
 * app — đó là lý do ngày trong Lịch và Nhắc nhở của Apple màu lơ chứ không
 * phải mực đen. Cái màu ấy là thứ nói "bấm được"; bỏ nó đi thì viên nang đọc
 * ra như một nhãn.
 *
 * `metricBlueInk` chứ không phải `metricBlue`: bảng màu đã tách sẵn hai vai ấy
 * và ghi cả lý do — `metricBlue` trên giấy chỉ cho 3,65:1, tức qua sàn chữ LỚN
 * và hết chỗ lùi. Đo `metricBlueInk` trên nền viên nang của hệ thống
 * (`secondarySystemFill`): **9,48:1** trên giấy và **5,37:1** trong tối, qua cả
 * sàn 4,5 của chữ nhỏ ở cả hai.
 */
export function DateField(props: IOSNativeProps | AndroidNativeProps) {
  const c = usePalette();
  const m = useMaterial();
  return (
    <RNDateTimePicker
      themeVariant={m.lit ? 'dark' : 'light'}
      accentColor={c.metricBlueInk}
      {...props}
    />
  );
}
