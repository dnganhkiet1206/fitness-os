import { View, Text, StyleSheet } from 'react-native';
import { ChevronRight } from 'lucide-react-native';

import { Icon } from '@/components/ascnd/icon';
import { PressScale } from '@/components/ascnd/press-scale';
import { colors, spacing } from '@/constants/ascnd';
import { PLAN_DAYS } from '@/lib/planned-meal';

/**
 * Một kế hoạch ăn, vẽ giống nhau ở MỌI chỗ nó xuất hiện.
 *
 * ── vì sao là một component ──
 *
 * Hàng này từng có hai bản: một ở tab Dinh dưỡng (xem trước ba kế hoạch) và một
 * ở trang "Xem tất cả". Khi bảng bảy ngày được thêm vào bản đầu, bản kia không
 * có — nên người dùng chỉ nắm được lịch của ba kế hoạch gần nhất, còn muốn biết
 * những cái khác thì phải mở từng cái ra. Đã bị hỏi đúng câu đó.
 *
 * Hai bản vẽ cùng một thứ là hai bản sẽ lệch nhau; câu hỏi chỉ là khi nào.
 */

/** Tổng số ô đã có món trong một kế hoạch. */
export function countFill(days?: Record<number, number>) {
  return days ? Object.values(days).reduce((a, b) => a + b, 0) : 0;
}

/**
 * Một tuần: bảy ô, mỗi ô một ngày.
 *
 * ── vì sao KHÔNG lấp theo tỉ lệ ──
 *
 * Bản đầu vẽ cột cao 22 điểm lấp từ đáy theo số bữa đã có. Đúng về toán, hỏng
 * về mắt: một món trong kế hoạch ba bữa cho ra 1/3 của 22 điểm — một sợi bảy
 * điểm ở đáy một hộp rỗng, đọc ra như lỗi vẽ. Với kế hoạch sáu bữa thì 1/6 là
 * ba điểm, tức không thấy gì.
 *
 * Tỉ lệ liên tục cần chiều cao mới đọc được, mà chiều cao ở đây bị chặn bởi một
 * hàng danh sách. Nên BA TRẠNG THÁI rời rạc: chưa có gì, có một phần, đủ cả
 * ngày. Ba mức phân biệt được ở 18 điểm.
 *
 * Ngày rỗng vẫn vẽ ô: cái bảng phải đủ bảy ô thì mới là một tuần.
 */
export function PlanWeek({ days, perDay }: { days?: Record<number, number>; perDay: number }) {
  return (
    <View style={styles.week} pointerEvents="none">
      {PLAN_DAYS.map((d) => {
        /* `?.[]` chứ không phải `.get()`: dữ liệu đi qua cache được persist nên
           nó là object thuần — xem `useMealPlanFill`. */
        const got = days?.[d] ?? 0;
        return (
          <View
            key={d}
            style={[styles.day, got > 0 && styles.some, perDay > 0 && got >= perDay && styles.full]}
          />
        );
      })}
    </View>
  );
}

export function PlanRow({
  name,
  goalText,
  perDay,
  days,
  onPress,
  a11yLabel,
}: {
  name: string;
  goalText: string | null;
  perDay: number;
  days?: Record<number, number>;
  onPress: () => void;
  a11yLabel?: string;
}) {
  const total = PLAN_DAYS.length * perDay;
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={a11yLabel ?? name}
      style={styles.row}
      onPress={onPress}>
      <View style={styles.text}>
        <View style={styles.top}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <Icon icon={ChevronRight} size={16} color={colors.mutedForeground} />
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {/* Con số làm bảy ô kia ĐỌC ĐƯỢC. Không có nó, một kế hoạch chưa có
              món là bảy hộp xám không nhãn — người dùng không biết đó là bảy
              ngày hay là lỗi vẽ. Đã bị hỏi đúng câu đó. */}
          {[goalText, `${countFill(days)}/${total}`].filter(Boolean).join('  ·  ')}
        </Text>
        <PlanWeek days={days} perDay={perDay} />
      </View>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  /* Một HÀNG trong khối, không phải một thẻ. 56 để vượt sàn chạm 44 và để hai
     dòng chữ cộng bảng tuần có chỗ thở. */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 56,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  text: { flex: 1, minWidth: 0, gap: 5 },
  /* Tên co giãn để mũi tên bị đẩy ra MÉP PHẢI. Không có `flex` thì mũi tên bám
     sát cái tên, và một hàng có mũi tên ở giữa đọc ra như một phần của tên. */
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flex: 1, minWidth: 0, fontSize: 15, fontWeight: '600', color: colors.foreground },
  meta: { fontSize: 12, color: colors.mutedForeground },
  /* Khoảng cách 3 điểm: nhỏ hơn nữa thì bảy ô dính thành một dải và không còn
     đếm được là bảy. */
  week: { flexDirection: 'row', gap: 3, marginTop: 1 },
  day: { flex: 1, height: 18, borderRadius: 4, backgroundColor: colors.accent },
  /* Có một phần: CÙNG màu với "đủ" nhưng nhạt, nên ba mức là một THANG chứ
     không phải ba màu rời. Mắt đọc thang nhanh hơn đọc bảng chú giải. */
  some: { backgroundColor: colors.readinessGreen, opacity: 0.34 },
  full: { opacity: 1 },
});
