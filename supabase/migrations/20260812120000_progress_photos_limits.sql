-- The progress-photos bucket accepted anything, of any size.
--
-- ── what was there ──
--
-- `20260212045102_….sql:60` created it with
-- `INSERT INTO storage.buckets (id, name, public)` and nothing else. No
-- `file_size_limit`, no `allowed_mime_types`. The RLS policy scopes uploads to
-- the user's own folder and stops there — it does not care whether the object
-- is a 200 KB photo or a 2 GB video, and storage and egress are both billed.
--
-- ── why the number could not be chosen first ──
--
-- The project's log was explicit that the easy half is the migration and the
-- hard half is the figure: *"quá thấp là chặn ảnh iPhone thật"*. A limit picked
-- against an unbounded input is a limit that eventually rejects a real photo
-- from a phone nobody tested on, and that failure lands on somebody who did
-- nothing wrong.
--
-- So the capture was bounded first. `src/lib/photo-size.ts` now caps the long
-- edge at 1920 through `CameraView`'s `pictureSize`, at JPEG quality 0.6, using
-- what `expo-camera` already offers rather than adding an image-manipulation
-- dependency and a native rebuild.
--
-- ── the figure, and its headroom ──
--
-- A 1920-edge JPEG at quality 0.6 lands in the low hundreds of kilobytes. The
-- generous case is a device whose *smallest* offered capture is already above
-- the cap — `pickPictureSize` takes the smallest available rather than giving
-- up, so a 4K frame at 0.6 is the realistic worst case at roughly 2 MB.
--
-- 5 MB is therefore about double the worst case the app can produce, and two
-- orders of magnitude below what makes a storage bill interesting. It is a
-- ceiling on abuse, not a squeeze on quality: nothing the camera path produces
-- should ever come near it.
--
-- **Not measured on a device.** The capture bound is real and the arithmetic is
-- ordinary, but no iPhone took a photo through this code in the environment
-- where it was written. If a real capture ever approaches 5 MB, the thing to
-- revisit is `MAX_EDGE`, not this number — a photo that large means the cap is
-- not being applied.
UPDATE storage.buckets
   SET file_size_limit = 5242880,                    -- 5 MiB
       allowed_mime_types = ARRAY['image/jpeg']
 WHERE id = 'progress-photos';

-- ── one type, because the app produces one type ──
--
-- `use-progress-photos.ts` uploads with `contentType: 'image/jpeg'` and there
-- is no other upload path — no library picker, no import. Allowing PNG or HEIC
-- would be allowing something nothing sends, and every extra permitted type is
-- another shape the bucket has to be reasoned about with. Widen this on the day
-- a feature needs it, not before.
COMMENT ON TABLE storage.buckets IS
  'progress-photos: 5 MiB, image/jpeg only. The app caps capture at 1920px long edge (see native/src/lib/photo-size.ts); this bound exists for anything that does not go through the app.';
