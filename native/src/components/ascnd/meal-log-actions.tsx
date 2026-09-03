import * as Haptics from 'expo-haptics';
import { nav } from '@/lib/nav';
import { Barcode, Camera, Pencil, Search } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { PressScale } from '@/components/ascnd/press-scale';
import { radius, spacing, type } from '@/constants/ascnd';
import { alpha, makeStyles, type PaletteKey } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import type { useI18n } from '@/hooks/use-app-settings';

/**
 * The four ways to log a meal, in the page rather than over it.
 *
 * ── what this replaces, and why ──
 *
 * A floating ⊕ above the tab bar. It read well on its own and it could not
 * stay, for a reason that has nothing to do with how it looked: the corner it
 * floated in is not ours any more.
 *
 * The fifth tab is `role="search"`, and iOS 26 draws that role as a circle
 * detached to the right of the tab capsule — the health assistant. Our ⊕ was
 * `right: 16`, a 56pt circle, about 22pt above a 52pt system circle at the
 * same edge. Two floating circles of the same size in one corner, one a
 * destination and one an action, with nothing about either shape to say which
 * was which. Worse, the first row behind the ⊕ was "Quét bữa ăn" → `/scan-food`,
 * and `/scan-food` is also a tile on the assistant page behind the circle
 * below it: the same screen, from two adjacent buttons, by two different
 * gestures.
 *
 * This is the "glass sandwich" the iOS 26 write-ups warn about — a bar, an
 * accessory and a floating button stacked into one corner until none of them
 * reads as anything. Their advice is the same in every one of them: the tab
 * bar is the platform's, so a primary action belongs in the content layer.
 *
 * It was also quietly eating the page. `Screen` pads a tab's content by
 * `BottomTabInset + insets.bottom + 24`; the ⊕ sat 8pt above that inset and
 * stood 56pt tall, so at the end of a scroll it covered the bottom 40pt of the
 * content's right edge — which on the Thực phẩm segment is exactly where every
 * food row keeps its ★ and ✎.
 *
 * ── and it is one tap now, not two ──
 *
 * The ⊕ opened a sheet you then picked from. Four tiles are the sheet, always
 * open, costing one tap instead of two and no memory at all: the four ways are
 * on the screen with their names on them, rather than behind a glyph that
 * promises "something".
 *
 * What it costs is height — about 96pt with its gap — and a scroll, on the day
 * you are at the bottom of a long diary and want to add one more. That is the
 * trade, and it is the right way round: the row sits directly under the ring,
 * which is where the tab opens, so the common case is *arrive and tap* and the
 * uncommon one is a flick.
 *
 * ── Today only ──
 *
 * The ⊕ rendered on all three segments and earned it on one. Thực phẩm has its
 * own search field, its own barcode button and its own "Thêm món" — offering
 * the same four again above them is not a second chance, it is a second answer
 * to a question already answered. Kế hoạch is plans, not a day.
 */

interface Way {
  key: string;
  icon: typeof Camera;
  color: PaletteKey;
  /** the tile's own word — short enough to sit on one line at a quarter width */
  label: keyof ReturnType<typeof useI18n>;
  /** the full phrase, for VoiceOver, where there is no quarter width to fit */
  spoken: keyof ReturnType<typeof useI18n>;
  route: string;
}

/**
 * Camera first — the one people reach for and the one this app is fastest at
 * — then the two lookups, then typing it in, which is the fallback when
 * nothing else knows the food.
 */
const WAYS: Way[] = [
  { key: 'camera', icon: Camera, color: 'metricPurple', label: 'nWayPhoto', spoken: 'nAddCamera', route: '/scan-food' },
  { key: 'barcode', icon: Barcode, color: 'metricCyan', label: 'nWayBarcode', spoken: 'nAddBarcode', route: '/scan-barcode' },
  /*
    ── this tile could not do the thing it is named after ──

    It pointed at `/food-list`, which is the **food library**: its search box
    says "filter this list", tapping a row opens `/food-editor` to change that
    food's nutrition, and the `+` on a recent row saves it into My Foods. There
    is no path from that screen to a logged meal at all — so one of the four
    "ways to log a meal" logged nothing, on the card whose entire job is to be
    the four ways.

    `/log-meal` has had the right screen all along: a search box that queries
    `food_items` and adds the result straight into the meal being built. The
    tile now opens it with that box already focused, so the way in is the same
    number of taps it always looked like it was.

    `manual` below still opens the same sheet without the focus, and the two are
    genuinely different acts: one starts by looking a food up, the other by
    typing one in. What they now have in common is that both of them finish.
  */
  { key: 'search', icon: Search, color: 'metricBlue', label: 'nWaySearch', spoken: 'nAddSearch', route: '/log-meal?focus=search' },
  { key: 'manual', icon: Pencil, color: 'metricOrange', label: 'nWayManual', spoken: 'nAddManual', route: '/log-meal' },
];

export function MealLogActions({ i18n }: { i18n: ReturnType<typeof useI18n> }) {
  const c = usePalette();
  const styles = stylesFor(c);
  return (
    <GlassCard style={styles.card}>
      <Text style={styles.title}>{i18n.nLogMealBtn}</Text>
      <View style={styles.row}>
        {WAYS.map((w) => (
          <PressScale
            key={w.key}
            accessibilityRole="button"
            accessibilityLabel={i18n[w.spoken] as string}
            style={styles.tile}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              nav.push(w.route as never);
            }}>
            <View style={[styles.chip, { backgroundColor: alpha(c[w.color], 0.12) }]}>
              <Icon icon={w.icon} size={20} color={c[w.color]} />
            </View>
            <Text style={styles.label} numberOfLines={1}>
              {i18n[w.label] as string}
            </Text>
          </PressScale>
        ))}
      </View>
    </GlassCard>
  );
}

const stylesFor = makeStyles((c) => ({
  card: { gap: spacing.sm + 2, padding: spacing.card },
  title: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 2.4,
    color: c.mutedForeground,
  },
  row: { flexDirection: 'row', gap: spacing.sm },
  /* 66pt tall, well past Apple's 44pt floor, and each tile is a quarter of the
     card — the whole width is live, not just the glyph in the middle of it. */
  tile: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: spacing.xs, borderRadius: radius.md },
  chip: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  label: { ...type.caption, color: c.foreground },
}));
