/**
 * Is there a Koa on screen at all, right now?
 *
 * ── why `visible: true` was a lie worth fixing ──
 *
 * Every event source passed `visible: true`, on the reasoning that a held
 * emotion shows up wherever the character is drawn. That is true and it dodges
 * the actual question, which is whether the character is drawn *anywhere*. A
 * personal record earned while somebody is on the Nutrition tab held a proud
 * face for two seconds on a screen with no koala on it — and then, because the
 * event was marked handled, never played again.
 *
 * So the figure itself reports. Every `MascotFigure` that mounts adds one and
 * every unmount takes one away; zero means nothing is being drawn and a
 * reaction would be a performance in an empty theatre.
 *
 * ── a counter, not a boolean ──
 *
 * Several Koas can be on screen at once — the widget, a card peek, the room —
 * and they mount and unmount independently. A boolean would be cleared by
 * whichever one happened to leave last, which on the dashboard is the peek: the
 * character would be declared absent precisely because it had just finished
 * performing.
 */
let mounted = 0;

export function koaMounted(): () => void {
  mounted++;
  return () => {
    mounted = Math.max(0, mounted - 1);
  };
}

/** True while at least one figure is on screen. */
export const koaOnScreen = (): boolean => mounted > 0;

/** Testing only. */
export const resetKoaPresence = () => {
  mounted = 0;
};
