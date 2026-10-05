// Design tokens for "Your Hall Ticket". Light + dark (exam-hall paper look).
// Keys match the "color" block of /app/design_guidelines.json.
//
// Usage:
//   const useStyles = makeStyles((colors) => ({ card: { backgroundColor: colors.surfaceSecondary } }));
//   const { colors } = useTheme();  // for icon colors, placeholderTextColor, etc.

import { useMemo, useSyncExternalStore } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  surface: "#F4F4F0", // off-white paper
  onSurface: "#0A1128", // deep ink blue
  surfaceSecondary: "#FFFFFF",
  onSurfaceSecondary: "#0A1128",
  surfaceTertiary: "#E5E5E0",
  onSurfaceTertiary: "#0A1128",
  surfaceInverse: "#0A1128",
  onSurfaceInverse: "#F4F4F0",
  muted: "#4B5563",

  brand: "#0A1128",
  onBrand: "#FFFFFF",
  brandPrimary: "#D92D20", // stamp red
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#FCE83A", // highlighter yellow
  onBrandSecondary: "#0A1128",
  brandTertiary: "#FCE83A",
  onBrandTertiary: "#0A1128",

  success: "#D92D20",
  onSuccess: "#FFFFFF",
  warning: "#FCE83A",
  onWarning: "#0A1128",
  error: "#D92D20",
  onError: "#FFFFFF",
  info: "#0A1128",
  onInfo: "#F4F4F0",

  border: "#0A1128",
  borderStrong: "#0A1128",
  divider: "#0A1128",

  // extras
  paper: "#FAFAF6", // ticket card paper
  paperLine: "#C9C9C0", // dashed perforation
  stamp: "#D92D20",
  focus: "#FCE83A", // focus ring
  trackEmpty: "#E5E5E0",
};

const dark: typeof light = {
  surface: "#0F141E",
  onSurface: "#F4F4F0",
  surfaceSecondary: "#1A202C",
  onSurfaceSecondary: "#F4F4F0",
  surfaceTertiary: "#2D3748",
  onSurfaceTertiary: "#F4F4F0",
  surfaceInverse: "#F4F4F0",
  onSurfaceInverse: "#0F141E",
  muted: "#A0AEC0",

  brand: "#F4F4F0",
  onBrand: "#0F141E",
  brandPrimary: "#FF4D4D",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#FCE83A",
  onBrandSecondary: "#0F141E",
  brandTertiary: "#FCE83A",
  onBrandTertiary: "#0F141E",

  success: "#FF4D4D",
  onSuccess: "#FFFFFF",
  warning: "#FCE83A",
  onWarning: "#0F141E",
  error: "#FF4D4D",
  onError: "#FFFFFF",
  info: "#F4F4F0",
  onInfo: "#0F141E",

  border: "#4A5568",
  borderStrong: "#F4F4F0",
  divider: "#4A5568",

  paper: "#1A202C",
  paperLine: "#4A5568",
  stamp: "#FF4D4D",
  focus: "#FCE83A",
  trackEmpty: "#2D3748",
};

export type ThemeColors = typeof light;

export const defaultScheme = "light" satisfies ColorScheme;

export const themes: { light: ThemeColors; dark?: ThemeColors } = { light, dark };

export const fonts = {
  regular: "SpaceGrotesk-Regular",
  medium: "SpaceGrotesk-Medium",
  bold: "SpaceGrotesk-Bold",
  mono: "JetBrainsMono-Regular",
  monoBold: "JetBrainsMono-Bold",
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, "2xl": 32, "3xl": 48 } as const;
export const radius = { sm: 0, md: 4, lg: 8, pill: 999 } as const;
export const type = { sm: 12, base: 14, lg: 16, xl: 20, "2xl": 24, "3xl": 32, "4xl": 48 } as const;

// Scheme override store (works on web too, where Appearance.setColorScheme is a no-op).
let override: ColorScheme | null = null;
const listeners = new Set<() => void>();

export function setColorScheme(scheme: ColorScheme | null) {
  override = scheme;
  Appearance.setColorScheme?.(scheme ?? "unspecified");
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme() as string | null;
  const forced = useSyncExternalStore(subscribe, () => override, () => override);
  const scheme: ColorScheme = forced ?? (system === "dark" && themes.dark ? "dark" : system === "light" ? "light" : defaultScheme);
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
