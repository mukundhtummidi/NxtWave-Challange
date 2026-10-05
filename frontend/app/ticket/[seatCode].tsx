import Ionicons from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from "react-native";
import Animated, { FadeInDown, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, ApiError } from "@/src/api";
import { Button } from "@/src/components/Button";
import { Footer } from "@/src/components/Footer";
import { HallTicket } from "@/src/components/HallTicket";
import { Header } from "@/src/components/Header";
import { ShareSheet } from "@/src/components/ShareSheet";
import { useToast } from "@/src/components/Toast";
import { MY_SEAT_KEY } from "@/src/referral";
import { MilestoneBadges, MyReferrals, AddToCalendar } from "@/src/components/ReferralPanel";
import { PageContainer, useBreakpoint } from "@/src/responsive";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { storage } from "@/src/utils/storage";

export default function TicketScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { isWide } = useBreakpoint();
  const router = useRouter();
  const toast = useToast();
  const reduce = useReducedMotion();
  const { seatCode, fresh } = useLocalSearchParams<{ seatCode: string; fresh?: string }>();
  const code = (seatCode || "").toUpperCase();
  const [isMine, setIsMine] = useState(false);

  const { data: config } = useQuery({ queryKey: ["config"], queryFn: api.config, staleTime: Infinity });
  const ticketQ = useQuery({ queryKey: ["ticket", code], queryFn: () => api.ticket(code), enabled: !!code, retry: (n, err) => (err as ApiError).status !== 404 && n < 2 });

  useEffect(() => {
    storage.getItem(MY_SEAT_KEY, null).then((v) => setIsMine(v === code));
  }, [code]);

  useEffect(() => {
    if (Platform.OS === "web" && ticketQ.data) {
      document.title = `${ticketQ.data.name} · Seat ${ticketQ.data.seat_code} · Your Hall Ticket`;
    }
  }, [ticketQ.data]);

  const workshop = config?.workshop;
  const t = ticketQ.data;

  const headerBlock = t ? (
    <Animated.View entering={reduce ? undefined : FadeInDown.duration(300)} style={styles.topRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.kicker}>{isMine ? (fresh ? "Seat confirmed" : "Your hall ticket") : `${t.name.split(" ")[0]}'s hall ticket`}</Text>
        <Text style={styles.h2}>{isMine ? (fresh ? "You're in. Keep this safe." : "See you in the hall.") : "Grab the seat next to them."}</Text>
      </View>
      {t.is_demo && (
        <View style={styles.demoTag} testID="ticket-demo-label">
          <Text style={styles.demoTagText}>Demo data</Text>
        </View>
      )}
    </Animated.View>
  ) : null;

  const ticketBlock = t ? (
    <HallTicket
      draft={{ name: t.name, college: t.college, branch: t.branch, year: t.year, seatCode: t.seat_code, project: t.project }}
      workshop={workshop}
      registered
      animateStamp={!!fresh}
    />
  ) : null;

  const badgesBlock = t && isMine ? <MilestoneBadges count={t.referral_count} /> : null;

  const shareBlock = t ? (
    isMine ? (
      <>
        {t.referral_count > 0 && (
          <View style={styles.refCount} testID="referral-count">
            <Ionicons name="people" size={16} color={colors.onBrandSecondary} />
            <Text style={styles.refCountText}>
              {t.referral_count} {t.referral_count === 1 ? "friend has" : "friends have"} registered with your link
            </Text>
          </View>
        )}
        <ShareSheet ticket={t} workshop={workshop} onToast={(m, kind) => toast.show(m, kind)} />
        <MyReferrals seatCode={t.seat_code} />
        {workshop && <AddToCalendar workshop={workshop} link={t.share_url} onToast={(m) => toast.show(m)} />}
      </>
    ) : (
      <View style={styles.cta} testID="visitor-cta">
        <Text style={styles.ctaTitle}>Want your own seat?</Text>
        <Text style={[styles.muted, { textAlign: "left" }]}>Free, 60 minutes, online. You'll get a project matched to your branch and interest.</Text>
        <Button testID="visitor-register-button" title="Get my hall ticket" onPress={() => router.push({ pathname: "/", params: { ref: t.seat_code } })} />
      </View>
    )
  ) : null;

  const boardLinkBlock = t ? (
    <Pressable testID="ticket-board-link" accessibilityRole="link" onPress={() => router.push("/board")} style={({ focused }: any) => [styles.boardLink, focused && styles.focused]}>
      <Ionicons name="podium-outline" size={18} color={colors.onSurface} />
      <Text style={styles.boardLinkText}>See how {t.college} is doing on the campus board →</Text>
    </Pressable>
  ) : null;

  return (
    <View style={styles.screen} testID="ticket-screen">
      <Header />
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
        <PageContainer maxWidth={560}>
          {ticketQ.isLoading && (
            <View style={styles.center} testID="ticket-loading">
              <ActivityIndicator color={colors.onSurface} />
              <Text style={styles.muted}>Fetching seat {code}…</Text>
            </View>
          )}

          {ticketQ.isError && (
            <View style={styles.center} testID="ticket-not-found">
              <Ionicons name="document-text-outline" size={40} color={colors.muted} />
              <Text style={styles.h2}>{(ticketQ.error as ApiError).status === 404 ? "No ticket with this seat code" : "Could not load this ticket"}</Text>
              <Text style={styles.muted}>Seat codes look like NW-7K2Q. Check the link, or get your own seat.</Text>
              <Button testID="ticket-go-home" title="Get my hall ticket" onPress={() => router.replace("/")} variant="ink" />
            </View>
          )}

          {t &&
            (isWide ? (
              <View style={styles.cols}>
                <View style={styles.colMain}>
                  {headerBlock}
                  {ticketBlock}
                  {badgesBlock}
                </View>
                <View style={styles.colSide}>
                  {shareBlock}
                  {boardLinkBlock}
                </View>
              </View>
            ) : (
              <>
                {headerBlock}
                {ticketBlock}
                {badgesBlock}
                {shareBlock}
                {boardLinkBlock}
              </>
            ))}

          <Footer text={workshop?.footer} />
        </PageContainer>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  cols: { flexDirection: "row", alignItems: "flex-start", gap: spacing["2xl"], width: "100%" },
  colMain: { flex: 1, minWidth: 0, gap: spacing.xl },
  colSide: { flex: 1, minWidth: 0, gap: spacing.xl },
  center: { alignItems: "center", gap: spacing.md, paddingVertical: spacing["3xl"] },
  topRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  kicker: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: colors.brandPrimary },
  h2: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 28, color: colors.onSurface, marginTop: 4 },
  muted: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 19, color: colors.muted, textAlign: "center" },
  demoTag: { backgroundColor: colors.surfaceTertiary, borderWidth: 2, borderColor: colors.border, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.md },
  demoTagText: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: colors.onSurfaceTertiary },
  refCount: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.brandSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 2, borderColor: colors.border },
  refCountText: { fontFamily: fonts.bold, fontSize: 14, color: colors.onBrandSecondary, flex: 1 },
  cta: { gap: spacing.md, borderWidth: 2, borderColor: colors.border, borderRadius: radius.md, padding: spacing.lg, backgroundColor: colors.surfaceSecondary },
  ctaTitle: { fontFamily: fonts.bold, fontSize: 20, color: colors.onSurfaceSecondary },
  boardLink: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 44 },
  boardLinkText: { fontFamily: fonts.bold, fontSize: 14, color: colors.onSurface, flex: 1 },
  focused: { outlineStyle: "solid", outlineWidth: 3, outlineColor: colors.focus, outlineOffset: 2 } as any,
}));
