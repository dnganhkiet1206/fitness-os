/**
 * How long a thing takes to respond to you.
 *
 * ── what is in here, and what is deliberately left out ──
 *
 * Only the *response* band: the app answering a tap or a state change. Four
 * values, because a survey of the app found it was already speaking with four —
 * 180, 200, 240 and 320 across seven places. This gives those four a name so
 * the eighth place does not invent 190.
 *
 * Two whole categories are **not** here, and leaving them out is the point:
 *
 *   - **The character rig.** Koa's blink, nod, squash and weight-shift, the
 *     celebration sequences, the studio loop. Twenty sites and thirteen values,
 *     and they are choreography — 90ms and 110ms next to each other are two
 *     beats of one gesture, not two picks off a scale. Every spring in the app
 *     is in this category too, which is why there are no spring tokens.
 *   - **The arrival cascade.** The tab bar leaves over 300ms, the cards land at
 *     340 (220 plus a 30ms-per-card stagger), the light finishes at 420. Those
 *     three numbers are one composition: they are in that order, with those
 *     gaps, because light filling a room is the slowest part of any real
 *     arrival and the cards would look late if the aura beat them. Exposed as
 *     tokens they would get reused apart from each other, and the first time
 *     somebody "harmonised" them the sequence would be gone. They stay as
 *     literals next to the comments explaining them.
 *
 * ── how to pick one ──
 *
 * By how much of the screen is changing, not by how important the thing feels.
 * That is the whole ordering principle here, and it is why the four are spaced
 * the way they are: an icon spinning in place has almost no distance to cover,
 * a card exchanging its entire contents has a lot, and the eye wants the time
 * to match the distance. Something big that moves fast reads as a glitch;
 * something small that moves slowly reads as lag.
 *
 * If a new animation does not obviously fit one of these, that is worth a
 * moment's thought rather than a new number — usually it means the thing being
 * animated is doing more than one job.
 */
export const duration = {
  /** An icon swapping between two states in place — a toggle, a chevron flip. */
  toggle: 180,
  /** Something arriving that was not on screen a moment ago. */
  appear: 200,
  /** A control sliding to a new position; a disclosure opening or turning. */
  move: 240,
  /** A surface exchanging its contents for different contents. */
  swap: 320,
} as const;

/*
  ── why there are no easing tokens ──

  Because every call site already passes its own curve, and the curve is a
  bigger part of how a motion feels than its length. Two of the seven places
  migrated to these tokens run on Reanimated's default `inOut(quad)` and the
  rest on `out(cubic)` or a bespoke bezier; handing out an `ease` token invites
  the next edit to apply it "for consistency", which would change the feel of
  animations nobody asked to change.

  Durations are safe to share because a duration is a quantity. A curve is a
  shape, and the shapes here are doing different jobs.
*/
