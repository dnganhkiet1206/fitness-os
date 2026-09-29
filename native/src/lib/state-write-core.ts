/**
 * The "Trạng thái" class of `docs/OFFLINE-POLICY.md` (#161): a flag or a
 * choice where only the LAST value matters — a grocery tick, "taken today"
 * on a supplement.
 *
 * Three rules, each one a bug the old writes had:
 *
 * - **An absolute value, never a flip.** `send` receives the value to SET.
 *   A flip replayed twice is wrong; "set = true" sent twice is one result.
 * - **Merged per key, last intention wins.** The key is (entity, field).
 *   Tick → untick → tick while offline leaves ONE intention, "ticked"; tick →
 *   untick leaves none, because it equals what the server already has, and
 *   nothing is sent. The durable queue in `offline-write.ts` could not do
 *   this — it held only "tick", so tick-then-untick recorded a pill as taken.
 * - **One send per key in flight, and an old reply never overwrites.** A new
 *   intention while a send is in flight waits for it and then sends the
 *   newest value — the same rule `operation-core.ts` applies to #157. The
 *   server value is only ever advanced to the value that was actually sent.
 *
 * An entity deleted elsewhere (`send` resolves `'gone'`) drops its intention
 * and is reported, not swallowed. A send that failed for want of a network
 * keeps its intention for the next reconnect; any other failure drops it and
 * is reported.
 *
 * In-session only, as the owner chose: nothing here is persisted, and the
 * message shown when an intention is queued says so.
 *
 * Imports nothing, so `tools/state-write.mjs` compiles and drives it alone.
 */

export type SendResult = 'ok' | 'gone';

export interface StateIntent<V> {
  /** (entity, field), e.g. `grocery:checked:<id>`. */
  key: string;
  /** The absolute value wanted. */
  value: V;
  /** What the server holds now, as last read. */
  server: V;
  send: (value: V) => Promise<SendResult>;
}

export interface StateWriterEnv {
  online(): boolean;
  /** A send failed because there was no network: keep the intention. */
  isOffline(error: unknown): boolean;
  /** Finished one way or another — refresh the server copy. */
  onSettled(key: string): void;
  onGone(key: string): void;
  onError(key: string, error: unknown): void;
}

interface Entry<V> {
  desired: V;
  /* The same object until `desired` changes: React's `useSyncExternalStore`
     re-renders on every new snapshot identity. */
  view: { value: V };
  server: V;
  send: (value: V) => Promise<SendResult>;
  inFlight: boolean;
}

export function createStateWriter(env: StateWriterEnv) {
  const entries = new Map<string, Entry<unknown>>();
  const listeners = new Set<() => void>();
  let version = 0;
  const notify = () => {
    version++;
    for (const l of listeners) l();
  };

  const start = (key: string) => {
    const e = entries.get(key);
    if (!e || e.inFlight) return;
    if (Object.is(e.desired, e.server)) {
      entries.delete(key);
      notify();
      return;
    }
    if (!env.online()) return;
    e.inFlight = true;
    const sent = e.desired;
    notify();
    e.send(sent).then(
      (res) => {
        e.inFlight = false;
        if (res === 'gone') {
          entries.delete(key);
          notify();
          env.onGone(key);
          env.onSettled(key);
          return;
        }
        e.server = sent;
        /* A newer intention arrived while this was in flight: send it now,
           rather than let this reply decide what the item shows. */
        if (!Object.is(e.desired, e.server)) {
          start(key);
          return;
        }
        entries.delete(key);
        notify();
        env.onSettled(key);
      },
      (error: unknown) => {
        e.inFlight = false;
        if (env.isOffline(error)) {
          notify();
          return;
        }
        entries.delete(key);
        notify();
        env.onError(key, error);
        env.onSettled(key);
      },
    );
  };

  return {
    /**
     * Record an intention. Returns what happened to it: `'sending'`,
     * `'queued'` (offline, or waiting behind a send in flight) or
     * `'unchanged'` (it equals the server value, so nothing will be sent).
     */
    set<V>(intent: StateIntent<V>): 'sending' | 'queued' | 'unchanged' {
      const e = entries.get(intent.key) as Entry<V> | undefined;
      if (e) {
        if (!Object.is(e.desired, intent.value)) e.view = { value: intent.value };
        e.desired = intent.value;
        e.send = intent.send;
        /* Nothing in flight: the newest read of the server is the truer one. */
        if (!e.inFlight) e.server = intent.server;
      } else {
        entries.set(intent.key, {
          desired: intent.value,
          view: { value: intent.value },
          server: intent.server,
          send: intent.send,
          inFlight: false,
        } as Entry<unknown>);
      }
      const entry = entries.get(intent.key)!;
      if (entry.inFlight) {
        notify();
        return 'queued';
      }
      if (Object.is(entry.desired, entry.server)) {
        entries.delete(intent.key);
        notify();
        return 'unchanged';
      }
      if (!env.online()) {
        notify();
        return 'queued';
      }
      start(intent.key);
      return 'sending';
    },
    /** The value waiting to be sent for `key`, if any: what the item should show. */
    pending(key: string): { value: unknown } | undefined {
      return entries.get(key)?.view;
    },
    /** Called on reconnect: send every intention still waiting. */
    flush() {
      for (const key of [...entries.keys()]) start(key);
    },
    size: () => entries.size,
    /** Changes whenever any intention changes: a snapshot for a whole list. */
    version: () => version,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    /** Sign-out: intentions belong to the user who made them. */
    clear() {
      entries.clear();
      notify();
    },
  };
}

export type StateWriter = ReturnType<typeof createStateWriter>;
