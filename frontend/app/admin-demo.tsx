import Ionicons from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import React from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { Footer } from "@/src/components/Footer";
import { Header } from "@/src/components/Header";
import { StatsPanels } from "@/src/components/StatsPanels";
import { PageContainer } from "@/src/responsive";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

/** Public, read-only copy of the organiser dashboards fed by demo data only. No login, no export, no toggles. */
export default function AdminDemoScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const statsQ = useQuery({ queryKey: ["admin-demo-stats"], queryFn: api.adminDemoStats, refetchInterval: 60_000 });
  const s = statsQ.data;

  return (
    <View style={styles.screen} testID="admin-demo-screen">
      <Header />
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
        <PageContainer maxWidth={640} style={styles.containerGap}>
          <View style={styles.banner} testID="admin-demo-banner" accessibilityRole="alert">
            <Ionicons name="eye-outline" size={18} color={colors.onBrandSecondary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerTitle}>Demo data, read-only</Text>
              <Text style={styles.bannerText}>Every number on this page comes from seeded demo rows (is_demo = true). No real students, names or emails are shown. The live organiser admin at /admin stays password-locked.</Text>
            </View>
          </View>

          <View style={styles.hero}>
            <Text style={styles.kicker}>Organiser admin · demo</Text>
            <Text style={styles.h1}>Registrations</Text>
          </View>

          {statsQ.isLoading && (
            <View style={styles.center} testID="admin-demo-loading">
              <ActivityIndicator color={colors.onSurface} />
            </View>
          )}
          {statsQ.isError && (
            <View style={styles.center} testID="admin-demo-error">
              <Text style={styles.sub}>Could not load demo stats.</Text>
            </View>
          )}
          {s && <StatsPanels s={s} includeDemo demoOnly />}
          <Footer />
        </PageContainer>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  container: { width: "100%", maxWidth: 640, alignSelf: "center", gap: spacing.lg },
  containerGap: { gap: spacing.lg },
  center: { alignItems: "center", paddingVertical: spacing["3xl"] },
  banner: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, backgroundColor: colors.brandSecondary, borderWidth: 2, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
  bannerTitle: { fontFamily: fonts.bold, fontSize: 14, letterSpacing: 1, textTransform: "uppercase", color: colors.onBrandSecondary },
  bannerText: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.onBrandSecondary, marginTop: 2 },
  hero: { gap: spacing.sm },
  kicker: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: colors.brandPrimary },
  h1: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 32, color: colors.onSurface },
  sub: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.muted },
}));
