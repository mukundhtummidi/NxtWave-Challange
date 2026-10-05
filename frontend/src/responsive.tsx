// Shared responsive layout helper. One place for breakpoint logic so pages
// don't repeat window-dimension math. Mobile (<768px) layout is unchanged;
// at >=768px pages opt into real multi-column layouts up to 1100px wide.
import React from "react";
import { StyleProp, useWindowDimensions, View, ViewStyle } from "react-native";

import { spacing } from "@/src/theme";

export const BREAKPOINTS = { md: 768, xl: 1280 } as const;

export function useBreakpoint() {
  const { width } = useWindowDimensions();
  return {
    width,
    /** two-column threshold: tablets and up */
    isWide: width >= BREAKPOINTS.md,
    /** laptop / desktop */
    isDesktop: width >= BREAKPOINTS.xl,
  };
}

type PageContainerProps = {
  children: React.ReactNode;
  /** max width below 768px — keeps each page's current mobile/tablet sizing */
  maxWidth?: number;
  /** max width at 768px and above */
  wideMaxWidth?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Centered page body. Narrow screens keep the page's existing max width;
 *  wide screens grow up to `wideMaxWidth` (default 1100) so columns have room. */
export function PageContainer({ children, maxWidth = 560, wideMaxWidth = 1100, style, testID }: PageContainerProps) {
  const { isWide } = useBreakpoint();
  return (
    <View
      testID={testID}
      style={[{ width: "100%", alignSelf: "center", gap: spacing.xl, maxWidth: isWide ? wideMaxWidth : maxWidth }, style]}
    >
      {children}
    </View>
  );
}
