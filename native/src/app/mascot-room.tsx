import {
  Armchair,
  Cat,
  Check,
  Coins,
  Cylinder,
  Droplets,
  Dumbbell,
  Flame,
  Footprints,
  Glasses,
  GraduationCap,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  Lightbulb,
  Medal,
  Moon,
  RectangleHorizontal,
  RectangleVertical,
  Ribbon,
  Shield,
  Shirt,
  Sprout,
  Star,
  Store,
  Utensils,
  Weight,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { fireCelebration } from '@/components/ascnd/award-celebration';
import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { MascotScene } from '@/components/ascnd/mascot-scene';
import { Screen } from '@/components/ascnd/screen';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useWeeklyChallenges } from '@/hooks/use-extras';
import { useMascot } from '@/hooks/use-mascot';
import {
  useBuyItem,
  useClaimReward,
  useDailyStreak,
  useMascotInventory,
  useMascotWallet,
  useToggleEquip,
} from '@/hooks/use-mascot-room';
import { useTodayWater } from '@/hooks/use-water';
import { useDailyLog, useProfile, useTodaySleep } from '@/hooks/useTodayData';
import { TEST_UNLOCK_ALL } from '@/lib/dev-flags';
import { CHALLENGE_TEXT } from '@/lib/gamification-i18n';
import { localDateStr } from '@/lib/local-date';
import {
  DAILY_QUESTS,
  ENERGY_SIGNALS,
  LEVEL_XP,
  SHOP_ITEMS,
  STREAK_XP,
  WEEKLY_BONUS_COINS,
  WEEKLY_BONUS_XP,
  levelFromXp,
  nextRank,
  questRefKey,
  rankForLevel,
  streakCoins,
  type QuestKey,
  type ShopItem,
} from '@/lib/mascot-room';
import { toast } from '@/lib/toast';

const ITEM_ICONS: Record<string, { icon: LucideIcon; color: string }> = {
  headband: { icon: Ribbon, color: '#e6485c' },
  cap: { icon: GraduationCap, color: colors.metricBlue },
  sunglasses: { icon: Glasses, color: colors.foreground },
  medal: { icon: Medal, color: colors.readinessYellow },
  belt: { icon: Shield, color: colors.metricOrange },
  yoga_mat: { icon: RectangleHorizontal, color: colors.metricPurple },
  kettlebell: { icon: Weight, color: colors.metricOrange },
  barbell: { icon: Dumbbell, color: colors.metricCyan },
  dumbbell_rack: { icon: Dumbbell, color: colors.metricOrange },
  bench: { icon: Armchair, color: '#e6485c' },
  punching_bag: { icon: Cylinder, color: '#e6485c' },
  treadmill: { icon: Footprints, color: colors.metricCyan },
  plant: { icon: Sprout, color: colors.readinessGreen },
  mirror: { icon: RectangleVertical, color: colors.mutedForeground },
  neon_sign: { icon: Zap, color: colors.metricCyan },
  floor_wood: { icon: Layers, color: '#b0793f' },
  floor_neon: { icon: LayoutGrid, color: colors.metricCyan },
  wall_led: { icon: Lightbulb, color: colors.metricPurple },
  wall_frames: { icon: ImageIcon, color: colors.metricBlue },
};

// The five daily signals that power the buddy's energy meter
const SIGNAL_META: Record<QuestKey, { icon: LucideIcon; color: string; labelKey: 'nRoomSigMeal' | 'nRoomSigWorkout' | 'nRoomSigWater' | 'nRoomSigSleep' | 'nRoomSigSteps' }> = {
  meal: { icon: Utensils, color: colors.metricOrange, labelKey: 'nRoomSigMeal' },
  workout: { icon: Dumbbell, color: '#e6485c', labelKey: 'nRoomSigWorkout' },
  water: { icon: Droplets, color: colors.metricCyan, labelKey: 'nRoomSigWater' },
  sleep: { icon: Moon, color: colors.metricPurple, labelKey: 'nRoomSigSleep' },
  steps: { icon: Footprints, color: colors.readinessGreen, labelKey: 'nRoomSigSteps' },
};

// Rank → celebration tier (the confetti overlay speaks bronze/…/platinum)
const RANK_TIER: Record<string, string> = {
  rookie: 'bronze',
  athlete: 'bronze',
  warrior: 'silver',
  elite: 'gold',
  champion: 'platinum',
  legend: 'platinum',
};

/** Floating "+N coins" that rises off the scene on every claim */
function CoinBurst({ trigger, amount }: { trigger: number; amount: number }) {
  const y = useSharedValue(0);
  const op = useSharedValue(0);
  useEffect(() => {
    if (trigger === 0) return;
    y.value = 0;
    op.value = 0;
    op.value = withSequence(
      withTiming(1, { duration: 160 }),
      withDelay(420, withTiming(0, { duration: 520 })),
    );
    y.value = withTiming(-70, { duration: 1080, easing: Easing.out(Easing.quad) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);
  const style = useAnimatedStyle(() => ({
    opacity: op.value,
    transform: [{ translateY: y.value }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[styles.burstWrap, style]}>
      <View style={styles.burstPill}>
        <Icon icon={Coins} size={15} color={colors.readinessYellow} />
        <Text style={styles.burstText}>+{amount}</Text>
      </View>
    </Animated.View>
  );
}

export default function MascotRoomScreen() {
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const { mascot, message, mood } = useMascot();

  const { data: wallet } = useMascotWallet();
  const { data: inventory } = useMascotInventory();
  const { data: streak = 0 } = useDailyStreak();
  const claim = useClaimReward();
  const buy = useBuyItem();
  const equip = useToggleEquip();

  const { data: dailyLog } = useDailyLog();
  const { data: profile } = useProfile();
  const { data: waterMl } = useTodayWater();
  const { data: sleep } = useTodaySleep();
  const { data: challenges } = useWeeklyChallenges();

  const [celebrate, setCelebrate] = useState(0);
  const [flex, setFlex] = useState(0);
  const [burst, setBurst] = useState({ id: 0, amount: 0 });
  const [shopOpen, setShopOpen] = useState(false);
  const [shopTab, setShopTab] = useState<'outfit' | 'gym' | 'upgrade'>('gym');
  const welcomeTried = useRef(false);

  const balance = wallet?.balance ?? 0;
  const claimed = wallet?.claimed ?? new Set<string>();
  const owned = new Set((inventory ?? []).map((r) => r.item_key));
  const equippedOutfits = new Set(
    (inventory ?? []).filter((r) => r.equipped).map((r) => r.item_key),
  );

  const today = localDateStr();
  const questDone: Record<QuestKey, boolean> = {
    meal: (Number(dailyLog?.kcal) || 0) > 0,
    workout: (dailyLog?.workout_count ?? 0) > 0,
    water: (waterMl ?? 0) >= (Number(profile?.water_target_ml) || 2500),
    sleep: sleep != null || (Number(dailyLog?.sleep_duration_min) || 0) > 0,
    steps: (dailyLog?.steps ?? 0) >= 5000,
  };

  const reward = (refKey: string, amount: number, reason: string, xpGain: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const prevXp = wallet?.xp ?? 0;
    claim.mutate(
      { refKey, amount, reason },
      {
        onSuccess: () => {
          // Every claim floats its coins off the scene
          setBurst({ id: Date.now(), amount });
          const prevLevel = levelFromXp(prevXp);
          const newLevel = levelFromXp(prevXp + xpGain);
          if (newLevel > prevLevel) {
            // Level-up gets the double-bicep flex instead of the jump
            setFlex((f) => f + 1);
            const prevR = rankForLevel(prevLevel);
            const newR = rankForLevel(newLevel);
            if (newR.key !== prevR.key) {
              // Crossing a rank boundary is a full confetti moment
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              fireCelebration({
                title: newR.name[lang],
                description: i18n.nRoomRankUp.replace('{r}', newR.name[lang]),
                icon: 'trophy',
                tier: RANK_TIER[newR.key] ?? 'gold',
              });
            } else {
              toast.success(i18n.nRoomLevelUp.replace('{n}', String(newLevel)));
            }
          } else {
            setCelebrate((c) => c + 1);
          }
        },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  };

  const buyItem = (item: ShopItem) => {
    if (!TEST_UNLOCK_ALL && balance < item.price) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      toast.warning(i18n.nRoomNotEnough);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    buy.mutate(item, {
      onSuccess: () => {
        setCelebrate((c) => c + 1);
        toast.success(i18n.nRoomBought);
      },
      onError: (e: Error) => toast.error(e.message),
    });
  };

  // First visit: a welcome purse so the shop is playable right away
  // (idempotent via the 'welcome' ref_key — granted exactly once)
  useEffect(() => {
    if (!wallet || wallet.claimed.has('welcome') || welcomeTried.current) return;
    welcomeTried.current = true;
    claim.mutate(
      { refKey: 'welcome', amount: 300, reason: 'welcome bonus' },
      { onSuccess: () => toast.success(i18n.nRoomWelcome.replace('{n}', '300')) },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet]);

  const completedWeekly = (challenges ?? []).filter((c) => c.completed);

  // Buddy level from quest XP (purchases grant none, so it never drops)
  const xp = wallet?.xp ?? 0;
  const level = levelFromXp(xp);
  const intoLevel = xp % LEVEL_XP;
  const rank = rankForLevel(level);
  const upcomingRank = nextRank(level);

  // Live daily energy — how many of the five signals are met today (from
  // real logs, never claims), so the buddy visibly mirrors the day
  const energyCount = ENERGY_SIGNALS.filter((k) => questDone[k]).length;
  const energyHeadline =
    energyCount === 0
      ? i18n.nRoomEnergyEmpty
      : energyCount >= ENERGY_SIGNALS.length
        ? i18n.nRoomEnergyFull
        : energyCount >= 3
          ? i18n.nRoomEnergyMid
          : i18n.nRoomEnergyLow;

  const streakRefKey = `d:${today}:streak`;
  const streakBonus = streakCoins(streak);

  return (
    <Screen
      back
      title={mascot.name}
      headerRight={
        <Pressable
          // Hidden test faucet: long-press the coin pill for +500 coins
          delayLongPress={600}
          onLongPress={() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            claim.mutate(
              { refKey: `dev:${Date.now()}`, amount: 500, reason: 'dev grant' },
              { onSuccess: () => toast.success(i18n.nRoomEarned.replace('{n}', '500')) },
            );
          }}
          style={styles.coinPill}>
          <Icon icon={Coins} size={14} color={colors.readinessYellow} />
          <Text style={styles.coinText}>{balance.toLocaleString()}</Text>
        </Pressable>
      }>
      {/* The room */}
      <View style={styles.sceneWrap}>
        <MascotScene
          mascot={mascot}
          ownedGym={equippedOutfits}
          equippedOutfits={equippedOutfits}
          celebrateSignal={celebrate}
          flexSignal={flex}
          mood={mood}
          level={level}
          accent={rank.color}
          energy={energyCount / ENERGY_SIGNALS.length}
        />
        <CoinBurst trigger={burst.id} amount={burst.amount} />
      </View>
      {mood === 'tired' ? (
        <View style={styles.bubble}>
          <Text style={styles.bubbleText}>{i18n.nRoomMoodTired}</Text>
        </View>
      ) : message ? (
        <View style={styles.bubble}>
          <Text style={styles.bubbleText}>{message}</Text>
        </View>
      ) : null}

      {/* Today's energy — the buddy is only as charged as your real day */}
      <GlassCard style={styles.energyCard}>
        <View style={styles.energyHeadRow}>
          <View style={styles.energyTitleWrap}>
            <Icon icon={Flame} size={15} color={colors.metricOrange} />
            <Text style={styles.energyTitle}>{i18n.nRoomEnergy}</Text>
          </View>
          <Text style={styles.energyCount}>
            {energyCount}
            <Text style={styles.energyCountMax}>/{ENERGY_SIGNALS.length}</Text>
          </Text>
        </View>
        <View style={styles.energyPips}>
          {ENERGY_SIGNALS.map((k) => {
            const meta = SIGNAL_META[k];
            const on = questDone[k];
            return (
              <View
                key={k}
                style={[
                  styles.energyPip,
                  on && { backgroundColor: `${meta.color}1f`, borderColor: `${meta.color}66` },
                ]}>
                <Icon icon={meta.icon} size={17} color={on ? meta.color : colors.mutedForeground} />
                <Text style={[styles.energyPipLabel, on && { color: colors.foreground }]}>
                  {i18n[meta.labelKey]}
                </Text>
              </View>
            );
          })}
        </View>
        <Text style={styles.energyHint}>{energyHeadline}</Text>
      </GlassCard>

      {/* Quick actions — the shop lives behind one button now */}
      <View style={styles.chipRow}>
        <ActionChip
          icon={Store}
          label={i18n.nRoomShop}
          color={colors.metricCyan}
          onPress={() => {
            Haptics.selectionAsync();
            setShopTab('gym');
            setShopOpen(true);
          }}
        />
        <ActionChip
          icon={Shirt}
          label={i18n.nRoomWardrobe}
          color={colors.metricPurple}
          onPress={() => {
            Haptics.selectionAsync();
            setShopTab('outfit');
            setShopOpen(true);
          }}
        />
        <ActionChip
          icon={Cat}
          label={i18n.nRoomChangeBuddy}
          color={colors.metricOrange}
          onPress={() => {
            Haptics.selectionAsync();
            router.push('/settings');
          }}
        />
      </View>

      {/* Buddy level — lifetime coins earned, spending never lowers it.
          The rank badge/colour re-skins as the buddy climbs. */}
      <GlassCard style={styles.levelCard}>
        <View style={[styles.levelBadge, { backgroundColor: `${rank.color}22`, borderColor: `${rank.color}55` }]}>
          <Icon icon={Star} size={20} color={rank.color} />
          <Text style={[styles.levelBadgeNum, { color: rank.color }]}>{level}</Text>
        </View>
        <View style={styles.levelInfo}>
          <View style={styles.levelTopRow}>
            <View style={styles.levelTitleWrap}>
              <Text style={[styles.rankName, { color: rank.color }]}>{rank.name[lang]}</Text>
              <Text style={styles.levelTitle}>
                {i18n.nRoomLevel.replace('{n}', String(level))}
              </Text>
            </View>
            {streak >= 2 && (
              <View style={styles.streakChip}>
                <Icon icon={Flame} size={12} color={colors.metricOrange} />
                <Text style={styles.streakChipText}>
                  {i18n.nRoomStreak.replace('{n}', String(streak))}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.levelTrack}>
            <View
              style={[
                styles.levelFill,
                { width: `${Math.round((intoLevel / LEVEL_XP) * 100)}%`, backgroundColor: rank.color },
              ]}
            />
          </View>
          <Text style={styles.levelHint}>
            {upcomingRank
              ? i18n.nRoomNextRank
                  .replace('{r}', upcomingRank.name[lang])
                  .replace('{n}', String(upcomingRank.minLevel))
              : i18n.nRoomMaxRank}
          </Text>
        </View>
      </GlassCard>

      {/* Daily quests */}
      <GlassCard style={styles.card}>
        <Text style={styles.cardTitle}>{i18n.nRoomQuests}</Text>
        <Text style={styles.cardHint}>{i18n.nRoomQuestsHint}</Text>
        {DAILY_QUESTS.map((q) => {
          const refKey = questRefKey(today, q.key);
          const isClaimed = claimed.has(refKey);
          const isDone = questDone[q.key];
          return (
            <View key={q.key} style={styles.questRow}>
              <View style={styles.questInfo}>
                <Text style={[styles.questName, isClaimed && styles.questNameDone]}>
                  {q.name[lang]}
                </Text>
                <View style={styles.questCoins}>
                  <Icon icon={Coins} size={11} color={colors.readinessYellow} />
                  <Text style={styles.questCoinText}>+{q.coins}</Text>
                  <Text style={styles.questXpText}>+{q.xp} XP</Text>
                </View>
              </View>
              {isClaimed ? (
                <View style={styles.claimedChip}>
                  <Icon icon={Check} size={13} color={colors.readinessGreen} strokeWidth={3} />
                  <Text style={styles.claimedText}>{i18n.nRoomClaimed}</Text>
                </View>
              ) : (
                <Pressable
                  disabled={!isDone || claim.isPending}
                  style={({ pressed }) => [
                    styles.claimBtn,
                    !isDone && styles.claimBtnDisabled,
                    pressed && isDone && styles.pressed,
                  ]}
                  onPress={() => reward(refKey, q.coins, q.key, q.xp)}>
                  <Text style={[styles.claimText, !isDone && styles.claimTextDisabled]}>
                    {i18n.nRoomClaim}
                  </Text>
                </Pressable>
              )}
            </View>
          );
        })}
        {/* Streak bonus — appears from day 2, pays more the longer the run */}
        {streak >= 2 && (
          <View style={styles.questRow}>
            <View style={styles.questInfo}>
              <View style={styles.streakNameRow}>
                <Icon icon={Flame} size={14} color={colors.metricOrange} />
                <Text
                  style={[styles.questName, claimed.has(streakRefKey) && styles.questNameDone]}>
                  {i18n.nRoomStreak.replace('{n}', String(streak))}
                </Text>
              </View>
              <View style={styles.questCoins}>
                <Icon icon={Coins} size={11} color={colors.readinessYellow} />
                <Text style={styles.questCoinText}>+{streakBonus}</Text>
                <Text style={styles.questXpText}>+{STREAK_XP} XP</Text>
              </View>
            </View>
            {claimed.has(streakRefKey) ? (
              <View style={styles.claimedChip}>
                <Icon icon={Check} size={13} color={colors.readinessGreen} strokeWidth={3} />
                <Text style={styles.claimedText}>{i18n.nRoomClaimed}</Text>
              </View>
            ) : (
              <Pressable
                disabled={claim.isPending}
                style={({ pressed }) => [styles.claimBtn, pressed && styles.pressed]}
                onPress={() => reward(streakRefKey, streakBonus, `streak:${streak}`, STREAK_XP)}>
                <Text style={styles.claimText}>{i18n.nRoomClaim}</Text>
              </Pressable>
            )}
          </View>
        )}
      </GlassCard>

      {/* Weekly challenge bonuses */}
      {completedWeekly.length > 0 && (
        <GlassCard style={styles.card}>
          <Text style={styles.cardTitle}>{i18n.nRoomWeeklyBonus}</Text>
          {completedWeekly.map((c) => {
            const refKey = `w:${c.id}`;
            const isClaimed = claimed.has(refKey);
            const t = CHALLENGE_TEXT[c.challenge_key];
            return (
              <View key={c.id} style={styles.questRow}>
                <View style={styles.questInfo}>
                  <Text style={[styles.questName, isClaimed && styles.questNameDone]}>
                    {t ? t.title[lang] : c.title}
                  </Text>
                  <View style={styles.questCoins}>
                    <Icon icon={Coins} size={11} color={colors.readinessYellow} />
                    <Text style={styles.questCoinText}>+{WEEKLY_BONUS_COINS}</Text>
                    <Text style={styles.questXpText}>+{WEEKLY_BONUS_XP} XP</Text>
                  </View>
                </View>
                {isClaimed ? (
                  <View style={styles.claimedChip}>
                    <Icon icon={Check} size={13} color={colors.readinessGreen} strokeWidth={3} />
                    <Text style={styles.claimedText}>{i18n.nRoomClaimed}</Text>
                  </View>
                ) : (
                  <Pressable
                    disabled={claim.isPending}
                    style={({ pressed }) => [styles.claimBtn, pressed && styles.pressed]}
                    onPress={() =>
                      reward(refKey, WEEKLY_BONUS_COINS, `weekly:${c.challenge_key}`, WEEKLY_BONUS_XP)
                    }>
                    <Text style={styles.claimText}>{i18n.nRoomClaim}</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </GlassCard>
      )}

      {/* Shop — a folder: everything lives in one sheet */}
      <Modal
        visible={shopOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setShopOpen(false)}>
        <View style={styles.sheetBackdropWrap}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setShopOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{i18n.nRoomShop}</Text>
              <View style={styles.sheetCoins}>
                <Icon icon={Coins} size={13} color={colors.readinessYellow} />
                <Text style={styles.coinText}>{balance.toLocaleString()}</Text>
              </View>
              <Pressable hitSlop={10} onPress={() => setShopOpen(false)} style={styles.sheetClose}>
                <Icon icon={X} size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <View style={styles.tabRow}>
              {(
                [
                  ['gym', i18n.nRoomGymGear],
                  ['outfit', i18n.nRoomOutfits],
                  ['upgrade', i18n.nRoomUpgrades],
                ] as const
              ).map(([key, label]) => (
                <Pressable
                  key={key}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setShopTab(key);
                  }}
                  style={[styles.tab, shopTab === key && styles.tabActive]}>
                  <Text style={[styles.tabText, shopTab === key && styles.tabTextActive]}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <ScrollView contentContainerStyle={styles.sheetScroll} showsVerticalScrollIndicator={false}>
              <ShopGrid
                items={SHOP_ITEMS.filter((it) => it.type === shopTab)}
                owned={owned}
                equipped={equippedOutfits}
                balance={balance}
                pendingBuy={buy.isPending}
                onBuy={buyItem}
                onToggleEquip={(key, next) => {
                  Haptics.selectionAsync();
                  equip.mutate({ itemKey: key, equipped: next });
                }}
                lang={lang}
                i18n={i18n}
                placedLabel={shopTab === 'upgrade' ? i18n.nRoomInstalled : undefined}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function ActionChip({
  icon,
  label,
  color,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
      <View style={[styles.chipIcon, { backgroundColor: `${color}1c` }]}>
        <Icon icon={icon} size={17} color={color} />
      </View>
      <Text style={styles.chipText} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function ShopGrid({
  items, owned, equipped, balance, pendingBuy, onBuy, onToggleEquip, lang, i18n, placedLabel,
}: {
  items: ShopItem[];
  owned: Set<string>;
  equipped: Set<string>;
  balance: number;
  pendingBuy: boolean;
  onBuy: (item: ShopItem) => void;
  onToggleEquip: (key: string, next: boolean) => void;
  lang: 'vi' | 'en';
  i18n: { nRoomBuy: string; nRoomWear: string; nRoomWearing: string; nRoomPlaced: string; nRoomPlace: string };
  placedLabel?: string;
}) {
  return (
    <View style={styles.shopSection}>
      <View style={styles.shopGrid}>
        {items.map((item) => {
          const meta = ITEM_ICONS[item.key];
          const isOwned = owned.has(item.key);
          const isEquipped = equipped.has(item.key);
          const price = TEST_UNLOCK_ALL ? 0 : item.price;
          const affordable = TEST_UNLOCK_ALL || balance >= item.price;
          return (
            <GlassCard key={item.key} style={styles.shopItem}>
              <View style={[styles.itemIconWrap, { backgroundColor: `${meta.color}1c` }]}>
                <Icon icon={meta.icon} size={22} color={meta.color} />
              </View>
              <Text style={styles.itemName} numberOfLines={1}>{item.name[lang]}</Text>
              {!isOwned ? (
                <Pressable
                  disabled={pendingBuy}
                  style={({ pressed }) => [
                    styles.buyBtn,
                    !affordable && styles.buyBtnPoor,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => onBuy(item)}>
                  {pendingBuy ? (
                    <ActivityIndicator size="small" color={colors.primaryForeground} />
                  ) : (
                    <>
                      <Icon icon={Coins} size={11} color={affordable ? colors.primaryForeground : colors.mutedForeground} />
                      <Text style={[styles.buyText, !affordable && styles.buyTextPoor]}>{price}</Text>
                    </>
                  )}
                </Pressable>
              ) : (
                // Owned items toggle on/off — outfits are worn, gym gear
                // and upgrades are placed in the room (and can be removed).
                <Pressable
                  style={({ pressed }) => [
                    styles.ownedBtn,
                    isEquipped && styles.wearingBtn,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => onToggleEquip(item.key, !isEquipped)}>
                  {isEquipped && <Icon icon={Check} size={11} color={colors.readinessGreen} strokeWidth={3} />}
                  <Text style={[styles.ownedText, isEquipped && styles.wearingText]}>
                    {item.type === 'outfit'
                      ? isEquipped
                        ? i18n.nRoomWearing
                        : i18n.nRoomWear
                      : isEquipped
                        ? (placedLabel ?? i18n.nRoomPlaced)
                        : i18n.nRoomPlace}
                  </Text>
                </Pressable>
              )}
            </GlassCard>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  coinPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm + 2,
    height: 30,
    borderRadius: radius.full,
    backgroundColor: 'rgba(232,186,48,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(232,186,48,0.35)',
  },
  coinText: { ...type.footnote, fontWeight: '700', color: colors.readinessYellow, fontVariant: ['tabular-nums'] },

  bubble: {
    alignSelf: 'center',
    maxWidth: '88%',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginTop: -spacing.sm,
  },
  bubbleText: { ...type.footnote, color: colors.foreground, textAlign: 'center', lineHeight: 19 },

  sceneWrap: { position: 'relative' },
  burstWrap: {
    position: 'absolute',
    top: '30%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  burstPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: 'rgba(8,8,10,0.78)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(232,186,48,0.4)',
  },
  burstText: { ...type.headline, fontWeight: '800', color: colors.readinessYellow, fontVariant: ['tabular-nums'] },

  energyCard: { gap: spacing.sm },
  energyHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  energyTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  energyTitle: { ...type.headline, color: colors.foreground },
  energyCount: { ...type.title, fontWeight: '800', color: colors.metricOrange, fontVariant: ['tabular-nums'] },
  energyCountMax: { ...type.footnote, fontWeight: '700', color: colors.mutedForeground },
  energyPips: { flexDirection: 'row', gap: spacing.sm - 2 },
  energyPip: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  energyPipLabel: { ...type.caption, color: colors.mutedForeground, fontWeight: '600' },
  energyHint: { ...type.footnote, color: colors.mutedForeground, lineHeight: 18 },

  card: { gap: spacing.sm },
  cardTitle: { ...type.headline, color: colors.foreground },
  cardHint: { ...type.caption, color: colors.mutedForeground, marginTop: -4 },

  levelCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  levelBadge: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    borderWidth: 1,
  },
  levelBadgeNum: { fontSize: 11, fontWeight: '800', fontVariant: ['tabular-nums'], marginTop: -2 },
  levelInfo: { flex: 1, minWidth: 0, gap: 6 },
  levelTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  levelTitleWrap: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, flexShrink: 1, minWidth: 0 },
  rankName: { ...type.headline, fontWeight: '800' },
  levelTitle: { ...type.caption, color: colors.mutedForeground, fontWeight: '600' },
  levelTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.secondary,
    overflow: 'hidden',
  },
  levelFill: { height: '100%', borderRadius: 3 },
  levelHint: { ...type.caption, color: colors.mutedForeground },
  streakChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    height: 22,
    borderRadius: radius.full,
    backgroundColor: 'rgba(240,138,58,0.12)',
  },
  streakChipText: { ...type.caption, fontWeight: '700', color: colors.metricOrange },
  streakNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  questRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 4 },
  questInfo: { flex: 1, minWidth: 0, gap: 3 },
  questName: { ...type.body, color: colors.foreground },
  questNameDone: { color: colors.mutedForeground },
  questCoins: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  questCoinText: { ...type.caption, fontWeight: '700', color: colors.readinessYellow, fontVariant: ['tabular-nums'] },
  questXpText: {
    ...type.caption,
    fontWeight: '700',
    color: colors.metricPurple,
    fontVariant: ['tabular-nums'],
    marginLeft: 4,
  },
  claimBtn: {
    height: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  claimBtnDisabled: { backgroundColor: colors.secondary },
  claimText: { ...type.footnote, fontWeight: '700', color: colors.primaryForeground },
  claimTextDisabled: { color: colors.mutedForeground },
  claimedChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  claimedText: { ...type.footnote, color: colors.readinessGreen, fontWeight: '600' },

  chipRow: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 46,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
  },
  chipIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { ...type.caption, color: colors.foreground, fontWeight: '600', flexShrink: 1 },

  sheetBackdropWrap: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(4,4,6,0.6)',
  },
  sheet: {
    maxHeight: '78%',
    backgroundColor: '#101014',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  sheetTitle: { ...type.headline, color: colors.foreground, flex: 1 },
  sheetCoins: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sheetClose: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: colors.secondary,
    borderRadius: radius.full,
    padding: 3,
    marginBottom: spacing.md,
  },
  tab: {
    flex: 1,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: { backgroundColor: colors.card },
  tabText: { ...type.caption, color: colors.mutedForeground, fontWeight: '600' },
  tabTextActive: { color: colors.foreground },
  sheetScroll: { paddingBottom: spacing.lg },

  shopSection: { gap: spacing.sm },
  shopGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  shopItem: {
    width: '31%',
    flexGrow: 1,
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  itemIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemName: { ...type.caption, color: colors.foreground, fontWeight: '600' },
  buyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 28,
    minWidth: 64,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
  buyBtnPoor: { backgroundColor: colors.secondary },
  buyText: { ...type.caption, fontWeight: '700', color: colors.primaryForeground, fontVariant: ['tabular-nums'] },
  buyTextPoor: { color: colors.mutedForeground },
  ownedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 28,
    minWidth: 64,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
  },
  wearingBtn: { backgroundColor: 'rgba(32,182,132,0.14)' },
  ownedText: { ...type.caption, color: colors.mutedForeground, fontWeight: '600' },
  wearingText: { color: colors.readinessGreen },
  pressed: { opacity: 0.85, transform: [{ scale: 0.95 }] },
});
