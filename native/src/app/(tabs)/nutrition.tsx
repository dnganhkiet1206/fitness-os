import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { ChevronRight, ClipboardList, Pencil, Pill, Plus, Search, ShoppingCart, Star, Utensils } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { PressScale } from '@/components/ascnd/press-scale';
import { AiMealSuggest } from '@/components/ascnd/ai-meal-suggest';
import { NutritionCard, WaterWidget } from '@/components/ascnd/dashboard-cards';
import { FoodCard, foodListStyles, RecentFoodCard } from '@/components/ascnd/food-cards';
import { GlassCard } from '@/components/ascnd/glass-card';
import { MealPlanWizard } from '@/components/ascnd/meal-plan-wizard';
import { Icon } from '@/components/ascnd/icon';
import { LogMealFab } from '@/components/ascnd/log-meal-fab';
import { Screen } from '@/components/ascnd/screen';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { TodayMeals } from '@/components/ascnd/today-meals';
import { colors, glass, radius, spacing } from '@/constants/ascnd';
import { rise } from '@/lib/entrance';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import { useMealPlans } from '@/hooks/use-library';
import { dedupeSeedShadows, useMyFoods, useMyFoodsSorted, useRecentFoods, useToggleFavoriteFood, useTodayLog, type FoodItemRow } from '@/hooks/use-nutrition';
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
/**
 * The meal-plan tab.
 *
 * ── what it was ──
 *
 * A single card containing the words "Kế hoạch ăn →" and nothing else, above
 * two thirds of an empty screen. It was a link wearing a tab's clothes: you
 * tapped a section, got a door, went through the door, and found the list that
 * could have been on the section in the first place.
 *
 * Nothing about it was broken, which is why it survived — it navigated
 * correctly to a page that works. It was just the emptiest thing in the app.
 *
 * ── what it is ──
 *
 * The plans themselves. Each card carries the two facts that tell them apart —
 * what the plan is for and how many meals a day it runs at — and opens straight
 * into that plan rather than into a list of every plan you own.
 *
 * `/meal-plans` is still where a plan is built and edited. That division is
 * worth keeping: this is the shelf, that is the workbench, and a tab inside the
 * diary is the wrong place to be adding foods to day four of a plan.
 *
 * ── and when there are none ──
 *
 * The empty state says what a meal plan *is*. Somebody who has never made one
 * is exactly the person looking at this screen, and "no meal plans yet" tells
 * them only that they have not done a thing they may not have a name for.
 */
function MealPlanTab({ i18n, vi }: { i18n: ReturnType<typeof useI18n>; vi: boolean }) {
  const { data: plans, isPending } = useMealPlans();
  const [creating, setCreating] = useState(false);

  const goalLabel = (g: string | null) =>
    g === 'bulk' ? i18n.goalBulk : g === 'cut' ? i18n.goalCut : g === 'maintain' ? i18n.goalMaintain : null;

  const open = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCreating(true);
  };

  /*
    Three, and the newest at the top.

    `useMealPlans` already orders by `created_at` descending — the plan you made
    a minute ago is the one you are here to look at, and the one from March is
    not. Three is what fits above the fold next to the tab bar; past that this
    stops being a section of the diary and becomes a second plans screen, which
    is what "Xem tất cả" is for.
  */
  const PREVIEW = 3;

  if (isPending) return null;

  if (!plans || plans.length === 0) {
    return (
      <>
        <GlassCard style={styles.planEmpty}>
          <Icon icon={Utensils} size={22} color={colors.mutedForeground} />
          <Text style={styles.planEmptyTitle}>{i18n.nMealPlanNone}</Text>
          <Text style={styles.planEmptyBody}>{i18n.nMealPlanWhat}</Text>
          <PressScale
            accessibilityRole="button"
            onPress={open}
            style={styles.planCreate}>
            <Icon icon={Plus} size={15} color={colors.primaryForeground} strokeWidth={2.5} />
            <Text style={styles.planCreateText}>{i18n.nMealPlanNew}</Text>
          </PressScale>
        </GlassCard>
        <MealPlanWizard
          visible={creating}
          planId={null}
          onClose={() => setCreating(false)}
        />
      </>
    );
  }

  return (
    <View style={styles.planSection}>
      <View style={styles.planHead}>
        <View style={styles.sectionHead}>
          <Icon icon={Utensils} size={13} />
          <Text style={styles.microTitle}>
            {i18n.nutritionMealPlan} ({plans.length})
          </Text>
        </View>
        {/* Only when there is something the three cards below are hiding — a
            "see all" over a list that is already all of it is a control that
            does nothing, which is what this whole section used to be. */}
        {plans.length > PREVIEW ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => {
              Haptics.selectionAsync();
              router.push('/meal-plans');
            }}>
            <Text style={styles.planAll}>{vi ? 'Xem tất cả' : 'See all'}</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.planStack}>
        {plans.slice(0, PREVIEW).map((p, i) => (
          <Animated.View key={p.id} entering={rise(i)}>
            <PressScale
              accessibilityRole="button"
              accessibilityLabel={`${p.name} — ${i18n.nMealPlanOpen}`}
              onPress={() => {
                Haptics.selectionAsync();
                router.push({ pathname: '/meal-plan', params: { plan: p.id } });
              }}>
              <GlassCard style={styles.planCard}>
                <View style={styles.planText}>
                  <Text style={styles.planName} numberOfLines={1}>{p.name}</Text>
                  <Text style={styles.planMeta} numberOfLines={1}>
                    {[
                      goalLabel(p.goal),
                      p.meals_per_day ? `${p.meals_per_day} ${i18n.nutritionMealsPerDay}` : null,
                    ]
                      .filter(Boolean)
                      .join('  ·  ')}
                  </Text>
                </View>
                <Icon icon={ChevronRight} size={16} color={colors.mutedForeground} />
              </GlassCard>
            </PressScale>
          </Animated.View>
        ))}
      </View>

      <PressScale
        accessibilityRole="button"
        onPress={open}
        style={styles.planAdd}>
        <Icon icon={Plus} size={15} color={colors.primary} strokeWidth={2.5} />
        <Text style={styles.planAddText}>{i18n.nMealPlanNew}</Text>
      </PressScale>

      {/*
        The whole flow, from naming the plan to putting food in it.

        It used to push `/meal-plans` with a flag that opened a form there;
        then it was a sheet with the form in it, which still ended by throwing
        you at a different screen to do the actual work. Creating a plan and
        putting the first food in it were never two errands.
      */}
      <MealPlanWizard visible={creating} planId={null} onClose={() => setCreating(false)} />
    </View>
  );
}

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
  /*
    Favourites are read for the *order*, not for a section of their own.

    They are a subset of your foods, so a separate list drew the same rows
    twice. Sorted to the front of the one list they still stand out — by the
    star they already carry — and the screen is half the height.
  */
  const myFoodsSorted = useMyFoodsSorted();
  const { data: recents } = useRecentFoods();
  const toggleFav = useToggleFavoriteFood();

  // Names already in "My foods" — recent items already saved hide their +
  const myFoodNames = new Set((myFoods ?? []).map((f) => f.name.toLowerCase()));

  /*
    "Xem thêm" lands on the list it was under.

    Both of them used to push `/food-list` bare, which opens on saved foods — so
    the one under Recent took you to the top of a list of up to two hundred
    other foods, and the four rows it was offering more of were somewhere below
    them. A link answers the question it is sitting under or it is not a link
    to anything.
  */
  const seeMore = (tab: 'mine' | 'recent') => {
    Haptics.selectionAsync();
    router.push({ pathname: '/food-list', params: { tab } });
  };
  /**
   * A set of foods as one inset group.
   *
   * The separator is an element between rows rather than a border on one: a
   * `marginLeft` to inset a border moves the whole row, and the trailing column
   * stops lining up with the row above it.
   */
  const FoodGroup = ({ rows }: { rows: FoodItemRow[] }) => (
    <View style={foodListStyles.group}>
      {rows.map((f, i) => (
        <View key={f.id}>
          {i > 0 ? <View style={foodListStyles.sep} /> : null}
          <FoodCard f={f} />
        </View>
      ))}
    </View>
  );

  const SeeMore = ({ tab, rest }: { tab: 'mine' | 'recent'; rest: number }) => (
    <PressScale
      accessibilityRole="button"
      style={styles.seeMore}
      onPress={() => seeMore(tab)}>
      {/* How many more, not just that there are more — the difference between
          "there is another screen" and a reason to open it. */}
      <Text style={styles.seeMoreText}>
        {lang === 'vi' ? `Xem thêm ${rest} món` : `See ${rest} more`}
      </Text>
      <Icon icon={ChevronRight} size={15} color={colors.primary} />
    </PressScale>
  );

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data: results } = useQuery({
    queryKey: ['nutrition_food_search', debounced],
    enabled: debounced.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('food_items')
        .select('id, user_id, name, brand, kcal, protein_g, carbs_g, fat_g, fiber_g, serving_g, is_favorite')
        .ilike('name', `%${debounced}%`)
        .order('is_favorite', { ascending: false })
        .order('name')
        .limit(20);
      if (error) throw error;
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
              <PressScale
                key={b.route}
                accessibilityRole="button"
                accessibilityLabel={b.label}
                hitSlop={8}
                style={styles.iconBtn}
                onPress={() => { Haptics.selectionAsync(); router.push(b.route); }}>
                <Icon icon={b.icon} size={17} color={colors.mutedForeground} />
              </PressScale>
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
                  <Icon icon={Utensils} size={13} />
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
              <PressScale
                style={styles.addFoodBtn}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push('/food-editor');
                }}>
                <Icon icon={Plus} size={14} color={colors.primaryForeground} strokeWidth={2.5} />
                <Text style={styles.addFoodText}>{i18n.foodAddCustom}</Text>
              </PressScale>
            </View>

            {/* AI meal suggestions (web AiMealSuggestButton) */}
            <AiMealSuggest />

            {debounced.length >= 2 && results ? (
              results.length > 0 ? (
                <FoodGroup rows={results} />
              ) : (
                <Text style={styles.emptyText}>{i18n.nNoExercisesFound}</Text>
              )
            ) : null}

            {debounced.length < 2 && (
              <>
                {/*
                  One list, favourites first — not two lists with the same food
                  in both.

                  "Yêu thích" was its own section, and favourites are a *subset*
                  of your foods, so the same four rows were drawn twice on most
                  screens: identical name, identical macros, identical star. Two
                  cards for one food is not two pieces of information, it is one
                  piece of information and a question about why it is there
                  twice.

                  Sorting them to the top of the one list says the same thing in
                  half the height, and the star that says which they are is the
                  same star you toggle them with.
                */}
                <View style={styles.foodSection}>
                  <View style={styles.sectionHeadRow}>
                    <Icon icon={Utensils} size={13} />
                    <Text style={styles.microTitle}>
                      {lang === 'vi' ? 'Thực phẩm của tôi' : 'My Foods'}
                    </Text>
                  </View>
                  {myFoodsSorted.length > 0 ? (
                    <>
                      <FoodGroup rows={myFoodsSorted.slice(0, 5)} />
                      {myFoodsSorted.length > 5 ? (
                        <SeeMore tab="mine" rest={myFoodsSorted.length - 5} />
                      ) : null}
                    </>
                  ) : (
                    <Text style={styles.emptyText}>
                      {lang === 'vi' ? 'Chưa có thực phẩm — bấm Thêm để tạo' : 'No foods yet — tap Add to create'}
                    </Text>
                  )}
                </View>

                {/*
                  Recent stays separate, because it is a different kind of
                  thing: these are foods you *logged*, not foods you saved, and
                  the action on them is "keep this one" rather than "star it".
                */}
                {recents && recents.length > 0 ? (
                  <View style={styles.foodSection}>
                    <View style={styles.sectionHeadRow}>
                      <Icon icon={ClipboardList} size={13} color={colors.mutedForeground} />
                      <Text style={styles.microTitle}>{i18n.nutritionRecent}</Text>
                    </View>
                    <View style={foodListStyles.group}>
                      {recents.slice(0, 4).map((r, i) => (
                        <View key={`${r.food_name}-${i}`}>
                          {i > 0 ? <View style={foodListStyles.sep} /> : null}
                          <RecentFoodCard r={r} saved={myFoodNames.has(r.food_name.toLowerCase())} />
                        </View>
                      ))}
                    </View>
                    {recents.length > 4 ? <SeeMore tab="recent" rest={recents.length - 4} /> : null}
                  </View>
                ) : null}
              </>
            )}
          </>
        ) : (
          <MealPlanTab i18n={i18n} vi={lang === 'vi'} />
        )}
      </Screen>
      {/* Logging lives here now, on the diary tab where the day is. The old
          full-width bar at the end of the meal list is gone. */}
      {/*
        ── one way to log a meal, not two ──

        The diary segment had the ⊕ menu; the other two had a small chip at the
        top of the page that went straight to the manual form. Same intent, two
        shapes, two places — and the chip was the worse of the two, because the
        ⊕ offers camera, barcode, search and manual while the chip offered only
        the last of those. So the segment you happened to be on decided which
        ways of logging existed.

        The ⊕ now renders on all three. It is absolutely positioned above the
        tab bar and costs no layout height, so a segment that is a list of foods
        is not pushed around by it.
      */}
      <LogMealFab i18n={i18n} />
    </View>
  );
}

const styles = StyleSheet.create({
  headerButtons: { flexDirection: 'row', gap: spacing.sm },
  iconBtn: {
    width: 34,
    height: 44,
    borderRadius: 17,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },

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
  /* 34pt with no hitSlop is a 34pt-tall target on a control that spans the
     screen — and `tap-targets.mjs` never saw it, because it skipped anything
     without a fixed `width` and a `flex: 1` segment has none. 44 is Apple's
     floor, and on a page with room to spare it also stops the row reading as
     an afterthought. */
  tab: {
    flex: 1,
    height: 44,
    borderRadius: radius.sm - 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  tabActive: { backgroundColor: colors.accent },
  tabText: { fontSize: 12, fontWeight: '500', color: colors.mutedForeground },
  tabTextActive: { color: colors.foreground },

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

  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  /* The heading, its group and its "see all" are one thing 10 apart, not three
     children of the page 20 apart — 20 is the distance between *sections*, and
     a heading a full section-gap above its own list reads as a heading for the
     page rather than for the list. */
  foodSection: { gap: spacing.sm + 2 },
  sectionHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
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

  // ── meal plans ──
  /*
    The section spaces itself.

    Every child of `Screen` is 20 apart — that is the distance between
    *sections*, and these cards were landing in it because each one was a child.
    Three plans spread over the page as if each were its own subject, with the
    heading floating a full section-gap above the first.

    12 between the heading, the group and the button; 10 inside the group. Close
    enough that the cards read as one list, far enough that an individual one is
    still a card. Same numbers the saved-workout list settled on, for the same
    reason.
  */
  planSection: { gap: spacing.sm + 4 },
  planStack: { gap: spacing.sm + 2 },
  planHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planAll: { fontSize: 13, fontWeight: '600', color: colors.primary },
  planCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  planText: { flex: 1, minWidth: 0, gap: 2 },
  planName: { fontSize: 15, fontWeight: '600', color: colors.foreground },
  planMeta: { fontSize: 12, color: colors.mutedForeground },
  /* Outlined and last, under the plans it adds to. The filled button belongs
     to the empty state, where creating one is the only thing to do. */
  planAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: 'rgba(24,24,27,0.2)',
  },
  planAddText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  planEmpty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  planEmptyTitle: { fontSize: 15, fontWeight: '600', color: colors.foreground },
  /* The sentence that says what the thing is. Somebody who has never made a
     meal plan is exactly who is reading this, and "none yet" tells them only
     that they have not done something they may not have a name for. */
  planEmptyBody: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.mutedForeground,
    textAlign: 'center',
    paddingHorizontal: spacing.sm,
  },
  planCreate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    marginTop: spacing.xs,
    backgroundColor: colors.primary,
  },
  planCreateText: { fontSize: 14, fontWeight: '600', color: colors.primaryForeground },
});
