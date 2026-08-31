import React, { useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, FlatList, StyleSheet, Linking, Platform, Switch, Alert } from "react-native";
import {
  CheckCircle2, Circle, Plus, X, Pencil, Trash2, List, CalendarDays,
  ChevronLeft, ChevronRight, AlertTriangle, ChevronDown, ChevronUp, Settings, Bell, BellOff,
} from "lucide-react-native";
import { useTheme, ACCENT, CATEGORIES } from "../theme";
import { uid, todayISO, daysUntil, fmtDay, getWeekDates, confirmDelete } from "../utils";
import Chip from "../components/Chip";
import EmptyState from "../components/EmptyState";
import CalendarPicker from "../components/CalendarPicker";
import NotifyPicker from "../components/NotifyPicker";
import { rescheduleTodoNotifications, cancelTodoNotifications } from "../notifications";

export default function TodoScreen({ todos, setTodos, subjects = [], prefillSubjectId, onConsumePrefillSubject }) {
  const { theme } = useTheme();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState("list");
  const [statusView, setStatusView] = useState("active");
  const [weekAnchor, setWeekAnchor] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [pendingSubjectId, setPendingSubjectId] = useState(null);

  // Coming from Subject Detail's "+ Add task" -- open the form pre-linked to
  // that subject, then let the parent clear the request so it doesn't
  // re-trigger on every re-render.
  React.useEffect(() => {
    if (prefillSubjectId) {
      setEditingId(null);
      setPendingSubjectId(prefillSubjectId);
      setShowForm(true);
      onConsumePrefillSubject?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillSubjectId]);

  const weekDates = useMemo(() => getWeekDates(weekAnchor), [weekAnchor]);

  const schoolConflicts = useMemo(() => {
    const byDate = {};
    todos.filter((t) => t.category === "school" && !t.completed && t.dueDate).forEach((t) => {
      byDate[t.dueDate] = (byDate[t.dueDate] || 0) + 1;
    });
    return Object.entries(byDate).filter(([, c]) => c > 1).map(([d]) => d);
  }, [todos]);

  const filtered = useMemo(() => {
    let list = todos.filter((t) => (statusView === "active" ? !t.completed : t.completed));
    list = list.filter((t) => filter === "all" || t.category === filter);
    if (statusView === "active" && view === "week") {
      list = list.filter((t) => weekDates.includes(t.dueDate));
      if (selectedDay) list = list.filter((t) => t.dueDate === selectedDay);
    }
    if (statusView === "active") return [...list].sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
    return [...list].sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));
  }, [todos, filter, view, weekDates, selectedDay, statusView]);

  async function saveTodo(data) {
    if (editingId) {
      const prev = todos.find((t) => t.id === editingId);
      const merged = { ...prev, ...data };
      const notificationIds = await rescheduleTodoNotifications(merged);
      setTodos((prevList) => prevList.map((t) => (t.id === editingId ? { ...merged, notificationIds } : t)));
      setEditingId(null);
    } else {
      const draft = { id: uid(), ...data, completed: false };
      const notificationIds = await rescheduleTodoNotifications(draft);
      setTodos((prev) => [...prev, { ...draft, notificationIds }]);
    }
    setShowForm(false);
    setPendingSubjectId(null);
  }

  async function toggle(id) {
    const t = todos.find((x) => x.id === id);
    const nowCompleted = !t.completed;
    if (nowCompleted) await cancelTodoNotifications(t.notificationIds);
    setTodos((prev) => prev.map((x) => (x.id === id ? { ...x, completed: nowCompleted, completedAt: nowCompleted ? new Date().toISOString() : null } : x)));
  }
  async function remove(id) {
    const t = todos.find((x) => x.id === id);
    confirmDelete(Alert, "Delete this task?", `"${t?.title}" will be removed for good.`, async () => {
      if (t?.notificationIds) await cancelTodoNotifications(t.notificationIds);
      setTodos((prev) => prev.filter((x) => x.id !== id));
      if (editingId === id) { setEditingId(null); setShowForm(false); }
    });
  }
  function startEdit(t) { setEditingId(t.id); setShowForm(true); }
  function startAdd() { setEditingId(null); setShowForm((s) => !s); }
  function toggleSubtask(todoId, subId) {
    setTodos((prev) => prev.map((t) => t.id === todoId ? { ...t, subtasks: (t.subtasks || []).map((s) => s.id === subId ? { ...s, done: !s.done } : s) } : t));
  }

  const editingTodo = editingId ? todos.find((t) => t.id === editingId) : null;

  return (
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 12 }}
      data={filtered}
      keyExtractor={(t) => t.id}
      renderItem={({ item: t }) => (
        <TodoRow
          t={t}
          subject={t.subjectId ? subjects.find((s) => s.id === t.subjectId) : null}
          isExpanded={expandedId === t.id}
          onToggle={toggle}
          onEdit={startEdit}
          onRemove={remove}
          onExpand={setExpandedId}
          onToggleSubtask={toggleSubtask}
        />
      )}
      ListEmptyComponent={
        <EmptyState text={statusView === "done" ? "No finished tasks yet." : "No tasks here yet. Add one to get started."} />
      }
      ListHeaderComponent={
        <>
          <View style={styles.headerRow}>
            <Text style={[styles.h1, { color: theme.text }]}>Your tasks</Text>
            <View style={styles.headerActions}>
              {statusView === "active" && (
                <View style={[styles.viewToggle, { backgroundColor: theme.card, borderColor: theme.line }]}>
                  <Pressable onPress={() => setView("list")} style={[styles.toggleBtn, view === "list" && { backgroundColor: theme.accentDark }]}>
                    <List size={13} color={view === "list" ? "#fff" : theme.textMuted} />
                  </Pressable>
                  <Pressable onPress={() => setView("week")} style={[styles.toggleBtn, view === "week" && { backgroundColor: theme.accentDark }]}>
                    <CalendarDays size={13} color={view === "week" ? "#fff" : theme.textMuted} />
                  </Pressable>
                </View>
              )}
              <Pressable onPress={startAdd} style={[styles.roundBtn, { backgroundColor: theme.accentDark }]} accessibilityLabel={showForm ? "Close form" : "Add task"}>
                {showForm ? <X size={16} color="#fff" /> : <Plus size={16} color="#fff" />}
              </Pressable>
            </View>
          </View>

          <View style={styles.chipRow}>
            <Chip label="Active" active={statusView === "active"} onPress={() => setStatusView("active")} small />
            <Chip label={`Finished (${todos.filter((t) => t.completed).length})`} active={statusView === "done"} onPress={() => setStatusView("done")} small />
          </View>

          {schoolConflicts.length > 0 && statusView === "active" && (
            <View style={[styles.warnBanner, { backgroundColor: ACCENT.ember + "20" }]}>
              <AlertTriangle size={14} color={ACCENT.ember} style={{ marginTop: 2 }} />
              <Text style={[styles.warnText, { color: ACCENT.ember }]}>
                You have multiple School tasks due on {schoolConflicts.map(fmtDay).join(", ")}. Consider spacing them out.
              </Text>
            </View>
          )}

          {statusView === "active" && view === "week" && (
            <View style={[styles.weekCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
              <View style={styles.weekNav}>
                <Pressable onPress={() => setWeekAnchor((d) => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; })} accessibilityLabel="Previous week"><ChevronLeft size={15} color={theme.textMuted} /></Pressable>
                <Text style={[styles.weekLabel, { color: theme.textMuted }]}>{fmtDay(weekDates[0])} - {fmtDay(weekDates[6])}</Text>
                <Pressable onPress={() => setWeekAnchor((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; })} accessibilityLabel="Next week"><ChevronRight size={15} color={theme.textMuted} /></Pressable>
              </View>
              <View style={styles.weekDays}>
                {weekDates.map((d) => {
                  const count = todos.filter((t) => t.dueDate === d && !t.completed).length;
                  const isToday = d === todayISO();
                  const isSel = d === selectedDay;
                  return (
                    <Pressable key={d} onPress={() => setSelectedDay(isSel ? null : d)} style={[styles.dayBtn, isSel && { backgroundColor: theme.accentDark }]}>
                      <Text style={[styles.dayName, { color: isSel ? "#ffffff99" : theme.textMuted }]}>
                        {new Date(d + "T00:00:00").toLocaleDateString("en-PH", { weekday: "narrow" })}
                      </Text>
                      <Text style={[styles.dayNum, { color: isSel ? "#fff" : isToday ? ACCENT.gold : theme.text }]}>{Number(d.slice(8, 10))}</Text>
                      {count > 0 && <View style={[styles.dot, { backgroundColor: isSel ? ACCENT.gold : ACCENT.leaf }]} />}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            <Chip label="All" active={filter === "all"} onPress={() => setFilter("all")} />
            {CATEGORIES.map((c) => <Chip key={c.id} label={c.label} color={c.color} active={filter === c.id} onPress={() => setFilter(c.id)} />)}
          </ScrollView>

          {statusView === "active" && Platform.OS === "android" && (
            <Pressable onPress={() => Linking.openSettings()} style={[styles.miuiHint, { backgroundColor: theme.card, borderColor: theme.line }]}>
              <Settings size={13} color={theme.textMuted} />
              <Text style={[styles.miuiHintText, { color: theme.textMuted }]}>
                Reminders not going off? MIUI (Redmi/Xiaomi) kills background apps by default -- tap here, then allow Autostart and set Battery saver to "No restrictions" for LAYP.
              </Text>
            </Pressable>
          )}

          {showForm && (
            <TodoForm
              initial={editingTodo}
              presetSubjectId={editingTodo ? null : pendingSubjectId}
              subjects={subjects}
              onSave={saveTodo}
              onCancel={() => { setShowForm(false); setEditingId(null); setPendingSubjectId(null); }}
            />
          )}
        </>
      }
    />
  );
}

// Extracted and memoized so editing the form, switching tabs, or toggling
// one row doesn't force every other row to re-render -- matters more on
// lower-RAM devices (e.g. Redmi 10, 4GB variant) where re-render churn is
// more visible as scroll jank.
const TodoRow = React.memo(function TodoRow({ t, subject, isExpanded, onToggle, onEdit, onRemove, onExpand, onToggleSubtask }) {
  const { theme } = useTheme();
  const cat = CATEGORIES.find((c) => c.id === t.category);
  const dleft = t.dueDate ? daysUntil(t.dueDate) : null;
  // Any category, past its due date and not yet checked off: full red
  // highlight, persists until completed.
  const isOverdue = !t.completed && dleft !== null && dleft < 0;
  // School-specific early warning, kept from before: flag it red a couple
  // days ahead of the actual due date, not just once it's overdue.
  const isUrgentSchool = t.category === "school" && !t.completed && dleft !== null && dleft <= 2 && dleft >= 0;
  const flagged = isOverdue || isUrgentSchool;
  const subtasks = t.subtasks || [];
  const subDone = subtasks.filter((s) => s.done).length;

  return (
    <View style={[
      styles.row,
      {
        backgroundColor: isOverdue ? ACCENT.ember + "14" : theme.card,
        borderColor: flagged ? ACCENT.ember : theme.line,
        borderWidth: flagged ? 1.5 : 1,
        opacity: t.completed ? 0.6 : 1,
      },
    ]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable onPress={() => onToggle(t.id)}>
          {t.completed ? <CheckCircle2 size={20} color={ACCENT.leaf} /> : <Circle size={20} color={theme.textMuted} />}
        </Pressable>
        <Pressable style={{ flex: 1 }} onPress={() => !t.completed && onEdit(t)}>
          <Text style={[styles.rowTitle, { color: isOverdue ? ACCENT.ember : theme.text, textDecorationLine: t.completed ? "line-through" : "none" }]}>{t.title}</Text>
          <View style={styles.rowMeta}>
            <View style={[styles.tag, { backgroundColor: cat?.color + "22" }]}>
              <Text style={[styles.tagText, { color: cat?.color }]}>{cat?.label}</Text>
            </View>
            {subject && (
              <Text style={[styles.metaText, { color: theme.textMuted }]} numberOfLines={1}>{subject.code} · {subject.description}</Text>
            )}
            {t.dueDate ? (
              <Text style={[styles.metaText, { color: flagged || dleft < 0 ? ACCENT.ember : theme.textMuted }]}>
                {dleft === 0 ? "Due today" : dleft < 0 ? `${Math.abs(dleft)}d overdue` : `in ${dleft}d`}
              </Text>
            ) : (
              <Text style={[styles.metaText, { color: theme.textMuted }]}>No due date</Text>
            )}
            {t.reminderEnabled !== false && (
              <Bell size={10} color={theme.textMuted} />
            )}
            {subtasks.length > 0 && (
              <Pressable onPress={() => onExpand(isExpanded ? null : t.id)} style={{ flexDirection: "row", alignItems: "center", gap: 2 }} accessibilityLabel={isExpanded ? "Collapse subtasks" : "Expand subtasks"}>
                <Text style={{ fontSize: 9, fontWeight: "600", color: theme.textMuted }}>{subDone}/{subtasks.length}</Text>
                {isExpanded ? <ChevronUp size={10} color={theme.textMuted} /> : <ChevronDown size={10} color={theme.textMuted} />}
              </Pressable>
            )}
          </View>
        </Pressable>
        {!t.completed && <Pressable onPress={() => onEdit(t)} style={{ marginRight: 4 }} accessibilityLabel="Edit task"><Pencil size={14} color={theme.textMuted} /></Pressable>}
        <Pressable onPress={() => onRemove(t.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Delete task"><Trash2 size={15} color={theme.textMuted} /></Pressable>
      </View>
      {isExpanded && subtasks.length > 0 && (
        <View style={{ marginTop: 8, paddingLeft: 30, gap: 6 }}>
          {subtasks.map((s) => (
            <Pressable key={s.id} onPress={() => onToggleSubtask(t.id, s.id)} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {s.done ? <CheckCircle2 size={14} color={ACCENT.leaf} /> : <Circle size={14} color={theme.textMuted} />}
              <Text style={{ fontSize: 11, color: theme.text, textDecorationLine: s.done ? "line-through" : "none" }}>{s.title}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
});

function TodoForm({ initial, onSave, onCancel, subjects = [], presetSubjectId = null }) {
  const { theme } = useTheme();
  const [title, setTitle] = useState(initial?.title || "");
  const [category, setCategory] = useState(initial?.category || "school");
  const [subjectId, setSubjectId] = useState(initial?.subjectId || presetSubjectId || null);
  const [hasDueDate, setHasDueDate] = useState(initial ? !!initial.dueDate : true);
  const [dueDate, setDueDate] = useState(initial?.dueDate || todayISO());
  const [reminderEnabled, setReminderEnabled] = useState(initial?.reminderEnabled !== false);
  const [notify, setNotify] = useState(initial?.notify || { type: "daily", time: "08:00" });
  const [subtasks, setSubtasks] = useState(initial?.subtasks || []);
  const [subDraft, setSubDraft] = useState("");

  function toggleHasDueDate() {
    setHasDueDate((on) => {
      const next = !on;
      // "Once" only makes sense with a specific date to fire on -- if
      // due date gets turned off while it's selected, fall back to Daily
      // so the reminder keeps working instead of silently doing nothing.
      if (!next && notify.type === "once") setNotify((n) => ({ ...n, type: "daily" }));
      return next;
    });
  }

  function addSubtask() {
    if (!subDraft.trim()) return;
    setSubtasks((prev) => [...prev, { id: uid(), title: subDraft.trim(), done: false }]);
    setSubDraft("");
  }
  function removeSubtask(id) { setSubtasks((prev) => prev.filter((s) => s.id !== id)); }
  const canSave = title.trim().length > 0;

  return (
    <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
      <TextInput value={title} onChangeText={setTitle} placeholder="What do you need to do?" placeholderTextColor={theme.textMuted} style={[styles.input, { color: theme.text }]} />
      <View style={styles.chipWrap}>
        {CATEGORIES.map((c) => <Chip key={c.id} label={c.label} color={c.color} active={category === c.id} onPress={() => { setCategory(c.id); if (c.id !== "school") setSubjectId(null); }} small />)}
      </View>

      {category === "school" && subjects.length > 0 && (
        <View style={{ marginBottom: 12 }}>
          <Text style={[styles.label, { color: theme.textMuted }]}>Subject (optional)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Chip label="None" active={!subjectId} onPress={() => setSubjectId(null)} small />
            {subjects.map((s) => (
              <Chip key={s.id} label={s.code} active={subjectId === s.id} onPress={() => setSubjectId(s.id)} small />
            ))}
          </ScrollView>
        </View>
      )}

      <View style={[styles.toggleRow, { borderColor: theme.line }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.toggleLabel, { color: theme.text }]}>Due date</Text>
          <Text style={[styles.toggleSub, { color: theme.textMuted }]}>{hasDueDate ? "Task has a deadline" : "No deadline -- reminder still works"}</Text>
        </View>
        <Switch value={hasDueDate} onValueChange={toggleHasDueDate} trackColor={{ false: theme.line, true: ACCENT.gold }} thumbColor="#fff" />
      </View>
      {hasDueDate && <View style={{ marginBottom: 12 }}><CalendarPicker value={dueDate} onChange={setDueDate} label="Due date" /></View>}

      <View style={[styles.toggleRow, { borderColor: theme.line }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.toggleLabel, { color: theme.text }]}>Reminder</Text>
          <Text style={[styles.toggleSub, { color: theme.textMuted }]}>
            {reminderEnabled
              ? hasDueDate ? "Repeats until the due date, then stops" : "Repeats with no end date"
              : "No reminders for this task"}
          </Text>
        </View>
        <Switch value={reminderEnabled} onValueChange={setReminderEnabled} trackColor={{ false: theme.line, true: ACCENT.leaf }} thumbColor="#fff" />
      </View>
      {reminderEnabled && <NotifyPicker notify={notify} setNotify={setNotify} allowOnce={hasDueDate} />}

      <Text style={[styles.label, { color: theme.textMuted }]}>Subtasks (optional)</Text>
      {subtasks.length > 0 && (
        <View style={{ gap: 6, marginBottom: 8 }}>
          {subtasks.map((s) => (
            <View key={s.id} style={[styles.subtaskRow, { backgroundColor: theme.bg }]}>
              <Text style={{ fontSize: 11, color: theme.text }}>{s.title}</Text>
              <Pressable onPress={() => removeSubtask(s.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Remove subtask"><X size={11} color={theme.textMuted} /></Pressable>
            </View>
          ))}
        </View>
      )}
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        <TextInput value={subDraft} onChangeText={setSubDraft} placeholder="Add a subtask..." placeholderTextColor={theme.textMuted} style={[styles.subtaskInput, { backgroundColor: theme.bg, color: theme.text }]} />
        <Pressable onPress={addSubtask} style={[styles.subtaskAddBtn, { backgroundColor: theme.bg }]}>
          <Text style={{ fontSize: 11, fontWeight: "700", color: theme.text }}>Add</Text>
        </Pressable>
      </View>

      <View style={styles.formActions}>
        {initial && (
          <Pressable onPress={onCancel} style={[styles.formBtn, { backgroundColor: theme.bg }]} accessibilityLabel="Cancel">
            <Text style={[styles.formBtnText, { color: theme.text }]}>Cancel</Text>
          </Pressable>
        )}
        <Pressable disabled={!canSave} onPress={() => canSave && onSave({ title: title.trim(), category, subjectId: category === "school" ? subjectId : null, dueDate: hasDueDate ? dueDate : null, reminderEnabled, notify, subtasks })} style={[styles.formBtn, { backgroundColor: ACCENT.gold, opacity: canSave ? 1 : 0.5 }]}>
          <Text style={[styles.formBtnText, { color: "#fff" }]}>{initial ? "Save changes" : "Add task"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  h1: { fontSize: 20, fontWeight: "700" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  viewToggle: { flexDirection: "row", borderWidth: 1, borderRadius: 999, padding: 2 },
  toggleBtn: { padding: 6, borderRadius: 999 },
  roundBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  chipRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  warnBanner: { flexDirection: "row", gap: 8, borderRadius: 16, padding: 12, marginBottom: 12 },
  warnText: { fontSize: 11, flex: 1 },
  weekCard: { borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 12 },
  weekNav: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  weekLabel: { fontSize: 10, fontWeight: "600" },
  weekDays: { flexDirection: "row", justifyContent: "space-between" },
  dayBtn: { alignItems: "center", width: 36, paddingVertical: 6, borderRadius: 12, gap: 4 },
  dayName: { fontSize: 8, fontWeight: "700", textTransform: "uppercase" },
  dayNum: { fontSize: 12, fontWeight: "700" },
  dot: { width: 4, height: 4, borderRadius: 2 },
  formCard: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 12 },
  input: { fontSize: 13, fontWeight: "500", marginBottom: 12, paddingVertical: 4 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", marginBottom: 12, gap: 6 },
  label: { fontSize: 9, fontWeight: "700", textTransform: "uppercase", marginBottom: 6 },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  toggleLabel: { fontSize: 12, fontWeight: "700" },
  toggleSub: { fontSize: 9, marginTop: 2 },
  subtaskRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  subtaskInput: { flex: 1, fontSize: 11, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10 },
  subtaskAddBtn: { paddingHorizontal: 14, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  formActions: { flexDirection: "row", gap: 8 },
  formBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: "center" },
  formBtnText: { fontSize: 12, fontWeight: "700" },
  row: { borderRadius: 16, padding: 12, marginBottom: 8 },
  rowTitle: { fontSize: 13, fontWeight: "600" },
  rowMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2, flexWrap: "wrap" },
  tag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  tagText: { fontSize: 9, fontWeight: "700" },
  metaText: { fontSize: 10, fontFamily: "monospace" },
  miuiHint: { flexDirection: "row", gap: 8, borderWidth: 1, borderRadius: 14, padding: 10, marginBottom: 12, alignItems: "flex-start" },
  miuiHintText: { fontSize: 10, flex: 1, lineHeight: 14 },
});
