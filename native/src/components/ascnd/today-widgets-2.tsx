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
import { HelpButton, HelpNudge, useHelpTopic } from '@/components/ascnd/help-button';
import { Icon } from '@/components/ascnd/icon';
import { ProgressBar } from '@/components/ascnd/progress-bar';
import { TrainingExplainer } from '@/components/ascnd/training-explainer';
import { colors, radius, spacing } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useWorkoutSessions } from '@/hooks/use-fitness-data';
import { useNudges, useRecentWorkouts, useTodayBiometrics, useWearables } from '@/hooks/useTodayData';
import { useRecentAwards } from '@/hooks/use-extras';
import { useUnits } from '@/hooks/use-units';
import { awardText } from '@/lib/gamification-i18n';
import { localDateStr } from '@/lib/local-date';
import {
  ACWR_MAX,
  ACWR_OPTIMAL,
  acwrPercent,
  acwrZone,
  daysSince,
  STALE_AFTER_DAYS,
  type AcwrZoneKey,
} from '@/lib/training-card';
import { displayWeight, weightLabel } from '@/lib/units';

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

/** The bar's zone colours, keyed by the one table in `lib/training-card.ts`. */
const ZONE_TINT: Record<AcwrZoneKey, string> = {
  detraining: colors.readinessRed,
  low: colors.readinessYellow,
  optimal: colors.readinessGreen,
  elevated: colors.readinessYellow,
  spike: colors.readinessRed,
};

const zoneLabel = (key: AcwrZoneKey, vi: boolean) =>
  ({
    detraining: vi ? 'Tập quá thưa' : 'Detraining',
    low: vi ? 'Hơi ít' : 'Low',
    optimal: vi ? 'Vừa sức' : 'Optimal',
    elevated: vi ? 'Tăng nhanh' : 'Elevated',
    spike: vi ? 'Nhảy vọt' : 'Spike',
  })[key];

/** "Hôm nay" / "Hôm qua" / "5 ngày trước" — the fact the card was missing. */
const whenLabel = (days: number, vi: boolean) => {
  if (days === 0) return vi ? 'Hôm nay' : 'Today';
  if (days === 1) return vi ? 'Hôm qua' : 'Yesterday';
  return vi ? `${days} ngày trước` : `${days} days ago`;
};

/**
 * Training — the last session, the last week, and whether the week is a jump.
 *
 * ── what was rewritten, and why ──
 *
 * **The card contradicted itself about the ratio.** It drew the acute-to-chronic
 * number three times under three rules: a marker coloured by `>1.3 ? yellow :
 * red`, a pill captioned from five bands, and a five-dot legend listing those
 * bands again as hand-typed strings. At 1.7 the dot was yellow while the pill
 * beside it said "Spike" and the legend under it called >1.6 red. All three now
 * read `acwrZone` — see `lib/training-card.ts` for why the five-band version is
 * the correct one rather than merely the more numerous.
 *
 * **The latest session had no date.** It comes from "the most recent session",
 * which has no time limit, so `Push Day · RPE 8 · 4,200 kg` looked identical
 * whether it happened this morning or five weeks ago — with the ratio decaying
 * underneath it for precisely that reason. The card was showing the cause and
 * the effect and joining them to nothing. It says when now, and says plainly
 * when the last session is outside the seven-day window the figures above it
 * are computed over.
 *
 * **The zones were stated three times and the seven-day total once, in grey.**
 * The legend is gone: the bar already carries the colours, the pill says the
 * verdict in words, and the full table lives in the help sheet behind the `?`.
 * What that space buys is the week itself — sessions and volume — which was a
 * single 12pt grey line at the bottom under a 30pt ratio, the derived
 * diagnostic shouting over the fact it is derived from.
 *
 * **The tick marks did not line up with the band they label.** `0.8–1.3` was
 * centred by `space-between` at 50% while the green band spans 40–65%, centred
 * at 52.5%. They are positioned from the same numbers the band is drawn from.
 */
export function TrainingCard({ acwr }: { acwr: number | null }) {
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const vi = lang === 'vi';
  const { weight: wUnit } = useUnits();
  const wl = weightLabel(wUnit);
  const { data: workouts } = useRecentWorkouts();
  /*
    The seven-day figures come from a seven-day query.

    The line under the bar says "Khối lượng 7 ngày" and was summing
    `useRecentWorkouts()`, which is *the last five sessions whatever their
    dates*. Train five times over three weeks and it printed three weeks of
    volume under a seven-day heading; train six times in one week and it
    silently dropped the sixth.

    `latest` still comes from `useRecentWorkouts`: this card's top row needs
    `pain_flags`, which the sessions query does not select, and "the most recent
    session" is genuinely not a windowed question — that is the whole reason it
    now has to say how long ago it was.
  */
  const { data: week } = useWorkoutSessions(7);
  const help = useHelpTopic('training');

  const latest = (workouts ?? [])[0];

  const a = acwr ?? 0;
  const zone = acwrZone(a);
  const zoneTint = ZONE_TINT[zone];

  const weekSessions = week ?? [];
  const weekVolume = weekSessions.reduce((s, w) => s + Number(w.volume_load || 0), 0);
  const hasPR = weekSessions.some((w) => w.pr_detected);

  const sets = Array.isArray(latest?.sets) ? latest.sets : [];
  const painFlags = (Array.isArray(latest?.pain_flags) ? (latest.pain_flags as PainFlag[]) : []).filter(
    (p) => (p.pain_0_10 ?? 0) > 0,
  );
  const age = latest ? daysSince(latest.date_time) : null;
  const stale = age != null && age >= STALE_AFTER_DAYS;

  const headAccessories = (
    <View style={styles.headAccessories}>
      {hasPR && (
        <View style={styles.prBadge}>
          <Icon icon={Trophy} size={13} />
          <Text style={styles.prText}>PR!</Text>
        </View>
      )}
      <HelpButton
        label={vi ? 'Giải thích thẻ tập luyện' : 'Explain the training card'}
        onPress={help.openHelp}
      />
    </View>
  );

  /*
    Nothing logged is a state, not an absence.

    This returned `null`, so a widget somebody had deliberately added to Today
    simply was not there — indistinguishable from having removed it, or from the
    app being broken.
  */
  if (!latest) {
    return (
      <GlassCard style={styles.stackCard}>
        <View style={styles.headRow}>
          <MicroTitle>{i18n.dcTrainingTitle}</MicroTitle>
          {headAccessories}
        </View>
        <Text style={styles.emptyLine}>
          {vi
            ? 'Chưa có buổi tập nào được ghi. Ghi một buổi để thấy khối lượng và đà tập.'
            : 'No workouts logged yet. Record one to see volume and training load.'}
        </Text>
        <TrainingExplainer visible={help.open} onClose={help.close} />
      </GlassCard>
    );
  }

  return (
    <GlassCard style={styles.stackCard}>
      <View style={styles.headRow}>
        <MicroTitle>{i18n.dcTrainingTitle}</MicroTitle>
        {headAccessories}
      </View>

      {/* Volume load and the ratio are the two numbers on this card nobody
          guesses — one looks like a claim to have lifted four tonnes, the other
          is a word that decides whether you train tomorrow. */}
      {help.nudge ? (
        <HelpNudge
          text={vi ? 'Chưa rõ 4.200 kg hay đà tập nghĩa là gì? Bấm vào đây.' : 'Not sure what volume load or training load mean? Tap here.'}
          onPress={help.openHelp}
          onDismiss={help.dismissNudge}
        />
      ) : null}

      {/* The last session — with, at last, when it was */}
      <View style={styles.latestRow}>
        <View style={styles.latestIcon}>
          <Icon icon={Dumbbell} size={20} />
        </View>
        <View style={styles.latestInfo}>
          <View style={styles.latestTop}>
            <Text style={styles.latestName} numberOfLines={1}>
              {latest.template_name || (vi ? 'Buổi tập' : 'Workout')}
            </Text>
            <Text style={[styles.latestWhen, stale && styles.latestWhenStale]}>
              {whenLabel(age ?? 0, vi)}
            </Text>
          </View>
          <Text style={styles.latestMeta}>
            {sets.length} {vi ? 'set' : 'sets'}
            {latest.session_rpe != null ? ` · RPE ${Number(latest.session_rpe)}` : ''}
            {` · ${Math.round(displayWeight(Number(latest.volume_load || 0), wUnit)).toLocaleString()} ${wl}`}
          </Text>
        </View>
      </View>

      {/* Two numbers about the window the ratio is actually computed over, so
          a falling ratio has its cause on the same card. */}
      <View style={styles.weekRow}>
        <View style={styles.weekCell}>
          <Text style={styles.weekLabel}>{vi ? '7 ngày · buổi tập' : '7 days · sessions'}</Text>
          <Text style={styles.weekValue}>{weekSessions.length}</Text>
        </View>
        <View style={styles.weekDivider} />
        <View style={styles.weekCell}>
          <Text style={styles.weekLabel}>{vi ? '7 ngày · khối lượng' : '7 days · volume'}</Text>
          <Text style={styles.weekValue}>
            {Math.round(displayWeight(weekVolume, wUnit)).toLocaleString()}
            <Text style={styles.weekUnit}> {wl}</Text>
          </Text>
        </View>
      </View>

      {stale ? (
        <Text style={styles.staleNote}>
          {vi
            ? `Buổi gần nhất đã ${age} ngày — các số 7 ngày ở trên bằng 0 vì thế, và đà tập đang giảm.`
            : `Last session was ${age} days ago — that is why the 7-day figures are zero and the load is falling.`}
        </Text>
      ) : null}

      {/* Training load */}
      {a > 0 && (
        <View style={styles.acwrBox}>
          <View style={styles.headRow}>
            <View style={styles.acwrTitleRow}>
              <Icon icon={Zap} size={14} />
              <Text style={styles.acwrTitle}>
                {vi ? 'Đà tập · 7 ngày so với 28 ngày' : 'Training load · 7d vs 28d'}
              </Text>
            </View>
          </View>
          <View style={styles.acwrValueRow}>
            <Text style={[styles.acwrValue, { color: zoneTint }]}>{a}</Text>
            <View style={[styles.acwrPill, { backgroundColor: `${zoneTint}1a` }]}>
              <Text style={[styles.acwrPillText, { color: zoneTint }]}>{zoneLabel(zone, vi)}</Text>
            </View>
          </View>
          <View style={styles.acwrTrack}>
            <View
              style={[
                styles.acwrOptimal,
                {
                  left: `${acwrPercent(ACWR_OPTIMAL.from)}%`,
                  right: `${100 - acwrPercent(ACWR_OPTIMAL.to)}%`,
                },
              ]}
            />
            <View
              style={[
                styles.acwrIndicator,
                { left: `${acwrPercent(a)}%`, backgroundColor: zoneTint, shadowColor: zoneTint },
              ]}
            />
          </View>
          {/*
            Positioned from the same numbers the band is drawn from. They were
            laid out with `space-between`, which centred "0.8–1.3" at 50% while
            the band it names spans 40–65% — a label pointing next to its own
            subject.
          */}
          <View style={styles.acwrTicks}>
            <Text style={[styles.acwrTick, styles.acwrTickStart]}>0</Text>
            <Text style={[styles.acwrTick, styles.acwrTickAt, { left: `${acwrPercent(ACWR_OPTIMAL.from)}%` }]}>
              {ACWR_OPTIMAL.from}
            </Text>
            <Text style={[styles.acwrTick, styles.acwrTickAt, { left: `${acwrPercent(ACWR_OPTIMAL.to)}%` }]}>
              {ACWR_OPTIMAL.to}
            </Text>
            <Text style={[styles.acwrTick, styles.acwrTickEnd]}>{ACWR_MAX.toFixed(1)}</Text>
          </View>
        </View>
      )}

      {painFlags.length > 0 && (
        <View style={styles.painRow}>
          <Icon icon={AlertTriangle} size={13} color={colors.readinessYellow} />
          <Text style={styles.painText}>
            {i18n.dcTrainingPain}: {painFlags.map((p) => `${p.bodyPart} (${p.pain_0_10}/10)`).join(', ')}
          </Text>
        </View>
      )}

      <TrainingExplainer visible={help.open} onClose={help.close} />
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
        <ProgressBar pct={pct} color={colors.primary} height={6} radius={3} trackColor="rgba(24,24,27,0.3)" style={styles.statusTrack} />
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
  gold: '#ffd93d',
  platinum: '#b45cff',
};

export function RecentAwardsCard() {
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const { data: awards } = useRecentAwards(3);

  if (!awards || awards.length === 0) return null;

  return (
    <GlassCard style={styles.stackCard}>
      <View style={styles.headRow}>
        <MicroTitle icon={Trophy}>{i18n.dcRecentAwards}</MicroTitle>
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
  pressedDim: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  headAccessories: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
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
    backgroundColor: 'rgba(255,217,61,0.15)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,217,61,0.2)',
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
  latestTop: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  latestName: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.foreground },
  /* The fact the card was missing entirely. Muted while it is recent, amber
     once it is outside the window the numbers above are computed over — the
     colour is the difference between "trained Tuesday" and "has not trained". */
  latestWhen: { fontSize: 11, color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  latestWhenStale: { color: colors.readinessYellow, fontWeight: '600' },
  latestMeta: { fontSize: 12, color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  emptyLine: { fontSize: 13, lineHeight: 19, color: colors.mutedForeground },
  /* The week, given the room the five-dot legend used to take. Two cells and a
     hairline, because a count and a total are one comparison, not two facts. */
  weekRow: { flexDirection: 'row', alignItems: 'center' },
  weekCell: { flex: 1, gap: 2 },
  weekDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginHorizontal: spacing.md,
    backgroundColor: colors.border,
  },
  weekLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.2, color: colors.mutedForeground },
  weekValue: {
    fontSize: 20,
    fontFamily: 'Menlo',
    fontWeight: '700',
    color: colors.foreground,
    fontVariant: ['tabular-nums'],
  },
  weekUnit: { fontSize: 11, fontWeight: '400', color: colors.mutedForeground },
  staleNote: { fontSize: 12, lineHeight: 17, color: colors.readinessYellow },
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
  acwrValueRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  /* 26, down from 30. It was the largest thing on the card — a derived
     diagnostic shouting over the sessions it is derived from. */
  acwrValue: { fontSize: 26, fontFamily: 'Menlo', fontWeight: '700', fontVariant: ['tabular-nums'] },
  acwrTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(24,24,27,0.4)', overflow: 'visible' },
  /* `left`/`right` come from `ACWR_OPTIMAL` at the call site. They were the
     literals 40% and 35%, which happened to be right for 0.8–1.3 on a 0–2
     scale and would have stayed 40/35 the day either edge moved. */
  acwrOptimal: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: 4,
    backgroundColor: 'rgba(43,245,168,0.12)',
  },
  acwrIndicator: {
    position: 'absolute',
    top: -1,
    width: 6,
    height: 10,
    borderRadius: 3,
    marginLeft: -3,
    backgroundColor: colors.foreground,
    // neon glow in the zone colour (set inline)
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 5,
    shadowOpacity: 0.9,
    elevation: 4,
  },
  /* Absolute, so each tick sits under the value it names. Fixed height because
     absolutely-positioned children give the row no layout of its own. */
  acwrTicks: { height: 12 },
  acwrTick: { position: 'absolute', fontSize: 9, color: colors.mutedForeground, fontFamily: 'Menlo' },
  acwrTickStart: { left: 0 },
  acwrTickEnd: { right: 0 },
  /* -6 pulls the glyph back about half its width, so the label is centred on
     its mark rather than starting at it. */
  acwrTickAt: { marginLeft: -6 },
  painRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(255,217,61,0.1)',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm + 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,217,61,0.2)',
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
    backgroundColor: 'rgba(43,245,168,0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(43,245,168,0.2)',
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
