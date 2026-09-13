import { type ReactNode } from 'react';
import { Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';

import { GlassSurface } from '@/components/ascnd/glass-surface';
import { Icon } from '@/components/ascnd/icon';
import { radius, spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { useMuted } from '@/hooks/use-wash';

/**
 * Đầu một thẻ: một giếng kính tròn, một tiêu đề, và chỗ cho một thứ bên phải.
 *
 * ── vì sao một cái giếng chứ không phải một icon trần ──
 *
 * Trước đây tiêu đề thẻ là chữ trần, hoặc chữ kèm một icon 15 điểm nằm hờ bên
 * cạnh. Dựng cả màn lên nhìn thì mọi thẻ mở đầu giống hệt nhau và giống hệt
 * một đoạn văn — không gì đánh dấu "một thẻ mới bắt đầu ở đây", nên mắt trượt
 * qua bốn thẻ như trượt qua một danh sách.
 *
 * Một hình TRÒN trong một thế giới toàn hình chữ nhật bo góc là cái mốc rẻ
 * nhất có thể có: nó khác hình, nên nó bắt được mắt mà không cần thêm màu,
 * thêm cỡ chữ, hay thêm một đường kẻ nào.
 *
 * ── và vì sao nó KHÔNG thêm một lớp blur nào ──
 *
 * `GlassSurface` chỉ dựng `BlurView` khi tầng có `blur > 0`, và `secondary`
 * thì bằng 0 — xem `blurScale` trong `palette.ts`. Nên cái giếng là một mặt
 * nền mờ cộng một viền, không phải một lớp lấy mẫu lại nền mỗi khung hình.
 * Brief mục hiệu năng dặn đúng chuyện ấy, và một cái mốc lặp trên mọi thẻ là
 * đúng chỗ mà cái giá ấy nhân lên.
 *
 * ── icon MỜ, không phải icon màu ──
 *
 * Icon ở đây đỡ thứ bậc chứ không mang tin: cái mang tin là tiêu đề ngay cạnh
 * nó. Tô màu icon là lấy mất sắc nóng khỏi chỗ duy nhất trên màn đáng được tô
 * — xem mốc mục tiêu trong `sleep-insights.tsx`. Chỗ gọi vẫn đổi được `tint`
 * khi màu thật sự MANG NGHĨA.
 */
export function CardHeader({
  icon,
  title,
  tint,
  trailing,
}: {
  icon: LucideIcon;
  title: string;
  /** Màu của icon. Bỏ trống là mực mờ — dùng màu khi nó MANG NGHĨA. */
  tint?: string;
  /** Thứ đứng bên phải: một chip, một nút, một nhãn đơn vị. */
  trailing?: ReactNode;
}) {
  const c = usePalette();
  const muted = useMuted();
  const styles = stylesFor(c);
  return (
    <View style={styles.row}>
      <GlassSurface tier="secondary" radius={radius.full} elevation="secondary" style={styles.well}>
        <Icon icon={icon} size={16} color={tint ?? muted} />
      </GlassSurface>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  );
}

const stylesFor = makeStyles((c) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  /* 34 chứ không 44: đây KHÔNG phải vùng chạm, nó không nhận sự kiện nào — nên
     luật `tap-target.mjs` không áp, và 44 sẽ làm cái mốc to hơn tiêu đề nó
     đang đánh dấu. */
  well: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  title: { ...type.headline, color: c.foreground, flex: 1, minWidth: 0 },
  trailing: { marginLeft: 'auto' },
}));
