import { View, Text, StyleSheet } from 'react-native';
import { ChevronRight } from 'lucide-react-native';

import { Icon } from '@/components/ascnd/icon';
import { PressScale } from '@/components/ascnd/press-scale';
import { colors, glass, radius, spacing } from '@/constants/ascnd';
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

/**
 * Chữ đầu của tên kế hoạch, trong một đĩa.
 *
 * ── vì sao là chữ đầu, không phải icon ──
 *
 * Bản tham chiếu người dùng gửi cho mỗi hàng một đĩa màu mang icon buổi — bình
 * minh, mặt trời, hoàng hôn, mặt trăng. Cái đĩa ấy là thứ làm năm hàng đọc ra
 * như năm VẬT chứ như năm dòng của một bảng, và nó đáng lấy.
 *
 * Nhưng icon buổi thì không lấy được: `meal_plans` không có cột nào nói kế
 * hoạch này là bữa sáng hay bữa tối. Trường phân loại duy nhất là `goal` (ba
 * giá trị), và nó đã được viết THÀNH CHỮ ngay dòng dưới — đổi một chữ đọc được
 * thành một glyph phải đoán là lỗ trong một danh sách người ta quét bằng mắt.
 *
 * Chữ đầu của tên thì có thật, khác nhau ở từng hàng, và không cần thêm một cột
 * nào. Đó cũng đúng cách iOS làm cho danh bạ và album chưa có ảnh.
 *
 * Đĩa mang `glass.bg`/`glass.border` — cùng cặp mà mọi ô con trong app dùng —
 * chứ không phải một màu mới cho mỗi hàng: màu trong app này đã có nghĩa ở khắp
 * nơi (một trạng thái, một chỉ số, một chất), và gán màu theo tên kế hoạch là
 * đặt thêm một nghĩa thứ hai lên cùng bảng màu.
 */
function Monogram({ name }: { name: string }) {
  /* `[...name]` chứ không phải `name[0]`: tên tiếng Việt có dấu là một ký tự
     Unicode có thể gồm nhiều code unit, và `[0]` cắt giữa nó ra một ô vuông. */
  const first = [...name.trim()][0] ?? '?';
  return (
    <View style={styles.mono} pointerEvents="none">
      <Text style={styles.monoText} numberOfLines={1}>
        {first.toUpperCase()}
      </Text>
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
  const filled = countFill(days);
  /*
    Phần trăm, tính ra chứ không lấy từ đâu.

    Bản tham chiếu ghi "66%" cạnh "5/21". 5/21 là 24%, nên con số kia là số
    trong bản mock. Cái đáng lấy là Ý: "5/21" buộc người đọc làm một phép chia
    trước khi biết mình đang ở đâu; phần trăm thì không.

    `total` bằng 0 khi `perDay` bằng 0 — một kế hoạch không có bữa nào. Chia cho
    nó ra `NaN`, và `NaN%` là thứ sẽ hiện lên màn hình mà không báo gì.
  */
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={a11yLabel ?? name}
      style={styles.row}
      onPress={onPress}>
      <Monogram name={name} />
      <View style={styles.text}>
        <View style={styles.top}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          {/*
            Phần trăm CÙNG thang màu với bảy ô bên dưới: xanh khi đã có gì, xám
            khi chưa. Hai cách vẽ cùng một sự thật thì phải đổi màu cùng lúc —
            một con số xanh trên một tuần toàn ô xám là hai câu trả lời khác
            nhau cho một câu hỏi.
          */}
          <Text style={[styles.pct, filled > 0 && styles.pctOn]}>{pct}%</Text>
          <Icon icon={ChevronRight} size={16} color={colors.mutedForeground} />
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {/* Con số làm bảy ô kia ĐỌC ĐƯỢC. Không có nó, một kế hoạch chưa có
              món là bảy hộp xám không nhãn — người dùng không biết đó là bảy
              ngày hay là lỗi vẽ. Đã bị hỏi đúng câu đó. */}
          {[goalText, `${filled}/${total}`].filter(Boolean).join('  ·  ')}
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
    /*
      `flex-start`, không phải `center`.

      Cột chữ nay cao ba dòng — tên, dòng phụ, bảng bảy ngày — nên căn giữa đưa
      cái đĩa xuống ngang dòng phụ và bảng tuần, tức nó trông như đang tụt.
      Đĩa là nhãn của TÊN, nên nó phải ngang tên; `marginTop` 2 đưa tâm đĩa về
      đúng giữa hai dòng chữ đầu.
    */
    alignItems: 'flex-start',
    gap: spacing.sm,
    minHeight: 56,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  text: { flex: 1, minWidth: 0, gap: 5 },
  /* 36: vừa đủ để một chữ 15pt ngồi giữa mà không thành một cái nút. Bo tròn
     hẳn — đĩa, không phải ô. */
  mono: {
    width: 36,
    height: 36,
    marginTop: 2,
    borderRadius: radius.full,
    backgroundColor: glass.bg,
    borderWidth: glass.borderWidth,
    borderColor: glass.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monoText: { fontSize: 15, fontWeight: '700', color: colors.foreground },
  /* Xám là mặc định, xanh là ngoại lệ — một kế hoạch chưa có món thì 0% không
     đáng sáng lên. */
  pct: { fontSize: 13, fontWeight: '600', color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  pctOn: { color: colors.readinessGreen },
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
