import { Check, Target } from 'lucide-react-native';
import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { ProgressBar } from '@/components/ascnd/progress-bar';
import { Screen } from '@/components/ascnd/screen';
import { StaggerItem } from '@/components/ascnd/stagger-item';
import { toast } from '@/lib/toast';
import { spacing, type, radius } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import {
  useInitWeeklyChallenges,
  useUpdateChallengeProgress,
  useWeeklyChallenges,
} from '@/hooks/use-extras';
import { challengeText } from '@/lib/gamification-i18n';

export default function ChallengesScreen() {
  const c = usePalette();
  const styles = stylesFor(c);
  const { data: challenges } = useWeeklyChallenges();
  const initChallenges = useInitWeeklyChallenges();
  const updateProgress = useUpdateChallengeProgress();
  const initializedRef = useRef(false);
  const i18n = useI18n();
  const { lang } = useAppSettings();

  /*
    Seed this week's challenges if empty, then refresh progress.

    ── and the refresh says so when it cannot ──

    Today runs the same pass and deliberately swallows its failures: it is
    background work behind a dashboard, and a toast about challenge bookkeeping
    on every return to the home tab would be noise about something nobody asked
    for.

    Here it is the opposite. This screen exists to show these numbers, and the
    person is looking straight at them. A refresh that fails silently leaves
    last week's progress on screen looking like this week's — the app stating a
    number it knows is stale.
  */
  const refreshProgress = useCallback(() => {
    updateProgress.mutate(undefined, {
      onError: (e: Error) => toast.fail(e),
    });
    // `updateProgress` is a fresh object each render; listing it would re-run
    // the effect below on every render rather than once per screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (initializedRef.current || challenges === undefined) return;
    initializedRef.current = true;
    if (challenges.length === 0) {
      initChallenges.mutate(undefined, { onSuccess: refreshProgress });
    } else {
      refreshProgress();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challenges]);

  return (
    <Screen refreshable back title={i18n.nChallenges}>
      {challenges && challenges.length > 0 ? (
        challenges.map((ch, i) => {
          const target = Number(ch.target_value) || 1;
          const current = Math.min(Number(ch.current_value) || 0, target);
          const pct = Math.round((current / target) * 100);
          const { title, desc } = challengeText(ch.challenge_key, lang, { title: ch.title, desc: ch.description });
          return (
            <StaggerItem key={ch.id} index={i}>
            <GlassCard>
              <View style={styles.headerRow}>
                <View style={styles.iconWrap}>
                  <Icon icon={Target} size={20} color={c.primary} />
                </View>
                <View style={styles.info}>
                  <Text style={styles.title}>{title}</Text>
                  {desc ? <Text style={styles.hint}>{desc}</Text> : null}
                </View>
                {ch.completed && <Icon icon={Check} size={18} color={c.readinessGreen} strokeWidth={3} />}
              </View>
              <ProgressBar
                pct={pct}
                color={ch.completed ? c.readinessGreen : c.primary}
                height={8}
                radius={4}
                trackColor={c.secondary}
                style={styles.progressTrack}
              />
              <Text style={styles.progressLabel}>
                {ch.completed ? i18n.nCompleted : `${current} / ${target}`}
              </Text>
            </GlassCard>
            </StaggerItem>
          );
        })
      ) : (
        <GlassCard>
          <Text style={styles.title}>{i18n.nNoChallenges}</Text>
          <Text style={styles.hint}>{i18n.nNoChallengesHint}</Text>
        </GlassCard>
      )}
    </Screen>
  );
}

const stylesFor = makeStyles((c) => ({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconWrap: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: c.secondary, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, minWidth: 0, gap: 2 },
  title: { ...type.headline, color: c.foreground },
  hint: { ...type.footnote, color: c.mutedForeground },
  done: { fontSize: 20, color: c.readinessGreen, fontWeight: '700' },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: c.secondary,
    overflow: 'hidden',
    marginTop: spacing.md,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: c.primary,
  },
  progressLabel: {
    ...type.caption,
    color: c.mutedForeground,
    marginTop: spacing.sm,
    textAlign: 'right',
  },
}));
