import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, FlatList, StyleSheet, Platform, Switch, LayoutAnimation, UIManager } from "react-native";
import {
  CheckCircle2, Circle, Plus, X, Trash2, List, CalendarDays, ListTodo,
  ChevronLeft, ChevronRight, ChevronDown, AlertTriangle, Bell, BellOff, AlarmClock,
} from "lucide-react-native";
import { useTheme, ACCENT, CATEGORIES } from "../theme";
import { uid, todayISO, daysUntil, fmtDay, fmtTime12, getWeekDates } from "../utils";
import Chip from "../components/Chip";
import SegmentedTabs from "../components/SegmentedTabs";
import EmptyState from "../components/EmptyState";
import CalendarPicker from "../components/CalendarPicker";
import TimePicker from "../components/TimePicker";
import NotifyPicker from "../components/NotifyPicker";
import { rescheduleTodoNotifications, cancelTodoNotifications, rescheduleTodoAlarm, cancelTodoAlarm } from "../notifications";
import { hapticSuccess } from "../haptics";
import { confirmDelete } from "../components/ConfirmModal";
import { isNativeAlarmAvailable } from "../../modules/layp-alarm";
import EditSheet from "../components/EditSheet";
import { DURATION, SPRING, useCardPressAnimation } from "../animation";
import Reanimated, { FadeIn, FadeOut, Layout as ReanimatedLayout, useSharedValue, useAnimatedStyle, withSpring, withSequence, withTiming, withRepeat, interpolateColor } from "react-native-reanimated";

// A task's work status now doubles as the checkbox's progression: tapping
// the circle steps a task forward through these stages in order, and the
// final tap marks it completed (which is still tracked separately via
// `completed`/`completedAt`, same as before -- status only covers the
// active stages). New tasks always start at "Not starting yet"; the person
// only ever moves it forward themselves, one tap at a time.
const STATUS_OPTIONS = [
  { id: "not_started", label: "Not starting yet", color: "#9AA0A6", progress: 0 },
  { id: "wip", label: "Work in progress", color: ACCENT.sky, progress: 0.34 },
  { id: "to_pass", label: "To pass", color: ACCENT.leaf, progress: 0.67 },
];
const STATUS_ORDER = STATUS_OPTIONS.map((s) => s.id);

// "To pass" is the last active stage before a task is actually marked
// complete, so it always reads as green ("on track to finish") -- this
// used to only switch to green once the due date had already arrived,
// which meant a task with no due date at all could never reach the green
// case and looked permanently stuck on its (unrelated) urgent color.
function statusColor(status) {
  const opt = STATUS_OPTIONS.find((s) => s.id === status) || STATUS_OPTIONS[0];
  return opt.color;
}

// Due-date urgency, as a single tier per task:
//  - "red": overdue, due today, or due tomorrow -- glowing + blinking red border
//  - "yellow": due in 2 days ("less than 3 days out") -- glowing + blinking gold border
//  - "green": finished, or in the last active stage ("To pass") -- solid green border, no glow/blink
//  - "none": everything else (far off, or no due date) -- no border at all
// Red/yellow take priority over green when both would apply (an
// almost-due task stays urgent-colored even if it's also marked "To
// pass"), since the due date is the more actionable signal.
function urgencyTier(t, displayCompleted, dleft) {
  if (!displayCompleted && dleft !== null && dleft <= 1) return "red";
  if (!displayCompleted && dleft !== null && dleft === 2) return "yellow";
  if (displayCompleted || t.status === "to_pass") return "green";
  return "none";
}

// Drives the border color/width and a soft shadow "glow" for the
// red/yellow urgency tiers, pulsing back and forth forever while that
// tier is active. Reanimated animates plain color strings directly (no
// interpolateColor needed for a two-color loop), so this just toggles a
// shared value between 0 and 1 and derives everything else from it.
function useUrgencyStyle(tier) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (tier === "red" || tier === "yellow") {
      pulse.value = withRepeat(withSequence(withTiming(1, { duration: 650 }), withTiming(0, { duration: 650 })), -1, true);
    } else {
      pulse.value = withTiming(0, { duration: 200 });
    }
  }, [tier]);

  return useAnimatedStyle(() => {
    if (tier === "red") {
      return {
        borderWidth: 1.5,
        borderColor: interpolateColor(pulse.value, [0, 1], [ACCENT.ember + "66", ACCENT.ember]),
        shadowColor: ACCENT.ember,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.15 + pulse.value * 0.35,
        shadowRadius: 5 + pulse.value * 4,
        elevation: 2,
      };
    }
    if (tier === "yellow") {
      return {
        borderWidth: 1.5,
        borderColor: interpolateColor(pulse.value, [0, 1], [ACCENT.gold + "55", ACCENT.gold]),
        shadowColor: ACCENT.gold,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.1 + pulse.value * 0.25,
        shadowRadius: 3 + pulse.value * 3,
        elevation: 1,
      };
    }
    if (tier === "green") {
      return { borderWidth: 1.5, borderColor: ACCENT.leaf };
    }
    return { borderWidth: 0, borderColor: "transparent" };
  });
}
function statusProgress(t) {
  if (t.completed) return 1;
  const opt = STATUS_OPTIONS.find((s) => s.id === t.status) || STATUS_OPTIONS[0];
  return opt.progress;
}

// Old-architecture Android needs this opt-in for LayoutAnimation to do
// anything at all (New Architecture/Fabric has it on by default, and this
// is a harmless no-op there) -- without it, the "finished" list reshuffling
// itself when a task drops out of Active wouldn't animate, it would just
// jump.
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function TodoScreen({ todos, setTodos, subjects = [], prefillSubjectId, onConsumePrefillSubject }) {
  const { theme } = useTheme();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState("list");
  const [statusView, setStatusView] = useState("all");
  const [weekAnchor, setWeekAnchor] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(null);
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
    let list = todos.filter((t) => (statusView === "done" ? t.completed : !t.completed));
    if (statusView === "upcoming" || statusView === "overdue") {
      list = list.filter((t) => {
        const dleft = t.dueDate ? daysUntil(t.dueDate) : null;
        const isOverdue = dleft !== null && dleft < 0;
        return statusView === "overdue" ? isOverdue : !isOverdue;
      });
    }
    list = list.filter((t) => filter === "all" || t.category === filter);
    if (statusView !== "done" && view === "week") {
      list = list.filter((t) => weekDates.includes(t.dueDate));
      if (selectedDay) list = list.filter((t) => t.dueDate === selectedDay);
    }
    if (statusView !== "done") return [...list].sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
    return [...list].sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));
  }, [todos, filter, view, weekDates, selectedDay, statusView]);

  async function saveTodo(data) {
    const linkedSubject = data.category === "school" && data.subjectId
      ? subjects.find((s) => s.id === data.subjectId)
      : null;
    if (editingId) {
      const prev = todos.find((t) => t.id === editingId);
      const merged = { ...prev, ...data };
      const notificationIds = await rescheduleTodoNotifications(merged, linkedSubject);
      await rescheduleTodoAlarm(merged, linkedSubject);
      setTodos((prevList) => prevList.map((t) => (t.id === editingId ? { ...merged, notificationIds } : t)));
      setEditingId(null);
    } else {
      const draft = { id: uid(), ...data, completed: false };
      const notificationIds = await rescheduleTodoNotifications(draft, linkedSubject);
      await rescheduleTodoAlarm(draft, linkedSubject);
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
    if (t.completed) {
      // Reopening a finished task -- just un-complete it and leave status
      // as-is (it'll almost always be "to_pass", the stage right before
      // completion), no ceremony needed for undoing.
      setTodos((prev) => prev.map((x) => (x.id === id ? { ...x, completed: false, completedAt: null } : x)));
      return;
    }
    const rawIndex = STATUS_ORDER.indexOf(t.status);
    const stageIndex = rawIndex === -1 ? 0 : rawIndex;
    const isFinalStage = stageIndex === STATUS_ORDER.length - 1;
    if (!isFinalStage) {
      // Just bumping the status forward -- task stays right where it is
      // in the Active list.
      setTodos((prev) => prev.map((x) => (x.id === id ? { ...x, status: STATUS_ORDER[stageIndex + 1] } : x)));
      return;
    }
    await cancelTodoNotifications(t.notificationIds);
    await cancelTodoAlarm(t.id);
    hapticSuccess();
    // Animates the row's departure from (or return to) the currently
    // filtered list -- without this, a task dropping out of Active the
    // instant it's checked off would just jump/pop rather than settle
    // smoothly, since the FlatList has no idea a removal is "expected".
    LayoutAnimation.configureNext(LayoutAnimation.create(250, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
    setTodos((prev) => prev.map((x) => (x.id === id ? { ...x, completed: true, completedAt: new Date().toISOString() } : x)));
  }, [todos, setTodos]);

  const remove = useCallback(async (id) => {
    const t = todos.find((x) => x.id === id);
    confirmDelete("Delete this task?", `"${t?.title}" will be removed for good.`, async () => {
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
      subject={t.subjectId ? subjectsById[t.subjectId] : null}
      onToggle={toggle}
      onEdit={startEdit}
      onRemove={remove}
      onToggleSubtask={toggleSubtask}
    />
  ), [subjectsById, toggle, startEdit, remove, toggleSubtask]);

  return (
    <>
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 12 }}
      data={filtered}
      keyExtractor={(t) => t.id}
      renderItem={renderItem}
      // Keeps memory/CPU bounded on long task lists by only mounting cells
      // near the viewport instead of the whole list at once.
      initialNumToRender={12}
      maxToRenderPerBatch={10}
      windowSize={7}
      removeClippedSubviews={Platform.OS === "android"}
      ListEmptyComponent={
        <EmptyState icon={ListTodo} text={statusView === "done" ? "No finished tasks yet." : "No tasks here yet. Add one to get started."} />
      }
      ListHeaderComponent={
        <>
          <View style={styles.headerRow}>
            <Text style={[styles.h1, { color: theme.text }]}>Your tasks</Text>
            <View style={styles.headerActions}>
              {statusView !== "done" && (
                <View style={[styles.viewToggle, { backgroundColor: theme.card, borderColor: theme.line }]}>
                  <Pressable onPress={() => setView("list")} style={[styles.toggleBtn, view === "list" && { backgroundColor: theme.neutralDark }]} accessibilityLabel="List view" accessibilityState={{ selected: view === "list" }}>
                    <List size={13} color={view === "list" ? "#fff" : theme.textMuted} />
                  </Pressable>
                  <Pressable onPress={() => setView("week")} style={[styles.toggleBtn, view === "week" && { backgroundColor: theme.neutralDark }]} accessibilityLabel="Week view" accessibilityState={{ selected: view === "week" }}>
                    <CalendarDays size={13} color={view === "week" ? "#fff" : theme.textMuted} />
                  </Pressable>
                </View>
              )}
              <Pressable onPress={startAdd} style={[styles.roundBtn, { backgroundColor: theme.accentDark }]} accessibilityLabel={showForm ? "Close form" : "Add task"}>
                {showForm ? <X size={16} color="#fff" /> : <Plus size={16} color="#fff" />}
              </Pressable>
            </View>
          </View>

          <SegmentedTabs
            options={[
              { key: "all", label: "All" },
              { key: "upcoming", label: "Upcoming" },
              { key: "overdue", label: "Overdue" },
              { key: "done", label: "Finished" },
            ]}
            value={statusView}
            onChange={setStatusView}
          />

          {schoolConflicts.length > 0 && statusView !== "done" && (
            <View style={[styles.warnBanner, { backgroundColor: ACCENT.ember + "20" }]}>
              <AlertTriangle size={14} color={ACCENT.ember} style={{ marginTop: 2 }} />
              <Text style={[styles.warnText, { color: ACCENT.ember }]}>
                You have multiple School tasks due on {schoolConflicts.map(fmtDay).join(", ")}. Consider spacing them out.
              </Text>
            </View>
          )}

          {statusView !== "done" && view === "week" && (
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
                    <Pressable key={d} onPress={() => setSelectedDay(isSel ? null : d)} style={[styles.dayBtn, isSel && { backgroundColor: theme.neutralDark }]}>
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
        </>
      }
    />

    {/* The task editor now lives in its own popped-up, blurred-backdrop
        sheet instead of inline in the list -- editing a task (its
        deadline included) is a focused moment of its own, not something
        squeezed between the filter chips and the rows. */}
    <EditSheet
      visible={showForm}
      title={editingTodo ? "Edit task" : "New task"}
      onClose={() => { setShowForm(false); setEditingId(null); setPendingSubjectId(null); }}
    >
      <TodoForm
        initial={editingTodo}
        presetSubjectId={editingTodo ? null : pendingSubjectId}
        subjects={subjects}
        onSave={saveTodo}
        onCancel={() => { setShowForm(false); setEditingId(null); setPendingSubjectId(null); }}
        onDelete={remove}
      />
    </EditSheet>
    </>
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
  const popScale = useSharedValue(1);
  const completingRef = useRef(false);
  const timeoutRef = useRef(null);

  React.useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  const rawIndex = STATUS_ORDER.indexOf(t.status);
  const stageIndex = rawIndex === -1 ? 0 : rawIndex;
  const isFinalStage = stageIndex === STATUS_ORDER.length - 1;

  function pop(peak) {
    // Runs on the UI thread -- the checkmark pop stays smooth even if a
    // save/re-render is happening on the JS thread at the same moment.
    popScale.value = withSequence(
      withSpring(peak, { damping: 8, stiffness: 400 }),
      withSpring(1, { damping: 10, stiffness: 400 }),
    );
  }

  function handleToggle() {
    if (completingRef.current) return;
    if (t.completed) { onToggle(t.id); return; }
    if (!isFinalStage) {
      // Just bumping the status forward -- a quick pop, committed right
      // away, since the task stays put in the Active list either way.
      pop(1.25);
      onToggle(t.id);
      return;
    }
    completingRef.current = true;
    setOptimisticDone(true);
    pop(1.4);
    timeoutRef.current = setTimeout(() => {
      onToggle(t.id);
      completingRef.current = false;
      setOptimisticDone(false);
    }, 420);
  }

  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: popScale.value }] }));

  return { displayCompleted: t.completed || optimisticDone, popStyle, handleToggle };
}

// Animates the status progress bar smoothly to its new fraction whenever
// status/completed changes, instead of snapping straight there.
function useAnimatedProgress(fraction) {
  const progress = useSharedValue(fraction);
  React.useEffect(() => {
    progress.value = withTiming(fraction, { duration: DURATION });
  }, [fraction]);
  return useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));
}

// --- Detailed layout: everything visible up front, no expand needed ---
// Memoized so editing the form, switching tabs, or toggling one row
// doesn't force every other row to re-render.
const TodoRow = React.memo(function TodoRow({ t, subject, onToggle, onEdit, onRemove, onToggleSubtask }) {
  const { theme } = useTheme();
  const cat = CATEGORIES.find((c) => c.id === t.category);
  const dleft = t.dueDate ? daysUntil(t.dueDate) : null;
  const { displayCompleted, popStyle, handleToggle } = useTaskCompletion(t, onToggle);
  const urgency = urgencyTier(t, displayCompleted, dleft);
  const urgencyStyle = useUrgencyStyle(urgency);
  const subtasks = t.subtasks || [];
  const subDone = subtasks.filter((s) => s.done).length;
  const effectiveStatusColor = statusColor(t.status);
  const progressAnim = useAnimatedProgress(statusProgress(t));
  const [expanded, setExpanded] = useState(false);
  const hasExpandableContent = !!t.description || subtasks.length > 0 || !!subject?.description || (t.alarmEnabled && t.dueTime);
  const { style: pressStyle, pressIn, pressOut, handleLongPress } = useCardPressAnimation(() => onEdit(t));
  const chevronStyle = useAnimatedStyle(() => ({ transform: [{ rotate: withTiming(expanded ? "180deg" : "0deg", { duration: DURATION }) }] }));

  return (
    <Pressable
      onLongPress={handleLongPress}
      delayLongPress={350}
      onPressIn={pressIn}
      onPressOut={pressOut}
      accessibilityLabel={`"${t.title}" task`}
      accessibilityHint="Long press to edit"
    >
      <Reanimated.View
        layout={ReanimatedLayout.duration(DURATION)}
        style={[
          styles.detailedRow,
          { backgroundColor: theme.card, opacity: displayCompleted ? 0.6 : 1 },
          urgencyStyle,
          pressStyle,
        ]}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
          <Pressable onPress={handleToggle} style={{ marginTop: 2 }} accessibilityLabel={displayCompleted ? `Mark "${t.title}" incomplete` : `Mark "${t.title}" complete`} accessibilityRole="checkbox" accessibilityState={{ checked: displayCompleted }}>
            <Reanimated.View style={popStyle}>
              {displayCompleted ? <CheckCircle2 size={22} color={ACCENT.leaf} /> : <Circle size={22} color={t.status && t.status !== "not_started" ? effectiveStatusColor : theme.textMuted} />}
            </Reanimated.View>
          </Pressable>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={[styles.rowTitle, { fontSize: 15, color: theme.text, textDecorationLine: displayCompleted ? "line-through" : "none", flex: 1 }]}>{t.title}</Text>
              {/* Editing and deleting no longer live here as separate buttons --
                  long-press the card to open the edit sheet, which has its own
                  Delete action. Only the expand/collapse chevron stays, since
                  that's this row's own affordance, not an editing one. */}
              {hasExpandableContent && (
                <Pressable onPress={() => setExpanded((e) => !e)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel={expanded ? "Hide details" : "Show details"} style={{ marginLeft: 8 }}>
                  <Reanimated.View style={chevronStyle}>
                    <ChevronDown size={16} color={theme.textMuted} />
                  </Reanimated.View>
                </Pressable>
              )}
            </View>

            <View style={[styles.detailedMetaRow]}>
              {subject && (
                <View style={[styles.tag, { backgroundColor: (cat?.color || theme.neutralDark) + "22" }]}>
                  <Text style={[styles.tagText, { color: cat?.color || theme.textMuted }]}>{subject.code}</Text>
                </View>
              )}
              <View style={[styles.tag, { backgroundColor: cat?.color + "22" }]}>
                <Text style={[styles.tagText, { color: cat?.color }]}>{cat?.label}</Text>
              </View>
              {!displayCompleted && (
                <View style={[styles.tag, { backgroundColor: effectiveStatusColor + "22" }]}>
                  <Text style={[styles.tagText, { color: effectiveStatusColor }]}>
                    {(STATUS_OPTIONS.find((s) => s.id === t.status) || STATUS_OPTIONS[0]).label}
                  </Text>
                </View>
              )}
              {t.reminderEnabled !== false ? <Bell size={12} color={theme.textMuted} /> : <BellOff size={12} color={theme.textMuted} />}
            </View>

            <View style={[styles.statusProgressTrack, { backgroundColor: theme.bg }]}>
              <Reanimated.View
                style={[
                  styles.statusProgressFill,
                  { backgroundColor: displayCompleted ? ACCENT.leaf : effectiveStatusColor },
                  progressAnim,
                ]}
              />
            </View>

            {t.dueDate ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                <Text style={[styles.metaText, { color: theme.textMuted, fontWeight: "700" }]}>
                  Due {fmtDay(t.dueDate)}{t.dueTime ? ` · ${fmtTime12(t.dueTime)}` : ""}{dleft >= 0 ? ` · ${dleft === 0 ? "today" : `in ${dleft}d`}` : ""}
                </Text>
                {dleft < 0 && (
                  <View style={[styles.tag, { backgroundColor: ACCENT.ember + "22" }]}>
                    <Text style={[styles.tagText, { color: ACCENT.ember }]}>{Math.abs(dleft)}d overdue</Text>
                  </View>
                )}
              </View>
            ) : (
              <Text style={[styles.metaText, { color: theme.textMuted, marginTop: 4, fontWeight: "700" }]}>No due date</Text>
            )}

            {/* Everything below is the "detail" tier -- hidden by default so
                the card reads at a glance, and morphs open with the card's
                own layout animation (see `layout` above) when the chevron
                is tapped. */}
            {expanded && (
              <Reanimated.View entering={FadeIn.duration(DURATION)} exiting={FadeOut.duration(DURATION * 0.75)} style={{ marginTop: 6 }}>
                {subject?.description ? (
                  <Text style={[styles.metaText, { color: theme.textMuted, marginBottom: 6 }]}>{subject.code} · {subject.description}</Text>
                ) : null}

                {t.alarmEnabled && t.dueTime && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginBottom: 6 }}>
                    <AlarmClock size={10} color={ACCENT.rust || ACCENT.gold} />
                    <Text style={[styles.metaText, { color: ACCENT.rust || ACCENT.gold }]}>Alarm set</Text>
                  </View>
                )}

                {t.description ? (
                  <Text style={[styles.descriptionText, { color: theme.text }]}>{t.description}</Text>
                ) : null}

                {subtasks.length > 0 && (
                  <View style={{ marginTop: 10, gap: 6 }}>
                    <View style={[styles.subProgressTrack, { backgroundColor: theme.bg }]}>
                      <View style={[styles.subProgressFill, { width: `${(subDone / subtasks.length) * 100}%`, backgroundColor: ACCENT.leaf }]} />
                    </View>
                    {subtasks.map((s) => (
                      <Pressable key={s.id} onPress={() => onToggleSubtask(t.id, s.id)} style={{ flexDirection: "row", alignItems: "center", gap: 8 }} accessibilityRole="checkbox" accessibilityState={{ checked: s.done }}>
                        {s.done ? <CheckCircle2 size={14} color={ACCENT.leaf} /> : <Circle size={14} color={theme.textMuted} />}
                        <Text style={{ fontSize: 11.5, color: theme.text, textDecorationLine: s.done ? "line-through" : "none" }}>{s.title}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </Reanimated.View>
            )}
          </View>
        </View>
      </Reanimated.View>
    </Pressable>
  );
});

function TodoForm({ initial, onSave, onCancel, onDelete, subjects = [], presetSubjectId = null }) {
  const { theme } = useTheme();
  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [category, setCategory] = useState(initial?.category || "school");
  const [status, setStatus] = useState(initial?.status || "not_started");
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
    // No card background/border here anymore -- the form now lives
    // inside EditSheet, which already provides that surface, so this
    // just needs its own inner spacing.
    <View style={styles.formCardBare}>
      <TextInput value={title} onChangeText={setTitle} placeholder="What do you need to do?" placeholderTextColor={theme.textMuted} style={[styles.input, { color: theme.text }]} />
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder="Add more detail (optional)"
        placeholderTextColor={theme.textMuted}
        multiline
        style={[styles.descriptionInput, { color: theme.text, backgroundColor: theme.bg }]}
      />
      <View style={styles.chipWrap}>
        {CATEGORIES.map((c) => <Chip key={c.id} label={c.label} color={c.color} active={category === c.id} onPress={() => { setCategory(c.id); if (c.id !== "school") setSubjectId(null); }} small />)}
      </View>

      <Text style={[styles.label, { color: theme.textMuted }]}>Status</Text>
      <View style={styles.chipWrap}>
        {STATUS_OPTIONS.map((s) => (
          <Chip key={s.id} label={s.label} color={s.color} active={status === s.id} onPress={() => setStatus(s.id)} small />
        ))}
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
        {initial && onDelete && (
          <Pressable onPress={() => onDelete(initial.id)} style={[styles.formBtn, styles.formBtnDanger, { borderColor: ACCENT.ember }]} accessibilityLabel="Delete task">
            <Trash2 size={14} color={ACCENT.ember} />
            <Text style={[styles.formBtnText, { color: ACCENT.ember }]}>Delete</Text>
          </Pressable>
        )}
        {initial && (
          <Pressable onPress={onCancel} style={[styles.formBtn, { backgroundColor: theme.bg }]} accessibilityLabel="Cancel">
            <Text style={[styles.formBtnText, { color: theme.text }]}>Cancel</Text>
          </Pressable>
        )}
        <Pressable disabled={!canSave} onPress={() => canSave && onSave({ title: title.trim(), description: description.trim(), category, status, subjectId: category === "school" ? subjectId : null, dueDate: hasDueDate ? dueDate : null, dueTime: hasDueDate && hasDueTime ? dueTime : null, alarmEnabled: hasDueDate && hasDueTime ? alarmEnabled : false, reminderEnabled, notify, subtasks })} style={[styles.formBtn, { backgroundColor: ACCENT.gold, opacity: canSave ? 1 : 0.5 }]}>
          <Text style={[styles.formBtnText, { color: "#fff" }]}>{initial ? "Save changes" : "Add task"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  detailedRow: { borderRadius: 16, padding: 14, marginBottom: 10 },
  detailedMetaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6, flexWrap: "wrap" },
  subProgressTrack: { height: 4, borderRadius: 2, overflow: "hidden" },
  subProgressFill: { height: 4, borderRadius: 2 },
  statusProgressTrack: { height: 5, borderRadius: 3, overflow: "hidden", marginTop: 8 },
  statusProgressFill: { height: 5, borderRadius: 3 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  h1: { fontSize: 20, fontWeight: "700" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  viewToggle: { flexDirection: "row", borderWidth: 1, borderRadius: 999, padding: 2 },
  toggleBtn: { padding: 6, borderRadius: 999 },
  roundBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
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
  formCardBare: { paddingTop: 2, paddingBottom: 4 },
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
  formBtnDanger: { flexDirection: "row", justifyContent: "center", gap: 6, borderWidth: 1, backgroundColor: "transparent" },
  formBtnText: { fontSize: 12, fontWeight: "700" },
  rowTitle: { fontSize: 13, fontWeight: "600" },
  tag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  tagText: { fontSize: 9, fontWeight: "700" },
  metaText: { fontSize: 10, fontFamily: "monospace" },
  descriptionText: { fontSize: 12, lineHeight: 17, marginTop: 6 },
  descriptionInput: { fontSize: 12, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12, minHeight: 70, textAlignVertical: "top" },
});

// Memoized: these screens now stay permanently mounted (see App.js) so
// switching tabs is instant, which means without this, any state change
// anywhere in the app -- not just on this screen -- would re-render and
// recompute this one too, even while it's hidden behind another tab.
export default React.memo(TodoScreen);
