import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { ClipboardList, Pencil, Pill, Plus, Search, ShoppingCart, Star, Utensils } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AiMealSuggest } from '@/components/ascnd/ai-meal-suggest';
import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { Screen } from '@/components/ascnd/screen';
import { colors, radius, spacing } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import { dedupeSeedShadows, useFavoriteFoods, useRecentFoods, useToggleFavoriteFood, type FoodItemRow } from '@/hooks/use-nutrition';
import { supabase } from '@/integrations/supabase/client';

type Tab = 'foods' | 'plans';

/**
 * Nutrition tab — faithful port of the web /nutrition page: Foods |
 * Meal Plans segments; Foods = search + favorites (star toggle) +
 * recent foods with kcal.
 */
export default function NutritionScreen() {
  const i18n = useI18n();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('foods');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');

  const { data: favorites } = useFavoriteFoods();
  const { data: recents } = useRecentFoods();
  const toggleFav = useToggleFavoriteFood();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data: results } = useQuery({
    queryKey: ['nutrition_food_search', debounced],
    enabled: debounced.length >= 2,
    queryFn: async () => {
      const { data } = await supabase
        .from('food_items')
        .select('id, user_id, name, brand, kcal, protein_g, carbs_g, fat_g, fiber_g, serving_g, is_favorite')
        .ilike('name', `%${debounced}%`)
        .order('is_favorite', { ascending: false })
        .order('name')
        .limit(20);
      return dedupeSeedShadows((data ?? []) as FoodItemRow[]);
    },
  });

  const FoodRow = ({ f }: { f: FoodItemRow }) => (
    <View style={styles.foodRow}>
      <View style={styles.foodInfo}>
        <Text style={styles.foodName} numberOfLines={1}>
          {f.name}
          {f.brand ? <Text style={styles.foodBrand}>  ({f.brand})</Text> : null}
        </Text>
        <Text style={styles.foodMacros}>
          {Math.round(Number(f.kcal))} kcal · P{Math.round(Number(f.protein_g))} · C{Math.round(Number(f.carbs_g))} · F{Math.round(Number(f.fat_g))}
        </Text>
      </View>
      {/* Own foods are editable (web: pencil when user_id matches) */}
      {f.user_id === user?.id && (
        <Pressable
          hitSlop={10}
          onPress={() => {
            Haptics.selectionAsync();
            router.push({ pathname: '/food-editor', params: { id: f.id } });
          }}>
          <Icon icon={Pencil} size={15} color={colors.mutedForeground} />
        </Pressable>
      )}
      <Pressable
        hitSlop={10}
        onPress={() => {
          Haptics.selectionAsync();
          toggleFav.mutate({ id: f.id, is_favorite: !f.is_favorite });
        }}>
        <Icon
          icon={Star}
          size={16}
          color={f.is_favorite ? colors.readinessYellow : colors.mutedForeground}
          strokeWidth={f.is_favorite ? 2.5 : 2}
        />
      </Pressable>
    </View>
  );

  return (
    <Screen
      title={i18n.nutritionTitle}
      headerRight={
        <View style={styles.headerButtons}>
          {[
            { icon: Pill, route: '/supplements' as const },
            { icon: ShoppingCart, route: '/grocery' as const },
          ].map((b) => (
            <Pressable
              key={b.route}
              hitSlop={8}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
              onPress={() => { Haptics.selectionAsync(); router.push(b.route); }}>
              <Icon icon={b.icon} size={17} color={colors.mutedForeground} />
            </Pressable>
          ))}
        </View>
      }>
      {/* Segmented tabs (web TabsList: Foods | Meal Plans) */}
      <View style={styles.tabBar}>
        {[
          { key: 'foods' as const, label: i18n.nutritionFoods, icon: Search },
          { key: 'plans' as const, label: i18n.nutritionMealPlan, icon: Utensils },
        ].map((t) => (
          <Pressable
            key={t.key}
            style={[styles.tab, tab === t.key && styles.tabActive]}
            onPress={() => { Haptics.selectionAsync(); setTab(t.key); }}>
            <Icon icon={t.icon} size={13} color={tab === t.key ? colors.foreground : colors.mutedForeground} />
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Log meal quick chip (native entry) */}
      <Pressable
        style={({ pressed }) => [styles.logChip, pressed && styles.pressed]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push('/log-meal');
        }}>
        <Icon icon={Plus} size={12} color="rgba(237,237,237,0.6)" strokeWidth={2.5} />
        <Text style={styles.logChipText}>{i18n.nLogMealBtn}</Text>
      </Pressable>

      {tab === 'foods' ? (
        <>
          {/* Search + add custom food (web: search flex-1 + Add button) */}
          <View style={styles.searchRow}>
            <View style={styles.searchWrap}>
              <Icon icon={Search} size={15} color={colors.mutedForeground} />
              <TextInput
                style={styles.searchInput}
                placeholder={i18n.nutritionSearchFood}
                placeholderTextColor={colors.mutedForeground}
                value={search}
                onChangeText={setSearch}
                autoCorrect={false}
              />
            </View>
            <Pressable
              style={({ pressed }) => [styles.addFoodBtn, pressed && styles.pressed]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/food-editor');
              }}>
              <Icon icon={Plus} size={14} color={colors.primaryForeground} strokeWidth={2.5} />
              <Text style={styles.addFoodText}>{i18n.foodAddCustom}</Text>
            </Pressable>
          </View>

          {/* AI meal suggestions (web AiMealSuggestButton) */}
          <AiMealSuggest />

          {debounced.length >= 2 && results && (
            <GlassCard style={styles.listCard}>
              {results.length > 0 ? (
                results.map((f) => <FoodRow key={f.id} f={f} />)
              ) : (
                <Text style={styles.emptyText}>{i18n.nNoExercisesFound}</Text>
              )}
            </GlassCard>
          )}

          {/* Favorites */}
          {debounced.length < 2 && (
            <>
              <GlassCard style={styles.listCard}>
                <View style={styles.sectionHead}>
                  <Icon icon={Star} size={13} color={colors.readinessYellow} />
                  <Text style={styles.microTitle}>{i18n.nutritionFavorites}</Text>
                </View>
                {favorites && favorites.length > 0 ? (
                  favorites.map((f) => <FoodRow key={f.id} f={f} />)
                ) : (
                  <Text style={styles.emptyText}>—</Text>
                )}
              </GlassCard>

              {/* Recent */}
              <GlassCard style={styles.listCard}>
                <View style={styles.sectionHead}>
                  <Icon icon={ClipboardList} size={13} color={colors.mutedForeground} />
                  <Text style={styles.microTitle}>{i18n.nutritionRecent}</Text>
                </View>
                {recents && recents.length > 0 ? (
                  recents.map((r, i) => (
                    <View key={i} style={styles.foodRow}>
                      <View style={styles.foodInfo}>
                        <Text style={styles.foodName} numberOfLines={1}>{r.food_name}</Text>
                        <Text style={styles.foodMacros}>
                          {r.kcal} kcal · P{r.protein_g} · C{r.carbs_g} · F{r.fat_g}
                        </Text>
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptyText}>—</Text>
                )}
              </GlassCard>
            </>
          )}
        </>
      ) : (
        <Pressable
          onPress={() => { Haptics.selectionAsync(); router.push('/meal-plans'); }}>
          {({ pressed }) => (
            <GlassCard style={[styles.listCard, pressed && styles.pressedDim]}>
              <View style={styles.sectionHead}>
                <Icon icon={Utensils} size={13} color={colors.mutedForeground} />
                <Text style={styles.microTitle}>{i18n.nutritionMealPlan}</Text>
              </View>
              <Text style={styles.emptyText}>{i18n.nMealPlans} →</Text>
            </GlassCard>
          )}
        </Pressable>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerButtons: { flexDirection: 'row', gap: spacing.sm },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.95 }] },
  pressedDim: { opacity: 0.8 },

  microTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 2.4,
    color: colors.mutedForeground,
  },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(24,24,27,0.6)',
    borderRadius: radius.sm,
    padding: 3,
    gap: 3,
  },
  tab: {
    flex: 1,
    height: 34,
    borderRadius: radius.sm - 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  tabActive: { backgroundColor: colors.accent },
  tabText: { fontSize: 12, fontWeight: '500', color: colors.mutedForeground },
  tabTextActive: { color: colors.foreground },

  logChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 36,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(43,43,49,0.3)',
    backgroundColor: 'rgba(24,24,27,0.2)',
  },
  logChipText: { fontSize: 13, fontWeight: '500', color: colors.foreground },

  searchRow: { flexDirection: 'row', gap: spacing.sm },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: 'rgba(24,24,27,0.3)',
    paddingHorizontal: spacing.md - 4,
  },
  addFoodBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 44,
    paddingHorizontal: spacing.md - 2,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
  },
  addFoodText: { fontSize: 12, fontWeight: '600', color: colors.primaryForeground },
  searchInput: { flex: 1, color: colors.foreground, fontSize: 15, height: '100%' },

  listCard: { gap: spacing.sm + 2 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  foodRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 4 },
  foodInfo: { flex: 1, minWidth: 0, gap: 2 },
  foodName: { fontSize: 14, fontWeight: '500', color: colors.foreground },
  foodBrand: { fontSize: 12, fontWeight: '400', color: colors.mutedForeground },
  foodMacros: { fontSize: 11, fontFamily: 'Menlo', color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  emptyText: { fontSize: 12, color: colors.mutedForeground, textAlign: 'center', paddingVertical: spacing.sm },
});
