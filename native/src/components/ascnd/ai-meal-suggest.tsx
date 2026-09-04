import * as Haptics from 'expo-haptics';
import { ChefHat, ChevronDown, ChevronUp, Clock, Sparkles } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { PressScale } from '@/components/ascnd/press-scale';
import { Icon } from '@/components/ascnd/icon';
import { radius, spacing, type } from '@/constants/ascnd';
import { alpha, makeStyles } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import { AI_FAILURE_KEY, callEdge, EDGE_FUNCTIONS } from '@/lib/edge';
import { localDateStr } from '@/lib/local-date';

interface MealSuggestion {
  name: string;
  description: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  ingredients: string[];
  prep_time_min: number;
}

/**
 * AI meal suggestions — port of the web AiMealSuggestButton. Calls the
 * ai-meal-suggest edge function and renders expandable suggestion cards
 * with macros and ingredients.
 */
export function AiMealSuggest({ mealType }: { mealType?: string }) {
  const c = usePalette();
  const styles = stylesFor(c);
  const { session } = useAuth();
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const [suggestions, setSuggestions] = useState<MealSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  const fetchSuggestions = async () => {
    if (!session || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    // `callEdge` names the reason; the alert used to say "failed" for a function
    // that was never deployed, a missing model key and an expired session alike.
    const res = await callEdge<{ suggestions?: MealSuggestion[] }>(EDGE_FUNCTIONS.mealSuggest, {
      meal_type: mealType || 'any',
      lang,
      date: localDateStr(),
      /* The function asks the model to fit the time of day. Without this it
         read the hour off a Deno host's clock, which is UTC. */
      tzOffset: new Date().getTimezoneOffset(),
    });
    if (res.ok) {
      setSuggestions(res.data?.suggestions ?? []);
      setExpanded(null);
    } else {
      Alert.alert('ASCND', i18n[AI_FAILURE_KEY[res.failure]]);
    }
    setLoading(false);
  };

  if (suggestions.length === 0) {
    return (
      <PressScale
        style={styles.suggestBtn}
        disabled={loading}
        onPress={fetchSuggestions}>
        {loading ? (
          <ActivityIndicator size="small" color={c.primary} />
        ) : (
          <Icon icon={Sparkles} size={14} />
        )}
        <Text style={styles.suggestBtnText}>
          {lang === 'vi' ? 'AI gợi ý bữa ăn' : 'AI Suggest Meal'}
        </Text>
      </PressScale>
    );
  }

  return (
    <View style={styles.list}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Icon icon={Sparkles} size={13} />
          <Text style={styles.headerTitle}>
            {lang === 'vi' ? 'Gợi ý từ AI' : 'AI Suggestions'}
          </Text>
        </View>
        <Pressable hitSlop={8} onPress={() => setSuggestions([])}>
          <Text style={styles.closeText}>{lang === 'vi' ? 'Đóng' : 'Close'}</Text>
        </Pressable>
      </View>

      {suggestions.map((meal, i) => (
        <Pressable
          key={i}
          style={styles.card}
          onPress={() => {
            Haptics.selectionAsync();
            setExpanded(expanded === i ? null : i);
          }}>
          <View style={styles.cardTop}>
            <View style={styles.cardInfo}>
              <View style={styles.nameRow}>
                <Icon icon={ChefHat} size={13} />
                <Text style={styles.name} numberOfLines={1}>{meal.name}</Text>
              </View>
              <Text style={styles.desc} numberOfLines={2}>{meal.description}</Text>
              <View style={styles.macroRow}>
                <Text style={[styles.macro, styles.macroKcal]}>{meal.kcal} kcal</Text>
                <Text style={[styles.macro, { color: c.primary }]}>P{meal.protein_g}g</Text>
                <Text style={[styles.macro, { color: '#ef7c26' }]}>C{meal.carbs_g}g</Text>
                <Text style={[styles.macro, { color: '#b45cff' }]}>F{meal.fat_g}g</Text>
              </View>
            </View>
            <View style={styles.cardMeta}>
              <Icon icon={Clock} size={11} color={c.mutedForeground} />
              <Text style={styles.prepTime}>{meal.prep_time_min}m</Text>
              <Icon
                icon={expanded === i ? ChevronUp : ChevronDown}
                size={14}
                color={c.mutedForeground}
              />
            </View>
          </View>

          {expanded === i && (
            <View style={styles.ingredients}>
              <Text style={styles.ingredientsTitle}>
                {lang === 'vi' ? 'Nguyên liệu' : 'Ingredients'}
              </Text>
              <View style={styles.ingredientChips}>
                {meal.ingredients.map((ing, j) => (
                  <View key={j} style={styles.ingredientChip}>
                    <Text style={styles.ingredientText}>{ing}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </Pressable>
      ))}

      <PressScale
        style={styles.moreBtn}
        disabled={loading}
        onPress={fetchSuggestions}>
        {loading ? (
          <ActivityIndicator size="small" color={c.mutedForeground} />
        ) : (
          <Icon icon={Sparkles} size={13} />
        )}
        <Text style={styles.moreText}>
          {lang === 'vi' ? 'Gợi ý khác' : 'More suggestions'}
        </Text>
      </PressScale>
    </View>
  );
}

const stylesFor = makeStyles((c) => ({
  suggestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    /* 44, không phải 40. Đây là nút RỘNG HẾT HÀNG, nên chiều cao là chiều duy
       nhất giới hạn vùng chạm — và nó không có `hitSlop` nào bù lại. Đo trên
       trang dinh dưỡng: 370×40, tức thiếu bốn điểm so với ngưỡng của Apple.
       44 cũng là chiều cao mà phần còn lại của app dùng nhiều nhất. */
    height: 44,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha(c.primary, 0.3),
    backgroundColor: alpha(c.primary, 0.05),
  },
  suggestBtnText: { fontSize: 12, fontWeight: '600', color: c.primary },

  list: { gap: spacing.sm },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.6,
    color: c.mutedForeground,
  },
  closeText: { fontSize: 11, color: c.mutedForeground },

  card: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha(c.border, 0.5),
    backgroundColor: alpha(c.secondary, 0.3),
    padding: spacing.sm + 4,
    gap: spacing.sm,
  },
  cardTop: { flexDirection: 'row', gap: spacing.sm },
  cardInfo: { flex: 1, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flex: 1, fontSize: 14, fontWeight: '600', color: c.foreground },
  desc: { fontSize: 11, color: c.mutedForeground, lineHeight: 14 },
  macroRow: { flexDirection: 'row', gap: spacing.sm + 4, marginTop: 2 },
  macro: { ...type.mono, fontSize: 11, color: c.mutedForeground },
  macroKcal: { fontWeight: '700', color: c.foreground },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  prepTime: { fontSize: 11, color: c.mutedForeground },

  ingredients: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: alpha(c.border, 0.4),
    paddingTop: spacing.sm,
    gap: 6,
  },
  ingredientsTitle: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: c.mutedForeground,
  },
  ingredientChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  ingredientChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    backgroundColor: alpha(c.secondary, 0.6),
  },
  ingredientText: { fontSize: 11, color: alpha(c.foreground, 0.8) },

  moreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    /* Cùng lý do với `suggestBtn`, và 38 còn thiếu nhiều hơn. */
    height: 44,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
  },
  moreText: { fontSize: 12, fontWeight: '500', color: c.mutedForeground },
}));
