import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { Coins, Sparkles, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PressScale } from '@/components/ascnd/press-scale';
import { Segmented, SegmentPanel } from '@/components/ascnd/segmented';
import { Icon } from '@/components/ascnd/icon';
import { Screen } from '@/components/ascnd/screen';
import { BAND_ASPECT } from '@/components/ascnd/shop/shop-camera';
import { ShopScene } from '@/components/ascnd/shop/shop-scene';
import { CategoryRow, CollectionRow } from '@/components/ascnd/shop/shop-grid';
import { ShopPager } from '@/components/ascnd/shop/shop-pager';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useMascotIdentity } from '@/hooks/use-mascot';
import {
  useBuyItem,
  useClaimReward,
  useMascotInventory,
  useMascotWallet,
  useToggleEquip,
} from '@/hooks/use-mascot-room';
import { TEST_UNLOCK_ALL } from '@/lib/dev-flags';
import {
  activeStageKey,
  collectionProgress,
  collectionRefKey,
  COLLECTIONS,
  levelFromXp,
  RARITY,
  SHOP_ITEMS,
  type ShopCategory,
  type ShopItem,
} from '@/lib/mascot-room';
import { offlineNow } from '@/lib/offline';
import { toast } from '@/lib/toast';

/**
 * The dressing room, as a page.
 *
 * It was a bottom sheet over the Mascot Room, and a sheet is the wrong shape
 * for it: the room kept rendering underneath, the scene had to fit in a strip,
 * and the tabs had nowhere to be but a pill row squeezed above a grid. A page
 * gets the whole viewport, and the camera gets somewhere to move.
 *
 * The band is `BAND_ASPECT` of its width, which is the Mascot Room's stage
 * shape — so walking through the door lands you on a room the same size as the
 * one you left, and "Toàn cảnh" fills it exactly.
 *
 * ── it owns its own data ──
 *
 * Every hook here is React Query, so calling them again on this route costs
 * nothing and cannot disagree with the room: both read the same cache. The
 * alternative — threading a dozen values and four mutations through navigation
 * params — would have been a second copy of the truth.
 *
 * ── one room, four shots ──
 *
 * The tabs are not four screens. `ShopScene` holds one fitting room — drape,
 * podium, wardrobe, mirror — and the tab moves a camera through it: Toàn cảnh
 * is the doorway, Sân khấu pushes in on the podium, Trang phục comes down to
 * Koa standing on it, Tủ đồ pans across to the wardrobe. See
 * `shop/shop-room.tsx` for the room and `shop/shop-camera.ts` for the shots.
 */

/**
 * The four places to stand, in the order they are offered.
 *
 * `overview` first because it is where the room opens and where the other three
 * are chosen from — it is the doorway, not a fourth kind of shopping. The tab
 * names are the shot names, so there is no table mapping one to the other and
 * no way for the two to disagree.
 */
/**
 * How long Koa looks at what just went on him.
 *
 * One full sway of `DRESS_PERIOD` and a little either side for the blend, so
 * the pose gets to complete a cycle rather than being cut off mid-lean.
 */
const DRESS_HOLD = 4200;

const TABS = ['overview', 'stage', 'outfit', 'closet'] as const;
type Tab = (typeof TABS)[number];

/** which of them put a grid under the room */
const SELLS: Record<Tab, boolean> = { overview: false, stage: true, outfit: true, closet: true };

/**
 * Which tab a caller asked for, if it asked for a real one.
 *
 * The Mascot Room's door lands here with no parameter at all and gets the
 * overview, which is the point of the overview. A query string is otherwise
 * whatever the URL holds, so it is checked against the tabs rather than cast to
 * one.
 */
const asTab = (v: unknown): Tab =>
  (TABS as readonly string[]).includes(v as string) ? (v as Tab) : 'overview';

export default function ShopScreen() {
  const i18n = useI18n();
  const { lang } = useAppSettings();
  /* Identity only — the shop dresses the character, it has no opinion about
     today's calories. */
  const { mascot } = useMascotIdentity();

  const { data: wallet } = useMascotWallet();
  const { data: inventory } = useMascotInventory();
  const buy = useBuyItem();
  const equip = useToggleEquip();
  const claim = useClaimReward();

  const { tab: wanted } = useLocalSearchParams<{ tab?: string }>();
  // the initial tab only — re-reading the param would fight the user's taps
  const [tab, setTab] = useState<Tab>(() => asTab(wanted));
  const [cat, setCat] = useState<ShopCategory | 'all'>('all');
  // Which item the pager is on. Reset by `pick`, below, whenever the list it
  // indexes into changes — an index kept across a filter change points at a
  // different thing than the one that was on screen.
  const [index, setIndex] = useState(0);
  // See `dressing`, below — the pose is a reaction to a garment going on, so it
  // needs to fire again when the same one is re-worn, which a key alone cannot
  // say. Bumped on every equip.
  const [wearTick, setWearTick] = useState(0);
  const [dressing, setDressing] = useState(false);
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

  /**
   * The item under the pager, and what the room shows because of it.
   *
   * **Browsing dresses the character.** This is the whole reason the grid went:
   * you are looking at the outfit on Koa, on a lit podium, rather than at a
   * thumbnail in a box — and the buy button is a decision made after seeing it.
   * Nothing is written anywhere; it is the equipped set with one key added for
   * the render, so leaving the tab leaves him exactly as he was.
   *
   * A stage previews the same way, through the room's skin rather than through
   * what he is wearing.
   */
  const browsing = items[Math.min(index, items.length - 1)];
  const preview =
    browsing && browsing.type === 'outfit' ? new Set([...equipped, browsing.key]) : equipped;
  const previewStage =
    browsing && browsing.type === 'stage' ? browsing.key : activeStageKey(equipped);

  /** move the pager, and keep it inside a list that may have just changed */
  const pick = (next: number) => setIndex(items.length === 0 ? 0 : next % items.length);

  /**
   * Koa reacts when a garment goes on him, and only then.
   *
   * Not while a tab is open — that made the pose a costume he was stuck in for
   * as long as you were on the screen. Putting something on is an event, so
   * this is one: a few seconds of looking down at what just appeared, then back
   * to the idle he does in the Mascot Room.
   *
   * It fires on the browsed outfit changing as well as on the wear button,
   * because browsing *does* put the thing on him — that is the whole point of
   * the preview, and a reaction that ignored it would be reacting to the
   * paperwork rather than to the clothes. Stages are not clothes and do not
   * trigger it.
   */
  const dressKey = browsing && browsing.type === 'outfit' ? browsing.key : null;
  const dressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!dressKey) {
      setDressing(false);
      return;
    }
    setDressing(true);
    if (dressTimer.current) clearTimeout(dressTimer.current);
    dressTimer.current = setTimeout(() => setDressing(false), DRESS_HOLD);
    return () => {
      if (dressTimer.current) clearTimeout(dressTimer.current);
    };
  }, [dressKey, wearTick]);

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
    /*
      ── the shop is online-only, and it had no way of saying so ──

      `lib/offline-write.ts` names the shop in its list of what is deliberately
      **not** queued, and that is right: a purchase is a server decision about a
      price and a balance, and a queued one would be an intention that may be
      unaffordable by the time it sends.

      What the screen did with that decision was nothing. `buy.mutate` fired,
      React Query paused it — `networkMode` is the default `'online'` — and
      `isPending` stayed true for ever: no toast, no error (a paused mutation
      never calls `onError`), and `pendingBuy` disabled **every** buy button on
      the page. One tap with no signal and the whole shop went dead, silently,
      with a spinner on the item that had not been bought.

      Refusing out loud is the honest version, and it is the same shape the log
      sheets already use for the writes that *can* be queued — the difference
      being that here there is nothing to promise.
    */
    if (offlineNow()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      toast.warning(i18n.nShopOffline);
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

  /**
   * The scene is the full width of the window, edge to edge.
   *
   * From the window rather than from a layout pass: it is the first thing on
   * the page, and a band that resizes on the second frame reads as a jump.
   *
   * `spacing.md` is subtracted nowhere. The page's content is padded by that
   * much and the scene cancels it with a negative margin, which is the same
   * thing the Mascot Room does with its own stage — a room with a gutter down
   * each side is a picture of a room, not a room.
   */
  const sceneW = Dimensions.get('window').width;

  return (
    <Screen
      title={i18n.nRoomDressing}
      back
      // The header floats over the scene rather than sitting above it, so the
      // room runs to the top of the screen and the chevron and the coin pill
      // sit on its ceiling — which is empty wall, and the reason the drape's
      // rail hangs at y 72 rather than at the very top.
      transparentHeader
      headerRight={<Coin balance={balance} />}>
      <View style={styles.stage}>
        <ShopScene
          shot={tab}
          mascot={mascot}
          width={sceneW}
          height={Math.round(sceneW * BAND_ASPECT)}
          level={level}
          equipped={preview}
          skin={previewStage ?? undefined}
          dress={dressing}
        />
      </View>

      <Segmented
        value={tab}
        onChange={(k) => {
          setTab(k);
          setIndex(0);
        }}
        compact
        options={[
          { key: 'overview' as const, label: i18n.nRoomOverview },
          { key: 'stage' as const, label: i18n.nRoomStageSkins },
          { key: 'outfit' as const, label: i18n.nRoomOutfits },
          { key: 'closet' as const, label: i18n.nRoomCloset },
        ]}
      />

      <SegmentPanel segment={tab}>
      {tab === 'outfit' || tab === 'closet' ? (
        <CategoryRow
          current={cat}
          onPick={(c) => {
            Haptics.selectionAsync();
            setCat(c);
            setIndex(0);
          }}
          lang={lang}
          i18n={i18n}
        />
      ) : null}

      {SELLS[tab] ? (
        items.length === 0 ? (
          /*
            ── two different emptinesses, and they were sharing a sentence ──

            `nRoomEmptyCat` is *"more coming soon"*, which is true of a category
            the catalogue has nothing in yet. It was also shown for a **closet
            with nothing bought in it** — telling somebody the app has run out
            of things while thirty-six outfits sit one tab away, and leaving
            them on a dead end with no way through to them.

            The closet's emptiness is the one the shop can do something about,
            so it says what it is and offers the way out.
          */
          tab === 'closet' ? (
            <View style={styles.emptyCloset}>
              <Text style={styles.emptyCat}>{i18n.nRoomEmptyCloset}</Text>
              <PressScale
                style={styles.emptyClosetBtn}
                onPress={() => {
                  Haptics.selectionAsync();
                  setTab('outfit');
                  setIndex(0);
                }}>
                <Text style={styles.emptyClosetBtnText}>{i18n.nRoomGoToOutfits}</Text>
              </PressScale>
            </View>
          ) : (
            <Text style={styles.emptyCat}>{i18n.nRoomEmptyCat}</Text>
          )
        ) : (
          <ShopPager
            items={items}
            index={Math.min(index, items.length - 1)}
            onIndex={pick}
            owned={owned}
            equipped={equipped}
            balance={balance}
            level={level}
            pendingBuy={buy.isPending}
            buyingKey={buyingKey}
            onBuy={buyItem}
            onToggleEquip={(key, next) => {
              Haptics.selectionAsync();
              // Wearing is the event the pose is a reaction to. Taking off is
              // not — there is nothing new to look down at.
              if (next) setWearTick((n) => n + 1);
              equip.mutate({ itemKey: key, equipped: next });
            }}
            lang={lang}
            i18n={i18n}
          />
        )
      ) : (
        <Text style={styles.overviewHint}>{i18n.nRoomOverviewHint}</Text>
      )}

      {tab === 'outfit' ? (
        <PressScale
          style={styles.setsBanner}
          onPress={() => {
            Haptics.selectionAsync();
            setCollectionsOpen(true);
          }}>
          <View style={styles.setsChest}>
            <Icon icon={Sparkles} size={22} />
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
        </PressScale>
      ) : null}

      {/* Collections stays a sheet. It is a detail *of* the shop rather than a
          place of its own, and pushing a route for it would put the camera
          through a move to show a list of tick-boxes. */}
      </SegmentPanel>

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
                accessibilityRole="button"
                accessibilityLabel={i18n.a11yClose}
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
      <Icon icon={Coins} size={13} />
      <Text style={styles.coinText}>{balance.toLocaleString()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Edge to edge: the page pads its content by `spacing.md` and this takes it
  // back, the same way the Mascot Room's `sceneWrap` does.
  stage: { marginHorizontal: -spacing.md, marginBottom: spacing.xs },
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
    backgroundColor: 'rgba(255,217,61,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,217,61,0.35)',
  },
  coinText: { ...type.footnote, fontWeight: '700', color: colors.readinessYellow, fontVariant: ['tabular-nums'] },
  emptyCat: {
    ...type.footnote,
    color: colors.mutedForeground,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  emptyCloset: { alignItems: 'center', paddingBottom: spacing.lg },
  emptyClosetBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  emptyClosetBtnText: { ...type.footnote, color: colors.primary, fontWeight: '600' },
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
  /* 34pt with no hitSlop is a 34pt-tall target on a control that spans the
     screen — and `tap-targets.mjs` never saw it, because it skipped anything
     without a fixed `width` and a `flex: 1` segment has none. 44 is Apple's
     floor, and on a page with room to spare it also stops the row reading as
     an afterthought. */
  overviewHint: {
    ...type.footnote,
    color: colors.mutedForeground,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
});
