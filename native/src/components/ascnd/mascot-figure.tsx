import type { SharedValue } from 'react-native-reanimated';

import { KoaFigure } from '@/components/ascnd/koa/koa-figure';
import type { Worn } from '@/components/ascnd/koa/koa-flags';
import { VectorMascot } from '@/components/ascnd/vector-mascot';
import { useMascotEmotion } from '@/hooks/use-mascot-emotion';
import type { MascotMood } from '@/hooks/use-mascot';
import { koaStateFor } from '@/lib/koa-emotion';
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

export function MascotFigure(props: Props) {
  // `mood` is not destructured: this branch does not use it, and the vector
  // fallback below takes it through `{...props}` with its own 'neutral'
  // default, so naming it here only left an unused local.
  const { mascot, size = 160, animated = true, scrollPause, emotion: emotionProp, gaze } = props;

  // The Emotion Engine drives the image companion; an explicit `emotion` prop
  // (e.g. the unlock celebration) overrides it. Hook runs unconditionally.
  const engineEmotion = useMascotEmotion();
  const emotion = emotionProp ?? engineEmotion;

  if (mascot.id === 'koa') {
    const state = koaStateFor(emotion);
    return (
      <KoaFigure
        expression={state.expression}
        pose={state.pose}
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
