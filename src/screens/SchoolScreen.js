import React, { useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Switch, Alert } from "react-native";
import {
  GraduationCap, Plus, X, Pencil, Trash2, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Bell, BellOff, MapPin, User, Clock, BookOpen, CircleCheck,
} from "lucide-react-native";
import { useTheme, ACCENT, WEEKDAYS, ADVANCE_REMINDER_OPTIONS } from "../theme";
import { uid, fmtTime12, fmtDateLong, daysUntil } from "../utils";
import {
  newAcademicPeriod, makePeriodActive, getActivePeriod, copyPeriodSchedule,
  subjectsForPeriod, entriesForSubject, todayExpoWeekday, blocksForWeekday,
  getCurrentAndNextClass, minutesRemaining,
} from "../school";
import { rescheduleSubjectNotifications, cancelSubjectNotifications } from "../notifications";
import Chip from "../components/Chip";
import EmptyState from "../components/EmptyState";
import TimePicker from "../components/TimePicker";

function SchoolScreen({
  periods, setPeriods, subjects, setSubjects, entries, setEntries,
  schoolDefaults, setSchoolDefaults, todos, setTodos, onGoToTodoForSubject,
}) {
  const { theme } = useTheme();
  const activePeriod = getActivePeriod(periods);
  const [viewingPeriodId, setViewingPeriodId] = useState(activePeriod?.id || periods[0]?.id || null);
  const viewingPeriod = periods.find((p) => p.id === viewingPeriodId) || activePeriod || periods[0];

  const [showPeriodPanel, setShowPeriodPanel] = useState(false);
  const [showDefaults, setShowDefaults] = useState(false);
  const [showSubjectForm, setShowSubjectForm] = useState(false);
  const [editingSubjectId, setEditingSubjectId] = useState(null);
  const [detailSubjectId, setDetailSubjectId] = useState(null);
  const [view, setView] = useState("day");
  const [selectedDay, setSelectedDay] = useState(todayExpoWeekday());

  const viewSubjects = useMemo(() => subjectsForPeriod(subjects, viewingPeriod?.id), [subjects, viewingPeriod]);
  const viewSubjectIds = viewSubjects.map((s) => s.id);
  const viewEntries = useMemo(() => entries.filter((e) => viewSubjectIds.includes(e.subjectId)), [entries, viewSubjectIds]);

  // Current/next class always reflects the *active* period, regardless of
  // which period the user happens to be browsing.
  const activeSubjects = useMemo(() => subjectsForPeriod(subjects, activePeriod?.id), [subjects, activePeriod]);
  const activeSubjectIds = activeSubjects.map((s) => s.id);
  const activeEntries = useMemo(() => entries.filter((e) => activeSubjectIds.includes(e.subjectId)), [entries, activeSubjectIds]);
  const currentNext = activePeriod ? getCurrentAndNextClass(activeSubjects, activeEntries) : { current: null, next: null };

  const editingSubject = editingSubjectId ? subjects.find((s) => s.id === editingSubjectId) : null;
  const editingPrimaryEntry = editingSubject ? entriesForSubject(entries, editingSubject.id)[0] : null;
  const detailSubject = detailSubjectId ? subjects.find((s) => s.id === detailSubjectId) : null;

  async function rescheduleFor(subject, subjEntries) {
    if (subject.periodId !== activePeriod?.id) {
      await cancelSubjectNotifications(subject);
      return null;
    }
    return rescheduleSubjectNotifications(subject, subjEntries);
  }

  async function saveSubjectForm(data) {
    if (editingSubject) {
      const merged = {
        ...editingSubject,
        code: data.code, description: data.description, room: data.room, professor: data.professor,
        notes: editingSubject.notes, // notes are edited from Subject Detail, not this form
        classReminderEnabled: data.classReminderEnabled,
        advanceReminderEnabled: data.advanceReminderEnabled,
        advanceReminderMinutes: data.advanceReminderMinutes,
      };
      const others = entriesForSubject(entries, merged.id).filter((e) => e.id !== editingPrimaryEntry?.id);
      const primary = editingPrimaryEntry
        ? { ...editingPrimaryEntry, days: data.days, startTime: data.startTime, endTime: data.endTime }
        : { id: uid(), subjectId: merged.id, days: data.days, startTime: data.startTime, endTime: data.endTime };
      const allEntries = [primary, ...others];
      const ids = await rescheduleFor(merged, allEntries);
      merged.notificationIds = ids;
      setSubjects((prev) => prev.map((s) => (s.id === merged.id ? merged : s)));
      setEntries((prev) => [...prev.filter((e) => e.subjectId !== merged.id), ...allEntries]);
    } else {
      const subject = {
        id: uid(), periodId: viewingPeriod.id, code: data.code, description: data.description,
        room: data.room, professor: data.professor, notes: "",
        classReminderEnabled: data.classReminderEnabled, advanceReminderEnabled: data.advanceReminderEnabled,
        advanceReminderMinutes: data.advanceReminderMinutes, notificationIds: null,
      };
      const entry = { id: uid(), subjectId: subject.id, days: data.days, startTime: data.startTime, endTime: data.endTime };
      const ids = await rescheduleFor(subject, [entry]);
      subject.notificationIds = ids;
      setSubjects((prev) => [...prev, subject]);
      setEntries((prev) => [...prev, entry]);
    }
    setShowSubjectForm(false);
    setEditingSubjectId(null);
  }

  async function deleteSubject(id) {
    const subject = subjects.find((s) => s.id === id);
    if (subject) await cancelSubjectNotifications(subject);
    setSubjects((prev) => prev.filter((s) => s.id !== id));
    setEntries((prev) => prev.filter((e) => e.subjectId !== id));
    setTodos((prev) => prev.map((t) => (t.subjectId === id ? { ...t, subjectId: null } : t)));
    if (detailSubjectId === id) setDetailSubjectId(null);
  }

  async function addMeetingTime(subjectId, data) {
    const subject = subjects.find((s) => s.id === subjectId);
    const entry = { id: uid(), subjectId, days: data.days, startTime: data.startTime, endTime: data.endTime };
    const allEntries = [...entriesForSubject(entries, subjectId), entry];
    const ids = await rescheduleFor(subject, allEntries);
    setSubjects((prev) => prev.map((s) => (s.id === subjectId ? { ...s, notificationIds: ids } : s)));
    setEntries((prev) => [...prev, entry]);
  }

  async function removeMeetingTime(subjectId, entryId) {
    const subject = subjects.find((s) => s.id === subjectId);
    const remaining = entriesForSubject(entries, subjectId).filter((e) => e.id !== entryId);
    const ids = await rescheduleFor(subject, remaining);
    setSubjects((prev) => prev.map((s) => (s.id === subjectId ? { ...s, notificationIds: ids } : s)));
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
  }

  function updateSubjectNotes(subjectId, notes) {
    setSubjects((prev) => prev.map((s) => (s.id === subjectId ? { ...s, notes } : s)));
  }

  async function activatePeriod(id) {
    if (activePeriod?.id === id) { setViewingPeriodId(id); return; }
    const oldActive = activePeriod;
    if (oldActive) {
      for (const s of subjectsForPeriod(subjects, oldActive.id)) await cancelSubjectNotifications(s);
    }
    const targetSubjects = subjectsForPeriod(subjects, id);
    const scheduled = [];
    for (const s of targetSubjects) {
      const ids = await rescheduleSubjectNotifications(s, entriesForSubject(entries, s.id));
      scheduled.push({ ...s, notificationIds: ids });
    }
    setPeriods((prev) => makePeriodActive(prev, id));
    setSubjects((prev) => prev.map((s) => {
      if (oldActive && s.periodId === oldActive.id) return { ...s, notificationIds: null };
      return scheduled.find((u) => u.id === s.id) || s;
    }));
    setViewingPeriodId(id);
  }

  async function createNewPeriod(label, copyFromId) {
    const period = newAcademicPeriod(label);
    const oldActive = activePeriod;
    let addSubjects = [], addEntries = [];
    if (copyFromId) {
      const res = copyPeriodSchedule(subjects, entries, copyFromId, period.id);
      addSubjects = res.newSubjects; addEntries = res.newEntries;
    }
    if (oldActive) {
      for (const s of subjectsForPeriod(subjects, oldActive.id)) await cancelSubjectNotifications(s);
    }
    const scheduled = [];
    for (const s of addSubjects) {
      const ids = await rescheduleSubjectNotifications(s, addEntries.filter((e) => e.subjectId === s.id));
      scheduled.push({ ...s, notificationIds: ids });
    }
    setPeriods((prev) => makePeriodActive([...prev, period], period.id));
    setSubjects((prev) => [
      ...prev.map((s) => (oldActive && s.periodId === oldActive.id ? { ...s, notificationIds: null } : s)),
      ...scheduled,
    ]);
    setEntries((prev) => [...prev, ...addEntries]);
    setViewingPeriodId(period.id);
    setShowPeriodPanel(false);
  }

  function setPeriodStatus(id, status) {
    setPeriods((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
  }

  async function deletePeriod(id) {
    const period = periods.find((p) => p.id === id);
    if (!period) return;
    if (period.status === "active") {
      Alert.alert("Can't delete", "Make another schedule active first.");
      return;
    }
    const subs = subjectsForPeriod(subjects, id);
    for (const s of subs) await cancelSubjectNotifications(s);
    const subIds = subs.map((s) => s.id);
    setPeriods((prev) => prev.filter((p) => p.id !== id));
    setSubjects((prev) => prev.filter((s) => s.periodId !== id));
    setEntries((prev) => prev.filter((e) => !subIds.includes(e.subjectId)));
    setTodos((prev) => prev.map((t) => (subIds.includes(t.subjectId) ? { ...t, subjectId: null } : t)));
    if (viewingPeriodId === id) setViewingPeriodId(activePeriod?.id);
  }

  if (detailSubject) {
    return (
      <SubjectDetail
        subject={detailSubject}
        subjectEntries={entriesForSubject(entries, detailSubject.id)}
        todos={todos}
        onBack={() => setDetailSubjectId(null)}
        onEdit={() => { setEditingSubjectId(detailSubject.id); setShowSubjectForm(true); setDetailSubjectId(null); }}
        onDelete={() => deleteSubject(detailSubject.id)}
        onUpdateNotes={(notes) => updateSubjectNotes(detailSubject.id, notes)}
        onAddMeetingTime={(data) => addMeetingTime(detailSubject.id, data)}
        onRemoveMeetingTime={(entryId) => removeMeetingTime(detailSubject.id, entryId)}
        onGoToTodoForSubject={onGoToTodoForSubject}
      />
    );
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }}>
      <View style={styles.headerRow}>
        <Text style={[styles.h1, { color: theme.text }]}>School</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable
            onPress={() => setShowSubjectForm((s) => { const next = !s; if (next) setEditingSubjectId(null); return next; })}
            style={[styles.roundBtn, { backgroundColor: theme.accentDark }]}
            accessibilityLabel={showSubjectForm ? "Close form" : "Add class"}
          >
            {showSubjectForm ? <X size={16} color="#fff" /> : <Plus size={16} color="#fff" />}
          </Pressable>
        </View>
      </View>

      <Pressable onPress={() => setShowPeriodPanel((s) => !s)} style={[styles.periodPill, { backgroundColor: theme.card, borderColor: theme.line }]} accessibilityLabel="Change academic period">
        <GraduationCap size={13} color={ACCENT.sky} />
        <Text style={[styles.periodPillText, { color: theme.text }]}>{viewingPeriod?.label || "No schedule yet"}</Text>
        {viewingPeriod?.id === activePeriod?.id && <View style={[styles.activeDot, { backgroundColor: ACCENT.leaf }]} />}
        {showPeriodPanel ? <ChevronUp size={13} color={theme.textMuted} /> : <ChevronDown size={13} color={theme.textMuted} />}
      </Pressable>

      {showPeriodPanel && (
        <PeriodPanel
          periods={periods}
          activePeriod={activePeriod}
          onSelect={(id) => setViewingPeriodId(id)}
          onActivate={activatePeriod}
          onSetStatus={setPeriodStatus}
          onDelete={deletePeriod}
          onCreate={createNewPeriod}
        />
      )}

      {/* Today's Classes -- always active-period, real time, same as Home widget */}
      <View style={[styles.nowCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
        <Text style={[styles.nowLabel, { color: theme.textMuted }]}>TODAY</Text>
        {!activePeriod ? (
          <Text style={[styles.nowEmpty, { color: theme.textMuted }]}>No active schedule set.</Text>
        ) : currentNext.current ? (
          <ClassLine dotColor={ACCENT.leaf} tag="NOW" subject={currentNext.current.subject} entry={currentNext.current.entry} theme={theme} sub={`${minutesRemaining(currentNext.current)} minutes remaining`} />
        ) : currentNext.next && currentNext.nextDaysAhead === 0 ? (
          <ClassLine dotColor={ACCENT.gold} tag="NEXT" subject={currentNext.next.subject} entry={currentNext.next.entry} theme={theme} />
        ) : (
          <Text style={[styles.nowEmpty, { color: theme.textMuted }]}>No classes scheduled today.</Text>
        )}
        {currentNext.current && currentNext.next && currentNext.nextDaysAhead === 0 && (
          <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.line }}>
            <ClassLine dotColor={ACCENT.gold} tag="NEXT" subject={currentNext.next.subject} entry={currentNext.next.entry} theme={theme} />
          </View>
        )}
      </View>

      <Pressable onPress={() => setShowDefaults((s) => !s)} style={styles.defaultsToggle} accessibilityLabel={showDefaults ? "Hide default reminders" : "Show default reminders for new classes"}>
        <Text style={[styles.defaultsToggleText, { color: theme.textMuted }]}>{showDefaults ? "Hide" : "Default reminders for new classes"}</Text>
      </Pressable>
      {showDefaults && (
        <DefaultsPanel defaults={schoolDefaults} setDefaults={setSchoolDefaults} />
      )}

      {showSubjectForm && (
        <SubjectForm
          key={editingSubjectId || "new"}
          initialSubject={editingSubject}
          initialEntry={editingPrimaryEntry}
          defaults={schoolDefaults}
          onSave={saveSubjectForm}
          onCancel={() => { setShowSubjectForm(false); setEditingSubjectId(null); }}
        />
      )}

      <View style={[styles.viewToggle, { backgroundColor: theme.card, borderColor: theme.line }]}>
        {[["day", "Day"], ["week", "Week"], ["list", "List"]].map(([id, label]) => (
          <Pressable key={id} onPress={() => setView(id)} style={[styles.viewToggleBtn, view === id && { backgroundColor: theme.accentDark }]} accessibilityLabel={`${label} view`}>
            <Text style={[styles.viewToggleText, { color: view === id ? "#fff" : theme.textMuted }]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {viewSubjects.length === 0 ? (
        <EmptyState text="No classes yet. Tap + to add your first one." />
      ) : view === "day" ? (
        <DayView subjects={viewSubjects} entries={viewEntries} selectedDay={selectedDay} setSelectedDay={setSelectedDay} onOpen={setDetailSubjectId} theme={theme} />
      ) : view === "week" ? (
        <WeekView subjects={viewSubjects} entries={viewEntries} onOpen={setDetailSubjectId} theme={theme} />
      ) : (
        <ListView subjects={viewSubjects} entries={viewEntries} onOpen={setDetailSubjectId} theme={theme} />
      )}
    </ScrollView>
  );
}

function ClassLine({ dotColor, tag, subject, entry, theme, sub }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
      <View style={[styles.nowDot, { backgroundColor: dotColor }]} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.nowTag, { color: dotColor }]}>{tag} — {subject.code}</Text>
        <Text style={[styles.nowDesc, { color: theme.text }]}>{subject.description}</Text>
        <Text style={[styles.nowTime, { color: theme.textMuted }]}>{fmtTime12(entry.startTime)} – {fmtTime12(entry.endTime)}{subject.room ? ` · Room ${subject.room}` : ""}</Text>
        {sub && <Text style={[styles.nowTime, { color: theme.textMuted }]}>{sub}</Text>}
      </View>
    </View>
  );
}

// --- Period management panel ---

function PeriodPanel({ periods, activePeriod, onSelect, onActivate, onSetStatus, onDelete, onCreate }) {
  const { theme } = useTheme();
  const [showNew, setShowNew] = useState(false);
  const [label, setLabel] = useState("");
  const [copyFrom, setCopyFrom] = useState(null);

  function submitNew() {
    if (!label.trim()) return;
    onCreate(label.trim(), copyFrom);
    setLabel(""); setCopyFrom(null); setShowNew(false);
  }

  return (
    <View style={[styles.panel, { backgroundColor: theme.card, borderColor: theme.line }]}>
      {periods.map((p) => (
        <View key={p.id} style={[styles.periodRow, { borderColor: theme.line }]}>
          <Pressable style={{ flex: 1 }} onPress={() => onSelect(p.id)} accessibilityLabel={`Switch to ${p.label}`}>
            <Text style={[styles.periodLabel, { color: theme.text }]}>{p.label}</Text>
          </Pressable>
          <View style={{ flexDirection: "row", gap: 6 }}>
            <Chip label="Active" small color={ACCENT.leaf} active={p.status === "active"} onPress={() => onActivate(p.id)} />
            {p.status !== "active" && <Chip label="Upcoming" small active={p.status === "upcoming"} onPress={() => onSetStatus(p.id, "upcoming")} />}
            {p.status !== "active" && <Chip label="Archived" small active={p.status === "archived"} onPress={() => onSetStatus(p.id, "archived")} />}
          </View>
          {p.status !== "active" && (
            <Pressable onPress={() => onDelete(p.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ marginLeft: 8 }} accessibilityLabel={`Delete ${p.label}`}>
              <Trash2 size={13} color={theme.textMuted} />
            </Pressable>
          )}
        </View>
      ))}

      {!showNew ? (
        <Pressable onPress={() => setShowNew(true)} style={[styles.newPeriodBtn, { backgroundColor: theme.bg }]} accessibilityLabel="Add academic period">
          <Text style={{ fontSize: 11, fontWeight: "700", color: theme.text }}>+ New academic period</Text>
        </Pressable>
      ) : (
        <View style={{ marginTop: 10 }}>
          <TextInput
            value={label} onChangeText={setLabel} placeholder='e.g. "2026-2027, 1st Semester"'
            placeholderTextColor={theme.textMuted}
            style={[styles.input, { color: theme.text, borderColor: theme.line, marginBottom: 8 }]}
          />
          {periods.length > 0 && (
            <View style={{ marginBottom: 8 }}>
              <Text style={[styles.smallLabel, { color: theme.textMuted }]}>Start from</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                <Chip label="Scratch" small active={copyFrom === null} onPress={() => setCopyFrom(null)} />
                {periods.map((p) => (
                  <Chip key={p.id} label={`Copy: ${p.label}`} small active={copyFrom === p.id} onPress={() => setCopyFrom(p.id)} />
                ))}
              </View>
            </View>
          )}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable onPress={() => setShowNew(false)} style={[styles.formBtn, { backgroundColor: theme.bg }]} accessibilityLabel="Cancel">
              <Text style={[styles.formBtnText, { color: theme.text }]}>Cancel</Text>
            </Pressable>
            <Pressable disabled={!label.trim()} onPress={submitNew} style={[styles.formBtn, { backgroundColor: ACCENT.gold, opacity: label.trim() ? 1 : 0.5 }]} accessibilityLabel="Save period">
              <Text style={[styles.formBtnText, { color: "#fff" }]}>Create</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

function DefaultsPanel({ defaults, setDefaults }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.panel, { backgroundColor: theme.card, borderColor: theme.line }]}>
      <ToggleRow label="Class reminder" sub="Notify right when class starts" value={defaults.classReminderEnabled} onChange={(v) => setDefaults({ ...defaults, classReminderEnabled: v })} />
      <ToggleRow label="Advance reminder" sub="Notify a bit before class starts" value={defaults.advanceReminderEnabled} onChange={(v) => setDefaults({ ...defaults, advanceReminderEnabled: v })} />
      {defaults.advanceReminderEnabled && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
          {ADVANCE_REMINDER_OPTIONS.map((mins) => (
            <Chip key={mins} label={mins < 60 ? `${mins}m before` : "1h before"} small color={ACCENT.sky} active={Number(defaults.advanceReminderMinutes) === mins} onPress={() => setDefaults({ ...defaults, advanceReminderMinutes: mins })} />
          ))}
        </View>
      )}
      <Text style={[styles.hint, { color: theme.textMuted }]}>New classes start with these settings -- override any of them per class below.</Text>
    </View>
  );
}

function ToggleRow({ label, sub, value, onChange }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.toggleRow, { borderColor: theme.line }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.toggleLabel, { color: theme.text }]}>{label}</Text>
        <Text style={[styles.toggleSub, { color: theme.textMuted }]}>{sub}</Text>
      </View>
      <Switch value={!!value} onValueChange={onChange} trackColor={{ false: theme.line, true: ACCENT.leaf }} thumbColor="#fff" />
    </View>
  );
}

// --- Add / Edit Subject form ---

function SubjectForm({ initialSubject, initialEntry, defaults, onSave, onCancel }) {
  const { theme } = useTheme();
  const [code, setCode] = useState(initialSubject?.code || "");
  const [description, setDescription] = useState(initialSubject?.description || "");
  const [room, setRoom] = useState(initialSubject?.room || "");
  const [professor, setProfessor] = useState(initialSubject?.professor || "");
  const [days, setDays] = useState(initialEntry?.days || []);
  const [startTime, setStartTime] = useState(initialEntry?.startTime || "08:00");
  const [endTime, setEndTime] = useState(initialEntry?.endTime || "09:00");
  const [classReminderEnabled, setClassReminderEnabled] = useState(initialSubject ? initialSubject.classReminderEnabled !== false : defaults.classReminderEnabled);
  const [advanceReminderEnabled, setAdvanceReminderEnabled] = useState(initialSubject ? !!initialSubject.advanceReminderEnabled : defaults.advanceReminderEnabled);
  const [advanceReminderMinutes, setAdvanceReminderMinutes] = useState(initialSubject?.advanceReminderMinutes || defaults.advanceReminderMinutes);

  const canSave = code.trim().length > 0 && description.trim().length > 0 && days.length > 0;

  function toggleDay(id) {
    setDays((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]));
  }

  return (
    <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
      <Text style={[styles.smallLabel, { color: theme.textMuted }]}>Subject code</Text>
      <TextInput value={code} onChangeText={setCode} placeholder="e.g. EE 201" placeholderTextColor={theme.textMuted} style={[styles.input, { color: theme.text, borderColor: theme.line }]} />
      <Text style={[styles.smallLabel, { color: theme.textMuted, marginTop: 10 }]}>Subject description</Text>
      <TextInput value={description} onChangeText={setDescription} placeholder="e.g. Electrical Circuits" placeholderTextColor={theme.textMuted} style={[styles.input, { color: theme.text, borderColor: theme.line }]} />

      <Text style={[styles.smallLabel, { color: theme.textMuted, marginTop: 12 }]}>Days</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
        {WEEKDAYS.map((d) => {
          const active = days.includes(d.id);
          return (
            <Pressable key={d.id} onPress={() => toggleDay(d.id)} style={[styles.dayCircle, { backgroundColor: active ? ACCENT.sky : theme.bg }]} accessibilityLabel={`${d.label}${active ? ", selected" : ""}`}>
              <Text style={[styles.dayCircleText, { color: active ? "#fff" : theme.text }]}>{d.label[0]}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
        <TimePicker value={startTime} onChange={setStartTime} label="Start" />
        <TimePicker value={endTime} onChange={setEndTime} label="End" />
      </View>

      <Text style={[styles.smallLabel, { color: theme.textMuted, marginTop: 12 }]}>Room (optional)</Text>
      <TextInput value={room} onChangeText={setRoom} placeholder="e.g. 304" placeholderTextColor={theme.textMuted} style={[styles.input, { color: theme.text, borderColor: theme.line }]} />
      <Text style={[styles.smallLabel, { color: theme.textMuted, marginTop: 10 }]}>Professor (optional)</Text>
      <TextInput value={professor} onChangeText={setProfessor} placeholder="e.g. Professor Name" placeholderTextColor={theme.textMuted} style={[styles.input, { color: theme.text, borderColor: theme.line }]} />

      <View style={{ marginTop: 12 }}>
        <ToggleRow label="Class reminder" sub="Notify right when class starts" value={classReminderEnabled} onChange={setClassReminderEnabled} />
        <ToggleRow label="Advance reminder" sub="Notify a bit before class starts" value={advanceReminderEnabled} onChange={setAdvanceReminderEnabled} />
        {advanceReminderEnabled && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 4 }}>
            {ADVANCE_REMINDER_OPTIONS.map((mins) => (
              <Chip key={mins} label={mins < 60 ? `${mins}m before` : "1h before"} small color={ACCENT.sky} active={Number(advanceReminderMinutes) === mins} onPress={() => setAdvanceReminderMinutes(mins)} />
            ))}
          </View>
        )}
      </View>

      <View style={styles.formActions}>
        <Pressable onPress={onCancel} style={[styles.formBtn, { backgroundColor: theme.bg }]}>
          <Text style={[styles.formBtnText, { color: theme.text }]}>Cancel</Text>
        </Pressable>
        <Pressable
          disabled={!canSave}
          onPress={() => canSave && onSave({ code: code.trim(), description: description.trim(), room: room.trim(), professor: professor.trim(), days, startTime, endTime, classReminderEnabled, advanceReminderEnabled, advanceReminderMinutes })}
          style={[styles.formBtn, { backgroundColor: ACCENT.gold, opacity: canSave ? 1 : 0.5 }]}
        >
          <Text style={[styles.formBtnText, { color: "#fff" }]}>{initialSubject ? "Save changes" : "Add class"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

// --- Views ---

function SubjectCard({ subject, entry, onOpen, theme, compact }) {
  const hasReminder = subject.classReminderEnabled !== false || subject.advanceReminderEnabled;
  return (
    <Pressable onPress={() => onOpen(subject.id)} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line }, compact && styles.cardCompact]}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardCode, { color: theme.text }]}>{subject.code}</Text>
          {!compact && <Text style={[styles.cardDesc, { color: theme.textMuted }]}>{subject.description}</Text>}
        </View>
        {hasReminder ? <Bell size={12} color={ACCENT.sky} /> : <BellOff size={12} color={theme.textMuted} />}
      </View>
      <Text style={[styles.cardTime, { color: theme.textMuted }]}>{fmtTime12(entry.startTime)} – {fmtTime12(entry.endTime)}</Text>
      {!compact && subject.room ? <Text style={[styles.cardMeta, { color: theme.textMuted }]}>Room {subject.room}</Text> : null}
    </Pressable>
  );
}

function DayView({ subjects, entries, selectedDay, setSelectedDay, onOpen, theme }) {
  const blocks = blocksForWeekday(subjects, entries, selectedDay);
  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        {WEEKDAYS.map((d) => (
          <Pressable key={d.id} onPress={() => setSelectedDay(d.id)} style={[styles.dayTab, { backgroundColor: selectedDay === d.id ? theme.accentDark : theme.card, borderColor: theme.line }]}>
            <Text style={[styles.dayTabText, { color: selectedDay === d.id ? "#fff" : theme.text }]}>{d.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {blocks.length === 0 ? (
        <EmptyState text="No classes on this day." />
      ) : (
        blocks.map((b) => <SubjectCard key={b.entry.id + b.subject.id} subject={b.subject} entry={b.entry} onOpen={onOpen} theme={theme} />)
      )}
    </View>
  );
}

function WeekView({ subjects, entries, onOpen, theme }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      {WEEKDAYS.map((d) => {
        const blocks = blocksForWeekday(subjects, entries, d.id);
        return (
          <View key={d.id} style={[styles.weekCol, { borderColor: theme.line }]}>
            <Text style={[styles.weekColHeader, { color: theme.textMuted }]}>{d.label}</Text>
            {blocks.length === 0 ? (
              <Text style={[styles.weekColEmpty, { color: theme.textMuted }]}>—</Text>
            ) : (
              blocks.map((b) => <SubjectCard key={b.entry.id + b.subject.id} subject={b.subject} entry={b.entry} onOpen={onOpen} theme={theme} compact />)
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

function ListView({ subjects, entries, onOpen, theme }) {
  const groups = WEEKDAYS.map((d) => ({ day: d, blocks: blocksForWeekday(subjects, entries, d.id) })).filter((g) => g.blocks.length > 0);
  if (groups.length === 0) return <EmptyState text="No classes scheduled yet." />;
  return (
    <View>
      {groups.map((g) => (
        <View key={g.day.id} style={{ marginBottom: 14 }}>
          <Text style={[styles.listDayHeader, { color: theme.textMuted }]}>{g.day.label.toUpperCase()}</Text>
          {g.blocks.map((b) => <SubjectCard key={b.entry.id + b.subject.id} subject={b.subject} entry={b.entry} onOpen={onOpen} theme={theme} />)}
        </View>
      ))}
    </View>
  );
}

// --- Subject Detail ---

function SubjectDetail({ subject, subjectEntries, todos, onBack, onEdit, onDelete, onUpdateNotes, onAddMeetingTime, onRemoveMeetingTime, onGoToTodoForSubject }) {
  const { theme } = useTheme();
  const [notes, setNotes] = useState(subject.notes || "");
  const [showAddMeeting, setShowAddMeeting] = useState(false);
  const relatedTodos = todos.filter((t) => t.subjectId === subject.id);
  const activeTodos = relatedTodos.filter((t) => !t.completed).sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
  const doneTodos = relatedTodos.filter((t) => t.completed);

  function confirmDelete() {
    Alert.alert("Delete this class?", `${subject.code} and its schedule will be removed. Linked tasks will keep their titles but lose the subject link.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: onDelete },
    ]);
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }}>
      <View style={styles.headerRow}>
        <Pressable onPress={onBack} style={{ flexDirection: "row", alignItems: "center", gap: 4 }} accessibilityLabel="Back to schedule">
          <ChevronLeft size={16} color={theme.textMuted} />
          <Text style={{ fontSize: 11, color: theme.textMuted, fontWeight: "700" }}>Back</Text>
        </Pressable>
        <View style={{ flexDirection: "row", gap: 14 }}>
          <Pressable onPress={onEdit} accessibilityLabel="Edit class"><Pencil size={15} color={theme.textMuted} /></Pressable>
          <Pressable onPress={confirmDelete} accessibilityLabel="Delete class"><Trash2 size={15} color={theme.textMuted} /></Pressable>
        </View>
      </View>

      <Text style={[styles.h1, { color: theme.text }]}>{subject.code}</Text>
      <Text style={[styles.detailDesc, { color: theme.textMuted }]}>{subject.description}</Text>

      <View style={[styles.detailCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
        <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>SCHEDULE</Text>
        {subjectEntries.map((e) => (
          <View key={e.id} style={styles.meetingRow}>
            <Clock size={13} color={ACCENT.sky} />
            <Text style={[styles.meetingText, { color: theme.text }]}>
              {e.days.map((id) => WEEKDAYS.find((w) => w.id === id)?.label).join(" + ")} · {fmtTime12(e.startTime)}–{fmtTime12(e.endTime)}
            </Text>
            {subjectEntries.length > 1 && (
              <Pressable onPress={() => onRemoveMeetingTime(e.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Remove meeting time">
                <X size={12} color={theme.textMuted} />
              </Pressable>
            )}
          </View>
        ))}
        {subject.room ? (
          <View style={styles.meetingRow}><MapPin size={13} color={ACCENT.gold} /><Text style={[styles.meetingText, { color: theme.text }]}>Room {subject.room}</Text></View>
        ) : null}
        {subject.professor ? (
          <View style={styles.meetingRow}><User size={13} color={ACCENT.plum} /><Text style={[styles.meetingText, { color: theme.text }]}>{subject.professor}</Text></View>
        ) : null}
        <View style={styles.meetingRow}>
          {subject.classReminderEnabled !== false ? <Bell size={13} color={ACCENT.leaf} /> : <BellOff size={13} color={theme.textMuted} />}
          <Text style={[styles.meetingText, { color: theme.textMuted }]}>
            {subject.classReminderEnabled !== false ? "Class reminder on" : "Class reminder off"}
            {subject.advanceReminderEnabled ? ` \u00b7 ${subject.advanceReminderMinutes}m advance reminder` : ""}
          </Text>
        </View>

        {!showAddMeeting ? (
          <Pressable onPress={() => setShowAddMeeting(true)} style={[styles.addMeetingBtn, { backgroundColor: theme.bg }]} accessibilityLabel="Add another meeting time">
            <Text style={{ fontSize: 11, fontWeight: "700", color: theme.text }}>+ Add another meeting time</Text>
          </Pressable>
        ) : (
          <MeetingTimeForm onSave={(data) => { onAddMeetingTime(data); setShowAddMeeting(false); }} onCancel={() => setShowAddMeeting(false)} />
        )}
      </View>

      <View style={[styles.detailCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
        <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>NOTES</Text>
        <TextInput
          value={notes} onChangeText={setNotes} onEndEditing={() => onUpdateNotes(notes)}
          multiline placeholder="Notes for this subject..." placeholderTextColor={theme.textMuted}
          style={[styles.notesInput, { color: theme.text, borderColor: theme.line }]}
        />
      </View>

      <View style={[styles.detailCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <Text style={[styles.sectionLabel, { color: theme.textMuted, marginBottom: 0 }]}>ASSIGNMENTS & TASKS</Text>
          {onGoToTodoForSubject && (
            <Pressable onPress={() => onGoToTodoForSubject(subject.id)} accessibilityLabel="Add task for this class">
              <Text style={{ fontSize: 10, fontWeight: "700", color: ACCENT.sky }}>+ Add task</Text>
            </Pressable>
          )}
        </View>
        {activeTodos.length === 0 && doneTodos.length === 0 ? (
          <Text style={{ fontSize: 11, color: theme.textMuted }}>No tasks linked to this subject yet.</Text>
        ) : (
          <View style={{ gap: 6 }}>
            {activeTodos.map((t) => {
              const dleft = t.dueDate ? daysUntil(t.dueDate) : null;
              return (
                <View key={t.id} style={styles.todoRow}>
                  <Text style={{ fontSize: 11, color: theme.text, flex: 1 }}>{t.title}</Text>
                  <Text style={{ fontSize: 9, color: dleft !== null && dleft < 0 ? ACCENT.ember : theme.textMuted }}>{t.dueDate ? fmtDateLong(t.dueDate) : "no date"}</Text>
                </View>
              );
            })}
            {doneTodos.length > 0 && (
              <Text style={{ fontSize: 9, color: theme.textMuted, marginTop: 2 }}>
                <CircleCheck size={9} color={ACCENT.leaf} /> {doneTodos.length} finished
              </Text>
            )}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function MeetingTimeForm({ onSave, onCancel }) {
  const { theme } = useTheme();
  const [days, setDays] = useState([]);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("09:00");
  const canSave = days.length > 0;
  function toggleDay(id) { setDays((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id])); }

  return (
    <View style={{ marginTop: 10 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        {WEEKDAYS.map((d) => {
          const active = days.includes(d.id);
          return (
            <Pressable key={d.id} onPress={() => toggleDay(d.id)} style={[styles.dayCircle, { backgroundColor: active ? ACCENT.sky : theme.bg }]} accessibilityLabel={`${d.label}${active ? ", selected" : ""}`}>
              <Text style={[styles.dayCircleText, { color: active ? "#fff" : theme.text }]}>{d.label[0]}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
        <TimePicker value={startTime} onChange={setStartTime} label="Start" />
        <TimePicker value={endTime} onChange={setEndTime} label="End" />
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable onPress={onCancel} style={[styles.formBtn, { backgroundColor: theme.bg }]} accessibilityLabel="Cancel"><Text style={[styles.formBtnText, { color: theme.text }]}>Cancel</Text></Pressable>
        <Pressable disabled={!canSave} onPress={() => canSave && onSave({ days, startTime, endTime })} style={[styles.formBtn, { backgroundColor: ACCENT.gold, opacity: canSave ? 1 : 0.5 }]} accessibilityLabel="Add meeting time">
          <Text style={[styles.formBtnText, { color: "#fff" }]}>Add</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  h1: { fontSize: 20, fontWeight: "700" },
  roundBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  periodPill: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 },
  periodPillText: { flex: 1, fontSize: 12, fontWeight: "700" },
  activeDot: { width: 6, height: 6, borderRadius: 3 },
  panel: { borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 12 },
  periodRow: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1, paddingVertical: 8, flexWrap: "wrap", gap: 6 },
  periodLabel: { fontSize: 12, fontWeight: "600" },
  newPeriodBtn: { marginTop: 10, paddingVertical: 10, borderRadius: 10, alignItems: "center" },
  smallLabel: { fontSize: 9, fontWeight: "700", textTransform: "uppercase" },
  input: { fontSize: 12, fontWeight: "500", borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, marginTop: 4 },
  nowCard: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 12 },
  nowLabel: { fontSize: 9, fontWeight: "700", letterSpacing: 0.6, marginBottom: 8 },
  nowEmpty: { fontSize: 12 },
  nowDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  nowTag: { fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
  nowDesc: { fontSize: 13, fontWeight: "700", marginTop: 2 },
  nowTime: { fontSize: 11, marginTop: 2, fontFamily: "monospace" },
  defaultsToggle: { marginBottom: 4 },
  defaultsToggleText: { fontSize: 10, fontWeight: "700" },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  toggleLabel: { fontSize: 12, fontWeight: "700" },
  toggleSub: { fontSize: 9, marginTop: 2 },
  hint: { fontSize: 9, marginTop: 2 },
  formCard: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 12 },
  dayCircle: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  dayCircleText: { fontSize: 11, fontWeight: "700" },
  formActions: { flexDirection: "row", gap: 8, marginTop: 14 },
  formBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: "center" },
  formBtnText: { fontSize: 12, fontWeight: "700" },
  viewToggle: { flexDirection: "row", borderWidth: 1, borderRadius: 12, padding: 3, marginBottom: 12 },
  viewToggleBtn: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: "center" },
  viewToggleText: { fontSize: 11, fontWeight: "700" },
  dayTab: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8 },
  dayTabText: { fontSize: 11, fontWeight: "700" },
  card: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 8 },
  cardCompact: { width: 110, marginBottom: 6, padding: 8, borderRadius: 10 },
  cardCode: { fontSize: 13, fontWeight: "700" },
  cardDesc: { fontSize: 11, marginTop: 1 },
  cardTime: { fontSize: 10, fontFamily: "monospace", marginTop: 4 },
  cardMeta: { fontSize: 10, marginTop: 2 },
  weekCol: { width: 118, borderRightWidth: 1, paddingHorizontal: 8, paddingTop: 2 },
  weekColHeader: { fontSize: 9, fontWeight: "800", textTransform: "uppercase", marginBottom: 8, letterSpacing: 0.4 },
  weekColEmpty: { fontSize: 16, textAlign: "center", marginTop: 12 },
  listDayHeader: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5, marginBottom: 8 },
  detailDesc: { fontSize: 13, marginBottom: 14 },
  detailCard: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 12 },
  sectionLabel: { fontSize: 9, fontWeight: "700", textTransform: "uppercase", marginBottom: 10, letterSpacing: 0.5 },
  meetingRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  meetingText: { flex: 1, fontSize: 12, fontWeight: "500" },
  addMeetingBtn: { marginTop: 4, paddingVertical: 9, borderRadius: 10, alignItems: "center" },
  notesInput: { minHeight: 70, borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 12, textAlignVertical: "top" },
  todoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
});

// Memoized: these screens now stay permanently mounted (see App.js) so
// switching tabs is instant, which means without this, any state change
// anywhere in the app -- not just on this screen -- would re-render and
// recompute this one too, even while it's hidden behind another tab.
export default React.memo(SchoolScreen);
