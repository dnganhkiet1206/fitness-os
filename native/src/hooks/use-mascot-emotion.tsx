import { usePathname } from 'expo-router';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { useMascotMood } from '@/hooks/use-mascot';
import { useDailyStreak } from '@/hooks/use-mascot-room';
import { habitFor, usePersonalModel } from '@/lib/personal-model';
import { lateHour } from '@/lib/user-rhythm';
import { useProfile } from '@/hooks/useTodayData';
import {
  DEV_EMOTIONS,
  getDevOverride,
  getHeldEmotion,
  holdEmotion,
  setDevEmotion,
  subscribeEmotion,
  triggerMascotAction,
  baseEmotion,
  resolveEmotion,
  RISK_HOUR,
  type MascotAction,
  type MascotEmotion,
} from '@/lib/mascot-emotion';

/* Re-exported so the screens that already import these from this hook keep
   working; the channel itself now lives in `lib/mascot-emotion.ts`, which is
   what breaks the import cycle described there. */
export { DEV_EMOTIONS, holdEmotion, setDevEmotion, triggerMascotAction };

/* Session-scoped, and it stays in the hook rather than moving to the channel
   with the rest: "has the buddy said hello yet on this launch" is a fact about
   this React tree, not about the emotion store. */
let greeted = false;

/**
 * The Emotion Engine's React layer.
 *
 * A module-level store holds the currently-playing one-shot action so any
 * screen can fire one (`triggerMascotAction`) and every mounted figure
 * reacts instantly — the same pattern the mascot settings store uses.
 * `useMascotEmotion()` blends that with the state-derived held emotion.
 */


function useActiveAction(): MascotEmotion | null {
  const snap = useSyncExternalStore(subscribeEmotion, getHeldEmotion, getHeldEmotion);
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
  const personal = usePersonalModel();
  const streak = streakData?.count;
  const { data: profile } = useProfile();
  const pathname = usePathname();
  const action = useActiveAction();
  const devOverrideEmotion = useSyncExternalStore(subscribeEmotion, getDevOverride, getDevOverride);
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
          /* Their clock, not the app's. Meals are the most frequent log, so
             they are the best single read on when this person shows up. */
          riskHour: lateHour(habitFor('meal'), RISK_HOUR),
          hour: new Date().getHours(),
          onWorkoutScreen,
          isBirthday,
          // `cold` needs a weather source (location + API); off until then.
          cold: false,
        }),
        action,
      ),
    // `force` re-runs the memo via a re-render; hour is read fresh inside.
    [mood, streak, streakData, personal.hours, onWorkoutScreen, action, isBirthday],
  );

  // Dev override wins in development so animations are testable on demand.
  return __DEV__ && devOverrideEmotion ? devOverrideEmotion : resolved;
}
