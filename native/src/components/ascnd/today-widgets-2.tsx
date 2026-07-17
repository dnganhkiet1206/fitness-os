import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  Activity,
  AlertTriangle,
  Beef,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  Clock,
  Droplets,
  Dumbbell,
  Flame,
  Footprints,
  Heart,
  Moon,
  Target,
  Trophy,
  Wifi,
  WifiOff,
  Wind,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { colors, radius, spacing } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useNudges, useRecentWorkouts, useTodayBiometrics, useWearables } from '@/hooks/useTodayData';
import { useRecentAwards } from '@/hooks/use-extras';
import { awardText } from '@/lib/gamification-i18n';
import { localDateStr } from '@/lib/local-date';

function MicroTitle({ icon, children, color }: { icon?: LucideIcon; children: React.ReactNode; color?: string }) {
  return (
    <View style={styles.microRow}>
      {icon ? <Icon icon={icon} size={13} color={color ?? colors.mutedForeground} /> : null}
      <Text style={styles.microTitle}>{children}</Text>
    </View>
  );
}

// ─── BiometricsCard (web dashboard/BiometricsCard) ─────────────────────

export function BiometricsCard() {
  const i18n = useI18n();
  const { data: bio } = useTodayBiometrics();
  const { data: wearables } = useWearables();

  if (!bio) return null;
  const connected = (wearables ?? []).find((w) => w.connected);

  const metrics = [
    { label: 'Heart Rate', value: bio.hr_bpm, unit: 'bpm', icon: Heart, color: colors.destructive },
    { label: 'HRV', value: bio.hrv_rmssd_ms, unit: 'ms', icon: Activity, color: colors.primary },
    { label: 'SpO₂', value: bio.spo2_pct, unit: '%', icon: Droplets, color: colors.metricBlue },
    { label: 'VO₂max', value: bio.vo2max_mlkgmin, unit: 'ml/kg', icon: Wind, color: colors.metricCyan },
    { label: 'Resp Rate', value: bio.resp_rate_rpm, unit: 'rpm', icon: Wind, color: colors.metricPurple },
  ].filter((m) => m.value != null);

  if (metrics.length === 0) return null;

  return (
    <Pressable onPress={() => { Haptics.selectionAsync(); router.push('/biometrics'); }}>
      {({ pressed }) => (
        <GlassCard style={[styles.stackCard, pressed && styles.pressedDim]}>
          <View style={styles.headRow}>
            <MicroTitle>{i18n.dcBioTitle}</MicroTitle>
            <View style={styles.connRow}>
              <Icon
                icon={connected ? Wifi : WifiOff}
                size={12}
                color={connected ? colors.readinessGreen : colors.readinessRed}
              />
              <Text style={styles.connText}>
                {connected ? String(connected.provider).replace('_', ' ') : i18n.dcBioNotConnected}
              </Text>
            </View>
          </View>
          <View style={styles.bioGrid}>
            {metrics.map((m) => (
              <View key={m.label} style={styles.bioTile}>
                <Icon icon={m.icon} size={15} color={m.color} />
                <View style={styles.bioTileInfo}>
                  <View style={styles.bioValueRow}>
                    <Text style={styles.bioValue}>{Math.round(Number(m.value) * 10) / 10}</Text>
                    <Text style={styles.bioUnit}>{m.unit}</Text>
                  </View>
                  <Text style={styles.bioLabel}>{m.label}</Text>
                </View>
              </View>
            ))}
          </View>
        </GlassCard>
      )}
    </Pressable>
  );
}

// ─── TrainingCard (web dashboard/TrainingCard) ─────────────────────────

interface PainFlag {
  bodyPart?: string;
  pain_0_10?: number;
}

export function TrainingCard({ acwr }: { acwr: number | null }) {
  const i18n = useI18n();
  const { data: workouts } = useRecentWorkouts();

  const latest = (workouts ?? [])[0];
  if (!latest) return null;

  const a = acwr ?? 0;
  const acwrColor =
    a >= 0.8 && a <= 1.3 ? colors.readinessGreen : a > 1.3 ? colors.readinessYellow : colors.readinessRed;
  const acwrLabel = a >= 0.8 && a <= 1.3 ? 'Optimal' : a > 1.6 ? 'Spike' : a > 1.3 ? 'Elevated' : a < 0.65 ? 'Detraining' : 'Low';
  const acwrPct = Math.min((a / 2) * 100, 100);

  const totalVolume = (workouts ?? []).reduce((s, w) => s + Number(w.volume_load || 0), 0);
  const hasPR = (workouts ?? []).some((w) => w.pr_detected);
  const sets = Array.isArray(latest.sets) ? latest.sets : [];
  const painFlags = (Array.isArray(latest.pain_flags) ? (latest.pain_flags as PainFlag[]) : []).filter(
    (p) => (p.pain_0_10 ?? 0) > 0,
  );

  return (
    <GlassCard style={styles.stackCard}>
      <View style={styles.headRow}>
        <MicroTitle>{i18n.dcTrainingTitle}</MicroTitle>
        {hasPR && (
          <View style={styles.prBadge}>
            <Icon icon={Trophy} size={13} color={colors.readinessYellow} />
            <Text style={styles.prText}>PR!</Text>
          </View>
        )}
      </View>

      {/* Latest workout row */}
      <View style={styles.latestRow}>
        <View style={styles.latestIcon}>
          <Icon icon={Dumbbell} size={20} color={colors.primary} />
        </View>
        <View style={styles.latestInfo}>
          <Text style={styles.latestName} numberOfLines={1}>{latest.template_name || 'Workout'}</Text>
          <Text style={styles.latestMeta}>
            RPE {Number(latest.session_rpe ?? 0)}/10 · {sets.length} sets · {Number(latest.volume_load || 0).toLocaleString()} vol
          </Text>
        </View>
      </View>

      {/* ACWR box */}
      {a > 0 && (
        <View style={styles.acwrBox}>
          <View style={styles.headRow}>
            <View style={styles.acwrTitleRow}>
              <Icon icon={Zap} size={14} color={colors.mutedForeground} />
              <Text style={styles.acwrTitle}>Acute:Chronic Ratio</Text>
            </View>
            <View style={[styles.acwrPill, { backgroundColor: `${acwrColor}1a` }]}>
              <Text style={[styles.acwrPillText, { color: acwrColor }]}>{acwrLabel}</Text>
            </View>
          </View>
          <Text style={[styles.acwrValue, { color: acwrColor }]}>{a}</Text>
          <View style={styles.acwrTrack}>
            <View style={styles.acwrOptimal} />
            <View style={[styles.acwrIndicator, { left: `${acwrPct}%` }]} />
          </View>
          <View style={styles.acwrTicks}>
            <Text style={styles.acwrTick}>0</Text>
            <Text style={[styles.acwrTick, { color: colors.readinessGreen }]}>0.8–1.3</Text>
            <Text style={styles.acwrTick}>2.0</Text>
          </View>
        </View>
      )}

      <Text style={styles.volumeLine}>
        {i18n.dcTraining7dVolume}: <Text style={styles.volumeValue}>{totalVolume.toLocaleString()}</Text>
      </Text>

      {painFlags.length > 0 && (
        <View style={styles.painRow}>
          <Icon icon={AlertTriangle} size={13} color={colors.readinessYellow} />
          <Text style={styles.painText}>
            {i18n.dcTrainingPain}: {painFlags.map((p) => `${p.bodyPart} (${p.pain_0_10}/10)`).join(', ')}
          </Text>
        </View>
      )}
    </GlassCard>
  );
}

// ─── WorkoutStatus (web dashboard/WorkoutStatus) ───────────────────────

export function WorkoutStatusCard({ planned }: { planned: number }) {
  const i18n = useI18n();
  const { data: workouts } = useRecentWorkouts();

  const todayStr = localDateStr();
  const todays = (workouts ?? []).filter(
    (w) => localDateStr(new Date(w.date_time)) === todayStr,
  );
  const done = todays.length;
  const allDone = planned > 0 && done >= planned;
  const pct = planned > 0 ? Math.min((done / planned) * 100, 100) : 0;

  return (
    <GlassCard style={styles.stackCard}>
      <MicroTitle icon={CalendarCheck}>{i18n.workoutStatusTitle}</MicroTitle>

      <View style={styles.statusRow}>
        <View style={styles.statusValueRow}>
          <Text style={styles.statusDone}>{done}</Text>
          <Text style={styles.statusPlanned}>/ {planned || '–'}</Text>
        </View>
        {allDone ? (
          <View style={styles.doneBadge}>
            <Icon icon={CheckCircle2} size={13} color={colors.readinessGreen} />
            <Text style={styles.doneText}>{i18n.workoutStatusDone}</Text>
          </View>
        ) : done === 0 && planned > 0 ? (
          <View style={styles.notYetRow}>
            <Icon icon={Clock} size={13} color={colors.mutedForeground} />
            <Text style={styles.notYetText}>{i18n.workoutStatusNotYet}</Text>
          </View>
        ) : null}
      </View>

      {planned > 0 && (
        <View style={styles.statusTrack}>
          <View style={[styles.statusFill, { width: `${pct}%` }]} />
        </View>
      )}

      {todays.length > 0 && (
        <View style={styles.chipRow}>
          {todays.map((w, i) => (
            <View key={i} style={styles.nameChip}>
              <Text style={styles.nameChipText}>{w.template_name || 'Workout'}</Text>
            </View>
          ))}
        </View>
      )}
    </GlassCard>
  );
}

// ─── NudgesCard (web dashboard/NudgesCard) ─────────────────────────────

const NUDGE_ICON: Record<string, LucideIcon> = {
  sleep: Moon,
  hydration: Droplets,
  protein: Beef,
  steps: Footprints,
  recovery: Heart,
};

const NUDGE_PRIORITY_COLOR: Record<string, string> = {
  high: colors.readinessRed,
  medium: colors.readinessYellow,
  low: colors.readinessGreen,
};

export function NudgesCard() {
  const i18n = useI18n();
  const { data: nudges } = useNudges();

  const active = (nudges ?? []).filter((n) => n.enabled);
  if (active.length === 0) return null;

  return (
    <GlassCard style={styles.stackCard}>
      <View style={styles.headRow}>
        <MicroTitle>{i18n.dcNudgesTitle}</MicroTitle>
        <Text style={styles.countText}>{active.length} {i18n.dcNudgesActive}</Text>
      </View>
      <View style={styles.nudgeList}>
        {active.map((n) => {
          const NIcon = NUDGE_ICON[n.type] ?? Heart;
          const pColor = NUDGE_PRIORITY_COLOR[n.priority ?? 'low'] ?? colors.readinessGreen;
          return (
            <View key={n.id} style={styles.nudgeRow}>
              <View style={[styles.nudgeAccent, { backgroundColor: pColor }]} />
              <Icon icon={NIcon} size={15} color={colors.mutedForeground} />
              <View style={styles.nudgeInfo}>
                <Text style={styles.nudgeMsg}>{n.message}</Text>
                <Text style={styles.nudgeMeta}>
                  Cap: {n.frequency_cap ?? 3}x/day · {n.priority}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </GlassCard>
  );
}

// ─── RecentAwards (web dashboard/RecentAwards) ─────────────────────────

const AWARD_ICON: Record<string, LucideIcon> = {
  flame: Flame,
  dumbbell: Dumbbell,
  trophy: Trophy,
  calendar: CalendarCheck,
  target: Target,
  moon: Moon,
  footprints: Footprints,
  beef: Beef,
};

const TIER_COLOR: Record<string, string> = {
  bronze: '#c47b3d',
  silver: '#c7cad1',
  gold: '#e8ba30',
  platinum: '#8d52e0',
};

export function RecentAwardsCard() {
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const { data: awards } = useRecentAwards(3);

  if (!awards || awards.length === 0) return null;

  return (
    <GlassCard style={styles.stackCard}>
      <View style={styles.headRow}>
        <MicroTitle icon={Trophy} color={colors.readinessYellow}>{i18n.dcRecentAwards}</MicroTitle>
        <Pressable
          hitSlop={8}
          style={styles.viewAll}
          onPress={() => { Haptics.selectionAsync(); router.push('/awards'); }}>
          <Text style={styles.viewAllText}>{i18n.dcViewAll}</Text>
          <Icon icon={ChevronRight} size={12} color={colors.primary} />
        </Pressable>
      </View>
      <View style={styles.awardList}>
        {awards.map((a) => {
          const AIcon = AWARD_ICON[a.icon ?? ''] ?? Trophy;
          const tint = TIER_COLOR[a.tier ?? ''] ?? colors.mutedForeground;
          const { title, desc } = awardText(a.award_key, lang, { title: a.title, desc: a.description });
          return (
            <View key={a.id} style={styles.awardRow}>
              <View style={[styles.awardIcon, { borderColor: `${tint}55`, backgroundColor: `${tint}14` }]}>
                <Icon icon={AIcon} size={17} color={tint} />
              </View>
              <View style={styles.awardInfo}>
                <Text style={styles.awardTitle} numberOfLines={1}>{title}</Text>
                {desc ? <Text style={styles.awardDesc} numberOfLines={1}>{desc}</Text> : null}
              </View>
              <Text style={[styles.awardTier, { color: tint }]}>{a.tier}</Text>
            </View>
          );
        })}
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  stackCard: { gap: spacing.md },
  pressedDim: { opacity: 0.8 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  microRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  microTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 2.4,
    color: colors.mutedForeground,
  },
  countText: { fontSize: 10, fontFamily: 'Menlo', color: colors.mutedForeground },

  // Biometrics
  connRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  connText: { fontSize: 11, color: colors.mutedForeground, textTransform: 'capitalize' },
  bioGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm + 4 },
  bioTile: {
    width: '47.5%',
    flexDirection: 'row',
    gap: spacing.sm + 2,
    backgroundColor: 'rgba(24,24,27,0.2)',
    borderRadius: radius.sm,
    padding: spacing.sm + 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(43,43,49,0.2)',
  },
  bioTileInfo: { flex: 1, minWidth: 0, gap: 2 },
  bioValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  bioValue: { fontSize: 19, fontFamily: 'Menlo', fontWeight: '700', color: colors.foreground, fontVariant: ['tabular-nums'] },
  bioUnit: { fontSize: 10, color: colors.mutedForeground },
  bioLabel: { fontSize: 10, color: colors.mutedForeground },

  // Training
  prBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    borderRadius: radius.full,
    backgroundColor: 'rgba(232,186,48,0.15)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(232,186,48,0.2)',
  },
  prText: { fontSize: 12, fontWeight: '700', color: colors.readinessYellow },
  latestRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
  latestIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(168,175,189,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(168,175,189,0.2)',
  },
  latestInfo: { flex: 1, minWidth: 0, gap: 2 },
  latestName: { fontSize: 14, fontWeight: '600', color: colors.foreground },
  latestMeta: { fontSize: 12, color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  acwrBox: {
    backgroundColor: 'rgba(24,24,27,0.2)',
    borderRadius: radius.sm,
    padding: spacing.md,
    gap: spacing.sm + 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(43,43,49,0.2)',
  },
  acwrTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  acwrTitle: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5, color: colors.mutedForeground },
  acwrPill: { paddingHorizontal: spacing.sm + 2, paddingVertical: 3, borderRadius: radius.sm - 4 },
  acwrPillText: { fontSize: 12, fontWeight: '600' },
  acwrValue: { fontSize: 30, fontFamily: 'Menlo', fontWeight: '700', fontVariant: ['tabular-nums'] },
  acwrTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(24,24,27,0.4)', overflow: 'visible' },
  acwrOptimal: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '40%',
    right: '35%',
    borderRadius: 4,
    backgroundColor: 'rgba(32,182,132,0.12)',
  },
  acwrIndicator: {
    position: 'absolute',
    top: -1,
    width: 6,
    height: 10,
    borderRadius: 3,
    marginLeft: -3,
    backgroundColor: colors.foreground,
  },
  acwrTicks: { flexDirection: 'row', justifyContent: 'space-between' },
  acwrTick: { fontSize: 9, color: colors.mutedForeground, fontFamily: 'Menlo' },
  volumeLine: { fontSize: 12, color: colors.mutedForeground },
  volumeValue: { fontFamily: 'Menlo', fontWeight: '600', color: colors.foreground },
  painRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(232,186,48,0.1)',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm + 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(232,186,48,0.2)',
  },
  painText: { flex: 1, fontSize: 12, color: colors.readinessYellow },

  // Workout status
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  statusValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  statusDone: { fontSize: 30, fontFamily: 'Menlo', fontWeight: '700', color: colors.foreground, fontVariant: ['tabular-nums'] },
  statusPlanned: { fontSize: 14, color: colors.mutedForeground },
  doneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: 'rgba(32,182,132,0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(32,182,132,0.2)',
  },
  doneText: { fontSize: 12, fontWeight: '600', color: colors.readinessGreen },
  notYetRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  notYetText: { fontSize: 12, color: colors.mutedForeground },
  statusTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(24,24,27,0.3)', overflow: 'hidden' },
  statusFill: { height: '100%', borderRadius: 3, backgroundColor: colors.primary },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  nameChip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: 'rgba(168,175,189,0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(168,175,189,0.2)',
  },
  nameChipText: { fontSize: 10, fontWeight: '500', color: colors.primary },

  // Nudges
  nudgeList: { gap: spacing.sm + 2 },
  nudgeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + 2,
    backgroundColor: 'rgba(24,24,27,0.15)',
    borderRadius: radius.sm,
    padding: spacing.sm + 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(43,43,49,0.2)',
    overflow: 'hidden',
  },
  nudgeAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 2 },
  nudgeInfo: { flex: 1, minWidth: 0, gap: 3 },
  nudgeMsg: { fontSize: 14, color: colors.foreground, lineHeight: 19 },
  nudgeMeta: { fontSize: 10, color: colors.mutedForeground },

  // Awards
  viewAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  viewAllText: { fontSize: 12, color: colors.primary },
  awardList: { gap: spacing.sm + 2 },
  awardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
  awardIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  awardInfo: { flex: 1, minWidth: 0, gap: 1 },
  awardTitle: { fontSize: 14, fontWeight: '600', color: colors.foreground },
  awardDesc: { fontSize: 11, color: colors.mutedForeground },
  awardTier: { fontSize: 10, fontWeight: '600', textTransform: 'capitalize' },
});
