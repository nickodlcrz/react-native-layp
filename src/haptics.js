import * as Haptics from "expo-haptics";

// A small semantic vocabulary (success / select / impact) instead of
// importing expo-haptics directly at every call site -- keeps the "which
// buzz for which action" decision in one place, and every function here is
// wrapped in try/catch since haptics aren't available on every
// platform/device (web, some emulators, haptics disabled in system
// settings) and a missing buzz should never be the reason an action fails.

// A positive completion -- saving something, finishing a task, marking a
// bill paid, a transfer going through.
export async function hapticSuccess() {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // Haptics unsupported/unavailable -- silently skip, the action itself
    // already succeeded regardless of whether the phone could buzz about it.
  }
}

// A destructive/removal action -- deleting something.
export async function hapticImpact() {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } catch {
    // See hapticSuccess.
  }
}

// A light tick for a lower-stakes selection change (e.g. switching tabs) --
// not currently wired up anywhere, but kept here alongside the other two so
// any future call site reaches for this vocabulary instead of importing
// expo-haptics directly.
export async function hapticSelect() {
  try {
    await Haptics.selectionAsync();
  } catch {
    // See hapticSuccess.
  }
}
