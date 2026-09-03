import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppSettings } from '@/hooks/use-app-settings';
import { materials, palettes, type Material, type Palette, type ThemeName } from '@/constants/theme';

/**
 * Bảng màu đang dùng, và tên của nó.
 *
 * ── ba nguồn, một kết quả ──
 *
 * Người dùng chọn `light` / `dark` thì đó là câu trả lời. Chọn `system` — hoặc
 * chưa từng mở cài đặt — thì hỏi máy. `useColorScheme` của React Native trả về
 * `null` khi chưa biết (lần render đầu trên một số bản Android, và trên web
 * trước khi khớp media query), và `null` KHÔNG phải "sáng": mặc định của app
 * này là tối, nên chưa biết thì giữ tối. Đoán sáng ở khung hình đầu là một cú
 * nháy trắng vào mắt người đang dùng app trong đêm.
 *
 * Không có state, không có effect, không có provider riêng: theme đã sống trong
 * `AppSettingsProvider` cạnh ngôn ngữ và đơn vị, vì nó cùng loại — tuỳ chọn của
 * MÁY. Thêm một provider thứ hai cho cùng một loại dữ liệu là thêm một chỗ để
 * hai câu trả lời lệch nhau.
 */
export function useThemeName(): ThemeName {
  const { theme } = useAppSettings();
  const system = useColorScheme();
  if (theme === 'light' || theme === 'dark') return theme;
  return system === 'light' ? 'light' : 'dark';
}

/**
 * Bảng màu để đọc trong thân component.
 *
 * Dùng cặp với `makeStyles`:
 *
 *     const stylesFor = makeStyles((c) => ({ … }));
 *     …
 *     const c = usePalette();
 *     const styles = stylesFor(c);
 *
 * Tham chiếu trả về ổn định theo từng theme (`palettes` là một hằng số module),
 * nên nó là khoá cache dùng được cho `makeStyles` và không làm hỏng `memo` nào.
 */
export function usePalette(): Palette {
  return palettes[useThemeName()];
}

/**
 * Chất liệu thẻ của theme đang dùng.
 *
 * Tách khỏi `usePalette` vì hai thứ này đổi theo cùng một cờ nhưng trả lời hai
 * câu khác nhau: bảng màu nói MÀU, chất liệu nói thẻ được làm bằng gì. Ở bản
 * sáng nó là giấy đục có bóng; ở bản tối là kính trong bắt sáng. Xem
 * `Material` trong `constants/theme.ts` để biết vì sao đó không phải cùng một
 * thứ với hai màu khác nhau.
 */
export function useMaterial(): Material {
  return materials[useThemeName()];
}
