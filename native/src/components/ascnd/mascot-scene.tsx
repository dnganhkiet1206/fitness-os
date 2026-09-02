import { type SharedValue } from 'react-native-reanimated';

import { StageRenderer } from '@/components/ascnd/stage-renderer';
import type { MascotMood } from '@/hooks/use-mascot';
import { activeStageKey } from '@/lib/mascot-room';
import type { MascotDef } from '@/lib/mascots';

/**
 * The mascot showcase — a thin adapter over `StageRenderer`, which draws Koa
 * Studio with the buddy standing in it.
 *
 * Its one job is turning the equipped stage skin into a room theme. A skin
 * shifts the studio's wall and its warm colour; the design itself does not
 * change, which is what let the old themed stage go without the three stage
 * items in the shop losing their meaning.
 */
interface Props {
  mascot: MascotDef;
  /** the equipped set (outfits and the one active stage) */
  equippedOutfits: Set<string>;
  celebrateSignal: number;
  flexSignal?: number;
  mood?: MascotMood;
  level?: number;
  accent?: string;
  energy?: number;
  streak?: number;
  /** false pauses everything on the stage (screen not focused) */
  animated?: boolean;
  /** the page's mid-scroll shared value — the whole scene holds in place. See StageRenderer */
  hold?: SharedValue<boolean>;
}

/** stage item key → studio skin name (see `STUDIO_SKINS`) */
const STAGE_THEME: Record<string, string> = {
  stage_champion: 'champion',
  stage_sunset: 'sunset',
  stage_night: 'night',
};

export function MascotScene({
  mascot,
  equippedOutfits,
  celebrateSignal,
  flexSignal = 0,
  mood = 'neutral',
  level = 1,
  accent = '#8b93a4',
  energy = 0.5,
  streak,
  animated = true,
  hold,
}: Props) {
  // The stage the player has equipped drives the theme; none equipped is the
  // free default. This is what makes the shop's "Use" a real choice — the room
  // used to just show the dearest one owned, so buying a lower skin was moot
  // and its toggle did nothing.
  const active = activeStageKey(equippedOutfits);
  const themeKey = (active && STAGE_THEME[active]) ?? 'default';
  return (
    <StageRenderer
      mascot={mascot}
      equippedOutfits={equippedOutfits}
      themeKey={themeKey}
      mood={mood}
      level={level}
      accent={accent}
      energy={energy}
      celebrateSignal={celebrateSignal}
      flexSignal={flexSignal}
      streak={streak}
      animated={animated}
      hold={hold}
    />
  );
}
