import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "layp-app-state";

export async function loadState() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error("loadState failed", e);
    return null;
  }
}

export async function saveState(state) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.error("saveState failed", e);
  }
}
