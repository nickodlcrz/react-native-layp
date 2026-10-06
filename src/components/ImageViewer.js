import React from "react";
import { Text, Image, Pressable, StyleSheet, useWindowDimensions } from "react-native";
import { GestureHandlerRootView, Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring, runOnJS } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";

// Full-screen photo viewer with zoom:
//  - pinch to zoom (1x to 5x), drag to pan while zoomed
//  - double-tap to zoom in / back out
//  - at normal size, drag up or down to dismiss (or tap the X)
//
// It's an absolutely-positioned overlay, not its own Modal, because it is
// shown from the GF screen, which is already a Modal -- an overlay can't
// fail to appear on top of it. It carries its own GestureHandlerRootView
// since gestures inside a native Modal don't reach the app's root one on
// Android. Render it as the last child of the screen it covers.
const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;
const DISMISS_DRAG = 120;

function clamp(v, lo, hi) {
  "worklet";
  return Math.min(Math.max(v, lo), hi);
}

export default function ImageViewer({ uri, caption, onClose }) {
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  const bg = useSharedValue(1);

  const pinch = Gesture.Pinch()
    .onStart(() => { savedScale.value = scale.value; })
    .onUpdate((e) => { scale.value = clamp(savedScale.value * e.scale, 0.8, MAX_SCALE); })
    .onEnd(() => {
      if (scale.value <= 1) {
        scale.value = withSpring(1);
        tx.value = withSpring(0);
        ty.value = withSpring(0);
      } else {
        // Keep the image from being left dragged past its edges.
        const maxX = (W * (scale.value - 1)) / 2;
        const maxY = (H * (scale.value - 1)) / 2;
        tx.value = withTiming(clamp(tx.value, -maxX, maxX));
        ty.value = withTiming(clamp(ty.value, -maxY, maxY));
      }
    });

  const pan = Gesture.Pan()
    .onStart(() => { savedTx.value = tx.value; savedTy.value = ty.value; })
    .onUpdate((e) => {
      if (scale.value > 1.01) {
        const maxX = (W * (scale.value - 1)) / 2;
        const maxY = (H * (scale.value - 1)) / 2;
        tx.value = clamp(savedTx.value + e.translationX, -maxX, maxX);
        ty.value = clamp(savedTy.value + e.translationY, -maxY, maxY);
      } else {
        // Not zoomed: a vertical drag is "swipe to dismiss", fading the
        // backdrop as it goes.
        ty.value = e.translationY;
        bg.value = 1 - Math.min(Math.abs(e.translationY) / (H / 2), 1) * 0.7;
      }
    })
    .onEnd(() => {
      if (scale.value <= 1.01) {
        if (Math.abs(ty.value) > DISMISS_DRAG) {
          runOnJS(onClose)();
        } else {
          ty.value = withSpring(0);
          bg.value = withTiming(1);
        }
      }
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(250)
    .onEnd((_e, success) => {
      if (!success) return;
      if (scale.value > 1.05) {
        scale.value = withTiming(1);
        tx.value = withTiming(0);
        ty.value = withTiming(0);
      } else {
        scale.value = withTiming(DOUBLE_TAP_SCALE);
      }
    });

  const gesture = Gesture.Exclusive(doubleTap, Gesture.Simultaneous(pinch, pan));

  const backdropStyle = useAnimatedStyle(() => ({ opacity: bg.value * 0.96 }));
  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));
  // The caption gets out of the way once you're zoomed in on a detail.
  const captionStyle = useAnimatedStyle(() => ({ opacity: scale.value > 1.05 ? 0 : bg.value }));

  return (
    <GestureHandlerRootView style={styles.root}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} />
      <GestureDetector gesture={gesture}>
        <Animated.View style={[{ width: W, height: H }, imageStyle]}>
          <Image source={{ uri }} style={styles.image} resizeMode="contain" accessibilityLabel="Photo, pinch to zoom" />
        </Animated.View>
      </GestureDetector>

      {!!caption && (
        <Animated.View pointerEvents="none" style={[styles.captionWrap, { paddingBottom: insets.bottom + 16 }, captionStyle]}>
          <Text style={styles.caption} numberOfLines={4}>{caption}</Text>
        </Animated.View>
      )}

      <Pressable onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={[styles.closeBtn, { top: insets.top + 10 }]} accessibilityLabel="Close photo">
        <X size={20} color="#fff" />
      </Pressable>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, zIndex: 40, elevation: 40, alignItems: "center", justifyContent: "center" },
  backdrop: { backgroundColor: "#000" },
  image: { width: "100%", height: "100%" },
  captionWrap: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 24, backgroundColor: "rgba(0,0,0,0.45)" },
  caption: { color: "#fff", fontSize: 14, lineHeight: 20, fontWeight: "600" },
  closeBtn: { position: "absolute", right: 16, width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.18)" },
});
