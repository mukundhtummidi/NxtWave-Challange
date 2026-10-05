import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, ApiError, getAdminToken } from "@/src/api";
import { Button } from "@/src/components/Button";
import { Field } from "@/src/components/Field";
import { Footer } from "@/src/components/Footer";
import { Header } from "@/src/components/Header";
import { StatsPanels } from "@/src/components/StatsPanels";
import { useToast } from "@/src/components/Toast";
import { PageContainer } from "@/src/responsive";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function AdminScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [includeDemo, setIncludeDemo] = useState(true);

  useEffect(() => {
    (async () => {
      if (!(await getAdminToken())) return setAuthed(false);
      try {
        await api.adminMe();
        setAuthed(true);
      } catch {
        setAuthed(false);
      }
    })();
  }, []);

  const login = useMutation({
    mutationFn: () => api.adminLogin(password),
    onSuccess: () => {
      setPassword("");
      setAuthed(true);
    },
    onError: (e: ApiError) => toast.show(e.status === 401 ? "Incorrect password" : e.status === 429 ? "Too many attempts, wait a few minutes" : "Sign-in failed", "error"),
  });

  const logout = async () => {
    await api.adminLogout();
    qc.removeQueries({ queryKey: ["admin-stats"] });
    setAuthed(false);
  };

  return (
    <View style={styles.screen} testID="admin-screen">
      <Header />
      {authed === null && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.onSurface} />
        </View>
      )}
      {authed === false && (
        <KeyboardAwareScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]} bottomOffset={24} keyboardShouldPersistTaps="handled">
          <View style={[styles.container, styles.loginBox]} testID="admin-login">
            <Ionicons name="lock-closed-outline" size={28} color={colors.onSurface} />
            <Text style={styles.h1}>Organiser admin</Text>
            <Text style={styles.sub}>Locked. Enter the admin password to see registrations, sources, funnel and exports. Every other page stays public.</Text>
            <Field label="Password" testID="admin-password-input" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} placeholder="Admin password" onSubmitEditing={() => password && login.mutate()} returnKeyType="go" />
            <Button testID="admin-login-button" title="Sign in" variant="ink" onPress={() => login.mutate()} loading={login.isPending} disabled={!password} />
            <Text style={styles.fineprint}>Stays signed in on this device for 7 days.</Text>
          </View>
        </KeyboardAwareScrollView>
      )}
      {authed && <Dashboard includeDemo={includeDemo} setIncludeDemo={setIncludeDemo} onLogout={logout} onExpired={() => setAuthed(false)} />}
    </View>
  );
}

function Dashboard({ includeDemo, setIncludeDemo, onLogout, onExpired }: { includeDemo: boolean; setIncludeDemo: (v: boolean) => void; onLogout: () => void; onExpired: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const statsQ = useQuery({ queryKey: ["admin-stats", includeDemo], queryFn: () => api.adminStats(includeDemo), refetchInterval: 30_000, retry: false });

  useEffect(() => {
    if (statsQ.error && (statsQ.error as ApiError).status === 401) onExpired();
  }, [statsQ.error, onExpired]);

  const s = statsQ.data;

  const exportCsv = async () => {
    const url = await api.adminExportUrl(includeDemo);
    if (Platform.OS === "web") {
      const a = document.createElement("a");
      a.href = url;
      a.download = "registrations.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } else {
      Linking.openURL(url);
    }
    toast.show("CSV export started");
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
      <PageContainer maxWidth={640} style={styles.containerGap}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>Organiser admin</Text>
          <Text style={styles.h1}>Registrations</Text>
          <View style={styles.toolbar}>
            <View style={styles.segment} accessibilityRole="radiogroup">
              {[
                { v: true, label: "All data" },
                { v: false, label: "Real only" },
              ].map((o) => (
                <Pressable key={o.label} testID={o.v ? "admin-scope-all" : "admin-scope-real"} accessibilityRole="radio" accessibilityState={{ selected: includeDemo === o.v }} onPress={() => setIncludeDemo(o.v)} style={({ focused }: any) => [styles.segItem, includeDemo === o.v && styles.segItemActive, focused && styles.focused]}>
                  <Text style={[styles.segText, includeDemo === o.v && styles.segTextActive]}>{o.label}</Text>
                </Pressable>
              ))}
            </View>
            <Button testID="admin-export-button" title="Export CSV" variant="outline" small onPress={exportCsv} icon={<Ionicons name="download-outline" size={16} color={colors.onSurface} />} />
            <Button testID="admin-logout-button" title="Sign out" variant="ghost" small onPress={onLogout} />
          </View>
        </View>

        {statsQ.isLoading && (
          <View style={styles.center} testID="admin-loading">
            <ActivityIndicator color={colors.onSurface} />
          </View>
        )}
        {statsQ.isError && (statsQ.error as ApiError).status !== 401 && (
          <View style={styles.center} testID="admin-error">
            <Text style={styles.sub}>Could not load stats.</Text>
          </View>
        )}

        {s?.attendance && (
          <View style={styles.attCard} testID="admin-attendance">
            <Text style={styles.attKicker}>Attendance</Text>
            <View style={styles.attRow}>
              <View style={styles.attStat}>
                <Text style={styles.attValue} testID="admin-attendance-checked-in">
                  {s.attendance.checked_in}
                </Text>
                <Text style={styles.sub}>checked in of {s.attendance.registered} registered</Text>
              </View>
              <View style={styles.attStat}>
                <Text style={styles.attValue} testID="admin-attendance-submissions">
                  {s.attendance.submissions}
                </Text>
                <Text style={styles.sub}>projects submitted ({s.attendance.feedback_unavailable} without feedback)</Text>
              </View>
            </View>
          </View>
        )}
        {s && <StatsPanels s={s} includeDemo={includeDemo} />}
        <Footer />
      </PageContainer>
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  container: { width: "100%", maxWidth: 640, alignSelf: "center", gap: spacing.lg },
  containerGap: { gap: spacing.lg },
  center: { alignItems: "center", paddingVertical: spacing["3xl"] },
  loginBox: { gap: spacing.md, paddingTop: spacing["2xl"], maxWidth: 420 },
  hero: { gap: spacing.sm },
  kicker: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: colors.brandPrimary },
  h1: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 32, color: colors.onSurface },
  sub: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.muted },
  attCard: { borderWidth: 2, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.surfaceSecondary, gap: spacing.sm },
  attKicker: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1.6, textTransform: "uppercase", color: colors.muted },
  attRow: { flexDirection: "row", gap: spacing.lg, flexWrap: "wrap" },
  attStat: { flex: 1, minWidth: 140, gap: 2 },
  attValue: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 32, color: colors.onSurfaceSecondary },
  fineprint: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  note: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16, color: colors.muted },
  toolbar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap", marginTop: spacing.xs },
  segment: { flexDirection: "row", borderWidth: 2, borderColor: colors.border, borderRadius: radius.md, overflow: "hidden" },
  segItem: { height: 36, paddingHorizontal: spacing.md, justifyContent: "center" },
  segItemActive: { backgroundColor: colors.surfaceInverse },
  segText: { fontFamily: fonts.bold, fontSize: 13, color: colors.onSurface },
  segTextActive: { color: colors.onSurfaceInverse },
  focused: { outlineStyle: "solid", outlineWidth: 3, outlineColor: colors.focus, outlineOffset: 2 } as any,
}));
