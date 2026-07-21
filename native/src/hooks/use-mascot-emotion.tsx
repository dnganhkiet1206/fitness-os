import { usePathname } from 'expo-router';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { useMascotMood } from '@/hooks/use-mascot';
import { useDailyStreak } from '@/hooks/use-mascot-room';
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
  const { data: streak } = useDailyStreak();
  const pathname = usePathname();
  const action = useActiveAction();
  const onWorkoutScreen = /log-workout|workout/i.test(pathname ?? '');

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

  return useMemo(
    () =>
      resolveEmotion(
        baseEmotion({
          mood,
          streak: streak ?? 0,
          hour: new Date().getHours(),
          onWorkoutScreen,
        }),
        action,
      ),
    // `force` re-runs the memo via a re-render; hour is read fresh inside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mood, streak, onWorkoutScreen, action],
  );
}
