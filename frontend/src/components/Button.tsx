import React from "react";
import { ActivityIndicator, Pressable, PressableStateCallbackType, StyleProp, Text, View, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";

import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

type Variant = "primary" | "ink" | "outline" | "ghost" | "yellow";

type Props = {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  testID: string;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
  accessibilityLabel?: string;
};

export function Button({ title, onPress, variant = "primary", disabled, loading, testID, icon, style, small, accessibilityLabel }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const bg: Record<Variant, string> = {
    primary: colors.brandPrimary,
    ink: colors.surfaceInverse,
    outline: "transparent",
    ghost: "transparent",
    yellow: colors.brandSecondary,
  };
  const fg: Record<Variant, string> = {
    primary: colors.onBrandPrimary,
    ink: colors.onSurfaceInverse,
    outline: colors.onSurface,
    ghost: colors.onSurface,
    yellow: colors.onBrandSecondary,
  };

  return (
    <Animated.View style={[anim, style]}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel || title}
        accessibilityState={{ disabled: !!disabled || !!loading }}
        disabled={disabled || loading}
        onPress={onPress}
        onPressIn={() => {
          if (!reduce) scale.value = withTiming(0.97, { duration: 80 });
        }}
        onPressOut={() => {
          scale.value = withTiming(1, { duration: 120 });
        }}
        style={(state: PressableStateCallbackType & { focused?: boolean; hovered?: boolean }) => [
          styles.base,
          small && styles.small,
          { backgroundColor: bg[variant], borderColor: variant === "ghost" ? "transparent" : variant === "outline" ? colors.borderStrong : bg[variant] },
          state.hovered && !disabled && styles.hovered,
          state.focused && styles.focused,
          (disabled || loading) && styles.disabled,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={fg[variant]} />
        ) : (
          <View style={styles.row}>
            {icon}
            <Text style={[styles.label, small && styles.labelSmall, { color: fg[variant] }]} numberOfLines={1}>
              {title}
            </Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const useStyles = makeStyles((colors) => ({
  base: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  small: { minHeight: 40, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  label: { fontFamily: fonts.bold, fontSize: 16, letterSpacing: 0.2 },
  labelSmall: { fontSize: 14 },
  hovered: { opacity: 0.92 },
  focused: { outlineStyle: "solid", outlineWidth: 3, outlineColor: colors.focus, outlineOffset: 2 } as any,
  disabled: { opacity: 0.5 },
}));
