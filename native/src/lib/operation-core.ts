/**
 * One logical async operation, run so that only a valid run can commit (#157).
 *
 * Server data already has this: React Query gives every `queryKey` one
 * request in flight, shared by every consumer, and aborts it through `signal`.
 * What it does not cover is the async work a screen starts itself — a button
 * that asks the AI for meal ideas, a camera capture followed by an upload, a
 * sign-in. Each of those had its own `if (loading) return` or `busyRef`, and a
 * local flag like that has two holes: two presses in the same frame both read
 * `false`, and nothing stops a run that finishes after its screen is gone, or
 * after a newer run, from writing its result.
 *
 * So the rule lives here, once, and a screen asks it instead of keeping a flag:
 *
 * - every run has an id from an increasing sequence and its own AbortController;
 * - `join` (the default): a run started while one is in flight does not start
 *   a second one — it gets the SAME promise (single-flight);
 * - `replace`: a new run supersedes the old one — the old one is aborted, and
 *   whatever it returns is reported as `stale`, never as its value. Abort is
 *   best effort (a camera cannot be un-pressed), so the stale check is what
 *   actually protects the state, not the abort;
 * - `cancel()` (the hook calls it on unmount): every run in flight is aborted
 *   and reports `stale`, so a screen that has gone never receives a result.
 *
 * The caller commits only on `ok`:
 *
 *     const r = await op.run((signal) => callEdge(fn, body, signal));
 *     if (r.status !== 'ok') return;
 *     setSuggestions(r.value);
 *
 * Imports nothing, so `tools/operation.mjs` compiles and drives it on its own.
 */

export type Outcome<R> =
  | { status: 'ok'; value: R }
  | { status: 'error'; error: unknown }
  | { status: 'stale' };

export type OperationMode = 'join' | 'replace';

export interface Operation {
  run<R>(fn: (signal: AbortSignal) => Promise<R>): Promise<Outcome<R>>;
  /** Abort everything in flight; each of it reports `stale`. */
  cancel(): void;
  pending(): boolean;
  /** Called whenever `pending()` may have changed. Returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
}

export function createOperation(mode: OperationMode = 'join'): Operation {
  let seq = 0;
  /** The id of the run allowed to commit; anything else is stale. */
  let valid = 0;
  let inFlight: { id: number; ctrl: AbortController; promise: Promise<Outcome<unknown>> } | null = null;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const l of listeners) l();
  };

  const op: Operation = {
    run<R>(fn: (signal: AbortSignal) => Promise<R>): Promise<Outcome<R>> {
      if (inFlight && mode === 'join') return inFlight.promise as Promise<Outcome<R>>;
      if (inFlight) inFlight.ctrl.abort();
      const id = ++seq;
      valid = id;
      const ctrl = new AbortController();
      const settle = (o: Outcome<R>): Outcome<R> => {
        /* Released by the run itself finishing, on every path — success,
           error, abort — so nothing is ever left pending. */
        if (inFlight?.id === id) {
          inFlight = null;
          notify();
        }
        /* Decided by the sequence, not by the abort: an abort is a request to
           stop work, and a result can still arrive after it (#157 §7). */
        return id === valid ? o : { status: 'stale' };
      };
      let started: Promise<R>;
      try {
        started = Promise.resolve(fn(ctrl.signal));
      } catch (error) {
        started = Promise.reject(error);
      }
      const promise = started.then(
        (value) => settle({ status: 'ok', value }),
        (error: unknown) => settle({ status: 'error', error }),
      );
      inFlight = { id, ctrl, promise };
      notify();
      return promise;
    },
    cancel() {
      valid = ++seq;
      if (inFlight) {
        inFlight.ctrl.abort();
        inFlight = null;
        notify();
      }
    },
    pending: () => inFlight !== null,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return op;
}
