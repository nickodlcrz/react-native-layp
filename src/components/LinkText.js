import React, { useMemo } from "react";
import { Text, Linking } from "react-native";
import { linkify } from "../linkify";
import { showAppDialog } from "./AppDialog";

async function openLink(url) {
  try {
    await Linking.openURL(url);
  } catch (e) {
    showAppDialog("Can't open link", url);
  }
}

// Text whose http(s):// and www. links are underlined and open in the
// phone's browser when tapped. `onLongPress` is passed through to each link
// so long-pressing a link still reaches the card's own long-press (a
// pressable Text would otherwise swallow it).
export default function LinkText({ text, style, linkColor, onLongPress }) {
  const parts = useMemo(() => linkify(text), [text]);
  return (
    <Text style={style}>
      {parts.map((p, i) =>
        p.url ? (
          <Text
            key={i}
            onPress={() => openLink(p.url)}
            onLongPress={onLongPress}
            suppressHighlighting
            accessibilityRole="link"
            style={{ color: linkColor, textDecorationLine: "underline" }}
          >
            {p.text}
          </Text>
        ) : (
          p.text
        )
      )}
    </Text>
  );
}
