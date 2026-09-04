import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { nav } from '@/lib/nav';
import { Camera, Check, ChevronDown, ChevronRight, Clock, Minus, PencilLine, Plus, ScanBarcode, Sparkles, Star, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { PickRow } from '@/components/ascnd/pick-row';
import { PressScale } from '@/components/ascnd/press-scale';
import { Icon } from '@/components/ascnd/icon';
import { SheetHeader } from '@/components/ascnd/sheet-header';
import { radius, spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import {
  dedupeSeedShadows,
  useFavoriteFoods,
  useRecentFoods,
  useRecentMeals,
  type RecentMeal,
} from '@/hooks/use-nutrition';
import { useInvalidateToday } from '@/hooks/useTodayData';
import { supabase } from '@/integrations/supabase/client';
import { offlineNow } from '@/lib/offline';
import { OFFLINE_WRITE_KEY, type OfflineWrite } from '@/lib/offline-write';
import { outOfRangeMessage } from '@/lib/plausible';
import { toast } from '@/lib/toast';
import { AI_FAILURE_KEY, callEdge, EDGE_FUNCTIONS } from '@/lib/edge';
import { recomputeDailyLog } from '@/lib/daily-log-service';
import { localDateStr } from '@/lib/local-date';
import { consumePendingScan } from '@/lib/scan-bridge';
import { intText } from '@/lib/number-input';

const MEAL_KEYS = ['breakfast', 'lunch', 'dinner', 'snack', 'preworkout', 'postworkout'] as const;
type MealType = (typeof MEAL_KEYS)[number];

interface MealItem {
  food_item_id: string | null;
  food_name: string;
  servings: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  serving_g: number;
}

interface AiSuggestion {
  name: string;
  description: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  ingredients: string[];
  prep_time_min: number;
}

export default function LogMealSheet() {
  const c = usePalette();
  const styles = stylesFor(c);
  const { user } = useAuth();
  const { lang } = useAppSettings();
  const invalidate = useInvalidateToday();
  const queryClient = useQueryClient();
  const i18n = useI18n();

  const MEAL_TYPES = [
    { key: 'breakfast', label: i18n.nBreakfast },
    { key: 'lunch', label: i18n.nLunch },
    { key: 'dinner', label: i18n.nDinner },
    { key: 'snack', label: i18n.nSnack },
    { key: 'preworkout', label: i18n.nPreWorkout },
    { key: 'postworkout', label: i18n.nPostWorkout },
  ] as const;

  const vi = lang === 'vi';
  const [mealType, setMealType] = useState<MealType>('lunch');
  const [items, setItems] = useState<MealItem[]>([]);
  const [search, setSearch] = useState('');
  /*
    ── the "Find a food" tile lands here, and it lands *in the box* ──

    That tile used to open `/food-list`, which is the food **library** — filter
    the list, edit a food's nutrition, save a recent one. Nothing on that screen
    logs a meal, so one of the four ways to log a meal logged nothing.

    It opens this sheet now, and `focus=search` puts the cursor straight in the
    search field. Without that the tile would be one tap better than it was and
    still leave somebody looking for where the searching happens on a screen
    that also offers a camera, a barcode, quick-adds and a custom-food form.

    Read once into a `useState` initialiser rather than watched: this decides
    where the keyboard goes on arrival. Re-reading it on later renders would
    yank focus back into the search box while somebody is typing a dish name
    into the custom form below.
  */
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const [focusSearch] = useState(() => focus === 'search');
  const [debounced, setDebounced] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([]);

  // Custom food entry — user types their own dish + macros
  const [customOpen, setCustomOpen] = useState(false);
  const [cName, setCName] = useState('');
  const [cKcal, setCKcal] = useState('');
  const [cProtein, setCProtein] = useState('');
  const [cCarbs, setCCarbs] = useState('');
  const [cFat, setCFat] = useState('');

  // Per-item macro editing (draft applied on Done)
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState({ kcal: '', protein: '', carbs: '', fat: '' });

  const { data: favorites } = useFavoriteFoods();
  const { data: recents } = useRecentFoods();
  const { data: recentMeals } = useRecentMeals();

  /**
   * Eat a past meal again: put it in the form, do not save it.
   *
   * Filling rather than writing is the whole difference between a shortcut and
   * a guess. Nine times out of ten it is exactly right and the next tap is
   * Save; the tenth time the milk was a splash instead of a glass, and the
   * amounts are sitting there to be corrected. A button that logged straight to
   * the diary would be faster and would make that tenth case a thing you have
   * to go and undo.
   *
   * It replaces what is in the form rather than appending, because the form is
   * empty when this is offered — see where it is rendered.
   */
  const repeatMeal = (meal: RecentMeal) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMealType(meal.meal_type as MealType);
    setItems(meal.foods.map((f) => ({ ...f })));
  };

  /** the localized name of a meal type, from the list the chips are built from */
  const mealLabel = (key: string) => MEAL_TYPES.find((m) => m.key === key)?.label ?? key;

  /** "today" / "yesterday" / "3 days ago", from local dates rather than hours */
  const whenLabel = (iso: string) => {
    const days = Math.round(
      (new Date(localDateStr()).getTime() - new Date(localDateStr(new Date(iso))).getTime()) /
        86400000,
    );
    if (days <= 0) return i18n.nRmToday;
    if (days === 1) return i18n.nRmYesterday;
    return i18n.nRmDaysAgo.replace('{n}', String(days));
  };

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const addItem = useCallback((it: Omit<MealItem, 'servings'> & { servings?: number }) => {
    setItems((prev) => [...prev, { servings: 1, ...it }]);
  }, []);

  // Scanner screens (barcode + AI photo) hand results back through the bridge
  useFocusEffect(
    useCallback(() => {
      const scanned = consumePendingScan();
      if (scanned && scanned.length > 0) {
        setItems((prev) => [
          ...prev,
          ...scanned.map((s) => ({
            food_item_id: null,
            food_name: s.food_name,
            servings: 1,
            kcal: s.kcal,
            protein_g: s.protein_g,
            carbs_g: s.carbs_g,
            fat_g: s.fat_g,
            fiber_g: s.fiber_g,
            serving_g: s.serving_g,
          })),
        ]);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }, []),
  );

  const { data: foods } = useQuery({
    /* The account is part of the key, not decoration. `food_items` is read
       through RLS — `user_id IS NULL OR auth.uid() = user_id` — so this result
       is the shared seed list *plus this person's own foods*, and the cache it
       lands in is written to disk. Keyed by the search text alone, the entry
       "gà" holds one account's private foods under a name the next account
       types on its first day. */
    queryKey: ['food_items_search', user?.id, debounced],
    enabled: debounced.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('food_items')
        .select('id, user_id, name, brand, kcal, protein_g, carbs_g, fat_g, fiber_g, serving_g')
        .ilike('name', `%${debounced}%`)
        .order('name')
        .limit(8);
      if (error) throw error;
      return dedupeSeedShadows(data ?? []);
    },
  });

  const pickFood = (f: NonNullable<typeof foods>[number]) => {
    Haptics.selectionAsync();
    addItem({
      food_item_id: f.id,
      food_name: f.name,
      kcal: Math.round(Number(f.kcal)),
      protein_g: Math.round(Number(f.protein_g)),
      carbs_g: Math.round(Number(f.carbs_g)),
      fat_g: Math.round(Number(f.fat_g)),
      fiber_g: Math.round(Number(f.fiber_g || 0)),
      serving_g: Math.round(Number(f.serving_g || 0)),
    });
    setSearch('');
  };

  const updateServings = (idx: number, delta: number) => {
    Haptics.selectionAsync();
    setItems((prev) =>
      prev.map((it, i) =>
        i === idx ? { ...it, servings: Math.max(0.5, Math.round((it.servings + delta) * 2) / 2) } : it,
      ),
    );
  };

  const removeItem = (idx: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setItems((prev) => prev.filter((_, i) => i !== idx));
    setEditingIdx(null);
  };

  const num = (v: string) => Number(v) || 0;

  /*
    ── one mistyped food item moves several numbers ──

    A custom item's kcal and macros were `Number(v) || 0` and nothing more, so
    50000 for a bowl of rice went in without comment. That does not stop at the
    day's total: `daily_logs.kcal` is what `adaptiveTDEE` averages over fourteen
    days to measure somebody's expenditure, and that measurement now sets a
    suggested calorie target. A slipped zero in a food entry therefore comes
    back days later as a diet.

    The bounds are per item, not per day — somebody eating 6,000 kcal across a
    day is having a day, but 10,000 kcal in one line is a typo.
  */
  const customErrors = {
    kcal: outOfRangeMessage('meal_kcal', cKcal, i18n.outOfRange),
    protein: outOfRangeMessage('macro_g', cProtein, i18n.outOfRange),
    carbs: outOfRangeMessage('macro_g', cCarbs, i18n.outOfRange),
    fat: outOfRangeMessage('macro_g', cFat, i18n.outOfRange),
  };
  const customBad = Object.values(customErrors).some(Boolean);

  /*
    ── the same numbers, edited instead of added ──

    `customErrors` above guards the *add* form and has since the day the bounds
    were written. The per-item **edit** panel writes to the same four fields,
    through `applyEdit`, and checked nothing at all: add a food normally, tap
    its row, type 50000 into kcal, press Done — saved.

    That defeats the exact protection the comment above describes, and by the
    same route: `daily_logs.kcal` is what `adaptiveTDEE` regresses over fourteen
    days to suggest a calorie target, so one edited line comes back days later
    as a diet.

    One rule, two forms, and only one of them had it. Same shape as the workout
    sheet's missing bound, and the same fix — the rule computed once, read by
    both.
  */
  const draftErrors = {
    kcal: outOfRangeMessage('meal_kcal', draft.kcal, i18n.outOfRange),
    protein: outOfRangeMessage('macro_g', draft.protein, i18n.outOfRange),
    carbs: outOfRangeMessage('macro_g', draft.carbs, i18n.outOfRange),
    fat: outOfRangeMessage('macro_g', draft.fat, i18n.outOfRange),
  };
  const draftBad = Object.values(draftErrors).some(Boolean);

  const canAddCustom =
    cName.trim().length > 0 &&
    !customBad &&
    (num(cKcal) > 0 || num(cProtein) + num(cCarbs) + num(cFat) > 0);

  const addCustom = () => {
    if (!canAddCustom) return;
    Haptics.selectionAsync();
    const kcalVal = num(cKcal) > 0 ? num(cKcal) : Math.round(num(cProtein) * 4 + num(cCarbs) * 4 + num(cFat) * 9);
    addItem({
      food_item_id: null,
      food_name: cName.trim(),
      kcal: kcalVal,
      protein_g: num(cProtein),
      carbs_g: num(cCarbs),
      fat_g: num(cFat),
      fiber_g: 0,
      serving_g: 0,
    });
    setCName('');
    setCKcal('');
    setCProtein('');
    setCCarbs('');
    setCFat('');
  };

  const openEdit = (idx: number) => {
    Haptics.selectionAsync();
    if (editingIdx === idx) {
      setEditingIdx(null);
      return;
    }
    const it = items[idx];
    setDraft({
      kcal: String(it.kcal || ''),
      protein: String(it.protein_g || ''),
      carbs: String(it.carbs_g || ''),
      fat: String(it.fat_g || ''),
    });
    setEditingIdx(idx);
  };

  const applyEdit = () => {
    if (editingIdx == null || draftBad) return;
    Haptics.selectionAsync();
    setItems((prev) =>
      prev.map((it, i) =>
        i === editingIdx
          ? { ...it, kcal: num(draft.kcal), protein_g: num(draft.protein), carbs_g: num(draft.carbs), fat_g: num(draft.fat) }
          : it,
      ),
    );
    setEditingIdx(null);
  };

  const totals = items.reduce(
    (acc, it) => ({
      kcal: acc.kcal + it.kcal * it.servings,
      protein_g: acc.protein_g + it.protein_g * it.servings,
      carbs_g: acc.carbs_g + it.carbs_g * it.servings,
      fat_g: acc.fat_g + it.fat_g * it.servings,
      fiber_g: acc.fiber_g + it.fiber_g * it.servings,
    }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 },
  );
  const macroG = totals.protein_g + totals.carbs_g + totals.fat_g;
  const proteinPct = macroG > 0 ? (totals.protein_g / macroG) * 100 : 0;
  const carbsPct = macroG > 0 ? (totals.carbs_g / macroG) * 100 : 0;
  const fatPct = macroG > 0 ? (totals.fat_g / macroG) * 100 : 0;

  const aiSuggest = useMutation({
    mutationFn: async () => {
      const res = await callEdge<{ suggestions?: AiSuggestion[] }>(EDGE_FUNCTIONS.mealSuggest, {
        meal_type: mealType,
        /* The other caller of this function already sends it. Without it the
           edge function falls back to its own UTC clock, which is yesterday for
           anybody east of Greenwich during their morning. The same was true of
           the hour it fits suggestions to, hence `tzOffset`. */
        date: localDateStr(),
        tzOffset: new Date().getTimezoneOffset(),
      });
      if (!res.ok) throw new Error(i18n[AI_FAILURE_KEY[res.failure]]);
      return res.data?.suggestions ?? [];
    },
    onSuccess: (s) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSuggestions(s);
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setSuggestions([]);
    },
  });

  const openAi = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAiOpen((v) => {
      const next = !v;
      if (next && suggestions.length === 0 && !aiSuggest.isPending) aiSuggest.mutate();
      return next;
    });
  };

  const addSuggestion = (s: AiSuggestion) => {
    Haptics.selectionAsync();
    addItem({
      food_item_id: null,
      food_name: s.name,
      kcal: Math.round(s.kcal),
      protein_g: Math.round(s.protein_g),
      carbs_g: Math.round(s.carbs_g),
      fat_g: Math.round(s.fat_g),
      fiber_g: 0,
      serving_g: 0,
    });
  };

  /*
    Saving a meal survives a kitchen with no signal.

    ── why this is the one that mattered most ──

    Logging food is the most repeated action in the app and kitchens are where
    signal is worst. Before this, an offline save failed outright: an error
    toast, and a sheet full of items the person had just spent a minute
    assembling, gone the moment they backed out.

    ── no `mutationFn` here, on purpose ──

    The key is what makes it durable. React Query pauses a mutation it cannot
    send and writes the *variables* to storage; on the next launch it needs a
    `mutationFn` to hand them back to, and functions do not serialise. Declaring
    one locally would work today and quietly stop working after a restart,
    because what comes back from storage is the default registered in
    `offline-write`, not this closure. See `registerOfflineWrites`.
  */
  const save = useMutation<void, Error, OfflineWrite>({
    mutationKey: [...OFFLINE_WRITE_KEY],
    /*
      ── closing the sheet cannot wait for the network ──

      A paused mutation never calls `onSuccess`. Leaving the confirmation there
      means that offline the button spins, the sheet stays open, and nothing
      ever happens — which is a worse failure than the error toast this
      replaced, because it does not even say anything.

      So offline the sheet closes here and says so. That is not an optimistic
      guess: the write is in the persisted queue and will send itself. Online,
      nothing changes — the real confirmation still comes from `onSuccess`,
      where it can still report a genuine failure.
    */
    onMutate: () => {
      if (!offlineNow()) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      nav.back();
      toast.success(i18n.logMealQueued);
    },
    onSuccess: () => {
      invalidate();
      // Just-logged foods should surface in the Nutrition tab's recent list
      queryClient.invalidateQueries({ queryKey: ['recent_foods', user?.id] });
      if (offlineNow()) return; // already acknowledged in onMutate
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      nav.back();
      toast.success(i18n.logMealSaved);
    },
    onError: (e: Error) => {
      if (e.message !== 'No items') toast.fail(e);
    },
  });

  /*
    The call site still says `save()`.

    The variables have to be a plain serialisable object — that is the whole
    point, since they are what a future process reads back having forgotten this
    screen, this user and this meal. `entryId` is minted here rather than read
    back from the insert: offline there is no insert to read from, and a
    client-side id makes the two-statement write idempotent by primary key.
  */
  const submit = () => {
    if (!user || items.length === 0) return;
    save.mutate({
      kind: 'meal',
      userId: user.id,
      entryId: Crypto.randomUUID(),
      dateTime: new Date().toISOString(),
      mealType,
      totals: {
        kcal: Math.round(totals.kcal),
        protein_g: Math.round(totals.protein_g),
        carbs_g: Math.round(totals.carbs_g),
        fat_g: Math.round(totals.fat_g),
        fiber_g: Math.round(totals.fiber_g),
      },
      items: items.map((it) => ({
        /* One key per food, for the same reason `entryId` has one. */
        id: Crypto.randomUUID(),
        food_item_id: it.food_item_id,
        food_name: it.food_name,
        servings: it.servings,
        kcal: Math.round(it.kcal * it.servings),
        protein_g: Math.round(it.protein_g * it.servings),
        carbs_g: Math.round(it.carbs_g * it.servings),
        fat_g: Math.round(it.fat_g * it.servings),
        fiber_g: Math.round(it.fiber_g * it.servings),
      })),
    } satisfies OfflineWrite);
  };

  // Stays disabled after success so the closing sheet can't double-submit
  const canSave = items.length > 0 && !save.isPending && !save.isSuccess;
  const quickAdds = [
    ...(favorites ?? []).map((f) => ({
      key: `fav-${f.id}`,
      food_item_id: f.id,
      food_name: f.name,
      kcal: Math.round(Number(f.kcal)),
      protein_g: Math.round(Number(f.protein_g)),
      carbs_g: Math.round(Number(f.carbs_g)),
      fat_g: Math.round(Number(f.fat_g)),
      fiber_g: Math.round(Number(f.fiber_g || 0)),
      serving_g: Math.round(Number(f.serving_g || 0)),
      fav: true,
    })),
    ...(recents ?? []).map((r, i) => ({
      key: `rec-${i}`,
      food_item_id: r.food_item_id,
      food_name: r.food_name,
      kcal: r.kcal,
      protein_g: r.protein_g,
      carbs_g: r.carbs_g,
      fat_g: r.fat_g,
      fiber_g: r.fiber_g,
      serving_g: r.serving_g,
      fav: false,
    })),
  ].slice(0, 14);

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SheetHeader title={i18n.nLogMealTitle} onClose={nav.back} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* Meal type */}
        <PickRow
          scroll
          value={mealType}
          fill={c.primary}
          slotFill={c.secondary}
          radius={radius.full}
          gap={spacing.sm}
          contentStyle={styles.chips}>
          {MEAL_TYPES.map(({ key, label }) => (
            <PickRow.Item
              key={key}
              itemKey={key}
              accessibilityLabel={label}
              onPress={() => {
                Haptics.selectionAsync();
                setMealType(key);
              }}
              style={styles.chip}>
              <Text style={[styles.chipText, mealType === key && styles.chipTextActive]}>{label}</Text>
            </PickRow.Item>
          ))}
        </PickRow>

        {/*
          Meals you have already eaten.

          Offered only while the form is empty. Once there is something in it
          you are mid-compose, and a card that replaces the lot with a different
          meal is a control that destroys work — the shortcut belongs at the
          start of the job, not in the middle of it.
        */}
        {items.length === 0 && recentMeals && recentMeals.length > 0 ? (
          <View style={styles.repeatBlock}>
            <Text style={styles.repeatTitle}>{i18n.nRmTitle}</Text>
            <Text style={styles.repeatHint}>{i18n.nRmHint}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.repeatRow}
              keyboardShouldPersistTaps="handled">
              {recentMeals.map((m) => (
                <PressScale
                  key={m.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${mealLabel(m.meal_type)}, ${whenLabel(m.date_time)}, ${m.kcal} kcal`}
                  style={styles.repeatCard}
                  onPress={() => repeatMeal(m)}>
                  <View style={styles.repeatHead}>
                    <Text style={styles.repeatMeal}>{mealLabel(m.meal_type)}</Text>
                    <Text style={styles.repeatWhen}>{whenLabel(m.date_time)}</Text>
                  </View>
                  {/* The foods themselves, because "3 foods · 420 kcal" is true
                      of most breakfasts anybody has ever eaten. What tells them
                      apart is which three. */}
                  <Text style={styles.repeatFoods} numberOfLines={2}>
                    {m.foods.map((f) => f.food_name).join(', ')}
                  </Text>
                  <Text style={styles.repeatKcal}>
                    {m.kcal.toLocaleString()} kcal · {i18n.nRmFoods.replace('{n}', String(m.foods.length))}
                  </Text>
                </PressScale>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* Search + scan buttons */}
        <View style={styles.searchRow}>
          <TextInput
            style={[styles.input, styles.searchInput]}
            placeholder={i18n.nSearchFoods}
            placeholderTextColor={c.mutedForeground}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            autoFocus={focusSearch}
          />
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={i18n.a11yScanFood}
            style={styles.iconBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              nav.push('/scan-food');
            }}>
            <Icon icon={Camera} size={20} color={c.foreground} />
          </PressScale>
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={i18n.a11yScanBarcode}
            style={styles.iconBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              nav.push('/scan-barcode');
            }}>
            <Icon icon={ScanBarcode} size={20} color={c.foreground} />
          </PressScale>
        </View>

        {foods && foods.length > 0 && (
          <View style={styles.results}>
            {foods.map((f) => (
              <Pressable key={f.id} style={styles.resultRow} onPress={() => pickFood(f)}>
                <View style={styles.resultInfo}>
                  <Text style={styles.resultName} numberOfLines={1}>{f.name}</Text>
                  {f.brand ? <Text style={styles.resultBrand} numberOfLines={1}>{f.brand}</Text> : null}
                </View>
                <Text style={styles.resultKcal}>{Math.round(Number(f.kcal))} kcal</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Favorites / recent quick-add */}
        {search.length === 0 && quickAdds.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRow}>
            {quickAdds.map((q) => (
              <PressScale
                key={q.key}
                style={styles.quickChip}
                onPress={() => {
                  Haptics.selectionAsync();
                  addItem(q);
                }}>
                <Icon icon={q.fav ? Star : Clock} size={12} color={c.primary} />
                <Text style={styles.quickName} numberOfLines={1}>{q.food_name}</Text>
                <Text style={styles.quickKcal}>{q.kcal}</Text>
              </PressScale>
            ))}
          </ScrollView>
        )}

        {/* AI suggest */}
        <PressScale
          style={[styles.aiToggle, aiOpen && styles.aiToggleActive]}
          onPress={openAi}>
          <Icon icon={Sparkles} size={18} />
          <View style={styles.aiToggleInfo}>
            <Text style={styles.aiToggleTitle}>{i18n.nAiSuggestTitle}</Text>
            <Text style={styles.aiToggleHint}>{i18n.nAiSuggestHint}</Text>
          </View>
          <Icon icon={aiOpen ? ChevronDown : ChevronRight} size={20} color={c.mutedForeground} />
        </PressScale>

        {aiOpen && (
          <View style={styles.aiPanel}>
            {aiSuggest.isPending ? (
              <View style={styles.aiLoading}>
                <ActivityIndicator color={c.primary} />
                <Text style={styles.aiLoadingText}>{i18n.nAiThinking}</Text>
              </View>
            ) : suggestions.length === 0 ? (
              <Text style={styles.aiEmpty}>{i18n.nAiNoIdeas}</Text>
            ) : (
              suggestions.map((s, i) => (
                <View key={i} style={styles.suggestion}>
                  <View style={styles.suggestionInfo}>
                    <Text style={styles.suggestionName}>{s.name}</Text>
                    <Text style={styles.suggestionDesc} numberOfLines={2}>{s.description}</Text>
                    <Text style={styles.suggestionMacros}>
                      {Math.round(s.kcal)} kcal · P{Math.round(s.protein_g)} · C{Math.round(s.carbs_g)} · F{Math.round(s.fat_g)} · {i18n.nPrepTime.replace('{n}', String(s.prep_time_min))}
                    </Text>
                  </View>
                  <PressScale
                    accessibilityRole="button"
                    accessibilityLabel={i18n.a11yAdd}
                    // 40pt drawn; 2 of slop reaches 44
                    hitSlop={2}
                    style={styles.addChip}
                    onPress={() => addSuggestion(s)}>
                    <Icon icon={Plus} size={20} color={c.primaryForeground} strokeWidth={2.5} />
                  </PressScale>
                </View>
              ))
            )}
          </View>
        )}

        {/* Custom food entry — type your own dish + macros */}
        <PressScale
          style={[styles.aiToggle, customOpen && styles.aiToggleActive]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setCustomOpen((v) => !v);
          }}>
          <Icon icon={PencilLine} size={18} color={c.primary} />
          <View style={styles.aiToggleInfo}>
            <Text style={styles.aiToggleTitle}>{vi ? 'Tự nhập món ăn' : 'Custom food'}</Text>
            <Text style={styles.aiToggleHint}>
              {vi ? 'Nhập tên món và macro của riêng bạn' : 'Type your own dish with its macros'}
            </Text>
          </View>
          <Icon icon={customOpen ? ChevronDown : ChevronRight} size={20} color={c.mutedForeground} />
        </PressScale>

        {customOpen && (
          <View style={styles.customPanel}>
            <TextInput
              style={styles.input}
              placeholder={vi ? 'Tên món (VD: Cơm gà nhà làm)' : 'Dish name (e.g. Homemade chicken rice)'}
              placeholderTextColor={c.mutedForeground}
              value={cName}
              onChangeText={setCName}
            />
            <View style={styles.macroInputRow}>
              <MacroInput label="kcal" value={cKcal} onChange={setCKcal} bad={!!customErrors.kcal} />
              <MacroInput label={`${i18n.nProtein} (g)`} value={cProtein} onChange={setCProtein} bad={!!customErrors.protein} />
              <MacroInput label={`${i18n.nCarbs} (g)`} value={cCarbs} onChange={setCCarbs} bad={!!customErrors.carbs} />
              <MacroInput label={`${i18n.nFat} (g)`} value={cFat} onChange={setCFat} bad={!!customErrors.fat} />
            </View>
            {customBad ? (
              <Text style={styles.customBadText}>
                {customErrors.kcal ?? customErrors.protein ?? customErrors.carbs ?? customErrors.fat}
              </Text>
            ) : null}
            <Text style={styles.customHint}>
              {vi
                ? 'Bỏ trống kcal sẽ tự tính từ macro (P×4 + C×4 + F×9)'
                : 'Leave kcal empty to auto-calc from macros (P×4 + C×4 + F×9)'}
            </Text>
            <PressScale
              style={[styles.customAddBtn, !canAddCustom && styles.customAddDisabled]}
              disabled={!canAddCustom}
              onPress={addCustom}>
              <Icon icon={Plus} size={15} color={c.primaryForeground} strokeWidth={2.5} />
              <Text style={styles.customAddText}>{vi ? 'Thêm vào bữa' : 'Add to meal'}</Text>
            </PressScale>
          </View>
        )}

        {/* Added items */}
        {items.length === 0 ? (
          <Text style={styles.emptyHint}>{i18n.nMealNoItems}</Text>
        ) : (
          <View style={styles.itemsWrap}>
            <Text style={styles.sectionLabel}>{i18n.nMealItems}</Text>
            {items.map((it, idx) => (
              <View key={`${it.food_name}-${idx}`}>
                <View style={styles.itemRow}>
                  {/* Tap the info area to edit this item's macros */}
                  <Pressable style={styles.itemInfo} onPress={() => openEdit(idx)}>
                    <Text style={styles.itemName} numberOfLines={1}>{it.food_name}</Text>
                    <Text style={styles.itemMacros}>
                      {Math.round(it.kcal * it.servings)} kcal · P{Math.round(it.protein_g * it.servings)} · C{Math.round(it.carbs_g * it.servings)} · F{Math.round(it.fat_g * it.servings)}
                    </Text>
                  </Pressable>
                  <View style={styles.stepper}>
                    <Pressable accessibilityRole="button" accessibilityLabel={i18n.a11yDecrease} hitSlop={8} style={styles.stepBtn} onPress={() => updateServings(idx, -0.5)}>
                      <Icon icon={Minus} size={16} color={c.foreground} />
                    </Pressable>
                    <Text style={styles.stepValue}>{it.servings}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel={i18n.a11yIncrease} hitSlop={8} style={styles.stepBtn} onPress={() => updateServings(idx, 0.5)}>
                      <Icon icon={Plus} size={16} color={c.foreground} />
                    </Pressable>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel={i18n.a11yRemove} hitSlop={8} onPress={() => removeItem(idx)}>
                    <Icon icon={X} size={15} color={c.mutedForeground} />
                  </Pressable>
                </View>
                {editingIdx === idx && (
                  <View style={styles.editPanel}>
                    <Text style={styles.editHint}>
                      {vi ? 'Macro cho 1 khẩu phần' : 'Macros per serving'}
                    </Text>
                    <View style={styles.macroInputRow}>
                      <MacroInput label="kcal" value={draft.kcal} bad={!!draftErrors.kcal} onChange={(v) => setDraft((d) => ({ ...d, kcal: v }))} />
                      <MacroInput label={`${i18n.nProtein} (g)`} value={draft.protein} bad={!!draftErrors.protein} onChange={(v) => setDraft((d) => ({ ...d, protein: v }))} />
                      <MacroInput label={`${i18n.nCarbs} (g)`} value={draft.carbs} bad={!!draftErrors.carbs} onChange={(v) => setDraft((d) => ({ ...d, carbs: v }))} />
                      <MacroInput label={`${i18n.nFat} (g)`} value={draft.fat} bad={!!draftErrors.fat} onChange={(v) => setDraft((d) => ({ ...d, fat: v }))} />
                    </View>
                    {/* The first thing that is wrong, named — a Done button
                        that does nothing is worse than one that says why. */}
                    {draftBad ? (
                      <Text style={styles.rangeError}>
                        {Object.values(draftErrors).find(Boolean)}
                      </Text>
                    ) : null}
                    <PressScale
                      accessibilityRole="button"
                      style={[styles.customAddBtn, draftBad && styles.saveDisabled]}
                      disabled={draftBad}
                      onPress={applyEdit}>
                      <Text style={styles.customAddText}>{vi ? 'Xong' : 'Done'}</Text>
                    </PressScale>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Macro total */}
        {items.length > 0 && (
          <View style={styles.totalCard}>
            <Text style={styles.sectionLabel}>{i18n.nNutritionTotal}</Text>
            <Text style={styles.totalKcal}>
              {Math.round(totals.kcal)} <Text style={styles.totalKcalUnit}>kcal</Text>
            </Text>
            {macroG > 0 && (
              <View style={styles.macroBar}>
                <View style={[styles.macroSeg, { flex: proteinPct, backgroundColor: c.readinessYellow }]} />
                <View style={[styles.macroSeg, { flex: carbsPct, backgroundColor: c.metricBlue }]} />
                <View style={[styles.macroSeg, { flex: fatPct, backgroundColor: c.metricOrange }]} />
              </View>
            )}
            <View style={styles.macroGrid}>
              <MacroStat label={i18n.nProtein} value={Math.round(totals.protein_g)} color={c.readinessYellow} />
              <MacroStat label={i18n.nCarbs} value={Math.round(totals.carbs_g)} color={c.metricBlue} />
              <MacroStat label={i18n.nFat} value={Math.round(totals.fat_g)} color={c.metricOrange} />
            </View>
          </View>
        )}

        <PressScale
                    /* The name has to be a constant, because the *text* is not.

             This button renders a Check on success and a spinner while
             pending, and in both of those branches there is no `<Text>` in the
             tree at all — so the control announced itself as an unnamed
             element at exactly the two moments a person most needs to know
             what it is doing. `tools/tap-targets.mjs` documents this as the
             blind spot it cannot see, and these five buttons were sitting in
             it. */
          accessibilityRole="button"
          accessibilityLabel={i18n.nSaveMeal}
          style={[styles.saveButton, !canSave && !save.isSuccess && styles.saveDisabled]}
          disabled={!canSave}
          onPress={submit}>
          {save.isSuccess ? (
            <Icon icon={Check} size={22} color={c.primaryForeground} strokeWidth={3} />
          ) : save.isPending ? (
            <ActivityIndicator color={c.primaryForeground} />
          ) : (
            <Text style={styles.saveText}>{i18n.nSaveMeal}</Text>
          )}
        </PressScale>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function MacroInput({ label, value, onChange, bad }: { label: string; value: string; onChange: (v: string) => void; bad?: boolean }) {
  const c = usePalette();
  const styles = stylesFor(c);
  return (
    <View style={styles.macroInputCell}>
      <Text style={styles.macroInputLabel} numberOfLines={1}>{label}</Text>
      <TextInput
        style={[styles.macroInputField, bad ? styles.macroInputBad : null]}
        keyboardType="number-pad"
        placeholder="0"
        placeholderTextColor={c.mutedForeground}
        value={value}
        onChangeText={(v) => onChange(intText(v))}
      />
    </View>
  );
}

function MacroStat({ label, value, color }: { label: string; value: number; color: string }) {
  const c = usePalette();
  const styles = stylesFor(c);
  return (
    <View style={styles.macroStat}>
      <View style={[styles.macroDot, { backgroundColor: color }]} />
      <Text style={styles.macroValue}>{value}g</Text>
      <Text style={styles.macroLabel}>{label}</Text>
    </View>
  );
}

const stylesFor = makeStyles((c, m) => ({
  repeatBlock: { gap: 2 },
  repeatTitle: { ...type.headline, color: c.foreground },
  repeatHint: { ...type.caption, color: c.mutedForeground, marginBottom: spacing.sm },
  repeatRow: { gap: spacing.sm, paddingRight: spacing.md },
  /* Wide enough for two foods on a line and short enough that a second card
     shows past the edge — a row that looks scrollable gets scrolled. */
  repeatCard: {
    width: 200,
    gap: 3,
    padding: spacing.md - 4,
    borderRadius: radius.md,
    backgroundColor: m.inset.bg,
    borderWidth: m.inset.borderWidth,
    borderColor: m.inset.border,
  },
  repeatHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  repeatMeal: { ...type.footnote, fontWeight: '700', color: c.foreground },
  repeatWhen: { ...type.caption, color: c.mutedForeground },
  repeatFoods: { ...type.caption, color: c.mutedForeground },
  repeatKcal: { ...type.caption, color: c.foreground, fontVariant: ['tabular-nums'] },
  root: { flex: 1, backgroundColor: c.card },
  content: { padding: spacing.lg, gap: spacing.sm + 4 },
  title: { ...type.title, color: c.foreground, textAlign: 'center', marginBottom: spacing.sm },
  chips: { paddingRight: spacing.sm },
  /* No background and no radius: the row measures this chip and draws both the
     resting box and the travelling highlight to match. */
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipText: { ...type.footnote, color: c.secondaryForeground },
  chipTextActive: { color: c.primaryForeground, fontWeight: '600' },
  input: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    backgroundColor: c.background,
    paddingHorizontal: spacing.md,
    color: c.foreground,
    fontSize: 16,
  },
  searchRow: { flexDirection: 'row', gap: spacing.sm },
  searchInput: { flex: 1 },
  iconBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    backgroundColor: c.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGlyph: { fontSize: 20, color: c.foreground },
  results: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    backgroundColor: c.background,
    overflow: 'hidden',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm,
  },
  resultInfo: { flex: 1, minWidth: 0 },
  resultName: { ...type.body, color: c.foreground },
  resultBrand: { ...type.caption, color: c.mutedForeground },
  resultKcal: { ...type.footnote, color: c.mutedForeground },
  quickRow: { gap: spacing.sm, paddingRight: spacing.sm },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: 190,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: c.secondary,
  },
  quickGlyph: { fontSize: 12, color: c.primary },
  quickName: { ...type.footnote, color: c.foreground, flexShrink: 1 },
  quickKcal: { ...type.caption, color: c.mutedForeground, fontVariant: ['tabular-nums'] },
  aiToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    backgroundColor: c.background,
  },
  aiToggleActive: { borderColor: c.primary },
  aiToggleIcon: { fontSize: 18, color: c.primary },
  aiToggleInfo: { flex: 1, minWidth: 0 },
  aiToggleTitle: { ...type.headline, color: c.foreground },
  aiToggleHint: { ...type.caption, color: c.mutedForeground, marginTop: 2 },
  aiChevron: { fontSize: 20, color: c.mutedForeground },
  aiPanel: { gap: spacing.sm },
  aiLoading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md, justifyContent: 'center' },
  aiLoadingText: { ...type.footnote, color: c.mutedForeground },
  aiEmpty: { ...type.footnote, color: c.mutedForeground, textAlign: 'center', paddingVertical: spacing.md },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: c.background,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  suggestionInfo: { flex: 1, minWidth: 0, gap: 2 },
  suggestionName: { ...type.headline, color: c.foreground },
  suggestionDesc: { ...type.footnote, color: c.mutedForeground },
  suggestionMacros: { ...type.caption, color: c.secondaryForeground, fontVariant: ['tabular-nums'], marginTop: 2 },
  addChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addChipText: { fontSize: 22, color: c.primaryForeground, lineHeight: 26 },
  emptyHint: { ...type.footnote, color: c.mutedForeground, textAlign: 'center', paddingVertical: spacing.lg },

  // Custom food entry + per-item macro editing
  customPanel: { gap: spacing.sm },
  macroInputRow: { flexDirection: 'row', gap: spacing.sm },
  macroInputCell: { flex: 1, gap: 4 },
  macroInputLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: c.mutedForeground },
  macroInputField: {
    height: 40,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    backgroundColor: c.background,
    textAlign: 'center',
    color: c.foreground,
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    paddingVertical: 0,
  },
  macroInputBad: { borderColor: c.readinessRed },
  customBadText: { ...type.caption, color: c.readinessRed },
  customHint: { ...type.caption, color: c.mutedForeground },
  customAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 42,
    borderRadius: radius.full,
    backgroundColor: c.primary,
  },
  customAddDisabled: { opacity: 0.4 },
  customAddText: { ...type.footnote, fontWeight: '600', color: c.primaryForeground },
  editPanel: {
    gap: spacing.sm,
    backgroundColor: c.background,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: 4,
  },
  editHint: { ...type.caption, color: c.mutedForeground },
  itemsWrap: { gap: spacing.sm },
  sectionLabel: {
    ...type.caption,
    color: c.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: c.background,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  itemInfo: { flex: 1, minWidth: 0 },
  itemName: { ...type.body, color: c.foreground, fontWeight: '600' },
  itemMacros: { ...type.caption, color: c.mutedForeground, fontVariant: ['tabular-nums'], marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: c.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepGlyph: { fontSize: 16, color: c.foreground },
  stepValue: { ...type.footnote, color: c.foreground, fontVariant: ['tabular-nums'], minWidth: 26, textAlign: 'center' },
  removeIcon: { color: c.mutedForeground, fontSize: 15, padding: 4 },
  totalCard: {
    backgroundColor: c.background,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  totalKcal: { ...type.largeTitle, ...type.mono, color: c.foreground },
  totalKcalUnit: { ...type.body, color: c.mutedForeground },
  macroBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden' },
  macroSeg: { height: '100%' },
  macroGrid: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
  macroStat: { flex: 1, alignItems: 'center', gap: 2 },
  macroDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 2 },
  macroValue: { ...type.headline, color: c.foreground, fontVariant: ['tabular-nums'] },
  macroLabel: { ...type.caption, color: c.mutedForeground },
  saveButton: {
    height: 50,
    borderRadius: radius.full,
    backgroundColor: c.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  saveDisabled: { opacity: 0.4 },
  rangeError: { ...type.caption, color: c.readinessRed },
  saveText: { ...type.headline, color: c.primaryForeground },
}));
