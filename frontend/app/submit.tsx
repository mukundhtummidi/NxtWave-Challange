import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation } from "@tanstack/react-query";
import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, ApiError, SubmitResult } from "@/src/api";
import { Button } from "@/src/components/Button";
import { Field } from "@/src/components/Field";
import { Footer } from "@/src/components/Footer";
import { Header } from "@/src/components/Header";
import { MY_SEAT_KEY } from "@/src/referral";
import { PageContainer } from "@/src/responsive";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { storage } from "@/src/utils/storage";

const DESC_MAX = 600;

export default function SubmitScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [seat, setSeat] = useState("");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);

  useEffect(() => {
    storage.getItem(MY_SEAT_KEY, null).then((v) => typeof v === "string" && v && setSeat(v));
  }, []);

  const m = useMutation({
    mutationFn: () => api.submit({ seat_code: seat.trim(), title: title.trim(), description: desc.trim(), link: link.trim() || null }),
    onSuccess: (r) => {
      setError(null);
      setResult(r);
    },
    onError: (e: ApiError) => {
      setResult(null);
      setError(e.status === 404 ? "No ticket with this seat code." : e.message || "Submission failed. Try again.");
    },
  });

  const canSubmit = seat.trim().length === 7 && title.trim().length >= 3 && desc.trim().length >= 30 && desc.length <= DESC_MAX;

  return (
    <View style={styles.screen} testID="submit-screen">
      <Header />
      <KeyboardAwareScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]} bottomOffset={24} keyboardShouldPersistTaps="handled">
        <PageContainer maxWidth={560} style={styles.gap}>
          <Text style={styles.kicker}>Project submission</Text>
          <Text style={styles.h1}>Show what you built</Text>
          <Text style={styles.sub}>Describe your project in up to 3 sentences. You can resubmit; the latest version replaces the earlier one.</Text>

          <Field label="Seat code" testID="submit-seat-input" value={seat} onChangeText={(t) => setSeat(t.toUpperCase())} placeholder="NW-7K2Q" autoCapitalize="characters" autoCorrect={false} maxLength={7} />
          <Field label="Project title" testID="submit-title-input" value={title} onChangeText={setTitle} placeholder="Past-paper finder" maxLength={100} />
          <Field
            label="Description (up to 3 sentences)"
            testID="submit-description-input"
            value={desc}
            onChangeText={setDesc}
            placeholder="What problem it solves. How AI helps. What works today."
            multiline
            maxLength={DESC_MAX}
            style={styles.multiline}
            hint={`${desc.length}/${DESC_MAX} characters`}
          />
          <Field label="Link (optional)" testID="submit-link-input" value={link} onChangeText={setLink} placeholder="https://github.com/you/project" autoCapitalize="none" autoCorrect={false} keyboardType="url" maxLength={300} />

          {error && (
            <Text style={styles.error} testID="submit-error">
              {error}
            </Text>
          )}
          <Button testID="submit-project-button" title={m.isPending ? "Saving and reviewing…" : "Submit project"} variant="ink" onPress={() => m.mutate()} loading={m.isPending} disabled={!canSubmit} />

          {result && (
            <View style={styles.card} testID="submit-result">
              <View style={styles.savedRow}>
                <Ionicons name="checkmark-circle" size={20} color={colors.onSurfaceSecondary} />
                <Text style={styles.cardTitle} testID="submit-saved">
                  Saved: {result.title}
                </Text>
              </View>
              {result.feedback ? (
                <>
                  <View style={styles.scores} testID="submit-scores">
                    {result.feedback.scores.map((s) => (
                      <View key={s.key} style={styles.scoreRow} testID={`submit-score-${s.key}`}>
                        <Text style={styles.scoreLabel}>{s.label}</Text>
                        <Text style={styles.scoreValue}>
                          {s.score}/{s.max}
                        </Text>
                      </View>
                    ))}
                    <View style={[styles.scoreRow, styles.totalRow]}>
                      <Text style={styles.scoreLabelBold}>Total</Text>
                      <Text style={styles.scoreValue} testID="submit-score-total">
                        {result.feedback.total}/{result.feedback.max_total}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.lines} testID="submit-feedback-lines">
                    {result.feedback.lines.map((l, i) => (
                      <Text key={i} style={styles.line}>
                        {l}
                      </Text>
                    ))}
                  </View>
                  <Text style={styles.note} testID="submit-feedback-note">
                    {result.note}
                  </Text>
                </>
              ) : (
                <Text style={styles.line} testID="submit-feedback-unavailable">
                  {result.message || "Your project is saved. Automated feedback is unavailable right now."}
                </Text>
              )}
            </View>
          )}
          <Footer />
        </PageContainer>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  gap: { gap: spacing.md },
  kicker: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: colors.brandPrimary },
  h1: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 32, color: colors.onSurface },
  sub: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 19, color: colors.muted },
  multiline: { minHeight: 120, textAlignVertical: "top" },
  error: { fontFamily: fonts.medium, fontSize: 13, color: colors.error },
  card: { gap: spacing.md, borderWidth: 2, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.surfaceSecondary },
  savedRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  cardTitle: { flex: 1, fontFamily: fonts.bold, fontSize: 16, color: colors.onSurfaceSecondary },
  scores: { gap: spacing.xs },
  scoreRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalRow: { borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.xs, marginTop: spacing.xs },
  scoreLabel: { fontFamily: fonts.medium, fontSize: 14, color: colors.onSurfaceSecondary },
  scoreLabelBold: { fontFamily: fonts.bold, fontSize: 14, color: colors.onSurfaceSecondary },
  scoreValue: { fontFamily: fonts.monoBold, fontSize: 14, color: colors.onSurfaceSecondary },
  lines: { gap: spacing.xs },
  line: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.onSurfaceSecondary },
  note: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
}));
