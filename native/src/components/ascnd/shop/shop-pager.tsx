import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { ChevronLeft, ChevronRight, Coins, Lock } from 'lucide-react-native';

import { PressScale } from '@/components/ascnd/press-scale';
import { Icon } from '@/components/ascnd/icon';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import type { useI18n } from '@/hooks/use-app-settings';
import { TEST_UNLOCK_ALL } from '@/lib/dev-flags';
import { RARITY, type ShopItem } from '@/lib/mascot-room';

import { iconFor } from '@/components/ascnd/shop/shop-grid';

/**
 * One item at a time, with a chevron on each side.
 *
 * The grid it replaced showed nine cards at once, which is a catalogue: it
 * makes you compare thumbnails and it never shows you what any of them look
 * like on the character. A dress-up screen should be the other way round — one
 * thing, worn, and a way to move to the next.
 *
 * ── what it takes from the genre and what it does differently ──
 *
 * The arrows-either-side-of-one-item shape is the one every dress-up game uses,
 * Talking Tom included, and it is used here because it is genuinely the right
 * shape for the job. Three things are deliberately not that:
 *
 * - **The browsed item goes onto Koa immediately, bought or not.** You are
 *   looking at the outfit on the character rather than at a picture of it in a
 *   box, and the buy button is a decision you make *after* seeing it. Tom sells
 *   from a thumbnail; the whole point of having a room with a lit podium in it
 *   is that this does not have to.
 * - **The plate says where you are.** `3 / 12` and a row of pips, so a category
 *   has a visible length. A carousel with no position is a corridor.
 * - **One button, three states.** Mua → Mặc → Cởi in the same place, rather
 *   than a buy control and a separate wear toggle. There is only ever one thing
 *   to do to the item in front of you.
 *
 * ── it wraps ──
 *
 * Past the last item you land on the first. A category is a ring, not a shelf
 * with ends, and an arrow that goes dead is a control that has to be looked at
 * before it is pressed.
 */

export function ShopPager({
  items,
  index,
  onIndex,
  owned,
  equipped,
  balance,
  level,
  pendingBuy,
  buyingKey,
  onBuy,
  onToggleEquip,
  lang,
  i18n,
}: {
  items: ShopItem[];
  index: number;
  onIndex: (next: number) => void;
  owned: Set<string>;
  equipped: Set<string>;
  balance: number;
  level: number;
  pendingBuy: boolean;
  buyingKey?: string | null;
  onBuy: (item: ShopItem) => void;
  onToggleEquip: (key: string, next: boolean) => void;
  lang: 'vi' | 'en';
  i18n: ReturnType<typeof useI18n>;
}) {
  const item = items[index];
  if (!item) return null;

  const rar = RARITY[item.rarity];
  const isOwned = owned.has(item.key);
  const isEquipped = equipped.has(item.key);
  const price = TEST_UNLOCK_ALL ? 0 : item.price;
  const affordable = TEST_UNLOCK_ALL || balance >= item.price;
  const locked = !TEST_UNLOCK_ALL && !isOwned && item.unlockLevel != null && level < item.unlockLevel;
  const step = (d: number) => onIndex((index + d + items.length) % items.length);

  /**
   * The one thing to do to this item.
   *
   * A stage is *used* rather than worn, so its labels differ — but the control
   * does not, because "the single action available on the thing in front of
   * you" is the same idea either way.
   */
  const wearLabel = item.type === 'stage' ? i18n.nRoomUse : i18n.nRoomWear;
  const offLabel = item.type === 'stage' ? i18n.nRoomUsing : i18n.nRoomTakeOff;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Arrow i18n={i18n} dir="left" onPress={() => step(-1)} disabled={items.length < 2} />

        <View style={styles.plate}>
          <View style={[styles.iconWrap, { backgroundColor: `${rar.color}1c` }]}>
            <Icon icon={iconFor(item)} size={26} color={rar.color} />
          </View>
          <Text style={styles.name} numberOfLines={1}>
            {item.name[lang]}
          </Text>
          <View style={styles.metaRow}>
            <View style={[styles.rarity, { backgroundColor: `${rar.color}22` }]}>
              <Text style={[styles.rarityText, { color: rar.color }]}>{rar.name[lang]}</Text>
            </View>
            <Text style={styles.count}>
              {index + 1} / {items.length}
            </Text>
          </View>
        </View>

        <Arrow i18n={i18n} dir="right" onPress={() => step(1)} disabled={items.length < 2} />
      </View>

      {/* Pips, capped. Past a dozen they stop being countable and start being a
          texture, and a texture that changes width per category is worse than
          the counter that is already there. */}
      {items.length > 1 && items.length <= 12 ? (
        <View style={styles.pips}>
          {items.map((it, i) => (
            <View key={it.key} style={[styles.pip, i === index && { backgroundColor: rar.color }]} />
          ))}
        </View>
      ) : null}

      {locked ? (
        <View style={[styles.action, styles.actionLocked]}>
          <Icon icon={Lock} size={14} color={colors.mutedForeground} />
          <Text style={styles.lockedText}>
            {i18n.nRoomLockLevel.replace('{n}', String(item.unlockLevel))}
          </Text>
        </View>
      ) : !isOwned ? (
        <PressScale
          disabled={pendingBuy}
          style={[styles.action, styles.actionBuy, !affordable && styles.actionPoor]}
          onPress={() => onBuy(item)}>
          {buyingKey === item.key ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <>
              <Icon
                icon={Coins}
                size={15}
                color={affordable ? colors.primaryForeground : colors.mutedForeground}
              />
              <Text style={[styles.buyText, !affordable && styles.poorText]}>{price}</Text>
            </>
          )}
        </PressScale>
      ) : (
        <PressScale
          style={[styles.action, isEquipped ? styles.actionOff : styles.actionWear]}
          onPress={() => onToggleEquip(item.key, !isEquipped)}>
          <Text style={[styles.wearText, isEquipped && styles.offText]}>
            {isEquipped ? offLabel : wearLabel}
          </Text>
        </PressScale>
      )}
    </View>
  );
}

/**
 * A chevron, sized for a thumb rather than for the glyph in it.
 *
 * 56 across — these are the controls the screen is driven by, and the icon is
 * the smallest part of what has to be hittable.
 */
function Arrow({
  i18n,
  dir,
  onPress,
  disabled,
}: {
  i18n: ReturnType<typeof useI18n>;
  dir: 'left' | 'right';
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={dir === 'left' ? i18n.a11yPrevItem : i18n.a11yNextItem}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      style={[styles.arrow, disabled && styles.arrowOff]}>
      <Icon
        icon={dir === 'left' ? ChevronLeft : ChevronRight}
        size={24}
        color={disabled ? colors.mutedForeground : colors.foreground}
      />
    </PressScale>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  arrow: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary,
  },
  arrowOff: { opacity: 0.35 },
  plate: { flex: 1, alignItems: 'center', gap: 6 },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { ...type.headline, color: colors.foreground, textAlign: 'center' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rarity: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.sm },
  rarityText: { ...type.caption, fontWeight: '700' },
  count: { ...type.caption, color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  pips: { flexDirection: 'row', justifyContent: 'center', gap: 5 },
  pip: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.border },
  action: {
    height: 46,
    borderRadius: radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  actionBuy: { backgroundColor: colors.primary },
  actionPoor: { backgroundColor: colors.secondary },
  actionWear: { backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.border },
  actionOff: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  actionLocked: { backgroundColor: colors.secondary },
  buyText: { ...type.headline, color: colors.primaryForeground, fontVariant: ['tabular-nums'] },
  poorText: { color: colors.mutedForeground },
  wearText: { ...type.headline, color: colors.foreground },
  offText: { color: colors.mutedForeground },
  lockedText: { ...type.footnote, color: colors.mutedForeground },
});
