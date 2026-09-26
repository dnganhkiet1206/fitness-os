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
import { BrandLockup } from '@/components/ascnd/brand-lockup';
import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import { radius, spacing, type } from '@/constants/ascnd';
import { alpha, makeStyles } from '@/constants/theme';
import { usePalette, useThemeName } from '@/hooks/use-palette';
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
  const theme = useThemeName();
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
      // không ném (#53): lỗi được báo ngay cho người dùng bằng Alert bên dưới
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
    // không ném (#53): huỷ đăng nhập Apple không phải lỗi; lỗi khác được báo bằng Alert
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
          {/*
            Cụm thương hiệu THẬT, không phải bản vẽ tay thứ hai.

            Chỗ này từng là `<Text>` chữ "ASCND" tô `readinessGreen` kèm quầng
            sáng 12pt — bản sao của trang web cũ, và app có tới BA cách vẽ cùng
            một cái tên: cụm thật ở đầu Today, bản này (30pt, giãn 4,5), và một
            bản nữa trong `onboarding-flow.tsx` (24pt, giãn 3,6). Hai bản vẽ tay
            lệch nhau đúng như `brand-lockup.tsx` đã cảnh báo sẽ xảy ra.

            `scale` 1,4 giữ đúng sức nặng của dòng chữ cũ (22 × 1,4 = 30,8 so
            với 30) và thêm vào thứ bản cũ không có: dấu hiệu koala, đúng hình
            người dùng chạm trên màn hình chính điện thoại, và mỗi theme lấy
            đúng tệp đã vẽ cho nó.
          */}
          <BrandLockup scale={1.4} />
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>

        {mode === 'forgot' && (
          <Pressable accessibilityRole="button" style={styles.backRow} onPress={() => setMode('signin')}>
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
            <Pressable accessibilityRole="button" onPress={() => setMode('forgot')} hitSlop={6}>
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
            /*
              Kiểu nút đi theo THEME, và bản sáng lấy viền chứ không lấy đen.

              ── lỗi ──

              Nút ghi cứng `WHITE`. Mặt thẻ bản sáng là `#ffffff`, nên đo trên
              ảnh chụp máy của chủ dự án: nền nút `#ffffff`, so với mặt thẻ
              **1,000:1**. Không phải kín đáo — là không có. Chủ dự án viết
              "nút sign in with apple bị tan vào trong nền".

              ── vì sao KHÔNG phải `BLACK`, vốn là câu trả lời hiển nhiên ──

              Hướng dẫn của Apple cho nền sáng là nút đen. Nhưng nút chính của
              app ngay phía trên tô `c.primary`, mà `c.primary` bản sáng là
              `#1a1917` — so với `#000000` chỉ **1,204:1**. Hai viên pill đen
              giống hệt nhau chồng lên nhau, và cái thứ hai đọc ra là một nút
              chính thứ hai.

              Apple để sẵn đúng một lối cho ca này: `WHITE_OUTLINE`, bản dành
              cho nền sáng khi một nút đen quá nặng. Viền vẽ ra hình viên pill ở
              tương phản đầy đủ, còn phần tô thì nhường cho nút chính — tức thứ
              tự "đặc là hành động chính, viền là hành động phụ" đọc được mà
              không cần một dòng chữ nào giải thích.

              Bản tối giữ `WHITE`: mặt thẻ ở đó là `#0e0e11`, và đen trên gần
              đen là đúng cái lỗi vừa sửa, soi gương.
            */
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={
                theme === 'dark'
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  : AppleAuthentication.AppleAuthenticationButtonStyle.WHITE_OUTLINE
              }
              cornerRadius={radius.full}
              style={styles.appleButton}
              onPress={apple}
            />
          )}

          {mode !== 'forgot' && (
            <Pressable accessibilityRole="button" onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
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

const stylesFor = makeStyles((c, m) => ({
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
    /* Một chỗ LÕM trong mặt thẻ, và đây là vai có tên cho nó.

       Cũ: `alpha(c.primaryForeground, 0.5)`. `primaryForeground` ĐẢO giữa hai
       theme — `#ffffff` bản sáng — nên trên mặt thẻ trắng nó composite ra đúng
       `#ffffff`: đo trên ảnh chụp máy ra **1,000:1**, ô nhập không có mặt nào,
       chỉ còn sợi viền vẽ ra nó. Cùng một lỗi với nút Apple ngay dưới, cùng
       một nguyên nhân: một biểu thức tự chế thay cho một vai đã có tên.

       `m.inset.bg` là mặt của một chỗ lõm TRÊN THẺ — 1,097:1 trên thẻ trắng,
       1,147:1 trên thẻ `#0e0e11`. `tools/on-page-fill.mjs` canh chiều ngược
       lại (không được dùng vai này khi đứng thẳng trên trang); ở đây có một
       mặt thẻ ở sau, nên đây đúng là chỗ nó dành cho. */
    backgroundColor: m.inset.bg,
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
    backgroundColor: m.actionSurface,
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
