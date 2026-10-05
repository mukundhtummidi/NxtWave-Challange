import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, ApiError, BoardItem } from "@/src/api";
import { Button } from "@/src/components/Button";
import { Footer } from "@/src/components/Footer";
import { Header } from "@/src/components/Header";
import { useToast } from "@/src/components/Toast";
import { PageContainer, useBreakpoint } from "@/src/responsive";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const REFRESH_MS = 10_000;

export default function BoardScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { isWide } = useBreakpoint();
  const toast = useToast();
  const qc = useQueryClient();
  const [adminOpen, setAdminOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [tick, setTick] = useState(0);
  const [tab, setTab] = useState<"colleges" | "referrers">("colleges");

  const { data: config } = useQuery({ queryKey: ["config"], queryFn: api.config, staleTime: Infinity });
  const boardQ = useQuery({ queryKey: ["board"], queryFn: api.board, refetchInterval: REFRESH_MS, refetchIntervalInBackground: false });

  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const toggleDemo = useMutation({
    mutationFn: ({ hidden }: { hidden: boolean }) => api.setDemoHidden(pin, hidden),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["board"] });
      toast.show(res.demo_hidden ? "Demo data hidden for everyone" : "Demo data visible again");
      setAdminOpen(false);
      setPin("");
    },
    onError: (err: ApiError) => toast.show(err.status === 401 ? "Wrong PIN" : "Could not update", "error"),
  });

  const board = boardQ.data;
  const secondsAgo = board ? Math.max(0, Math.round((Date.now() - new Date(board.updated_at).getTime()) / 1000)) : 0;
  void tick;

  const hasItems = !!board && board.items.length > 0;

  const tabsNode = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsRow} contentContainerStyle={styles.tabsContent} testID="board-tabs">
      {([
        ["colleges", "Colleges"],
        ["referrers", "Top referrers"],
      ] as const).map(([key, label]) => (
        <Pressable
          key={key}
          testID={`board-tab-${key}`}
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === key }}
          onPress={() => setTab(key)}
          style={[styles.tabChip, tab === key && styles.tabChipOn]}
        >
          <Text style={[styles.tabChipText, tab === key && styles.tabChipTextOn]}>{label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );

  const collegesNode = hasItems ? (
    <View style={styles.list} testID="board-list">
      {board!.items.map((item) => (
        <BoardRow key={item.college_key} item={item} unlockLabel={board!.unlock_label} />
      ))}
    </View>
  ) : null;

  const referrersNode = board ? (
    board.top_referrers.length > 0 ? (
      <View style={styles.list} testID="referrers-list">
        {board.top_referrers.map((r, i) => (
          <View key={r.seat_code} style={styles.row} testID={`referrer-row-${r.seat_code}`}>
            <View style={styles.rowTop}>
              <Text style={styles.rank}>{String(i + 1).padStart(2, "0")}</Text>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.college} numberOfLines={1}>
                  {r.first_name} <Text style={styles.seat}>· {r.seat_code}</Text>
                </Text>
                <Text style={styles.remaining} numberOfLines={1}>
                  {r.college}
                </Text>
              </View>
              <Text style={styles.count}>
                <Text style={styles.countBig}>{r.count}</Text> {r.count === 1 ? "friend" : "friends"}
              </Text>
            </View>
            {r.is_demo && (
              <Text style={styles.demoNote} testID={`referrer-demo-${r.seat_code}`}>
                Demo data
              </Text>
            )}
          </View>
        ))}
      </View>
    ) : (
      <View style={styles.center} testID="referrers-empty">
        <Text style={styles.muted}>No referrals yet. Share your hall ticket link to be first here.</Text>
      </View>
    )
  ) : null;

  const listNode = tab === "colleges" ? collegesNode : referrersNode;

  const footnoteNode = board ? (
    <Text style={styles.footnote} testID="board-footnote">
      {tab === "colleges"
        ? "Counts are distinct registrations per college (one per email)."
        : "Top 10 seat codes by friends who registered with them. First name and college only."}
      {board.has_demo && !board.demo_hidden ? (tab === "colleges" ? ` ${board.demo_total} of ${board.total} shown are seeded demo entries, labelled "Demo data".` : ' Seeded demo rows are labelled "Demo data".') : ""}
    </Text>
  ) : null;

  const adminLinkNode = (
    <Pressable testID="admin-open-button" accessibilityRole="button" accessibilityLabel="Admin: toggle demo data" onPress={() => setAdminOpen(true)} style={({ focused }: any) => [styles.adminLink, focused && styles.focused]}>
      <Ionicons name="key-outline" size={14} color={colors.muted} />
      <Text style={styles.adminLinkText}>Admin</Text>
    </Pressable>
  );

  const summaryNode = board ? (
    <View style={[styles.summary, isWide && styles.summarySticky]} testID="board-summary">
      <Text style={styles.summaryKicker}>How the board works</Text>
      <Text style={styles.summaryRule}>
        First to {board.goal} seats unlocks{" "}
        <Text style={styles.summaryRuleStrong}>{board.unlock_label}</Text>
      </Text>
      <View style={styles.summaryStat}>
        <Text style={styles.summaryStatValue}>{board.total}</Text>
        <Text style={styles.summaryStatLabel}>registrations across {board.items.length} colleges</Text>
      </View>
      {board.has_demo && !board.demo_hidden && (
        <View style={styles.demoBadge} testID="board-summary-demo-label">
          <Ionicons name="flask-outline" size={12} color={colors.onSurfaceTertiary} />
          <Text style={styles.demoBadgeText}>Demo data visible</Text>
        </View>
      )}
      {board.demo_hidden && (
        <View style={styles.demoBadge} testID="board-summary-demo-hidden-label">
          <Text style={styles.demoBadgeText}>Demo hidden</Text>
        </View>
      )}
      {adminLinkNode}
    </View>
  ) : null;

  return (
    <View style={styles.screen} testID="board-screen">
      <Header />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
        refreshControl={<RefreshControl refreshing={boardQ.isFetching && !boardQ.isLoading} onRefresh={() => boardQ.refetch()} tintColor={colors.onSurface} />}
      >
        <PageContainer maxWidth={560}>
          <View style={styles.hero}>
            <Text style={styles.kicker}>Campus board</Text>
            <Text style={styles.h1} accessibilityRole="header">
              First to {board?.goal ?? config?.workshop.campus_goal ?? 25} seats unlocks the pack.
            </Text>
            <Text style={styles.lede}>
              Every college that hits {board?.goal ?? 25} registrations gets a free project template pack for the whole batch. Ranked live, refreshes every 10 seconds.
            </Text>
            <View style={styles.statusRow}>
              <View style={[styles.dot, boardQ.isFetching && styles.dotActive]} />
              <Text style={styles.status} testID="board-updated">
                {boardQ.isFetching ? "Refreshing…" : `Updated ${secondsAgo}s ago`}
              </Text>
              {board?.has_demo && !board.demo_hidden && (
                <View style={styles.demoBadge} testID="board-demo-label">
                  <Ionicons name="flask-outline" size={12} color={colors.onSurfaceTertiary} />
                  <Text style={styles.demoBadgeText}>Demo data</Text>
                </View>
              )}
              {board?.demo_hidden && (
                <View style={styles.demoBadge} testID="board-demo-hidden-label">
                  <Text style={styles.demoBadgeText}>Demo hidden</Text>
                </View>
              )}
            </View>
          </View>

          {boardQ.isLoading && (
            <View style={styles.center} testID="board-loading">
              <ActivityIndicator color={colors.onSurface} />
            </View>
          )}
          {boardQ.isError && (
            <View style={styles.center} testID="board-error">
              <Text style={styles.muted}>Failed to fetch the board. Pull to retry.</Text>
            </View>
          )}
          {tabsNode}

          {tab === "colleges" && board && board.items.length === 0 && (
            <View style={styles.center} testID="board-empty">
              <Text style={styles.muted}>No registrations yet. Be the first bar on this board.</Text>
            </View>
          )}

          {isWide && hasItems ? (
            <View style={styles.cols}>
              <View style={styles.colMain}>
                {listNode}
                {footnoteNode}
              </View>
              <View style={styles.colSide}>{summaryNode}</View>
            </View>
          ) : (
            <>
              {listNode}
              {footnoteNode}
              {adminLinkNode}
            </>
          )}

          <Footer text={config?.workshop.footer} />
        </PageContainer>
      </ScrollView>

      <Modal visible={adminOpen} transparent animationType="fade" onRequestClose={() => setAdminOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setAdminOpen(false)} accessibilityLabel="Close admin dialog" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} testID="admin-sheet">
          <View style={styles.sheetInner}>
            <Text style={styles.sheetTitle}>Admin · demo data</Text>
            <Text style={styles.muted}>Enter the admin PIN to {board?.demo_hidden ? "show" : "hide"} the seeded demo registrations on the public board.</Text>
            <TextInput
              testID="admin-pin-input"
              accessibilityLabel="Admin PIN"
              value={pin}
              onChangeText={setPin}
              placeholder="PIN"
              placeholderTextColor={colors.muted}
              secureTextEntry
              keyboardType="number-pad"
              maxLength={12}
              style={styles.pinInput}
              autoFocus
            />
            <Button
              testID="admin-toggle-button"
              title={board?.demo_hidden ? "Show demo data" : "Hide demo data"}
              onPress={() => toggleDemo.mutate({ hidden: !board?.demo_hidden })}
              loading={toggleDemo.isPending}
              disabled={pin.length < 4}
              variant="ink"
            />
            <Button testID="admin-cancel-button" title="Cancel" onPress={() => setAdminOpen(false)} variant="ghost" />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function BoardRow({ item, unlockLabel }: { item: BoardItem; unlockLabel: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const pct = useSharedValue(reduce ? item.pct : 0);

  useEffect(() => {
    pct.value = reduce ? item.pct : withTiming(item.pct, { duration: 600 });
  }, [item.pct, reduce, pct]);

  const fill = useAnimatedStyle(() => ({ width: `${pct.value}%` }));

  return (
    <View style={[styles.row, item.unlocked && styles.rowUnlocked]} testID={`board-row-${item.college_key}`} accessibilityLabel={`Rank ${item.rank}, ${item.college}, ${item.count} of ${item.goal}`}>
      <View style={styles.rowTop}>
        <Text style={styles.rank}>{String(item.rank).padStart(2, "0")}</Text>
        <Text style={styles.college} numberOfLines={2}>
          {item.college}
        </Text>
        <Text style={styles.count}>
          <Text style={styles.countBig}>{item.count}</Text>/{item.goal}
        </Text>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, item.unlocked && styles.fillUnlocked, fill]} />
      </View>
      <View style={styles.rowBottom}>
        {item.unlocked ? (
          <View style={styles.unlockWrap}>
            <View style={styles.unlock} testID={`board-unlocked-${item.college_key}`}>
              <Ionicons name="lock-open" size={13} color={colors.onBrandSecondary} />
              <Text style={styles.unlockText}>{unlockLabel}</Text>
            </View>
            <Text style={styles.unlockNote} testID={`board-unlock-note-${item.college_key}`}>
              Prototype: pack delivery is not built yet.
            </Text>
          </View>
        ) : (
          <Text style={styles.remaining}>{item.goal - item.count} more to unlock</Text>
        )}
        {item.demo_count > 0 && (
          <Text style={styles.demoNote} testID={`board-demo-${item.college_key}`}>
            Demo data · {item.demo_count}
          </Text>
        )}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  cols: { flexDirection: "row", alignItems: "flex-start", gap: spacing["2xl"], width: "100%" },
  colMain: { flex: 1.7, minWidth: 0, gap: spacing.xl },
  colSide: { flex: 1, minWidth: 0, maxWidth: 360 },
  hero: { gap: spacing.sm },
  tabsRow: { flexGrow: 0, height: 56, marginTop: spacing.md },
  tabsContent: { gap: spacing.sm, alignItems: "center" },
  tabChip: { flexShrink: 0, height: 36, justifyContent: "center", paddingHorizontal: spacing.md, borderWidth: 2, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  tabChipOn: { backgroundColor: colors.surfaceInverse },
  tabChipText: { fontFamily: fonts.bold, fontSize: 13, color: colors.onSurfaceSecondary },
  tabChipTextOn: { color: colors.onSurfaceInverse },
  seat: { fontFamily: fonts.mono, fontSize: 12, color: colors.muted },
  kicker: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: colors.brandPrimary },
  h1: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 32, color: colors.onSurface, letterSpacing: -0.4 },
  lede: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.onSurface },
  statusRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap", marginTop: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.muted },
  dotActive: { backgroundColor: colors.brandPrimary },
  status: { fontFamily: fonts.mono, fontSize: 12, color: colors.muted },
  demoBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.md, alignSelf: "flex-start" },
  demoBadgeText: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: colors.onSurfaceTertiary },
  center: { alignItems: "center", paddingVertical: spacing["2xl"] },
  muted: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 19, color: colors.muted },
  list: { gap: spacing.md },
  row: { borderWidth: 2, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm, backgroundColor: colors.surfaceSecondary },
  rowUnlocked: { borderColor: colors.brandPrimary, borderWidth: 3 },
  rowTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  rank: { fontFamily: fonts.monoBold, fontSize: 14, color: colors.brandPrimary, width: 26, marginTop: 2 },
  college: { flex: 1, fontFamily: fonts.bold, fontSize: 15, lineHeight: 19, color: colors.onSurfaceSecondary },
  count: { fontFamily: fonts.mono, fontSize: 13, color: colors.muted, marginTop: 2 },
  countBig: { fontFamily: fonts.monoBold, fontSize: 18, color: colors.onSurfaceSecondary },
  track: { height: 14, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.trackEmpty, borderRadius: radius.sm, overflow: "hidden" },
  fill: { height: "100%", backgroundColor: colors.surfaceInverse },
  fillUnlocked: { backgroundColor: colors.brandPrimary },
  rowBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, flexWrap: "wrap" },
  remaining: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted },
  unlock: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.brandSecondary, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.md },
  unlockText: { fontFamily: fonts.bold, fontSize: 12, color: colors.onBrandSecondary },
  unlockWrap: { gap: 4, alignItems: "flex-start" },
  unlockNote: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 14, color: colors.muted },
  demoNote: { fontFamily: fonts.medium, fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: colors.muted },
  footnote: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16, color: colors.muted },
  summary: { borderWidth: 2, borderColor: colors.border, borderRadius: radius.md, padding: spacing.lg, backgroundColor: colors.surfaceSecondary, gap: spacing.md },
  summarySticky: Platform.OS === "web" ? ({ position: "sticky", top: 88 } as any) : {},
  summaryKicker: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1.6, textTransform: "uppercase", color: colors.muted },
  summaryRule: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.onSurfaceSecondary },
  summaryRuleStrong: { fontFamily: fonts.bold, color: colors.onSurfaceSecondary },
  summaryStat: { gap: 2, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.md },
  summaryStatValue: { fontFamily: fonts.bold, fontSize: 32, lineHeight: 36, color: colors.onSurfaceSecondary },
  summaryStatLabel: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  adminLink: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", minHeight: 44 },
  adminLinkText: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted },
  focused: { outlineStyle: "solid", outlineWidth: 3, outlineColor: colors.focus, outlineOffset: 2 } as any,
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { backgroundColor: colors.surface, borderTopWidth: 3, borderTopColor: colors.border, padding: spacing.lg },
  sheetInner: { width: "100%", maxWidth: 480, alignSelf: "center", gap: spacing.md },
  sheetTitle: { fontFamily: fonts.bold, fontSize: 20, color: colors.onSurface },
  pinInput: {
    minHeight: 48,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.monoBold,
    fontSize: 20,
    letterSpacing: 4,
    color: colors.onSurfaceSecondary,
    backgroundColor: colors.surfaceSecondary,
  },
}));
