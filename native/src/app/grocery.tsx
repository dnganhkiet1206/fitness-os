import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Check, Plus, UtensilsCrossed, X } from 'lucide-react-native';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated from 'react-native-reanimated';

import { PressScale } from '@/components/ascnd/press-scale';
import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { Screen } from '@/components/ascnd/screen';
import { radius, spacing, type } from '@/constants/ascnd';
import { alpha, makeStyles } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { useRise } from '@/lib/entrance';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import { useGroceryItems, useGroceryMutations } from '@/hooks/use-extras';
import { supabase } from '@/integrations/supabase/client';

export default function GroceryScreen() {
  const c = usePalette();
  const styles = stylesFor(c);
  /* Lần vẽ đầu hiện NGAY, cascade chỉ chạy cho thứ mount vào một màn hình
     đã ở đó — xem `useRise`. Bản trước gọi `rise` trần, tức là một cái
     lò xo bắt đầu bên trong giây đầu tiên của một màn cũng đang chạy truy
     vấn; khung hình rơi trong quãng đó để lại đúng giá trị đầu, và giá trị
     đầu của `FadeInDown` là chưa nhìn thấy. */
  const rise = useRise();
  const { user } = useAuth();
  const { data: items, isError, refetch, isRefetching } = useGroceryItems();
  const { add, toggle, remove } = useGroceryMutations();
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const [draft, setDraft] = useState('');

  /**
   * What the meal plan says you need to buy, and how much of it.
   *
   * It used to list distinct names: a week with chicken in six meals suggested
   * "chicken", once, with no hint whether that was one breast or six. A
   * shopping list without amounts is a list you have to re-derive in the shop.
   * The grams are summed across every meal the food appears in, which is the
   * number you are actually buying.
   *
   * Rows with no `serving_g` still appear — with a count instead of a weight,
   * because "×3" is a true thing to say about three planned portions of unknown
   * size, and dropping the line entirely would hide food you have to buy.
   *
   * Still the most recent plan. Choosing between plans is a control this screen
   * has nowhere to put; the plan you wrote last is the plan you are shopping
   * for, which is right often enough that a picker would earn its space only
   * for someone keeping two live plans at once.
   */
  const { data: planFoods } = useQuery({
    queryKey: ['grocery_meal_plan', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: plans, error } = await supabase
        .from('meal_plans')
        .select('id')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      if (!plans || plans.length === 0) return [];
      const { data: rows, error: rowsErr } = await supabase
        .from('meal_plan_items')
        .select('food_name, serving_g')
        .eq('meal_plan_id', plans[0].id);
      if (rowsErr) throw rowsErr;

      const byName = new Map<string, { name: string; grams: number; times: number }>();
      for (const r of rows ?? []) {
        const name = (r.food_name ?? '').trim();
        if (!name) continue;
        // Folded case-insensitively, so "Ức gà" and "ức gà" are one line and
        // one trip to the shop; the first spelling seen is the one shown.
        const key = name.toLowerCase();
        const at = byName.get(key) ?? { name, grams: 0, times: 0 };
        at.grams += Number(r.serving_g) || 0;
        at.times += 1;
        byName.set(key, at);
      }
      return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const existingNames = new Set((items ?? []).map((i) => i.name.toLowerCase()));
  const planSuggestions = (planFoods ?? []).filter(
    (f) => !existingNames.has(f.name.toLowerCase()),
  );

  /** "400g", or "×3" when the plan never said how much */
  const amountOf = (f: { grams: number; times: number }) =>
    f.grams > 0 ? `${Math.round(f.grams)}g` : `×${f.times}`;

  const submit = () => {
    const name = draft.trim();
    if (!name) return;
    add.mutate(name);
    setDraft('');
  };

  return (
    <KeyboardAvoidingView style={styles.kav} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen refreshable back title={i18n.nGrocery}>
        <View style={styles.addRow}>
          <TextInput
            style={styles.input}
            placeholder={i18n.nAddItem}
            placeholderTextColor={c.mutedForeground}
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={submit}
            returnKeyType="done"
          />
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={i18n.a11yAdd}
            style={[styles.addBtn, !draft.trim() && styles.disabled]}
            disabled={!draft.trim()}
            onPress={submit}>
            <Icon icon={Plus} size={20} color={c.primaryForeground} strokeWidth={2.5} />
          </PressScale>
        </View>

        {/* From your meal plan — tap + to add to the list */}
        {planSuggestions.length > 0 && (
          <GlassCard style={styles.planCard}>
            <View style={styles.planHead}>
              <Icon icon={UtensilsCrossed} size={13} />
              <Text style={styles.planTitle}>
                {lang === 'vi' ? 'Từ meal plan của bạn' : 'From your meal plan'}
              </Text>
            </View>
            <View style={styles.planChips}>
              {planSuggestions.map((f) => (
                <PressScale
                  key={f.name}
                  accessibilityRole="button"
                  accessibilityLabel={`${f.name}, ${amountOf(f)}`}
                  style={styles.planChip}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    add.mutate({ name: f.name, quantity: amountOf(f) });
                  }}>
                  <Text style={styles.planChipText} numberOfLines={1}>{f.name}</Text>
                  <Text style={styles.planChipQty}>{amountOf(f)}</Text>
                  <Icon icon={Plus} size={12} color={c.primary} strokeWidth={2.5} />
                </PressScale>
              ))}
            </View>
          </GlassCard>
        )}

        {/* A failed read is not an empty list. `data` comes back undefined, the
        zero branch below renders, and the screen tells somebody they have
        nothing — which is a statement about their account, not about the
        network. The failure is answered first so the empty state stays true. */}
        {isError ? (
          <LoadFailed i18n={i18n} onRetry={() => void refetch()} busy={isRefetching} />
        ) : items && items.length > 0 ? (
          items.map((it, i) => (
            <Animated.View key={it.id} entering={rise(i)}>
            <Pressable
              onPress={() => toggle.mutate({ id: it.id, checked: !it.checked })}>
              <GlassCard elevation="inset" style={styles.itemCard}>
                <View style={styles.itemRow}>
                  <View style={[styles.checkbox, it.checked && styles.checkboxOn]}>
                    {it.checked && <Icon icon={Check} size={13} color="#fff" strokeWidth={3} />}
                  </View>
                  <Text style={[styles.itemName, it.checked && styles.itemChecked]} numberOfLines={1}>
                    {it.name}
                    {it.quantity ? <Text style={styles.qty}>  ×{it.quantity}</Text> : null}
                  </Text>
                  <Pressable accessibilityRole="button" accessibilityLabel={i18n.a11yRemove} hitSlop={10} onPress={() => remove.mutate(it.id)}>
                    <Icon icon={X} size={15} color={c.mutedForeground} />
                  </Pressable>
                </View>
              </GlassCard>
            </Pressable>
            </Animated.View>
          ))
        ) : (
          <GlassCard>
            <Text style={styles.emptyTitle}>{i18n.nNoGrocery}</Text>
            <Text style={styles.emptyHint}>{i18n.nNoGroceryHint}</Text>
          </GlassCard>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const stylesFor = makeStyles((c) => ({
  kav: { flex: 1 },
  addRow: { flexDirection: 'row', gap: spacing.sm },
  input: {
    flex: 1,
    height: 48,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    backgroundColor: c.card,
    paddingHorizontal: spacing.md,
    color: c.foreground,
    fontSize: 16,
  },
  addBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: c.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: { fontSize: 22, color: c.primaryForeground, fontWeight: '600' },
  disabled: { opacity: 0.4 },
  itemCard: { paddingVertical: spacing.md },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: c.readinessGreen,
    borderColor: c.readinessGreen,
  },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: '700' },
  itemName: { ...type.body, color: c.foreground, flex: 1 },
  itemChecked: { color: c.mutedForeground, textDecorationLine: 'line-through' },
  qty: { ...type.footnote, color: c.mutedForeground },
  remove: { color: c.mutedForeground, fontSize: 15 },
  emptyTitle: { ...type.headline, color: c.foreground },
  emptyHint: { ...type.footnote, color: c.mutedForeground, marginTop: 2 },

  planCard: { gap: spacing.sm },
  planHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  planTitle: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    color: c.mutedForeground,
  },
  planChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  planChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '100%',
    paddingLeft: spacing.sm + 2,
    paddingRight: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha(c.primary, 0.3),
    backgroundColor: alpha(c.primary, 0.06),
  },
  planChipQty: { ...type.caption, color: c.mutedForeground, fontVariant: ['tabular-nums'] },
  planChipText: { fontSize: 12, color: c.foreground, flexShrink: 1 },
}));
