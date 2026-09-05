import React, { useCallback, useMemo, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, FlatList, StyleSheet, Linking, Platform, Switch, Alert, Animated, LayoutAnimation, UIManager } from "react-native";
import {
  CheckCircle2, Circle, Plus, X, Pencil, Trash2, List, LayoutList, LayoutGrid, CalendarDays,
  ChevronLeft, ChevronRight, AlertTriangle, ChevronDown, ChevronUp, Settings, Bell, BellOff, AlarmClock,
} from "lucide-react-native";
import { useTheme, ACCENT, CATEGORIES } from "../theme";
import { uid, todayISO, daysUntil, fmtDay, fmtTime12, getWeekDates, confirmDelete } from "../utils";
import Chip from "../components/Chip";
import EmptyState from "../components/EmptyState";
import CalendarPicker from "../components/CalendarPicker";
import TimePicker from "../components/TimePicker";
import NotifyPicker from "../components/NotifyPicker";
import { rescheduleTodoNotifications, cancelTodoNotifications, rescheduleTodoAlarm, cancelTodoAlarm } from "../notifications";
import { isNativeAlarmAvailable } from "../../modules/layp-alarm";

// Old-architecture Android needs this opt-in for LayoutAnimation to do
// anything at all (New Architecture/Fabric has it on by default, and this
// is a harmless no-op there) -- without it, the "finished" list reshuffling
// itself when a task drops out of Active wouldn't animate, it would just
// jump.
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const LAYOUT_OPTIONS = [
  { id: "list", icon: List, label: "List" },
  { id: "detailed", icon: LayoutList, label: "Detailed" },
  { id: "cards", icon: LayoutGrid, label: "Cards" },
];

function TodoScreen({ todos, setTodos, subjects = [], prefillSubjectId, onConsumePrefillSubject }) {
  const { theme } = useTheme();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState("list");
  const [layout, setLayout] = useState("list");
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
      await rescheduleTodoAlarm(merged);
      setTodos((prevList) => prevList.map((t) => (t.id === editingId ? { ...merged, notificationIds } : t)));
      setEditingId(null);
    } else {
      const draft = { id: uid(), ...data, completed: false };
      const notificationIds = await rescheduleTodoNotifications(draft);
      await rescheduleTodoAlarm(draft);
      setTodos((prev) => [...prev, { ...draft, notificationIds }]);
    }
    setShowForm(false);
    setPendingSubjectId(null);
  }

  // Wrapped in useCallback so their identity stays stable across renders --
  // without this, React.memo on TodoRow (and the row components inside it)
  // is effectively defeated: React.memo does a shallow prop comparison,
  // and a brand-new `onToggle`/`onEdit`/`onRemove` function reference every
  // single render (which plain `function toggle() {}` declarations produce)
  // reads as "props changed" regardless of whether the task data itself
  // did, forcing every row to re-render on every keystroke in the add-task
  // form or any other state change in this screen.
  const toggle = useCallback(async (id) => {
    const t = todos.find((x) => x.id === id);
    if (!t) return;
    const nowCompleted = !t.completed;
    if (nowCompleted) {
      await cancelTodoNotifications(t.notificationIds);
      await cancelTodoAlarm(t.id);
    }
    // Animates the row's departure from (or return to) the currently
    // filtered list -- without this, a task dropping out of Active the
    // instant it's checked off would just jump/pop rather than settle
    // smoothly, since the FlatList has no idea a removal is "expected".
    LayoutAnimation.configureNext(LayoutAnimation.create(250, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
    setTodos((prev) => prev.map((x) => (x.id === id ? { ...x, completed: nowCompleted, completedAt: nowCompleted ? new Date().toISOString() : null } : x)));
  }, [todos, setTodos]);

  const remove = useCallback(async (id) => {
    const t = todos.find((x) => x.id === id);
    confirmDelete(Alert, "Delete this task?", `"${t?.title}" will be removed for good.`, async () => {
      if (t?.notificationIds) await cancelTodoNotifications(t.notificationIds);
      await cancelTodoAlarm(id);
      setTodos((prev) => prev.filter((x) => x.id !== id));
      setEditingId((current) => (current === id ? null : current));
      if (editingId === id) setShowForm(false);
    });
  }, [todos, editingId, setTodos]);

  const startEdit = useCallback((t) => { setEditingId(t.id); setShowForm(true); }, []);
  const startAdd = useCallback(() => { setEditingId(null); setShowForm((s) => !s); }, []);
  const toggleSubtask = useCallback((todoId, subId) => {
    setTodos((prev) => prev.map((t) => t.id === todoId ? { ...t, subtasks: (t.subtasks || []).map((s) => s.id === subId ? { ...s, done: !s.done } : s) } : t));
  }, [setTodos]);

  const editingTodo = editingId ? todos.find((t) => t.id === editingId) : null;

  // Cheap O(1) lookup instead of `.find()` inside every row's render --
  // small win on its own, but multiplied across every visible row on every
  // render it adds up for a screen with more than a handful of subjects.
  const subjectsById = useMemo(() => {
    const map = {};
    for (const s of subjects) map[s.id] = s;
    return map;
  }, [subjects]);

  const renderItem = useCallback(({ item: t }) => (
    <TodoRow
      t={t}
      layout={layout}
      subject={t.subjectId ? subjectsById[t.subjectId] : null}
      isExpanded={expandedId === t.id}
      onToggle={toggle}
      onEdit={startEdit}
      onRemove={remove}
      onExpand={setExpandedId}
      onToggleSubtask={toggleSubtask}
    />
  ), [layout, subjectsById, expandedId, toggle, startEdit, remove, toggleSubtask]);

  return (
    <FlatList
      // FlatList can't change numColumns on the fly -- it has to be told
      // via a fresh `key` so it fully re-lays-out instead of silently
      // ignoring the change (a documented RN limitation, not a bug here).
      key={layout}
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 12 }}
      data={filtered}
      keyExtractor={(t) => t.id}
      numColumns={layout === "cards" ? 2 : 1}
      columnWrapperStyle={layout === "cards" ? { gap: 10 } : undefined}
      renderItem={renderItem}
      // Keeps memory/CPU bounded on long task lists by only mounting cells
      // near the viewport instead of the whole list at once.
      initialNumToRender={12}
      maxToRenderPerBatch={10}
      windowSize={7}
      removeClippedSubviews={Platform.OS === "android"}
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

          <View style={[styles.layoutToggle, { backgroundColor: theme.card, borderColor: theme.line }]}>
            {LAYOUT_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = layout === opt.id;
              return (
                <Pressable key={opt.id} onPress={() => setLayout(opt.id)} style={[styles.layoutBtn, active && { backgroundColor: theme.accentDark }]} accessibilityLabel={`${opt.label} view`}>
                  <Icon size={13} color={active ? "#fff" : theme.textMuted} />
                  <Text style={[styles.layoutBtnText, { color: active ? "#fff" : theme.textMuted }]}>{opt.label}</Text>
                </Pressable>
              );
            })}
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
//
// A shared hook for all three layouts below: handles the "just checked
// off" moment locally (a quick checkmark pop + strikethrough) before
// actually committing the change, so there's a satisfying beat before the
// task leaves the Active list, instead of it just vanishing the instant
// you tap it. Un-completing (from the Finished list) skips the ceremony
// and commits immediately -- there's nothing to celebrate about undoing.
function useTaskCompletion(t, onToggle) {
  const [optimisticDone, setOptimisticDone] = useState(false);
  const popScale = useRef(new Animated.Value(1)).current;
  const completingRef = useRef(false);
  const timeoutRef = useRef(null);

  React.useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  function handleToggle() {
    if (completingRef.current) return;
    if (t.completed) { onToggle(t.id); return; }
    completingRef.current = true;
    setOptimisticDone(true);
    Animated.sequence([
      Animated.spring(popScale, { toValue: 1.4, useNativeDriver: true, friction: 4, tension: 220 }),
      Animated.spring(popScale, { toValue: 1, useNativeDriver: true, friction: 5, tension: 220 }),
    ]).start();
    timeoutRef.current = setTimeout(() => {
      onToggle(t.id);
      completingRef.current = false;
      setOptimisticDone(false);
    }, 420);
  }

  return { displayCompleted: t.completed || optimisticDone, popScale, handleToggle };
}

const TodoRow = React.memo(function TodoRow({ t, layout, subject, isExpanded, onToggle, onEdit, onRemove, onExpand, onToggleSubtask }) {
  if (layout === "cards") return <TodoCard t={t} subject={subject} onToggle={onToggle} onEdit={onEdit} onRemove={onRemove} />;
  if (layout === "detailed") return <TodoRowDetailed t={t} subject={subject} onToggle={onToggle} onEdit={onEdit} onRemove={onRemove} onToggleSubtask={onToggleSubtask} />;
  return <TodoRowList t={t} subject={subject} isExpanded={isExpanded} onToggle={onToggle} onEdit={onEdit} onRemove={onRemove} onExpand={onExpand} onToggleSubtask={onToggleSubtask} />;
});

// --- List layout: the original compact row, collapsible subtasks ---
function TodoRowList({ t, subject, isExpanded, onToggle, onEdit, onRemove, onExpand, onToggleSubtask }) {
  const { theme } = useTheme();
  const cat = CATEGORIES.find((c) => c.id === t.category);
  const dleft = t.dueDate ? daysUntil(t.dueDate) : null;
  const { displayCompleted, popScale, handleToggle } = useTaskCompletion(t, onToggle);
  const isOverdue = !displayCompleted && dleft !== null && dleft < 0;
  const isUrgentSchool = t.category === "school" && !displayCompleted && dleft !== null && dleft <= 2 && dleft >= 0;
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
        opacity: displayCompleted ? 0.6 : 1,
      },
    ]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable onPress={handleToggle}>
          <Animated.View style={{ transform: [{ scale: popScale }] }}>
            {displayCompleted ? <CheckCircle2 size={20} color={ACCENT.leaf} /> : <Circle size={20} color={theme.textMuted} />}
          </Animated.View>
        </Pressable>
        <Pressable style={{ flex: 1 }} onPress={() => !displayCompleted && onEdit(t)}>
          <Text style={[styles.rowTitle, { color: isOverdue ? ACCENT.ember : theme.text, textDecorationLine: displayCompleted ? "line-through" : "none" }]}>{t.title}</Text>
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
                {t.dueTime ? ` · ${fmtTime12(t.dueTime)}` : ""}
              </Text>
            ) : (
              <Text style={[styles.metaText, { color: theme.textMuted }]}>No due date</Text>
            )}
            {t.reminderEnabled !== false && (
              <Bell size={10} color={theme.textMuted} />
            )}
            {t.alarmEnabled && t.dueTime && (
              <AlarmClock size={10} color={ACCENT.rust || ACCENT.gold} />
            )}
            {subtasks.length > 0 && (
              <Pressable onPress={() => onExpand(isExpanded ? null : t.id)} style={{ flexDirection: "row", alignItems: "center", gap: 2 }} accessibilityLabel={isExpanded ? "Collapse subtasks" : "Expand subtasks"}>
                <Text style={{ fontSize: 9, fontWeight: "600", color: theme.textMuted }}>{subDone}/{subtasks.length}</Text>
                {isExpanded ? <ChevronUp size={10} color={theme.textMuted} /> : <ChevronDown size={10} color={theme.textMuted} />}
              </Pressable>
            )}
          </View>
        </Pressable>
        {!displayCompleted && <Pressable onPress={() => onEdit(t)} style={{ marginRight: 4 }} accessibilityLabel="Edit task"><Pencil size={14} color={theme.textMuted} /></Pressable>}
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
}

// --- Detailed layout: everything visible up front, no expand needed ---
function TodoRowDetailed({ t, subject, onToggle, onEdit, onRemove, onToggleSubtask }) {
  const { theme } = useTheme();
  const cat = CATEGORIES.find((c) => c.id === t.category);
  const dleft = t.dueDate ? daysUntil(t.dueDate) : null;
  const { displayCompleted, popScale, handleToggle } = useTaskCompletion(t, onToggle);
  const isOverdue = !displayCompleted && dleft !== null && dleft < 0;
  const isUrgentSchool = t.category === "school" && !displayCompleted && dleft !== null && dleft <= 2 && dleft >= 0;
  const flagged = isOverdue || isUrgentSchool;
  const subtasks = t.subtasks || [];
  const subDone = subtasks.filter((s) => s.done).length;

  return (
    <View style={[
      styles.detailedRow,
      {
        backgroundColor: isOverdue ? ACCENT.ember + "14" : theme.card,
        borderColor: flagged ? ACCENT.ember : theme.line,
        borderWidth: flagged ? 1.5 : 1,
        opacity: displayCompleted ? 0.6 : 1,
      },
    ]}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <Pressable onPress={handleToggle} style={{ marginTop: 2 }}>
          <Animated.View style={{ transform: [{ scale: popScale }] }}>
            {displayCompleted ? <CheckCircle2 size={22} color={ACCENT.leaf} /> : <Circle size={22} color={theme.textMuted} />}
          </Animated.View>
        </Pressable>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={[styles.rowTitle, { fontSize: 15, color: isOverdue ? ACCENT.ember : theme.text, textDecorationLine: displayCompleted ? "line-through" : "none", flex: 1 }]}>{t.title}</Text>
            <View style={{ flexDirection: "row", gap: 10, marginLeft: 8 }}>
              {!displayCompleted && <Pressable onPress={() => onEdit(t)} accessibilityLabel="Edit task"><Pencil size={14} color={theme.textMuted} /></Pressable>}
              <Pressable onPress={() => onRemove(t.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Delete task"><Trash2 size={15} color={theme.textMuted} /></Pressable>
            </View>
          </View>

          <View style={[styles.detailedMetaRow]}>
            <View style={[styles.tag, { backgroundColor: cat?.color + "22" }]}>
              <Text style={[styles.tagText, { color: cat?.color }]}>{cat?.label}</Text>
            </View>
            {t.reminderEnabled !== false ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <Bell size={10} color={theme.textMuted} />
                <Text style={[styles.metaText, { color: theme.textMuted }]}>Reminder on</Text>
              </View>
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <BellOff size={10} color={theme.textMuted} />
                <Text style={[styles.metaText, { color: theme.textMuted }]}>No reminder</Text>
              </View>
            )}
            {t.alarmEnabled && t.dueTime && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <AlarmClock size={10} color={ACCENT.rust || ACCENT.gold} />
                <Text style={[styles.metaText, { color: ACCENT.rust || ACCENT.gold }]}>Alarm set</Text>
              </View>
            )}
          </View>

          {subject && (
            <Text style={[styles.metaText, { color: theme.textMuted, marginTop: 4 }]}>{subject.code} · {subject.description}</Text>
          )}

          <Text style={[styles.metaText, { color: flagged ? ACCENT.ember : theme.textMuted, marginTop: 4, fontWeight: "700" }]}>
            {t.dueDate
              ? `Due ${fmtDay(t.dueDate)}${t.dueTime ? ` · ${fmtTime12(t.dueTime)}` : ""} · ${dleft === 0 ? "today" : dleft < 0 ? `${Math.abs(dleft)}d overdue` : `in ${dleft}d`}`
              : "No due date"}
          </Text>

          {subtasks.length > 0 && (
            <View style={{ marginTop: 10, gap: 6 }}>
              <View style={[styles.subProgressTrack, { backgroundColor: theme.bg }]}>
                <View style={[styles.subProgressFill, { width: `${(subDone / subtasks.length) * 100}%`, backgroundColor: ACCENT.leaf }]} />
              </View>
              {subtasks.map((s) => (
                <Pressable key={s.id} onPress={() => onToggleSubtask(t.id, s.id)} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  {s.done ? <CheckCircle2 size={14} color={ACCENT.leaf} /> : <Circle size={14} color={theme.textMuted} />}
                  <Text style={{ fontSize: 11.5, color: theme.text, textDecorationLine: s.done ? "line-through" : "none" }}>{s.title}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

// --- Card layout: a two-column grid, compact visual scanning ---
function TodoCard({ t, subject, onToggle, onEdit, onRemove }) {
  const { theme } = useTheme();
  const cat = CATEGORIES.find((c) => c.id === t.category);
  const dleft = t.dueDate ? daysUntil(t.dueDate) : null;
  const { displayCompleted, popScale, handleToggle } = useTaskCompletion(t, onToggle);
  const isOverdue = !displayCompleted && dleft !== null && dleft < 0;
  const isUrgentSchool = t.category === "school" && !displayCompleted && dleft !== null && dleft <= 2 && dleft >= 0;
  const flagged = isOverdue || isUrgentSchool;

  return (
    <Pressable
      onPress={() => !displayCompleted && onEdit(t)}
      onLongPress={() => onRemove(t.id)}
      style={[
        styles.card,
        {
          backgroundColor: isOverdue ? ACCENT.ember + "14" : theme.card,
          borderColor: flagged ? ACCENT.ember : theme.line,
          borderWidth: flagged ? 1.5 : 1,
          opacity: displayCompleted ? 0.6 : 1,
        },
      ]}
    >
      <View style={[styles.cardAccent, { backgroundColor: cat?.color || theme.line }]} />
      <View style={styles.cardTopRow}>
        <View style={[styles.tag, { backgroundColor: cat?.color + "22" }]}>
          <Text style={[styles.tagText, { color: cat?.color }]}>{cat?.label}</Text>
        </View>
        <Pressable onPress={handleToggle} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Animated.View style={{ transform: [{ scale: popScale }] }}>
            {displayCompleted ? <CheckCircle2 size={18} color={ACCENT.leaf} /> : <Circle size={18} color={theme.textMuted} />}
          </Animated.View>
        </Pressable>
      </View>
      <Text numberOfLines={3} style={[styles.cardTitle, { color: isOverdue ? ACCENT.ember : theme.text, textDecorationLine: displayCompleted ? "line-through" : "none" }]}>
        {t.title}
      </Text>
      {subject && <Text numberOfLines={1} style={[styles.metaText, { color: theme.textMuted, marginTop: 4 }]}>{subject.code}</Text>}
      <Text style={[styles.metaText, { color: flagged ? ACCENT.ember : theme.textMuted, marginTop: "auto", paddingTop: 8 }]}>
        {t.dueDate ? (dleft === 0 ? "Due today" : dleft < 0 ? `${Math.abs(dleft)}d overdue` : `in ${dleft}d`) : "No due date"}
      </Text>
    </Pressable>
  );
}


function TodoForm({ initial, onSave, onCancel, subjects = [], presetSubjectId = null }) {
  const { theme } = useTheme();
  const [title, setTitle] = useState(initial?.title || "");
  const [category, setCategory] = useState(initial?.category || "school");
  const [subjectId, setSubjectId] = useState(initial?.subjectId || presetSubjectId || null);
  const [hasDueDate, setHasDueDate] = useState(initial ? !!initial.dueDate : true);
  const [dueDate, setDueDate] = useState(initial?.dueDate || todayISO());
  const [hasDueTime, setHasDueTime] = useState(!!initial?.dueTime);
  const [dueTime, setDueTime] = useState(initial?.dueTime || "08:00");
  const [alarmEnabled, setAlarmEnabled] = useState(initial?.alarmEnabled === true);
  const [reminderEnabled, setReminderEnabled] = useState(initial?.reminderEnabled !== false);
  const [notify, setNotify] = useState(initial?.notify || { type: "daily", time: "08:00" });
  const [subtasks, setSubtasks] = useState(initial?.subtasks || []);
  const [subDraft, setSubDraft] = useState("");
  const alarmReady = isNativeAlarmAvailable();

  function toggleHasDueDate() {
    setHasDueDate((on) => {
      const next = !on;
      // "Once" only makes sense with a specific date to fire on -- if
      // due date gets turned off while it's selected, fall back to Daily
      // so the reminder keeps working instead of silently doing nothing.
      if (!next && notify.type === "once") setNotify((n) => ({ ...n, type: "daily" }));
      // A due time (and the alarm that depends on it) only makes sense
      // alongside a due date.
      if (!next) {
        setHasDueTime(false);
        setAlarmEnabled(false);
      }
      return next;
    });
  }

  function toggleHasDueTime() {
    setHasDueTime((on) => {
      const next = !on;
      if (!next) setAlarmEnabled(false);
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
      {hasDueDate && (
        <View style={{ marginBottom: 12 }}>
          <CalendarPicker value={dueDate} onChange={setDueDate} label="Due date" />
        </View>
      )}

      {hasDueDate && (
        <View style={[styles.toggleRow, { borderColor: theme.line }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.toggleLabel, { color: theme.text }]}>Time</Text>
            <Text style={[styles.toggleSub, { color: theme.textMuted }]}>{hasDueTime ? "Due at a specific time" : "Due sometime that day"}</Text>
          </View>
          <Switch value={hasDueTime} onValueChange={toggleHasDueTime} trackColor={{ false: theme.line, true: ACCENT.gold }} thumbColor="#fff" />
        </View>
      )}
      {hasDueDate && hasDueTime && <View style={{ marginBottom: 12 }}><TimePicker value={dueTime} onChange={setDueTime} label="Due time" /></View>}

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

      <View style={[styles.toggleRow, { borderColor: theme.line }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.toggleLabel, { color: theme.text }]}>Alarm</Text>
          <Text style={[styles.toggleSub, { color: theme.textMuted }]}>
            {!hasDueDate || !hasDueTime
              ? "Set a due date and time to enable a real ringing alarm"
              : !alarmReady
                ? "Rings like an alarm clock at the due time -- needs the LAYP Android build"
                : "Rings like an alarm clock at the due time, even if LAYP is closed"}
          </Text>
        </View>
        <Switch
          value={alarmEnabled}
          onValueChange={setAlarmEnabled}
          disabled={!hasDueDate || !hasDueTime}
          trackColor={{ false: theme.line, true: ACCENT.rust || ACCENT.gold }}
          thumbColor="#fff"
        />
      </View>

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
        <Pressable disabled={!canSave} onPress={() => canSave && onSave({ title: title.trim(), category, subjectId: category === "school" ? subjectId : null, dueDate: hasDueDate ? dueDate : null, dueTime: hasDueDate && hasDueTime ? dueTime : null, alarmEnabled: hasDueDate && hasDueTime ? alarmEnabled : false, reminderEnabled, notify, subtasks })} style={[styles.formBtn, { backgroundColor: ACCENT.gold, opacity: canSave ? 1 : 0.5 }]}>
          <Text style={[styles.formBtnText, { color: "#fff" }]}>{initial ? "Save changes" : "Add task"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layoutToggle: { flexDirection: "row", borderWidth: 1, borderRadius: 12, padding: 3, marginBottom: 12, gap: 3 },
  layoutBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 7, borderRadius: 9 },
  layoutBtnText: { fontSize: 10.5, fontWeight: "700" },
  detailedRow: { borderRadius: 16, padding: 14, marginBottom: 10 },
  detailedMetaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6, flexWrap: "wrap" },
  subProgressTrack: { height: 4, borderRadius: 2, overflow: "hidden" },
  subProgressFill: { height: 4, borderRadius: 2 },
  card: { flex: 1, borderRadius: 16, padding: 12, marginBottom: 10, minHeight: 118, overflow: "hidden" },
  cardAccent: { position: "absolute", top: 0, left: 0, right: 0, height: 3 },
  cardTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4, marginBottom: 8 },
  cardTitle: { fontSize: 12.5, fontWeight: "700", lineHeight: 16 },
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

// Memoized: these screens now stay permanently mounted (see App.js) so
// switching tabs is instant, which means without this, any state change
// anywhere in the app -- not just on this screen -- would re-render and
// recompute this one too, even while it's hidden behind another tab.
export default React.memo(TodoScreen);
