import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useEffect } from 'react';

import { AppLockGate } from '@/components/ascnd/app-lock-gate';
import { AuthScreen } from '@/components/ascnd/auth-screen';
import { CelebrationHost } from '@/components/ascnd/celebration-host';
import { MascotUnlockCelebration } from '@/components/ascnd/mascot-unlock';
import { NeonToastHost } from '@/components/ascnd/neon-toast';
import { OfflineBanner } from '@/components/ascnd/offline-banner';
import { useReducedMotionSync } from '@/hooks/use-reduced-motion';
import { OnboardingFlow } from '@/components/ascnd/onboarding-flow';
import { colors } from '@/constants/ascnd';
import { AppLockProvider } from '@/hooks/use-app-lock';
import { AppSettingsProvider, useI18n } from '@/hooks/use-app-settings';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { CoachChatProvider } from '@/hooks/use-coach-chat';
import { useAutoHealthSync } from '@/hooks/use-health-sync';
import { useProfile } from '@/hooks/useTodayData';
import { asyncStoragePersister, CACHE_BUSTER, queryClient } from '@/lib/query-client';

SplashScreen.preventAutoHideAsync();

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

/** Renders nothing; keeps Apple Health current. See `useAutoHealthSync`. */
function HealthAutoSync() {
  useAutoHealthSync();
  return null;
}

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
    {/*
      Health data refreshes itself from here.

      Below the auth and onboarding gates on purpose: there is no point reading
      a watch for somebody who has not finished telling us who they are, and
      nothing should touch the Health sheet while an onboarding step is on
      screen. It renders nothing — it is a hook that needs a place to live.
    */}
    <HealthAutoSync />
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
      {/* Mascot room is a game surface — disable the edge swipe-back so
          dragging on the stage (poke / future rotate) never navigates away.
          Use the on-screen back chevron to leave. */}
      <Stack.Screen name="mascot-room" options={{ gestureEnabled: false }} />
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
    {/* Detector (enqueues mascot unlocks) + shared host that shows one
        celebration at a time — award medals and mascot unlocks queue up */}
    <MascotUnlockCelebration />
    <CelebrationHost />
    </>
  );
}

/** Wraps the app in the biometric lock gate (needs i18n for the prompt). */
function LockedApp() {
  const i18n = useI18n();
  // Keeps `reduceMotionSV` current for the two frame clocks that Reanimated's
  // own reduce-motion handling cannot reach — see `use-reduced-motion.ts`.
  useReducedMotionSync();
  return (
    <AppLockProvider prompt={i18n.nLockPrompt}>
      {/*
        The coach's conversation lives above the router.

        The Health Assistant's ask bar takes text directly, and the chat it
        starts should not be at the mercy of that tab remounting. Holding it
        here also keeps the streaming request out of a screen. See
        `use-coach-chat`.

        Inside the lock, so a locked app is not holding a chat in memory behind
        the prompt; below `AuthProvider` and the query client, both of which it
        reads.
      */}
      <CoachChatProvider>
        <Gate />
      </CoachChatProvider>
      <OfflineBanner />
      <NeonToastHost />
      <AppLockGate />
    </AppLockProvider>
  );
}

export default function RootLayout() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister: asyncStoragePersister, maxAge: 1000 * 60 * 60 * 24, buster: CACHE_BUSTER }}
      /*
        Finish whatever the last session could not send.

        `onSuccess` fires once the persisted cache has been read back, which is
        the earliest moment a paused mutation exists again — before it, there is
        nothing to resume; the provider is what puts it there.

        `registerOfflineWrites` has already run at module scope, so the function
        those mutations need is waiting for them. In the other order a restored
        write arrives with its variables and nowhere to take them, and React
        Query drops it — which from outside is exactly what "the app forgot my
        workout" looks like.
      */
      onSuccess={() => {
        void queryClient.resumePausedMutations();
      }}>
      <AppSettingsProvider>
      <AuthProvider>
        <ThemeProvider value={ascndTheme}>
          <LockedApp />
        </ThemeProvider>
      </AuthProvider>
      </AppSettingsProvider>
    </PersistQueryClientProvider>
  );
}
