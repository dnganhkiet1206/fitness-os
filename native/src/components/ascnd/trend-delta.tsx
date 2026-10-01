import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react-native';
import { type StyleProp, Text, type TextStyle, View } from 'react-native';

import { Icon } from '@/components/ascnd/icon';
import { useI18n } from '@/hooks/use-app-settings';

export type TrendDir = 'up' | 'down' | 'flat';

/** Hướng của một chênh lệch: dương là lên, âm là xuống, 0 là đứng yên. */
export const trendDir = (delta: number): TrendDir => (delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat');

const GLYPH = { up: ArrowUpRight, down: ArrowDownRight, flat: ArrowRight } as const;

/**
 * Một con số thay đổi: mũi tên VẼ + chữ, cùng màu (#159).
 *
 * Năm màn từng in mũi tên bằng ký tự (`↑ ↓ → =`). Ký tự ấy đi theo phông chữ,
 * không theo bộ icon: nét, độ đậm và đường cơ sở của nó là của phông, nên cạnh
 * các icon lucide nó trông như từ một app khác — và `=` cho "không đổi" không
 * phải là một mũi tên. Đây là đúng ba hình của `WeightChanges` (lên-phải,
 * xuống-phải, ngang), thứ app đã dùng cho cùng một ý, theo cách Apple Health
 * vẽ xu hướng: mũi tên chéo, không phải mũi tên thẳng đứng.
 *
 * ── trợ năng: hướng nằm trong NHÃN, không chỉ trong hình ──
 *
 * Ký tự `↑` còn được VoiceOver đọc ra ("mũi tên lên"); một icon thì không —
 * nó là hình trang trí. Bỏ ký tự mà không bù thì "↑ 12%" thành "12%", mất đúng
 * nửa thông tin. Nên cả hàng là MỘT phần tử có nhãn "Tăng 12%" / "Giảm 12%" /
 * "Không đổi 12%", dùng chính các chữ của `WeightChanges`.
 *
 * `size` là cỡ icon; chọn theo cỡ chữ đi kèm (chữ footnote → 13, số lớn → 20).
 */
export function TrendDelta({
  dir,
  color,
  size = 13,
  textStyle,
  children,
}: {
  dir: TrendDir;
  color: string;
  size?: number;
  textStyle?: StyleProp<TextStyle>;
  /** Bỏ trống thì chỉ có mũi tên, và nhãn là chữ chỉ hướng. */
  children?: string;
}) {
  const i18n = useI18n();
  const word = dir === 'up' ? i18n.nWcIncrease : dir === 'down' ? i18n.nWcDecrease : i18n.nWcNoChange;
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={children ? `${word} ${children}` : word}
      style={{ flexDirection: 'row', alignItems: 'center', gap: Math.round(size / 5) }}>
      <Icon icon={GLYPH[dir]} size={size} color={color} strokeWidth={2.25} />
      {children ? (
        <Text style={[textStyle, { color }]} numberOfLines={1}>
          {children}
        </Text>
      ) : null}
    </View>
  );
}
