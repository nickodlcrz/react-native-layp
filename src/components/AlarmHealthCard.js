import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, AppState, Linking } from "react-native";
import { useTheme, ACCENT } from "../theme";
import { SurfaceCard, ActionButton, featureStyles as fs } from "./FeatureUI";
import { showAppDialog } from "./AppDialog";
import { getAlarmStatus, isNativeAlarmAvailable, openExactAlarmSettings, openFullScreenAlarmSettings, openBatteryOptimizationSettings, openAlarmNotificationSettings, testAlarm, cancelAlarm } from "../../modules/layp-alarm";
import useClock from "../hooks/useClock";

export default function AlarmHealthCard() {
  const { theme } = useTheme(); const [status, setStatus] = useState(null); const [error, setError] = useState(false); const [testAt, setTestAt] = useState(0); const [busy, setBusy] = useState(false);
  const now = useClock(1000); const mounted = useRef(true);
  const refresh = useCallback(async () => {
    try { const s = await getAlarmStatus(); if (mounted.current) { setStatus(s); setError(false); } }
    catch { if (mounted.current) setError(true); }
  }, []);
  useEffect(() => { mounted.current = true; refresh(); const sub = AppState.addEventListener("change", (s) => { if (s === "active") refresh(); }); return () => { mounted.current = false; sub.remove(); }; }, [refresh]);
  const remaining = Math.max(0, Math.ceil((testAt - now.getTime()) / 1000));
  const ready = status?.notificationsEnabled && status?.exactAlarmsAllowed && status?.alarmChannelEnabled !== false;
  async function runTest() {
    setBusy(true);
    try { const at = await testAlarm(); if (!at) throw new Error("This Android build does not support the test alarm."); if (mounted.current) setTestAt(at); }
    catch { showAppDialog("Test alarm", "The test could not be scheduled. Install the latest LAYP Android APK and check its alarm permissions."); }
    finally { if (mounted.current) setBusy(false); }
  }
  const checks = [
    ["notificationsEnabled", "Notifications", "Allow notifications so alarm controls are visible.", () => Linking.openSettings()],
    ["alarmChannelEnabled", "Alarm notification channel", "Use high importance to allow the ringing screen to appear.", openAlarmNotificationSettings],
    ["exactAlarmsAllowed", "Exact alarm timing", "Allows classes and task alarms to ring on time.", openExactAlarmSettings],
    ["fullScreenAlarmsAllowed", "Ringing screen", "Allows alarms to appear over the lock screen.", openFullScreenAlarmSettings],
    ["ignoringBatteryOptimizations", "Background battery access", "Recommended for reliable reminders while LAYP is closed.", openBatteryOptimizationSettings],
  ];
  const open = async (action) => { try { await action(); } catch { showAppDialog("Open settings", "Open your phone settings, select LAYP, and check its notification, alarm, or battery permissions."); } };
  return <SurfaceCard>
    <Text style={[fs.title, { color: theme.text }]}>Alarm health check</Text>
    {!isNativeAlarmAvailable() ? <Text style={[fs.caption, { color: theme.textMuted }]}>Install the LAYP Android APK to check native alarms. Expo Go cannot run this check.</Text> : <>
      {!status && <Text style={[fs.caption, { color: theme.textMuted, marginBottom: 12 }]}>{error ? "Could not read permissions. Try checking again." : "Checking your phone’s alarm settings…"}</Text>}
      {status && checks.map(([key, title, hint, action]) => <View key={key} style={{ borderBottomWidth: 1, borderBottomColor: theme.line, paddingVertical: 12 }}>
        <View style={fs.row}><Text style={{ color: theme.text, flex: 1, fontSize: 13, fontWeight: "600" }}>{title}</Text><Text style={{ color: status[key] === false ? ACCENT.ember : status[key] === true ? ACCENT.leaf : theme.textMuted, fontSize: 11 }}>{status[key] === false ? "Needs attention" : status[key] === true ? "Ready" : "Check settings"}</Text></View>
        <Text style={[fs.caption, { color: theme.textMuted, marginTop: 4 }]}>{hint}</Text>{status[key] !== true && <ActionButton label="Open settings" secondary onPress={() => open(action)} style={{ marginTop: 8, alignSelf: "flex-start" }} />}
      </View>)}
      <View style={{ marginTop: 14, gap: 8 }}><ActionButton label={remaining ? `Test alarm in ${remaining}s · cancel` : "Test alarm in 10 seconds"} disabled={busy || (!remaining && !ready)} onPress={remaining ? async () => { try { await cancelAlarm("layp:test"); setTestAt(0); } catch { showAppDialog("Cancel test", "Could not cancel the test alarm. Dismiss it when it rings."); } } : runTest} />
      <ActionButton label="Check again" secondary onPress={refresh} /></View>
      <Text style={[fs.caption, { color: theme.textMuted, marginTop: 10 }]}>{testAt && !remaining ? "Confirm that you heard the alarm and saw its screen. Permission checks alone cannot verify your phone’s behavior." : ready ? "Start the test, then lock your phone to check sound and the ringing screen." : "Enable notifications and exact timing before starting the test."}</Text>
    </>}
  </SurfaceCard>;
}
