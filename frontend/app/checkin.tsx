import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation } from "@tanstack/react-query";
import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, ApiError, CheckinResult } from "@/src/api";
import { Button } from "@/src/components/Button";
import { Field } from "@/src/components/Field";
import { Footer } from "@/src/components/Footer";
import { Header } from "@/src/components/Header";
import { MY_SEAT_KEY } from "@/src/referral";
import { PageContainer } from "@/src/responsive";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { storage } from "@/src/utils/storage";

export default function CheckinScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [seat, setSeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckinResult | null>(null);

  useEffect(() => {
    storage.getItem(MY_SEAT_KEY, null).then((v) => typeof v === "string" && v && setSeat(v));
  }, []);

  const m = useMutation({
    mutationFn: () => api.checkin(seat.trim()),
    onSuccess: (r) => {
      setError(null);
      setResult(r);
    },
    onError: (e: ApiError) => {
      setResult(null);
      setError(e.status === 404 ? "No ticket with this seat code." : e.message || "Check-in failed. Try again.");
    },
  });

  return (
    <View style={styles.screen} testID="checkin-screen">
      <Header />
      <KeyboardAwareScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]} bottomOffset={24} keyboardShouldPersistTaps="handled">
        <PageContainer maxWidth={480} style={styles.gap}>
          <Text style={styles.kicker}>Workshop check-in</Text>
          <Text style={styles.h1}>Mark your attendance</Text>
          <Text style={styles.sub}>Enter the seat code from your hall ticket. You only need to check in once.</Text>
          <Field
            label="Seat code"
            testID="checkin-seat-input"
            value={seat}
            onChangeText={(t) => setSeat(t.toUpperCase())}
            placeholder="NW-7K2Q"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={7}
            error={error}
            returnKeyType="go"
            onSubmitEditing={() => seat.trim() && m.mutate()}
          />
          <Button testID="checkin-submit-button" title="Check in" variant="ink" onPress={() => m.mutate()} loading={m.isPending} disabled={seat.trim().length < 7} />
          {result && (
            <View style={styles.card} testID="checkin-result">
              <Ionicons name="checkmark-circle" size={28} color={colors.onBrandSecondary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{result.already_checked_in ? `Already checked in, ${result.first_name}` : `You're checked in, ${result.first_name}`}</Text>
                <Text style={styles.cardSub}>
                  Seat {result.seat_code} · {new Date(result.checked_in_at).toLocaleString()}
                </Text>
              </View>
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
  card: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.brandSecondary, borderWidth: 2, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
  cardTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.onBrandSecondary },
  cardSub: { fontFamily: fonts.mono, fontSize: 12, color: colors.onBrandSecondary, marginTop: 2 },
}));
