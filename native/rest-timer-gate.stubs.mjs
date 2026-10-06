/**
 * D-32 test stubs: native-only modules replaced for Node execution.
 * These are never invoked by the gate tests (facade is injected).
 */
export default {};
export function isAscndNativeAvailable() { return false; }
export function startRestActivity() { return Promise.resolve(null); }
export function updateRestActivity() { return Promise.resolve(); }
export function endRestActivity() { return Promise.resolve(); }
export function addIslandRestIntentListener() { return () => {}; }
export function getIslandRestState() { return Promise.resolve(null); }
