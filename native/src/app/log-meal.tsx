import { useMutation, useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { Camera, ChevronDown, ChevronRight, Clock, Minus, Plus, ScanBarcode, Sparkles, Star, X } from 'lucide-react-native';
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

import { Icon } from '@/components/ascnd/icon';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import { useFavoriteFoods, useRecentFoods } from '@/hooks/use-nutrition';
import { useInvalidateToday } from '@/hooks/useTodayData';
import { supabase } from '@/integrations/supabase/client';
import { recomputeDailyLog } from '@/lib/daily-log-service';
import { consumePendingScan } from '@/lib/scan-bridge';

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
  const { user } = useAuth();
  const { lang } = useAppSettings();
  const invalidate = useInvalidateToday();
  const i18n = useI18n();

  const MEAL_TYPES = [
    { key: 'breakfast', label: i18n.nBreakfast },
    { key: 'lunch', label: i18n.nLunch },
    { key: 'dinner', label: i18n.nDinner },
    { key: 'snack', label: i18n.nSnack },
    { key: 'preworkout', label: i18n.nPreWorkout },
    { key: 'postworkout', label: i18n.nPostWorkout },
  ] as const;

  const [mealType, setMealType] = useState<MealType>('lunch');
  const [items, setItems] = useState<MealItem[]>([]);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([]);

  const { data: favorites } = useFavoriteFoods();
  const { data: recents } = useRecentFoods();

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
    queryKey: ['food_items_search', debounced],
    enabled: debounced.length >= 2,
    queryFn: async () => {
      const { data } = await supabase
        .from('food_items')
        .select('id, name, brand, kcal, protein_g, carbs_g, fat_g, fiber_g, serving_g')
        .ilike('name', `%${debounced}%`)
        .order('name')
        .limit(8);
      return data ?? [];
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
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const { data, error } = await supabase.functions.invoke('ai-meal-suggest', {
        body: { meal_type: mealType },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (error) throw error;
      return (data?.suggestions ?? []) as AiSuggestion[];
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

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not signed in');
      if (items.length === 0) throw new Error('No items');
      const { data: entry, error } = await supabase
        .from('meal_entries')
        .insert({
          user_id: user.id,
          meal_type: mealType,
          total_kcal: Math.round(totals.kcal),
          total_protein_g: Math.round(totals.protein_g),
          total_carbs_g: Math.round(totals.carbs_g),
          total_fat_g: Math.round(totals.fat_g),
          total_fiber_g: Math.round(totals.fiber_g),
        })
        .select('id')
        .single();
      if (error) throw error;

      const rows = items.map((it) => ({
        meal_entry_id: entry.id,
        food_item_id: it.food_item_id,
        food_name: it.food_name,
        servings: it.servings,
        kcal: Math.round(it.kcal * it.servings),
        protein_g: Math.round(it.protein_g * it.servings),
        carbs_g: Math.round(it.carbs_g * it.servings),
        fat_g: Math.round(it.fat_g * it.servings),
        fiber_g: Math.round(it.fiber_g * it.servings),
      }));
      await supabase.from('meal_entry_items').insert(rows);
      await recomputeDailyLog(user.id, new Date().toISOString().split('T')[0]);
    },
    onSuccess: () => {
      invalidate();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    },
    onError: (e: Error) => {
      if (e.message !== 'No items') Alert.alert('ASCND', e.message);
    },
  });

  const canSave = items.length > 0 && !save.isPending;
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
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{i18n.nLogMealTitle}</Text>

        {/* Meal type */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {MEAL_TYPES.map(({ key, label }) => (
            <Pressable
              key={key}
              onPress={() => {
                Haptics.selectionAsync();
                setMealType(key);
              }}
              style={[styles.chip, mealType === key && styles.chipActive]}>
              <Text style={[styles.chipText, mealType === key && styles.chipTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Search + scan buttons */}
        <View style={styles.searchRow}>
          <TextInput
            style={[styles.input, styles.searchInput]}
            placeholder={i18n.nSearchFoods}
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
          />
          <Pressable
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/scan-food');
            }}>
            <Icon icon={Camera} size={20} color={colors.foreground} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/scan-barcode');
            }}>
            <Icon icon={ScanBarcode} size={20} color={colors.foreground} />
          </Pressable>
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
              <Pressable
                key={q.key}
                style={({ pressed }) => [styles.quickChip, pressed && styles.pressed]}
                onPress={() => {
                  Haptics.selectionAsync();
                  addItem(q);
                }}>
                <Icon icon={q.fav ? Star : Clock} size={12} color={colors.primary} />
                <Text style={styles.quickName} numberOfLines={1}>{q.food_name}</Text>
                <Text style={styles.quickKcal}>{q.kcal}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {/* AI suggest */}
        <Pressable
          style={({ pressed }) => [styles.aiToggle, aiOpen && styles.aiToggleActive, pressed && styles.pressed]}
          onPress={openAi}>
          <Icon icon={Sparkles} size={18} color={colors.primary} />
          <View style={styles.aiToggleInfo}>
            <Text style={styles.aiToggleTitle}>{i18n.nAiSuggestTitle}</Text>
            <Text style={styles.aiToggleHint}>{i18n.nAiSuggestHint}</Text>
          </View>
          <Icon icon={aiOpen ? ChevronDown : ChevronRight} size={20} color={colors.mutedForeground} />
        </Pressable>

        {aiOpen && (
          <View style={styles.aiPanel}>
            {aiSuggest.isPending ? (
              <View style={styles.aiLoading}>
                <ActivityIndicator color={colors.primary} />
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
                  <Pressable
                    style={({ pressed }) => [styles.addChip, pressed && styles.pressed]}
                    onPress={() => addSuggestion(s)}>
                    <Icon icon={Plus} size={20} color={colors.primaryForeground} strokeWidth={2.5} />
                  </Pressable>
                </View>
              ))
            )}
          </View>
        )}

        {/* Added items */}
        {items.length === 0 ? (
          <Text style={styles.emptyHint}>{i18n.nMealNoItems}</Text>
        ) : (
          <View style={styles.itemsWrap}>
            <Text style={styles.sectionLabel}>{i18n.nMealItems}</Text>
            {items.map((it, idx) => (
              <View key={`${it.food_name}-${idx}`} style={styles.itemRow}>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName} numberOfLines={1}>{it.food_name}</Text>
                  <Text style={styles.itemMacros}>
                    {Math.round(it.kcal * it.servings)} kcal · P{Math.round(it.protein_g * it.servings)} · C{Math.round(it.carbs_g * it.servings)} · F{Math.round(it.fat_g * it.servings)}
                  </Text>
                </View>
                <View style={styles.stepper}>
                  <Pressable hitSlop={6} style={styles.stepBtn} onPress={() => updateServings(idx, -0.5)}>
                    <Icon icon={Minus} size={16} color={colors.foreground} />
                  </Pressable>
                  <Text style={styles.stepValue}>{it.servings}</Text>
                  <Pressable hitSlop={6} style={styles.stepBtn} onPress={() => updateServings(idx, 0.5)}>
                    <Icon icon={Plus} size={16} color={colors.foreground} />
                  </Pressable>
                </View>
                <Pressable hitSlop={8} onPress={() => removeItem(idx)}>
                  <Icon icon={X} size={15} color={colors.mutedForeground} />
                </Pressable>
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
                <View style={[styles.macroSeg, { flex: proteinPct, backgroundColor: colors.readinessYellow }]} />
                <View style={[styles.macroSeg, { flex: carbsPct, backgroundColor: colors.metricBlue }]} />
                <View style={[styles.macroSeg, { flex: fatPct, backgroundColor: colors.metricOrange }]} />
              </View>
            )}
            <View style={styles.macroGrid}>
              <MacroStat label={i18n.nProtein} value={Math.round(totals.protein_g)} color={colors.readinessYellow} />
              <MacroStat label={i18n.nCarbs} value={Math.round(totals.carbs_g)} color={colors.metricBlue} />
              <MacroStat label={i18n.nFat} value={Math.round(totals.fat_g)} color={colors.metricOrange} />
            </View>
          </View>
        )}

        <Pressable
          style={({ pressed }) => [
            styles.saveButton,
            !canSave && styles.saveDisabled,
            pressed && canSave && styles.pressed,
          ]}
          disabled={!canSave}
          onPress={() => save.mutate()}>
          {save.isPending ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={styles.saveText}>{i18n.nSaveMeal}</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function MacroStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.macroStat}>
      <View style={[styles.macroDot, { backgroundColor: color }]} />
      <Text style={styles.macroValue}>{value}g</Text>
      <Text style={styles.macroLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.card },
  content: { padding: spacing.lg, gap: spacing.sm + 4 },
  title: { ...type.title, color: colors.foreground, textAlign: 'center', marginBottom: spacing.sm },
  chips: { gap: spacing.sm, paddingRight: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
  },
  chipActive: { backgroundColor: colors.primary },
  chipText: { ...type.footnote, color: colors.secondaryForeground },
  chipTextActive: { color: colors.primaryForeground, fontWeight: '600' },
  input: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    color: colors.foreground,
    fontSize: 16,
  },
  searchRow: { flexDirection: 'row', gap: spacing.sm },
  searchInput: { flex: 1 },
  iconBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGlyph: { fontSize: 20, color: colors.foreground },
  results: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.background,
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
  resultName: { ...type.body, color: colors.foreground },
  resultBrand: { ...type.caption, color: colors.mutedForeground },
  resultKcal: { ...type.footnote, color: colors.mutedForeground },
  quickRow: { gap: spacing.sm, paddingRight: spacing.sm },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: 190,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
  },
  quickGlyph: { fontSize: 12, color: colors.primary },
  quickName: { ...type.footnote, color: colors.foreground, flexShrink: 1 },
  quickKcal: { ...type.caption, color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  aiToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  aiToggleActive: { borderColor: colors.primary },
  aiToggleIcon: { fontSize: 18, color: colors.primary },
  aiToggleInfo: { flex: 1, minWidth: 0 },
  aiToggleTitle: { ...type.headline, color: colors.foreground },
  aiToggleHint: { ...type.caption, color: colors.mutedForeground, marginTop: 2 },
  aiChevron: { fontSize: 20, color: colors.mutedForeground },
  aiPanel: { gap: spacing.sm },
  aiLoading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md, justifyContent: 'center' },
  aiLoadingText: { ...type.footnote, color: colors.mutedForeground },
  aiEmpty: { ...type.footnote, color: colors.mutedForeground, textAlign: 'center', paddingVertical: spacing.md },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  suggestionInfo: { flex: 1, minWidth: 0, gap: 2 },
  suggestionName: { ...type.headline, color: colors.foreground },
  suggestionDesc: { ...type.footnote, color: colors.mutedForeground },
  suggestionMacros: { ...type.caption, color: colors.secondaryForeground, fontVariant: ['tabular-nums'], marginTop: 2 },
  addChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addChipText: { fontSize: 22, color: colors.primaryForeground, lineHeight: 26 },
  emptyHint: { ...type.footnote, color: colors.mutedForeground, textAlign: 'center', paddingVertical: spacing.lg },
  itemsWrap: { gap: spacing.sm },
  sectionLabel: {
    ...type.caption,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  itemInfo: { flex: 1, minWidth: 0 },
  itemName: { ...type.body, color: colors.foreground, fontWeight: '600' },
  itemMacros: { ...type.caption, color: colors.mutedForeground, fontVariant: ['tabular-nums'], marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepGlyph: { fontSize: 16, color: colors.foreground },
  stepValue: { ...type.footnote, color: colors.foreground, fontVariant: ['tabular-nums'], minWidth: 26, textAlign: 'center' },
  removeIcon: { color: colors.mutedForeground, fontSize: 15, padding: 4 },
  totalCard: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  totalKcal: { ...type.largeTitle, color: colors.foreground, fontVariant: ['tabular-nums'] },
  totalKcalUnit: { ...type.body, color: colors.mutedForeground },
  macroBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden' },
  macroSeg: { height: '100%' },
  macroGrid: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
  macroStat: { flex: 1, alignItems: 'center', gap: 2 },
  macroDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 2 },
  macroValue: { ...type.headline, color: colors.foreground, fontVariant: ['tabular-nums'] },
  macroLabel: { ...type.caption, color: colors.mutedForeground },
  saveButton: {
    height: 50,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  saveDisabled: { opacity: 0.4 },
  saveText: { ...type.headline, color: colors.primaryForeground },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
