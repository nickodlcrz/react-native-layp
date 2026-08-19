import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import * as LocalAuthentication from "expo-local-authentication";

// A normal single-vault PIN lock. Stored in SecureStore (hardware-backed
// encryption on most devices), never in plain AsyncStorage.
const HASH_KEY = "layp-pin-hash";
const SALT = "layp-v2-";

export const PIN_LENGTH = 4;

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
}

export async function verifyPin(pin) {
  const stored = await SecureStore.getItemAsync(HASH_KEY);
  if (!stored) return false;
  const h = await hash(pin);
  return h === stored;
}

export async function clearPin() {
  await SecureStore.deleteItemAsync(HASH_KEY);
}

export async function isBiometricAvailable() {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  return hasHardware && isEnrolled;
}

// Fingerprint here is a normal convenience shortcut -- succeed and you're
// straight in, same as entering the correct PIN. No combination logic.
export async function authenticateBiometric() {
  try {
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
