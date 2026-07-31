import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { Coins, Sparkles, X } from 'lucide-react-native';
import { useState } from 'react';
import { Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ascnd/icon';
import { Screen } from '@/components/ascnd/screen';
import { BAND_ASPECT } from '@/components/ascnd/shop/shop-camera';
import { ShopScene } from '@/components/ascnd/shop/shop-scene';
import { CategoryRow, CollectionRow, ShopGrid } from '@/components/ascnd/shop/shop-grid';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useMascot } from '@/hooks/use-mascot';
import {
  useBuyItem,
  useClaimReward,
  useMascotInventory,
  useMascotWallet,
  useToggleEquip,
} from '@/hooks/use-mascot-room';
import { TEST_UNLOCK_ALL } from '@/lib/dev-flags';
import {
  collectionProgress,
  collectionRefKey,
  COLLECTIONS,
  levelFromXp,
  RARITY,
  SHOP_ITEMS,
  type ShopCategory,
  type ShopItem,
} from '@/lib/mascot-room';
import { toast } from '@/lib/toast';

/**
 * The shop, as a page.
 *
 * It was a bottom sheet over the Mascot Room, and a sheet is the wrong shape
 * for it: the room kept rendering underneath, the scene had to fit in 78% of
 * the screen, and the three tabs had nowhere to be but a pill row squeezed
 * above a grid. A page gets the whole viewport, and the camera gets somewhere
 * to move.
 *
 * ── it owns its own data ──
 *
 * Every hook here is React Query, so calling them again on this route costs
 * nothing and cannot disagree with the room: both read the same cache. The
 * alternative — threading a dozen values and four mutations through navigation
 * params — would have been a second copy of the truth.
 *
 * ── one room, three shots ──
 *
 * The tabs are not three screens. `ShopScene` holds one fitting room — podium,
 * curtain, wardrobe and mirror —
 * and the tab moves a camera through it: Sân khấu onto the podium, Trang phục
 * down to Koa standing on it, Tủ đồ across to the wardrobe. See
 * `shop/shop-room.tsx` for the room and `shop/shop-camera.ts` for the shots.
 */

type Tab = 'stage' | 'outfit' | 'closet';

/** which way the camera looks for each tab */
const SHOT = { stage: 'stage', outfit: 'shop', closet: 'wardrobe' } as const;

/**
 * Which tab a caller asked for, if it asked for a real one.
 *
 * The room has two doors into this page — "Cửa hàng" and "Tủ đồ" — and they
 * should land where they say. A query string is whatever the URL holds, so it
 * is checked against the tabs rather than cast to one; an unknown value opens
 * the shop instead of rendering a page with no grid on it.
 */
const asTab = (v: unknown): Tab =>
  v === 'stage' || v === 'closet' || v === 'outfit' ? v : 'outfit';

export default function ShopScreen() {
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const { mascot } = useMascot();

  const { data: wallet } = useMascotWallet();
  const { data: inventory } = useMascotInventory();
  const buy = useBuyItem();
  const equip = useToggleEquip();
  const claim = useClaimReward();

  const { tab: wanted } = useLocalSearchParams<{ tab?: string }>();
  // the initial tab only — re-reading the param would fight the user's taps
  const [tab, setTab] = useState<Tab>(() => asTab(wanted));
  const [cat, setCat] = useState<ShopCategory | 'all'>('all');
  const [collectionsOpen, setCollectionsOpen] = useState(false);
  // Which item's purchase is in flight, so the spinner lands on that card alone
  const [buyingKey, setBuyingKey] = useState<string | null>(null);

  const owned = new Set((inventory ?? []).map((r) => r.item_key));
  const equipped = new Set((inventory ?? []).filter((r) => r.equipped).map((r) => r.item_key));
  const claimed = wallet?.claimed ?? new Set<string>();
  const balance = wallet?.balance ?? 0;
  const level = levelFromXp(wallet?.xp ?? 0);

  const inCategory = (it: ShopItem) =>
    cat === 'all' || (cat === 'special' ? !!it.special : it.category === cat);

  /**
   * The closet is the shop's own grid, filtered to what has been bought.
   *
   * Deliberately the same list, the same categories and the same cards — a
   * wardrobe that presents owned things differently from the way they were sold
   * makes you learn the catalogue twice.
   */
  const items = SHOP_ITEMS.filter((it) =>
    tab === 'closet'
      ? it.type === 'outfit' && owned.has(it.key) && inCategory(it)
      : it.type === tab && (tab !== 'outfit' || inCategory(it)),
  ).sort((a, b) => RARITY[a.rarity].order - RARITY[b.rarity].order || a.price - b.price);

  const setsReady = COLLECTIONS.filter(
    (c) => collectionProgress(c, owned).complete && !claimed.has(collectionRefKey(c.id)),
  ).length;

  const buyItem = (item: ShopItem) => {
    // Level-locked items cannot be bought until the buddy gets there (the card
    // shows the lock, but guard here too). TEST_UNLOCK_ALL ignores the gate.
    if (!TEST_UNLOCK_ALL && item.unlockLevel && level < item.unlockLevel) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      toast.warning(i18n.nRoomLockLevel.replace('{n}', String(item.unlockLevel)));
      return;
    }
    if (!TEST_UNLOCK_ALL && balance < item.price) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      toast.warning(i18n.nRoomNotEnough);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBuyingKey(item.key);
    buy.mutate(item, {
      onSuccess: () => toast.success(i18n.nRoomBought),
      onError: (e: Error) => toast.error(e.message),
      onSettled: () => setBuyingKey(null),
    });
  };

  /**
   * Claiming a set pays out here and celebrates back in the room.
   *
   * The confetti, the coin burst and the level-up flex all belong to the buddy
   * on its own stage, and the buddy is not on this page. Rather than a second
   * celebration rig, this only pays and reports; walk back into the room and
   * the balance has changed.
   */
  const claimSet = (id: string, amount: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    claim.mutate(
      { refKey: collectionRefKey(id), amount, reason: `set:${id}` },
      {
        onSuccess: () => toast.success(i18n.nRoomBought),
        onError: (e: Error) => toast.error(e.message),
      },
    );
  };

  // The scene's width, from the window rather than a layout pass: it is the
  // first thing on the page and a band that resizes on the second frame reads
  // as a jump.
  const sceneW = Dimensions.get('window').width - spacing.md * 2;

  return (
    <Screen title={i18n.nRoomShop} back headerRight={<Coin balance={balance} />}>
      <View style={styles.stage}>
        <ShopScene
          shot={SHOT[tab]}
          mascot={mascot}
          width={sceneW}
          height={Math.round(sceneW * BAND_ASPECT)}
          level={level}
          equipped={equipped}
        />
      </View>

      <View style={styles.tabRow}>
        {(
          [
            ['stage', i18n.nRoomStageSkins],
            ['outfit', i18n.nRoomOutfits],
            ['closet', i18n.nRoomCloset],
          ] as const
        ).map(([key, label]) => (
          <Pressable
            key={key}
            onPress={() => {
              Haptics.selectionAsync();
              setTab(key);
            }}
            style={[styles.tab, tab === key && styles.tabActive]}>
            <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {tab !== 'stage' ? (
        <CategoryRow
          current={cat}
          onPick={(c) => {
            Haptics.selectionAsync();
            setCat(c);
          }}
          lang={lang}
          i18n={i18n}
        />
      ) : null}

      <ShopGrid
        items={items}
        owned={owned}
        equipped={equipped}
        balance={balance}
        level={level}
        pendingBuy={buy.isPending}
        buyingKey={buyingKey}
        onBuy={buyItem}
        onToggleEquip={(key, next) => {
          Haptics.selectionAsync();
          equip.mutate({ itemKey: key, equipped: next });
        }}
        lang={lang}
        i18n={i18n}
      />
      {items.length === 0 ? <Text style={styles.emptyCat}>{i18n.nRoomEmptyCat}</Text> : null}

      {tab === 'outfit' ? (
        <Pressable
          style={({ pressed }) => [styles.setsBanner, pressed && styles.pressed]}
          onPress={() => {
            Haptics.selectionAsync();
            setCollectionsOpen(true);
          }}>
          <View style={styles.setsChest}>
            <Icon icon={Sparkles} size={22} color={colors.metricPurple} />
          </View>
          <View style={styles.setsBannerText}>
            <Text style={styles.setsTitle}>{i18n.nRoomCollections}</Text>
            <Text style={styles.setsHint} numberOfLines={1}>
              {i18n.nRoomCollectionsHint}
            </Text>
          </View>
          {setsReady > 0 ? (
            <View style={styles.setsBadge}>
              <Text style={styles.setsBadgeText}>{setsReady}</Text>
            </View>
          ) : (
            <Text style={styles.setsChevron}>›</Text>
          )}
        </Pressable>
      ) : null}

      {/* Collections stays a sheet. It is a detail *of* the shop rather than a
          place of its own, and pushing a route for it would put the camera
          through a move to show a list of tick-boxes. */}
      <Modal
        visible={collectionsOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setCollectionsOpen(false)}>
        <View style={styles.sheetBackdropWrap}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setCollectionsOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{i18n.nRoomCollections}</Text>
              <Pressable
                hitSlop={10}
                onPress={() => setCollectionsOpen(false)}
                style={styles.sheetClose}>
                <Icon icon={X} size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.sheetScroll} showsVerticalScrollIndicator={false}>
              {COLLECTIONS.map((c) => (
                <CollectionRow
                  key={c.id}
                  c={c}
                  owned={owned}
                  claimed={claimed.has(collectionRefKey(c.id))}
                  pending={claim.isPending}
                  onClaim={() => claimSet(c.id, c.rewardCoins)}
                  lang={lang}
                  i18n={i18n}
                />
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function Coin({ balance }: { balance: number }) {
  return (
    <View style={styles.coinPill}>
      <Icon icon={Coins} size={13} color={colors.readinessYellow} />
      <Text style={styles.coinText}>{balance.toLocaleString()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { alignItems: 'center', paddingBottom: spacing.md },
  setsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(124,106,255,0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(124,106,255,0.35)',
  },
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
  emptyCat: {
    ...type.footnote,
    color: colors.mutedForeground,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.95 }] },
  setsBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.readinessGreen,
  },
  setsBadgeText: { fontSize: 12, fontWeight: '800', color: '#04120c' },
  setsBannerText: { flex: 1, minWidth: 0, gap: 2 },
  setsChest: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(124,106,255,0.16)',
  },
  setsChevron: { fontSize: 24, color: colors.mutedForeground, marginRight: 4 },
  setsHint: { ...type.caption, color: colors.mutedForeground },
  setsTitle: { ...type.headline, color: colors.foreground },
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
  sheetBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(4,4,6,0.6)',
  },
  sheetBackdropWrap: { flex: 1, justifyContent: 'flex-end' },
  sheetClose: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
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
  sheetScroll: { paddingBottom: spacing.lg },
  sheetTitle: { ...type.headline, color: colors.foreground, flex: 1 },
  tab: {
    flex: 1,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: { backgroundColor: colors.card },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: colors.secondary,
    borderRadius: radius.full,
    padding: 3,
    marginBottom: spacing.md,
  },
  tabText: { ...type.caption, color: colors.mutedForeground, fontWeight: '600' },
  tabTextActive: { color: colors.foreground },
});
