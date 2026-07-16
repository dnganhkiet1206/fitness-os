import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { AuthScreen } from '@/components/ascnd/auth-screen';
import { colors } from '@/constants/ascnd';
import { AuthProvider, useAuth } from '@/hooks/use-auth';

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

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  if (loading) return null; // splash stays up
  if (!user) return <AuthScreen />;

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
