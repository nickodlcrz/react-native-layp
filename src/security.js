import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import * as LocalAuthentication from "expo-local-authentication";

// A normal single-vault PIN lock. Stored in SecureStore (hardware-backed
// encryption on most devices), never in plain AsyncStorage.
const HASH_KEY = "layp-pin-hash";
const SALT = "layp-v2-";

export const PIN_LENGTH = 4;

// --- Brute-force lockout ---
// Wrong-PIN attempts and a lockout deadline are tracked in SecureStore
// (same vault as the hash itself, not the regular AsyncStorage the rest of
// the app's data lives in) so they survive an app restart -- otherwise
// simply force-closing and reopening the app would reset the counter and
// defeat the whole point. Lockout duration grows with repeated failures
// (30s, 1m, 2m, 5m, then capped at 15m) rather than a single fixed delay,
// so a few mistyped digits barely slow a real user down while sustained
// guessing gets progressively more expensive.
const ATTEMPTS_KEY = "layp-pin-attempts";
const LOCKOUT_UNTIL_KEY = "layp-pin-lockout-until";
const MAX_FREE_ATTEMPTS = 5;
const LOCKOUT_STEPS_MS = [30_000, 60_000, 120_000, 300_000, 900_000];

async function getAttempts() {
  const raw = await SecureStore.getItemAsync(ATTEMPTS_KEY);
  return raw ? Number(raw) || 0 : 0;
}

// Returns milliseconds remaining if currently locked out, otherwise 0.
export async function getLockoutRemaining() {
  const raw = await SecureStore.getItemAsync(LOCKOUT_UNTIL_KEY);
  if (!raw) return 0;
  const until = Number(raw) || 0;
  return Math.max(0, until - Date.now());
}

async function registerFailedAttempt() {
  const attempts = (await getAttempts()) + 1;
  await SecureStore.setItemAsync(ATTEMPTS_KEY, String(attempts));
  if (attempts >= MAX_FREE_ATTEMPTS) {
    const stepIndex = Math.min(attempts - MAX_FREE_ATTEMPTS, LOCKOUT_STEPS_MS.length - 1);
    const until = Date.now() + LOCKOUT_STEPS_MS[stepIndex];
    await SecureStore.setItemAsync(LOCKOUT_UNTIL_KEY, String(until));
  }
  return attempts;
}

async function clearAttempts() {
  await SecureStore.deleteItemAsync(ATTEMPTS_KEY);
  await SecureStore.deleteItemAsync(LOCKOUT_UNTIL_KEY);
}

async function hash(pin) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, SALT + pin);
}

export async function hasPinSetup() {
  const existing = await SecureStore.getItemAsync(HASH_KEY);
  return !!existing;
}

export async function setPin(pin) {
  const h = await hash(pin);
  await SecureStore.setItemAsync(HASH_KEY, h);
  await clearAttempts();
}

// Returns { ok, lockedOutMs, attemptsRemaining }. Checks the lockout window
// before even hashing/comparing the entered PIN -- a locked-out guess
// doesn't consume or reset anything, it's simply refused outright.
export async function verifyPin(pin) {
  const remaining = await getLockoutRemaining();
  if (remaining > 0) return { ok: false, lockedOutMs: remaining, attemptsRemaining: 0 };

  const stored = await SecureStore.getItemAsync(HASH_KEY);
  if (!stored) return { ok: false, lockedOutMs: 0, attemptsRemaining: MAX_FREE_ATTEMPTS };
  const h = await hash(pin);
  const ok = h === stored;
  if (ok) {
    await clearAttempts();
    return { ok: true, lockedOutMs: 0, attemptsRemaining: MAX_FREE_ATTEMPTS };
  }
  const attempts = await registerFailedAttempt();
  const lockedOutMs = await getLockoutRemaining();
  return { ok: false, lockedOutMs, attemptsRemaining: Math.max(0, MAX_FREE_ATTEMPTS - attempts) };
}

export async function clearPin() {
  await SecureStore.deleteItemAsync(HASH_KEY);
  await clearAttempts();
}

export async function isBiometricAvailable() {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  return hasHardware && isEnrolled;
}

// Fingerprint here is a normal convenience shortcut -- succeed and you're
// straight in, same as entering the correct PIN. No combination logic.
// Biometric attempts don't count toward the PIN lockout (the OS already
// rate-limits biometric attempts itself), but are still blocked outright
// while a PIN lockout is active, so biometrics can't be used to route
// around it.
export async function authenticateBiometric() {
  try {
    const remaining = await getLockoutRemaining();
    if (remaining > 0) return false;
    const available = await isBiometricAvailable();
    if (!available) return false;
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Unlock LAYP",
      cancelLabel: "Use PIN instead",
      disableDeviceFallback: true,
    });
    return result.success;
  } catch (e) {
    console.error("biometric auth failed", e);
    return false;
  }
}
