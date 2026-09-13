import React, { useEffect, useState } from "react";
import { Modal, View, Text, Pressable, ScrollView, StyleSheet, Dimensions, KeyboardAvoidingView, Platform } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  Easing,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { BlurView } from "expo-blur";
import { X } from "lucide-react-native";
import { useTheme } from "../theme";

const { height: SCREEN_H } = Dimensions.get("window");
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 900;

// A single reusable "editing surface": instead of a form squeezed inline
// into a list (the old pattern), whatever's being edited -- a task's
// deadline, an expense -- gets its own focused popup. The rest of the
// screen dims and blurs behind it so attention stays on the one thing
// being edited, and the sheet can be dragged back down to cancel, the
// same way a native bottom sheet works.
//
// Used identically by Todo (editing a task) and Spending (editing an
// expense) so both features share one animation implementation instead of
// each screen inventing its own.
export default function EditSheet({ visible, onClose, title, children, maxHeightRatio = 0.86 }) {
  const { theme, dark } = useTheme();
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0); // 0 = fully hidden, 1 = fully shown
  const dragY = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      dragY.value = 0;
      progress.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) });
    } else {
      progress.value = withTiming(0, { duration: 220, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(setMounted)(false);
      });
    }
  }, [visible]);

  function requestClose() {
    onClose && onClose();
  }

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: (1 - progress.value) * 80 + dragY.value },
    ],
  }));

  // Dragging the sheet itself down (from the handle/header area) cancels
  // the edit -- release far or fast enough and it slides the rest of the
  // way off before actually closing, otherwise it springs back into place.
  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) dragY.value = e.translationY;
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) {
        dragY.value = withTiming(SCREEN_H, { duration: 180, easing: Easing.in(Easing.cubic) }, (finished) => {
          if (finished) runOnJS(requestClose)();
        });
      } else {
        dragY.value = withSpring(0, { damping: 20, stiffness: 260 });
      }
    });

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={requestClose}>
      <Animated.View style={[StyleSheet.absoluteFillObject, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={requestClose} accessibilityLabel="Close">
          <BlurView intensity={35} tint={dark ? "dark" : "light"} style={StyleSheet.absoluteFillObject} />
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: dark ? "#00000066" : "#00000033" }]} />
        </Pressable>
      </Animated.View>

      <KeyboardAvoidingView
        style={styles.centerWrap}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[
            styles.sheet,
            { backgroundColor: theme.card, borderColor: theme.line, maxHeight: SCREEN_H * maxHeightRatio },
            sheetStyle,
          ]}
        >
          <GestureDetector gesture={pan}>
            <View>
              <View style={[styles.handle, { backgroundColor: theme.line }]} />
              {title ? (
                <View style={styles.header}>
                  <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
                  <Pressable onPress={requestClose} hitSlop={10} accessibilityLabel="Close">
                    <X size={18} color={theme.textMuted} />
                  </Pressable>
                </View>
              ) : null}
            </View>
          </GestureDetector>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {children}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  centerWrap: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingTop: 8,
    paddingHorizontal: 16,
    // Shadow so the sheet reads as lifted above the blurred backdrop, not
    // flush with it.
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 12,
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    marginTop: 4,
    marginBottom: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingBottom: 8,
  },
  title: { fontSize: 16, fontWeight: "700" },
  scrollContent: { paddingBottom: 28 },
});
