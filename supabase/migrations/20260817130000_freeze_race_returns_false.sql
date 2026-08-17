/*
  `use_streak_freeze` raises a raw constraint error on the one race it is run in.

  ── the contract it was written with ──

  Its own header, in `20260814120000_streak_freeze.sql`:

      Returns false rather than raising when there is nothing to spend or the
      day is already covered: both are ordinary outcomes of an app that runs
      this check on every launch, and an exception would turn them into errors
      in a log.

  The pre-check honours that — `IF EXISTS (… used_on = p_date) THEN RETURN
  false`. The write does not, and the gap between them is where two callers land.

  ── measured on PostgreSQL 16.13, built from every migration in this directory ──

  Two sessions, one account, two freezes held, the same missed day:

      A: BEGIN; use_streak_freeze(CURRENT_DATE - 1)  → t
      B:        use_streak_freeze(CURRENT_DATE - 1)  → ERROR:  duplicate key
                value violates unique constraint "streak_freezes_one_per_day"

      trạng thái cuối: da_tieu=1  con_giu=1

  Both passed the `EXISTS` check because neither had committed; both took a
  different held row (`FOR UPDATE SKIP LOCKED` hands them different rows rather
  than making one wait); both wrote the same `used_on`. The partial unique index
  did its job — **one** freeze was consumed and one stayed in the drawer, which
  is the guarantee that matters and is untouched here.

  What did not do its job is the reporting. B's answer to *"is this day already
  covered?"* is yes, and yes is `false` in this function's language. Instead it
  is an exception.

  ── why that is worse than it looks, in this app ──

  Nobody taps this. `useStreakGuard` calls it on every launch where a gap is
  uncovered, and its `onError` does two things: it shows `e.message` to the
  user, and it puts the date back into `tried` so the next settle tries again.
  So the second device shows

      duplicate key value violates unique constraint "streak_freezes_one_per_day"

  as a red toast — on a launch where nothing went wrong and the streak was in
  fact saved — and then retries and shows it again, until that device's streak
  query happens to refetch. The failure it reports is the app working.

  Two devices is the plain case. One device reaches it too: `tried` is a ref
  scoped to a mount, and the guard runs from a query settling.

  ── the fix ──

  Catch the one error the pre-check already has an answer for and give that
  answer. Narrow on purpose: the `EXCEPTION` block wraps the UPDATE alone, so
  `not signed in` and `freeze window` still raise — they are real errors and a
  caller should hear them. Everything else about the function is unchanged.

  A plpgsql `BEGIN … EXCEPTION` is a subtransaction, so the failed UPDATE rolls
  back to that point and the function returns cleanly rather than aborting.
*/

CREATE OR REPLACE FUNCTION public.use_streak_freeze(p_date DATE)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;

  IF p_date > CURRENT_DATE + 1 OR p_date < CURRENT_DATE - 3 THEN
    RAISE EXCEPTION 'freeze window';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.streak_freezes WHERE user_id = v_uid AND used_on = p_date
  ) THEN
    RETURN false;
  END IF;

  SELECT id INTO v_id
    FROM public.streak_freezes
    WHERE user_id = v_uid AND used_on IS NULL
    ORDER BY acquired_at
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

  IF v_id IS NULL THEN
    RETURN false;
  END IF;

  BEGIN
    UPDATE public.streak_freezes SET used_on = p_date WHERE id = v_id;
  EXCEPTION WHEN unique_violation THEN
    /* Another caller covered this day between the check above and this write.
       That is the same answer the check gives, so it is the same return value:
       the day is covered, this call did not do it, and no freeze was spent. */
    RETURN false;
  END;

  RETURN true;
END;
$$;
