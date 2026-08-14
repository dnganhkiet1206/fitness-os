import { useEffect } from 'react';
import type { SharedValue } from 'react-native-reanimated';

import { KoaFigure } from '@/components/ascnd/koa/koa-figure';
import type { Worn } from '@/components/ascnd/koa/koa-flags';
import { VectorMascot } from '@/components/ascnd/vector-mascot';
import { useMascotEmotion } from '@/hooks/use-mascot-emotion';
import type { MascotMood } from '@/hooks/use-mascot';
import { koaStateFor } from '@/lib/koa-emotion';
import { koaMounted } from '@/lib/koa-presence';
import type { MascotEmotion } from '@/lib/mascot-emotion';
import { getShopItem } from '@/lib/mascot-room';
import type { MascotDef } from '@/lib/mascots';

/**
 * The companion figure.
 *
 * Koa is drawn from its design export — see `components/ascnd/koa/`. Every
 * other character in the roster has no art yet and falls back to the
 * built-in vector figure.
 *
 * There used to be a four-tier provider chain here (Rive → pre-rendered
 * image → Lottie → vector). The Rive and Lottie registries were empty by
 * design, and the image set only ever held Koa — which now never reaches
 * that branch — so all three were unreachable code carrying two native
 * dependencies and 4MB of superseded art. Give a new character art by
 * drawing it the way Koa is drawn, not by reviving them.
 */

interface Props {
  mascot: MascotDef;
  size?: number;
  mood?: MascotMood;
  /** Explicit emotion override. When omitted, the Emotion Engine drives it. */
  emotion?: MascotEmotion;
  level?: number;
  equippedOutfits?: Set<string>;
  animated?: boolean;
  /** pause the figure's clock in place (e.g. while the page scrolls) — see KoaFigure */
  scrollPause?: SharedValue<boolean>;
  /** the room's insect clock — Koa glances at whichever one has landed */
  gaze?: SharedValue<number>;
  /**
   * Trying clothes on — the shop's dressing pose.
   *
   * Koa only. It overrides whatever the Emotion Engine was saying, because for
   * as long as somebody is looking at an outfit, what the character feels about
   * today's step count is not the subject.
   */
  dress?: boolean;
}

/**
 * What the character is wearing, from the equipped shop keys.
 *
 * Shop outfits are Koa's own wardrobe items (`SHOP_ITEMS` in `mascot-room.ts`),
 * so each one already names the slot and the id the figure draws — there is no
 * mapping table any more, only a direct `worn[slot] = koaId`. Equipping is
 * one-per-slot (see `conflictingKeys`), so the last write per slot is also the
 * only one. Stage keys and anything unknown are skipped.
 */
function wornFrom(equipped: Set<string> | undefined): Worn {
  if (!equipped) return {};
  const worn: Worn = {};
  for (const key of equipped) {
    const item = getShopItem(key);
    if (item?.type === 'outfit' && item.slot && item.koaId) {
      worn[item.slot] = item.koaId;
    }
  }
  return worn;
}

/**
 * The figure, drawing whatever it is told to draw.
 *
 * ── the loop this split exists to break ──
 *
 * There was one component, and it called `useMascotEmotion()` *unconditionally*
 * — even when the caller had already said which face it wanted. The comment
 * said so, and treated it as a formality. It was not one.
 *
 * `useMascotEmotion` reads the profile, the streak, the day's log and today's
 * meals, because that is what deriving an emotion from somebody's day means.
 * And the app's error card — `LoadFailed`, the thing shown when a query fails —
 * draws a figure with `emotion="oops"`. So:
 *
 *   1. the profile query fails; the root gate renders `LoadFailed`;
 *   2. `LoadFailed` mounts a figure, which called the engine, which mounted a
 *      *new observer* on the failed profile query;
 *   3. React Query refetches a stale query when an observer mounts, so
 *      `isLoading` went true and `isError` went false;
 *   4. the gate's readiness test flipped back to "still loading" and returned
 *      `null` — the error card unmounted, taking its observer with it;
 *   5. the refetch failed, and step 1 began again.
 *
 * Measured in a browser against a server that fails only `profiles`: the app
 * oscillates between blank and a flash of the error card, for ever, at roughly
 * three attempts every three seconds, and shows nothing a person could read or
 * act on. Every static rule in `tools/` was green. It took `tools/live.mjs` to
 * see it — twenty-five routes blank in the failing-server world — and it is the
 * *second* time a single failing query has blanked this whole app.
 *
 * So: a figure given an explicit emotion subscribes to nothing. The engine
 * lives in a separate component, chosen by whether a caller supplied one, which
 * keeps both components' hooks unconditional. It also takes four query
 * subscriptions off every peek, every celebration, the shop and the unlock
 * screen — none of which ever wanted the engine's opinion.
 */
export function MascotFigure(props: Props) {
  return props.emotion ? (
    <FigureBody {...props} emotion={props.emotion} />
  ) : (
    <EngineFigure {...props} />
  );
}

/** The engine's opinion, for callers that did not bring their own. */
function EngineFigure(props: Props) {
  const emotion = useMascotEmotion();
  return <FigureBody {...props} emotion={emotion} />;
}

function FigureBody(props: Props & { emotion: MascotEmotion }) {
  /* Koa reports its own presence, so the decision engine can tell a reaction
     somebody will see from one played to an empty screen — see
     `lib/koa-presence.ts`. Cheap enough to do unconditionally: two integers. */
  useEffect(() => koaMounted(), []);

  // `mood` is not destructured: this branch does not use it, and the vector
  // fallback below takes it through `{...props}` with its own 'neutral'
  // default, so naming it here only left an unused local.
  const { mascot, size = 160, animated = true, scrollPause, emotion, gaze, dress } = props;

  if (mascot.id === 'koa') {
    const state = koaStateFor(emotion);
    return (
      <KoaFigure
        /**
         * The dressing reaction stands and looks pleased whatever the engine
         * was saying — a half-lidded `tired` face or a seated `relaxing` pose
         * is not somebody admiring a new outfit. Callers that want idle for
         * other reasons pin `emotion` instead; this only covers the pose's own
         * requirements so `dress` works wherever it is passed.
         */
        expression={dress ? 'happy' : state.expression}
        pose={dress ? 'idle' : state.pose}
        dress={dress}
        size={size}
        animated={animated}
        scrollPause={scrollPause}
        gaze={gaze}
        worn={{ ...wornFrom(props.equippedOutfits), ...state.outfit }}
      />
    );
  }

  // everyone else: the built-in vector figure
  return <VectorMascot {...props} />;
}
