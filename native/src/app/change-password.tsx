import * as Haptics from 'expo-haptics';
import { nav } from '@/lib/nav';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Check } from 'lucide-react-native';

import { PressScale } from '@/components/ascnd/press-scale';
import { Icon } from '@/components/ascnd/icon';
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
  // Stays disabled after success so the closing screen can't double-submit
  const [saved, setSaved] = useState(false);

  const tooShort = newPw.length > 0 && newPw.length < MIN_LENGTH;
  const mismatch = confirmPw.length > 0 && newPw !== confirmPw;
  const canSave = newPw.length >= MIN_LENGTH && newPw === confirmPw && !saving && !saved;

  const submit = async () => {
    if (!canSave) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) throw error;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSaved(true);
      nav.back();
      toast.success(i18n.settingsPasswordChanged);
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      toast.fail(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen back title={i18n.settingsChangePassword}>
      {/*
        A plain View, not a ScrollView.

        `Screen` already is one, and a vertical scroll view nested inside
        another vertical scroll view has no height to be bounded by: the outer
        one offers it unlimited space, so it reports whatever it likes and the
        page scrolls without ever reaching an end. The fields are near the top
        of a short form, so nothing needs to scroll out from under the
        keyboard.
      */}
      <View style={styles.content}>
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

          <PressScale
            style={[styles.button, !canSave && !saved && styles.buttonDisabled]}
            disabled={!canSave}
            onPress={submit}>
            {saved ? (
              <Icon icon={Check} size={22} color={colors.primaryForeground} strokeWidth={3} />
            ) : saving ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={styles.buttonText}>{i18n.settingsChangePassword}</Text>
            )}
          </PressScale>
      </View>
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
});
