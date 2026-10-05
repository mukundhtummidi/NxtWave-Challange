import Ionicons from "@react-native-vector-icons/ionicons";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { FAQ, FaqItem } from "@/src/faq";
import { useBreakpoint } from "@/src/responsive";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const LAPTOP = 1024;

/** Accessible accordion. Each question is a button with aria-expanded / aria-controls;
 *  Enter and Space toggle it (native button keyboard behaviour on web). Two columns at >= 1024px. */
export function Faq() {
  const styles = useStyles();
  const { width } = useBreakpoint();
  const twoCol = width >= LAPTOP;
  const [open, setOpen] = useState<Set<number>>(new Set());

  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const half = Math.ceil(FAQ.length / 2);
  const columns = twoCol ? [FAQ.slice(0, half), FAQ.slice(half)] : [FAQ];

  return (
    <View style={styles.section} testID="faq-section" nativeID="faq">
      <Text style={styles.title} accessibilityRole="header" aria-level={2}>
        Questions students ask
      </Text>
      <View style={[styles.cols, twoCol && styles.colsWide]}>
        {columns.map((col, c) => (
          <View key={c} style={[styles.col, twoCol && styles.colWide]}>
            {col.map((item, j) => {
              const i = c * half + j;
              return <FaqRow key={i} index={i} item={item} open={open.has(i)} onToggle={() => toggle(i)} />;
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

function FaqRow({ index, item, open, onToggle }: { index: number; item: FaqItem; open: boolean; onToggle: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const qId = `faq-q-${index}`;
  const panelId = `faq-a-${index}`;
  return (
    <View style={[styles.item, open && styles.itemOpen]}>
      <Pressable
        testID={`faq-question-${index + 1}`}
        nativeID={qId}
        accessibilityRole="button"
        aria-expanded={open}
        aria-controls={panelId}
        onPress={onToggle}
        style={({ focused, hovered }: any) => [styles.q, hovered && styles.qHover, focused && styles.focused]}
      >
        <Text style={styles.qText}>{item.q}</Text>
        <Ionicons name={open ? "remove" : "add"} size={20} color={colors.onSurfaceSecondary} />
      </Pressable>
      {open && (
        <View nativeID={panelId} role="region" aria-labelledby={qId} style={styles.panel} testID={`faq-answer-${index + 1}`}>
          <Text style={styles.aText}>{item.a}</Text>
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  section: { width: "100%", maxWidth: 1100, alignSelf: "center", gap: spacing.md, marginTop: spacing.xl },
  title: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 28, color: colors.onSurface },
  cols: { gap: spacing.sm },
  colsWide: { flexDirection: "row", alignItems: "flex-start", gap: spacing.lg },
  col: { gap: spacing.sm, width: "100%" },
  colWide: { flex: 1, minWidth: 0 },
  item: { borderWidth: 2, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, overflow: "visible" },
  itemOpen: { borderColor: colors.borderStrong },
  q: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md },
  qHover: { opacity: 0.9 },
  qText: { flex: 1, fontFamily: fonts.bold, fontSize: 15, lineHeight: 20, color: colors.onSurfaceSecondary },
  panel: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  aText: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: colors.onSurfaceSecondary },
  focused: { outlineStyle: "solid", outlineWidth: 3, outlineColor: colors.focus, outlineOffset: 2 } as any,
}));
