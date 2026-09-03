import * as Haptics from 'expo-haptics';
import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { PressScale } from '@/components/ascnd/press-scale';
import { spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';

/**
 * A door with its name on it, and what is behind it already written down.
 *
 * ── what this replaced ──
 *
 * Two icons in the Nutrition header: a pill and a shopping trolley. Both are
 * one tap from anywhere on the tab, which is good, and neither says what it is,
 * which is not. The trolley is the worse of the two — this app has an actual
 * shop, so a trolley in a header is a reasonable guess at the wrong thing.
 *
 * ── why a row and not a labelled chip in the same place ──
 *
 * Because the label is not the only thing that was missing. A door tells you
 * nothing until you have opened it, so "have I taken my supplements today"
 * required a tap, a look and a tap back — three actions to answer a question
 * whose answer is two numbers.
 *
 * A row has room for the answer. `value` carries it: *2/4 hôm nay*, *5 món*.
 * Most of the time it means the tap does not happen at all, which is a smaller
 * number of actions than the icon it replaced, not a larger one. It is the
 * pattern Apple Health uses for everything on its summary — the name on the
 * left, the current reading on the right, the chevron only as a promise that
 * there is more.
 *
 * The trade is one scroll. These sit under the diary rather than above it,
 * because the diary is why somebody opened the tab and nothing occasional gets
 * to push it down.
 */
export function ShortcutRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  /** The state behind the door. `null` when there is nothing to report. */
  value?: string | null;
  onPress: () => void;
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  return (
    <PressScale
      accessibilityRole="button"
      /* The value is part of the name for a screen reader: "Đi chợ, 5 món"
         is the whole row, and reading the label alone would drop the half of
         it that this component exists to add. */
      accessibilityLabel={value ? `${label}, ${value}` : label}
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}>
      <GlassCard style={styles.card}>
        <View style={styles.row}>
          <Icon icon={icon} size={17} color={c.mutedForeground} />
          <Text style={styles.label} numberOfLines={1}>{label}</Text>
          {value ? <Text style={styles.value} numberOfLines={1}>{value}</Text> : null}
          <Icon icon={ChevronRight} size={17} color={c.mutedForeground} />
        </View>
      </GlassCard>
    </PressScale>
  );
}

const stylesFor = makeStyles((c) => ({
  /* Shallower than a content card. These are not things to read, they are ways
     out, and a row with a card's full padding reads as heavier than the diary
     above it. */
  card: { paddingVertical: spacing.sm + 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 28 },
  /* `flex: 1` on the label rather than on the value: the label is the thing
     that can be long enough to need truncating, and a value like "12/14" must
     never be the part that gets cut. */
  label: { ...type.body, color: c.foreground, flex: 1 },
  value: { ...type.footnote, color: c.mutedForeground, fontVariant: ['tabular-nums'] },
}));
