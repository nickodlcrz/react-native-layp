import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { AlertTriangle, RotateCcw } from "lucide-react-native";
import { ThemeContext, LIGHT, ACCENT } from "../theme";

// Catches render/lifecycle errors in whatever it wraps so one broken
// screen shows a recoverable "something went wrong" card instead of
// whiting out the entire app. Class components are the only way to
// implement getDerivedStateFromError/componentDidCatch -- there's no hooks
// equivalent, so this one exception to the rest of the app's function-
// component style is unavoidable.
//
// `resetKey` lets the parent force this boundary back to its non-error
// state without unmounting it -- useful when a screen is deliberately
// torn down and rebuilt (e.g. a modal closing), so returning to it later
// gets a fresh mount instead of being stuck showing the error. Screens
// that stay permanently mounted (like each main tab) should pass a
// stable key instead, since there's no natural "coming back" moment to
// hook a reset to -- for those, the "Try again" button below is the only
// way out of an error state short of restarting the app.
export default class ErrorBoundary extends React.Component {
  // Function components can't be class components, but they CAN read
  // context -- ThemeContext isn't available to `this.context` on a plain
  // class component unless declared here, which is what lets the fallback
  // UI below respect dark mode instead of being hardcoded to one theme.
  static contextType = ThemeContext;

  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught an error:", error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      const theme = this.context?.theme || LIGHT;
      return (
        <View style={[styles.wrap, { backgroundColor: theme.bg }]}>
          <AlertTriangle size={28} color={ACCENT.ember} />
          <Text style={[styles.title, { color: theme.text }]}>Something went wrong here</Text>
          <Text style={[styles.sub, { color: theme.textMuted }]}>
            This screen hit an unexpected error. Your data is safe -- tap below to reload just this screen.
          </Text>
          <Pressable onPress={() => this.setState({ hasError: false })} style={[styles.retryBtn, { backgroundColor: theme.accentDark }]}>
            <RotateCcw size={13} color="#fff" />
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 10 },
  title: { fontSize: 15, fontWeight: "700", textAlign: "center", marginTop: 4 },
  sub: { fontSize: 12, textAlign: "center", lineHeight: 17, marginBottom: 6 },
  retryBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  retryText: { color: "#fff", fontSize: 12, fontWeight: "700" },
});
