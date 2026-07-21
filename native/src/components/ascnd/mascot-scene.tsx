import { StageRenderer } from '@/components/ascnd/stage-renderer';
import type { MascotMood } from '@/hooks/use-mascot';
import type { MascotDef } from '@/lib/mascots';

/**
 * The mascot showcase. Thin adapter over the code-drawn StageRenderer — the
 * product direction is a Stage (spotlighted buddy), not a furniture room, so
 * the existing call sites keep this API while the visuals come from the Stage.
 * Stage skin is chosen by owned stage-theme unlocks (see stage-theme.json).
 */
interface Props {
  mascot: MascotDef;
  ownedGym: Set<string>;
  equippedOutfits: Set<string>;
  celebrateSignal: number;
  flexSignal?: number;
  mood?: MascotMood;
  level?: number;
  accent?: string;
  energy?: number;
}

const STAGE_UNLOCKS: [string, string][] = [
  ['stage_champion', 'champion'],
  ['stage_sunset', 'sunset'],
  ['stage_night', 'night'],
];

export function MascotScene({
  mascot,
  ownedGym,
  equippedOutfits,
  celebrateSignal,
  flexSignal = 0,
  mood = 'neutral',
  level = 1,
  accent = '#8b93a4',
  energy = 0.5,
}: Props) {
  // Highest owned stage skin wins; falls back to the default aurora.
  const themeKey = STAGE_UNLOCKS.find(([key]) => ownedGym.has(key))?.[1] ?? 'aurora';
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
    />
  );
}
