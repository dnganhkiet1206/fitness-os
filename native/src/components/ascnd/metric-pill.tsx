import { Text, View, type ViewStyle } from 'react-native';

import { radius, spacing, type } from '@/constants/ascnd';
import { GlassSurface } from '@/components/ascnd/glass-surface';
import { makeStyles } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { useMuted } from '@/hooks/use-wash';

/**
 * Một chỉ số ĐI KÈM — thứ đọc sau khi đã đọc hero.
 *
 * ── vì sao nó nhỏ, và phải nhỏ ──
 *
 * Đây là vế còn lại của `HeroMetric`. Một màn có một câu trả lời và vài con số
 * chống lưng cho câu ấy; nếu những con số chống lưng cũng to bằng thì không
 * còn câu trả lời nào cả — đó đúng là tình trạng bốn thẻ chỉ số của màn Sleep.
 *
 * Nên viên này dùng tầng kính `secondary`: mờ hơn, viền nhạt hơn, không vệt
 * sáng. Nó ở đó để đọc được, không phải để được nhìn thấy trước.
 *
 * ── chấm màu chỉ xuất hiện khi màu MANG NGHĨA ──
 *
 * `tint` tô chấm bên cạnh nhãn, không tô con số. Tô con số là cách một hàng ba
 * viên biến thành ba màu tranh nhau, và màu ở đây chỉ để nối viên với một tầng
 * trong biểu đồ phía trên — một việc, không phải một trang trí.
 */
export function MetricPill({
  label,
  value,
  tint,
  style,
}: {
  label: string;
  value: string;
  tint?: string;
  style?: ViewStyle;
}) {
  const c = usePalette();
  const muted = useMuted();
  const styles = stylesFor(c);
  return (
    <GlassSurface tier="secondary" radius={radius.lg} elevation="secondary" style={{ ...styles.wrap, ...style }}>
      <View style={styles.labelRow}>
        {/* Chấm luôn được dựng, tô trong suốt khi không có `tint`: gỡ node
            theo dữ liệu làm hai hàng cạnh nhau lệch nhau một khoảng gap. */}
        <View style={[styles.dot, { backgroundColor: tint ?? 'transparent' }]} />
        <Text style={[styles.label, { color: muted }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={styles.value} numberOfLines={1}>
        {value}
      </Text>
    </GlassSurface>
  );
}

const stylesFor = makeStyles((c) => ({
  wrap: { flex: 1, minWidth: 0, gap: 3, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.sm + 4 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { ...type.caption, color: c.mutedForeground, flexShrink: 1 },
  value: { ...type.title2, color: c.foreground, fontVariant: ['tabular-nums'] },
}));
