import { usePathname } from 'expo-router';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { useMascotMood } from '@/hooks/use-mascot';
import { useDailyStreak } from '@/hooks/use-mascot-room';
import { useProfile } from '@/hooks/useTodayData';
import {
  ACTION_MS,
  baseEmotion,
  resolveEmotion,
  type MascotAction,
  type MascotEmotion,
} from '@/lib/mascot-emotion';

/**
 * The Emotion Engine's React layer.
 *
 * A module-level store holds the currently-playing one-shot action so any
 * screen can fire one (`triggerMascotAction`) and every mounted figure
 * reacts instantly — the same pattern the mascot settings store uses.
 * `useMascotEmotion()` blends that with the state-derived held emotion.
 */

let active: { action: MascotAction; expires: number } | null = null;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let greeted = false;

function emit() {
  listeners.forEach((l) => l());
}

// ── DEV emotion override — lets a dev force any emotion to test the animation
//    without recreating real conditions (streak / time of day / screen). Only
//    honoured in __DEV__. `null` = back to the real Emotion Engine. ──
let devOverride: MascotEmotion | null = null;
export function setDevEmotion(e: MascotEmotion | null) {
  devOverride = e;
  emit();
}
const getDevOverride = () => devOverride;
/** Emotions worth cycling through when testing the mascot animation. */
export const DEV_EMOTIONS: MascotEmotion[] = [
  'idle',
  'happy',
  'sad',
  'tired',
  'sleep',
  'celebrate',
  'curl',
  'wave',
  'run',
];

/** Play a one-shot action (celebrate on a PR, wave on open, curl on a lift). */
export function triggerMascotAction(action: MascotAction) {
  active = { action, expires: Date.now() + ACTION_MS[action] };
  emit();
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    active = null;
    timer = null;
    emit();
  }, ACTION_MS[action]);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
const getActive = () => active;

function useActiveAction(): MascotAction | null {
  const snap = useSyncExternalStore(subscribe, getActive, getActive);
  return snap?.action ?? null;
}

/**
 * Current emotion to render: the state-derived held emotion, overridden by
 * any active one-shot. Waves once per app session on first mount, and
 * re-derives every minute so the night→sleep switch happens without a nav.
 */
export function useMascotEmotion(): MascotEmotion {
  const mood = useMascotMood();
  const { data: streakData } = useDailyStreak();
  const streak = streakData?.count;
  const { data: profile } = useProfile();
  const pathname = usePathname();
  const action = useActiveAction();
  const devOverrideEmotion = useSyncExternalStore(subscribe, getDevOverride, getDevOverride);
  const onWorkoutScreen = /log-workout|workout/i.test(pathname ?? '');

  // Birthday = today's month/day matches the profile DOB (parsed local so
  // it doesn't shift a day in negative-offset timezones). Real data, no API.
  const isBirthday = (() => {
    const dob = profile?.dob;
    if (!dob) return false;
    const b = new Date(`${dob}T00:00:00`);
    if (Number.isNaN(b.getTime())) return false;
    const now = new Date();
    return b.getMonth() === now.getMonth() && b.getDate() === now.getDate();
  })();

  // Greet with a wave the first time the buddy appears this session.
  useEffect(() => {
    if (greeted) return;
    greeted = true;
    triggerMascotAction('wave');
  }, []);

  // Tick so hour-based emotions (sleep) update while the screen stays open.
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const resolved = useMemo(
    () =>
      resolveEmotion(
        baseEmotion({
          mood,
          streak: streak ?? 0,
          /* `false` while the query is unread, so a slow morning never puts a
             worried face on a day that may well be logged already. */
          streakAtRisk: streakData ? !streakData.loggedToday : false,
          hour: new Date().getHours(),
          onWorkoutScreen,
          isBirthday,
          // `cold` needs a weather source (location + API); off until then.
          cold: false,
        }),
        action,
      ),
    // `force` re-runs the memo via a re-render; hour is read fresh inside.
    [mood, streak, streakData, onWorkoutScreen, action, isBirthday],
  );

  // Dev override wins in development so animations are testable on demand.
  return __DEV__ && devOverrideEmotion ? devOverrideEmotion : resolved;
}
