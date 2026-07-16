import { Check, Plus, X } from 'lucide-react-native';
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

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { Screen } from '@/components/ascnd/screen';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';
import { useGroceryItems, useGroceryMutations } from '@/hooks/use-extras';

export default function GroceryScreen() {
  const { data: items } = useGroceryItems();
  const { add, toggle, remove } = useGroceryMutations();
  const i18n = useI18n();
  const [draft, setDraft] = useState('');

  const submit = () => {
    const name = draft.trim();
    if (!name) return;
    add.mutate(name);
    setDraft('');
  };

  return (
    <KeyboardAvoidingView style={styles.kav} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen title={i18n.nGrocery}>
        <View style={styles.addRow}>
          <TextInput
            style={styles.input}
            placeholder={i18n.nAddItem}
            placeholderTextColor={colors.mutedForeground}
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={submit}
            returnKeyType="done"
          />
          <Pressable
            style={({ pressed }) => [styles.addBtn, !draft.trim() && styles.disabled, pressed && styles.pressed]}
            disabled={!draft.trim()}
            onPress={submit}>
            <Icon icon={Plus} size={20} color={colors.primaryForeground} strokeWidth={2.5} />
          </Pressable>
        </View>

        {items && items.length > 0 ? (
          items.map((it) => (
            <Pressable
              key={it.id}
              onPress={() => toggle.mutate({ id: it.id, checked: !it.checked })}>
              <GlassCard style={styles.itemCard}>
                <View style={styles.itemRow}>
                  <View style={[styles.checkbox, it.checked && styles.checkboxOn]}>
                    {it.checked && <Icon icon={Check} size={13} color="#fff" strokeWidth={3} />}
                  </View>
                  <Text style={[styles.itemName, it.checked && styles.itemChecked]} numberOfLines={1}>
                    {it.name}
                    {it.quantity ? <Text style={styles.qty}>  ×{it.quantity}</Text> : null}
                  </Text>
                  <Pressable hitSlop={10} onPress={() => remove.mutate(it.id)}>
                    <Icon icon={X} size={15} color={colors.mutedForeground} />
                  </Pressable>
                </View>
              </GlassCard>
            </Pressable>
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

const styles = StyleSheet.create({
  kav: { flex: 1 },
  addRow: { flexDirection: 'row', gap: spacing.sm },
  input: {
    flex: 1,
    height: 48,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    color: colors.foreground,
    fontSize: 16,
  },
  addBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: { fontSize: 22, color: colors.primaryForeground, fontWeight: '600' },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  itemCard: { paddingVertical: spacing.md },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: colors.readinessGreen,
    borderColor: colors.readinessGreen,
  },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: '700' },
  itemName: { ...type.body, color: colors.foreground, flex: 1 },
  itemChecked: { color: colors.mutedForeground, textDecorationLine: 'line-through' },
  qty: { ...type.footnote, color: colors.mutedForeground },
  remove: { color: colors.mutedForeground, fontSize: 15 },
  emptyTitle: { ...type.headline, color: colors.foreground },
  emptyHint: { ...type.footnote, color: colors.mutedForeground, marginTop: 2 },
});
