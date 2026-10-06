/**
 * D-32 test loader: stubs `ascnd-native` and related native-only modules
 * so rest-live-activity.ts loads under Node. Only the injected-facade
 * path (createRestLiveActivity) is exercised — the stubs are never called.
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'ascnd-native') {
    return { url: new URL('./rest-timer-gate.stubs.mjs', import.meta.url).href, shortCircuit: true };
  }
  // Extensionless relative imports (TS style) -> try .ts
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    try {
      return await nextResolve(specifier, context);
    } catch {
      return nextResolve(specifier + '.ts', context);
    }
  }
  return nextResolve(specifier, context);
}
