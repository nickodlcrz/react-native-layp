import React, { useMemo, useState, useEffect } from "react";
import { View, Text, TextInput } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme, ACCENT } from "../theme";
import { peso, fmtDay } from "../utils";
import { budgetForecast } from "../budgetForecast";
import { SurfaceCard, featureStyles as fs } from "./FeatureUI";
import SegmentedTabs from "./SegmentedTabs";
import { localDate } from "../planner";
import useClock from "../hooks/useClock";
const KEY = "layp:forecastReserve";
export default function BudgetForecastCard({ balance, bills, recurringIncome, hidden }) {
  const { theme } = useTheme(); const now = useClock();
  const [days, setDays] = useState(30); const [reserve, setReserve] = useState(""); const [loaded, setLoaded] = useState(false);
  useEffect(() => { let alive = true; AsyncStorage.getItem(KEY).then((v) => { if (alive) setReserve(v || ""); }).catch(() => {}).finally(() => { if (alive) setLoaded(true); }); return () => { alive = false; }; }, []);
  useEffect(() => { if (!loaded) return; const timer = setTimeout(() => AsyncStorage.setItem(KEY, reserve).catch(() => {}), 400); return () => clearTimeout(timer); }, [reserve, loaded]);
  const forecast = useMemo(() => budgetForecast({ balance, bills, recurringIncome, today: localDate(now), days, plannedSavings: reserve }), [balance, bills, recurringIncome, now, days, reserve]);
  const amount = (n) => hidden ? "₱••••" : peso(n);
  return <SurfaceCard>
    <Text style={[fs.title, { color: theme.text }]}>Budget forecast</Text><Text style={[fs.caption, { color: theme.textMuted, marginBottom: 12 }]}>Your projected balance through {fmtDay(forecast.horizon)}</Text>
    <SegmentedTabs options={[{ key: 7, label: "7 days" }, { key: 30, label: "30 days" }]} value={days} onChange={setDays} />
    <Text style={{ color: forecast.projectedBalance < 0 ? ACCENT.ember : theme.text, fontSize: 28, fontWeight: "700", marginBottom: 14 }}>{amount(forecast.projectedBalance)}</Text>
    {[['Current balance', balance], ['Scheduled income', forecast.expectedIncome], ['Bills to pay', -forecast.expectedBills], ['Savings to set aside', -forecast.plannedSavings]].map(([label, value]) => <View key={label} style={[fs.row, { marginBottom: 9 }]}><Text style={[fs.caption, { color: theme.textMuted }]}>{label}</Text><Text style={{ color: theme.text, fontWeight: "600" }}>{amount(value)}</Text></View>)}
    <Text style={[fs.caption, { color: theme.textMuted, marginTop: 6 }]}>Additional savings for this period</Text>
    <TextInput editable={loaded} value={reserve} onChangeText={(v) => /^\d{0,9}(\.\d{0,2})?$/.test(v) && setReserve(v)} keyboardType="decimal-pad" secureTextEntry={hidden} placeholder="0.00" placeholderTextColor={theme.textMuted} accessibilityLabel="Planned savings amount for the forecast" style={{ backgroundColor: theme.bg, borderColor: theme.line, borderWidth: 1, borderRadius: 12, color: theme.text, padding: 12, marginTop: 6 }} />
    {forecast.shortfallDate && <Text style={[fs.caption, { color: ACCENT.ember, marginTop: 12 }]}>{hidden ? "A projected shortfall needs attention." : `Balance may go below zero on ${fmtDay(forecast.shortfallDate)}. Lowest projected balance: ${peso(forecast.lowestBalance)}.`}</Text>}
    <Text style={[fs.caption, { color: theme.textMuted, marginTop: 12 }]}>Includes recurring bills, partial payments, and scheduled income. Everyday spending and loan repayments are not included. Savings here are a plan; money is moved only when you record it.</Text>
  </SurfaceCard>;
}
