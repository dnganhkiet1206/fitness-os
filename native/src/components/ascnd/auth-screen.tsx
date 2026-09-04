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

import { PickRow } from '@/components/ascnd/pick-row';
import { PressScale } from '@/components/ascnd/press-scale';
import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import { radius, spacing, type } from '@/constants/ascnd';
import { alpha, makeStyles } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { supabase } from '@/integrations/supabase/client';
import { errorText } from '@/lib/error-copy';

type Mode = 'signin' | 'signup' | 'forgot';

/**
 * Auth — mirrors the web Auth page: language switcher top-right, glowing
 * ASCND wordmark, glass-card form, and the forgot-password flow.
 */
export function AuthScreen() {
  const c = usePalette();
  const styles = stylesFor(c);
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

  /*
    ── what the button is allowed to do ──

    `submit` used to open with `if (!email) return;` and carry a second silent
    `return` for a missing password. On the app's very first screen, tapping
    Sign In with a blank field therefore did **nothing at all** — no message, no
    haptic, no field highlight, nothing on screen changed. Found by running the
    app rather than reading it: an early return is perfectly ordinary code and
    no static check has an opinion about it.

    A dead tap on the first screen does not read as "you missed a field". It
    reads as the app being broken, which is the worst thing the first screen can
    say.

    The guards below stay as they are — they are correct, and defending the
    function against being called with nothing is not the same job as telling
    somebody why. This is the telling: the button says what it needs by not
    being ready until it has it, which is the same `canSave` shape the meal
    sheet already uses.
  */
  const needsPassword = mode !== 'forgot';
  const canSubmit = email.trim().length > 0 && (!needsPassword || password.length > 0);

  const submit = async () => {
    if (!email) return;
    setBusy(true);
    if (mode === 'forgot') {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      setBusy(false);
      Haptics.notificationAsync(
        error ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Success,
      );
      Alert.alert('ASCND', error ? errorText(error, i18n) : i18n.authResetSent);
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
    if (error) Alert.alert('ASCND', errorText(error, i18n));
  };

  const apple = async () => {
    const { error } = await signInWithApple();
    if (error && error.message !== 'Sign in cancelled') Alert.alert('ASCND', errorText(error, i18n));
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Language selector (web top-right) */}
      <PickRow
        value={lang}
        fill={alpha(c.primary, 0.15)}
        radius={radius.sm - 4}
        gap={6}
        style={[styles.langRow, { top: insets.top + spacing.sm }]}>
        {/* Not a choice, and not measured — only `PickRow.Item`s report a box,
            so a plain child like this sits in the row without the highlight
            ever being able to land on it. */}
        <Icon icon={Globe} size={15} color={c.mutedForeground} />
        {(['vi', 'en'] as const).map((l) => (
          <PickRow.Item
            key={l}
            itemKey={l}
            onPress={() => {
              Haptics.selectionAsync();
              setLang(l);
            }}
            style={styles.langChip}>
            <Text style={[styles.langText, lang === l && styles.langTextActive]}>
              {l.toUpperCase()}
            </Text>
          </PickRow.Item>
        ))}
      </PickRow>

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
            <Icon icon={ArrowLeft} size={15} color={c.mutedForeground} />
            <Text style={styles.backText}>{i18n.authBackToLogin}</Text>
          </Pressable>
        )}

        {/* Form card (web metric-card) */}
        <GlassCard style={styles.form}>
          {mode === 'signup' && (
            <TextInput
              style={styles.input}
              placeholder={i18n.nYourName}
              placeholderTextColor={c.mutedForeground}
              autoCapitalize="words"
              value={name}
              onChangeText={setName}
            />
          )}
          <TextInput
            style={styles.input}
            placeholder={i18n.nEmail}
            placeholderTextColor={c.mutedForeground}
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
              placeholderTextColor={c.mutedForeground}
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

          <PressScale
            style={[styles.primaryButton, (busy || !canSubmit) && styles.primaryButtonOff]}
            onPress={submit}
            disabled={busy || !canSubmit}>
            {busy ? (
              <ActivityIndicator color={c.primaryForeground} />
            ) : (
              <Text style={styles.primaryButtonText}>
                {mode === 'signin' ? i18n.nSignIn : mode === 'signup' ? i18n.nSignUp : i18n.authResetPassword}
              </Text>
            )}
          </PressScale>

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

const stylesFor = makeStyles((c) => ({
  root: {
    flex: 1,
    backgroundColor: c.background,
  },
  langRow: {
    position: 'absolute',
    right: spacing.md,
    zIndex: 20,
  },
  langChip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.sm - 4,
  },
  langText: { fontSize: 12, fontWeight: '500', color: c.mutedForeground },
  langTextActive: { color: c.primary },
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
    color: c.readinessGreen,
    textShadowColor: alpha(c.readinessGreen, 0.4),
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  subtitle: {
    ...type.body,
    color: c.mutedForeground,
    textAlign: 'center',
  },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  backText: { ...type.footnote, color: c.mutedForeground },
  form: {
    gap: spacing.sm + 4,
  },
  input: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    backgroundColor: alpha(c.primaryForeground, 0.5),
    paddingHorizontal: spacing.md,
    color: c.foreground,
    fontSize: 16,
  },
  forgotText: {
    ...type.footnote,
    color: c.mutedForeground,
    textAlign: 'right',
  },
  /* Dimmed rather than recoloured: the button keeps its shape and place, so
     filling the last field turns it on in front of you instead of swapping one
     control for another. */
  primaryButtonOff: { opacity: 0.45 },
  primaryButton: {
    height: 48,
    borderRadius: radius.full,
    backgroundColor: c.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  primaryButtonText: {
    ...type.headline,
    color: c.primaryForeground,
  },
  appleButton: {
    height: 48,
  },
  switchText: {
    ...type.footnote,
    color: c.mutedForeground,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  switchAction: {
    color: c.foreground,
    fontWeight: '600',
  },
}));
