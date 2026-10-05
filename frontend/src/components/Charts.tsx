import React, { useState } from "react";
import { LayoutChangeEvent, Text, View } from "react-native";
import Svg, { Circle, Line, Path, Polyline, Text as SvgText } from "react-native-svg";

import type { DayPoint } from "@/src/api";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

/** Line chart for a daily series. Width adapts to container; readable at 360px. */
export function TrendLine({ points, height = 140, testID }: { points: DayPoint[]; height?: number; testID?: string }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));

  const padL = 28;
  const padR = 8;
  const padT = 10;
  const padB = 24;
  const max = Math.max(1, ...points.map((p) => p.total));
  const innerW = Math.max(0, width - padL - padR);
  const innerH = height - padT - padB;
  const step = points.length > 1 ? innerW / (points.length - 1) : 0;
  const xy = points.map((p, i) => ({ x: padL + i * step, y: padT + innerH - (p.total / max) * innerH, p }));
  const poly = xy.map((d) => `${d.x},${d.y}`).join(" ");
  const area = xy.length ? `M${xy[0].x},${padT + innerH} L${poly.replace(/ /g, " L")} L${xy[xy.length - 1].x},${padT + innerH} Z` : "";
  const labelEvery = points.length > 8 ? Math.ceil(points.length / 5) : 1;

  return (
    <View onLayout={onLayout} style={styles.chartWrap} testID={testID} accessibilityLabel={`Trend over ${points.length} days, peak ${max}`}>
      {width > 0 && (
        <Svg width={width} height={height}>
          {[0, 0.5, 1].map((f) => (
            <Line key={f} x1={padL} x2={width - padR} y1={padT + innerH - f * innerH} y2={padT + innerH - f * innerH} stroke={colors.border} strokeWidth={1} strokeDasharray={f === 0 ? undefined : "3 4"} opacity={0.5} />
          ))}
          <SvgText x={0} y={padT + 4} fill={colors.muted} fontSize={10} fontFamily={fonts.mono}>
            {max}
          </SvgText>
          <SvgText x={0} y={padT + innerH + 3} fill={colors.muted} fontSize={10} fontFamily={fonts.mono}>
            0
          </SvgText>
          {area ? <Path d={area} fill={colors.brandSecondary} opacity={0.35} /> : null}
          <Polyline points={poly} fill="none" stroke={colors.onSurface} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          {xy.map((d, i) => (
            <React.Fragment key={d.p.date}>
              {d.p.total > 0 && <Circle cx={d.x} cy={d.y} r={3.5} fill={colors.brandPrimary} stroke={colors.surface} strokeWidth={1.5} />}
              {(i === xy.length - 1 || (i % labelEvery === 0 && xy.length - 1 - i >= 2)) && (
                <SvgText x={d.x} y={height - 6} fill={colors.muted} fontSize={10} fontFamily={fonts.mono} textAnchor={i === 0 ? "start" : i === xy.length - 1 ? "end" : "middle"}>
                  {d.p.label}
                </SvgText>
              )}
            </React.Fragment>
          ))}
        </Svg>
      )}
    </View>
  );
}

/** Stacked daily bars: real (ink) + demo (muted). */
export function DailyBars({ points, height = 140, testID }: { points: DayPoint[]; height?: number; testID?: string }) {
  const styles = useStyles();
  const max = Math.max(1, ...points.map((p) => p.total));
  return (
    <View testID={testID} accessibilityLabel={`Registrations per day, peak ${max}`}>
      <View style={[styles.barsRow, { height }]}>
        {points.map((p) => (
          <View key={p.date} style={styles.barCol}>
            <View style={styles.barStack}>
              <View style={[styles.barDemo, { height: `${(p.demo / max) * 100}%` }]} />
              <View style={[styles.barReal, { height: `${(p.real / max) * 100}%` }]} />
            </View>
          </View>
        ))}
      </View>
      <View style={styles.barLabels}>
        {[points[0], points[Math.floor((points.length - 1) / 2)], points[points.length - 1]].filter(Boolean).map((p, i) => (
          <Text key={`${p.date}-${i}`} style={styles.barLabel}>
            {p.label}
          </Text>
        ))}
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, styles.swatchReal]} />
          <Text style={styles.legendText}>Real</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, styles.swatchDemo]} />
          <Text style={styles.legendText}>Demo data</Text>
        </View>
        <Text style={styles.legendText}>Peak {max}/day</Text>
      </View>
    </View>
  );
}

/** Horizontal bar row for rankings / funnels. */
export function HBar({ label, value, max, sub, highlight, testID }: { label: string; value: number; max: number; sub?: string; highlight?: boolean; testID?: string }) {
  const styles = useStyles();
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <View style={styles.hbar} testID={testID} accessibilityLabel={`${label}: ${value}`}>
      <View style={styles.hbarTop}>
        <Text style={styles.hbarLabel} numberOfLines={2}>
          {label}
        </Text>
        <Text style={styles.hbarValue}>{value}</Text>
      </View>
      <View style={styles.hbarTrack}>
        <View style={[styles.hbarFill, highlight && styles.hbarFillHighlight, { width: `${pct}%` }]} />
      </View>
      {sub ? <Text style={styles.hbarSub}>{sub}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  chartWrap: { width: "100%" },
  barsRow: { flexDirection: "row", alignItems: "flex-end", gap: 3, borderBottomWidth: 2, borderBottomColor: colors.border },
  barCol: { flex: 1, height: "100%", justifyContent: "flex-end" },
  barStack: { width: "100%", height: "100%", justifyContent: "flex-end" },
  barReal: { backgroundColor: colors.onSurface, width: "100%" },
  barDemo: { backgroundColor: colors.muted, width: "100%", opacity: 0.55 },
  barLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  barLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.muted },
  legend: { flexDirection: "row", gap: spacing.md, alignItems: "center", marginTop: spacing.sm, flexWrap: "wrap" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: radius.sm },
  swatchReal: { backgroundColor: colors.onSurface },
  swatchDemo: { backgroundColor: colors.muted, opacity: 0.55 },
  legendText: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted },
  hbar: { gap: 4 },
  hbarTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: spacing.sm },
  hbarLabel: { flex: 1, fontFamily: fonts.medium, fontSize: 14, color: colors.onSurface },
  hbarValue: { fontFamily: fonts.monoBold, fontSize: 16, color: colors.onSurface },
  hbarTrack: { height: 12, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.trackEmpty, overflow: "hidden" },
  hbarFill: { height: "100%", backgroundColor: colors.onSurface },
  hbarFillHighlight: { backgroundColor: colors.brandPrimary },
  hbarSub: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
}));
