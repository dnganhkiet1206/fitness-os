/**
 * Biometric app lock (Face ID / Touch ID) via expo-local-authentication.
 * Guarded import so Expo Go / web / a stale build degrade to "unavailable"
 * rather than crashing.
 */
type LocalAuthModule = typeof import('expo-local-authentication');

let LocalAuth: LocalAuthModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  LocalAuth = require('expo-local-authentication') as LocalAuthModule;
} catch {
  LocalAuth = null;
}

/** Device has biometric hardware AND the user has enrolled a face/fingerprint. */
export async function biometricLockAvailable(): Promise<boolean> {
  if (!LocalAuth) return false;
  try {
    const [hasHardware, enrolled] = await Promise.all([
      LocalAuth.hasHardwareAsync(),
      LocalAuth.isEnrolledAsync(),
    ]);
    return hasHardware && enrolled;
  } catch {
    return false;
  }
}

/** Prompt for Face ID / Touch ID; returns whether the user authenticated. */
export async function authenticate(promptMessage: string): Promise<boolean> {
  if (!LocalAuth) return true; // no module → cannot lock, fail open
  try {
    const res = await LocalAuth.authenticateAsync({
      promptMessage,
      // Allow the system passcode as a fallback so users are never locked out
      disableDeviceFallback: false,
    });
    return res.success;
  } catch {
    return false;
  }
}
