import { StageRenderer } from '@/components/ascnd/stage-renderer';
import type { MascotMood } from '@/hooks/use-mascot';
import type { MascotDef } from '@/lib/mascots';

/**
 * The mascot showcase. Thin adapter over the code-drawn StageRenderer — the
 * product direction is a code-drawn gym room with the buddy on a glowing
 * podium. The existing call sites keep this API while the visuals come from the
 * Stage. Stage skin is chosen by owned stage-theme unlocks (see
 * stage-theme.json).
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
  xp?: number;
  xpMax?: number;
  streak?: number;
  questCount?: number;
  questTotal?: number;
  streakLabel?: string;
  questLabel?: string;
  topInset?: number;
  /** false pauses everything on the stage (screen not focused) */
  animated?: boolean;
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
  xp,
  xpMax,
  streak,
  questCount,
  questTotal,
  streakLabel,
  questLabel,
  topInset,
  animated = true,
}: Props) {
  // Highest owned stage skin wins; falls back to the default gym.
  const themeKey = STAGE_UNLOCKS.find(([key]) => ownedGym.has(key))?.[1] ?? 'arena';
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
      xp={xp}
      xpMax={xpMax}
      streak={streak}
      questCount={questCount}
      questTotal={questTotal}
      streakLabel={streakLabel}
      questLabel={questLabel}
      topInset={topInset}
      animated={animated}
    />
  );
}
