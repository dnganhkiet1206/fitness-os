import { StyleSheet, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';

import { type Material, type Palette } from '@/constants/palette';

/**
 * Cầu nối giữa bảng màu (dữ liệu thuần) và stylesheet của React Native.
 *
 * Dữ liệu — hai bảng màu, hai chất liệu, `alpha()` — nằm ở `constants/palette.ts`
 * và KHÔNG import gì, để `tools/palette.mjs` biên dịch rồi chạy nó một mình mà
 * đo tương phản trên giá trị thật. Tệp này là phần duy nhất cần react-native.
 *
 * Re-export lại để chỗ gọi chỉ phải nhớ một đường dẫn.
 */
export * from '@/constants/palette';

type AnyStyles = Record<string, ViewStyle | TextStyle | ImageStyle>;

/**
 * Biến một `StyleSheet.create` ở phạm vi module thành một hook đọc bảng màu.
 *
 * ── vì sao 111 tệp không thể chỉ đổi token ──
 *
 * Chúng gọi `StyleSheet.create({ … colors.foreground … })` ở PHẠM VI MODULE,
 * tức giá trị bị đóng băng lúc import. Đổi bảng màu lúc chạy không với tới
 * được chúng — không phải "khó", mà là không thể.
 *
 * Nên mỗi tệp đổi từ
 *
 *     const styles = StyleSheet.create({ … colors.foreground … });
 *
 * thành
 *
 *     const stylesFor = makeStyles((c) => ({ … c.foreground … }));
 *
 * và thân component mở đầu bằng
 *
 *     const c = usePalette();
 *     const styles = stylesFor(c);
 *
 * ── và thứ trả về KHÔNG mang tiền tố `use` ──
 *
 * Nó nhận bảng màu làm tham số và không gọi hook nào, nên nó không phải hook.
 * Đặt tên `useStyles` cho nó là một lời khai sai với người đọc và với luật lint
 * về hook — thứ sẽ đòi nó tuân quy tắc gọi mà nó không cần tuân. Bảng màu vào
 * bằng tham số cũng là điều giữ tệp này SẠCH React state: `constants/` không
 * được giữ context, và nhờ vậy `makeStyles` chạy được trong một bước kiểm mà
 * không cần dựng cây React nào.
 *
 * ── và nó vẫn chỉ chạy `StyleSheet.create` hai lần ──
 *
 * Kết quả được nhớ THEO BẢNG MÀU, và chỉ có hai bảng. Nên mỗi component gọi
 * `StyleSheet.create` nhiều nhất hai lần trong cả đời tiến trình, không phải
 * mỗi lần render. Khoá cache là chính đối tượng bảng màu chứ không phải tên
 * theme: hai tên trỏ về một bảng thì dùng chung một bản dựng, và một bảng mới
 * thêm vào sau sẽ tự có chỗ của nó.
 */
function memoSheet<K extends object, T extends AnyStyles>(build: (k: K) => T): (k: K) => T {
  const cache = new Map<K, T>();
  return function stylesFor(k: K): T {
    let s = cache.get(k);
    if (!s) {
      s = StyleSheet.create(build(k)) as T;
      cache.set(k, s);
    }
    return s;
  };
}

/** Stylesheet đọc BẢNG MÀU. */
export const makeStyles = <T extends AnyStyles>(build: (c: Palette) => T) => memoSheet(build);

/**
 * Stylesheet đọc CHẤT LIỆU thẻ.
 *
 * Hai hàm riêng chứ không một hàm generic trên cả hai: một hàm chung buộc mọi
 * chỗ gọi phải tự ghi kiểu tham số (`(c: Palette) => …`) vì TypeScript không
 * suy ra được từ đâu cả. Hai tên nói luôn stylesheet ấy đọc bảng nào, và kiểu
 * tự suy ra.
 */
export const makeMaterialStyles = <T extends AnyStyles>(build: (m: Material) => T) => memoSheet(build);
