import React, { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert } from "react-native";
import Slider from "@react-native-community/slider";
import { ArrowLeft, Plus, Trash2, Check, Bell } from "lucide-react-native";
import { useTheme, ACCENT, PALETTE, DEFAULT_SPLITS } from "../theme";
import { peso, uid, todayISO, normalizeSplits, removeSplitAndRedistribute, computeDailyBudgetReview, categoryStatusText, isPositiveAmount } from "../utils";
import Chip from "../components/Chip";
import EmptyState from "../components/EmptyState";
import TimePicker from "../components/TimePicker";

// If the current splits exactly match a known preset, show that preset's
// name; otherwise this is a user-customized model.
function matchPresetName(splits) {
  for (const [name, preset] of Object.entries(DEFAULT_SPLITS)) {
    if (splits.length === preset.length && preset.every((p, i) => splits[i]?.label === p.label && splits[i]?.percent === p.percent)) return name;
  }
  return "Custom";
}

export default function DailyBudgetScreen({
  splits, setSplits, accounts, moneyLog, expenses, weeklySummaries, loans, transfers,
  savingsLog, setSavingsLog, dailyBudgetSettings, setDailyBudgetSettings, setDailyBudgetLog,
  onClose,
}) {
  const { theme } = useTheme();
  const [view, setView] = useState("review");
  const [showCustom, setShowCustom] = useState(false);
  const [customAmount, setCustomAmount] = useState("");
  const [saveAccount, setSaveAccount] = useState(accounts[0]?.id);

  const review = computeDailyBudgetReview({ splits, accounts, moneyLog, expenses, weeklySummaries, loans, savingsLog, transfers });
  const totalPercent = splits.reduce((s, x) => s + x.percent, 0);
  const modelName = matchPresetName(splits);

  function applyPreset(key) { setSplits(DEFAULT_SPLITS[key].map((s) => ({ ...s }))); }
  function updateSplitPercent(idx, val) { setSplits((prev) => normalizeSplits(prev, idx, val)); }
  function updateSplitLabel(idx, label) { setSplits((prev) => prev.map((s, i) => (i === idx ? { ...s, label } : s))); }
  function addSplit() {
    setSplits((prev) => {
      const color = PALETTE[prev.length % PALETTE.length];
      const next = [...prev, { id: uid(), label: "New category", percent: 0, color }];
      return normalizeSplits(next, next.length - 1, 10);
    });
  }
  function removeSplit(id) { setSplits((prev) => removeSplitAndRedistribute(prev, id)); }

  function logDecision(entry) {
    setDailyBudgetLog((prev) => [...prev, { id: uid(), date: todayISO(), ...entry }]);
  }

  // The user always makes the final call -- these actions never fire
  // automatically. "Keep"/"Remind" don't move any money; the next day's
  // review simply recomputes off the current balance, so nothing gets
  // double-counted across days.
  function saveAmount(amount) {
    if (!review.savings || !isPositiveAmount(amount)) return;
    setSavingsLog((prev) => [...prev, { id: uid(), amount: Number(amount), account: saveAccount, splitId: review.savings.id, note: "Daily budget review", date: todayISO(), type: "deposit", createdAt: Date.now() }]);
    logDecision({ choice: "saved", amount: Number(amount) });
    setShowCustom(false);
    setCustomAmount("");
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.headerRow}>
        <Pressable onPress={onClose} style={[styles.roundBtn, { backgroundColor: theme.card, borderColor: theme.line, borderWidth: 1 }]} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Back">
          <ArrowLeft size={16} color={theme.text} />
        </Pressable>
        <Text style={[styles.h1, { color: theme.text }]}>Daily Budget</Text>
        <View style={{ width: 30 }} />
      </View>

      <View style={styles.chipRow}>
        <Chip label="Today's review" active={view === "review"} onPress={() => setView("review")} small />
        <Chip label="Model & reminder" active={view === "settings"} onPress={() => setView("settings")} small />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
        {view === "review" ? (
          <ReviewView
            review={review} theme={theme} modelName={modelName}
            showCustom={showCustom} setShowCustom={setShowCustom}
            customAmount={customAmount} setCustomAmount={setCustomAmount}
            onSaveRecommended={() => saveAmount(Math.max(0, review.savings?.remaining || 0))}
            onSaveCustom={() => saveAmount(customAmount)}
            onKeep={() => { logDecision({ choice: "kept" }); Alert.alert("Noted", "This money stays available -- it won't be counted as saved."); }}
            onRemind={() => { logDecision({ choice: "remind" }); Alert.alert("Okay", "Tomorrow's review will pick this back up."); }}
            accounts={accounts} saveAccount={saveAccount} setSaveAccount={setSaveAccount}
          />
        ) : (
          <SettingsView
            theme={theme} splits={splits} totalPercent={totalPercent}
            applyPreset={applyPreset} addSplit={addSplit} removeSplit={removeSplit}
            updateSplitPercent={updateSplitPercent} updateSplitLabel={updateSplitLabel}
            dailyBudgetSettings={dailyBudgetSettings} setDailyBudgetSettings={setDailyBudgetSettings}
          />
        )}
      </ScrollView>
    </View>
  );
}

function HeroCard({ review, modelName, theme }) {
  return (
    <View style={[styles.heroCard, { backgroundColor: theme.accentDark }]}>
      <Text style={[styles.heroLabel, { color: ACCENT.gold }]}>{modelName} - Today's Budget</Text>
      <Text style={styles.heroValue}>{peso(review.availableMoney)}</Text>
      <Text style={styles.heroSub}>available money -- {peso(review.spentToday)} spent today</Text>
    </View>
  );
}

function ReviewView({ review, theme, modelName, showCustom, setShowCustom, customAmount, setCustomAmount, onSaveRecommended, onSaveCustom, onKeep, onRemind, accounts, saveAccount, setSaveAccount }) {
  if (!review.hasIncome) {
    return (
      <>
        <HeroCard review={review} modelName={modelName} theme={theme} />
        <EmptyState text="No available budget for today's review." />
      </>
    );
  }

  const spendCategories = review.categories.filter((c) => !c.isSavings);

  return (
    <>
      <HeroCard review={review} modelName={modelName} theme={theme} />

      {!review.hasSpending && (
        <Text style={[styles.hintText, { color: theme.textMuted }]}>No spending recorded today.</Text>
      )}

      {spendCategories.map((cat) => (
        <View key={cat.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line }]}>
          <View style={styles.rowBetween}>
            <Text style={[styles.catLabel, { color: theme.text }]}>{cat.label} -- {cat.percent}%</Text>
            <Text style={[styles.catAmount, { color: cat.color }]}>{peso(cat.recommended)}</Text>
          </View>
          <View style={styles.rowBetween}>
            <Text style={[styles.metaText, { color: theme.textMuted }]}>Spent {peso(cat.actual)}</Text>
            <Text style={[styles.metaText, { color: cat.remaining < 0 ? ACCENT.ember : theme.textMuted }]}>
              {peso(Math.abs(cat.remaining))} {cat.remaining < 0 ? "over" : "left"}
            </Text>
          </View>
          <Text style={[styles.statusText, { color: cat.remaining < 0 ? ACCENT.ember : theme.textMuted }]}>{categoryStatusText(cat)}</Text>
          {cat.kind === "needs" && cat.remaining > 0.5 && (
            <Text style={[styles.statusText, { color: theme.textMuted }]}>Consider keeping {peso(cat.remaining)} available for upcoming necessities.</Text>
          )}
          {cat.kind === "wants" && review.wantsReserveNote && (
            <>
              <Text style={[styles.statusText, { color: ACCENT.sky }]}>{"\u{1F4A1}"} {review.wantsReserveNote}</Text>
              <Text style={[styles.statusTextStrong, { color: theme.text }]}>Safe to spend on {cat.label}: {peso(review.wantsSafeToSpend)}</Text>
            </>
          )}
        </View>
      ))}

      {review.savings && (
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line }]}>
          <View style={styles.rowBetween}>
            <Text style={[styles.catLabel, { color: theme.text }]}>{review.savings.label} -- {review.savings.percent}%</Text>
            <Text style={[styles.catAmount, { color: ACCENT.leaf }]}>{peso(review.savings.recommended)}</Text>
          </View>
          <Text style={[styles.metaText, { color: theme.textMuted }]}>{peso(review.savings.actual)} saved today</Text>
          <Text style={[styles.statusText, { color: theme.textMuted }]}>{categoryStatusText(review.savings)}</Text>

          {review.savings.remaining > 0.5 && (
            <>
              <Text style={[styles.miniLabel, { color: theme.textMuted, marginTop: 10 }]}>Save into</Text>
              <View style={styles.chipWrap}>
                {accounts.map((a) => <Chip key={a.id} label={a.label} color={a.color} active={saveAccount === a.id} onPress={() => setSaveAccount(a.id)} small />)}
              </View>
              <View style={styles.actionRow}>
                <Pressable onPress={onSaveRecommended} style={[styles.actionBtn, { backgroundColor: ACCENT.leaf }]}>
                  <Text style={styles.actionBtnText}>Save {peso(review.savings.remaining)}</Text>
                </Pressable>
                <Pressable onPress={() => setShowCustom((s) => !s)} style={[styles.actionBtn, { backgroundColor: theme.accentDark }]}>
                  <Text style={styles.actionBtnText}>Custom amount</Text>
                </Pressable>
              </View>
              {showCustom && (
                <View style={styles.customRow}>
                  <TextInput
                    value={customAmount}
                    onChangeText={(v) => setCustomAmount(v.replace(/[^0-9.]/g, ""))}
                    placeholder="0.00" keyboardType="decimal-pad" placeholderTextColor={theme.textMuted}
                    style={[styles.customInput, { backgroundColor: theme.bg, color: theme.text }]}
                    autoFocus
                  />
                  <Pressable onPress={onSaveCustom} style={[styles.customConfirm, { backgroundColor: ACCENT.leaf }]}>
                    <Check size={14} color="#fff" />
                  </Pressable>
                </View>
              )}
              <View style={styles.actionRow}>
                <Pressable onPress={onKeep} style={[styles.actionBtnOutline, { borderColor: theme.line }]}>
                  <Text style={[styles.actionBtnOutlineText, { color: theme.text }]}>Keep for tomorrow</Text>
                </Pressable>
                <Pressable onPress={onRemind} style={[styles.actionBtnOutline, { borderColor: theme.line }]}>
                  <Text style={[styles.actionBtnOutlineText, { color: theme.text }]}>Remind me tomorrow</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      )}
    </>
  );
}

function SettingsView({ theme, splits, totalPercent, applyPreset, addSplit, removeSplit, updateSplitPercent, updateSplitLabel, dailyBudgetSettings, setDailyBudgetSettings }) {
  return (
    <>
      <Text style={[styles.h2, { color: theme.text }]}>Budget model</Text>
      <Text style={[styles.hintText, { color: theme.textMuted }]}>A guideline for the daily review -- it never moves money or blocks spending on its own.</Text>
      <View style={styles.chipRow}>
        <Chip label="50-30-20" onPress={() => applyPreset("50-30-20")} small />
        <Chip label="70-20-10" onPress={() => applyPreset("70-20-10")} small />
        <Pressable onPress={addSplit} style={[styles.addSplitBtn, { backgroundColor: theme.card, borderColor: theme.line }]}>
          <Plus size={11} color={theme.text} />
          <Text style={{ fontSize: 10, fontWeight: "600", color: theme.text }}>Add category</Text>
        </Pressable>
      </View>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line }]}>
        {splits.map((s, i) => (
          <View key={s.id} style={{ marginBottom: 16 }}>
            <View style={styles.rowBetween}>
              <TextInput value={s.label} onChangeText={(v) => updateSplitLabel(i, v)} style={[styles.splitLabelInput, { color: theme.text }]} />
              <Text style={[styles.splitPercent, { color: s.color }]}>{s.percent}%</Text>
              {splits.length > 1 && (
                <Pressable onPress={() => removeSplit(s.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel={`Remove ${s.label} category`}>
                  <Trash2 size={12} color={theme.textMuted} />
                </Pressable>
              )}
            </View>
            <Slider minimumValue={0} maximumValue={100} step={1} value={s.percent} onValueChange={(v) => updateSplitPercent(i, v)} minimumTrackTintColor={s.color} maximumTrackTintColor={theme.bg} />
          </View>
        ))}
        <View style={styles.autoBalanceRow}>
          {totalPercent === 100 ? <Check size={11} color={ACCENT.leaf} /> : null}
          <Text style={{ fontSize: 9, color: totalPercent === 100 ? ACCENT.leaf : ACCENT.ember }}>
            {totalPercent === 100 ? "Splits equal 100% automatically." : "Splits must equal 100%."}
          </Text>
        </View>
      </View>

      <Text style={[styles.h2, { color: theme.text, marginTop: 8 }]}>Daily review reminder</Text>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line }]}>
        <View style={styles.rowBetween}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Bell size={14} color={dailyBudgetSettings.enabled ? ACCENT.gold : theme.textMuted} />
            <Text style={[styles.catLabel, { color: theme.text }]}>Daily review</Text>
          </View>
          <Pressable
            onPress={() => setDailyBudgetSettings((s) => ({ ...s, enabled: !s.enabled }))}
            style={[styles.toggleTrack, { backgroundColor: dailyBudgetSettings.enabled ? ACCENT.leaf : theme.bg }]}
            accessibilityLabel={dailyBudgetSettings.enabled ? "Turn off daily review reminder" : "Turn on daily review reminder"}
          >
            <View style={[styles.toggleDot, dailyBudgetSettings.enabled && styles.toggleDotOn]} />
          </Pressable>
        </View>
        {dailyBudgetSettings.enabled && (
          <View style={{ marginTop: 12 }}>
            <TimePicker value={dailyBudgetSettings.time} onChange={(t) => setDailyBudgetSettings((s) => ({ ...s, time: t }))} label="Review time" />
          </View>
        )}
        <Text style={[styles.hintText, { color: theme.textMuted, marginTop: 10, marginBottom: 0 }]}>
          At this time LAYP sends a notification encouraging you to open today's review -- it never puts your full financial summary inside the notification itself.
        </Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  roundBtn: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  h1: { fontSize: 17, fontWeight: "700" },
  h2: { fontSize: 14, fontWeight: "700", marginBottom: 6 },
  chipRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", marginBottom: 4, gap: 6 },
  addSplitBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1.5 },
  heroCard: { borderRadius: 20, padding: 18, marginBottom: 14 },
  heroLabel: { fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  heroValue: { fontSize: 30, fontWeight: "800", fontFamily: "monospace", color: "#fff", marginTop: 4 },
  heroSub: { fontSize: 10, color: "#ffffff99", marginTop: 2 },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 12 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  catLabel: { fontSize: 13, fontWeight: "700" },
  catAmount: { fontSize: 13, fontWeight: "700", fontFamily: "monospace" },
  metaText: { fontSize: 10, fontFamily: "monospace" },
  statusText: { fontSize: 11, lineHeight: 15, marginTop: 6 },
  statusTextStrong: { fontSize: 12, fontWeight: "700", marginTop: 4 },
  hintText: { fontSize: 11, lineHeight: 15, marginBottom: 10 },
  miniLabel: { fontSize: 9, fontWeight: "700", textTransform: "uppercase", marginBottom: 4 },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  actionBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: "center" },
  actionBtnText: { fontSize: 11, fontWeight: "700", color: "#fff" },
  actionBtnOutline: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: "center", borderWidth: 1 },
  actionBtnOutlineText: { fontSize: 11, fontWeight: "700" },
  customRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  customInput: { flex: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontFamily: "monospace", fontSize: 13 },
  customConfirm: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  splitLabelInput: { flex: 1, fontSize: 12, fontWeight: "600" },
  splitPercent: { fontSize: 11, fontWeight: "600", fontFamily: "monospace" },
  autoBalanceRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  toggleTrack: { width: 44, height: 24, borderRadius: 12, padding: 2, justifyContent: "center" },
  toggleDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff", alignSelf: "flex-start" },
  toggleDotOn: { alignSelf: "flex-end" },
});
