import { Flame } from 'lucide-react-native';
import { nav } from '@/lib/nav';
import * as Haptics from 'expo-haptics';
import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ascnd/icon';
import { PressScale } from '@/components/ascnd/press-scale';
import { radius, spacing } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { useI18n } from '@/hooks/use-app-settings';
import { useDailyStreak } from '@/hooks/use-mascot-room';

/**
 * The streak, where you already are.
 *
 * ── the gap this closes ──
 *
 * The streak has existed since the buddy shipped: it is counted, it pays a
 * bonus, it grants medals at 3, 7, 14 and 30 days. It was also **only visible
 * inside Koa's room**, a screen you have to decide to visit. A streak nobody
 * can see is a number in a database.
 *
 * That is the one thing Duolingo never gets wrong. The flame and the count sit
 * in the top bar of the screen you land on, every single launch, so the streak
 * is not something you go and check — it is something you cannot help noticing.
 * Ours now sits in the header of Today, next to the buttons that were already
 * there, and costs no vertical space at all.
 *
 * ── grey means something ──
 *
 * A streak that ends *yesterday* is still alive — there are hours left — but it
 * is not safe, and those are different facts. Duolingo draws the flame grey
 * until the day's lesson is done and lights it after, which is the app's most
 * effective sentence and it contains no words. This does the same: muted while
 * today is unlogged, lit once there is a row for today.
 *
 * That is also the honest reading. It never says "0" at a moment when the count
 * might be wrong — a failed or unfinished query renders **nothing**, because a
 * dark flame reading zero to somebody who has logged for forty days is the kind
 * of lie this app has fixed too many times.
 *
 * ── and it is only ever a chip ──
 *
 * There is no drawer, no confetti, no second bar. The milestones already have a
 * celebration of their own (`award-celebration.tsx`), and research on this is
 * blunt: too much confetti makes the big moments feel smaller. A tap goes to
 * the room, where the bonus is claimed — one tap, from where you are.
 */
export function StreakChip() {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const { data } = useDailyStreak();

  // Unread, or nothing to show yet: no chip. A streak appears the day it starts
  // being true, which makes its arrival the first thing it ever says.
  if (!data || data.count < 1) return null;

  const lit = data.loggedToday;

  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={
        (lit ? i18n.nStreakLit : i18n.nStreakAtRisk).replace('{n}', String(data.count))
      }
      style={[styles.chip, lit ? styles.chipLit : styles.chipRisk]}
      onPress={() => {
        Haptics.selectionAsync();
        nav.push('/mascot-room');
      }}>
      <View style={styles.row}>
        <Icon
          icon={Flame}
          size={18}
          color={lit ? c.metricOrange : c.mutedForeground}
          fill={lit ? c.metricOrange : 'transparent'}
        />
        <Text style={[styles.count, !lit && styles.countRisk]}>{data.count}</Text>
      </View>
    </PressScale>
  );
}

const stylesFor = makeStyles((c) => ({
  /* 44 tall to stand level with the header's square buttons — a pill of a
     different height beside them reads as something that fell in. */
  chip: {
    height: 44,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  chipLit: {
    backgroundColor: 'rgba(255,145,48,0.13)',
    borderColor: 'rgba(255,145,48,0.28)',
  },
  chipRisk: {
    backgroundColor: 'rgba(24,24,27,0.2)',
    borderColor: 'rgba(43,43,49,0.3)',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  count: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3, color: c.metricOrange },
  countRisk: { color: c.mutedForeground },
}));
