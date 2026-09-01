import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Rect } from "react-native-svg";

// A simple grouped/single-series bar chart. `data` is
// [{ label, value, color? }]. No chart library needed -- built directly on
// react-native-svg, which the project already depends on.
export default function BarChart({ data, height = 140, barColor, theme }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const barWidth = 22;
  const gap = 14;
  const width = data.length * (barWidth + gap) + gap;
  const chartHeight = height - 24; // leave room for the value/label text

  return (
    <View>
      <Svg width={width} height={height}>
        {data.map((d, i) => {
          const barHeight = max > 0 ? (d.value / max) * chartHeight : 0;
          const x = gap + i * (barWidth + gap);
          const y = chartHeight - barHeight;
          return (
            <Rect
              key={i}
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(2, barHeight)}
              rx={4}
              fill={d.color || barColor || theme?.text || "#333"}
            />
          );
        })}
      </Svg>
      <View style={[styles.labelRow, { width }]}>
        {data.map((d, i) => (
          <Text key={i} style={[styles.label, { width: barWidth + gap, color: theme?.textMuted }]} numberOfLines={1}>
            {d.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: { flexDirection: "row", marginTop: 2 },
  label: { fontSize: 8.5, textAlign: "center" },
});
