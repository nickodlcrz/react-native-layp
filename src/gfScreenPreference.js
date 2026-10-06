import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "layp:gfScreenEnabled";
export const DEFAULT_GF_SCREEN_ENABLED = true;

export async function loadGfScreenEnabled() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw === null) return DEFAULT_GF_SCREEN_ENABLED;
    return raw !== "0";
  } catch (e) {
    return DEFAULT_GF_SCREEN_ENABLED;
  }
}

export async function saveGfScreenEnabled(enabled) {
  try {
    await AsyncStorage.setItem(KEY, enabled ? "1" : "0");
  } catch (e) {
    console.error("saveGfScreenEnabled failed", e);
  }
}
