import Ionicons from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import { FlatList, Modal, Platform, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { Button } from "@/src/components/Button";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

type Props = {
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
};

const OTHER = "__other__";

export function CollegePicker({ value, onChange, error }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [otherMode, setOtherMode] = useState(false);
  const [custom, setCustom] = useState("");
  const [focused, setFocused] = useState(false);

  const { data } = useQuery({ queryKey: ["colleges"], queryFn: api.colleges, staleTime: Infinity });
  const colleges = data?.colleges ?? [];

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return colleges;
    const words = needle.split(/\s+/);
    return colleges.filter((c) => {
      const lc = c.toLowerCase();
      return words.every((w) => lc.includes(w));
    });
  }, [q, colleges]);

  const close = () => {
    setOpen(false);
    setOtherMode(false);
    setQ("");
  };

  const pick = (name: string) => {
    onChange(name);
    close();
  };

  const rows = otherMode ? [] : [...filtered.slice(0, 80), OTHER];

  return (
    <View style={styles.wrap}>
      <Text style={styles.label} nativeID="college-label">
        College
      </Text>
      <Pressable
        testID="college-picker-button"
        accessibilityRole="button"
        accessibilityLabel={value ? `College: ${value}. Change college` : "Choose your college"}
        accessibilityLabelledBy="college-label"
        onPress={() => setOpen(true)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.trigger, focused && styles.focused, !!error && styles.triggerError]}
      >
        <Text style={[styles.triggerText, !value && styles.placeholder]} numberOfLines={1}>
          {value || "Search your college"}
        </Text>
        <Ionicons name="search" size={18} color={colors.onSurface} />
      </Pressable>
      {error ? (
        <Text style={styles.error} testID="college-error">
          {error}
        </Text>
      ) : (
        <Text style={styles.hint}>A few hundred colleges listed. Not there? Pick "Other" and type it.</Text>
      )}

      <Modal visible={open} animationType="slide" onRequestClose={close} presentationStyle="pageSheet">
        <View style={[styles.sheet, { paddingTop: Platform.OS === "ios" ? spacing.lg : insets.top + spacing.sm, paddingBottom: insets.bottom }]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{otherMode ? "Type your college" : "Find your college"}</Text>
            <Pressable testID="college-picker-close" accessibilityRole="button" accessibilityLabel="Close" onPress={close} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={colors.onSurface} />
            </Pressable>
          </View>

          {otherMode ? (
            <View style={styles.otherWrap}>
              <TextInput
                testID="college-other-input"
                accessibilityLabel="College name"
                autoFocus
                value={custom}
                onChangeText={setCustom}
                placeholder="e.g. Govt Engineering College, Idukki"
                placeholderTextColor={colors.muted}
                style={styles.search}
                maxLength={120}
                returnKeyType="done"
                onSubmitEditing={() => custom.trim().length >= 2 && pick(custom.trim())}
              />
              <Button testID="college-other-save" title="Use this college" onPress={() => pick(custom.trim())} disabled={custom.trim().length < 2} variant="ink" />
              <Button testID="college-other-back" title="Back to search" onPress={() => setOtherMode(false)} variant="ghost" />
            </View>
          ) : (
            <>
              <TextInput
                testID="college-search-input"
                accessibilityLabel="Search colleges"
                autoFocus
                value={q}
                onChangeText={setQ}
                placeholder="Type a name, city or short form (e.g. NIT, Amrita)"
                placeholderTextColor={colors.muted}
                style={styles.search}
                autoCorrect={false}
                autoCapitalize="none"
              />
              <FlatList
                testID="college-list"
                data={rows}
                keyExtractor={(item) => item}
                keyboardShouldPersistTaps="handled"
                initialNumToRender={20}
                renderItem={({ item }) =>
                  item === OTHER ? (
                    <Pressable
                      testID="college-option-other"
                      accessibilityRole="button"
                      onPress={() => {
                        setCustom(q);
                        setOtherMode(true);
                      }}
                      style={({ focused }: any) => [styles.row, styles.otherRow, focused && styles.focused]}
                    >
                      <Ionicons name="create-outline" size={18} color={colors.onBrandSecondary} />
                      <Text style={[styles.rowText, styles.otherText]}>Other, type your own{q ? ` ("${q}")` : ""}</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      testID={`college-option-${item.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                      accessibilityRole="button"
                      onPress={() => pick(item)}
                      style={({ focused }: any) => [styles.row, item === value && styles.rowSelected, focused && styles.focused]}
                    >
                      <Text style={styles.rowText}>{item}</Text>
                      {item === value && <Ionicons name="checkmark" size={18} color={colors.onSurface} />}
                    </Pressable>
                  )
                }
                ListEmptyComponent={null}
              />
            </>
          )}
        </View>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { gap: spacing.xs },
  label: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase", color: colors.onSurface },
  trigger: {
    minHeight: 48,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  triggerError: { borderColor: colors.error },
  triggerText: { flex: 1, fontFamily: fonts.medium, fontSize: 16, color: colors.onSurfaceSecondary },
  placeholder: { color: colors.muted },
  hint: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  error: { fontFamily: fonts.medium, fontSize: 12, color: colors.error },
  focused: { outlineStyle: "solid", outlineWidth: 3, outlineColor: colors.focus, outlineOffset: 1 } as any,
  sheet: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: spacing.lg },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: spacing.md },
  sheetTitle: { fontFamily: fonts.bold, fontSize: 20, color: colors.onSurface },
  closeBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.borderStrong, borderRadius: radius.md },
  search: {
    minHeight: 48,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.onSurfaceSecondary,
    backgroundColor: colors.surfaceSecondary,
    marginBottom: spacing.md,
  },
  row: {
    minHeight: 48,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  rowSelected: { backgroundColor: colors.surfaceTertiary },
  rowText: { flex: 1, fontFamily: fonts.medium, fontSize: 15, color: colors.onSurface },
  otherRow: { backgroundColor: colors.brandSecondary, borderBottomWidth: 0, marginTop: spacing.sm, borderRadius: radius.md, justifyContent: "flex-start" },
  otherText: { color: colors.onBrandSecondary, fontFamily: fonts.bold },
  otherWrap: { gap: spacing.md },
}));
