import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { fonts, makeStyles, radius, spacing } from "@/src/theme";

type Props = {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  testID: string;
};

export function ChipRow({ label, options, value, onChange, testID }: Props) {
  const styles = useStyles();
  return (
    <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text style={styles.label}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={styles.scroller}>
        {options.map((opt) => {
          const selected = opt === value;
          return (
            <Pressable
              key={opt}
              testID={`${testID}-${opt.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
              accessibilityRole="radio"
              accessibilityState={{ selected, checked: selected }}
              onPress={() => onChange(opt)}
              style={({ focused }: any) => [styles.chip, selected && styles.chipSelected, focused && styles.focused]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]} numberOfLines={1}>
                {opt}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { gap: spacing.xs },
  label: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase", color: colors.onSurface },
  scroller: { height: 48, flexGrow: 0 },
  row: { gap: spacing.sm, alignItems: "center", paddingVertical: 6 },
  chip: {
    height: 36,
    flexShrink: 0,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceSecondary,
    justifyContent: "center",
  },
  chipSelected: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  chipText: { fontFamily: fonts.medium, fontSize: 14, color: colors.onSurfaceSecondary },
  chipTextSelected: { color: colors.onSurfaceInverse },
  focused: { outlineStyle: "solid", outlineWidth: 3, outlineColor: colors.focus, outlineOffset: 2 } as any,
}));
