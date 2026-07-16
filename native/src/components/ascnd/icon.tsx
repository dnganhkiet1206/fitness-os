import type { LucideIcon } from 'lucide-react-native';

import { colors } from '@/constants/ascnd';

/**
 * Thin wrapper over lucide-react-native so the whole app draws icons as
 * monochrome vectors (same icon set as the original web app), never
 * colored emoji. Defaults match the web's line weight; pass `color` to
 * tint with a theme token.
 */
export function Icon({
  icon: LucideCmp,
  size = 20,
  color = colors.mutedForeground,
  strokeWidth = 2,
}: {
  icon: LucideIcon;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  return <LucideCmp size={size} color={color} strokeWidth={strokeWidth} />;
}
