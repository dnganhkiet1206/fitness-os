/**
 * Rive rig registry for the companion characters.
 *
 * A rigged `.riv` (bones + mesh + IK + state machine) is the top-quality,
 * fully-animated companion — see `assets/mascots/KOA_RIG_SPEC.md` for the
 * exact rig + state-machine contract the `.riv` must implement.
 *
 * Until a mascot has a `.riv` registered here, the app falls back to the
 * pre-rendered image, then Lottie, then the vector figure. So this staying
 * empty changes nothing and never breaks the build.
 *
 * Loading a bundled `.riv` with rive-react-native needs the file added to
 * the native bundle (iOS: drag into the Xcode project / expo asset;
 * Android: android/app/src/main/res/raw). Register the resource name (no
 * extension) here once that's done, or use a hosted `url`.
 */

/** Canonical State-Machine + input contract (mirror of the spec doc). */
export const RIVE_SM = 'MascotSM';

/** Number input: the buddy's mood (drives idle overlays). */
export const RIVE_MOOD = { neutral: 0, happy: 1, tired: 2, sad: 3 } as const;

/** Trigger inputs — one-shot actions, all clothing-independent. */
export type RiveAction =
  | 'blink'
  | 'lookLeft'
  | 'lookRight'
  | 'smile'
  | 'celebrate'
  | 'wave'
  | 'jump'
  | 'run'
  | 'squat'
  | 'pushUp'
  | 'dumbbellCurl'
  | 'drinkWater'
  | 'sleep';

export interface RiveMascotSpec {
  /** Bundled resource name (no extension), e.g. 'koa' for koa.riv */
  resourceName?: string;
  /** …or a hosted URL to the .riv */
  url?: string;
  /** State machine to run (defaults to RIVE_SM) */
  stateMachine?: string;
  /** Artboard name, if not the default */
  artboard?: string;
  /** height / width of the artboard, so the figure box matches */
  aspect: number;
}

export const MASCOT_RIVE: Record<string, RiveMascotSpec> = {
  // koa: { resourceName: 'koa', stateMachine: RIVE_SM, aspect: 859 / 640 },
};

export function riveFor(mascotId: string): RiveMascotSpec | null {
  return MASCOT_RIVE[mascotId] ?? null;
}

export const hasRive = (mascotId: string): boolean => !!MASCOT_RIVE[mascotId];
