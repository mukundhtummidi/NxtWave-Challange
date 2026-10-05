import React, { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming } from "react-native-reanimated";

import type { Project, Workshop } from "@/src/api";
import { fonts, makeStyles, radius, spacing } from "@/src/theme";

export type TicketDraft = {
  name: string;
  college: string;
  branch: string;
  year: string;
  seatCode: string | null;
  project: Project | null;
};

type Props = {
  draft: TicketDraft;
  workshop?: Workshop;
  registered: boolean;
  animateStamp?: boolean;
  testID?: string;
};

export function HallTicket({ draft, workshop, registered, animateStamp, testID = "hall-ticket" }: Props) {
  const styles = useStyles();
  const name = draft.name.trim() || "Your name";
  const college = draft.college.trim() || "Your college";
  const seat = draft.seatCode || "NW-????";

  return (
    <View style={styles.card} testID={testID} accessibilityLabel={`Hall ticket for ${name}, ${college}, seat ${seat}`}>
      <View style={styles.holesLeft}>
        {Array.from({ length: 14 }).map((_, i) => (
          <View key={i} style={styles.hole} />
        ))}
      </View>
      <View style={styles.holesRight}>
        {Array.from({ length: 14 }).map((_, i) => (
          <View key={i} style={styles.hole} />
        ))}
      </View>

      <View style={styles.inner}>
        <View style={styles.headRow}>
          <Text style={styles.kicker}>Hall ticket</Text>
          <Text style={styles.mode}>{workshop?.mode ?? "Online"} · Free</Text>
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {workshop?.title ?? "Build Your First AI Project in 60 Minutes"}
        </Text>
        <Perforation />

        <Text style={styles.fieldLabel}>Candidate</Text>
        <Text style={styles.name} numberOfLines={2} testID="ticket-name">
          {name}
        </Text>

        <Text style={styles.fieldLabel}>College</Text>
        <Text style={styles.college} numberOfLines={2} testID="ticket-college">
          {college}
        </Text>

        <View style={styles.metaRow}>
          <View style={styles.metaCol}>
            <Text style={styles.fieldLabel}>Branch</Text>
            <Text style={styles.metaValue} testID="ticket-branch">
              {draft.branch || "—"}
            </Text>
            <Text style={styles.fieldLabel}>Year</Text>
            <Text style={styles.metaValue} testID="ticket-year">
              {draft.year ? `${draft.year} year` : "—"}
            </Text>
          </View>
          <View style={styles.seatBox}>
            <Text style={styles.seatLabel}>Seat</Text>
            <Text style={[styles.seat, !draft.seatCode && styles.seatPending]} testID="ticket-seat-code">
              {seat}
            </Text>
          </View>
        </View>

        <Perforation />

        <View style={styles.project} testID="ticket-project-card">
          <Text style={styles.projectKicker}>Your project</Text>
          <Text style={styles.projectTitle} testID="ticket-project-title">
            {draft.project?.title ?? "Pick a branch + interest to reveal"}
          </Text>
          {draft.project && (
            <>
              <Text style={styles.projectPitch}>{draft.project.pitch}</Text>
              <Text style={styles.projectVariation}>{draft.project.variation}</Text>
            </>
          )}
        </View>

        {draft.project && (
          <View style={styles.steps} testID="ticket-steps">
            <Text style={styles.fieldLabel}>What you will do</Text>
            {draft.project.steps.map((s, i) => (
              <View key={i} style={styles.stepRow}>
                <Text style={styles.stepNum}>{String(i + 1).padStart(2, "0")}</Text>
                <Text style={styles.stepText}>{s}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.footerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Reporting time</Text>
            <Text style={styles.when} testID="ticket-datetime">
              {workshop?.datetime_label ?? "—"}
            </Text>
            <Text style={styles.duration}>{workshop?.duration_label ?? ""}</Text>
          </View>
          <View style={styles.sealBox} testID="ticket-seal-box">
            {!registered && <Text style={styles.sealLabel}>Seal</Text>}
          </View>
        </View>
      </View>

      {registered && <Stamp animate={!!animateStamp} />}
    </View>
  );
}

function Perforation() {
  const styles = useStyles();
  return (
    <View style={styles.perf}>
      {Array.from({ length: 28 }).map((_, i) => (
        <View key={i} style={styles.dash} />
      ))}
    </View>
  );
}

function Stamp({ animate }: { animate: boolean }) {
  const styles = useStyles();
  const reduce = useReducedMotion();
  const scale = useSharedValue(animate && !reduce ? 2.4 : 1);
  const opacity = useSharedValue(animate && !reduce ? 0 : 1);

  useEffect(() => {
    if (!animate || reduce) {
      scale.value = 1;
      opacity.value = 1;
      return;
    }
    opacity.value = withDelay(250, withTiming(1, { duration: 120 }));
    scale.value = withDelay(
      250,
      withSequence(withTiming(0.92, { duration: 220, easing: Easing.in(Easing.cubic) }), withTiming(1.04, { duration: 90 }), withTiming(1, { duration: 90 })),
    );
  }, [animate, reduce, opacity, scale]);

  const anim = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ rotate: "-12deg" }, { scale: scale.value }] }));

  return (
    <Animated.View style={[styles.stamp, anim]} testID="registered-stamp" accessibilityLabel="Registered" accessibilityRole="image">
      <Text style={styles.stampText}>REGISTERED</Text>
    </Animated.View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    backgroundColor: colors.paper,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: "hidden",
    position: "relative",
  },
  inner: { paddingHorizontal: spacing.xl, paddingVertical: spacing.lg, gap: spacing.xs },
  holesLeft: { position: "absolute", left: -7, top: 14, bottom: 0, gap: 14, pointerEvents: "none" },
  holesRight: { position: "absolute", right: -7, top: 14, bottom: 0, gap: 14, pointerEvents: "none" },
  hole: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border },
  headRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  kicker: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: colors.stamp },
  mode: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted },
  title: { fontFamily: fonts.bold, fontSize: 18, color: colors.onSurfaceSecondary, lineHeight: 22 },
  perf: { flexDirection: "row", gap: 6, marginVertical: spacing.md, overflow: "hidden" },
  dash: { width: 10, height: 2, backgroundColor: colors.paperLine },
  fieldLabel: { fontFamily: fonts.medium, fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", color: colors.muted, marginTop: spacing.sm },
  name: { fontFamily: fonts.bold, fontSize: 28, color: colors.onSurfaceSecondary, lineHeight: 32 },
  college: { fontFamily: fonts.medium, fontSize: 16, color: colors.onSurfaceSecondary, lineHeight: 20 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: spacing.md, marginTop: spacing.xs },
  metaCol: { flex: 1 },
  metaValue: { fontFamily: fonts.medium, fontSize: 15, color: colors.onSurfaceSecondary },
  seatBox: {
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minWidth: 130,
  },
  seatLabel: { fontFamily: fonts.medium, fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", color: colors.muted },
  seat: { fontFamily: fonts.monoBold, fontSize: 26, color: colors.onSurfaceSecondary, letterSpacing: 1 },
  seatPending: { color: colors.muted },
  project: {
    backgroundColor: colors.brandSecondary,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  projectKicker: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", color: colors.onBrandSecondary },
  projectTitle: { fontFamily: fonts.bold, fontSize: 20, color: colors.onBrandSecondary, lineHeight: 24 },
  projectPitch: { fontFamily: fonts.regular, fontSize: 14, color: colors.onBrandSecondary, lineHeight: 19 },
  projectVariation: { fontFamily: fonts.medium, fontSize: 12, color: colors.onBrandSecondary, lineHeight: 16, fontStyle: "italic" },
  steps: { gap: spacing.xs },
  stepRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  stepNum: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.stamp, width: 24, marginTop: 2 },
  stepText: { flex: 1, fontFamily: fonts.regular, fontSize: 14, color: colors.onSurfaceSecondary, lineHeight: 19 },
  footerRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.md, marginTop: spacing.sm },
  sealBox: { width: 100, height: 60, borderWidth: 2, borderStyle: "dashed", borderColor: colors.paperLine, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  sealLabel: { fontFamily: fonts.medium, fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", color: colors.paperLine },
  when: { fontFamily: fonts.bold, fontSize: 16, color: colors.onSurfaceSecondary },
  duration: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  stamp: {
    position: "absolute",
    right: spacing.md,
    bottom: spacing.lg + 6,
    borderWidth: 4,
    borderColor: colors.stamp,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    opacity: 0.92,
  },
  stampText: { fontFamily: fonts.bold, fontSize: 20, letterSpacing: 3, color: colors.stamp },
}));
