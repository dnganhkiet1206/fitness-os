import { useEffect, useRef } from 'react';

/**
 * True while the component is mounted. For async continuations (mutation
 * `onSuccess`, fetch callbacks) that must not act after unmount — e.g.
 * `nav.back()` in `onSuccess` would pop someone else's screen if the user
 * already backed out while the request was in flight (#157 class).
 */
export function useMountedRef() {
  const ref = useRef(true);
  useEffect(() => {
    ref.current = true;
    return () => {
      ref.current = false;
    };
  }, []);
  return ref;
}
