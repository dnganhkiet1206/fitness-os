import * as Haptics from 'expo-haptics';
import { ChefHat, ChevronDown, ChevronUp, Clock, Sparkles } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ascnd/icon';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useAppSettings } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/integrations/supabase/client';
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
  const { session } = useAuth();
  const { lang } = useAppSettings();
  const [suggestions, setSuggestions] = useState<MealSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  const fetchSuggestions = async () => {
    if (!session || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    try {
      const resp = await supabase.functions.invoke('ai-meal-suggest', {
        body: { meal_type: mealType || 'any', lang, date: localDateStr() },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (resp.error) throw resp.error;
      setSuggestions((resp.data?.suggestions as MealSuggestion[]) ?? []);
      setExpanded(null);
    } catch {
      Alert.alert('ASCND', lang === 'vi' ? 'Không thể lấy gợi ý' : 'Failed to get suggestions');
    } finally {
      setLoading(false);
    }
  };

  if (suggestions.length === 0) {
    return (
      <Pressable
        style={({ pressed }) => [styles.suggestBtn, pressed && styles.pressed]}
        disabled={loading}
        onPress={fetchSuggestions}>
        {loading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Icon icon={Sparkles} size={14} color={colors.primary} />
        )}
        <Text style={styles.suggestBtnText}>
          {lang === 'vi' ? 'AI gợi ý bữa ăn' : 'AI Suggest Meal'}
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.list}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Icon icon={Sparkles} size={13} color={colors.primary} />
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
                <Icon icon={ChefHat} size={13} color={colors.primary} />
                <Text style={styles.name} numberOfLines={1}>{meal.name}</Text>
              </View>
              <Text style={styles.desc} numberOfLines={2}>{meal.description}</Text>
              <View style={styles.macroRow}>
                <Text style={[styles.macro, styles.macroKcal]}>{meal.kcal} kcal</Text>
                <Text style={[styles.macro, { color: colors.primary }]}>P{meal.protein_g}g</Text>
                <Text style={[styles.macro, { color: '#ef7c26' }]}>C{meal.carbs_g}g</Text>
                <Text style={[styles.macro, { color: '#8d52e0' }]}>F{meal.fat_g}g</Text>
              </View>
            </View>
            <View style={styles.cardMeta}>
              <Icon icon={Clock} size={11} color={colors.mutedForeground} />
              <Text style={styles.prepTime}>{meal.prep_time_min}m</Text>
              <Icon
                icon={expanded === i ? ChevronUp : ChevronDown}
                size={14}
                color={colors.mutedForeground}
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

      <Pressable
        style={({ pressed }) => [styles.moreBtn, pressed && styles.pressed]}
        disabled={loading}
        onPress={fetchSuggestions}>
        {loading ? (
          <ActivityIndicator size="small" color={colors.mutedForeground} />
        ) : (
          <Icon icon={Sparkles} size={13} color={colors.mutedForeground} />
        )}
        <Text style={styles.moreText}>
          {lang === 'vi' ? 'Gợi ý khác' : 'More suggestions'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  suggestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(168,175,189,0.3)',
    backgroundColor: 'rgba(168,175,189,0.05)',
  },
  suggestBtnText: { fontSize: 12, fontWeight: '600', color: colors.primary },

  list: { gap: spacing.sm },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.6,
    color: colors.mutedForeground,
  },
  closeText: { fontSize: 11, color: colors.mutedForeground },

  card: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(43,43,49,0.5)',
    backgroundColor: 'rgba(24,24,27,0.3)',
    padding: spacing.sm + 4,
    gap: spacing.sm,
  },
  cardTop: { flexDirection: 'row', gap: spacing.sm },
  cardInfo: { flex: 1, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.foreground },
  desc: { fontSize: 10, color: colors.mutedForeground, lineHeight: 14 },
  macroRow: { flexDirection: 'row', gap: spacing.sm + 4, marginTop: 2 },
  macro: { ...type.mono, fontSize: 10, color: colors.mutedForeground },
  macroKcal: { fontWeight: '700', color: colors.foreground },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  prepTime: { fontSize: 10, color: colors.mutedForeground },

  ingredients: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(43,43,49,0.4)',
    paddingTop: spacing.sm,
    gap: 6,
  },
  ingredientsTitle: {
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: colors.mutedForeground,
  },
  ingredientChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  ingredientChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    backgroundColor: 'rgba(24,24,27,0.6)',
  },
  ingredientText: { fontSize: 10, color: 'rgba(237,237,237,0.8)' },

  moreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 38,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  moreText: { fontSize: 12, fontWeight: '500', color: colors.mutedForeground },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
});
