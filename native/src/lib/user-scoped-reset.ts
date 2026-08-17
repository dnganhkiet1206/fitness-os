/**
 * Module-scope state that belongs to the person, not to the app.
 *
 * ── the bug this exists for ──
 *
 * `clearUserScopedStorage()` deletes thirteen AsyncStorage keys on sign-out.
 * Five of those keys are read once per launch into a module-scope `let` behind
 * a `hydrated` latch — the store shape this app uses everywhere so that Today,
 * Settings and the Steps screen see the same number. Deleting the key does not
 * touch the `let`, and the latch means the value is never re-read, so the value
 * that is now nowhere on disk is still the value the app uses:
 *
 *     A đặt:  steps=15000  weight=62.5  height(steps)=480
 *     sau signOut, AsyncStorage còn: {}
 *     B thấy: steps=15000  weight=62.5  height(steps)=480
 *
 * That is real output from the real modules (`tools/auth-lifecycle.mjs` runs
 * it). Person B is judged against person A's step goal — and the daily steps
 * quest pays coins on that comparison and cannot be un-paid — and person A's
 * target weight is drawn across person B's chart.
 *
 * `query-client.ts` already knew about this failure for one case, and says so:
 * *"Module-scope state, which no `removeItem` can reach — see
 * `resetPersonalModel`."* It reached only `lib/personal-model.ts`. The other
 * five stores are in `hooks/`, and `lib/` may not import upwards
 * (`tools/layering.mjs`), which is exactly why they were left out.
 *
 * ── so registration, rather than a list of imports ──
 *
 * A store registers its own reset when its module loads. `clearUserScopedStorage`
 * runs whatever has registered.
 *
 * The load-order question answers itself: a module that was never imported holds
 * no state, so having nothing registered for it is correct rather than a gap.
 * And the dependency points downwards — `hooks/x` → `lib/user-scoped-reset` —
 * so the layer rule stays intact.
 *
 * ── what belongs here ──
 *
 * Anything held in memory that describes the person: a cached preference, a
 * learned habit, a queued celebration of something *they* did. Not device
 * preferences (language, units, the app lock — see `DEVICE_KEYS`), and not
 * caches of public data.
 *
 * Reset means *back to the state a fresh launch would have*, which includes the
 * hydration latch. Clearing the value and leaving the latch set is its own bug:
 * the next account then never reads its own stored value either — see the note
 * on `loaded` in `resetPersonalModel`.
 */

const resets = new Set<() => void>();

/**
 * Register a store's reset. Call it at module scope, next to the state it
 * clears, so the two can never drift apart.
 */
export function onUserScopedReset(reset: () => void): void {
  resets.add(reset);
}

/** Run every registered reset. One that throws does not stop the others. */
export function runUserScopedResets(): void {
  for (const reset of resets) {
    try {
      reset();
    } catch {
      // a store that cannot reset is not a reason to leave the rest loaded
    }
  }
}
