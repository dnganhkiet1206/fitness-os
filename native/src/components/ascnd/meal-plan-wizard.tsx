import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Check, Plus, Search, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { PressScale } from '@/components/ascnd/press-scale';
import { FormSheet } from '@/components/ascnd/form-sheet';
import { Icon } from '@/components/ascnd/icon';
import { Segmented } from '@/components/ascnd/segmented';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import {
  useAddMealPlanItem,
  useCreateMealPlan,
  useMealPlanItems,
  useMealPlans,
} from '@/hooks/use-library';
import { dedupeSeedShadows, useMyFoods } from '@/hooks/use-nutrition';
import { supabase } from '@/integrations/supabase/client';
import { MEAL_ORDER, PLAN_DAYS } from '@/lib/planned-meal';
import { errorText } from '@/lib/error-copy';

/**
 * Making a meal plan, from nothing to food on a day, as one flow.
 *
 * ── the four decisions were four rooms ──
 *
 * Creating a plan was a form. Choosing a day was a `+` on a card. Choosing a
 * meal was a row of chips inside a sheet you had already opened. Choosing a
 * food was that sheet's list. Each was fine on its own and together they were
 * a chain you had to already know the shape of — and the one thing none of
 * them ever showed was how far along you were.
 *
 * They are four steps of one thing now, on one surface, in the order they are
 * asked, with a line across the top that says which are answered.
 *
 * ── two entrances, one flow ──
 *
 * From the Nutrition tab there is no plan yet, so it starts at step one. From
 * a day in `/meal-plans` the plan and the day are both already known, so it
 * opens on the food with three dots already filled. Same component, same
 * steps, different amount already done — which is exactly what a progress line
 * is for.
 *
 * ── the frame is shared ──
 *
 * The full-screen sheet, its close button and the pinned footer come from
 * `form-sheet`, which the exercise library's add form uses too. Two sheets that
 * merely resembled each other had different heights and different ways out;
 * one frame makes them the same thing appearing twice.
 */

const MEALS_PER_DAY = [3, 4, 5, 6];

export function MealPlanWizard({
  visible,
  planId,
  initialDay,
  onClose,
  onPlanCreated,
}: {
  visible: boolean;
  /** the plan being added to, or `null` to start by making one */
  planId: string | null;
  /** which day the flow opens on when the plan is already known */
  initialDay?: number;
  onClose: () => void;
  /** so the screen behind can open the plan that was just made */
  onPlanCreated?: (id: string) => void;
}) {
  const i18n = useI18n();
  const { user } = useAuth();

  const { data: plans } = useMealPlans();
  const createPlan = useCreateMealPlan();
  const addItem = useAddMealPlanItem();
  const { data: myFoods } = useMyFoods();

  /** the plan this flow is writing into — the one passed in, or the one it made */
  const [madeId, setMadeId] = useState<string | null>(null);
  const activeId = planId ?? madeId;
  const plan = plans?.find((p) => p.id === activeId) ?? null;

  const [name, setName] = useState('');
  const [goal, setGoal] = useState('maintain');
  const [mealsPerDay, setMealsPerDay] = useState(3);

  const [day, setDay] = useState(initialDay ?? 0);
  const [meal, setMeal] = useState<string>('breakfast');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [added, setAdded] = useState(0);

  /*
    Every opening starts clean.

    Reset when it becomes visible rather than when it closes: closing can happen
    through a back gesture or a swipe that never reaches `onClose`, and a flow
    that reopens holding the last session's day, search and count is a flow that
    lies about where you are.
  */
  useEffect(() => {
    if (!visible) return;
    setMadeId(null);
    setName('');
    setGoal('maintain');
    setMealsPerDay(3);
    setDay(initialDay ?? 0);
    setMeal('breakfast');
    setQuery('');
    setDebounced('');
    setAdded(0);
  }, [visible, initialDay]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const { data: results } = useQuery({
    /* Keyed by the account, not by the typed text alone. This select reads
       `food_items` through RLS, which returns the shared seeds *and* this
       person's own foods, and the result is written to the persisted cache —
       so an entry named only "gà" is one account's private list under a word
       the next account types on its first day. Same fix as `log-meal.tsx`. */
    queryKey: ['mealplan_food_search', user?.id, debounced],
    enabled: debounced.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('food_items')
        .select('id, user_id, name, kcal, protein_g, carbs_g, fat_g, serving_g')
        .ilike('name', `%${debounced}%`)
        .order('name')
        .limit(15);
      if (error) throw error;
      return dedupeSeedShadows(data ?? []);
    },
  });

  const { data: items } = useMealPlanItems(activeId);

  /**
   * The foods already in the day and meal being written to.
   *
   * Scoped to both, which is the only scope that is a mistake: the same chicken
   * on Monday and on Tuesday is a plan, and twice in Monday's breakfast is a
   * slip — usually a second tap on a row that gave no sign the first one landed.
   */
  const alreadyHere = useMemo(() => {
    const taken = new Set<string>();
    for (const it of items ?? []) {
      if (it.day_index === day && it.meal_type === meal) taken.add(it.food_name.trim().toLowerCase());
    }
    return taken;
  }, [items, day, meal]);

  const mealLabel = (m: string) =>
    ({
      breakfast: i18n.nBreakfast,
      lunch: i18n.nLunch,
      dinner: i18n.nDinner,
      snack: i18n.nSnack,
      preworkout: i18n.nPreWorkout,
      postworkout: i18n.nPostWorkout,
    })[m] ?? m;

  const dayLabel = (idx: number) => `${i18n.nDay} ${idx + 1}`;

  const slots = MEAL_ORDER.slice(0, Math.max(1, Math.min(MEAL_ORDER.length, plan?.meals_per_day ?? 3)));

  const submitPlan = () => {
    if (!name.trim() || createPlan.isPending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    createPlan.mutate(
      { name: name.trim(), goal, meals_per_day: mealsPerDay },
      {
        onSuccess: (row) => {
          setMadeId(row.id);
          onPlanCreated?.(row.id);
        },
        onError: (e: Error) => Alert.alert('ASCND', errorText(e, i18n)),
      },
    );
  };

  const addFood = (f: {
    id: string;
    name: string;
    kcal: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    serving_g: number;
  }) => {
    if (!activeId) return;
    addItem.mutate(
      {
        meal_plan_id: activeId,
        day_index: day,
        meal_type: meal,
        food_name: f.name,
        serving_g: Number(f.serving_g) || 100,
        kcal: Math.round(Number(f.kcal) || 0),
        protein_g: Math.round(Number(f.protein_g) || 0),
        carbs_g: Math.round(Number(f.carbs_g) || 0),
        fat_g: Math.round(Number(f.fat_g) || 0),
        food_item_id: f.id,
      },
      {
        // It stays open: adding one food to a meal is almost never the whole of
        // that meal. Only the query is cleared, so the next search starts from
        // nothing rather than from the last thing added.
        onSuccess: () => {
          setAdded((n) => n + 1);
          setQuery('');
          setDebounced('');
        },
        onError: (e: Error) => Alert.alert('ASCND', errorText(e, i18n)),
      },
    );
  };

  /*
    The four steps, and what each one currently says.

    The value rather than the label, once there is one: a step that has been
    decided has no use for the name of the question. Before it is decided the
    label is all there is, so it stands in.
  */
  const steps = [
    { key: 'plan', value: plan?.name ?? i18n.nMealPlanNew, done: !!plan },
    { key: 'day', value: dayLabel(day), done: !!plan },
    { key: 'meal', value: mealLabel(meal), done: !!plan },
    {
      key: 'food',
      value: added > 0 ? i18n.nMpAddedN.replace('{n}', String(added)) : i18n.nMpPickFood,
      done: added > 0,
    },
  ];

  /**
   * Bước đang đứng — và việc thiếu nó là lý do hàng này không nói gì ở bước một.
   *
   * Hàng chấm chỉ có hai trạng thái: `done` hoặc không. Ở bước đầu thì chưa có
   * `plan`, nên cả BỐN `done` đều false và bốn chấm xám giống hệt nhau. Một
   * thanh tiến trình chiếm bốn nhãn cùng một dải chiều cao rồi không trả lời
   * được câu hỏi duy nhất nó sinh ra để trả lời: tôi đang ở đâu.
   *
   * Bước đang đứng là bước ĐẦU TIÊN chưa xong — không cần một biến trạng thái
   * thứ hai, và vì thế nó không thể lệch với các dấu `done`.
   */
  const current = steps.findIndex((st) => !st.done);

  return (
    <FormSheet
      visible={visible}
      title={plan ? i18n.nMpAddTitle : i18n.nutritionCreatePlan}
      onClose={onClose}
      belowHeader={
        /*
          The progress line.

          Four dots and the rails between them, filling left to right. A rail is
          drawn by the dot it leads into, so the row cannot end on a stub, and
          the first and last keep a transparent one so every dot sits at the
          same place in its column and the row does not lean.
        */
        <View style={styles.steps}>
          {steps.map((st, i) => (
            <View key={st.key} style={styles.step}>
              <View style={styles.stepTop}>
                <View style={[styles.rail, i === 0 && styles.railClear, steps[i - 1]?.done && styles.railOn]} />
                <View style={[styles.dot, i === current && styles.dotNow, st.done && styles.dotOn]}>
                  {st.done ? <Icon icon={Check} size={10} color={colors.primaryForeground} strokeWidth={3} /> : null}
                </View>
                <View
                  style={[styles.rail, i === steps.length - 1 && styles.railClear, st.done && styles.railOn]}
                />
              </View>
              <Text
                style={[styles.stepValue, (st.done || i === current) && styles.stepValueOn]}
                numberOfLines={1}>
                {st.value}
              </Text>
            </View>
          ))}
        </View>
      }
      footer={
        /*
          One button, and it says what pressing it does next.

          While there is no plan it makes the plan and the flow carries on into
          the same screen — which is the whole point of merging these: creating
          a plan and putting the first food in it were never two errands.
        */
        <PressScale
          accessibilityRole="button"
          accessibilityState={{ disabled: !plan && (!name.trim() || createPlan.isPending) }}
          disabled={!plan && (!name.trim() || createPlan.isPending)}
          onPress={() => {
            if (plan) {
              Haptics.selectionAsync();
              onClose();
            } else {
              submitPlan();
            }
          }}
          style={[styles.primary, !plan && (!name.trim() || createPlan.isPending) && styles.primaryOff]}>
          {createPlan.isPending ? (
            <ActivityIndicator color={colors.primaryForeground} size="small" />
          ) : (
            <Text style={styles.primaryText}>
              {!plan
                ? i18n.nMpNextAddFood
                : added > 0
                  ? `${i18n.nMpDone}  ·  ${i18n.nMpAddedN.replace('{n}', String(added))}`
                  : i18n.nMpDone}
            </Text>
          )}
        </PressScale>
      }>
      {!plan ? (
            <>
              {/*
                Ba mục, mỗi mục một KHỐI — kiểu "inset grouped" của iOS.

                Trước đây cả ba trôi trên nền đen phẳng: nhãn đậm, rồi nội dung,
                rồi nhãn đậm nữa. Không có gì khoanh vùng câu hỏi nào thuộc về
                đâu, nên màn hình đọc ra như một biểu mẫu web chứ không phải một
                tấm của iOS. Đây là idiom mà Cài đặt, Sức khoẻ và mọi biểu mẫu
                hệ thống đều dùng: tiêu đề NHỎ, chữ hoa, màu phụ, đặt trên một
                khối bo góc chứa câu trả lời.
              */}
              <Field label={i18n.nutritionPlanName} hint={i18n.nMpStepPlanHint}>
                <TextInput
                  style={styles.input}
                  placeholder={i18n.nMpPlanNameEg}
                  placeholderTextColor={colors.mutedForeground}
                  value={name}
                  onChangeText={setName}
                  returnKeyType="done"
                  onSubmitEditing={submitPlan}
                />
              </Field>

              {/*
                `Segmented` chứ không phải chip rời, và đây là thứ app ĐÃ CÓ.

                Ba lựa chọn loại trừ nhau là định nghĩa của một segmented
                control; chip rời là thứ dùng cho lựa chọn nhiều-chọn hoặc cho
                một danh sách dài. Đọc ra khác nhau: một khối liền nói "chọn một
                trong đây", ba viên rời nói "bật/tắt từng cái".

                Nó cũng mặc định cao 44 — đúng sàn của Apple — trong khi chip tự
                dựng ở đây cao 31 cộng `hitSlop` 6+6, tức 43: thiếu ĐÚNG một
                điểm, kiểu thiếu mà không ai nhìn ra được bằng mắt.
              */}
              <Field label={i18n.settingsGoal}>
                <Segmented
                  value={goal}
                  onChange={(k) => {
                    Haptics.selectionAsync();
                    setGoal(k);
                  }}
                  options={[
                    { key: 'bulk' as const, label: i18n.goalBulk },
                    { key: 'cut' as const, label: i18n.goalCut },
                    { key: 'maintain' as const, label: i18n.goalMaintain },
                  ]}
                />
              </Field>

              <Field label={i18n.nutritionMealsPerDay} hint={i18n.nMpStepSlotsHint}>
                <Segmented
                  value={String(mealsPerDay)}
                  onChange={(k) => {
                    Haptics.selectionAsync();
                    setMealsPerDay(Number(k));
                  }}
                  options={MEALS_PER_DAY.map((n) => ({ key: String(n), label: String(n) }))}
                />
              </Field>
            </>
          ) : (
            <>
              <Text style={styles.stepHead}>{i18n.nMpStepDay}</Text>
              <Text style={styles.stepHint}>{i18n.nMpStepDayHint}</Text>
              <View style={styles.chipRow}>
                {PLAN_DAYS.map((d) => (
                  <Chip
                    key={d}
                    label={dayLabel(d)}
                    on={day === d}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setDay(d);
                    }}
                  />
                ))}
              </View>

              <Text style={styles.stepHead}>{i18n.nMpStepMeal}</Text>
              <Text style={styles.stepHint}>{i18n.nMpStepMealHint}</Text>
              <View style={styles.chipRow}>
                {slots.map((m) => (
                  <Chip
                    key={m}
                    label={mealLabel(m)}
                    on={meal === m}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setMeal(m);
                    }}
                  />
                ))}
              </View>

              <Text style={styles.stepHead}>{i18n.nMpStepFood}</Text>
              <Text style={styles.stepHint}>{i18n.nMpStepFoodHint}</Text>
              <View style={styles.searchWrap}>
                <Icon icon={Search} size={14} color={colors.mutedForeground} />
                <TextInput
                  style={styles.searchInput}
                  placeholder={i18n.nutritionSearchFood}
                  placeholderTextColor={colors.mutedForeground}
                  value={query}
                  onChangeText={setQuery}
                  autoCorrect={false}
                  returnKeyType="search"
                />
                {query.length > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={i18n.a11yClearSearch}
                    hitSlop={10}
                    onPress={() => setQuery('')}>
                    <Icon icon={X} size={14} color={colors.mutedForeground} />
                  </Pressable>
                ) : null}
              </View>

              {/*
                Plain views, not a second scroll view. The page scrolls as one
                thing; a list that scrolls inside a page that scrolls is the
                arrangement where neither responds to the flick you made.
              */}
              <View style={styles.results}>
                {debounced.length >= 2 ? (
                  (results ?? []).length > 0 ? (
                    (results ?? []).map((f) => (
                      <FoodRow
                        key={f.id}
                        name={f.name}
                        kcal={Number(f.kcal)}
                        added={alreadyHere.has(f.name.trim().toLowerCase())}
                        i18n={i18n}
                        onAdd={() => addFood(f)}
                      />
                    ))
                  ) : (
                    <Text style={styles.empty}>{i18n.nMpNoMatch.replace('{x}', debounced)}</Text>
                  )
                ) : myFoods && myFoods.length > 0 ? (
                  <>
                    <Text style={styles.pickLabel}>{i18n.nMpFromList}</Text>
                    {myFoods.map((f) => (
                      <FoodRow
                        key={f.id}
                        name={f.name}
                        kcal={Number(f.kcal)}
                        added={alreadyHere.has(f.name.trim().toLowerCase())}
                        i18n={i18n}
                        onAdd={() => addFood({ ...f, serving_g: Number(f.serving_g) || 100 })}
                      />
                    ))}
                  </>
                ) : null}
              </View>
            </>
          )}
    </FormSheet>
  );
}

/**
 * Một câu hỏi và câu trả lời của nó, đóng thành một khối.
 *
 * Kiểu "inset grouped" của iOS: tiêu đề NHỎ, chữ hoa, màu phụ, đặt TRÊN một
 * khối bo góc chứa nội dung. Nó khoanh vùng câu hỏi nào thuộc về đâu — thứ mà
 * một dãy nhãn đậm trôi trên nền phẳng không làm được, và là lý do màn hình cũ
 * đọc ra như biểu mẫu web.
 *
 * Câu gợi ý nằm TRONG khối, ngay trên câu trả lời, chứ không nằm dưới tiêu đề:
 * nó giải thích câu trả lời chứ không giải thích cái tên.
 */
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label.toUpperCase()}</Text>
      <View style={styles.fieldBox}>
        {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
        {children}
      </View>
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      hitSlop={{ top: 6, bottom: 6 }}
      style={[styles.chip, on && styles.chipOn]}
      onPress={onPress}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

/**
 * One choosable food.
 *
 * A food already in this meal stays on the list and stops being a button: it
 * dims, its plus becomes a tick, and it says so. Removing it instead would be
 * worse — the row you just tapped would vanish, which reads as a mis-tap.
 */
function FoodRow({
  name,
  kcal,
  added,
  i18n,
  onAdd,
}: {
  name: string;
  kcal: number;
  added: boolean;
  i18n: ReturnType<typeof useI18n>;
  onAdd: () => void;
}) {
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityState={{ disabled: added }}
      accessibilityLabel={added ? `${name}, ${i18n.nMpAlready}` : `${name}, ${Math.round(kcal)} kcal`}
      disabled={added}
      style={[styles.row, added && styles.rowAdded]}
      onPress={onAdd}>
      <Text style={styles.rowName} numberOfLines={1}>{name}</Text>
      <Text style={styles.rowKcal}>{added ? i18n.nMpAlready : `${Math.round(kcal)} kcal`}</Text>
      <Icon
        icon={added ? Check : Plus}
        size={14}
        color={added ? colors.readinessGreen : colors.primary}
        strokeWidth={2.5}
      />
    </PressScale>
  );
}

const styles = StyleSheet.create({
  steps: {
    flexDirection: 'row',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  step: { flex: 1, alignItems: 'center', gap: 6 },
  stepTop: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.secondary,
  },
  dotOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  /* Viền chứ không phải nền: bước ĐANG đứng chưa xong, nên nó không được trông
     giống một bước đã xong. Một vòng sáng đọc ra là "ở đây", một khối đặc đọc ra
     là "rồi". */
  dotNow: { borderColor: colors.primary, borderWidth: 2.5 },
  rail: { flex: 1, height: 2, backgroundColor: colors.border },
  railOn: { backgroundColor: colors.primary },
  railClear: { backgroundColor: 'transparent' },
  stepValue: { ...type.caption, color: colors.mutedForeground },
  stepValueOn: { color: colors.foreground, fontWeight: '600' },

  /* The question, then what it means. A row of chips is only obviously a
     control once you know what it is choosing between. */
  stepHead: { ...type.footnote, color: colors.foreground, fontWeight: '700', marginTop: spacing.sm },

  field: { gap: 7 },
  /* Nhỏ, hoa, giãn chữ, màu phụ — cùng cách `MicroTitle` viết tiêu đề mục ở
     phần còn lại của app, nên tấm này không mang một giọng riêng. */
  fieldLabel: {
    ...type.caption,
    color: colors.mutedForeground,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginLeft: 2,
  },
  /*
    KHÔNG có nền, và bản đầu có — đó là một tầng thừa tôi tự thêm rồi tự thấy.

    Dựng ra xem thì ô nhập và đường ray của segmented BIẾN MẤT: cả hai đều tô
    `colors.secondary`, và tôi vừa cho hộp bọc đúng màu đó. Cùng màu trên cùng
    màu là không có gì.

    Sửa đúng không phải đổi màu hộp mà là bỏ hộp. Trong biểu mẫu của iOS, một
    segmented control TỰ NÓ là bề mặt của mục — không ai bọc thêm một khung
    quanh nó. Thứ tạo ra cảm giác "inset grouped" là cái NHÃN nhỏ chữ hoa màu
    phụ đặt trên, cộng khoảng thở giữa các mục; không phải một đường viền nữa.
  */
  fieldBox: { gap: spacing.sm },
  fieldHint: { ...type.caption, color: colors.mutedForeground },
  stepHint: { ...type.caption, color: colors.mutedForeground, marginBottom: 2 },

  input: {
    height: 46,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.secondary,
    color: colors.foreground,
    fontSize: 15,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
  },
  chipOn: { backgroundColor: colors.primary },
  chipText: { ...type.footnote, color: colors.foreground },
  chipTextOn: { color: colors.primaryForeground, fontWeight: '700' },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.secondary,
  },
  searchInput: { flex: 1, color: colors.foreground, fontSize: 15 },
  results: { gap: spacing.sm, paddingTop: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  rowAdded: { opacity: 0.55 },
  rowName: { ...type.body, color: colors.foreground, flex: 1 },
  rowKcal: { ...type.caption, color: colors.mutedForeground },
  pickLabel: { ...type.caption, color: colors.mutedForeground },
  empty: { ...type.footnote, color: colors.mutedForeground, textAlign: 'center', paddingVertical: spacing.md },

  primary: {
    height: 50,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  primaryOff: { opacity: 0.4 },
  primaryText: { ...type.body, color: colors.primaryForeground, fontWeight: '700' },
});
