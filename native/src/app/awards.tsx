import * as Haptics from 'expo-haptics';
import {
  Beef,
  Calendar,
  Dumbbell,
  Flame,
  Footprints,
  Medal,
  Moon,
  Share2,
  Sparkles,
  Target,
  Trophy,
  type LucideIcon,
} from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';

import { Icon } from '@/components/ascnd/icon';
import { Screen } from '@/components/ascnd/screen';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { AWARD_DEFINITIONS, useAwards, useCheckAwards } from '@/hooks/use-extras';
import { awardText } from '@/lib/gamification-i18n';
import type { AppLang } from '@/lib/i18n';

const ICON_MAP: Record<string, LucideIcon> = {
  flame: Flame,
  dumbbell: Dumbbell,
  trophy: Trophy,
  calendar: Calendar,
  target: Target,
  moon: Moon,
  footprints: Footprints,
  beef: Beef,
};

const TIER_CONFIG: Record<string, { color: string; dim: string; label: string }> = {
  bronze: { color: '#c47b3d', dim: 'rgba(196,123,61,0.12)', label: 'Bronze' },
  silver: { color: '#c7cad1', dim: 'rgba(199,202,209,0.12)', label: 'Silver' },
  gold: { color: '#e8ba30', dim: 'rgba(232,186,48,0.12)', label: 'Gold' },
  platinum: { color: '#8d52e0', dim: 'rgba(141,82,224,0.12)', label: 'Platinum' },
};

const TIERS = ['platinum', 'gold', 'silver', 'bronze'] as const;

type AwardDef = (typeof AWARD_DEFINITIONS)[number];
interface EarnedAward {
  id: string;
  award_key: string | null;
  earned_at: string;
}

function MedalCard({
  award,
  earned,
  locale,
  lang,
  index,
}: {
  award: AwardDef;
  earned: EarnedAward | undefined;
  locale: string;
  lang: AppLang;
  index: number;
}) {
  const tier = TIER_CONFIG[award.tier] ?? TIER_CONFIG.bronze;
  const AwardIcon = ICON_MAP[award.icon] ?? Trophy;
  const isEarned = !!earned;
  const { title, desc } = awardText(award.key, lang);
  const R = 30;
  const C = 2 * Math.PI * R;

  const share = async () => {
    Haptics.selectionAsync();
    try {
      await Share.share({
        message: `🏅 ${title} — ${desc}! #ASCND`,
      });
    } catch {
      // user cancelled
    }
  };

  return (
    <Animated.View
      style={[styles.medalCard, !isEarned && styles.medalLocked]}
      entering={FadeInDown.springify().damping(26).stiffness(180).delay(Math.min(index, 12) * 45)}>
      <View style={styles.medalRing}>
        <Svg width={72} height={72} viewBox="0 0 72 72">
          <Circle cx={36} cy={36} r={R} fill="none" stroke="#17171c" strokeWidth={3} />
          {isEarned && (
            <Circle
              cx={36}
              cy={36}
              r={R}
              fill="none"
              stroke={tier.color}
              strokeWidth={3}
              strokeLinecap="round"
              strokeDasharray={`${C}`}
              strokeDashoffset={0}
              transform="rotate(-90 36 36)"
            />
          )}
        </Svg>
        <View style={styles.medalIcon}>
          <Icon
            icon={AwardIcon}
            size={26}
            color={isEarned ? tier.color : 'rgba(140,140,150,0.4)'}
          />
        </View>
      </View>

      <View style={[styles.tierBadge, { backgroundColor: isEarned ? tier.dim : 'rgba(24,24,27,0.4)' }]}>
        <Text style={[styles.tierBadgeText, { color: isEarned ? tier.color : 'rgba(140,140,150,0.4)' }]}>
          {tier.label}
        </Text>
      </View>

      <Text style={[styles.medalTitle, !isEarned && styles.medalTitleLocked]} numberOfLines={1}>
        {title}
      </Text>
      <Text style={styles.medalDesc} numberOfLines={2}>
        {desc}
      </Text>

      {earned && (
        <View style={styles.earnedRow}>
          <Text style={styles.earnedDate}>
            {new Date(earned.earned_at).toLocaleDateString(locale, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </Text>
          <Pressable hitSlop={8} style={({ pressed }) => pressed && styles.pressed} onPress={share}>
            <Icon icon={Share2} size={14} color={colors.mutedForeground} />
          </Pressable>
        </View>
      )}
    </Animated.View>
  );
}

export default function AwardsScreen() {
  const { data: awards } = useAwards();
  const { checkAndGrant, ready } = useCheckAwards();
  const checkedRef = useRef(false);
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const locale = lang === 'vi' ? 'vi-VN' : 'en-US';

  // Web Awards runs the grant check on open too
  useEffect(() => {
    if (ready && !checkedRef.current) {
      checkedRef.current = true;
      checkAndGrant();
    }
  }, [ready, checkAndGrant]);

  const earnedMap = new Map((awards ?? []).map((a) => [a.award_key, a]));
  const earnedCount = earnedMap.size;
  const totalCount = AWARD_DEFINITIONS.length;
  const pct = totalCount > 0 ? Math.round((earnedCount / totalCount) * 100) : 0;
  const R = 32;
  const C = 2 * Math.PI * R;

  return (
    <Screen back title={i18n.awardsTitle} stagger>
      {/* Hero: medal tile + progress ring (web) */}
      <View style={styles.hero}>
        <View style={styles.heroTile}>
          <Icon icon={Medal} size={30} color="#e8ba30" />
        </View>
        <Text style={styles.heroCount}>
          {i18n.awardsEarned} <Text style={styles.heroCountNum}>{earnedCount}</Text> / {totalCount}{' '}
          {i18n.awardsOf}
        </Text>
        <View style={styles.progressWrap}>
          <Svg width={80} height={80} viewBox="0 0 80 80">
            <Defs>
              <SvgGradient id="awards-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor="#e8ba30" />
                <Stop offset="100%" stopColor="#f17b27" />
              </SvgGradient>
            </Defs>
            <Circle cx={40} cy={40} r={R} fill="none" stroke="#17171c" strokeWidth={4} />
            <Circle
              cx={40}
              cy={40}
              r={R}
              fill="none"
              stroke="url(#awards-grad)"
              strokeWidth={4}
              strokeLinecap="round"
              strokeDasharray={`${C}`}
              strokeDashoffset={C * (1 - pct / 100)}
              transform="rotate(-90 40 40)"
            />
          </Svg>
          <View style={styles.progressCenter}>
            <Text style={styles.progressPct}>{pct}%</Text>
          </View>
        </View>
      </View>

      {/* Tier sections (web: platinum → bronze) */}
      {TIERS.map((tierKey) => {
        const tierAwards = AWARD_DEFINITIONS.filter((a) => a.tier === tierKey);
        if (tierAwards.length === 0) return null;
        const tc = TIER_CONFIG[tierKey];
        const tierEarned = tierAwards.filter((a) => earnedMap.has(a.key)).length;
        return (
          <View key={tierKey} style={styles.tierSection}>
            <View style={styles.tierHeader}>
              <Icon icon={Sparkles} size={14} color={tc.color} />
              <Text style={[styles.tierTitle, { color: tc.color }]}>{tc.label}</Text>
              <View style={styles.tierLine} />
              <Text style={styles.tierCount}>
                {tierEarned}/{tierAwards.length}
              </Text>
            </View>
            <View style={styles.grid}>
              {tierAwards.map((award, i) => (
                <MedalCard
                  key={award.key}
                  award={award}
                  earned={earnedMap.get(award.key)}
                  locale={locale}
                  lang={lang}
                  index={i}
                />
              ))}
            </View>
          </View>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: spacing.sm },
  heroTile: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(232,186,48,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(232,186,48,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#e8ba30',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  heroCount: { ...type.footnote, color: colors.mutedForeground },
  heroCountNum: { ...type.mono, fontWeight: '700', color: colors.foreground },
  progressWrap: { width: 80, height: 80 },
  progressCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressPct: { ...type.mono, fontSize: 17, fontWeight: '700', color: '#e8ba30' },

  tierSection: { gap: spacing.sm + 4 },
  tierHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tierTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  tierLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(43,43,49,0.4)' },
  tierCount: { ...type.mono, fontSize: 10, color: colors.mutedForeground },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm + 4 },
  medalCard: {
    width: '47.5%',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(43,43,49,0.5)',
    backgroundColor: 'rgba(14,14,17,0.6)',
  },
  medalLocked: { opacity: 0.4 },
  medalRing: { width: 72, height: 72 },
  medalIcon: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierBadge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.full },
  tierBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.6,
  },
  medalTitle: { fontSize: 13, fontWeight: '700', color: colors.foreground, textAlign: 'center' },
  medalTitleLocked: { color: 'rgba(140,140,150,0.5)' },
  medalDesc: { fontSize: 10, color: colors.mutedForeground, textAlign: 'center', lineHeight: 14 },
  earnedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  earnedDate: { ...type.mono, fontSize: 9, color: colors.mutedForeground },
  pressed: { opacity: 0.6, transform: [{ scale: 0.9 }] },
});
