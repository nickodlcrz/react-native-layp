import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, Image, ActivityIndicator, useColorScheme } from "react-native";
import { Fingerprint, Delete, AlertTriangle, Sun, Moon } from "lucide-react-native";
import { LIGHT, DARK, ACCENT } from "../theme";
import { LOGO_LIGHT_URI, LOGO_DARK_URI } from "../assets/logo";
import { hasPinSetup, setPin, verifyPin, isBiometricAvailable, authenticateBiometric, PIN_LENGTH } from "../security";
import { getThemePreference, setThemePreference } from "../themePreference";

const KEYPAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];

export default function LockScreen({ onUnlock }) {
  const systemScheme = useColorScheme();
  const [dark, setDark] = useState(systemScheme === "dark");
  const theme = dark ? DARK : LIGHT;

  const [checking, setChecking] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [setupStage, setSetupStage] = useState("create"); // "create" | "confirm"
  const [firstPin, setFirstPin] = useState("");
  const [pin, setPinInput] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    (async () => {
      const setup = await hasPinSetup();
      const bio = await isBiometricAvailable();
      const storedDark = await getThemePreference();
      if (storedDark !== null) setDark(storedDark);
      setBioAvailable(bio);
      setNeedsSetup(!setup);
      setChecking(false);
      if (setup && bio) {
        // Offer fingerprint immediately on a normal unlock screen.
        tryBiometric();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleDark() {
    setDark((d) => {
      const next = !d;
      setThemePreference(next);
      return next;
    });
  }

  async function tryBiometric() {
    const ok = await authenticateBiometric();
    if (ok) onUnlock();
  }

  function handleDigit(d) {
    if (d === "" || busy) return;
    if (d === "back") {
      setPinInput((p) => p.slice(0, -1));
      setError("");
      return;
    }
    const next = (pin + d).slice(0, PIN_LENGTH);
    setPinInput(next);
    setError("");
    if (next.length === PIN_LENGTH) {
      if (needsSetup) handleSetupDigitsComplete(next);
      else handleUnlockDigitsComplete(next);
    }
  }

  async function handleSetupDigitsComplete(entered) {
    if (setupStage === "create") {
      setFirstPin(entered);
      setPinInput("");
      setSetupStage("confirm");
      return;
    }
    // confirm stage
    if (entered !== firstPin) {
      setError("PINs didn't match. Try again.");
      triggerShake();
      setPinInput("");
      setFirstPin("");
      setSetupStage("create");
      return;
    }
    setBusy(true);
    await setPin(entered);
    setBusy(false);
    onUnlock();
  }

  async function handleUnlockDigitsComplete(entered) {
    setBusy(true);
    const ok = await verifyPin(entered);
    setBusy(false);
    if (ok) {
      onUnlock();
    } else {
      setError("Incorrect PIN.");
      triggerShake();
      setPinInput("");
    }
  }

  function triggerShake() {
    setShake(true);
    setTimeout(() => setShake(false), 400);
  }

  if (checking) {
    return (
      <View style={[styles.safe, { backgroundColor: theme.bg, alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={theme.textMuted} />
      </View>
    );
  }

  const title = needsSetup
    ? setupStage === "create" ? "Create a PIN" : "Confirm your PIN"
    : "Enter PIN";
  const subtitle = needsSetup
    ? setupStage === "create" ? "Protects your budget on this device" : "Enter it once more"
    : "Unlock LAYP";

  return (
    <View style={[styles.safe, { backgroundColor: theme.bg }]}>
      <Pressable onPress={toggleDark} style={[styles.themeBtn, { backgroundColor: theme.card, borderColor: theme.line }]} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        {dark ? <Sun size={14} color={ACCENT.gold} /> : <Moon size={14} color={theme.text} />}
      </Pressable>
      <View style={styles.top}>
        <Image source={{ uri: dark ? LOGO_DARK_URI : LOGO_LIGHT_URI }} style={styles.logo} />
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.subtitle, { color: theme.textMuted }]}>{subtitle}</Text>

        <View style={[styles.dotsRow, shake && styles.shake]}>
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <View key={i} style={[styles.dot, { borderColor: theme.accentDark, backgroundColor: i < pin.length ? theme.accentDark : "transparent" }]} />
          ))}
        </View>

        {error ? (
          <View style={styles.errorRow}>
            <AlertTriangle size={12} color={ACCENT.ember} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : busy ? (
          <ActivityIndicator color={theme.textMuted} style={{ marginTop: 8 }} />
        ) : (
          <View style={{ height: 20 }} />
        )}
      </View>

      <View style={styles.keypad}>
        {KEYPAD.map((k, i) => {
          if (k === "") {
            return !needsSetup && bioAvailable ? (
              <Pressable key={i} onPress={tryBiometric} style={styles.key} disabled={busy}>
                <Fingerprint size={22} color={ACCENT.gold} />
              </Pressable>
            ) : (
              <View key={i} style={styles.key} />
            );
          }
          if (k === "back") {
            return (
              <Pressable key={i} onPress={() => handleDigit("back")} style={styles.key} disabled={busy}>
                <Delete size={20} color={theme.textMuted} />
              </Pressable>
            );
          }
          return (
            <Pressable key={i} onPress={() => handleDigit(k)} style={styles.key} disabled={busy}>
              <Text style={[styles.keyText, { color: theme.text }]}>{k}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, justifyContent: "space-between" },
  themeBtn: { position: "absolute", top: 16, right: 16, width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", borderWidth: 1, zIndex: 10 },
  top: { alignItems: "center", paddingTop: 80, paddingHorizontal: 32 },
  logo: { width: 52, height: 52, borderRadius: 14, marginBottom: 14 },
  title: { fontSize: 18, fontWeight: "800", marginBottom: 4 },
  subtitle: { fontSize: 12, marginBottom: 24 },
  dotsRow: { flexDirection: "row", gap: 14 },
  shake: { transform: [{ translateX: 0 }] },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5 },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14 },
  errorText: { color: "#D1573F", fontSize: 11 },
  keypad: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 24, paddingBottom: 36 },
  key: { width: "33.33%", height: 76, alignItems: "center", justifyContent: "center" },
  keyText: { fontSize: 24, fontWeight: "600" },
});
