import AsyncStorage from "@react-native-async-storage/async-storage";

// The lock screen renders before the PIN is entered, so it can't read
// `dark` from the main app state (that's only loaded after unlocking).
// This is just a UI preference, not sensitive, so it's fine to keep it in
// its own small, always-readable key separate from the PIN-gated data.
const KEY = "layp-theme-pref";

export async function getThemePreference() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw === null ? null : raw === "dark";
  } catch (e) {
    return null;
  }
}

export async function setThemePreference(dark) {
  try {
    await AsyncStorage.setItem(KEY, dark ? "dark" : "light");
  } catch (e) {
    console.error("setThemePreference failed", e);
  }
}
