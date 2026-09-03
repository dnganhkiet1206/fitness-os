import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useEffect, useMemo, type ReactNode } from 'react';

import { AppLockGate } from '@/components/ascnd/app-lock-gate';
import { AuthScreen } from '@/components/ascnd/auth-screen';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { CelebrationHost } from '@/components/ascnd/celebration-host';
import { KoaCompanion } from '@/components/ascnd/koa-companion';
import { QuestAutoClaim } from '@/components/ascnd/quest-autoclaim';
import { MascotUnlockCelebration } from '@/components/ascnd/mascot-unlock';
import { NeonToastHost } from '@/components/ascnd/neon-toast';
import { ConnectionBanner } from '@/components/ascnd/connection-banner';
import { useReducedMotionSync } from '@/hooks/use-reduced-motion';
import { OnboardingFlow } from '@/components/ascnd/onboarding-flow';
import { makeStyles } from '@/constants/theme';
import { usePalette, useThemeName } from '@/hooks/use-palette';
import { AppLockProvider } from '@/hooks/use-app-lock';
import { installCrashHandler } from '@/lib/crash-log';
import { AppSettingsProvider, useI18n } from '@/hooks/use-app-settings';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { CoachChatProvider } from '@/hooks/use-coach-chat';
import { useAutoHealthSync } from '@/hooks/use-health-sync';
import { useProfile } from '@/hooks/useTodayData';
import { asyncStoragePersister, CACHE_BUSTER, queryClient } from '@/lib/query-client';

SplashScreen.preventAutoHideAsync();

/**
 * Theme của navigator, dựng từ bảng màu đang dùng.
 *
 * ── nó từng là một hằng số module, và đó là lý do không đổi được ──
 *
 * Bản cũ mở đầu bằng chú thích "ASCND is dark-first" và đóng băng `DarkTheme`
 * cộng sáu mã màu lúc import. Giá trị này quyết định NỀN phía sau mọi màn hình
 * và màu chữ mặc định của navigator, nên chừng nào nó còn là hằng số thì không
 * một màn nào có thể sáng lên — nội dung sẽ nổi trên một khoảng đen.
 *
 * `dark` là một cờ THẬT với React Navigation, không phải nhãn: nó lái màu của
 * status bar và của các bề mặt native mà app không vẽ. Đặt sai cờ ấy là có một
 * trang sáng dưới một thanh trạng thái chữ trắng.
 */
function NavTheme({ children }: { children: ReactNode }) {
  const name = useThemeName();
  const c = usePalette();
  const value = useMemo(() => {
    const base = name === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      dark: name === 'dark',
      colors: {
        ...base.colors,
        background: c.background,
        card: c.card,
        text: c.foreground,
        primary: c.primary,
        border: c.border,
      },
    };
  }, [name, c]);
  return <ThemeProvider value={value}>{children}</ThemeProvider>;
}

/** Renders nothing; keeps Apple Health current. See `useAutoHealthSync`. */
function HealthAutoSync() {
  useAutoHealthSync();
  return null;
}

function Gate() {
  const i18n = useI18n();
  /* Nền của các sheet modal đọc bảng màu đang dùng. Bản cũ đóng băng
     `colors.card` lúc import, nên một sheet ghi bữa ăn ở theme sáng sẽ mở ra
     trên một tấm #0e0e11 — nội dung sáng trên một khoảng đen, và cú trượt
     xuống để đóng lộ ra đúng cái mép ấy. */
  const c = usePalette();
  const gateStyles = gateStylesFor(c);
  const { user, loading } = useAuth();
  const {
    data: profile,
    isLoading: profileLoading,
    isError: profileFailed,
    refetch: refetchProfile,
    isRefetching: profileRefetching,
  } = useProfile();

  /*
    ── one query must not hold the whole app hostage ──

    This read `!loading && (!user || !profileLoading)` and returned `null` — the
    splash — whenever it was false. Measured against a server that fails only
    the `profiles` request and answers everything else normally: the app is
    **blank for ever**. Thirty-five seconds in, still nothing. No error, no
    retry, no explanation; force-quitting and reopening does it again.

    Nothing else was needed to cause it. Failing every *other* query left the
    app working perfectly, so this is one read deciding whether the product
    exists.

    A failure is now an answer, the same as an empty one. It ends the wait.
  */
  const ready = !loading && (!user || !profileLoading || profileFailed);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null; // splash stays up
  if (!user) return <AuthScreen />;

  /*
    Failed, and nothing cached to fall back on.

    The persisted cache means a returning user never sees this: their last-known
    profile is already in memory and the app carries on offline. It is the
    person with no cached profile and a failing read who gets here — a first
    launch, a fresh sign-in, a reinstall — and for them the alternative is
    entering an app with no calorie target and no macro targets, where every
    number is quietly built from a default that is not theirs.

    So: say so, and offer the retry. Silence was the bug.
  */
  if (profileFailed && !profile) {
    return (
      <View style={gateStyles.gateFail}>
        <LoadFailed i18n={i18n} onRetry={() => void refetchProfile()} busy={profileRefetching} />
      </View>
    );
  }

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
          contentStyle: { backgroundColor: c.card },
        }}
      />
      <Stack.Screen
        name="log-sleep"
        options={{
          presentation: 'modal',
          contentStyle: { backgroundColor: c.card },
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
            contentStyle: { backgroundColor: c.card },
          }}
        />
      ))}
    </Stack>
    {/* Detector (enqueues mascot unlocks) + shared host that shows one
        celebration at a time — award medals and mascot unlocks queue up */}
    <MascotUnlockCelebration />
    <CelebrationHost />
    {/* Finished quests collect themselves, from wherever you were when you
        finished them — see `use-quest-autoclaim`. Mounted once, at the root,
        because the thing that finishes a quest is a mutation on some other tab
        and the room may never be opened at all. */}
    <QuestAutoClaim />
    {/* Koa, on every screen instead of only Today. Mounted here and not inside
        the tabs because the character should also be beside you on a pushed
        route; mounted *after* the Stack so it draws above the page, and inside
        this branch so it is absent whenever `Gate` is showing `LoadFailed` —
        the card that exists because a read failed must not gain a neighbour
        that reads. */}
    <KoaCompanion />
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
      <ConnectionBanner />
      <NeonToastHost />
      <AppLockGate />
    </AppLockProvider>
  );
}

export default function RootLayout() {
  /*
    Gắn TRƯỚC mọi thứ khác, và ở thân component chứ không trong `useEffect`.

    Một lỗi ném ra lúc dựng cây — đúng loại lỗi hay giết app nhất — xảy ra
    TRƯỚC khi effect đầu tiên chạy. Đặt trong `useEffect` thì cái handler chỉ
    có mặt cho những lỗi xảy ra sau khi màn đầu đã vẽ xong, tức bỏ lỡ đúng
    khoảnh khắc nguy hiểm nhất.

    `installCrashHandler` tự chốt một lần, nên gọi ở mỗi lần render không tốn gì.
  */
  installCrashHandler();
  return (
    /*
      Every gesture in the app hangs off this, and its absence was a crash.

      `GestureDetector` and `ReanimatedSwipeable` both throw on mount without
      it: "must be used as a descendant of GestureHandlerRootView". It has to be
      the OUTERMOST thing, above the query client and the providers, because a
      gesture anywhere below it is a gesture inside it.

      ── why the screenshot runner said everything was fine ──

      It renders the app for web, and on web gesture-handler does not require
      this wrapper at all. So 31 screens × 3 states came back green while the
      swipe-to-delete row on /sessions and the hero deck on Today both crashed
      the moment they mounted on a device. `tools/gesture-root.mjs` is the rule
      that covers what that runner structurally cannot see.
    */
    <GestureHandlerRootView style={styles.root}>
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
        <NavTheme>
          <LockedApp />
        </NavTheme>
      </AuthProvider>
      </AppSettingsProvider>
    </PersistQueryClientProvider>
    </GestureHandlerRootView>
  );
}

/* `root` không có màu nào, nên nó KHÔNG cần theme — giữ tĩnh.
   Đưa một style không màu vào `makeStyles` là bắt nó dựng lại một lần cho mỗi
   bảng màu để ra đúng cùng một kết quả, và nó nằm ở component NGOÀI cùng —
   ngoài cả `AppSettingsProvider`, nơi không có bảng màu nào để đọc. */
const styles = StyleSheet.create({
  /* The gesture root replaces the window as the app's outermost box, so it has
     to fill it — without `flex: 1` it collapses to its content and the app
     renders in a strip at the top. */
  root: { flex: 1 },
});

const gateStylesFor = makeStyles((c) => ({
  /* Centred on the app's own background, because this replaces the entire
     screen — it is not a card inside a page that failed, it is the page. */
  gateFail: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: c.background,
  },
}));
