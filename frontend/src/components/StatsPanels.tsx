import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import type { AdminStats } from "@/src/api";
import { DailyBars, HBar } from "@/src/components/Charts";
import { Field } from "@/src/components/Field";
import { useBreakpoint } from "@/src/responsive";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

type Props = {
  s: AdminStats;
  includeDemo: boolean;
  /** Public /admin-demo: demo rows only, so the "Real" KPI and the real/demo note are dropped. */
  demoOnly?: boolean;
};

/** All dashboard panels shared by /admin (locked) and /admin-demo (public, demo data only). */
export function StatsPanels({ s, includeDemo, demoOnly = false }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { isWide } = useBreakpoint();
  const router = useRouter();
  const tones = s.shares_by_tone;

  const leftPanels = (
    <>
      <Section title="By source" testID="admin-sources">
        {s.sources.map((r) => (
          <HBar key={r.source} label={r.source} value={r.count} max={Math.max(1, ...s.sources.map((x) => x.count))} highlight={r.source === "rep"} />
        ))}
      </Section>

      <Section title="Per day · last 14 days" testID="admin-per-day">
        <DailyBars points={s.per_day} />
      </Section>

      <Section title="Top colleges" testID="admin-top-colleges">
        {s.top_colleges.map((c) => (
          <HBar key={c.college} label={c.college} value={c.count} max={Math.max(1, s.top_colleges[0]?.count ?? 1)} sub={c.demo_count ? `Demo data · ${c.demo_count}` : undefined} />
        ))}
        {s.top_colleges.length === 0 && <Text style={styles.sub}>No registrations yet.</Text>}
      </Section>

      <Section title="Top reps" testID="admin-top-reps">
        {s.top_reps.map((r) => (
          <Pressable key={r.rep_code} testID={`admin-rep-${r.rep_code}`} accessibilityRole="link" onPress={() => router.push({ pathname: "/rep/[repCode]", params: { repCode: r.rep_code } })} style={({ focused }: any) => [focused && styles.focused]}>
            <HBar label={`${r.name} · ${r.rep_code}`} value={r.total} max={Math.max(1, s.top_reps[0]?.total ?? 1)} sub={`${r.direct} direct · ${r.via_chain} via chain${r.is_demo ? " · Demo data" : ""}`} highlight />
          </Pressable>
        ))}
        {s.top_reps.length === 0 && <Text style={styles.sub}>No reps yet.</Text>}
      </Section>

      <Section title="Shares and registrations by platform" testID="admin-platforms">
        <Text style={styles.note} testID="admin-platforms-note">
          {s.by_platform.note}
        </Text>
        {!demoOnly &&
          (() => {
            const rows = s.by_platform.platforms.filter((p) => p.real_shares + p.real_regs > 0);
            return rows.length ? (
              rows.map((p) => <PlatformStat key={p.channel} channel={p.channel} label={p.label} shares={p.real_shares} regs={p.real_regs} />)
            ) : (
              <Text style={styles.sub}>No platform shares yet.</Text>
            );
          })()}
        {includeDemo &&
          (() => {
            const rows = s.by_platform.platforms.filter((p) => p.demo_shares + p.demo_regs > 0);
            return rows.length ? (
              <View style={demoOnly ? undefined : styles.chain} testID="admin-platforms-demo">
                <Text style={styles.kpiLabel}>Demo data</Text>
                {rows.map((p) => (
                  <PlatformStat key={p.channel} channel={`demo-${p.channel}`} label={p.label} shares={p.demo_shares} regs={p.demo_regs} />
                ))}
              </View>
            ) : null;
          })()}
      </Section>
    </>
  );

  const rightPanels = (
    <>
      <Section title={`Funnel · last ${s.funnel_window_days} days (${demoOnly ? "demo events" : "real traffic"})`} testID="admin-funnel">
        {s.funnel.map((f, i) => {
          const prev = i > 0 ? s.funnel[i - 1].count : 0;
          const conv = i > 0 && prev > 0 ? `${Math.round((f.count / prev) * 100)}% of previous step` : undefined;
          return <HBar key={f.key} label={f.step} value={f.count} max={Math.max(1, s.funnel[0].count)} sub={conv} />;
        })}
        <Text style={styles.note}>
          {demoOnly
            ? "Demo registrations never emitted page views or form starts, so only the Registered and Share steps carry seeded demo numbers."
            : "Page views and form starts are counted once per browser session; shares count WhatsApp button taps. Demo registrations never emit events."}
        </Text>
      </Section>

      <Section title="Shares by tone" testID="admin-tones">
        <Text style={styles.sub}>Per tone: WhatsApp shares, message copies, and their sum as a share of all tones.</Text>
        {!demoOnly && (
          <>
            <Text style={styles.kpiLabel}>Real · {tones.real_total}</Text>
            {tones.real.map((t) => (
              <HBar key={t.tone} testID={`admin-tone-real-${t.tone}`} label={t.label} value={t.total} max={Math.max(1, tones.real_total)} sub={`${t.shares} WhatsApp · ${t.copies} copied · ${t.pct}% of real`} />
            ))}
            {tones.real_total === 0 && <Text style={styles.sub}>No real shares or copies with a tone yet.</Text>}
            {tones.real_untagged > 0 && (
              <Text style={styles.sub}>
                {tones.real_untagged} older event{tones.real_untagged === 1 ? "" : "s"} without a tone not shown.
              </Text>
            )}
          </>
        )}
        {includeDemo && tones.demo_total > 0 && (
          <View style={demoOnly ? undefined : styles.chain} testID="admin-tones-demo">
            <Text style={styles.kpiLabel}>Demo data · {tones.demo_total} seeded</Text>
            {tones.demo.map((t) => (
              <HBar key={t.tone} testID={`admin-tone-demo-${t.tone}`} label={t.label} value={t.total} max={Math.max(1, tones.demo_total)} sub={`${t.shares} WhatsApp · ${t.copies} copied · ${t.pct}% of demo`} />
            ))}
          </View>
        )}
        <Text style={styles.note} testID="admin-tones-note">
          {tones.note}
        </Text>
      </Section>

      <Section title="Referral stats" testID="admin-referrals">
        <View style={styles.statRow}>
          <Stat label="Viral coefficient (K)" value={s.referrals.k.toFixed(2)} hint="referred ÷ all registrants" testID="admin-k" />
          <Stat label="Avg per referrer" value={s.referrals.avg_per_referrer.toFixed(2)} hint={`${s.referrals.referred} referred by ${s.referrals.referrers}`} />
        </View>
        <View style={styles.chain} testID="admin-longest-chain">
          <Text style={styles.kpiLabel}>Longest referral chain · {s.referrals.longest_chain.length} hops</Text>
          <Text style={styles.chainPath}>{s.referrals.longest_chain.path.length ? s.referrals.longest_chain.path.join(" → ") : "No referrals yet"}</Text>
        </View>
      </Section>

      <Projection measuredK={s.referrals.k} />
    </>
  );

  return (
    <>
      <View style={styles.kpis}>
        {!demoOnly && (
          <View style={[styles.kpi, styles.kpiPrimary]} testID="admin-total-real">
            <Text style={[styles.kpiLabel, { color: colors.onBrandSecondary }]}>Real</Text>
            <Text style={[styles.kpiValue, { color: colors.onBrandSecondary }]}>{s.totals.real}</Text>
          </View>
        )}
        <View style={styles.kpi} testID="admin-total-demo">
          <Text style={styles.kpiLabel}>Demo data</Text>
          <Text style={styles.kpiValue}>{s.totals.demo}</Text>
        </View>
        <View style={styles.kpi} testID="admin-total-all">
          <Text style={styles.kpiLabel}>{demoOnly ? "All (demo)" : "All"}</Text>
          <Text style={styles.kpiValue}>{s.totals.all}</Text>
        </View>
      </View>
      {!demoOnly && s.totals.demo > 0 && (
        <Text style={styles.note}>
          Demo rows are seeded (is_demo = true) and {s.demo_hidden ? "currently hidden" : "visible"} on the public board. Charts below {includeDemo ? "include demo data" : "show real registrations only"}.
        </Text>
      )}

      {isWide ? (
        <View style={styles.panelCols}>
          <View style={styles.panelCol}>{leftPanels}</View>
          <View style={styles.panelCol}>{rightPanels}</View>
        </View>
      ) : (
        <>
          {leftPanels}
          {rightPanels}
        </>
      )}
    </>
  );
}

function Section({ title, children, testID }: { title: string; children: React.ReactNode; testID?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.card} testID={testID}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Stat({ label, value, hint, testID }: { label: string; value: string; hint?: string; testID?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.stat} testID={testID}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {hint ? <Text style={styles.sub}>{hint}</Text> : null}
    </View>
  );
}

function PlatformStat({ channel, label, shares, regs }: { channel: string; label: string; shares: number; regs: number }) {
  const styles = useStyles();
  return (
    <View style={styles.platRow} testID={`admin-platform-${channel}`}>
      <Text style={styles.platLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.platNums}>
        <Text style={styles.platNum}>{shares}</Text> shares · <Text style={styles.platNum}>{regs}</Text> regs
      </Text>
    </View>
  );
}

const GENERATIONS = 5;

function Projection({ measuredK }: { measuredK: number }) {
  const styles = useStyles();
  const [reps, setReps] = useState("20");
  const [friends, setFriends] = useState("8");
  const [shareRate, setShareRate] = useState("30");

  const model = useMemo(() => {
    const r = Math.max(0, parseInt(reps || "0", 10) || 0);
    const f = Math.max(0, parseFloat(friends || "0") || 0);
    const k = Math.min(0.95, Math.max(0, (parseFloat(shareRate || "0") || 0) / 100));
    const seed = r * f;
    const gens: number[] = [];
    let cur = seed;
    let total = 0;
    for (let g = 0; g <= GENERATIONS; g++) {
      gens.push(Math.round(cur));
      total += cur;
      cur = cur * k;
    }
    const withMeasured = measuredK > 0 && measuredK < 1 ? Math.round((seed * (1 - Math.pow(measuredK, GENERATIONS + 1))) / (1 - measuredK)) : seed;
    return { seed, k, gens, total: Math.round(total), withMeasured };
  }, [reps, friends, shareRate, measuredK]);

  return (
    <View style={styles.card} testID="admin-projection">
      <Text style={styles.cardTitle}>Projection · editable assumptions</Text>
      <View style={styles.inputs}>
        <View style={{ flex: 1 }}>
          <Field label="Reps" testID="proj-reps" value={reps} onChangeText={setReps} keyboardType="number-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Friends/rep" testID="proj-friends" value={friends} onChangeText={setFriends} keyboardType="decimal-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Share %" testID="proj-share" value={shareRate} onChangeText={setShareRate} keyboardType="number-pad" />
        </View>
      </View>
      <View style={styles.projResult} testID="proj-total">
        <Text style={styles.kpiLabel}>Expected registrations</Text>
        <Text style={styles.projValue}>{model.total}</Text>
        <Text style={styles.sub}>
          {Math.round(model.seed)} direct from reps, then each generation shares at {Math.round(model.k * 100)}% (K = {model.k.toFixed(2)}), over {GENERATIONS} generations.
        </Text>
      </View>
      <View style={styles.gens}>
        {model.gens.map((g, i) => (
          <View key={i} style={styles.gen}>
            <Text style={styles.genLabel}>{i === 0 ? "Reps" : `Gen ${i}`}</Text>
            <Text style={styles.genValue}>{g}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.note}>
        Model: registrations = reps × friends per rep × (1 + K + K² + … + K{"\u2075"}), where K = share rate and each share is assumed to bring one friend. With the measured K of {measuredK.toFixed(2)} from current data the same inputs give {model.withMeasured}.
      </Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  sub: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.muted },
  note: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16, color: colors.muted },
  focused: { outlineStyle: "solid", outlineWidth: 3, outlineColor: colors.focus, outlineOffset: 2 } as any,
  panelCols: { flexDirection: "row", alignItems: "flex-start", gap: spacing.lg, width: "100%" },
  panelCol: { flex: 1, minWidth: 0, gap: spacing.lg },
  kpis: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  kpi: { flexGrow: 1, flexBasis: 120, minWidth: 120, borderWidth: 2, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.surfaceSecondary, gap: 2 },
  kpiPrimary: { backgroundColor: colors.brandSecondary },
  kpiLabel: { fontFamily: fonts.medium, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: colors.muted },
  kpiValue: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 32, color: colors.onSurfaceSecondary },
  card: { borderWidth: 2, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.surfaceSecondary, gap: spacing.md },
  cardTitle: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1.6, textTransform: "uppercase", color: colors.muted },
  statRow: { flexDirection: "row", gap: spacing.md },
  stat: { flex: 1, gap: 2 },
  statValue: { fontFamily: fonts.bold, fontSize: 28, color: colors.onSurfaceSecondary },
  chain: { gap: 4, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.sm },
  chainPath: { fontFamily: fonts.mono, fontSize: 12, lineHeight: 18, color: colors.onSurfaceSecondary },
  platRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.divider },
  platLabel: { fontFamily: fonts.bold, fontSize: 14, color: colors.onSurface, flexShrink: 1 },
  platNums: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  platNum: { fontFamily: fonts.monoBold, fontSize: 14, color: colors.onSurfaceSecondary },
  inputs: { flexDirection: "row", gap: spacing.sm },
  projResult: { backgroundColor: colors.brandSecondary, borderWidth: 2, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, gap: 2 },
  projValue: { fontFamily: fonts.bold, fontSize: 36, lineHeight: 40, color: colors.onBrandSecondary },
  gens: { flexDirection: "row", gap: 4 },
  gen: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 6, alignItems: "center", gap: 2 },
  genLabel: { fontFamily: fonts.medium, fontSize: 9, letterSpacing: 0.6, textTransform: "uppercase", color: colors.muted },
  genValue: { fontFamily: fonts.monoBold, fontSize: 14, color: colors.onSurfaceSecondary },
}));
