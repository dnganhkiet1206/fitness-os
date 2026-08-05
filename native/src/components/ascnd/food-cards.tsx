import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Plus, Star } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ascnd/icon';
import { colors, glass, radius, spacing } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';
import {
  useCreateFoodItem,
  useToggleFavoriteFood,
  type FoodItemRow,
  type RecentFood,
} from '@/hooks/use-nutrition';

/**
 * A saved food, as a row in a group.
 *
 * ── it was a card, and there were twelve of them ──
 *
 * Every food carried its own border and its own fill. Three sections of four
 * meant twelve bordered rectangles down one screen, each one drawing an edge
 * around a line of text — and the eye spends its effort on edges before it
 * spends any on words. Rows in one inset group say the same thing with one
 * border for the whole set, which is how the plan screens, the plan list and
 * every table view on the platform do it.
 *
 * The group and its hairlines belong to whoever lays these out; a row draws
 * neither. It only knows its own padding.
 *
 * ── one trailing control, not two ──
 *
 * It had a star *and* a trash on every row: twenty-four icon buttons on a
 * screen whose job is to let you look at food, half of them destructive and
 * sitting under the thumb of somebody scrolling.
 *
 * The star stays — it is a toggle, it is cheap, and its state is information.
 * Delete goes to the food editor, which the row already opens on a tap and
 * which has had a delete of its own all along. Nothing is lost except the
 * chance to remove a food you meant to scroll past.
 */
export function FoodCard({ f }: { f: FoodItemRow }) {
  const i18n = useI18n();
  const toggleFav = useToggleFavoriteFood();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${f.name}, ${Math.round(Number(f.kcal))} kcal`}
      style={({ pressed }) => [styles.row, pressed && styles.pressedDim]}
      onPress={() => {
        Haptics.selectionAsync();
        router.push({ pathname: '/food-editor', params: { id: f.id } });
      }}>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {f.name}
          {f.brand ? <Text style={styles.brand}>  {f.brand}</Text> : null}
        </Text>
        <Text style={styles.macros}>
          P{Math.round(Number(f.protein_g))} · C{Math.round(Number(f.carbs_g))} · F{Math.round(Number(f.fat_g))}
        </Text>
      </View>

      {/* Right-aligned, like the value in any table row — it is the number you
          scan a list of food for, and it was buried mid-sentence between the
          macros. */}
      <Text style={styles.kcal}>{Math.round(Number(f.kcal))} kcal</Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={i18n.a11yFavourite}
        accessibilityState={{ selected: !!f.is_favorite }}
        hitSlop={12}
        onPress={() => {
          Haptics.selectionAsync();
          toggleFav.mutate({ id: f.id, is_favorite: !f.is_favorite });
        }}>
        <Icon
          icon={Star}
          size={17}
          color={f.is_favorite ? colors.readinessYellow : colors.mutedForeground}
          strokeWidth={f.is_favorite ? 2.5 : 2}
        />
      </Pressable>
    </Pressable>
  );
}

/** A recently-logged food as a card; + saves it into My Foods (hidden if already saved). */
export function RecentFoodCard({ r, saved }: { r: RecentFood; saved: boolean }) {
  const i18n = useI18n();
  const createFood = useCreateFoodItem();

  const quickAdd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    createFood.mutate({
      name: r.food_name,
      brand: '',
      serving_g: r.serving_g || 100,
      kcal: r.kcal,
      protein_g: r.protein_g,
      carbs_g: r.carbs_g,
      fat_g: r.fat_g,
      fiber_g: r.fiber_g,
    });
  };

  return (
    <View style={styles.row}>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{r.food_name}</Text>
        <Text style={styles.macros}>
          P{r.protein_g} · C{r.carbs_g} · F{r.fat_g}
        </Text>
      </View>
      <Text style={styles.kcal}>{r.kcal} kcal</Text>
      {/* A fixed slot whether or not there is a button in it, so the kcal
          column does not jog left on the rows that are already saved. */}
      <View style={styles.slot}>
        {!saved ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={i18n.a11yAdd}
            hitSlop={12}
            disabled={createFood.isPending}
            style={({ pressed }) => pressed && styles.pressed}
            onPress={quickAdd}>
            <Icon icon={Plus} size={18} color={colors.primary} strokeWidth={2.5} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /* No border and no fill: the group these sit in draws one border for all of
     them. A row that carries its own is a card, and twelve cards is what this
     screen looked like. */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    minHeight: 52,
  },
  info: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 15, fontWeight: '500', color: colors.foreground },
  brand: { fontSize: 12, fontWeight: '400', color: colors.mutedForeground },
  /* Monospace, because three numbers in a column only line up if the digits
     are the same width — that is the whole reason to spend a mono face here. */
  macros: { fontSize: 11, fontFamily: 'Menlo', color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  kcal: { fontSize: 13, fontWeight: '500', color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  slot: { width: 18, alignItems: 'flex-end' },
  pressedDim: { opacity: 0.9 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.95 }] },
});

/**
 * The group these rows live in, and the hairline between two of them.
 *
 * Exported so every screen that lists foods draws the same object rather than
 * its own approximation of one. The separator is a element, never a border on
 * the row: a `marginLeft` to inset a border moves the whole row, and the
 * trailing column stops lining up.
 */
export const foodListStyles = StyleSheet.create({
  group: {
    borderRadius: radius.md,
    backgroundColor: glass.bg,
    borderWidth: glass.borderWidth,
    borderColor: glass.border,
    overflow: 'hidden',
  },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: spacing.md, backgroundColor: colors.border },
});
