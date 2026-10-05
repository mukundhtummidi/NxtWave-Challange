import React, { useState } from "react";
import { Text, TextInput, TextInputProps, View } from "react-native";

import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

type Props = TextInputProps & {
  label: string;
  hint?: string;
  error?: string | null;
  testID: string;
};

export function Field({ label, hint, error, testID, style, ...rest }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      <Text style={styles.label} nativeID={`${testID}-label`}>
        {label}
      </Text>
      <TextInput
        testID={testID}
        accessibilityLabel={label}
        accessibilityLabelledBy={`${testID}-label`}
        placeholderTextColor={colors.muted}
        onFocus={(e) => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          rest.onBlur?.(e);
        }}
        style={[styles.input, focused && styles.inputFocused, !!error && styles.inputError, style]}
        {...rest}
      />
      {error ? (
        <Text style={styles.error} testID={`${testID}-error`} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { gap: spacing.xs },
  label: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase", color: colors.onSurface },
  input: {
    minHeight: 48,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.onSurfaceSecondary,
    backgroundColor: colors.surfaceSecondary,
  },
  inputFocused: { outlineStyle: "solid", outlineWidth: 3, outlineColor: colors.focus, outlineOffset: 1 } as any,
  inputError: { borderColor: colors.error },
  hint: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  error: { fontFamily: fonts.medium, fontSize: 12, color: colors.error },
}));
