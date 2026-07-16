import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { AuthScreen } from '@/components/ascnd/auth-screen';
import { OnboardingFlow } from '@/components/ascnd/onboarding-flow';
import { colors } from '@/constants/ascnd';
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
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="log-meal"
        options={{
          // Native iOS form sheet with detents + grabber
          presentation: 'formSheet',
          sheetAllowedDetents: [0.6, 1.0],
          sheetGrabberVisible: true,
          sheetCornerRadius: 24,
          contentStyle: { backgroundColor: colors.card },
        }}
      />
      <Stack.Screen
        name="log-workout"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: [0.55, 1.0],
          sheetGrabberVisible: true,
          sheetCornerRadius: 24,
          contentStyle: { backgroundColor: colors.card },
        }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider value={ascndTheme}>
          <Gate />
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
