import { Image, StyleSheet, Text, View } from 'react-native';

import { makeStyles } from '@/constants/theme';
import { usePalette, useThemeName } from '@/hooks/use-palette';

/**
 * Dấu hiệu của app: chữ A với con koala, cạnh chữ ASCND.
 *
 * ── lấy từ chính icon của app, không vẽ lại ──
 *
 * `assets/images/splash-icon.png` là dấu hiệu ĐÃ ĐƯỢC TÁCH khỏi nền: nét trắng
 * trên nền trong suốt, do `tools/make-app-icon.mjs` dựng ra từ
 * `assets/brand/app-icon-source.png`. Nó là cùng một hình mà người dùng chạm
 * vào ở màn hình chính điện thoại.
 *
 * Vẽ tay lại chữ A ấy sẽ là bản thứ hai của một thứ đã có bản gốc, và bản thứ
 * hai luôn trôi khỏi bản đầu. `tools/macro-icon-style.mjs` đã trả giá cho đúng
 * chuyện đó với bộ macro.
 *
 * ── vì sao `MARK` là 37 chứ không phải chiều cao mắt nhìn thấy ──
 *
 * Ảnh là một ô VUÔNG 936×936, nhưng phần có nét chỉ chiếm 836×634 ở chính giữa
 * — lề trên và dưới mỗi bên 151 điểm ảnh, trái phải mỗi bên 50. Đo ra, không
 * đoán. Với `resizeMode="contain"` trong một hộp vuông cạnh S, nét cao
 * 634/936 = 0,677·S và rộng 0,893·S.
 *
 * Nên muốn nét cao 25 điểm thì hộp phải là 37, không phải 25. Con số 37 một
 * mình đọc ra là tuỳ tiện; đây là chỗ nó dẫn từ đâu. `tools/brand-lockup.mjs`
 * đo lại tỉ lệ ấy trên chính tệp ảnh, nên một lần dựng lại icon với lề khác sẽ
 * làm hỏng bước kiểm chứ không lặng lẽ đổi cỡ dấu hiệu trên đầu trang.
 *
 * 25 điểm là ~1,6 lần chiều cao chữ hoa của dòng chữ bên cạnh (22 điểm đậm →
 * chữ hoa ~15,7). Đó là tỉ lệ Cal AI dùng cho quả táo cạnh chữ của nó, và là
 * lý do dấu hiệu đọc ra là một CẶP với dòng chữ chứ không phải một hình đứng
 * cạnh một nhãn.
 *
 * ── và nét KHÔNG bị nhuộm màu — nhưng có HAI tệp ──
 *
 * `tintColor` sẽ đổi được nó thành `colors.foreground` cho khớp tuyệt đối với
 * dòng chữ. Nhưng đây là logo, và trắng tinh trên trang gần đen là cách nó
 * được vẽ ra để đọc. Chênh lệch với #ededed là 7% độ sáng — dưới ngưỡng nhìn
 * thấy khi hai thứ cách nhau 7 điểm, và không đáng đổi lấy việc sơn lại một
 * dấu hiệu thương hiệu ở một chỗ trong khi mọi chỗ khác giữ nguyên.
 *
 * Lập luận ấy giữ nguyên. Cái sai là nó chỉ có MỘT tệp: nét trắng trên giấy
 * #f7f4ef đo được **1,00:1**, tức dấu hiệu biến mất hoàn toàn ở bản sáng, trong
 * khi dòng chữ cạnh nó vẫn 17,57:1. Đầu trang hiện chữ mà không hiện dấu.
 *
 * Bản sáng của chính tệp ấy ĐÃ CÓ trong repo — `splash-icon-light.png`, mực
 * #1a1917, đúng bằng `foreground` của bản sáng — và màn hình chờ đã chọn đúng
 * tệp theo theme từ `app.json` suốt thời gian qua. Chỉ đầu trang là chưa.
 *
 * Nên vẫn KHÔNG nhuộm: chọn TỆP, không sơn lại nét. Mỗi theme lấy bản đã được
 * vẽ cho nó, và cả hai đều là cùng một dấu hiệu tách khỏi cùng một icon.
 */
const MARK = {
  dark: require('../../../assets/images/splash-icon.png'),
  light: require('../../../assets/images/splash-icon-light.png'),
} as const;

/** Cạnh hộp ảnh. Nét thật cao 0,677 lần con số này — xem chú thích trên. */
const BOX = 37;

/**
 * Trần phóng chữ của dòng chữ, KHÔNG phải một công tắc tắt.
 *
 * ── bản đầu viết `allowFontScaling={false}` và `tools/dynamic-type.mjs` bắt được ──
 *
 * Lập luận của nó đúng, và nặng hơn thế: chú thích tôi viết ngay bên cạnh công
 * tắc ấy dẫn `RING_TEXT_MAX_SCALE` làm tiền lệ — mà `RING_TEXT_MAX_SCALE` LÀ
 * một cái trần. Tức chú thích bênh vực đúng thứ mà mã không làm.
 *
 * Vấn đề thật: chữ phóng to trong khi hình đứng yên thì tỉ lệ 1,6 giữa hai
 * thứ vỡ. Nhưng "vỡ tỉ lệ" không đáng đổi lấy việc người đặt cỡ chữ lớn nhất
 * của iOS đọc tên app ở cỡ nhỏ nhất.
 *
 * 1,3: chữ đi từ 22 lên 28,6 điểm (chiều cao chữ hoa ~20), cạnh nét cao 25 —
 * tỉ lệ còn 1,25, vẫn đọc ra là một CẶP. Và cả cụm rộng 149 điểm trong 226
 * điểm mà cột trái có ở máy hẹp nhất còn bán, nên không có gì tràn.
 */
const WORD_MAX_SCALE = 1.3;

export function BrandLockup() {
  const c = usePalette();
  const styles = stylesFor(c);
  const theme = useThemeName();
  return (
    /*
      Cả cụm là MỘT phần tử với trình đọc màn hình.

      Ảnh và chữ nói cùng một điều; để cả hai lộ ra thì máy đọc "ASCND ASCND".
      `muscle-art.tsx` giải đúng việc này theo cùng cách và ghi lại lý do.

      Và `pointerEvents="none"`: đây là danh tính, không phải một lối đi. Trên
      màn này chỉ có một nút dẫn ra khỏi trang — bánh răng ở đầu kia của hàng —
      nên một logo bấm được sẽ là một đích đến thứ hai không ai hứa.

      Viết ra chứ không dựa vào mặc định: một `<View>` không có handler thì vốn
      đã không giành quyền chạm, nhưng "vốn đã" là một tính chất của React
      Native chứ không phải một lời hứa của tệp này — và ô này nằm ĐÈ LÊN vòng
      sẵn sàng, thứ mà cả màn hình dựa vào để mở ra. VoiceOver đọc theo cây trợ
      năng chứ không theo cây chạm, nên nhãn bên dưới vẫn được đọc.
    */
    <View
      style={styles.row}
      pointerEvents="none"
      accessible
      accessibilityRole="header"
      accessibilityLabel="ASCND">
      <Image source={MARK[theme]} style={styles.mark} resizeMode="contain" accessible={false} />
      <Text style={styles.word} accessible={false} maxFontSizeMultiplier={WORD_MAX_SCALE}>
        ASCND
      </Text>
    </View>
  );
}

const stylesFor = makeStyles((c) => ({
  /* Cao bằng hàng nút (`TOP_BAR_H`) và canh giữa theo chiều dọc, để dấu hiệu
     nằm đúng trên trục của viên chuỗi ngày và avatar ở đầu kia. */
  row: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 7 },
  mark: { width: BOX, height: BOX },
  /*
    Chữ hoa có giãn, không phải chữ thường bó sát.

    "ASCND" là một từ viết tắt: bó sát thì năm chữ cái dính thành một khối khó
    đọc, còn giãn quá thì nó thành một nhãn mục chứ không còn là tên. 0,6 là
    chỗ ở giữa — đủ để tách các chữ cái, chưa đủ để mất tính một-từ.

    Cỡ chữ vẫn đi theo cài đặt của máy, chỉ có một TRẦN — xem
    `WORD_MAX_SCALE` ở trên, và vì sao bản đầu ở đây đã sai.
  */
  word: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: c.foreground,
  },
}));
