import { RoomRenderer } from '@/components/ascnd/room-renderer';
import type { MascotMood } from '@/hooks/use-mascot';
import type { MascotDef } from '@/lib/mascots';

/**
 * The mascot's gym room. Thin adapter over the data-driven RoomRenderer:
 * the existing call sites keep this API, while positions/skin/placement
 * now live in src/config/room/{scene,theme,user_room}.json. The set of
 * placed gear (`ownedGym`) and rank accent flow straight through.
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
  // Pro neon floor upgrade swaps the room skin.
  const themeKey = ownedGym.has('floor_neon') ? 'neon_pro' : 'neon';
  return (
    <RoomRenderer
      mascot={mascot}
      owned={ownedGym}
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
