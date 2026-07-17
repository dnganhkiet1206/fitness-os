import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { AppLockGate } from '@/components/ascnd/app-lock-gate';
import { AuthScreen } from '@/components/ascnd/auth-screen';
import { MascotUnlockCelebration } from '@/components/ascnd/mascot-unlock';
import { OnboardingFlow } from '@/components/ascnd/onboarding-flow';
import { colors } from '@/constants/ascnd';
import { AppLockProvider } from '@/hooks/use-app-lock';
import { AppSettingsProvider, useI18n } from '@/hooks/use-app-settings';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { useProfile } from '@/hooks/useTodayData';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

// ASCND is dark-first (matches the shipped Capacitor app)
const ascndTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.card,
    text: colors.foreground,
    primary: colors.primary,
    border: colors.border,
  },
};

function Gate() {
  const { user, loading } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();

  const ready = !loading && (!user || !profileLoading);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null; // splash stays up
  if (!user) return <AuthScreen />;
  if (profile && !profile.onboarding_completed) return <OnboardingFlow />;

  return (
    <>
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      {/* Input sheets use the standard iOS pageSheet modal (swipe down to
          dismiss) — native formSheet detents render blank content on this
          RN/react-native-screens combo (new-arch bug), so avoid them. */}
      <Stack.Screen
        name="log-meal"
        options={{
          presentation: 'modal',
          contentStyle: { backgroundColor: colors.card },
        }}
      />
      <Stack.Screen
        name="log-sleep"
        options={{
          presentation: 'modal',
          contentStyle: { backgroundColor: colors.card },
        }}
      />
      <Stack.Screen
        name="scan-barcode"
        options={{ presentation: 'fullScreenModal', contentStyle: { backgroundColor: '#000' } }}
      />
      <Stack.Screen
        name="scan-food"
        options={{ presentation: 'fullScreenModal', contentStyle: { backgroundColor: '#000' } }}
      />
      {(
        [
          'log-workout',
          'edit-profile',
          'log-biometrics',
          'food-editor',
          'log-measurement',
          'workout-builder',
        ] as const
      ).map((name) => (
        <Stack.Screen
          key={name}
          name={name}
          options={{
            presentation: 'modal',
            contentStyle: { backgroundColor: colors.card },
          }}
        />
      ))}
    </Stack>
    {/* RN Modal renders above everything, incl. native modals */}
    <MascotUnlockCelebration />
    </>
  );
}

/** Wraps the app in the biometric lock gate (needs i18n for the prompt). */
function LockedApp() {
  const i18n = useI18n();
  return (
    <AppLockProvider prompt={i18n.nLockPrompt}>
      <Gate />
      <AppLockGate />
    </AppLockProvider>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppSettingsProvider>
      <AuthProvider>
        <ThemeProvider value={ascndTheme}>
          <LockedApp />
        </ThemeProvider>
      </AuthProvider>
      </AppSettingsProvider>
    </QueryClientProvider>
  );
}
