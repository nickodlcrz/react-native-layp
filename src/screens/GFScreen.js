import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Modal, StyleSheet, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Heart, X, Plus, Trash2, CheckCircle2, Circle, Camera, CalendarHeart, StickyNote, HandHeart, Clock3, Edit3, Pencil } from "lucide-react-native";
import { useTheme, ACCENT } from "../theme";
import { uid, todayISO } from "../utils";
import { verifyPin } from "../security";
import { hapticImpact } from "../haptics";
import ImageViewer from "../components/ImageViewer";
import { pickAndSaveGfImage, deleteGfImage } from "../gfImages";
import { rescheduleDateNotifications, scheduleItemNotification, cancelTodoNotifications } from "../notifications";
import { FREQUENCY_OPTIONS, describeSchedule } from "../reminderLogic";
import Chip from "../components/Chip";
import SegmentedTabs from "../components/SegmentedTabs";
import EmptyState from "../components/EmptyState";
import CalendarPicker from "../components/CalendarPicker";
import { daysUntilEntry, entryKind, entryRepeat, badgesFor, ordinal } from "../gfDates";
import TimePicker from "../components/TimePicker";
import { confirmDelete } from "../components/ConfirmModal";

const LIKE_CATEGORIES = [
  { id: "food", label: "Food" },
  { id: "gifts", label: "Gifts" },
  { id: "places", label: "Places" },
  { id: "shows", label: "Shows" },
];

// Important dates are stored as "MM-DD" (no year) -- a birthday or
// anniversary has no real "year" to carry. Whether one comes round every year
// or every month, and how far away the next occurrence is, lives in
// src/gfDates.js.
function fmtMmdd(mmdd) {
  const [mm, dd] = mmdd.split("-").map(Number);
  return new Date(2000, mm - 1, dd).toLocaleDateString("en-PH", { month: "long", day: "numeric" });
}

// A promise is "overdue" the same way a scheduled reminder is -- exact
// moment passed for a one-time (dated) promise, or today's time-of-day
// passed and not yet done today for a repeating (date-less) one. This is
// independent of remindMode (notification vs popup): the in-app "Did you
// do it?" banner shows either way, since a notification firing doesn't
// mean the person actually saw or acted on it.
function isPromiseOverdue(p) {
  if (p.done || !p.remindTime) return false;
  if (p.remindDate) return new Date(`${p.remindDate}T${p.remindTime}:00`).getTime() <= Date.now();
  const [h, m] = p.remindTime.split(":").map(Number);
  const today = new Date(); today.setHours(h, m, 0, 0);
  return Date.now() >= today.getTime();
}

const SECRET_TAPS_NEEDED = 5;
const SECRET_TAP_WINDOW_MS = 3000;

export default function GFScreen({
  visible, onClose,
  gfName, setGfName,
  gfLikes, setGfLikes, gfDislikes, setGfDislikes,
  gfDates, setGfDates,
  gfNotes, setGfNotes,
  gfGiftIdeas, setGfGiftIdeas,
  gfPromises, setGfPromises,
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [tab, setTab] = useState("notes");
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(gfName || "");
  // The gate starts completely blank -- no PIN field, no hint that one
  // exists. Tapping anywhere on the screen 5 times in quick succession
  // (each tap must land within SECRET_TAP_WINDOW_MS of the last) is what
  // brings the PIN prompt up. The PIN itself still goes through the same
  // verifyPin/lockout path as the app's own lock screen.
  const [showPin, setShowPin] = useState(false);
  const tapCountRef = React.useRef(0);
  const tapTimerRef = React.useRef(null);

  // Long-pressing any item on this screen opens one shared Edit/Delete
  // menu. It's an overlay drawn inside this screen rather than another
  // Modal, so it can never fail to appear on top of this (already modal)
  // screen. `menu` is { title, onEdit?, onDelete }; items with nothing to
  // edit (e.g. a kept promise) just leave onEdit out.
  const [menu, setMenu] = useState(null);
  function openMenu(m) { hapticImpact(); setMenu(m); }
  // The photo being viewed full-screen (with zoom), { uri, caption } or null.
  const [viewer, setViewer] = useState(null);
  const scrollRef = useRef(null);
  // Add/edit forms sit at the bottom of their tab, which with a long list
  // (or a feed of big photos) is well off-screen -- each tab calls this
  // when its form opens so the form is scrolled into view.
  function scrollToForm() { scrollRef.current?.scrollToEnd({ animated: true }); }

  function registerSecretTap() {
    tapCountRef.current += 1;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(() => { tapCountRef.current = 0; }, SECRET_TAP_WINDOW_MS);
    if (tapCountRef.current >= SECRET_TAPS_NEEDED) {
      tapCountRef.current = 0;
      setShowPin(true);
    }
  }

  // Re-locks every time the panel is closed and reopened -- this is the
  // "reuse your PIN so the list can't be seen by others" requirement:
  // the app's normal lock screen only gates getting into LAYP at all, so
  // someone who picks up an already-unlocked phone could otherwise open
  // this straight from the heart icon with no further check.
  React.useEffect(() => {
    if (visible) {
      setUnlocked(false); setPin(""); setPinError(""); setTab("notes");
      setShowPin(false);
      setMenu(null);
      setViewer(null);
      tapCountRef.current = 0;
    }
  }, [visible]);

  async function submitPin(value) {
    setPin(value);
    if (value.length < 4) return;
    const result = await verifyPin(value);
    if (result.ok) {
      setUnlocked(true);
    } else {
      setPinError(result.lockedOutMs > 0 ? "Too many attempts. Try again later." : "Wrong PIN.");
      setPin("");
    }
  }

  // Only one-time (dated) promises count toward "missed" -- a repeating
  // promise recurs by design, so there's no single moment it can be
  // meaningfully "missed" at.
  const missedCount = useMemo(
    () => gfPromises.filter((p) => !p.done && p.remindDate && p.remindTime && Date.now() - new Date(`${p.remindDate}T${p.remindTime}:00`).getTime() > 24 * 3600 * 1000).length,
    [gfPromises]
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => { if (viewer) setViewer(null); else if (menu) setMenu(null); else onClose(); }} statusBarTranslucent>
      <View style={[styles.safe, { backgroundColor: theme.bg, paddingTop: insets.top + 8 }]}>
        {/* While locked, taps on the header's empty space count toward the
            5 secret taps too, so "anywhere on the screen" really is anywhere. */}
        <Pressable style={styles.headerRow} onPress={unlocked ? undefined : registerSecretTap} disabled={unlocked} accessible={false}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
            <Heart size={18} color={ACCENT.rose} fill={ACCENT.rose} />
            {editingName ? (
              <TextInput
                value={nameDraft}
                onChangeText={setNameDraft}
                autoFocus
                onBlur={() => { setGfName(nameDraft.trim() || "Her"); setEditingName(false); }}
                onSubmitEditing={() => { setGfName(nameDraft.trim() || "Her"); setEditingName(false); }}
                style={[styles.nameInput, { color: theme.text, borderColor: theme.line }]}
              />
            ) : (
              <Pressable onPress={() => { if (!unlocked) { registerSecretTap(); return; } setNameDraft(gfName || ""); setEditingName(true); }} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={[styles.h1, { color: theme.text }]}>{gfName || "Her"}</Text>
                {unlocked && <Edit3 size={12} color={theme.textMuted} />}
              </Pressable>
            )}
          </View>
          <Pressable onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Close">
            <X size={20} color={theme.textMuted} />
          </Pressable>
        </Pressable>

        {!unlocked ? (
          showPin ? (
            <View style={styles.pinWrap}>
              <Heart size={32} color={ACCENT.rose} fill={ACCENT.rose} style={{ marginBottom: 14 }} />
              <Text style={[styles.pinLabel, { color: theme.text }]}>Enter your PIN to open this</Text>
              <TextInput
                value={pin}
                onChangeText={submitPin}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={4}
                autoFocus
                style={[styles.pinInput, { color: theme.text, borderColor: theme.line, backgroundColor: theme.card }]}
              />
              {!!pinError && <Text style={{ color: ACCENT.ember, fontSize: 11, marginTop: 8 }}>{pinError}</Text>}
            </View>
          ) : (
            // Blank on purpose -- see the comment on registerSecretTap.
            <Pressable style={{ flex: 1 }} onPress={registerSecretTap} accessible={false} />
          )
        ) : (
          <>
            <View style={{ paddingHorizontal: 16 }}>
              <SegmentedTabs
                options={[
                  { key: "notes", label: "Notes" },
                  { key: "dates", label: "Dates" },
                  { key: "promises", label: `Promises${missedCount ? ` (${missedCount})` : ""}` },
                ]}
                value={tab}
                onChange={setTab}
              />
            </View>
            <ScrollView showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false} ref={scrollRef} style={{ flex: 1, paddingHorizontal: 16 }} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
              <Text style={[styles.longPressHint, { color: theme.textMuted }]}>Long press anything to edit or delete it</Text>
              {tab === "notes" && (
                <NotesTab
                  gfNotes={gfNotes} setGfNotes={setGfNotes}
                  gfLikes={gfLikes} setGfLikes={setGfLikes}
                  gfDislikes={gfDislikes} setGfDislikes={setGfDislikes}
                  gfGiftIdeas={gfGiftIdeas} setGfGiftIdeas={setGfGiftIdeas}
                  openMenu={openMenu} scrollToForm={scrollToForm} openViewer={setViewer}
                />
              )}
              {tab === "dates" && <DatesTab gfDates={gfDates} setGfDates={setGfDates} openMenu={openMenu} scrollToForm={scrollToForm} />}
              {tab === "promises" && <PromisesTab gfPromises={gfPromises} setGfPromises={setGfPromises} missedCount={missedCount} openMenu={openMenu} scrollToForm={scrollToForm} />}
            </ScrollView>
          </>
        )}

        {unlocked && menu && <ActionMenu menu={menu} onClose={() => setMenu(null)} />}
        {unlocked && viewer && <ImageViewer uri={viewer.uri} caption={viewer.caption} onClose={() => setViewer(null)} />}
      </View>
    </Modal>
  );
}

// The shared long-press menu: Edit (when the item can be edited), Delete,
// Cancel. Picking an action closes the menu first, then runs it.
function ActionMenu({ menu, onClose }) {
  const { theme } = useTheme();
  return (
    <Pressable style={styles.menuBackdrop} onPress={onClose} accessibilityLabel="Close menu">
      <Pressable onPress={() => {}} style={[styles.menuCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
        <Text numberOfLines={2} style={[styles.menuTitle, { color: theme.textMuted }]}>{menu.title}</Text>
        {menu.onEdit && (
          <Pressable onPress={() => { onClose(); menu.onEdit(); }} style={[styles.menuBtn, { backgroundColor: theme.bg }]} accessibilityLabel="Edit">
            <Pencil size={15} color={theme.text} />
            <Text style={[styles.menuBtnText, { color: theme.text }]}>Edit</Text>
          </Pressable>
        )}
        <Pressable onPress={() => { onClose(); menu.onDelete(); }} style={[styles.menuBtn, { backgroundColor: ACCENT.ember + "1a" }]} accessibilityLabel="Delete">
          <Trash2 size={15} color={ACCENT.ember} />
          <Text style={[styles.menuBtnText, { color: ACCENT.ember }]}>Delete</Text>
        </Pressable>
        <Pressable onPress={onClose} style={styles.menuCancel} accessibilityLabel="Cancel">
          <Text style={[styles.menuBtnText, { color: theme.textMuted }]}>Cancel</Text>
        </Pressable>
      </Pressable>
    </Pressable>
  );
}

// Runs `onShown` shortly after a tab's add/edit form opens, once it has had
// a frame to render at the bottom of the list.
function useScrollToFormOnOpen(showForm, editingId, onShown) {
  useEffect(() => {
    if (!showForm || !onShown) return undefined;
    const t = setTimeout(onShown, 120);
    return () => clearTimeout(t);
  }, [showForm, editingId]);
}

// --- Notes (things she mentioned, Likes, Dislikes, Gift ideas -- one tab,
// filtered by kind, since none of these are reminders with their own
// schedule the way Promises are) ---

const NOTE_KINDS = [
  { id: "notes", label: "Notes" },
  { id: "likes", label: "Likes" },
  { id: "dislikes", label: "Dislikes" },
  { id: "gifts", label: "Gift ideas" },
];

function NotesTab({ gfNotes, setGfNotes, gfLikes, setGfLikes, gfDislikes, setGfDislikes, gfGiftIdeas, setGfGiftIdeas, openMenu, scrollToForm, openViewer }) {
  const { theme } = useTheme();
  const [kind, setKind] = useState("notes");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Shared form fields -- which ones are shown/used depends on `kind`.
  const [text, setText] = useState("");
  const [category, setCategory] = useState("food");
  const [imageUri, setImageUri] = useState(null);
  const [popupEnabled, setPopupEnabled] = useState(false);
  const [frequency, setFrequency] = useState("always");
  const [customHours, setCustomHours] = useState("2");

  useScrollToFormOnOpen(showForm, editingId, scrollToForm);

  // One long-press handler for every kind of item in this tab.
  const menuFor = (item, itemKind, del) => () => openMenu({ title: item.text, onEdit: () => startEdit(item, itemKind), onDelete: () => del(item) });

  function resetForm() {
    setText(""); setCategory("food"); setImageUri(null);
    setPopupEnabled(false); setFrequency("always"); setCustomHours("2");
    setShowForm(false); setEditingId(null);
  }

  function startAdd() { resetForm(); setShowForm(true); }
  function startEdit(item, itemKind) {
    setKind(itemKind);
    setEditingId(item.id);
    setText(item.text);
    if (itemKind === "likes") { setCategory(item.category); setImageUri(item.imageUri || null); }
    else if (itemKind === "gifts") setImageUri(item.imageUri || null);
    else if (itemKind === "notes") {
      setPopupEnabled(!!item.remindPopup?.enabled);
      setFrequency(item.remindPopup?.frequency || "always");
      setCustomHours(item.remindPopup?.customHours != null ? String(item.remindPopup.customHours) : "2");
    }
    setShowForm(true);
  }

  async function attachPhoto() {
    const uri = await pickAndSaveGfImage();
    if (uri) setImageUri(uri);
  }

  function save() {
    if (!text.trim()) return;
    if (kind === "notes") {
      const remindPopup = popupEnabled ? { enabled: true, frequency, customHours: frequency === "custom" ? Number(customHours) || 1 : null } : { enabled: false };
      if (editingId) {
        setGfNotes((prev) => prev.map((n) => (n.id === editingId ? { ...n, text: text.trim(), remindPopup, lastPopupShownAt: null } : n)));
      } else {
        setGfNotes((prev) => [{ id: uid(), text: text.trim(), remindPopup, lastPopupShownAt: null, createdAt: Date.now() }, ...prev]);
      }
    } else if (kind === "likes") {
      if (editingId) setGfLikes((prev) => prev.map((l) => (l.id === editingId ? { ...l, category, text: text.trim(), imageUri } : l)));
      else setGfLikes((prev) => [...prev, { id: uid(), category, text: text.trim(), imageUri, createdAt: Date.now() }]);
    } else if (kind === "dislikes") {
      if (editingId) setGfDislikes((prev) => prev.map((d) => (d.id === editingId ? { ...d, text: text.trim() } : d)));
      else setGfDislikes((prev) => [...prev, { id: uid(), text: text.trim(), createdAt: Date.now() }]);
    } else if (kind === "gifts") {
      if (editingId) setGfGiftIdeas((prev) => prev.map((g) => (g.id === editingId ? { ...g, text: text.trim(), imageUri } : g)));
      else setGfGiftIdeas((prev) => [...prev, { id: uid(), text: text.trim(), imageUri, used: false, createdAt: Date.now() }]);
    }
    resetForm();
  }

  function removeNote(item) { confirmDelete("Remove this note?", `"${item.text}" will be removed.`, () => setGfNotes((prev) => prev.filter((n) => n.id !== item.id))); }
  function removeLike(item) { confirmDelete("Remove this?", `"${item.text}" will be removed.`, () => { if (item.imageUri) deleteGfImage(item.imageUri); setGfLikes((prev) => prev.filter((l) => l.id !== item.id)); }); }
  function removeDislike(item) { confirmDelete("Remove this?", `"${item.text}" will be removed.`, () => setGfDislikes((prev) => prev.filter((d) => d.id !== item.id))); }
  function removeGift(item) { confirmDelete("Remove this idea?", `"${item.text}" will be removed.`, () => { if (item.imageUri) deleteGfImage(item.imageUri); setGfGiftIdeas((prev) => prev.filter((g) => g.id !== item.id)); }); }
  function toggleGiftUsed(item) { setGfGiftIdeas((prev) => prev.map((g) => (g.id === item.id ? { ...g, used: !g.used } : g))); }

  const byNewest = (a, b) => (b.createdAt || 0) - (a.createdAt || 0);
  const openGifts = useMemo(() => gfGiftIdeas.filter((g) => !g.used).sort(byNewest), [gfGiftIdeas]);
  const usedGifts = useMemo(() => gfGiftIdeas.filter((g) => g.used).sort(byNewest), [gfGiftIdeas]);

  return (
    <View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 12 }}>
        {NOTE_KINDS.map((k) => <Chip key={k.id} label={k.label} active={kind === k.id} onPress={() => { if (!editingId) { resetForm(); setKind(k.id); } }} small />)}
      </View>

      {kind === "notes" && (
        gfNotes.length === 0 && !showForm ? (
          <EmptyState icon={StickyNote} text="Nothing noted yet." />
        ) : gfNotes.map((n) => (
          <Pressable key={n.id} onLongPress={menuFor(n, "notes", removeNote)} delayLongPress={350} accessibilityHint="Long press to edit or delete" style={[styles.itemRow, { backgroundColor: theme.card, borderColor: theme.line }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemText, { color: theme.text }]}>{n.text}</Text>
              {n.remindPopup?.enabled && (
                <Text style={[styles.metaText, { color: theme.textMuted }]}>Popup: {FREQUENCY_OPTIONS.find((f) => f.key === n.remindPopup.frequency)?.label}{n.remindPopup.frequency === "custom" ? ` (every ${n.remindPopup.customHours}h)` : ""}</Text>
              )}
            </View>
          </Pressable>
        ))
      )}

      {kind === "likes" && (
        <>
          {LIKE_CATEGORIES.map((cat) => {
            const items = gfLikes.filter((l) => l.category === cat.id);
            if (!items.length && !showForm) return null;
            return (
              <View key={cat.id} style={{ marginBottom: 14 }}>
                <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>{cat.label}</Text>
                {items.length === 0 ? (
                  <Text style={[styles.emptyLine, { color: theme.textMuted }]}>Nothing added yet.</Text>
                ) : items.map((item) => (
                  <Pressable key={item.id} onLongPress={menuFor(item, "likes", removeLike)} delayLongPress={350} accessibilityHint="Long press to edit or delete" style={[styles.itemRow, { backgroundColor: theme.card, borderColor: theme.line }]}>
                    {item.imageUri && <Image source={{ uri: item.imageUri }} style={styles.thumb} resizeMode="cover" />}
                    <Text style={[styles.itemText, { color: theme.text, flex: 1 }]}>{item.text}</Text>
                  </Pressable>
                ))}
              </View>
            );
          })}
          {gfLikes.length === 0 && !showForm && <EmptyState icon={HandHeart} text="Nothing added yet -- start with a favorite food or place." />}
        </>
      )}

      {kind === "dislikes" && (
        gfDislikes.length === 0 && !showForm ? (
          <EmptyState icon={HandHeart} text="Nothing here yet -- for things to check before repeating." />
        ) : gfDislikes.map((item) => (
          <Pressable key={item.id} onLongPress={menuFor(item, "dislikes", removeDislike)} delayLongPress={350} accessibilityHint="Long press to edit or delete" style={[styles.itemRow, { backgroundColor: theme.card, borderColor: theme.line }]}>
            <Text style={[styles.itemText, { color: theme.text, flex: 1 }]}>{item.text}</Text>
          </Pressable>
        ))
      )}

      {kind === "gifts" && (
        openGifts.length === 0 && usedGifts.length === 0 && !showForm ? (
          <EmptyState icon={HandHeart} text="No gift ideas yet -- add one to pull from when a date comes up." />
        ) : (
          <>
            {/* A feed, newest first. An idea with a photo is a big card --
                the picture at its own proportions with the caption/title
                under it. An idea without one stays a compact row. */}
            {openGifts.map((g) => (
              <GiftItem key={g.id} g={g} given={false} onToggle={() => toggleGiftUsed(g)} onLongPress={menuFor(g, "gifts", removeGift)} onView={() => openViewer({ uri: g.imageUri, caption: g.text })} />
            ))}
            {usedGifts.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { color: theme.textMuted, marginTop: 8 }]}>Already given</Text>
                {usedGifts.map((g) => (
                  <GiftItem key={g.id} g={g} given onToggle={() => toggleGiftUsed(g)} onLongPress={menuFor(g, "gifts", removeGift)} onView={() => openViewer({ uri: g.imageUri, caption: g.text })} />
                ))}
              </>
            )}
          </>
        )
      )}

      {showForm ? (
        <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
          {kind === "likes" && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 10 }}>
              {LIKE_CATEGORIES.map((c) => <Chip key={c.id} label={c.label} active={category === c.id} onPress={() => setCategory(c.id)} small />)}
            </View>
          )}
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={
              kind === "notes" ? 'e.g. "wants to try that cafe downtown"'
              : kind === "likes" ? "What does she like?"
              : kind === "dislikes" ? "What should you avoid repeating?"
              : "Caption or title"
            }
            placeholderTextColor={theme.textMuted}
            autoFocus
            multiline={kind === "notes"}
            style={[styles.input, { color: theme.text, backgroundColor: theme.bg }]}
          />
          {(kind === "likes" || kind === "gifts") && (
            <Pressable onPress={attachPhoto} style={[styles.photoBtn, { borderColor: theme.line }]}>
              {imageUri ? <Image source={{ uri: imageUri }} style={styles.thumb} resizeMode="cover" /> : <Camera size={14} color={theme.textMuted} />}
              <Text style={{ fontSize: 11, fontWeight: "700", color: theme.textMuted }}>{imageUri ? "Change photo" : "Add photo (optional)"}</Text>
            </Pressable>
          )}
          {kind === "notes" && (
            <>
              <Pressable onPress={() => setPopupEnabled((s) => !s)} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: popupEnabled ? 10 : 12, marginTop: 2 }}>
                {popupEnabled ? <CheckCircle2 size={16} color={ACCENT.rose} /> : <Circle size={16} color={theme.textMuted} />}
                <Text style={{ fontSize: 11, color: theme.textMuted, flex: 1 }}>Pop this up when I open the app</Text>
              </Pressable>
              {popupEnabled && (
                <View style={{ marginBottom: 12 }}>
                  <Text style={[styles.miniLabel, { color: theme.textMuted }]}>How often</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: frequency === "custom" ? 8 : 0 }}>
                    {FREQUENCY_OPTIONS.map((f) => <Chip key={f.key} label={f.label} color={ACCENT.rose} active={frequency === f.key} onPress={() => setFrequency(f.key)} small />)}
                  </View>
                  {frequency === "custom" && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <TextInput value={customHours} onChangeText={(v) => setCustomHours(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" placeholder="2" placeholderTextColor={theme.textMuted} style={[styles.customHoursInput, { backgroundColor: theme.bg, color: theme.text, borderColor: theme.line }]} />
                      <Text style={{ fontSize: 11, color: theme.textMuted }}>hours between popups</Text>
                    </View>
                  )}
                </View>
              )}
            </>
          )}
          <View style={styles.formActions}>
            <Pressable onPress={resetForm} style={[styles.formBtn, { backgroundColor: theme.bg }]}><Text style={[styles.formBtnText, { color: theme.text }]}>Cancel</Text></Pressable>
            <Pressable onPress={save} style={[styles.formBtn, { backgroundColor: ACCENT.rose }]}><Text style={[styles.formBtnText, { color: "#fff" }]}>{editingId ? "Save changes" : "Add"}</Text></Pressable>
          </View>
        </View>
      ) : (
        <Pressable onPress={startAdd} style={[styles.addBtn, { borderColor: theme.line }]}>
          <Plus size={14} color={theme.textMuted} />
          <Text style={{ fontSize: 12, fontWeight: "700", color: theme.textMuted }}>
            {kind === "notes" ? "Add a note" : kind === "likes" ? "Add a like" : kind === "dislikes" ? "Add a dislike" : "Add a gift idea"}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// --- Gift feed ---

// The photo's own width/height ratio, clamped to Instagram's limits (4:5
// portrait up to 1.91:1 landscape) so an unusually tall or wide photo can't
// take over the whole screen. Starts square until the real size is known.
function useImageAspect(uri) {
  const [ratio, setRatio] = useState(1);
  useEffect(() => {
    if (!uri) return undefined;
    let alive = true;
    Image.getSize(
      uri,
      (w, h) => { if (alive && w > 0 && h > 0) setRatio(Math.min(1.91, Math.max(0.8, w / h))); },
      () => {}
    );
    return () => { alive = false; };
  }, [uri]);
  return ratio;
}

// One gift idea in the feed: a big photo card when there's an image, a
// compact row when there isn't. Tapping the circle marks it given (or
// takes that back); tapping the photo opens it full-screen with zoom;
// long-pressing anywhere on it opens Edit/Delete.
function GiftItem({ g, given, onToggle, onLongPress, onView }) {
  const { theme } = useTheme();
  const ratio = useImageAspect(g.imageUri);
  const hit = { top: 8, bottom: 8, left: 8, right: 8 };

  if (!g.imageUri) {
    return (
      <Pressable onLongPress={onLongPress} delayLongPress={350} accessibilityHint="Long press to edit or delete" style={[styles.itemRow, { backgroundColor: theme.card, borderColor: theme.line, opacity: given ? 0.55 : 1 }]}>
        <Text style={[styles.itemText, { color: theme.text, flex: 1, textDecorationLine: given ? "line-through" : "none" }]}>{g.text}</Text>
        <Pressable onPress={onToggle} hitSlop={hit} accessibilityLabel={given ? "Mark as not given" : "Mark as given"}>
          {given ? <CheckCircle2 size={16} color={ACCENT.leaf} /> : <Circle size={16} color={theme.textMuted} />}
        </Pressable>
      </Pressable>
    );
  }

  return (
    <Pressable onLongPress={onLongPress} delayLongPress={350} accessibilityHint="Long press to edit or delete" style={[styles.postCard, { backgroundColor: theme.card, borderColor: theme.line, opacity: given ? 0.65 : 1 }]}>
      {/* Tap the photo to view it full-screen and zoom. It also passes the
          long press up, since a nested Pressable would otherwise swallow it
          and the card's Edit/Delete menu wouldn't open from the photo. */}
      <Pressable onPress={onView} onLongPress={onLongPress} delayLongPress={350} accessibilityLabel="View photo">
        <Image source={{ uri: g.imageUri }} style={{ width: "100%", aspectRatio: ratio }} resizeMode="cover" />
        {given && <View style={styles.givenBadge}><Text style={styles.givenBadgeText}>GIVEN</Text></View>}
      </Pressable>
      <View style={styles.postBody}>
        <Pressable onPress={onToggle} hitSlop={hit} style={styles.postAction} accessibilityLabel={given ? "Mark as not given" : "Mark as given"}>
          {given ? <CheckCircle2 size={18} color={ACCENT.leaf} /> : <Circle size={18} color={theme.textMuted} />}
          <Text style={{ fontSize: 11, fontWeight: "700", color: given ? ACCENT.leaf : theme.textMuted }}>{given ? "Given" : "Mark as given"}</Text>
        </Pressable>
        <Text style={[styles.postCaption, { color: theme.text, textDecorationLine: given ? "line-through" : "none" }]}>{g.text}</Text>
      </View>
    </Pressable>
  );
}

// --- Important dates ---

function DatesTab({ gfDates, setGfDates, openMenu, scrollToForm }) {
  const { theme } = useTheme();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [label, setLabel] = useState("");
  const [pickDate, setPickDate] = useState(todayISO());
  // kind: "date" (default) or "anniversary" (gets its own heart badge).
  // repeat: "yearly" (default) or "monthly" -- e.g. a monthsary, which comes
  // round on the same day every month.
  const [kind, setKind] = useState("date");
  const [repeat, setRepeat] = useState("yearly");

  const sorted = useMemo(() => {
    const today = todayISO();
    return [...gfDates].sort((a, b) => daysUntilEntry(a, today) - daysUntilEntry(b, today));
  }, [gfDates]);
  useScrollToFormOnOpen(showForm, editingId, scrollToForm);

  function resetForm() { setLabel(""); setPickDate(todayISO()); setKind("date"); setRepeat("yearly"); setShowForm(false); setEditingId(null); }
  function startEdit(item) {
    setEditingId(item.id);
    setLabel(item.label);
    const now = new Date();
    setPickDate(`${now.getFullYear()}-${item.date}`);
    setKind(entryKind(item));
    setRepeat(entryRepeat(item));
    setShowForm(true);
  }

  async function saveDate() {
    // Anniversaries and monthsaries have an obvious default name, so the
    // label can be left blank for them.
    const finalLabel = label.trim() || (kind === "anniversary" ? "Anniversary" : repeat === "monthly" ? "Monthsary" : "");
    if (!finalLabel) return;
    const mmdd = pickDate.slice(5); // "YYYY-MM-DD" -> "MM-DD"
    if (editingId) {
      const previous = gfDates.find((d) => d.id === editingId);
      const notificationIds = await rescheduleDateNotifications(previous?.notificationIds || [], mmdd, finalLabel, repeat, kind);
      setGfDates((prev) => prev.map((d) => (d.id === editingId ? { ...d, label: finalLabel, date: mmdd, repeat, kind, notificationIds } : d)));
    } else {
      const notificationIds = await rescheduleDateNotifications([], mmdd, finalLabel, repeat, kind);
      setGfDates((prev) => [...prev, { id: uid(), label: finalLabel, date: mmdd, repeat, kind, notificationIds }]);
    }
    resetForm();
  }
  function removeDate(item) {
    confirmDelete("Remove this date?", `"${item.label}" will be removed.`, async () => {
      await rescheduleDateNotifications(item.notificationIds || [], null, "");
      setGfDates((prev) => prev.filter((d) => d.id !== item.id));
    });
  }

  const today = todayISO();
  return (
    <View>
      {sorted.length === 0 && !showForm ? (
        <EmptyState icon={CalendarHeart} text="No important dates yet -- add a birthday, anniversary or monthsary." />
      ) : sorted.map((d) => {
        const days = daysUntilEntry(d, today);
        const monthly = entryRepeat(d) === "monthly";
        const special = entryKind(d) === "anniversary";
        const dayNum = Number(d.date.split("-")[1]);
        const when = days === 0 ? "today!" : days === 1 ? "tomorrow" : `in ${days}d`;
        const badges = badgesFor(d);
        return (
          <Pressable
            key={d.id}
            onLongPress={() => openMenu({ title: d.label, onEdit: () => startEdit(d), onDelete: () => removeDate(d) })}
            delayLongPress={350}
            accessibilityHint="Long press to edit or delete"
            style={[styles.itemRow, { backgroundColor: special ? ACCENT.rose + "12" : theme.card, borderColor: special ? ACCENT.rose : theme.line }]}
          >
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                <Text style={[styles.itemText, { color: theme.text }]}>{d.label}</Text>
                {badges.map((b) => (
                  <View key={b} style={[styles.dateBadge, { backgroundColor: b === "Anniversary" ? ACCENT.rose : theme.bg, borderColor: b === "Anniversary" ? ACCENT.rose : theme.line }]}>
                    {b === "Anniversary" && <Heart size={9} color="#fff" fill="#fff" />}
                    <Text style={[styles.dateBadgeText, { color: b === "Anniversary" ? "#fff" : theme.textMuted }]}>{b}</Text>
                  </View>
                ))}
              </View>
              <Text style={[styles.metaText, { color: theme.textMuted }]}>{monthly ? `Every month on the ${ordinal(dayNum)}` : fmtMmdd(d.date)} -- {when}</Text>
            </View>
          </Pressable>
        );
      })}

      {showForm ? (
        <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
          <TextInput
            value={label}
            onChangeText={setLabel}
            placeholder={kind === "anniversary" ? "e.g. Our anniversary" : repeat === "monthly" ? "e.g. Monthsary" : "e.g. Birthday"}
            placeholderTextColor={theme.textMuted}
            autoFocus
            style={[styles.input, { color: theme.text, backgroundColor: theme.bg }]}
          />
          <Text style={[styles.miniLabel, { color: theme.textMuted }]}>Type</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <Chip label="Date" color={ACCENT.sky} active={kind === "date"} onPress={() => setKind("date")} />
            <Chip label="Anniversary" color={ACCENT.rose} active={kind === "anniversary"} onPress={() => setKind("anniversary")} />
          </View>
          <Text style={[styles.miniLabel, { color: theme.textMuted }]}>Repeats</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <Chip label="Every year" color={ACCENT.plum} active={repeat === "yearly"} onPress={() => setRepeat("yearly")} />
            <Chip label="Every month" color={ACCENT.plum} active={repeat === "monthly"} onPress={() => setRepeat("monthly")} />
          </View>
          <View style={{ marginBottom: 4 }}>
            <CalendarPicker value={pickDate} onChange={setPickDate} label={repeat === "monthly" ? "Date (the day of the month it repeats on)" : "Date (repeats every year)"} />
          </View>
          <Text style={[styles.hint, { color: theme.textMuted, marginBottom: 10 }]}>
            {repeat === "monthly"
              ? "Like a monthsary: you'll get a heads-up the day before and a reminder on the day, every month. Short months use their last day."
              : "You'll get a heads-up 7 days before and 1 day before."}
          </Text>
          <View style={styles.formActions}>
            <Pressable onPress={resetForm} style={[styles.formBtn, { backgroundColor: theme.bg }]}><Text style={[styles.formBtnText, { color: theme.text }]}>Cancel</Text></Pressable>
            <Pressable onPress={saveDate} style={[styles.formBtn, { backgroundColor: ACCENT.rose }]}><Text style={[styles.formBtnText, { color: "#fff" }]}>{editingId ? "Save changes" : "Add"}</Text></Pressable>
          </View>
        </View>
      ) : (
        <Pressable onPress={() => setShowForm(true)} style={[styles.addBtn, { borderColor: theme.line }]}>
          <Plus size={14} color={theme.textMuted} />
          <Text style={{ fontSize: 12, fontWeight: "700", color: theme.textMuted }}>Add a date</Text>
        </Pressable>
      )}
    </View>
  );
}

// --- Promises ---

function PromisesTab({ gfPromises, setGfPromises, missedCount, openMenu, scrollToForm }) {
  const { theme } = useTheme();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [text, setText] = useState("");
  const [remindMode, setRemindMode] = useState("notification");
  const [scheduleKind, setScheduleKind] = useState("time"); // "time" | "interval"
  const [hasDate, setHasDate] = useState(true);
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState("20:00");
  const [hasUntil, setHasUntil] = useState(false);
  const [until, setUntil] = useState(todayISO());
  const [frequency, setFrequency] = useState("1h");
  const [customHours, setCustomHours] = useState("2");

  const active = useMemo(() => [...gfPromises.filter((p) => !p.done)].sort((a, b) => {
    const ka = a.remindDate ? `${a.remindDate}T${a.remindTime || "00:00"}` : a.remindTime ? `9999T${a.remindTime}` : "99999";
    const kb = b.remindDate ? `${b.remindDate}T${b.remindTime || "00:00"}` : b.remindTime ? `9999T${b.remindTime}` : "99999";
    return ka.localeCompare(kb);
  }), [gfPromises]);
  const done = gfPromises.filter((p) => p.done);
  useScrollToFormOnOpen(showForm, editingId, scrollToForm);

  // "Always" only makes sense for a popup-only promise -- an OS
  // notification needs an actual interval to schedule against, so once a
  // notification is involved (mode "notification" or "both"), that
  // option is hidden and a real interval is required instead.
  const wantsNotification = remindMode === "notification" || remindMode === "both";
  const intervalOptions = wantsNotification ? FREQUENCY_OPTIONS.filter((f) => f.key !== "always") : FREQUENCY_OPTIONS;

  function resetForm() {
    setText(""); setRemindMode("notification"); setScheduleKind("time"); setHasDate(true); setDate(todayISO()); setTime("20:00");
    setHasUntil(false); setUntil(todayISO()); setFrequency("1h"); setCustomHours("2");
    setShowForm(false); setEditingId(null);
  }
  function startEdit(p) {
    setEditingId(p.id);
    setText(p.text);
    setRemindMode(p.remindMode || "notification");
    setScheduleKind(p.scheduleKind === "interval" ? "interval" : "time");
    setHasDate(!!p.remindDate);
    setDate(p.remindDate || todayISO());
    setTime(p.remindTime || "20:00");
    setHasUntil(!!p.remindUntil);
    setUntil(p.remindUntil || todayISO());
    setFrequency(p.remindInterval?.frequency || "1h");
    setCustomHours(p.remindInterval?.customHours != null ? String(p.remindInterval.customHours) : "2");
    setShowForm(true);
  }

  async function savePromise() {
    if (!text.trim()) return;
    const remindDate = scheduleKind === "time" && hasDate ? date : null;
    const remindTime = scheduleKind === "time" ? time : null;
    const remindUntil = scheduleKind === "time" && !hasDate && hasUntil ? until : null;
    const remindInterval = scheduleKind === "interval" ? { frequency, customHours: frequency === "custom" ? Number(customHours) || 1 : null } : null;
    const schedule = { date: remindDate, time: remindTime, until: remindUntil, scheduleKind, interval: remindInterval };
    const wantsPopupOnly = remindMode === "popup"; // "both" still needs the notification scheduled too
    if (editingId) {
      const prev = gfPromises.find((p) => p.id === editingId);
      const notificationId = !wantsPopupOnly && remindMode !== "none"
        ? await scheduleItemNotification(prev.notificationId, schedule, "Promise reminder", text.trim(), { type: "gfPromise" })
        : (await cancelTodoNotifications(prev.notificationId ? [prev.notificationId] : []), null);
      setGfPromises((list) => list.map((p) => (p.id === editingId ? { ...p, text: text.trim(), remindMode, scheduleKind, remindDate, remindTime, remindUntil, remindInterval, notificationId, popupFired: false, lastPopupShownDate: null, lastPopupShownAt: null } : p)));
    } else {
      const notificationId = !wantsPopupOnly
        ? await scheduleItemNotification(null, schedule, "Promise reminder", text.trim(), { type: "gfPromise" })
        : null;
      setGfPromises((list) => [...list, { id: uid(), text: text.trim(), remindMode, scheduleKind, remindDate, remindTime, remindUntil, remindInterval, notificationId, done: false, popupFired: false, lastPopupShownDate: null, lastPopupShownAt: null, createdAt: Date.now() }]);
    }
    resetForm();
  }
  async function markDone(p) {
    if (p.notificationId) await cancelTodoNotifications([p.notificationId]);
    setGfPromises((prev) => prev.map((x) => (x.id === p.id ? { ...x, done: true } : x)));
  }
  async function snooze(p, kind) {
    const base = new Date();
    let next;
    if (kind === "10m") next = new Date(base.getTime() + 10 * 60 * 1000);
    else if (kind === "1h") next = new Date(base.getTime() + 60 * 60 * 1000);
    else next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1, 20, 0, 0, 0);
    const remindDate = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
    const remindTime = `${String(next.getHours()).padStart(2, "0")}:${String(next.getMinutes()).padStart(2, "0")}`;
    // Snoozing always drops back to a specific-time schedule, even for a
    // promise that was set up as an interval -- "remind me again at this
    // exact moment" is a one-off, not "go back to repeating every hour".
    const notificationId = p.remindMode !== "popup"
      ? await scheduleItemNotification(p.notificationId, { date: remindDate, time: remindTime }, "Promise reminder", p.text, { type: "gfPromise" })
      : null;
    setGfPromises((prev) => prev.map((x) => (x.id === p.id ? { ...x, scheduleKind: "time", remindDate, remindTime, remindUntil: null, notificationId, popupFired: false, lastPopupShownDate: null } : x)));
  }
  function removePromise(p) {
    confirmDelete("Delete this promise?", `"${p.text}" will be removed.`, async () => {
      if (p.notificationId) await cancelTodoNotifications([p.notificationId]);
      setGfPromises((prev) => prev.filter((x) => x.id !== p.id));
    });
  }

  return (
    <View>
      {missedCount > 0 && (
        <View style={[styles.missedBanner, { backgroundColor: ACCENT.ember + "1a", borderColor: ACCENT.ember }]}>
          <Text style={{ color: ACCENT.ember, fontSize: 12, fontWeight: "700" }}>{missedCount} promise{missedCount === 1 ? "" : "s"} you haven't followed through on</Text>
        </View>
      )}

      {active.length === 0 && done.length === 0 && !showForm ? (
        <EmptyState icon={HandHeart} text='No promises tracked yet -- e.g. "reply in an hour".' />
      ) : active.map((p) => {
        const overdue = isPromiseOverdue(p);
        const schedule = describeSchedule(p);
        const modeLabel = p.remindMode === "both" ? "notification + popup" : p.remindMode === "notification" ? "notification" : "popup";
        return (
          <Pressable key={p.id} onLongPress={() => openMenu({ title: p.text, onEdit: () => startEdit(p), onDelete: () => removePromise(p) })} delayLongPress={350} accessibilityHint="Long press to edit or delete" style={[styles.itemRow, { flexDirection: "column", alignItems: "stretch", backgroundColor: theme.card, borderColor: overdue ? ACCENT.gold : theme.line, borderWidth: overdue ? 1.5 : 1 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Pressable onPress={() => markDone(p)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Mark done"><Circle size={18} color={theme.textMuted} /></Pressable>
              <Text style={[styles.itemText, { color: theme.text, flex: 1 }]}>{p.text}</Text>
            </View>
            {schedule && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4, marginLeft: 28 }}>
                <Clock3 size={10} color={overdue ? ACCENT.gold : theme.textMuted} />
                <Text style={[styles.metaText, { color: overdue ? ACCENT.gold : theme.textMuted }]}>{schedule} -- {modeLabel}</Text>
              </View>
            )}
            {overdue && (
              <View style={{ marginLeft: 28, marginTop: 8 }}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: theme.text, marginBottom: 6 }}>Did you do it?</Text>
                <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                  <Pressable onPress={() => markDone(p)} style={[styles.snoozeBtn, { backgroundColor: ACCENT.leaf }]}><Text style={[styles.snoozeText, { color: "#fff" }]}>Done</Text></Pressable>
                  <Pressable onPress={() => snooze(p, "10m")} style={[styles.snoozeBtn, { backgroundColor: theme.bg }]}><Text style={[styles.snoozeText, { color: theme.text }]}>+10 min</Text></Pressable>
                  <Pressable onPress={() => snooze(p, "1h")} style={[styles.snoozeBtn, { backgroundColor: theme.bg }]}><Text style={[styles.snoozeText, { color: theme.text }]}>+1 hour</Text></Pressable>
                  <Pressable onPress={() => snooze(p, "tomorrow")} style={[styles.snoozeBtn, { backgroundColor: theme.bg }]}><Text style={[styles.snoozeText, { color: theme.text }]}>Tomorrow</Text></Pressable>
                </View>
              </View>
            )}
          </Pressable>
        );
      })}

      {done.length > 0 && (
        <>
          <Text style={[styles.sectionLabel, { color: theme.textMuted, marginTop: 8 }]}>Kept</Text>
          {done.slice(0, 20).map((p) => (
            // A kept promise has nothing left to edit, so its menu is Delete only.
            <Pressable key={p.id} onLongPress={() => openMenu({ title: p.text, onDelete: () => removePromise(p) })} delayLongPress={350} accessibilityHint="Long press to delete" style={[styles.itemRow, { backgroundColor: theme.card, borderColor: theme.line, opacity: 0.55 }]}>
              <CheckCircle2 size={16} color={ACCENT.leaf} />
              <Text style={[styles.itemText, { color: theme.text, flex: 1, textDecorationLine: "line-through" }]}>{p.text}</Text>
            </Pressable>
          ))}
        </>
      )}

      {showForm ? (
        <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
          <TextInput value={text} onChangeText={setText} placeholder='e.g. "call tonight"' placeholderTextColor={theme.textMuted} autoFocus style={[styles.input, { color: theme.text, backgroundColor: theme.bg }]} />

          <Text style={[styles.miniLabel, { color: theme.textMuted }]}>Remind me with</Text>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <Chip label="Notification" color={ACCENT.rose} active={remindMode === "notification"} onPress={() => setRemindMode("notification")} />
            <Chip label="Popup when app opens" color={ACCENT.plum} active={remindMode === "popup"} onPress={() => setRemindMode("popup")} />
            <Chip label="Both" color={ACCENT.gold} active={remindMode === "both"} onPress={() => setRemindMode("both")} />
          </View>

          <Text style={[styles.miniLabel, { color: theme.textMuted }]}>Schedule</Text>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
            <Chip label="Specific time" color={ACCENT.sky} active={scheduleKind === "time"} onPress={() => setScheduleKind("time")} />
            <Chip label="Interval" color={ACCENT.teal} active={scheduleKind === "interval"} onPress={() => setScheduleKind("interval")} />
          </View>

          {scheduleKind === "time" ? (
            <>
              <Pressable onPress={() => setHasDate((s) => !s)} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                {hasDate ? <CheckCircle2 size={16} color={ACCENT.rose} /> : <Circle size={16} color={theme.textMuted} />}
                <Text style={{ fontSize: 11, color: theme.textMuted, flex: 1 }}>On a specific date (leave off to repeat daily)</Text>
              </Pressable>

              <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
                {hasDate && <CalendarPicker value={date} onChange={setDate} label="Date" />}
                <TimePicker value={time} onChange={setTime} label="Time" />
              </View>

              {!hasDate && (
                <>
                  <Pressable onPress={() => setHasUntil((s) => !s)} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    {hasUntil ? <CheckCircle2 size={16} color={ACCENT.rose} /> : <Circle size={16} color={theme.textMuted} />}
                    <Text style={{ fontSize: 11, color: theme.textMuted, flex: 1 }}>Stop repeating after a date</Text>
                  </Pressable>
                  {hasUntil && <View style={{ marginBottom: 10 }}><CalendarPicker value={until} onChange={setUntil} label="Until" /></View>}
                </>
              )}
            </>
          ) : (
            <View style={{ marginBottom: 12 }}>
              <Text style={[styles.miniLabel, { color: theme.textMuted }]}>How often</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: frequency === "custom" ? 8 : 0 }}>
                {intervalOptions.map((f) => <Chip key={f.key} label={f.label} color={ACCENT.rose} active={frequency === f.key} onPress={() => setFrequency(f.key)} small />)}
              </View>
              {frequency === "custom" && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <TextInput value={customHours} onChangeText={(v) => setCustomHours(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" placeholder="2" placeholderTextColor={theme.textMuted} style={[styles.customHoursInput, { backgroundColor: theme.bg, color: theme.text, borderColor: theme.line }]} />
                  <Text style={{ fontSize: 11, color: theme.textMuted }}>hours between reminders</Text>
                </View>
              )}
              {wantsNotification && (
                <Text style={[styles.hint, { color: theme.textMuted, marginTop: 8 }]}>"Always" isn't available here since a notification needs a real interval to schedule against -- pick an hour count, or switch to popup-only above.</Text>
              )}
            </View>
          )}

          <View style={styles.formActions}>
            <Pressable onPress={resetForm} style={[styles.formBtn, { backgroundColor: theme.bg }]}><Text style={[styles.formBtnText, { color: theme.text }]}>Cancel</Text></Pressable>
            <Pressable onPress={savePromise} style={[styles.formBtn, { backgroundColor: ACCENT.rose }]}><Text style={[styles.formBtnText, { color: "#fff" }]}>{editingId ? "Save changes" : "Add"}</Text></Pressable>
          </View>
        </View>
      ) : (
        <Pressable onPress={() => setShowForm(true)} style={[styles.addBtn, { borderColor: theme.line }]}>
          <Plus size={14} color={theme.textMuted} />
          <Text style={{ fontSize: 12, fontWeight: "700", color: theme.textMuted }}>Add a promise</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12 },
  h1: { fontSize: 18, fontWeight: "800" },
  nameInput: { fontSize: 18, fontWeight: "800", borderBottomWidth: 1, minWidth: 100, paddingVertical: 2 },
  pinWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30 },
  pinLabel: { fontSize: 13, fontWeight: "600", marginBottom: 14 },
  pinInput: { width: 140, borderWidth: 1, borderRadius: 12, textAlign: "center", fontSize: 20, letterSpacing: 10, paddingVertical: 10 },
  sectionLabel: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", marginBottom: 6 },
  emptyLine: { fontSize: 11, fontStyle: "italic", marginBottom: 6 },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  itemText: { fontSize: 13, fontWeight: "600" },
  metaText: { fontSize: 10, fontFamily: "monospace" },
  thumb: { width: 36, height: 36, borderRadius: 8 },
  formCard: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 14 },
  input: { fontSize: 13, fontWeight: "500", marginBottom: 10, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  miniLabel: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", marginBottom: 6 },
  customHoursInput: { width: 60, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, textAlign: "center" },
  hint: { fontSize: 10.5, lineHeight: 14 },
  photoBtn: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10, alignSelf: "flex-start" },
  formActions: { flexDirection: "row", gap: 8 },
  formBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: "center" },
  formBtnText: { fontSize: 12, fontWeight: "700" },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderStyle: "dashed", borderRadius: 14, paddingVertical: 12, marginBottom: 14 },
  snoozeBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  snoozeText: { fontSize: 10, fontWeight: "700" },
  dateBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, borderWidth: 1 },
  dateBadgeText: { fontSize: 9.5, fontWeight: "800" },
  longPressHint: { fontSize: 10.5, marginTop: 4, marginBottom: 10 },
  menuBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 28, zIndex: 20, elevation: 20 },
  menuCard: { width: "100%", maxWidth: 320, borderWidth: 1, borderRadius: 22, padding: 16, gap: 8 },
  menuTitle: { fontSize: 12, fontWeight: "600", marginBottom: 4, textAlign: "center" },
  menuBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 13, borderRadius: 14 },
  menuBtnText: { fontSize: 14, fontWeight: "700" },
  menuCancel: { alignItems: "center", paddingVertical: 10 },
  postCard: { borderWidth: 1, borderRadius: 18, overflow: "hidden", marginBottom: 16 },
  postBody: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 14 },
  postAction: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginBottom: 8 },
  postCaption: { fontSize: 14, lineHeight: 20, fontWeight: "600" },
  givenBadge: { position: "absolute", top: 10, right: 10, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.6)" },
  givenBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  missedBanner: { borderWidth: 1, borderRadius: 12, padding: 10, marginBottom: 12 },
});
