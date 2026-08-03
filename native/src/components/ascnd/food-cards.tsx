import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Plus, Star, Trash2 } from 'lucide-react-native';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ascnd/icon';
import { colors, glass, radius, spacing } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';
import {
  useCreateFoodItem,
  useDeleteFoodItem,
  useToggleFavoriteFood,
  type FoodItemRow,
  type RecentFood,
} from '@/hooks/use-nutrition';

/** A saved food as a card: tap to edit macros, star to favorite, trash to delete. */
export function FoodCard({ f }: { f: FoodItemRow }) {
  const i18n = useI18n();
  const toggleFav = useToggleFavoriteFood();
  const deleteFood = useDeleteFoodItem();

  const confirmDelete = () => {
    Alert.alert('ASCND', `${i18n.delete} "${f.name}"?`, [
      { text: i18n.cancel, style: 'cancel' },
      {
        text: i18n.delete,
        style: 'destructive',
        onPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          deleteFood.mutate(f.id);
        },
      },
    ]);
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.foodCard, pressed && styles.pressedDim]}
      onPress={() => {
        Haptics.selectionAsync();
        router.push({ pathname: '/food-editor', params: { id: f.id } });
      }}>
      <View style={styles.foodInfo}>
        <Text style={styles.foodName} numberOfLines={1}>
          {f.name}
          {f.brand ? <Text style={styles.foodBrand}>  ({f.brand})</Text> : null}
        </Text>
        <Text style={styles.foodMacros}>
          {Math.round(Number(f.kcal))} kcal · P{Math.round(Number(f.protein_g))} · C{Math.round(Number(f.carbs_g))} · F{Math.round(Number(f.fat_g))}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={i18n.a11yFavourite}
        hitSlop={8}
        onPress={() => {
          Haptics.selectionAsync();
          toggleFav.mutate({ id: f.id, is_favorite: !f.is_favorite });
        }}>
        <Icon icon={Star} size={17} color={f.is_favorite ? colors.readinessYellow : colors.mutedForeground} strokeWidth={f.is_favorite ? 2.5 : 2} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={i18n.a11yDelete} hitSlop={8} onPress={confirmDelete}>
        <Icon icon={Trash2} size={16} color={colors.mutedForeground} />
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
    <View style={styles.foodCard}>
      <View style={styles.foodInfo}>
        <Text style={styles.foodName} numberOfLines={1}>{r.food_name}</Text>
        <Text style={styles.foodMacros}>
          {r.kcal} kcal · P{r.protein_g} · C{r.carbs_g} · F{r.fat_g}
        </Text>
      </View>
      {!saved && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={i18n.a11yAdd}
          hitSlop={8}
          disabled={createFood.isPending}
          style={({ pressed }) => pressed && styles.pressed}
          onPress={quickAdd}>
          <Icon icon={Plus} size={18} color={colors.primary} strokeWidth={2.5} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  foodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    // Match the app's glass card surface (6% white fill + 12% white hairline)
    borderWidth: glass.borderWidth,
    borderColor: glass.border,
    backgroundColor: glass.bg,
  },
  foodInfo: { flex: 1, minWidth: 0, gap: 2 },
  foodName: { fontSize: 14, fontWeight: '500', color: colors.foreground },
  foodBrand: { fontSize: 12, fontWeight: '400', color: colors.mutedForeground },
  foodMacros: { fontSize: 11, fontFamily: 'Menlo', color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  pressedDim: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  pressed: { opacity: 0.85, transform: [{ scale: 0.95 }] },
});
