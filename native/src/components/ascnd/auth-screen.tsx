import * as AppleAuthentication from 'expo-apple-authentication';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, Globe } from 'lucide-react-native';
import { useEffect, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { supabase } from '@/integrations/supabase/client';

type Mode = 'signin' | 'signup' | 'forgot';

/**
 * Auth — mirrors the web Auth page: language switcher top-right, glowing
 * ASCND wordmark, glass-card form, and the forgot-password flow.
 */
export function AuthScreen() {
  const { signIn, signUp, signInWithApple } = useAuth();
  const insets = useSafeAreaInsets();
  const i18n = useI18n();
  const { lang, setLang } = useAppSettings();
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  // Only offer Apple sign-in when the device/build actually supports it —
  // hides the button on a free-account build stripped of the entitlement.
  const [appleAvailable, setAppleAvailable] = useState(false);
  useEffect(() => {
    let alive = true;
    AppleAuthentication.isAvailableAsync()
      .then((ok) => alive && setAppleAvailable(ok))
      .catch(() => alive && setAppleAvailable(false));
    return () => {
      alive = false;
    };
  }, []);

  const subtitle =
    mode === 'signin'
      ? i18n.nSignInSubtitle
      : mode === 'signup'
        ? i18n.nSignUpSubtitle
        : lang === 'vi'
          ? 'Nhập email để nhận link đặt lại mật khẩu'
          : 'Enter your email to receive a reset link';

  const submit = async () => {
    if (!email) return;
    setBusy(true);
    if (mode === 'forgot') {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      setBusy(false);
      Haptics.notificationAsync(
        error ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Success,
      );
      Alert.alert('ASCND', error ? error.message : i18n.authResetSent);
      if (!error) setMode('signin');
      return;
    }
    if (!password) {
      setBusy(false);
      return;
    }
    const { error } =
      mode === 'signin' ? await signIn(email, password) : await signUp(email, password, name);
    setBusy(false);
    if (error) Alert.alert('ASCND', error.message);
  };

  const apple = async () => {
    const { error } = await signInWithApple();
    if (error && error.message !== 'Sign in cancelled') Alert.alert('ASCND', error.message);
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Language selector (web top-right) */}
      <View style={[styles.langRow, { top: insets.top + spacing.sm }]}>
        <Icon icon={Globe} size={15} color={colors.mutedForeground} />
        {(['vi', 'en'] as const).map((l) => (
          <Pressable
            key={l}
            onPress={() => {
              Haptics.selectionAsync();
              setLang(l);
            }}
            style={[styles.langChip, lang === l && styles.langChipActive]}>
            <Text style={[styles.langText, lang === l && styles.langTextActive]}>
              {l.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.lg },
        ]}
        keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Text style={styles.brand}>ASCND</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>

        {mode === 'forgot' && (
          <Pressable style={styles.backRow} onPress={() => setMode('signin')}>
            <Icon icon={ArrowLeft} size={15} color={colors.mutedForeground} />
            <Text style={styles.backText}>{i18n.authBackToLogin}</Text>
          </Pressable>
        )}

        {/* Form card (web metric-card) */}
        <GlassCard style={styles.form}>
          {mode === 'signup' && (
            <TextInput
              style={styles.input}
              placeholder={i18n.nYourName}
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="words"
              value={name}
              onChangeText={setName}
            />
          )}
          <TextInput
            style={styles.input}
            placeholder={i18n.nEmail}
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          {mode !== 'forgot' && (
            <TextInput
              style={styles.input}
              placeholder={i18n.nPassword}
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          )}

          {mode === 'signin' && (
            <Pressable onPress={() => setMode('forgot')} hitSlop={6}>
              <Text style={styles.forgotText}>{i18n.authForgotPassword}</Text>
            </Pressable>
          )}

          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            onPress={submit}
            disabled={busy}>
            {busy ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={styles.primaryButtonText}>
                {mode === 'signin' ? i18n.nSignIn : mode === 'signup' ? i18n.nSignUp : i18n.authResetPassword}
              </Text>
            )}
          </Pressable>

          {Platform.OS === 'ios' && appleAvailable && mode !== 'forgot' && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
              cornerRadius={radius.full}
              style={styles.appleButton}
              onPress={apple}
            />
          )}

          {mode !== 'forgot' && (
            <Pressable onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
              <Text style={styles.switchText}>
                {mode === 'signin' ? i18n.nNoAccount : i18n.nHaveAccount}
                <Text style={styles.switchAction}>
                  {mode === 'signin' ? i18n.nSignUp : i18n.nSignIn}
                </Text>
              </Text>
            </Pressable>
          )}
        </GlassCard>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  langRow: {
    position: 'absolute',
    right: spacing.md,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  langChip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.sm - 4,
  },
  langChipActive: { backgroundColor: 'rgba(168,175,189,0.15)' },
  langText: { fontSize: 12, fontWeight: '500', color: colors.mutedForeground },
  langTextActive: { color: colors.primary },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    gap: spacing.xl,
  },
  hero: {
    alignItems: 'center',
    gap: spacing.sm + 4,
  },
  // Web wordmark: green gradient + glow, wide tracking
  brand: {
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: 4.5,
    color: colors.readinessGreen,
    textShadowColor: 'rgba(32,182,132,0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  subtitle: {
    ...type.body,
    color: colors.mutedForeground,
    textAlign: 'center',
  },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  backText: { ...type.footnote, color: colors.mutedForeground },
  form: {
    gap: spacing.sm + 4,
  },
  input: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: 'rgba(7,7,8,0.5)',
    paddingHorizontal: spacing.md,
    color: colors.foreground,
    fontSize: 16,
  },
  forgotText: {
    ...type.footnote,
    color: colors.mutedForeground,
    textAlign: 'right',
  },
  primaryButton: {
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  primaryButtonText: {
    ...type.headline,
    color: colors.primaryForeground,
  },
  appleButton: {
    height: 48,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  switchText: {
    ...type.footnote,
    color: colors.mutedForeground,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  switchAction: {
    color: colors.foreground,
    fontWeight: '600',
  },
});
