import React, { useCallback, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, Platform } from "react-native";
import { Plus, CheckCircle2, Circle, Trash2, Bell, Search, Clock3, BellRing, MessageSquare } from "lucide-react-native";
import { useTheme, ACCENT } from "../theme";
import { uid, todayISO, fmtDay, fmtTime12 } from "../utils";
import Chip from "./Chip";
import SegmentedTabs from "./SegmentedTabs";
import EmptyState from "./EmptyState";
import CalendarPicker from "./CalendarPicker";
import TimePicker from "./TimePicker";
import EditSheet from "./EditSheet";
import { confirmDelete } from "./ConfirmModal";
import { scheduleItemNotification, cancelTodoNotifications } from "../notifications";
import { isScheduledPopupDue, describeSchedule } from "../reminderLogic";

function isOverdue(r) {
  if (r.done || !r.remindTime) return false;
  if (r.remindDate) return new Date(`${r.remindDate}T${r.remindTime}:00`).getTime() <= Date.now();
  const [h, m] = r.remindTime.split(":").map(Number);
  const today = new Date(); today.setHours(h, m, 0, 0);
  return Date.now() >= today.getTime();
}

// Sort key: dated reminders by their exact moment, time-only (repeating)
// ones treated as "today at that time" so they interleave sensibly with
// dated ones instead of always sorting last, and undated notes fall back
// to most-recently-added.
function sortKey(r) {
  if (r.remindDate) return `${r.remindDate}T${r.remindTime || "09:00"}`;
  if (r.remindTime) return `${todayISO()}T${r.remindTime}`;
  return null;
}

export default function RememberList({ reminders, setReminders }) {
  const { theme } = useTheme();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [statusView, setStatusView] = useState("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTag, setActiveTag] = useState(null);

  const allTags = useMemo(() => {
    const set = new Set();
    reminders.forEach((r) => (r.tags || []).forEach((t) => set.add(t)));
    return [...set].sort();
  }, [reminders]);

  const filtered = useMemo(() => {
    let list = reminders.filter((r) => (statusView === "done" ? r.done : !r.done));
    if (activeTag) list = list.filter((r) => (r.tags || []).includes(activeTag));
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((r) => r.text.toLowerCase().includes(q));
    }
    if (statusView === "done") return [...list].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return [...list].sort((a, b) => {
      const ka = sortKey(a), kb = sortKey(b);
      if (ka && kb) return ka.localeCompare(kb);
      if (ka) return -1;
      if (kb) return 1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }, [reminders, statusView, activeTag, searchQuery]);

  async function saveReminder(data) {
    const notifTitle = "Reminder";
    if (editingId) {
      const prev = reminders.find((r) => r.id === editingId);
      const merged = { ...prev, ...data, popupFired: false, lastPopupShownDate: null };
      const notificationId = data.remindMode === "notification"
        ? await scheduleItemNotification(prev.notificationId, { date: data.remindDate, time: data.remindTime, until: data.remindUntil }, notifTitle, merged.text, { type: "reminder" })
        : (await cancelTodoNotifications(prev.notificationId ? [prev.notificationId] : []), null);
      setReminders((list) => list.map((r) => (r.id === editingId ? { ...merged, notificationId } : r)));
      setEditingId(null);
    } else {
      const draft = { id: uid(), ...data, done: false, createdAt: Date.now(), popupFired: false, lastPopupShownDate: null };
      const notificationId = data.remindMode === "notification"
        ? await scheduleItemNotification(null, { date: data.remindDate, time: data.remindTime, until: data.remindUntil }, notifTitle, draft.text, { type: "reminder" })
        : null;
      setReminders((list) => [...list, { ...draft, notificationId }]);
    }
    setShowForm(false);
  }

  const toggleDone = useCallback(async (r) => {
    const nowDone = !r.done;
    if (nowDone && r.notificationId) await cancelTodoNotifications([r.notificationId]);
    setReminders((list) => list.map((x) => (x.id === r.id ? { ...x, done: nowDone } : x)));
  }, [setReminders]);

  const remove = useCallback((r) => {
    confirmDelete("Delete this reminder?", `"${r.text}" will be removed for good.`, async () => {
      if (r.notificationId) await cancelTodoNotifications([r.notificationId]);
      setReminders((list) => list.filter((x) => x.id !== r.id));
    });
  }, [setReminders]);

  const startEdit = useCallback((r) => { setEditingId(r.id); setShowForm(true); }, []);
  const startAdd = useCallback(() => { setEditingId(null); setShowForm(true); }, []);

  // Snoozes from *now*, not from the reminder's original time -- "10 min"
  // means "remind me again in 10 minutes from this moment", which is what
  // every phone's own alarm snooze does too. Works the same for both
  // delivery modes: notification mode reschedules the real OS notification,
  // popup mode just moves the target moment and clears the "already
  // shown" flags so the due-check picks it up again.
  const snooze = useCallback(async (r, kind) => {
    const base = new Date();
    let next;
    if (kind === "10m") next = new Date(base.getTime() + 10 * 60 * 1000);
    else if (kind === "1h") next = new Date(base.getTime() + 60 * 60 * 1000);
    else {
      const [h, m] = r.remindTime ? r.remindTime.split(":").map(Number) : [9, 0];
      next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1, h, m, 0, 0);
    }
    const remindDate = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
    const remindTime = `${String(next.getHours()).padStart(2, "0")}:${String(next.getMinutes()).padStart(2, "0")}`;
    const notificationId = r.remindMode === "notification"
      ? await scheduleItemNotification(r.notificationId, { date: remindDate, time: remindTime }, "Reminder", r.text, { type: "reminder" })
      : null;
    setReminders((list) => list.map((x) => (x.id === r.id ? { ...x, remindDate, remindTime, remindUntil: null, notificationId, popupFired: false, lastPopupShownDate: null } : x)));
  }, [setReminders]);

  const editing = editingId ? reminders.find((r) => r.id === editingId) : null;

  const renderItem = useCallback(({ item: r }) => (
    <ReminderRow r={r} onToggle={toggleDone} onEdit={startEdit} onRemove={remove} onSnooze={snooze} />
  ), [toggleDone, startEdit, remove, snooze]);

  return (
    <>
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 12 }}
      data={filtered}
      keyExtractor={(r) => r.id}
      renderItem={renderItem}
      initialNumToRender={12}
      maxToRenderPerBatch={10}
      windowSize={7}
      removeClippedSubviews={Platform.OS === "android"}
      ListEmptyComponent={
        <EmptyState icon={Bell} text={statusView === "done" ? "Nothing checked off yet." : "Nothing to remember yet -- tap + to add one."} />
      }
      ListHeaderComponent={
        <>
          <View style={styles.headerRow}>
            <Text style={[styles.h1, { color: theme.text }]}>Remember</Text>
            <Pressable onPress={startAdd} style={[styles.roundBtn, { backgroundColor: theme.accentDark }]} accessibilityLabel="Add reminder">
              <Plus size={16} color="#fff" />
            </Pressable>
          </View>

          <View style={[styles.searchRow, { backgroundColor: theme.card, borderColor: theme.line }]}>
            <Search size={14} color={theme.textMuted} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search"
              placeholderTextColor={theme.textMuted}
              style={[styles.searchInput, { color: theme.text }]}
            />
          </View>

          {allTags.length > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 8 }}>
              <Chip label="All" active={!activeTag} onPress={() => setActiveTag(null)} small />
              {allTags.map((t) => <Chip key={t} label={t} active={activeTag === t} onPress={() => setActiveTag((cur) => (cur === t ? null : t))} small />)}
            </View>
          )}

          <SegmentedTabs
            options={[
              { key: "active", label: "Active" },
              { key: "done", label: `Done (${reminders.filter((r) => r.done).length})` },
            ]}
            value={statusView}
            onChange={setStatusView}
          />
        </>
      }
    />

    <EditSheet visible={showForm} title={editing ? "Edit reminder" : "Remember something"} onClose={() => { setShowForm(false); setEditingId(null); }}>
      <ReminderForm initial={editing} onSave={saveReminder} onCancel={() => { setShowForm(false); setEditingId(null); }} onDelete={(id) => { setShowForm(false); setEditingId(null); remove({ id, text: editing?.text, notificationId: editing?.notificationId }); }} />
    </EditSheet>
    </>
  );
}

const ReminderRow = React.memo(function ReminderRow({ r, onToggle, onEdit, onRemove, onSnooze }) {
  const { theme } = useTheme();
  const overdue = isOverdue(r);
  const schedule = describeSchedule(r);
  return (
    <Pressable onLongPress={() => onEdit(r)} delayLongPress={350} style={[styles.row, { backgroundColor: theme.card, borderColor: overdue ? ACCENT.gold : theme.line, borderWidth: overdue ? 1.5 : 1 }]}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <Pressable onPress={() => onToggle(r)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel={r.done ? "Mark not done" : "Mark done"}>
          {r.done ? <CheckCircle2 size={19} color={ACCENT.leaf} /> : <Circle size={19} color={theme.textMuted} />}
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowText, { color: theme.text, textDecorationLine: r.done ? "line-through" : "none" }]}>{r.text}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
            {schedule && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                {r.remindMode === "notification" ? <BellRing size={10} color={overdue ? ACCENT.gold : theme.textMuted} /> : <MessageSquare size={10} color={overdue ? ACCENT.gold : theme.textMuted} />}
                <Text style={[styles.metaText, { color: overdue ? ACCENT.gold : theme.textMuted }]}>{schedule}</Text>
              </View>
            )}
            {(r.tags || []).map((t) => (
              <View key={t} style={[styles.tag, { backgroundColor: ACCENT.sky + "22" }]}><Text style={[styles.tagText, { color: ACCENT.sky }]}>{t}</Text></View>
            ))}
          </View>
        </View>
        <Pressable onPress={() => onEdit(r)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Edit reminder">
          <Text style={{ fontSize: 10, fontWeight: "700", color: ACCENT.sky }}>Edit</Text>
        </Pressable>
        <Pressable onPress={() => onRemove(r)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Delete reminder">
          <Trash2 size={14} color={theme.textMuted} />
        </Pressable>
      </View>
      {!r.done && r.remindTime && (
        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
          <Pressable onPress={() => onSnooze(r, "10m")} style={[styles.snoozeBtn, { backgroundColor: theme.bg }]}><Text style={[styles.snoozeText, { color: theme.text }]}>+10 min</Text></Pressable>
          <Pressable onPress={() => onSnooze(r, "1h")} style={[styles.snoozeBtn, { backgroundColor: theme.bg }]}><Text style={[styles.snoozeText, { color: theme.text }]}>+1 hour</Text></Pressable>
          <Pressable onPress={() => onSnooze(r, "tomorrow")} style={[styles.snoozeBtn, { backgroundColor: theme.bg }]}><Text style={[styles.snoozeText, { color: theme.text }]}>Tomorrow</Text></Pressable>
        </View>
      )}
    </Pressable>
  );
});

function ReminderForm({ initial, onSave, onCancel, onDelete }) {
  const { theme } = useTheme();
  const [text, setText] = useState(initial?.text || "");
  const [tagsText, setTagsText] = useState((initial?.tags || []).join(", "));
  const [showReminder, setShowReminder] = useState(!!initial?.remindTime);
  const [remindMode, setRemindMode] = useState(initial?.remindMode || "notification");
  const [hasDate, setHasDate] = useState(!!initial?.remindDate);
  const [date, setDate] = useState(initial?.remindDate || todayISO());
  const [time, setTime] = useState(initial?.remindTime || "09:00");
  const [hasUntil, setHasUntil] = useState(!!initial?.remindUntil);
  const [until, setUntil] = useState(initial?.remindUntil || todayISO());
  const canSave = text.trim().length > 0;

  function attemptSave() {
    if (!canSave) return;
    const tags = tagsText.split(",").map((t) => t.trim()).filter(Boolean);
    onSave({
      text: text.trim(), tags,
      remindMode: showReminder ? remindMode : "none",
      remindDate: showReminder && hasDate ? date : null,
      remindTime: showReminder ? time : null,
      remindUntil: showReminder && !hasDate && hasUntil ? until : null,
    });
  }

  return (
    <View style={styles.formCardBare}>
      {/* The one field the "quick capture" promise is actually about --
          everything else below is optional and tucked behind a toggle so
          jotting something down never requires more than this. */}
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="What do you want to remember?"
        placeholderTextColor={theme.textMuted}
        autoFocus={!initial}
        multiline
        style={[styles.input, { color: theme.text, backgroundColor: theme.bg }]}
      />
      <TextInput
        value={tagsText}
        onChangeText={setTagsText}
        placeholder="Tags, comma separated (optional)"
        placeholderTextColor={theme.textMuted}
        style={[styles.input, { color: theme.text, backgroundColor: theme.bg, marginBottom: 12 }]}
      />

      {showReminder ? (
        <>
          <Text style={[styles.miniLabel, { color: theme.textMuted }]}>Remind me with</Text>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
            <Chip label="Notification" color={ACCENT.sky} active={remindMode === "notification"} onPress={() => setRemindMode("notification")} />
            <Chip label="Popup when app opens" color={ACCENT.plum} active={remindMode === "popup"} onPress={() => setRemindMode("popup")} />
          </View>

          <Pressable onPress={() => setHasDate((s) => !s)} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
            {hasDate ? <CheckCircle2 size={16} color={ACCENT.sky} /> : <Circle size={16} color={theme.textMuted} />}
            <Text style={{ fontSize: 11, color: theme.textMuted, flex: 1 }}>On a specific date (leave off to repeat daily)</Text>
          </Pressable>

          <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
            {hasDate && <CalendarPicker value={date} onChange={setDate} label="Date" />}
            <TimePicker value={time} onChange={setTime} label="Time" />
          </View>

          {!hasDate && (
            <>
              <Pressable onPress={() => setHasUntil((s) => !s)} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                {hasUntil ? <CheckCircle2 size={16} color={ACCENT.sky} /> : <Circle size={16} color={theme.textMuted} />}
                <Text style={{ fontSize: 11, color: theme.textMuted, flex: 1 }}>Stop repeating after a date</Text>
              </Pressable>
              {hasUntil && <View style={{ marginBottom: 10 }}><CalendarPicker value={until} onChange={setUntil} label="Until" /></View>}
            </>
          )}

          <Pressable onPress={() => setShowReminder(false)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: theme.textMuted }}>Remove reminder</Text>
          </Pressable>
        </>
      ) : (
        <Pressable onPress={() => setShowReminder(true)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 }}>
          <Bell size={13} color={ACCENT.sky} />
          <Text style={{ fontSize: 11, fontWeight: "700", color: ACCENT.sky }}>+ Set a reminder (optional)</Text>
        </Pressable>
      )}

      <View style={styles.formActions}>
        {initial && onDelete && (
          <Pressable onPress={() => onDelete(initial.id)} style={[styles.formBtn, styles.formBtnDanger, { borderColor: ACCENT.ember }]} accessibilityLabel="Delete reminder">
            <Trash2 size={14} color={ACCENT.ember} />
            <Text style={[styles.formBtnText, { color: ACCENT.ember }]}>Delete</Text>
          </Pressable>
        )}
        {initial && <Pressable onPress={onCancel} style={[styles.formBtn, { backgroundColor: theme.bg }]} accessibilityLabel="Cancel"><Text style={[styles.formBtnText, { color: theme.text }]}>Cancel</Text></Pressable>}
        <Pressable onPress={attemptSave} disabled={!canSave} style={[styles.formBtn, { backgroundColor: ACCENT.gold, opacity: canSave ? 1 : 0.5 }]}>
          <Text style={[styles.formBtnText, { color: "#fff" }]}>{initial ? "Save changes" : "Add to Remember"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  h1: { fontSize: 20, fontWeight: "700" },
  roundBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 10 },
  searchInput: { flex: 1, fontSize: 13 },
  row: { borderWidth: 1, borderRadius: 16, padding: 13, marginBottom: 8 },
  rowText: { fontSize: 14, fontWeight: "600" },
  metaText: { fontSize: 10, fontFamily: "monospace" },
  tag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  tagText: { fontSize: 9, fontWeight: "700" },
  snoozeBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  snoozeText: { fontSize: 10, fontWeight: "700" },
  formCardBare: { paddingTop: 2, paddingBottom: 4 },
  miniLabel: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", marginBottom: 6 },
  input: { fontSize: 13, fontWeight: "500", marginBottom: 10, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  formActions: { flexDirection: "row", gap: 8 },
  formBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: "center" },
  formBtnDanger: { flexDirection: "row", justifyContent: "center", gap: 6, borderWidth: 1, backgroundColor: "transparent" },
  formBtnText: { fontSize: 12, fontWeight: "700" },
});
