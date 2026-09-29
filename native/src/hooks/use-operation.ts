import { useEffect, useState, useSyncExternalStore } from 'react';

import { createOperation, type OperationMode, type Outcome } from '@/lib/operation-core';

export type { Outcome };

/**
 * A component's own async operation, with the rules of `lib/operation-core.ts`
 * (#157): one run in flight (`join`) or the newest wins (`replace`), stale
 * results reported as `stale`, and everything cancelled when the component
 * unmounts. `pending` replaces the `loading` flag a screen used to keep itself.
 */
export function useOperation(mode: OperationMode = 'join') {
  const [op] = useState(() => createOperation(mode));
  const pending = useSyncExternalStore(op.subscribe, op.pending, op.pending);
  useEffect(() => () => op.cancel(), [op]);
  /* `pending` is this render's value; `running()` reads it NOW, for a handler
     that must not start while a run is in flight even within one frame. */
  return { run: op.run, cancel: op.cancel, pending, running: op.pending };
}
