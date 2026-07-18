import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
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

import { Screen } from '@/components/ascnd/screen';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/lib/toast';

const MIN_LENGTH = 6;

export default function ChangePasswordScreen() {
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const vi = lang === 'vi';
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [saving, setSaving] = useState(false);

  const tooShort = newPw.length > 0 && newPw.length < MIN_LENGTH;
  const mismatch = confirmPw.length > 0 && newPw !== confirmPw;
  const canSave = newPw.length >= MIN_LENGTH && newPw === confirmPw && !saving;

  const submit = async () => {
    if (!canSave) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) throw error;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
      toast.success(i18n.settingsPasswordChanged);
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen back title={i18n.settingsChangePassword}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.field}>
            <Text style={styles.label}>{i18n.settingsNewPassword}</Text>
            <TextInput
              style={styles.input}
              secureTextEntry
              autoCapitalize="none"
              textContentType="newPassword"
              placeholder="••••••••"
              placeholderTextColor={colors.mutedForeground}
              value={newPw}
              onChangeText={setNewPw}
            />
            {tooShort && (
              <Text style={styles.error}>
                {vi ? `Mật khẩu tối thiểu ${MIN_LENGTH} ký tự` : `Password must be at least ${MIN_LENGTH} characters`}
              </Text>
            )}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{i18n.settingsConfirmPassword}</Text>
            <TextInput
              style={styles.input}
              secureTextEntry
              autoCapitalize="none"
              textContentType="newPassword"
              placeholder="••••••••"
              placeholderTextColor={colors.mutedForeground}
              value={confirmPw}
              onChangeText={setConfirmPw}
            />
            {mismatch && <Text style={styles.error}>{i18n.settingsPasswordMismatch}</Text>}
          </View>

          <Pressable
            style={({ pressed }) => [styles.button, !canSave && styles.buttonDisabled, pressed && canSave && styles.pressed]}
            disabled={!canSave}
            onPress={submit}>
            {saving ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={styles.buttonText}>{i18n.settingsChangePassword}</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md },
  field: { gap: 6 },
  label: { ...type.caption, color: colors.mutedForeground, textTransform: 'uppercase', letterSpacing: 0.6 },
  input: {
    height: 50,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    color: colors.foreground,
    fontSize: 16,
  },
  error: { ...type.caption, color: colors.readinessRed },
  button: {
    height: 50,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { ...type.headline, color: colors.primaryForeground },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
