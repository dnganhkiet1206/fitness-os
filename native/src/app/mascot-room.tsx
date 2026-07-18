import {
  Check,
  Coins,
  Dumbbell,
  Glasses,
  GraduationCap,
  Medal,
  RectangleHorizontal,
  RectangleVertical,
  Ribbon,
  Shield,
  Sprout,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

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
  useMascotInventory,
  useMascotWallet,
  useToggleEquip,
} from '@/hooks/use-mascot-room';
import { useTodayWater } from '@/hooks/use-water';
import { useDailyLog, useProfile, useTodaySleep } from '@/hooks/useTodayData';
import { CHALLENGE_TEXT } from '@/lib/gamification-i18n';
import { localDateStr } from '@/lib/local-date';
import {
  DAILY_QUESTS,
  SHOP_ITEMS,
  WEEKLY_BONUS_COINS,
  questRefKey,
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
  barbell: { icon: Dumbbell, color: colors.metricCyan },
  dumbbell_rack: { icon: Dumbbell, color: colors.metricOrange },
  plant: { icon: Sprout, color: colors.readinessGreen },
  mirror: { icon: RectangleVertical, color: colors.mutedForeground },
  neon_sign: { icon: Zap, color: colors.metricCyan },
};

export default function MascotRoomScreen() {
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const { mascot, message } = useMascot();

  const { data: wallet } = useMascotWallet();
  const { data: inventory } = useMascotInventory();
  const claim = useClaimReward();
  const buy = useBuyItem();
  const equip = useToggleEquip();

  const { data: dailyLog } = useDailyLog();
  const { data: profile } = useProfile();
  const { data: waterMl } = useTodayWater();
  const { data: sleep } = useTodaySleep();
  const { data: challenges } = useWeeklyChallenges();

  const [celebrate, setCelebrate] = useState(0);

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

  const reward = (refKey: string, amount: number, reason: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    claim.mutate(
      { refKey, amount, reason },
      {
        onSuccess: () => {
          setCelebrate((c) => c + 1);
          toast.success(i18n.nRoomEarned.replace('{n}', String(amount)));
        },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  };

  const buyItem = (item: ShopItem) => {
    if (balance < item.price) {
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

  const completedWeekly = (challenges ?? []).filter((c) => c.completed);

  return (
    <Screen
      back
      title={mascot.name}
      headerRight={
        <View style={styles.coinPill}>
          <Icon icon={Coins} size={14} color={colors.readinessYellow} />
          <Text style={styles.coinText}>{balance.toLocaleString()}</Text>
        </View>
      }>
      {/* The room */}
      <MascotScene
        mascot={mascot}
        ownedGym={owned}
        equippedOutfits={equippedOutfits}
        celebrateSignal={celebrate}
      />
      {message ? (
        <View style={styles.bubble}>
          <Text style={styles.bubbleText}>{message}</Text>
        </View>
      ) : null}

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
                  onPress={() => reward(refKey, q.coins, q.key)}>
                  <Text style={[styles.claimText, !isDone && styles.claimTextDisabled]}>
                    {i18n.nRoomClaim}
                  </Text>
                </Pressable>
              )}
            </View>
          );
        })}
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
                    onPress={() => reward(refKey, WEEKLY_BONUS_COINS, `weekly:${c.challenge_key}`)}>
                    <Text style={styles.claimText}>{i18n.nRoomClaim}</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </GlassCard>
      )}

      {/* Shop */}
      <Text style={styles.shopTitle}>{i18n.nRoomShop}</Text>
      <ShopSection
        title={i18n.nRoomOutfits}
        items={SHOP_ITEMS.filter((it) => it.type === 'outfit')}
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
      />
      <ShopSection
        title={i18n.nRoomGymGear}
        items={SHOP_ITEMS.filter((it) => it.type === 'gym')}
        owned={owned}
        equipped={equippedOutfits}
        balance={balance}
        pendingBuy={buy.isPending}
        onBuy={buyItem}
        onToggleEquip={() => {}}
        lang={lang}
        i18n={i18n}
      />
    </Screen>
  );
}

function ShopSection({
  title, items, owned, equipped, balance, pendingBuy, onBuy, onToggleEquip, lang, i18n,
}: {
  title: string;
  items: ShopItem[];
  owned: Set<string>;
  equipped: Set<string>;
  balance: number;
  pendingBuy: boolean;
  onBuy: (item: ShopItem) => void;
  onToggleEquip: (key: string, next: boolean) => void;
  lang: 'vi' | 'en';
  i18n: { nRoomBuy: string; nRoomWear: string; nRoomWearing: string; nRoomPlaced: string };
}) {
  return (
    <View style={styles.shopSection}>
      <Text style={styles.shopSectionTitle}>{title}</Text>
      <View style={styles.shopGrid}>
        {items.map((item) => {
          const meta = ITEM_ICONS[item.key];
          const isOwned = owned.has(item.key);
          const isEquipped = equipped.has(item.key);
          const affordable = balance >= item.price;
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
                      <Text style={[styles.buyText, !affordable && styles.buyTextPoor]}>{item.price}</Text>
                    </>
                  )}
                </Pressable>
              ) : item.type === 'outfit' ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.ownedBtn,
                    isEquipped && styles.wearingBtn,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => onToggleEquip(item.key, !isEquipped)}>
                  {isEquipped && <Icon icon={Check} size={11} color={colors.readinessGreen} strokeWidth={3} />}
                  <Text style={[styles.ownedText, isEquipped && styles.wearingText]}>
                    {isEquipped ? i18n.nRoomWearing : i18n.nRoomWear}
                  </Text>
                </Pressable>
              ) : (
                <View style={styles.ownedBtn}>
                  <Icon icon={Check} size={11} color={colors.readinessGreen} strokeWidth={3} />
                  <Text style={styles.ownedText}>{i18n.nRoomPlaced}</Text>
                </View>
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

  card: { gap: spacing.sm },
  cardTitle: { ...type.headline, color: colors.foreground },
  cardHint: { ...type.caption, color: colors.mutedForeground, marginTop: -4 },

  questRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 4 },
  questInfo: { flex: 1, minWidth: 0, gap: 3 },
  questName: { ...type.body, color: colors.foreground },
  questNameDone: { color: colors.mutedForeground },
  questCoins: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  questCoinText: { ...type.caption, fontWeight: '700', color: colors.readinessYellow, fontVariant: ['tabular-nums'] },
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

  shopTitle: { ...type.title, color: colors.foreground, marginTop: spacing.xs },
  shopSection: { gap: spacing.sm },
  shopSectionTitle: {
    ...type.caption,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    fontWeight: '600',
  },
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
