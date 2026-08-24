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
-- ── applied, and then checked ──
--
-- A bare `UPDATE ... WHERE id = 'progress-photos'` cannot fail. If the bucket
-- is missing, or row-level security filters it away from the migration role,
-- the statement matches zero rows, reports success, and the migration is
-- recorded as applied — leaving a bucket with NO size limit and NO MIME
-- restriction while every log says the bound is in place. That is the worst
-- shape a security migration can take: silently absent, and believed present.
--
-- So the row count is read back. On a healthy project this is invisible; on a
-- project where the bucket never arrived it stops the push and says so.
DO $$
DECLARE
  touched integer;
BEGIN
  UPDATE storage.buckets
     SET file_size_limit = 5242880,                    -- 5 MiB
         allowed_mime_types = ARRAY['image/jpeg']
   WHERE id = 'progress-photos';

  GET DIAGNOSTICS touched = ROW_COUNT;

  IF touched <> 1 THEN
    RAISE EXCEPTION
      'progress-photos bucket was not bounded: UPDATE storage.buckets matched % rows, expected 1. '
      'The bucket is created by 20260212045102_*.sql — confirm it exists in this project '
      '(select id from storage.buckets) before re-running.', touched;
  END IF;
END $$;

-- ── one type, because the app produces one type ──
--
-- `use-progress-photos.ts` uploads with `contentType: 'image/jpeg'` and there
-- is no other upload path — no library picker, no import. Allowing PNG or HEIC
-- would be allowing something nothing sends, and every extra permitted type is
-- another shape the bucket has to be reasoned about with. Widen this on the day
-- a feature needs it, not before.
-- ── why the note above is a file comment and not a COMMENT ON TABLE ──
--
-- This migration used to end with:
--
--     COMMENT ON TABLE storage.buckets IS 'progress-photos: 5 MiB, ...';
--
-- It fails on Supabase Cloud with `must be owner of table buckets (42501)`, and
-- that is correct behaviour rather than an obstacle. `storage.buckets` is owned
-- by `supabase_storage_admin`; the role that runs migrations is not a member of
-- it. Since April 2025 Supabase carves out exactly two things on the storage
-- tables — RLS policies and triggers — and `COMMENT ON TABLE` is neither.
-- Granting ownership to get it through would hand a project-owned schema to
-- migrations for the sake of a docstring.
--
-- It was also documenting the WRONG OBJECT, which is why nothing is moved
-- elsewhere in the database to replace it. `storage.buckets` is the table that
-- holds EVERY bucket. A comment on it describing one row is a sentence that
-- becomes false the moment a second bucket exists, and the next migration that
-- comments the same table silently overwrites it. Prose about one row belongs
-- with the statement that writes that row — here.
--
-- The bucket's behaviour is unchanged: 5 MiB, image/jpeg only, and the same RLS
-- policies from 20260212045102_*.sql, which are untouched by this file.
