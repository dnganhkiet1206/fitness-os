import * as AppleAuthentication from 'expo-apple-authentication';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import { colors, radius, spacing, type } from '@/constants/ascnd';

type Mode = 'signin' | 'signup';

export function AuthScreen() {
  const { signIn, signUp, signInWithApple } = useAuth();
  const insets = useSafeAreaInsets();
  const i18n = useI18n();
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email || !password) return;
    setBusy(true);
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
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.lg },
        ]}
        keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Text style={styles.brand}>ASCND</Text>
          <Text style={styles.subtitle}>
            {mode === 'signin' ? i18n.nSignInSubtitle : i18n.nSignUpSubtitle}
          </Text>
        </View>

        <View style={styles.form}>
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
          <TextInput
            style={styles.input}
            placeholder={i18n.nPassword}
            placeholderTextColor={colors.mutedForeground}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            onPress={submit}
            disabled={busy}>
            {busy ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={styles.primaryButtonText}>
                {mode === 'signin' ? i18n.nSignIn : i18n.nSignUp}
              </Text>
            )}
          </Pressable>

          {Platform.OS === 'ios' && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
              cornerRadius={radius.full}
              style={styles.appleButton}
              onPress={apple}
            />
          )}

          <Pressable onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
            <Text style={styles.switchText}>
              {mode === 'signin' ? i18n.nNoAccount : i18n.nHaveAccount}
              <Text style={styles.switchAction}>
                {mode === 'signin' ? i18n.nSignUp : i18n.nSignIn}
              </Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    gap: spacing.xl,
  },
  hero: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  brand: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 6,
    color: colors.foreground,
  },
  subtitle: {
    ...type.body,
    color: colors.mutedForeground,
  },
  form: {
    gap: spacing.sm + 4,
  },
  input: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    color: colors.foreground,
    fontSize: 16,
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
