import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import AppTabs from '@/components/app-tabs';
import { colors } from '@/constants/ascnd';

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

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={ascndTheme}>
        <AppTabs />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
