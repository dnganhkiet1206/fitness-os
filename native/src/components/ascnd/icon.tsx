import type { LucideIcon } from 'lucide-react-native';

import { colors } from '@/constants/ascnd';
import { iconTint } from '@/constants/icon-tint';

/**
 * Thin wrapper over lucide-react-native so the whole app draws icons as
 * monochrome vectors (same icon set as the original web app), never
 * colored emoji. Defaults match the web's line weight.
 *
 * ── the colour comes from what the icon means ──
 *
 * With no `color`, an icon that stands for something in the app takes that
 * thing's colour — food is green wherever it appears, the heart is red, water
 * is cyan (see `constants/icon-tint`). Everything else stays muted grey, which
 * is what every icon used to default to.
 *
 * That default is the point. The app had `Utensils` in silver on three screens
 * and grey on a fourth, `Sparkles` in three different colours, because each
 * call site decided for itself. Deciding centrally means a screen has to *opt
 * out* to be inconsistent rather than opt in to be consistent.
 *
 * `color` still wins when it is passed, for the cases that genuinely are
 * per-instance: a star that is yellow when a food is a favourite and grey when
 * it is not, an icon tinted to match the ring it sits in, a glyph on a
 * coloured button.
 */
export function Icon({
  icon: LucideCmp,
  size = 20,
  color,
  strokeWidth = 2,
  fill,
}: {
  icon: LucideIcon;
  size?: number;
  /** overrides the icon's own meaning — for genuinely per-instance colour */
  color?: string;
  strokeWidth?: number;
  /**
   * Solid rather than outline, for the handful of icons whose *state* is the
   * point: a lit streak flame against an unlit one, a filled star against an
   * empty one. Lucide's own props stop at colour and weight, but its React
   * Native `Icon` spreads the rest of its props onto every child path
   * (`{ ...childDefaultAttributes, ...customAttrs, ...attrs }`), so `fill`
   * reaches the drawing — checked in the installed v1.24 source, not assumed.
   */
  fill?: string;
}) {
  return (
    <LucideCmp
      size={size}
      color={color ?? iconTint(LucideCmp) ?? colors.mutedForeground}
      strokeWidth={strokeWidth}
      fill={fill}
    />
  );
}
