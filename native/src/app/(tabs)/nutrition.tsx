import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { ChevronRight, ClipboardList, Pencil, Pill, Plus, Search, ShoppingCart, Star, Utensils } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { AiMealSuggest } from '@/components/ascnd/ai-meal-suggest';
import { NutritionCard, WaterWidget } from '@/components/ascnd/dashboard-cards';
import { FoodCard, RecentFoodCard } from '@/components/ascnd/food-cards';
import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { LogMealFab } from '@/components/ascnd/log-meal-fab';
import { Screen } from '@/components/ascnd/screen';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { TodayMeals } from '@/components/ascnd/today-meals';
import { colors, glass, radius, spacing } from '@/constants/ascnd';
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

  const { data: today, isError: diaryFailed } = useTodayLog();
  const { data: dailyLog, isError: dayFailed } = useDailyLog();
  const { data: profile } = useProfile();

  /**
   * One retry for the whole tab, not a refetch of the query that reported.
   *
   * This screen reads a dozen queries and one failure usually means several —
   * the ring's day, the diary, the water total all go through the same
   * connection. Refetching only the one that raised its hand would repair a
   * corner of the page and leave the rest still lying.
   */
  const queryClient = useQueryClient();
  const [retrying, setRetrying] = useState(false);
  const retry = useCallback(async () => {
    setRetrying(true);
    await queryClient.invalidateQueries();
    setRetrying(false);
  }, [queryClient]);

  const kcal = Math.round(Number(dailyLog?.kcal) || 0);
  const calorieTarget = calorieTargetFor(profile);
  const macros = macroTargetsFor(profile);

  const { data: waterMl, isError: waterFailed } = useTodayWater();

  /**
   * One message for the segment, not one per widget.
   *
   * These three reads go down the same connection and in practice fail
   * together, so a card per source stacked the identical sentence three times.
   * The notice is shown once at the top; below it each widget is drawn only if
   * *its own* source came back, so a partial failure still shows what is known
   * and never shows a zero it cannot stand behind.
   */
  const todayFailed = dayFailed || diaryFailed || waterFailed;

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
      <Icon icon={ChevronRight} size={15} color={colors.primary} />
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
          accessibilityRole="button"
          accessibilityLabel={i18n.a11yEdit}
          hitSlop={10}
          onPress={() => {
            Haptics.selectionAsync();
            router.push({ pathname: '/food-editor', params: { id: f.id } });
          }}>
          <Icon icon={Pencil} size={15} color={colors.mutedForeground} />
        </Pressable>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={i18n.a11yFavourite}
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
    // The FAB is a sibling of the page, not a child: `Screen`'s root *is* the
    // scroll view, so anything inside it scrolls away with the diary.
    <View style={styles.root}>
      <Screen
        title={i18n.nutritionTitle}
        headerRight={
          <View style={styles.headerButtons}>
            {[
              { icon: Pill, route: '/supplements' as const, label: i18n.nSupplements },
              { icon: ShoppingCart, route: '/grocery' as const, label: i18n.nGrocery },
            ].map((b) => (
              <Pressable
                key={b.route}
                accessibilityRole="button"
                accessibilityLabel={b.label}
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
            { key: 'today' as const, label: lang === 'vi' ? 'Hôm nay' : 'Today', icon: ClipboardList },
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
            {/*
              The ring reads `daily_logs`. When that read fails the card draws a
              confident `0 kcal / 2,200`, which is the same picture as a day
              nobody has eaten on — so the card is replaced rather than dressed
              up. A wrong number with a warning beside it is still a wrong
              number, and this one is the largest thing on the screen.
            */}
            {todayFailed ? <LoadFailed i18n={i18n} onRetry={retry} busy={retrying} /> : null}

            {dayFailed ? null : (
            <NutritionCard
              interactive
              kcal={kcal}
              calorieTarget={calorieTarget}
              protein={{ current: Number(dailyLog?.protein_g) || 0, target: macros.protein }}
              carbs={{ current: Number(dailyLog?.carbs_g) || 0, target: macros.carbs }}
              fat={{ current: Number(dailyLog?.fat_g) || 0, target: macros.fat }}
              fiber={{ current: Number(dailyLog?.fiber_g) || 0, target: macros.fiber }}
            />
            )}

            {/*
              Water — Today's widget, not a copy of it.

              The row that used to sit here also carried calories and protein,
              and both were already answered a few points above: the ring is
              the calories, and protein is one of the four macro tiles inside
              the same card. Water was the only thing on it that the hero card
              does not say.

              So it is `WaterWidget`, the component Today renders, reading the
              same `useTodayWater` query and opening the same `/water` screen.
              Logging a glass on either tab moves both, because there is only
              one of them.
            */}
            {waterFailed ? null : (
              <WaterWidget
                ml={waterMl ?? 0}
                targetMl={Number(profile?.water_target_ml) || 2500}
                labels={{ title: lang === 'vi' ? 'Nước uống' : 'Water' }}
              />
            )}

            {/*
              Heading and list go together.

              The notice at the top of the segment already says why the diary is
              missing, so repeating it here would be noise — but leaving the
              heading behind is its own small lie: "Today's meals" over an empty
              space promises a list that is not coming.
            */}
            {diaryFailed ? null : (
              <>
                <View style={styles.sectionHeadRow}>
                  <Icon icon={Utensils} size={13} color={colors.primary} />
                  <Text style={styles.microTitle}>
                    {lang === 'vi' ? 'Bữa ăn hôm nay' : "Today's meals"}
                  </Text>
                </View>
                <TodayMeals meals={today ?? []} i18n={i18n} lang={lang} />
              </>
            )}
          </>
        ) : tab === 'foods' ? (
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

            {debounced.length < 2 && (
              <>
                {/* My foods — 4 most recent as cards, "See all" opens the full list */}
                <View style={styles.sectionHeadRow}>
                  <Icon icon={Utensils} size={13} color={colors.primary} />
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
                      <Icon icon={ClipboardList} size={13} color={colors.mutedForeground} />
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
                  <Icon icon={Utensils} size={13} color={colors.mutedForeground} />
                  <Text style={styles.microTitle}>{i18n.nutritionMealPlan}</Text>
                </View>
                <Text style={styles.emptyText}>{i18n.nMealPlans} →</Text>
              </GlassCard>
            )}
          </Pressable>
        )}
      </Screen>
      {/* Logging lives here now, on the diary tab where the day is. The old
          full-width bar at the end of the meal list is gone. */}
      {tab === 'today' ? <LogMealFab i18n={i18n} /> : null}
    </View>
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
  pressedDim: { opacity: 0.9, transform: [{ scale: 0.98 }] },

  microTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 2.4,
    color: colors.mutedForeground,
  },

  root: { flex: 1 },
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
  sectionHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.xs },
  cardList: { gap: spacing.sm },
  seeMore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    height: 40,
    borderRadius: radius.md,
    borderWidth: glass.borderWidth,
    borderColor: glass.border,
    backgroundColor: glass.bg,
  },
  seeMoreText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  foodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: 'rgba(24,24,27,0.3)',
  },
  foodRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 4 },
  foodInfo: { flex: 1, minWidth: 0, gap: 2 },
  foodName: { fontSize: 14, fontWeight: '500', color: colors.foreground },
  foodBrand: { fontSize: 12, fontWeight: '400', color: colors.mutedForeground },
  foodMacros: { fontSize: 11, fontFamily: 'Menlo', color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  emptyText: { fontSize: 12, color: colors.mutedForeground, textAlign: 'center', paddingVertical: spacing.sm },
});
