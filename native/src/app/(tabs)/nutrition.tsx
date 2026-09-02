import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { nav } from '@/lib/nav';
import { Barcode, ChevronRight, ClipboardList, Pencil, Pill, Plus, Search, ShoppingCart, Star, Utensils } from 'lucide-react-native';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { PressScale } from '@/components/ascnd/press-scale';
import { SectionTitle } from '@/components/ascnd/section-title';
import { AiMealSuggest } from '@/components/ascnd/ai-meal-suggest';
import { NutritionCard, WaterWidget } from '@/components/ascnd/dashboard-cards';
import { FoodCard, foodListStyles, RecentFoodCard } from '@/components/ascnd/food-cards';
import { GlassCard } from '@/components/ascnd/glass-card';
import { MealPlanWizard } from '@/components/ascnd/meal-plan-wizard';
import { Segmented, SegmentPanel } from '@/components/ascnd/segmented';
import { Icon } from '@/components/ascnd/icon';
import { MealLogActions } from '@/components/ascnd/meal-log-actions';
import { ShortcutRow } from '@/components/ascnd/shortcut-row';
import { useSupplementChecklist } from '@/hooks/use-library';
import { useGroceryItems } from '@/hooks/use-extras';
import { Screen } from '@/components/ascnd/screen';
import { Measured, NutritionSkeleton, SK } from '@/components/ascnd/skeleton';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { TodayMeals } from '@/components/ascnd/today-meals';
import { PAGE_TINT, colors, glass, radius, spacing, type } from '@/constants/ascnd';
import { useRise } from '@/lib/entrance';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import { useMealPlanFill, useMealPlans } from '@/hooks/use-library';
import { PlanRow } from '@/components/ascnd/plan-row';
import { dedupeSeedShadows, useMyFoods, useMyFoodsSorted, useRecentFoods, useToggleFavoriteFood, useTodayLog, type FoodItemRow } from '@/hooks/use-nutrition';
import { useTodayWater } from '@/hooks/use-water';
import { useDailyLog, useProfile } from '@/hooks/useTodayData';
import { calorieTargetFor, macroTargetsFor } from '@/lib/macro-targets';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hai mục, không phải ba.
 *
 * "Thực phẩm" và "Thực đơn" từng là hai mục ngang hàng, và đó là cách sắp xếp
 * theo NGUỒN DỮ LIỆU chứ không theo việc người dùng đang làm. Tìm một món ăn
 * gần như luôn là để đưa nó vào một bữa nào đó — nó là PHƯƠNG TIỆN, còn kế
 * hoạch mới là thứ người ta mở app để xem. Đặt hai thứ ngang hàng bắt người
 * dùng chọn giữa mục đích và công cụ, và mỗi lần chuyển qua lại là một lần mất
 * chỗ đang đứng.
 *
 * Gộp lại thì kế hoạch nằm TRÊN và thư viện nằm dưới nó trong cùng một trang:
 * thứ quan trọng nhất là thứ nhìn thấy trước, và công cụ ở ngay bên dưới khi
 * cần tới.
 */
type Tab = 'today' | 'plan';

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
  /* Lần vẽ đầu thì hiện ngay — xem `useRise`. */
  const rise = useRise();
  const { data: plans, isPending } = useMealPlans();
  /* Chỉ hỏi cho những plan THẬT SỰ được vẽ. Hỏi cho cả danh sách rồi vứt đi
     phần thừa là trả tiền băng thông cho dữ liệu không ai nhìn. */
  const { data: fill } = useMealPlanFill((plans ?? []).slice(0, 3).map((p) => p.id));
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
        <SectionTitle>
          {i18n.nutritionMealPlan} ({plans.length})
        </SectionTitle>
        {/* Only when there is something the three cards below are hiding — a
            "see all" over a list that is already all of it is a control that
            does nothing, which is what this whole section used to be. */}
        {plans.length > PREVIEW ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => {
              Haptics.selectionAsync();
              nav.push('/meal-plans');
            }}>
            <Text style={styles.planAll}>{vi ? 'Xem tất cả' : 'See all'}</Text>
          </Pressable>
        ) : null}
      </View>

      {/*
        MỘT khối, không phải bốn khối rời.

        ── lỗi ──

        Ba thực đơn là ba `GlassCard` riêng, cách nhau 10 điểm, rồi nút "Tạo
        thực đơn" là một khối bo góc thứ tư nữa. Bốn hình chữ nhật rời nhau cho
        cùng một danh sách: mắt phải tự ghép chúng lại thành "đây là các thực
        đơn của tôi", và cái nút cuối trông như một thứ KHÁC loại chứ không phải
        hàng cuối của chính danh sách đó.

        ── cách iOS gom một danh sách ──

        Một khối bo góc duy nhất, các hàng ngăn bằng vạch tóc thụt vào — và hàng
        "thêm" nằm TRONG khối, ở cuối, đúng như Cài đặt đặt "Thêm tài khoản"
        dưới danh sách tài khoản. Nó nói: đây là một danh sách, và đây là cách
        làm nó dài thêm.

        Không tự dựng lại: `foodListStyles.group` / `.sep` là đúng thứ mà nửa
        dưới của chính trang này đã dùng cho danh sách thực phẩm. Hai danh sách
        trên một trang phải trông như nhau.
      */}
      <View style={foodListStyles.group}>
        {plans.slice(0, PREVIEW).map((p, i) => (
          <Animated.View key={p.id} entering={rise(i)}>
            {i > 0 ? <View style={foodListStyles.sep} /> : null}
            <PlanRow
              name={p.name}
              goalText={[
                goalLabel(p.goal),
                /* `nutritionMeals` = "bữa", không phải `nutritionMealsPerDay` =
                   "Số bữa/ngày". Khoá kia là NHÃN của một ô nhập, và ghép nó sau
                   một con số cho ra "3 Số bữa/ngày". */
                p.meals_per_day ? `${p.meals_per_day} ${i18n.nutritionMeals}` : null,
              ]
                .filter(Boolean)
                .join('  ·  ')}
              perDay={p.meals_per_day ?? 3}
              days={fill?.[p.id]}
              a11yLabel={`${p.name} — ${i18n.nMealPlanOpen}`}
              onPress={() => {
                Haptics.selectionAsync();
                nav.push({ pathname: '/meal-plan', params: { plan: p.id } });
              }}
            />
          </Animated.View>
        ))}
        <View style={foodListStyles.sep} />
        <PressScale
          accessibilityRole="button"
          onPress={open}
          style={styles.planRow}>
          <Icon icon={Plus} size={16} color={colors.primary} strokeWidth={2.5} />
          <Text style={styles.planAddText}>{i18n.nMealPlanNew}</Text>
        </PressScale>
      </View>

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
  /* `isPending` — xem chú thích ở thẻ NutritionCard bên dưới. Không có nó
     thì "đang tải" và "hôm nay chưa ăn gì" là cùng một bức tranh. */
  const { data: dailyLog, isError: dayFailed, isPending: dayPending } = useDailyLog();
  const { data: profile } = useProfile();
  /* Both rows below show state rather than only a name — see `shortcut-row`.
     Neither read blocks the page: a shortcut with nothing to report simply
     shows its label, which is exactly what the icons it replaced did. */
  const { data: supplements } = useSupplementChecklist();
  const { data: grocery } = useGroceryItems();

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
    nav.push({ pathname: '/food-list', params: { tab } });
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
      /* Hàng cao 40 điểm, dưới sàn 44 của Apple. `hitSlop` đưa nó lên 56 khi
         chạm mà không đổi một điểm ảnh nào khi nhìn — cùng cách `scanBtn` ở
         cuối tệp này đã dùng cho nút quét mã. Nâng chiều cao thay vào đó sẽ
         đẩy hàng ra khỏi nhịp của danh sách bên trên nó. */
      hitSlop={8}
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
    /* Keyed by the account as well as the text — this select returns the
       caller's own `food_items` alongside the shared seeds, and the row
       renderer below proves it by comparing `f.user_id === user?.id`. See the
       note on the same query in `log-meal.tsx`. */
    queryKey: ['nutrition_food_search', user?.id, debounced],
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
            nav.push({ pathname: '/food-editor', params: { id: f.id } });
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
    <>
      {/*
        ── the header carries no unlabelled doors any more ──

        It held a pill and a shopping trolley. One tap from anywhere on the tab,
        which was the good part, and no way to know what either was, which was
        not — and this app has a real shop, so a trolley in a header is a
        reasonable guess at entirely the wrong screen.

        Both are now `ShortcutRow`s — names written out, today's state beside
        them — and each sits with the thing it belongs to rather than in a
        drawer of leftovers: supplements next to water in "Hôm nay", the
        shopping list among the foods. See `shortcut-row.tsx` for why the
        state, not the label, is the point.
      */}
      <Screen refreshable title={i18n.nutritionTitle} aura={PAGE_TINT.nutrition}>
        {/* Segmented tabs (web TabsList: Foods | Meal Plans) */}
        {/*
          Điều hướng MỤC của trang, không phải một ô điều khiển đặt lên trang.

          Bản trước là một segmented control đầy đủ: đường ray có nền, viên
          trượt lấp đầy nửa màn, chữ 11 điểm. Nó đọc ra như một component được
          đặt vào màn hình — một thẻ nằm ngay trên các thẻ kính bên dưới, tức
          "thẻ trong thẻ", và cái viên nửa màn nặng hơn hẳn thứ nó đang chỉ.

          `underline` bỏ đường ray đi: chỉ còn hai nhãn căn trái và một gạch 3
          điểm trượt dưới nhãn đang chọn, rộng đúng bằng nhãn đó. Thứ bậc do độ
          mờ kể (42% cho mục chưa chọn), nên không thêm màu nào vào bảng.

          Cơ chế trượt vẫn là `PickRow` — cùng một thứ mà viên trượt dùng, chỉ
          khác chiều cao và chỗ neo. Không có thanh chỉ báo thứ hai nào được
          viết ra.
        */}
        <Segmented
          variant="capsule"
          value={tab}
          onChange={setTab}
          options={[
            { key: 'today' as const, label: lang === 'vi' ? 'Hôm nay' : 'Today', icon: ClipboardList },
            { key: 'plan' as const, label: i18n.nutritionMealPlan, icon: Utensils },
          ]}
        />

        <SegmentPanel segment={tab}>
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

            {/*
              Đang tải là một trạng thái RIÊNG, không phải một ngày chưa ăn gì.

              `kcal` là `Math.round(Number(dailyLog?.kcal) || 0)`, nên trước khi
              truy vấn về nó bằng 0 và thẻ này vẽ một vòng "0 / 2.200" đầy tự
              tin. Lập luận vì sao thế là không được đã nằm ngay trên đây, viết
              cho nhánh LỖI — "A wrong number with a warning beside it is still
              a wrong number, and this one is the largest thing on the screen."
              Nhánh đang tải cũng vẽ đúng con số sai ấy, mà lại chạy ở MỌI lần
              mở app nguội chứ không phải chỉ khi có sự cố.
            */}
            {dayPending ? (
              <NutritionSkeleton />
            ) : dayFailed ? null : (
            <Measured id={SK.nutritionRing}>
            <NutritionCard
              interactive
              kcal={kcal}
              calorieTarget={calorieTarget}
              protein={{ current: Number(dailyLog?.protein_g) || 0, target: macros.protein }}
              carbs={{ current: Number(dailyLog?.carbs_g) || 0, target: macros.carbs }}
              fat={{ current: Number(dailyLog?.fat_g) || 0, target: macros.fat }}
              fiber={{ current: Number(dailyLog?.fiber_g) || 0, target: macros.fiber }}
            />
            </Measured>
            )}

            {/*
              The four ways to log, directly under the ring they move.

              This is where the floating ⊕ went — see `meal-log-actions.tsx`
              for why it could not stay in the corner, which is a story about
              the fifth tab rather than about the button.
            */}
            <MealLogActions i18n={i18n} />

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
              ── supplements belong beside water, not under the diary ──

              Both are the same kind of thing: a small daily habit with a
              count, ticked off rather than measured, and neither is a meal.
              Sitting together above the diary they read as one band of "what
              else today needs"; split by the meal list they read as two
              unrelated leftovers.

              The row carries `2/4 hôm nay`, so on most days the question is
              answered without the tap — which is why it earns a place this
              high rather than merely being reachable.
            */}
            <ShortcutRow
              icon={Pill}
              label={i18n.nSupplements}
              value={supplements && supplements.length > 0
                ? `${supplements.filter((x) => x.taken).length}/${supplements.length} ${i18n.nTakenToday}`
                : null}
              onPress={() => nav.push('/supplements')}
            />

            {/*
              Heading and list go together.

              The notice at the top of the segment already says why the diary is
              missing, so repeating it here would be noise — but leaving the
              heading behind is its own small lie: "Today's meals" over an empty
              space promises a list that is not coming.
            */}
            {diaryFailed ? null : (
              <>
                <SectionTitle>
                  {lang === 'vi' ? 'Bữa ăn hôm nay' : "Today's meals"}
                </SectionTitle>
                <TodayMeals meals={today ?? []} i18n={i18n} lang={lang} />
              </>
            )}
          </>
        ) : (
          <>
            {/*
              Kế hoạch TRƯỚC, thư viện sau — thứ tự này là cả lý do gộp hai mục.
              Người ta mở mục này để xem mình định ăn gì; tìm món là việc làm khi
              đã biết mình cần thêm gì vào đó.
            */}
            <MealPlanTab i18n={i18n} vi={lang === 'vi'} />

            {/* Gợi ý bữa ăn sinh ra KẾ HOẠCH, nên nó đứng cùng kế hoạch chứ
                không nằm dưới tiêu đề "Thực phẩm" — thư viện là món lẻ bạn đã
                có, còn đây là đề xuất cho bữa bạn chưa nghĩ ra. */}
            <AiMealSuggest />

            {/*
              ── đi chợ nằm với KẾ HOẠCH, không nằm trong thư viện ──

              Chú thích trước viết "nó cùng chủ đề với mọi thứ trong mục này",
              đúng khi mục này TÊN LÀ "Thực phẩm". Giờ mục này là Thực đơn, và
              thư viện chỉ còn là nửa dưới của nó — nên câu đó không còn đúng
              với chỗ nó đang đứng.

              Danh sách đi chợ sinh ra TỪ kế hoạch: bạn biết tuần này định ăn
              gì, rồi mới biết cần mua gì. Nó thuộc nửa trên.

              Trước lần dời này nó nằm giữa ô tìm kiếm và danh sách thực phẩm —
              tức chen ngang vào chính cái thư viện mà người dùng đang đọc.

              It is named `nGrocery` = "Danh sách đi chợ" rather than the old
              "Đi chợ": the old name is a verb phrase and reads as an action
              the app is about to perform, when the screen is a list you keep.

              The row carries `còn 6 món`, so the state is answered without the
              tap, which is the whole reason it is a `ShortcutRow` and not an
              icon in the header.
            */}
            <ShortcutRow
              icon={ShoppingCart}
              label={i18n.nGrocery}
              value={grocery && grocery.length > 0
                ? i18n.nGroceryLeft.replace('{n}', String(grocery.filter((g) => !g.checked).length))
                : null}
              onPress={() => nav.push('/grocery')}
            />

            {/* Cùng hàng tiêu đề mà các mục con của thư viện đang dùng, nên nửa
                dưới đọc ra là một MỤC của trang chứ không phải một trang thứ hai
                bị nối vào. */}
            <SectionTitle>{i18n.nutritionFoods}</SectionTitle>

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
                {/*
                  Scanning is a way of searching, so it lives in the search
                  field — the same place Amazon, the supermarket apps and
                  MyFitnessPal's own search bar put it. It is the one of the
                  four logging methods this segment was missing once the ⊕
                  left, and it is the one that belongs here: a barcode
                  identifies a packaged food, which is exactly what you are
                  typing the name of.
                */}
                <PressScale
                  accessibilityRole="button"
                  accessibilityLabel={i18n.nAddBarcode}
                  hitSlop={8}
                  style={styles.scanBtn}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    nav.push('/scan-barcode');
                  }}>
                  <Icon icon={Barcode} size={17} color={colors.mutedForeground} />
                </PressScale>
              </View>
              <PressScale
                style={styles.addFoodBtn}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  nav.push('/food-editor');
                }}>
                <Icon icon={Plus} size={14} color={colors.primaryForeground} strokeWidth={2.5} />
                <Text style={styles.addFoodText}>{i18n.foodAddCustom}</Text>
              </PressScale>
            </View>


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
                  {/*
                    Nhãn phụ, KHÔNG phải tiêu đề mục.

                    Trước đây khu này có BA tiêu đề 18pt xếp chồng — "Thực
                    phẩm", "Thực phẩm của tôi", "Gần đây" — cho cùng một việc:
                    tìm và chọn món. Ba tiêu đề cùng cỡ nghĩa là không cái nào
                    dẫn cái nào, và cả khu cao gấp rưỡi nội dung nó chứa.

                    Hai danh sách vẫn phải phân biệt được: comment ngay dưới ghi
                    rằng "Gần đây" là món ĐÃ GHI chứ không phải món đã lưu, và
                    nút trên mỗi hàng khác nhau — gắn sao so với giữ lại. Nên
                    tôi gộp phần NHÌN chứ không trộn dữ liệu: một tiêu đề duy
                    nhất ở trên, hai nhãn nhỏ lặng đi ở đây.
                  */}
                  <Text style={styles.foodSubLabel}>
                    {lang === 'vi' ? 'Thực phẩm của tôi' : 'My Foods'}
                  </Text>
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
                    <Text style={styles.foodSubLabel}>{i18n.nutritionRecent}</Text>
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
        )}
        </SegmentPanel>
      </Screen>
      {/*
        ── nothing floats over this page any more ──

        There was a ⊕ here, absolutely positioned above the tab bar, which is
        why the page used to be wrapped in a plain `View` at all — `Screen`'s
        root *is* the scroll view, so a sibling was the only way to keep a
        button from scrolling away with the diary.

        It is gone, and so is the wrapper's job. `meal-log-actions.tsx` has the
        whole reason; the short version is that the bottom-right corner is the
        system's now — iOS 26 draws the fifth tab's `role="search"` as a
        detached circle there — and a second circle of our own 22pt above it
        was a coin-flip, not a control.

        Each segment answers its own logging question instead: Hôm nay has the
        four ways under the ring, Thực phẩm has search + barcode + Thêm món in
        its own row, and Kế hoạch is plans rather than a day.
      */}
    </>
  );
}

const styles = StyleSheet.create({

  /* 34pt with no hitSlop is a 34pt-tall target on a control that spans the
     screen — and `tap-targets.mjs` never saw it, because it skipped anything
     without a fixed `width` and a `flex: 1` segment has none. 44 is Apple's
     floor, and on a page with room to spare it also stops the row reading as
     an afterthought. */

  searchRow: { flexDirection: 'row', gap: spacing.sm },
  /* 30pt on its own, so hitSlop 8 takes it to 46 — past Apple's 44pt floor
     without making the glyph bigger than the search icon facing it. */
  scanBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
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

  /* The heading, its group and its "see all" are one thing 10 apart, not three
     children of the page 20 apart — 20 is the distance between *sections*, and
     a heading a full section-gap above its own list reads as a heading for the
     page rather than for the list. */
  /* Khoảng cách giữa hai danh sách con hẹp lại: chúng thuộc cùng một mục nên
     không cần cách nhau bằng khoảng dành cho hai MỤC khác nhau. */
  foodSection: { gap: spacing.xs + 2 },
  /* 13pt/600 hoa nhẹ, màu mờ — đủ để chia hai danh sách, không đủ để tranh
     chỗ với tiêu đề "Thực phẩm" ở trên. */
  foodSubLabel: {
    ...type.footnote,
    fontWeight: '600',
    color: colors.mutedForeground,
    letterSpacing: 0.3,
  },
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
  planHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  /* 13, và đây là vế thứ hai của một cặp — sửa một vế mà quên vế kia là đúng
     cái đã xảy ra: 15 được chọn khi tiêu đề còn 22 (tỉ lệ 0,68), rồi tiêu đề
     hạ xuống 18 mà số này ở nguyên, thành 0,83 — gần ngang hàng tiêu đề.
     Không tìm được con số Apple công bố riêng cho "See All"; tỉ lệ đọc được
     từ giao diện là khoảng 0,7, và 0,7 của 18 rơi đúng vào 13. */
  planAll: { ...type.footnote, fontWeight: '600', color: colors.primary },
  /* Một HÀNG trong khối, không phải một thẻ. Cao 56 để vượt sàn chạm 44 và để
     hai dòng chữ có chỗ thở. */
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 56,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  planText: { flex: 1, minWidth: 0, gap: 5 },
  /* Tên co giãn để mũi tên bị đẩy ra MÉP PHẢI. Không có `flex` thì mũi tên bám
     sát cái tên, và một hàng có mũi tên ở giữa đọc ra như một phần của tên chứ
     không phải dấu hiệu "hàng này mở ra được". */
  planTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  /* Bảy cột đều nhau, cao 22 — đủ để thấy phần lấp, không đủ để tranh chỗ với
     cái tên. Khoảng cách 3 điểm: nhỏ hơn nữa thì bảy cột dính thành một dải. */
  week: { flexDirection: 'row', gap: 3, marginTop: 1 },
  weekDay: {
    flex: 1,
    height: 22,
    borderRadius: 3,
    backgroundColor: colors.accent,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  weekFill: { backgroundColor: colors.readinessGreen, borderRadius: 3 },
  planName: { flex: 1, minWidth: 0, fontSize: 15, fontWeight: '600', color: colors.foreground },
  planMeta: { fontSize: 12, color: colors.mutedForeground },
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
