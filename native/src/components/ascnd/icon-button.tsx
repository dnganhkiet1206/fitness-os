import * as Haptics from 'expo-haptics';
import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { PressScale } from '@/components/ascnd/press-scale';
import { Icon } from '@/components/ascnd/icon';
import { colors } from '@/constants/ascnd';

/** Apple HIG's floor for anything a thumb has to hit. */
const MIN_TARGET = 44;

/**
 * A button that is only an icon — with a name, and a thumb-sized target.
 *
 * ── why this is a component and not a convention ──
 *
 * The audit counted 229 `Pressable`s. 59 of them contained an icon and no text.
 * 56 of those had no `accessibilityLabel`, and the whole app had four. VoiceOver
 * reads an unnamed button as "button": the back button on every screen, the
 * tabs along the bottom, the delete on every row — all of them unnamed, which
 * is WCAG 2.1 SC 4.1.2 at Level A, the lowest bar there is.
 *
 * That is not 56 people forgetting. A label is invisible while you develop by
 * looking at the screen, and nothing failed without it, so "done" never included
 * it. Convention loses that argument every time; a type does not. `label` is
 * required here, so an icon button without a name does not compile.
 *
 * ── the hit area is computed, not chosen ──
 *
 * Seven controls were under 44pt once `hitSlop` was accounted for — a 24×24
 * checkbox with no slop at all, steppers at 40, an arrow at 38. The rest were
 * fine, and they were fine because somebody remembered `hitSlop` each time,
 * which is the same fragile arrangement as the labels.
 *
 * So the drawn size is a visual decision and the target is derived from it:
 * whatever `size` the glyph box is, the slop makes up the difference to 44.
 * Pass `size` freely; the target cannot come out too small.
 *
 * `hitSlop` rather than padding, deliberately — padding would push the icon's
 * neighbours apart and change every layout this replaces. Slop extends the
 * touch area outside the view without moving a pixel.
 *
 * ── on the haptic ──
 *
 * On by default because every hand-written version of this had one and it is
 * the kind of thing that goes missing when copied. `haptic={false}` for the few
 * places that fire their own (a destructive action wants a heavier tap than a
 * navigation).
 */
export function IconButton({
  icon,
  label,
  onPress,
  size = 36,
  iconSize,
  color = colors.mutedForeground,
  disabled = false,
  haptic = true,
  style,
  testID,
}: {
  icon: LucideIcon;
  /**
   * What a screen reader says. Required — see above.
   *
   * A verb, not a noun: "Delete photo", not "Trash". The reader already
   * announces "button", so the label supplies the action, and a noun leaves the
   * listener to guess what pressing it does.
   */
  label: string;
  onPress: () => void;
  /** the drawn box; the touch target is padded out to 44 regardless */
  size?: number;
  /** glyph size — defaults to a little over half the box, which reads right */
  iconSize?: number;
  color?: string;
  disabled?: boolean;
  haptic?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  // Never negative: a box already at or over 44 needs no help.
  const slop = Math.max(0, Math.ceil((MIN_TARGET - size) / 2));

  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      testID={testID}
      disabled={disabled}
      hitSlop={slop}
      onPress={() => {
        if (haptic) Haptics.selectionAsync();
        onPress();
      }}
      style={[styles.base, { width: size, height: size }, disabled && styles.disabled, style]}>
      <Icon icon={icon} size={iconSize ?? Math.round(size * 0.46)} color={color} />
    </PressScale>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.35 },
});
