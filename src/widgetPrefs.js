import AsyncStorage from "@react-native-async-storage/async-storage";
import { normalizeWidgetPrefs } from "./widgetPrefsLogic";

export { ALL_EVENT_KINDS, DEFAULT_WIDGET_PREFS, normalizeWidgetPrefs, toggleKind } from "./widgetPrefsLogic";

// What each date widget shows, chosen in Settings > Widgets. Kept in its own
// small AsyncStorage key (like the lock timeout and theme) because it's a
// device preference, not app data -- it isn't part of backups.
//   calendarKinds  event kinds marked on the Calendar widget
//   upcomingKinds  event kinds listed in the Upcoming events widget
const KEY = "layp:widgetPrefs";

export async function loadWidgetPrefs() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return normalizeWidgetPrefs(raw ? JSON.parse(raw) : null);
  } catch (e) {
    return normalizeWidgetPrefs(null);
  }
}

export async function saveWidgetPrefs(prefs) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(normalizeWidgetPrefs(prefs)));
  } catch (e) {
    console.error("saveWidgetPrefs failed", e);
  }
}
