/**
 * Where the companion stands, and when it moves.
 *
 * ── the complaint this answers ──
 *
 * Koa thinks everywhere and appears in one place. `useKoaContext` is read by
 * `use-extras`, `use-quest-autoclaim` and `use-streak-guard` — the whole app —
 * while the only thing that *draws* the character is `mascot.tsx`, a 54pt
 * figure at the top of Today. So the character has a mind that follows you and
 * a body that does not.
 *
 * ── and the two ways making it follow you goes wrong ──
 *
 * **It gets boring.** A companion pinned to one corner is wallpaper by the
 * second day; the eye stops seeing it exactly the way it stopped seeing the
 * thumbnail.
 *
 * **It gets annoying.** A companion that drifts on a timer is a thing moving in
 * your peripheral vision while you are trying to read a number, and motion beats
 * type every time — the same sentence `assistant-aura.tsx` is built around.
 *
 * The rule that avoids both is that **movement has to be caused**. Koa moves
 * when something about you changed — a new emotion, a different screen — and
 * holds perfectly still otherwise. Nothing here is on a clock and nothing is
 * random per render. So it is never twitching, and it is never in the same place
 * long enough to disappear.
 *
 * ── it stands at the bottom edge, half submerged ──
 *
 * The first version put Koa in the left and right margins, on the theory that a
 * page of full-width cards leaves gutters. Rendered, there are no gutters: the
 * cards run to within sixteen points of both edges, and the character landed on
 * top of a section heading on the Workouts tab.
 *
 * So the character stands *at the bottom edge*, with only part of itself above
 * it — the way something leans into a room from a doorway. Its footprint on the
 * page is a couple of dozen points in a corner instead of a whole figure in the
 * middle of the text.
 *
 * And the constraint turned into the expression. **How far it rises out of the
 * edge is the mood**: pleased and it comes right up, winding down and it sinks
 * until only the top of its head shows. That says more than a position in a
 * margin ever did, and it costs no new art.
 *
 * ── and it never repeats the spot it just left ──
 *
 * Caused movement alone is not enough: two changes that map to the same perch
 * would read as "it didn't move", which is worse than not moving at all,
 * because the change that caused it is then invisible. `nextPerch` is told
 * where the character already is and will not choose it again.
 */
import type { MascotEmotion } from '@/lib/mascot-emotion';

/**
 * The spots, as fractions of the usable area.
 *
 * All of them sit in the horizontal gutters, low on the screen, because that is
 * where content is not: every tab in this app is a vertical scroll of
 * full-width cards, so the margins beside the last card are the only place a
 * character can stand without covering something somebody is reading.
 *
 * `x` is 0 at the left edge and 1 at the right; `y` is 0 at the top of the
 * usable area and 1 at the bottom of it. The host turns those into points once
 * it knows the safe-area insets and the tab bar.
 */
export interface Perch {
  id: PerchId;
  /** 0 at the left edge, 1 at the right */
  x: number;
  /**
   * How much of the figure clears the bottom edge, 0..1.
   *
   * 1 is standing on the edge, fully visible. 0.35 is sunk to the shoulders.
   * This is the mood, and it is also the whole reason the character does not
   * cover the page: at 0.5 its footprint is half a small figure in a corner.
   */
  rise: number;
  /** which way the character looks from here — outward reads as loitering */
  facing: 'left' | 'right';
  /** further away = smaller; the sunk perches are quieter on purpose */
  scale: number;
}

export type PerchId = 'restLeft' | 'restRight' | 'midLeft' | 'midRight' | 'lowLeft' | 'lowRight';

export const PERCHES: Record<PerchId, Perch> = {
  /* Up on the edge — something good happened and it came to look. */
  midLeft: { id: 'midLeft', x: 0.11, rise: 0.92, facing: 'right', scale: 1 },
  midRight: { id: 'midRight', x: 0.89, rise: 0.92, facing: 'left', scale: 1 },
  /* Half out. The ordinary state, and the smallest one that still reads as a
     whole character rather than an ornament. */
  restLeft: { id: 'restLeft', x: 0.10, rise: 0.62, facing: 'right', scale: 0.96 },
  restRight: { id: 'restRight', x: 0.90, rise: 0.62, facing: 'left', scale: 0.96 },
  /* Sunk to the shoulders. Where a character goes to be out of the way rather
     than to be looked at, and the only thing left on the page is a head. */
  lowLeft: { id: 'lowLeft', x: 0.09, rise: 0.38, facing: 'right', scale: 0.9 },
  lowRight: { id: 'lowRight', x: 0.91, rise: 0.38, facing: 'left', scale: 0.9 },
};

/**
 * Which family of perch a feeling belongs in.
 *
 * Height carries the mood, and that is the whole mapping — a character that is
 * pleased stands up a bit, one that is winding down tucks itself away. It does
 * not need a new gesture or a new drawing to say so, which matters because
 * every emotion here already has art and none of it has to change.
 *
 * Deliberately coarse. Fifteen emotions mapped to fifteen positions would be a
 * table nobody can hold in their head and a character that appears to teleport
 * on distinctions no one can see.
 */
export type PerchBand = 'lifted' | 'resting' | 'tucked';

export function bandFor(emotion: MascotEmotion): PerchBand {
  switch (emotion) {
    /* Something good happened. Stand up. */
    case 'celebrate':
    case 'proud':
    case 'happy':
    case 'wave':
      return 'lifted';
    /* Done for the day, or quietly unwell. Out of the way — and `worry` belongs
       here rather than in `lifted` on purpose: a character that climbs up the
       screen because your streak is in danger is a character nagging you, and
       this app's own notes on introjected regulation say what that costs. */
    case 'sleep':
    case 'tired':
    case 'rested':
    case 'curl':
    case 'sad':
    case 'worry':
      return 'tucked';
    default:
      return 'resting';
  }
}

const BY_BAND: Record<PerchBand, PerchId[]> = {
  lifted: ['midLeft', 'midRight'],
  resting: ['restLeft', 'restRight'],
  tucked: ['lowLeft', 'lowRight'],
};

/**
 * The next place to stand, given how the character feels and where it already
 * is.
 *
 * `seed` is any integer that changes when the *cause* changes — the host passes
 * a counter it bumps on a real change. It is not a random number and it is not
 * a clock: the same cause must always land on the same side, or the character
 * would appear to jump about while nothing was happening.
 *
 * Returns the current perch unchanged when the band has not changed and the
 * character is already standing in it — holding still is the correct answer to
 * "nothing happened".
 */
export function nextPerch(
  emotion: MascotEmotion,
  current: PerchId | null,
  seed: number,
): Perch {
  const band = bandFor(emotion);
  const options = BY_BAND[band];

  /* Already in the right band: stay put. The alternative — re-picking on every
     evaluation — is the drifting-on-a-timer failure described at the top. */
  if (current && options.includes(current)) return PERCHES[current];

  /*
    Moving. Pick the side that is not the side it is on, so a move is always
    visible as a move.

    With `current` null (first appearance) the seed decides, which keeps the
    first position stable for a given cause rather than flipping on remount.
  */
  const currentIsLeft = current ? PERCHES[current].x < 0.5 : seed % 2 === 1;
  const wantLeft = !currentIsLeft;
  const picked = options.find((id) => (PERCHES[id].x < 0.5) === wantLeft) ?? options[0];
  return PERCHES[picked];
}

/**
 * Points, from a fraction and the box the host measured.
 *
 * Kept here rather than in the component so the arithmetic is testable: an
 * off-by-one that parks the character half off-screen is invisible in code
 * review and obvious in a number.
 */
export function perchPoint(
  perch: Perch,
  box: { width: number; height: number },
  size: number,
): { left: number; top: number } {
  const half = size / 2;
  return {
    left: clamp(perch.x * box.width - half, 0, Math.max(0, box.width - size)),
    /* Measured down from the bottom edge, so `rise` means what it says however
       tall the box is: at rise 1 the figure sits on the edge, at rise 0 it is
       entirely below it. */
    top: box.height - size * perch.rise,
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
