import * as Haptics from 'expo-haptics';
import { X } from 'lucide-react-native';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ascnd/icon';
import { PressScale } from '@/components/ascnd/press-scale';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';

/**
 * The top of every sheet in the app: a grab bar, a way out, and the name.
 *
 * ── what it replaces ──
 *
 * Eight modal routes and a handful of `<Modal>` components each built their
 * own top. Most of them built the same one — a `<Text style={styles.title}>`
 * and nothing else — which means most sheets in this app had **no visible way
 * out at all**. They close by dragging down, and that is a gesture you either
 * know or you do not; there was nothing on screen that said so.
 *
 * The rest disagreed about everything that was left: the title sat left in
 * `FormSheet` and centred in `log-meal`, the close button was 34pt in one
 * place and 40 in another, and `weight-goal-dialog` used a back arrow. Six
 * variations of one idea is not six decisions, it is one decision nobody made.
 *
 * ── the grab bar is a PROMISE, so it is a prop ──
 *
 * It says "you can drag this down". On an iOS `pageSheet` that is true and the
 * bar is the only thing that says so. On a `fullScreenModal` — the two camera
 * screens — it is false: nothing drags, and a bar there is a control that does
 * not exist.
 *
 * So `grabber` defaults to true and the camera screens turn it off, rather
 * than every sheet remembering to turn it on. The default is the common case,
 * and the exception has to be written down at the call site where somebody can
 * see it.
 *
 * ── why the close button is on the LEFT ──
 *
 * Because the title is centred, and a centred title needs both ends occupied
 * or it is not centred — it is just text that happens to be near the middle.
 * With the button on the left, the right end is a transparent spacer of the
 * same width.
 *
 * That spacer is transparent on purpose, and the reason is a bug this app
 * already shipped: `weight-goal-dialog` balanced its title by reusing the back
 * button's own style, so it drew a filled grey disc in the top-right corner —
 * same size, same colour, same shape as a button, and pressing it did nothing.
 */
export function SheetHeader({
  title,
  subtitle,
  onClose,
  grabber = true,
  icon = X,
  right,
}: {
  title: string;
  /**
   * A second line under the title — `workout-builder`'s "step 2 of 2" line.
   *
   * One caller, and it is here rather than in that file because the thing it
   * replaced was a hand-rolled header carrying the SAME bug this component was
   * written to end: its balancing spacer reused the button's own style, so it
   * drew a second phantom grey disc in the top-right corner. Two files had
   * independently made that mistake.
   */
  subtitle?: string;
  /** Required. A sheet with no way out is the bug this component exists for. */
  onClose: () => void;
  /** false only where the sheet genuinely cannot be dragged away */
  grabber?: boolean;
  /**
   * The glyph in the left button. X by default, and it should stay X.
   *
   * `workout-builder` is the one caller that changes it: it runs a two-step
   * flow inside one sheet, so from the second step the left button goes BACK
   * rather than out, and an X there would throw away a half-finished workout.
   * The distinction is real, which is why it is a prop and not a copy of this
   * component.
   */
  icon?: ComponentProps<typeof Icon>['icon'];
  /**
   * A commit action at the far end — `edit-profile`'s Save.
   *
   * When it is absent the right end is a transparent spacer of exactly the
   * button's width, so the title is centred either way. That is the whole
   * reason this slot exists rather than each caller wrapping the header: a
   * caller that put its own button beside `SheetHeader` would push the title
   * off centre by half a button.
   */
  right?: ReactNode;
}) {
  const i18n = useI18n();

  return (
    <View style={styles.root}>
      {/* Không nhận chạm: nó là một lời KỂ về cử chỉ, không phải một nút. Bắt
          chạm ở đây sẽ nuốt mất cú vuốt xuống mà chính nó đang quảng cáo. */}
      {grabber ? <View style={styles.grabber} pointerEvents="none" /> : null}

      <View style={styles.row}>
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={i18n.a11yClose}
          hitSlop={12}
          onPress={() => {
            Haptics.selectionAsync();
            onClose();
          }}
          style={styles.close}>
          <Icon icon={icon} size={18} color={colors.foreground} />
        </PressScale>

        <View style={styles.titleBox}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {/* Cân tiêu đề, TRONG SUỐT — xem đoạn về đĩa tròn giả ở trên */}
        {right ?? <View style={styles.spacer} />}
      </View>
    </View>
  );
}

/** Đường kính nút đóng, và cũng là bề rộng chỗ trống cân nó ở đầu kia. */
const BTN = 34;

const styles = StyleSheet.create({
  root: { paddingTop: spacing.sm },
  /*
   * 48 × 4, bo tròn hẳn.
   *
   * Đo trên ảnh tham chiếu (sheet chọn model của Claude Code, 921px cho một
   * màn 393pt → 2,34 px/pt): thanh rộng 114px ≈ 48pt, cao 6px ≈ 2,5pt. Lấy 4
   * chứ không lấy 2,5 vì đây là nền tối — một thanh 2,5pt màu #2b2b31 trên nền
   * #0e0e11 gần như không đọc được, còn ảnh tham chiếu là một sheet nền xám
   * sáng hơn hẳn.
   */
  grabber: {
    width: 48,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  close: {
    width: BTN,
    height: BTN,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary,
  },
  /* `flex: 1` ở giữa hai đầu bằng nhau là thứ làm nó căn giữa THẬT, kể cả khi
     tiêu đề dài và bị cắt bớt. */
  titleBox: { flex: 1, alignItems: 'center' },
  title: { ...type.title2, textAlign: 'center', color: colors.foreground },
  subtitle: { ...type.caption, textAlign: 'center', color: colors.mutedForeground },
  spacer: { width: BTN, height: BTN },
});
