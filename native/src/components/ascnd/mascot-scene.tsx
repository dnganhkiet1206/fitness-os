import { StageRenderer } from '@/components/ascnd/stage-renderer';
import type { MascotMood } from '@/hooks/use-mascot';
import type { MascotDef } from '@/lib/mascots';

/**
 * The mascot showcase — a thin adapter over `StageRenderer`, which draws Koa
 * Studio with the buddy standing in it.
 *
 * Its one job is turning owned shop unlocks into a room skin. A skin shifts
 * the studio's wall and its warm colour; the design itself does not change,
 * which is what let the old themed stage go without the three stage items in
 * the shop losing their meaning.
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
  streak?: number;
  /** false pauses everything on the stage (screen not focused) */
  animated?: boolean;
  /** the page is mid-scroll — the buddy's clock holds in place. See StageRenderer */
  scrolling?: boolean;
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
  streak,
  animated = true,
  scrolling = false,
}: Props) {
  // Highest owned stage skin wins; falls back to the default gym.
  const themeKey = STAGE_UNLOCKS.find(([key]) => ownedGym.has(key))?.[1] ?? 'default';
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
      scrolling={scrolling}
    />
  );
}
