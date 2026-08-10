/**
 * How big a progress photo is allowed to be, decided before it is taken.
 *
 * ── the gap this closes ──
 *
 * `progress-photos` was created with `INSERT INTO storage.buckets (id, name,
 * public)` and nothing else — no `file_size_limit`, no `allowed_mime_types`.
 * Storage and bandwidth are both billed, and a per-user RLS policy does not
 * care how large the file is.
 *
 * The project's log refused to let the limit be picked first, and it was right:
 * *"Một migration đặt giới hạn là dễ. Chọn con số thì không: quá thấp là chặn
 * ảnh iPhone thật."* A limit chosen against an unbounded input is a limit that
 * will one day reject a real photo from a phone nobody tested on.
 *
 * So the order is the other way round. Bound what the app produces, and the
 * number stops being a guess.
 *
 * ── why not a compression library ──
 *
 * `expo-image-manipulator` is the obvious answer and it is a native module: a
 * new dependency and a rebuild, to do something `expo-camera` already does.
 * `CameraView` takes a `pictureSize`, and `takePictureAsync` takes a `quality`.
 * Between them the output is bounded at capture, which is also cheaper than
 * capturing 24 megapixels and throwing most of them away.
 *
 * ── the two platforms do not speak the same language ──
 *
 * This is the part that would have been a bug. `getAvailablePictureSizesAsync`
 * returns `"1920x1080"`-style strings on Android, and on iOS it returns
 * AVFoundation preset *names* — `"photo"`, `"high"`, `"medium"`, `"low"`,
 * alongside some numeric ones. Code that parses `WxH` and gives up otherwise
 * would silently fall back to the device default on iOS, which is the platform
 * this app is built for and the one where the default is largest.
 *
 * So both shapes are handled, and "handled" includes returning `undefined` —
 * meaning *leave the camera alone* — rather than passing a string the platform
 * will not recognise.
 */

/**
 * The longest edge worth keeping.
 *
 * A progress photo is looked at next to another progress photo, on a phone,
 * months apart. 1920 is already more than that comparison can use; the reason
 * not to go lower is that these are the one thing in the app somebody might
 * still want in five years, and detail thrown away at capture is gone for good.
 */
export const MAX_EDGE = 1920;

/** iOS presets, smallest usable first. `photo` is the full-resolution one. */
const IOS_PRESETS = ['1920x1080', 'high', 'photo'] as const;

/**
 * Pick a capture size, or `undefined` to leave the default alone.
 *
 * Never invents a string. Everything returned came out of the list the platform
 * handed us, because `pictureSize` is passed straight through to the native
 * layer and an unrecognised value is not a smaller photo — it is a crash or a
 * silently ignored prop, and both are worse than the size being large.
 */
export function pickPictureSize(available: readonly string[] | undefined): string | undefined {
  if (!available || available.length === 0) return undefined;

  /* Android, and the numeric entries iOS sometimes includes: real dimensions.
     The largest that still fits under the cap, so the photo is as good as it is
     allowed to be rather than as small as possible. */
  const numeric = available
    .map((s) => {
      const m = /^(\d+)\s*x\s*(\d+)$/.exec(s.trim());
      if (!m) return null;
      const w = Number(m[1]);
      const h = Number(m[2]);
      return { s, long: Math.max(w, h), pixels: w * h };
    })
    .filter((x): x is { s: string; long: number; pixels: number } => x !== null);

  if (numeric.length > 0) {
    const fits = numeric.filter((x) => x.long <= MAX_EDGE);
    if (fits.length > 0) {
      return fits.reduce((best, x) => (x.pixels > best.pixels ? x : best)).s;
    }
    /* Everything on offer is bigger than the cap. Take the smallest rather than
       nothing: a device whose smallest capture is 4K still benefits from not
       being asked for its largest. */
    return numeric.reduce((best, x) => (x.pixels < best.pixels ? x : best)).s;
  }

  /* iOS presets. In order of preference, and only if the device offers it —
     the list differs by camera and by whether the front or back is in use. */
  for (const preset of IOS_PRESETS) {
    if (available.includes(preset)) return preset;
  }

  /* Names we do not recognise. Leaving the prop unset keeps whatever the
     platform chose, which is the safe wrong answer: a large photo, not a
     broken camera. */
  return undefined;
}

/**
 * JPEG compression for a body-comparison photo.
 *
 * 0.6 was already in place and is kept. Progress photos are compared for shape
 * and outline rather than read for fine detail, and JPEG artefacts at 0.6 on a
 * 1920px frame are not visible at the size these are ever viewed. Lower starts
 * to show banding on skin, which is exactly the surface being photographed.
 */
export const PHOTO_QUALITY = 0.6;
