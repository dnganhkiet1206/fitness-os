import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { ChevronRight, ClipboardList, Pencil, Pill, Plus, Search, ShoppingCart, Star, Utensils } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { AiMealSuggest } from '@/components/ascnd/ai-meal-suggest';
import { NutritionCard } from '@/components/ascnd/dashboard-cards';
import { FoodCard, RecentFoodCard } from '@/components/ascnd/food-cards';
import { GlassCard, PremiumSurface } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { LogMealFab } from '@/components/ascnd/log-meal-fab';
import { QuickStats } from '@/components/ascnd/quick-stats';
import { Screen } from '@/components/ascnd/screen';
import { PremiumBackdrop } from '@/components/ascnd/theme-backdrop';
import { TodayMeals } from '@/components/ascnd/today-meals';
import { TopEdgeBlur } from '@/components/ascnd/top-edge-blur';
import { colors, radius, spacing } from '@/constants/ascnd';
import { button, control, text as premiumText } from '@/constants/premium-theme';
import { rise } from '@/lib/entrance';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import { dedupeSeedShadows, useFavoriteFoods, useMyFoods, useRecentFoods, useToggleFavoriteFood, useTodayLog, type FoodItemRow } from '@/hooks/use-nutrition';
import { useTodayWater } from '@/hooks/use-water';
import { useDailyLog, useProfile } from '@/hooks/useTodayData';
import { calorieTargetFor, macroTargetsFor } from '@/lib/macro-targets';
import { supabase } from '@/integrations/supabase/client';

type Tab = 'today' | 'foods' | 'plans';

/**
 * Nutrition — a diary first, a library second.
 *
 * It was a faithful port of the web `/nutrition` page: Foods | Meal Plans, and
 * Foods meant search, favourites and recents. Everything on it was useful and
 * none of it answered the question people actually arrive with. You tap the
 * calorie ring on the dashboard because you want to know **what you have
 * eaten**, and the page opened on a catalogue of foods you might eat one day.
 *
 * So there is a third segment, `Hôm nay`, it comes first, and it is the
 * default. It holds the same `NutritionCard` the dashboard draws — the
 * component itself, not a copy, so the ring here and the ring there cannot
 * disagree — and under it every meal logged today with the foods inside it.
 *
 * **Nothing was removed.** Search, add-a-food, the AI suggestions, My Foods,
 * favourites, recents and Meal Plans are all still here, under `Thực phẩm` and
 * `Meal Plan`. The change is which of the three you land on.
 */
export default function NutritionScreen() {
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('today');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');

  const { data: today } = useTodayLog();
  const { data: dailyLog } = useDailyLog();
  const { data: profile } = useProfile();
  const kcal = Math.round(Number(dailyLog?.kcal) || 0);
  const calorieTarget = calorieTargetFor(profile);
  const macros = macroTargetsFor(profile);

  const { data: waterMl } = useTodayWater();

  const { data: myFoods } = useMyFoods();
  const { data: favorites } = useFavoriteFoods();
  const { data: recents } = useRecentFoods();
  const toggleFav = useToggleFavoriteFood();

  // Names already in "My foods" — recent items already saved hide their +
  const myFoodNames = new Set((myFoods ?? []).map((f) => f.name.toLowerCase()));

  const seeMore = () => {
    Haptics.selectionAsync();
    router.push('/food-list');
  };
  const SeeMore = () => (
    <Pressable style={({ pressed }) => [styles.seeMore, pressed && styles.pressedDim]} onPress={seeMore}>
      <Text style={styles.seeMoreText}>{lang === 'vi' ? 'Xem thêm' : 'See all'}</Text>
      <Icon icon={ChevronRight} size={15} color={premiumText.secondary} />
    </Pressable>
  );

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
          <Icon icon={Pencil} size={15} color={premiumText.hint} />
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
          color={f.is_favorite ? colors.readinessYellow : premiumText.hint}
          strokeWidth={f.is_favorite ? 2.5 : 2}
        />
      </Pressable>
    </View>
  );

  return (
    // The FAB is a sibling of the page, not a child: `Screen`'s root *is* the
    // scroll view, so anything inside it scrolls away with the diary.
    <View style={styles.root}>
      {/*
        Dark Gray Premium, on trial here before it goes app-wide.

        The backdrop is a sibling of `Screen` and sits *under* it, so it stays
        still while the page scrolls over it — a background that scrolled with
        the content would give away that it is a drawing rather than a surface.
        `transparentBackground` stops the scaffold painting `colors.background`
        on top of it.

        `PremiumSurface` re-skins every `GlassCard` below it, which is how the
        calorie card, the quick stats and the meal list pick the theme up
        without any of those shared components being edited. Both wrappers are
        scoped to this page: Today, Workouts and Progress are untouched.
      */}
      <PremiumBackdrop />
      <PremiumSurface>
      <Screen
        transparentBackground
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
                <Icon icon={b.icon} size={17} color={premiumText.secondary} />
              </Pressable>
            ))}
          </View>
        }>
        {/* Segmented tabs (web TabsList: Foods | Meal Plans) */}
        <View style={styles.tabBar}>
          {[
            { key: 'today' as const, label: lang === 'vi' ? 'Hôm nay' : 'Today', icon: ClipboardList },
            { key: 'foods' as const, label: i18n.nutritionFoods, icon: Search },
            { key: 'plans' as const, label: i18n.nutritionMealPlan, icon: Utensils },
          ].map((t) => (
            <Pressable
              key={t.key}
              style={[styles.tab, tab === t.key && styles.tabActive]}
              onPress={() => { Haptics.selectionAsync(); setTab(t.key); }}>
              <Icon icon={t.icon} size={13} color={tab === t.key ? premiumText.primary : premiumText.hint} />
              <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Log meal — kept on the library and plan segments, where there is no
            other way to start one. `Hôm nay` has its own, under the diary. */}
        {tab !== 'today' ? (
          <Pressable
            style={({ pressed }) => [styles.logChip, pressed && styles.pressed]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/log-meal');
            }}>
            <Icon icon={Plus} size={12} color="rgba(237,237,237,0.6)" strokeWidth={2.5} />
            <Text style={styles.logChipText}>{i18n.nLogMealBtn}</Text>
          </Pressable>
        ) : null}

        {tab === 'today' ? (
          <>
            {/* The dashboard's own card. Same component, same numbers — the ring
                on Today and the ring here are one thing rendered twice. */}
            <NutritionCard
              kcal={kcal}
              calorieTarget={calorieTarget}
              protein={{ current: Number(dailyLog?.protein_g) || 0, target: macros.protein }}
              carbs={{ current: Number(dailyLog?.carbs_g) || 0, target: macros.carbs }}
              fat={{ current: Number(dailyLog?.fat_g) || 0, target: macros.fat }}
              fiber={{ current: Number(dailyLog?.fiber_g) || 0, target: macros.fiber }}
            />

            {/* The numbers a day of eating is judged by, under the hero card */}
            <QuickStats
              kcal={kcal}
              calorieTarget={calorieTarget}
              protein={Number(dailyLog?.protein_g) || 0}
              proteinTarget={macros.protein}
              waterMl={waterMl ?? 0}
              waterTargetMl={Number(profile?.water_target_ml) || 2500}
              i18n={i18n}
            />

            <View style={styles.sectionHeadRow}>
              <Icon icon={Utensils} size={13} color={premiumText.secondary} />
              <Text style={styles.microTitle}>{lang === 'vi' ? 'Bữa ăn hôm nay' : "Today's meals"}</Text>
            </View>
            <TodayMeals meals={today ?? []} i18n={i18n} lang={lang} />
          </>
        ) : tab === 'foods' ? (
          <>
            {/* Search + add custom food (web: search flex-1 + Add button) */}
            <View style={styles.searchRow}>
              <View style={styles.searchWrap}>
                <Icon icon={Search} size={15} color={premiumText.hint} />
                <TextInput
                  style={styles.searchInput}
                  placeholder={i18n.nutritionSearchFood}
                  placeholderTextColor={premiumText.hint}
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
                <Icon icon={Plus} size={14} color={button.primaryFg} strokeWidth={2.5} />
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

            {debounced.length < 2 && (
              <>
                {/* My foods — 4 most recent as cards, "See all" opens the full list */}
                <View style={styles.sectionHeadRow}>
                  <Icon icon={Utensils} size={13} color={premiumText.secondary} />
                  <Text style={styles.microTitle}>{lang === 'vi' ? 'Danh sách thực phẩm' : 'My Foods'}</Text>
                </View>
                {myFoods && myFoods.length > 0 ? (
                  <Animated.View style={styles.cardList} entering={rise(0)}>
                    {myFoods.slice(0, 4).map((f) => <FoodCard key={f.id} f={f} />)}
                    {myFoods.length > 4 && <SeeMore />}
                  </Animated.View>
                ) : (
                  <Text style={styles.emptyText}>
                    {lang === 'vi' ? 'Chưa có thực phẩm — bấm Thêm để tạo' : 'No foods yet — tap Add to create'}
                  </Text>
                )}

                {/* Favorites — starred foods as cards */}
                {favorites && favorites.length > 0 && (
                  <>
                    <View style={styles.sectionHeadRow}>
                      <Icon icon={Star} size={13} color={colors.readinessYellow} />
                      <Text style={styles.microTitle}>{i18n.nutritionFavorites}</Text>
                    </View>
                    <Animated.View style={styles.cardList} entering={rise(1)}>
                      {favorites.map((f) => <FoodCard key={f.id} f={f} />)}
                    </Animated.View>
                  </>
                )}

                {/* Recent — logged foods as cards; + adds to My Foods (hidden if
                    the food is already saved) */}
                {recents && recents.length > 0 && (
                  <>
                    <View style={styles.sectionHeadRow}>
                      <Icon icon={ClipboardList} size={13} color={premiumText.hint} />
                      <Text style={styles.microTitle}>{i18n.nutritionRecent}</Text>
                    </View>
                    <Animated.View style={styles.cardList} entering={rise(2)}>
                      {recents.slice(0, 4).map((r, i) => (
                        <RecentFoodCard key={i} r={r} saved={myFoodNames.has(r.food_name.toLowerCase())} />
                      ))}
                      {recents.length > 4 && <SeeMore />}
                    </Animated.View>
                  </>
                )}
              </>
            )}
          </>
        ) : (
          <Pressable
            onPress={() => { Haptics.selectionAsync(); router.push('/meal-plans'); }}>
            {({ pressed }) => (
              <GlassCard style={[styles.listCard, pressed && styles.pressedDim]}>
                <View style={styles.sectionHead}>
                  <Icon icon={Utensils} size={13} color={premiumText.hint} />
                  <Text style={styles.microTitle}>{i18n.nutritionMealPlan}</Text>
                </View>
                <Text style={styles.emptyText}>{i18n.nMealPlans} →</Text>
              </GlassCard>
            )}
          </Pressable>
        )}
      </Screen>
      </PremiumSurface>
      {/* Over the page, so scrolled content softens as it goes under the notch.
          Rendered after `Screen` for that reason — and only a safe-area strip
          tall, so the title and the cards are never inside it at rest. */}
      <TopEdgeBlur />
      {/* Logging lives here now, on the diary tab where the day is. The old
          full-width bar at the end of the meal list is gone. */}
      {tab === 'today' ? <LogMealFab i18n={i18n} /> : null}
    </View>
  );
}

/**
 * Page-local surfaces, on the premium theme.
 *
 * Only the styles this file owns. Everything drawn by a shared component keeps
 * its own look except for the card surface, which `PremiumSurface` swaps — see
 * the wrapper in the tree above.
 *
 * The pattern throughout: controls go *darker* than the page (`control.track`)
 * and the selected thing inside them goes *lighter* (`control.active`). The
 * previous values were all translucent light fills, which is the only direction
 * that works on a near-black page and the wrong one on charcoal.
 */
const styles = StyleSheet.create({
  headerButtons: { flexDirection: 'row', gap: spacing.sm },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: control.active,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.95 }] },
  pressedDim: { opacity: 0.9, transform: [{ scale: 0.98 }] },

  microTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 2.4,
    color: premiumText.hint,
  },

  root: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: control.track,
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
  tabActive: { backgroundColor: control.active },
  tabText: { fontSize: 12, fontWeight: '500', color: premiumText.hint },
  tabTextActive: { color: premiumText.primary },

  logChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 36,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: control.hairline,
    backgroundColor: control.track,
  },
  logChipText: { fontSize: 13, fontWeight: '500', color: premiumText.secondary },

  searchRow: { flexDirection: 'row', gap: spacing.sm },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: control.hairline,
    backgroundColor: control.track,
    paddingHorizontal: spacing.md - 4,
  },
  // The brief's primary button: near-white with dark text, in place of the
  // brand silver. The single loudest change on the page.
  addFoodBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 44,
    paddingHorizontal: spacing.md - 2,
    borderRadius: radius.sm,
    backgroundColor: button.primaryBg,
  },
  addFoodText: { fontSize: 12, fontWeight: '600', color: button.primaryFg },
  searchInput: { flex: 1, color: premiumText.primary, fontSize: 15, height: '100%' },

  listCard: { gap: spacing.sm + 2 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.xs },
  cardList: { gap: spacing.sm },
  seeMore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    height: 40,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: control.hairline,
    backgroundColor: control.track,
  },
  seeMoreText: { fontSize: 13, fontWeight: '600', color: premiumText.secondary },
  foodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: control.hairline,
    backgroundColor: control.track,
  },
  foodRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 4 },
  foodInfo: { flex: 1, minWidth: 0, gap: 2 },
  foodName: { fontSize: 14, fontWeight: '500', color: premiumText.primary },
  foodBrand: { fontSize: 12, fontWeight: '400', color: premiumText.hint },
  foodMacros: { fontSize: 11, fontFamily: 'Menlo', color: premiumText.hint, fontVariant: ['tabular-nums'] },
  emptyText: { fontSize: 12, color: premiumText.hint, textAlign: 'center', paddingVertical: spacing.sm },
});
