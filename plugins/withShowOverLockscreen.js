const { withAndroidManifest, AndroidConfig } = require("expo/config-plugins");

// Lets MainActivity draw over the lock screen and turn the device's screen
// on -- the same two flags a real alarm-clock app sets. This is what
// allows ClassAlarmScreen to actually appear (and wake the device) instead
// of just posting a notification, but ONLY WHILE THE APP'S PROCESS IS
// STILL ALIVE to notice the alarm time in App.js's polling loop and render
// the popup. It does not make Android wake up a fully-killed app on
// schedule -- that needs a native foreground service / AlarmManager-driven
// activity launch, well beyond what a manifest-only plugin can do. The
// scheduled OS notification (see notifications.js) remains the reliable
// fallback for when the app isn't running: Android already shows a
// high-priority notification as a heads-up banner over the lock screen on
// its own, no plugin needed for that part.
const withShowOverLockscreen = (config) => {
  config = withAndroidManifest(config, (config) => {
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    const mainActivity = (mainApplication.activity || []).find(
      (a) => a.$["android:name"] === ".MainActivity"
    );
    if (mainActivity) {
      mainActivity.$["android:showWhenLocked"] = "true";
      mainActivity.$["android:turnScreenOn"] = "true";
    }

    const manifest = config.modResults.manifest;
    manifest["uses-permission"] = manifest["uses-permission"] || [];
    const permissions = ["android.permission.USE_FULL_SCREEN_INTENT", "android.permission.WAKE_LOCK"];
    for (const perm of permissions) {
      const exists = manifest["uses-permission"].some((p) => p.$["android:name"] === perm);
      if (!exists) {
        manifest["uses-permission"].push({ $: { "android:name": perm } });
      }
    }

    return config;
  });
  return config;
};

module.exports = withShowOverLockscreen;
