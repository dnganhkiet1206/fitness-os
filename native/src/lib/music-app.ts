/**
 * The music apps this app can hand you off to, and the one iOS rule that makes
 * that harder than it looks.
 *
 * ── why handing off, and not playing here ──
 *
 * Spotify's own documentation is explicit: *"it isn't possible to play Spotify
 * audio directly inside your own iOS or Android app."* The SDKs that once
 * allowed it were retired on 1 September 2022, and what replaced them — App
 * Remote — is a remote control for the Spotify app and requires that app to be
 * installed anyway.
 *
 * Apple Music is the opposite: `ApplicationMusicPlayer` really does play inside
 * your app. It also wants a MusicKit entitlement on the App ID, a media
 * identifier and signing key, a permission prompt, and an active Apple Music
 * subscription before a single note comes out — and it does nothing at all for
 * the person who uses Spotify.
 *
 * So the button that works for everybody, costs nothing, and is honest about
 * what it does is the one that opens the app they already pay for. iOS keeps
 * that audio playing when they come back here, and the lock screen and Control
 * Centre are already better transport controls than this app would build.
 *
 * ── the trap, and it is a silent one ──
 *
 * `canOpenURL` is how you find out whether an app is installed, and since iOS 9
 * it answers **false for any scheme not listed in `LSApplicationQueriesSchemes`**
 * — not an error, not a warning, just false. Miss the declaration and the row
 * of buttons never appears, on every device, for ever, while the code reads
 * perfectly.
 *
 * The asymmetry is worth knowing: the restriction applies to `canOpenURL` only.
 * `openURL` works on an undeclared scheme. So the failure is never "the button
 * did nothing" — it is "the button was never there".
 *
 * `tools/music-launch.mjs` checks every scheme here against `app.json`.
 */

export interface MusicApp {
  id: 'apple' | 'spotify';
  label: string;
  /**
   * The scheme as `LSApplicationQueriesSchemes` wants it — bare, no `://`.
   *
   * Lower case on purpose: `canOpenURL` matches schemes case-sensitively
   * against that list, and a capitalised entry silently fails the same way a
   * missing one does.
   */
  scheme: string;
  /** what actually gets opened */
  url: string;
}

export const MUSIC_APPS: readonly MusicApp[] = [
  /* `music://` opens the Music app, which is where an Apple Music subscription
     lives. */
  { id: 'apple', label: 'Apple Music', scheme: 'music', url: 'music://' },
  /* `spotify:` is the scheme Spotify's own content-linking documentation tells
     third parties to declare and open. */
  { id: 'spotify', label: 'Spotify', scheme: 'spotify', url: 'spotify://' },
];

/**
 * Which of them to offer, given what the device says is installed.
 *
 * Only what is there. A button for an app somebody does not have is a button
 * that fails after they press it, and this app already has a rule about doors
 * that go nowhere — `tools/reachable.mjs` exists because of one.
 *
 * An empty answer is a real answer: render nothing rather than a row with a
 * disabled control in it, which would be a permanent advertisement for two
 * apps the person has chosen not to install.
 */
export function offerable(installed: Record<string, boolean>): MusicApp[] {
  return MUSIC_APPS.filter((a) => installed[a.id]);
}
