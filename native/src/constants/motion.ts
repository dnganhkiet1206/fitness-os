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
 *     beats of one gesture, not two picks off a scale. Every spring the app had
 *     when this file was written was in that category; `press` below is the
 *     first one that is not, and it is here rather than in a component because
 *     it is the app's answer to *every* tap.
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

/**
 * How a press answers.
 *
 * ── the depth ──
 *
 * 0.97. The app was using 0.92, 0.95 and 0.98 in different files, which is
 * three answers to one question. 0.92 on a full-width card is a lurch — the
 * whole surface visibly shrinks away from the finger; the same 0.92 on a small
 * icon button is barely visible, because the *absolute* distance travelled is
 * what the eye reads, not the ratio. 0.97 is the value that stays legible on a
 * 44pt button and stays polite on a 350pt card, which is the range this app
 * actually has.
 *
 * ── the spring ──
 *
 * ζ = 0.707, ωn = 28.3 rad/s. Integrated rather than guessed at: it covers 90%
 * of the press depth in 94ms and is within a thousandth of its target by 118ms,
 * which is fast enough that the surface is already down before a normal tap
 * lifts.
 *
 * The overshoot is 4% of the travel, and 4% of a 1 → 0.97 press is 0.0012 of
 * scale — 0.05pt on a 44pt button, 0.4pt on a 350pt card. Sub-pixel at both
 * ends of the range this app actually has, which is the point: overshoot you
 * *can* see turns a button into a toy, and these are mostly cards carrying
 * numbers about somebody's body.
 *
 * The same spring runs both ways. A press-in that is snappier than the release
 * is the usual instinct and it feels wrong here: the release is the half you
 * watch, because your finger is out of the way by then.
 */
export const press = {
  scale: 0.97,
  /**
   * For controls small enough that 3% is nothing.
   *
   * The eye reads the *distance* a thing moves, not the ratio, so 0.97 on a
   * 24pt icon is 0.7pt of travel — below the threshold where it registers as a
   * response at all. Every place in the app that had reached for a deeper press
   * on its own turned out to be exactly this: the back chevron, the two FABs,
   * a tab-bar icon, the awards icon, a small stepper. Six sites, all under a
   * finger's width, none of them a card.
   *
   * 0.92 rather than the 0.88–0.94 they variously used, for the same reason
   * there is one `scale` and not fifty.
   */
  deep: 0.92,
  /**
   * The dim that goes with it, kept at the value the app already used
   * everywhere so migrating a call site changes *how* it moves and not *how
   * far*. Scale alone is too quiet on a large card — there is no edge near
   * enough to your finger to see 3% by; the dim is what carries the feedback at
   * card size, and the scale is what carries it at button size.
   */
  opacity: 0.85,
  spring: { damping: 20, stiffness: 400, mass: 0.5 },
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
