import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * A tiny AsyncStorage-backed module store — one value, one key, shared by
 * every component that reads it.
 *
 * ── why it exists ──
 *
 * `use-steps-goal`, `use-weight-goal` and `use-volume-unit` each carried ~25
 * lines of identical plumbing (module state, listener set, `hydrated` latch,
 * `emit`, `subscribe`, `hydrate`) and the copies had already drifted: only
 * the steps goal had the `settled` flag, only two of the three reset on
 * sign-out, and each wrote its own parse-and-validate by hand. A fourth copy
 * would have drifted further; this is the one copy.
 *
 * ── what it does and does not own ──
 *
 * The factory owns the storage mechanics: the read-once latch, the
 * parse-and-validate on load, the write-through on set, and the `settled`
 * flag. It does NOT own the domain rules — clamping, units, the "null means
 * unset" semantics — those stay in the hook that knows what the value means,
 * passed in as `parse` / `serialize` / the clamping setter.
 *
 * ── the `settled` contract, and why it is separate from `hydrated` ──
 *
 * `hydrated` means "the read has been *started*", which is not the same as
 * "the stored value is in hand". The daily steps quest is judged against the
 * steps goal and, once claimed, cannot be un-claimed — judging it during the
 * window before the read lands means judging somebody who set 15,000 against
 * the default 10,000. `settled` flips true in the `finally` of the read, so
 * the quest can wait for the value that is really there (or for the confirmed
 * absence of one).
 *
 * Because `settled` is set even when the stored string is missing or invalid,
 * callers must never treat "settled" as "a stored value exists" — only as
 * "the read is over". The value itself is whatever `parse` accepted, or the
 * initial value when nothing valid was stored.
 *
 * ── emit semantics ──
 *
 * `hydrate` always emits when the read lands, even when nothing changed:
 * the steps goal's `ready` flag must flip observers from "waiting" to
 * "settled" in that case. The snapshot is a primitive (or null), so
 * `useSyncExternalStore` bails out of re-rendering when the value is
 * unchanged — the extra notify costs nothing.
 *
 * ── user-scoped reset ──
 *
 * The store exposes `reset()` but does NOT wire it to `onUserScopedReset`
 * itself: a display preference like the volume unit is device-scoped and
 * deliberately survives sign-out, while a goal is person-scoped and must not
 * leak into the next account. The hook decides by registering — or not.
 */

export interface AsyncStoreOptions<T> {
  /** AsyncStorage key the value persists under. */
  storageKey: string;
  /**
   * Fresh-launch state — and what `reset()` returns to. A function so
   * computed defaults (device locale, today's date) stay lazy and are
   * re-evaluated on reset rather than captured once at module load.
   */
  initial: T | (() => T);
  /**
   * Raw stored string → value. Return `undefined` for anything that is not
   * really a value (missing, garbage, out of range): the current state is
   * kept and the read still counts as settled.
   */
  parse: (stored: string) => T | undefined;
  /**
   * Value → string to persist. Return `null` to remove the key instead
   * (the "clear the goal" case). Defaults to `String(value)`.
   */
  serialize?: (value: T) => string | null;
}

export interface AsyncStore<T> {
  /** Current value. Stable reference; safe as a `useSyncExternalStore` snapshot. */
  get: () => T;
  /** Subscribe to changes. Returns the unsubscribe function. */
  subscribe: (cb: () => void) => () => void;
  /** Start the AsyncStorage read. Idempotent — second call is a no-op. */
  hydrate: () => Promise<void>;
  /** Replace the value and persist it (fire-and-forget; storage failure keeps the in-memory value). */
  set: (value: T) => void;
  /** True once the read has landed or failed — see the `settled` contract above. */
  settled: () => boolean;
  /** Back to the fresh-launch state, read latch included. For `onUserScopedReset` handlers. */
  reset: () => void;
}

export function createAsyncStore<T>(options: AsyncStoreOptions<T>): AsyncStore<T> {
  const { storageKey, parse, serialize = (value: T) => String(value) } = options;
  const fresh = (): T =>
    typeof options.initial === 'function'
      ? (options.initial as () => T)()
      : options.initial;

  let state: T = fresh();
  const listeners = new Set<() => void>();
  let hydrated = false;
  let settled = false;

  function emit() {
    listeners.forEach((l) => l());
  }

  async function hydrate(): Promise<void> {
    if (hydrated) return;
    hydrated = true;
    try {
      const stored = await AsyncStorage.getItem(storageKey);
      if (stored != null) {
        const next = parse(stored);
        if (next !== undefined) state = next;
      }
    } catch {
      // keep the current value
    } finally {
      // Always emit: observers of `settled` must wake up even when the
      // stored string was missing or invalid. Primitives bail out of
      // re-render via Object.is, so the extra notify is free.
      settled = true;
      emit();
    }
  }

  function subscribe(cb: () => void): () => void {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }

  function set(value: T): void {
    state = value;
    emit();
    const raw = serialize(value);
    if (raw == null) {
      AsyncStorage.removeItem(storageKey).catch(() => {});
    } else {
      AsyncStorage.setItem(storageKey, raw).catch(() => {});
    }
  }

  function reset(): void {
    state = fresh();
    hydrated = false;
    settled = false;
    emit();
  }

  return { get: () => state, subscribe, hydrate, set, settled: () => settled, reset };
}
