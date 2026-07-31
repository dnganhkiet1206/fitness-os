import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Backpack, Check, Coins, Crown, Droplets, Dumbbell, Flame, Footprints, Ghost, Gift, Glasses, Headphones, LayoutGrid, Moon, Shirt, Snowflake, Sparkles, Star, Store, Trophy, Wind, type LucideIcon } from 'lucide-react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';
import {
  collectionProgress,
  SHOP_CATEGORIES,
  type Collection,
  type ShopCategory,
  type ShopItem,
} from '@/lib/mascot-room';

/**
 * The shop's own pieces: the category rail, a collection row, and the icon
 * every item is drawn with.
 *
 * The item grid used to live here too. It is gone: the shop shows one item at a
 * time now, worn, with a chevron on each side — see `shop-pager.tsx`.
 *
 * Moved out of `mascot-room.tsx` when the shop became a route of its own. They
 * were never the room's — the room only ever opened a sheet over itself — and a
 * screen cannot import another screen's internals without expo-router treating
 * the import as a route.
 *
 * They take everything as props and hold no state. Both the shop page and
 * anything else that wants to show a wardrobe can then use them without
 * inheriting a screen's data wiring.
 */

/** The icon on each shop-category tab (plus "Tất cả"). */
const CAT_ICON: Record<ShopCategory | 'all', LucideIcon> = {
  all: LayoutGrid,
  head: Crown,
  face: Glasses,
  body: Shirt,
  gear: Backpack,
  special: Sparkles,
};

/** Fallback icon by Koa slot, for any outfit without its own below. */
const SLOT_ICON: Record<string, LucideIcon> = {
  head: Crown,
  face: Glasses,
  top: Shirt,
  bottom: Shirt,
  shoes: Footprints,
  back: Backpack,
  hand: Dumbbell,
};

/** Per-item icon where a distinctive one reads better than the slot default. */
const ITEM_ICON: Record<string, LucideIcon> = {
  head_phones: Headphones,
  head_santa: Gift,
  head_witch: Ghost,
  top_xmas: Snowflake,
  top_ghost: Ghost,
  hand_trophy: Trophy,
  hand_bottle: Droplets,
  hand_dumbbell: Dumbbell,
  back_cape: Wind,
  back_dragonwing: Flame,
  shoes_glow: Sparkles,
  shoes_wing: Wind,
  stage_night: Moon,
  stage_sunset: Flame,
  stage_champion: Star,
};


export const iconFor = (item: ShopItem): LucideIcon =>
  ITEM_ICON[item.key] ?? (item.slot ? SLOT_ICON[item.slot] : Store) ?? Store;

export function CategoryRow({
  current,
  onPick,
  lang,
  i18n,
}: {
  current: ShopCategory | 'all';
  onPick: (c: ShopCategory | 'all') => void;
  lang: 'vi' | 'en';
  i18n: ReturnType<typeof useI18n>;
}) {
  const cats: { id: ShopCategory | 'all'; label: string }[] = [
    { id: 'all', label: i18n.nRoomAll },
    ...SHOP_CATEGORIES.map((c) => ({ id: c.id, label: c.name[lang] })),
  ];
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.catRow}>
      {cats.map((c) => {
        const on = current === c.id;
        return (
          <Pressable key={c.id} onPress={() => onPick(c.id)} style={styles.catItem}>
            <View style={[styles.catIcon, on && styles.catIconOn]}>
              <Icon
                icon={CAT_ICON[c.id]}
                size={20}
                color={on ? colors.primary : colors.mutedForeground}
              />
            </View>
            <Text style={[styles.catLabel, on && styles.catLabelOn]} numberOfLines={1}>
              {c.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** One collection: name, reward, a progress bar, and a claim when it's full. */
export function CollectionRow({
  c, owned, claimed, pending, onClaim, lang, i18n,
}: {
  c: Collection;
  owned: Set<string>;
  claimed: boolean;
  pending: boolean;
  onClaim: () => void;
  lang: 'vi' | 'en';
  i18n: ReturnType<typeof useI18n>;
}) {
  const { have, total, complete } = collectionProgress(c, owned);
  return (
    <GlassCard style={styles.setCard}>
      <View style={styles.setTop}>
        <View style={styles.setInfo}>
          <Text style={styles.setName}>{c.name[lang]}</Text>
          <View style={styles.questCoins}>
            <Icon icon={Coins} size={11} color={colors.readinessYellow} />
            <Text style={styles.questCoinText}>+{c.rewardCoins}</Text>
            <Text style={styles.questXpText}>+{c.rewardXp} XP</Text>
          </View>
        </View>
        {claimed ? (
          <View style={styles.claimedChip}>
            <Icon icon={Check} size={13} color={colors.readinessGreen} strokeWidth={3} />
            <Text style={styles.claimedText}>{i18n.nRoomSetClaimed}</Text>
          </View>
        ) : complete ? (
          <Pressable
            disabled={pending}
            style={({ pressed }) => [styles.claimBtn, pressed && styles.pressed]}
            onPress={onClaim}>
            <Text style={styles.claimText}>{i18n.nRoomClaim}</Text>
          </Pressable>
        ) : (
          <Text style={styles.setProgressText}>
            {i18n.nRoomSetProgress.replace('{a}', String(have)).replace('{b}', String(total))}
          </Text>
        )}
      </View>
      <View style={styles.setTrack}>
        <View
          style={[
            styles.setFill,
            {
              width: `${Math.round((have / total) * 100)}%`,
              backgroundColor: complete ? colors.readinessGreen : colors.metricPurple,
            },
          ]}
        />
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
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
  catIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  catIconOn: { backgroundColor: 'rgba(124,106,255,0.16)', borderColor: colors.primary },
  catItem: { alignItems: 'center', gap: 5, width: 56 },
  catLabel: { ...type.caption, color: colors.mutedForeground, fontWeight: '600' },
  catLabelOn: { color: colors.foreground },
  catRow: { gap: spacing.md, paddingBottom: spacing.md, paddingHorizontal: 2 },
  claimBtn: {
    height: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  claimText: { ...type.footnote, fontWeight: '700', color: colors.primaryForeground },
  claimedChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  claimedText: { ...type.footnote, color: colors.readinessGreen, fontWeight: '600' },
  itemIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemName: { ...type.caption, color: colors.foreground, fontWeight: '600', textAlign: 'center' },
  lockBtn: {
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
  lockText: { ...type.caption, fontWeight: '700', color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
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
  ownedText: { ...type.caption, color: colors.mutedForeground, fontWeight: '600' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.95 }] },
  questCoinText: { ...type.caption, fontWeight: '700', color: colors.readinessYellow, fontVariant: ['tabular-nums'] },
  questCoins: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  questXpText: {
    ...type.caption,
    fontWeight: '700',
    color: colors.metricPurple,
    fontVariant: ['tabular-nums'],
    marginLeft: 4,
  },
  rarityBadge: { paddingHorizontal: 8, height: 17, borderRadius: radius.full, justifyContent: 'center' },
  rarityText: { fontSize: 10, fontWeight: '700' },
  setCard: { gap: spacing.sm },
  setFill: { height: '100%', borderRadius: 3 },
  setInfo: { flex: 1, minWidth: 0, gap: 3 },
  setName: { ...type.body, fontWeight: '700', color: colors.foreground },
  setProgressText: { ...type.footnote, color: colors.mutedForeground, fontWeight: '600', fontVariant: ['tabular-nums'] },
  setTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  setTrack: { height: 6, borderRadius: 3, backgroundColor: colors.secondary, overflow: 'hidden' },
  shopGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  shopItem: {
    width: '31%',
    flexGrow: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
  },
  wearingBtn: { backgroundColor: 'rgba(32,182,132,0.14)' },
  wearingText: { color: colors.readinessGreen },
});
