import { Link } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";

import { fonts, makeStyles, spacing } from "@/src/theme";

export function Footer({ text }: { text?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.wrap} testID="app-footer">
      <Text style={styles.text}>{text ?? "Concept prototype built for a growth challenge"}</Text>
      <Text style={styles.sub}>Not affiliated with any company or institution. No data is sold or shared.</Text>
      <Link href="/admin" asChild>
        <Pressable testID="footer-admin-link" accessibilityRole="link" accessibilityLabel="Organiser admin" style={({ focused }: any) => [styles.adminLink, focused && styles.focused]}>
          <Text style={styles.adminText}>Organiser admin</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { paddingVertical: spacing.xl, gap: spacing.xs, borderTopWidth: 2, borderTopColor: colors.border, borderStyle: "dashed" },
  text: { fontFamily: fonts.medium, fontSize: 13, color: colors.onSurface },
  sub: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted, lineHeight: 16 },
  adminLink: { alignSelf: "flex-start", minHeight: 44, justifyContent: "center" },
  adminText: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted, textDecorationLine: "underline" },
  focused: { outlineStyle: "solid", outlineWidth: 3, outlineColor: colors.focus, outlineOffset: 2 } as any,
}));
