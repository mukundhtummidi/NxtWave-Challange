import Ionicons from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import React from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { api, Workshop } from "@/src/api";
import { Button } from "@/src/components/Button";
import { downloadIcs, googleCalendarUrl, workshopEvent } from "@/src/calendar";
import { openUrl } from "@/src/share";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const MILESTONES = [1, 3, 5, 10];

/** Prototype referral milestone badges on the ticket. Locked/unlocked by friend count only. */
export function MilestoneBadges({ count }: { count: number }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.badgesWrap} testID="milestone-badges">
      <Text style={styles.cardTitle}>Referral badges</Text>
      <View style={styles.badgesRow}>
        {MILESTONES.map((m) => {
          const unlocked = count >= m;
          return (
            <View
              key={m}
              testID={`milestone-badge-${m}${unlocked ? "-unlocked" : "-locked"}`}
              accessibilityLabel={`${m} friends badge, ${unlocked ? "unlocked" : "locked"}`}
              style={[styles.badge, unlocked ? styles.badgeOn : styles.badgeOff]}
            >
              <Ionicons name={unlocked ? "ribbon" : "lock-closed-outline"} size={20} color={unlocked ? colors.onBrandSecondary : colors.muted} />
              <Text style={[styles.badgeNum, unlocked ? styles.badgeNumOn : styles.badgeNumOff]}>{m}</Text>
              <Text style={[styles.badgeLabel, unlocked ? styles.badgeNumOn : styles.badgeNumOff]}>{m === 1 ? "friend" : "friends"}</Text>
            </View>
          );
        })}
      </View>
      <Text style={styles.disclaimer} testID="milestone-disclaimer">
        Prototype badges. No reward is delivered yet.
      </Text>
    </View>
  );
}

/** Owner-only "My referrals": count, first-name + college list, and college progress toward the goal. */
export function MyReferrals({ seatCode }: { seatCode: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const q = useQuery({ queryKey: ["referrals", seatCode], queryFn: () => api.referrals(seatCode), enabled: !!seatCode, refetchInterval: 30_000 });
  const d = q.data;
  const pct = d ? Math.min(100, Math.round((d.college_count * 100) / d.goal)) : 0;

  return (
    <View style={styles.card} testID="my-referrals-card">
      <Text style={styles.cardTitle}>My referrals</Text>
      {q.isLoading && <ActivityIndicator color={colors.onSurface} />}
      {d && (
        <>
          <Text style={styles.count} testID="my-referrals-count">
            <Text style={styles.countBig}>{d.count}</Text> {d.count === 1 ? "friend has" : "friends have"} registered with your seat code
          </Text>

          <View style={styles.progressBlock} testID="my-college-progress">
            <View style={styles.progressTop}>
              <Text style={styles.progressLabel} numberOfLines={1}>
                {d.college}
              </Text>
              <Text style={styles.progressCount}>
                {d.college_count}/{d.goal}
              </Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${pct}%` }]} />
            </View>
            <Text style={styles.progressNote}>{d.college_count >= d.goal ? "Goal reached for your college." : `${d.goal - d.college_count} more to unlock the pack for your college.`}</Text>
          </View>

          {d.referrals.length > 0 ? (
            <View style={styles.list} testID="my-referrals-list">
              {d.referrals.map((r, i) => (
                <View key={`${r.first_name}-${i}`} style={styles.row}>
                  <Ionicons name="person-circle-outline" size={18} color={colors.muted} />
                  <Text style={styles.rowName} numberOfLines={1}>
                    {r.first_name} <Text style={styles.rowCollege}>· {r.college}</Text>
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.empty}>No friends yet. Share your link below to get started.</Text>
          )}
          <Text style={styles.privacyNote}>First name and college only — never an email or full name.</Text>
        </>
      )}
    </View>
  );
}

/** Add-to-calendar: downloadable .ics + a Google Calendar link, from config's start_iso. */
export function AddToCalendar({ workshop, link, onToast }: { workshop: Workshop; link: string; onToast?: (m: string) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const ev = workshopEvent(workshop, link);

  const addIcs = async () => {
    try {
      const r = await downloadIcs(ev);
      onToast?.(r === "downloaded" ? "Calendar file downloading (.ics)" : "Calendar file ready to add");
    } catch {
      onToast?.("Could not create calendar file. Try the Google Calendar link.");
    }
  };

  return (
    <View style={styles.card} testID="add-to-calendar">
      <Text style={styles.cardTitle}>Add to calendar</Text>
      <Text style={styles.calWhen}>{workshop.datetime_label}</Text>
      <View style={styles.calRow}>
        <Button testID="calendar-ics-button" title="Download .ics" onPress={addIcs} variant="ink" style={{ flex: 1 }} icon={<Ionicons name="calendar-outline" size={18} color={colors.onSurfaceInverse} />} />
        <Button testID="calendar-google-button" title="Google Calendar" onPress={() => openUrl(googleCalendarUrl(ev))} variant="outline" style={{ flex: 1 }} icon={<Ionicons name="logo-google" size={18} color={colors.onSurface} />} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  cardTitle: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1.6, textTransform: "uppercase", color: colors.muted },
  badgesWrap: { gap: spacing.sm },
  badgesRow: { flexDirection: "row", gap: spacing.sm },
  badge: { flex: 1, alignItems: "center", gap: 2, paddingVertical: spacing.sm, borderWidth: 2, borderRadius: radius.md },
  badgeOn: { backgroundColor: colors.brandSecondary, borderColor: colors.border },
  badgeOff: { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderStyle: "dashed" },
  badgeNum: { fontFamily: fonts.monoBold, fontSize: 18 },
  badgeNumOn: { color: colors.onBrandSecondary },
  badgeNumOff: { color: colors.muted },
  badgeLabel: { fontFamily: fonts.medium, fontSize: 10, letterSpacing: 0.4, textTransform: "uppercase" },
  disclaimer: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  card: { borderWidth: 2, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.surfaceSecondary, gap: spacing.md },
  count: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 19, color: colors.onSurfaceSecondary },
  countBig: { fontFamily: fonts.bold, fontSize: 20, color: colors.onSurfaceSecondary },
  progressBlock: { gap: 6 },
  progressTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: spacing.sm },
  progressLabel: { flex: 1, fontFamily: fonts.bold, fontSize: 13, color: colors.onSurfaceSecondary },
  progressCount: { fontFamily: fonts.mono, fontSize: 13, color: colors.muted },
  track: { height: 12, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.trackEmpty, borderRadius: radius.sm, overflow: "hidden" },
  fill: { height: "100%", backgroundColor: colors.brandPrimary },
  progressNote: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  list: { gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rowName: { flex: 1, fontFamily: fonts.medium, fontSize: 14, color: colors.onSurfaceSecondary },
  rowCollege: { fontFamily: fonts.regular, color: colors.muted },
  empty: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  privacyNote: { fontFamily: fonts.regular, fontSize: 11, color: colors.muted },
  calWhen: { fontFamily: fonts.bold, fontSize: 15, color: colors.onSurfaceSecondary },
  calRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
}));
