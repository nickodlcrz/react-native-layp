import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle, G } from "react-native-svg";

// A donut chart built from plain <Circle> segments using stroke-dasharray
// tricks -- no chart library needed since react-native-svg is already a
// project dependency. `data` is [{ label, value, color }]; slices are drawn
// in the order given, largest-first looks best but isn't required.
export default function PieChart({ data, size = 160, strokeWidth = 22, centerLabel, centerValue, theme }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let cumulative = 0;

  return (
    <View style={{ alignItems: "center" }}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <G rotation="-90" originX={size / 2} originY={size / 2}>
            {total <= 0 ? (
              <Circle cx={size / 2} cy={size / 2} r={radius} stroke={theme?.line || "#e5e5e5"} strokeWidth={strokeWidth} fill="none" />
            ) : (
              data.map((d, i) => {
                const fraction = d.value / total;
                const dash = fraction * circumference;
                const gap = circumference - dash;
                const offset = -cumulative * circumference;
                cumulative += fraction;
                return (
                  <Circle
                    key={i}
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={d.color}
                    strokeWidth={strokeWidth}
                    strokeDasharray={`${dash} ${gap}`}
                    strokeDashoffset={offset}
                    fill="none"
                    strokeLinecap={data.length === 1 ? "butt" : "round"}
                  />
                );
              })
            )}
          </G>
        </Svg>
        {(centerLabel || centerValue) && (
          <View style={styles.centerOverlay} pointerEvents="none">
            {centerValue ? <Text style={[styles.centerValue, { color: theme?.text }]}>{centerValue}</Text> : null}
            {centerLabel ? <Text style={[styles.centerLabel, { color: theme?.textMuted }]}>{centerLabel}</Text> : null}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centerOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  centerValue: { fontSize: 15, fontWeight: "800", fontFamily: "monospace" },
  centerLabel: { fontSize: 9, marginTop: 2 },
});
