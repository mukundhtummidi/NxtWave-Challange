import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Animated, { FadeInDown, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, ApiError, RegisterPayload } from "@/src/api";
import { Button } from "@/src/components/Button";
import { ChipRow } from "@/src/components/ChipRow";
import { CollegePicker } from "@/src/components/CollegePicker";
import { Faq } from "@/src/components/Faq";
import { Field } from "@/src/components/Field";
import { Footer } from "@/src/components/Footer";
import { HallTicket } from "@/src/components/HallTicket";
import { Header } from "@/src/components/Header";
import { useToast } from "@/src/components/Toast";
import { Attribution, getAttribution, MY_SEAT_KEY } from "@/src/referral";
import { countdownLabel } from "@/src/calendar";
import { useBreakpoint } from "@/src/responsive";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { track } from "@/src/track";
import { storage } from "@/src/utils/storage";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function Home() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { width } = useBreakpoint();
  const twoCol = width >= 900;
  const reduce = useReducedMotion();

  const { data: config } = useQuery({ queryKey: ["config"], queryFn: api.config, staleTime: Infinity });
  const { data: projectsData } = useQuery({ queryKey: ["projects"], queryFn: api.projects, staleTime: Infinity });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [college, setCollege] = useState("");
  const [branch, setBranch] = useState("");
  const [year, setYear] = useState("");
  const [interest, setInterest] = useState("");
  const [touched, setTouched] = useState(false);
  const [attribution, setAttribution] = useState<Attribution | null>(null);
  const [mySeat, setMySeat] = useState<string | null>(null);
  const [existingSeat, setExistingSeat] = useState<string | null>(null);

  useEffect(() => {
    getAttribution().then(setAttribution);
    storage.getItem(MY_SEAT_KEY, null).then((v) => setMySeat(typeof v === "string" ? v : null));
    track("page_view", { path: "/", once: true });
  }, []);

  // /?faq=1 (from "Read the FAQ" on the ticket page) scrolls straight to the FAQ.
  const { faq } = useLocalSearchParams<{ faq?: string }>();
  const scrollRef = useRef<any>(null);
  const faqY = useRef<number | null>(null);
  useEffect(() => {
    if (!faq) return;
    let tries = 0;
    const id = setInterval(() => {
      tries += 1;
      if (faqY.current != null && scrollRef.current) {
        scrollRef.current.scrollTo({ y: Math.max(0, faqY.current - spacing.md), animated: true });
        clearInterval(id);
      } else if (tries > 20) clearInterval(id);
    }, 100);
    return () => clearInterval(id);
  }, [faq]);

  const formStarted = useRef(false);
  const onFormTouch = () => {
    if (formStarted.current) return;
    formStarted.current = true;
    track("form_started", { path: "/", once: true });
  };
  useEffect(() => {
    if (name || email || college || branch || year || interest) onFormTouch();
  }, [name, email, college, branch, year, interest]);

  const project = useMemo(
    () => projectsData?.projects.find((p) => p.interest === interest && p.branch === branch) ?? null,
    [projectsData, interest, branch],
  );

  const errors = {
    name: name.trim().length < 2 ? "Enter your full name" : null,
    email: !EMAIL_RE.test(email.trim()) ? "Enter a valid email" : null,
    college: college.trim().length < 2 ? "Pick your college" : null,
    branch: !branch ? "Pick a branch" : null,
    year: !year ? "Pick your year" : null,
    interest: !interest ? "Pick one interest" : null,
  };
  const valid = Object.values(errors).every((e) => !e);

  const register = useMutation({
    mutationFn: (payload: RegisterPayload) => api.register(payload),
    onSuccess: async (ticket) => {
      await storage.setItem(MY_SEAT_KEY, ticket.seat_code);
      qc.invalidateQueries({ queryKey: ["board"] });
      qc.setQueryData(["ticket", ticket.seat_code], ticket);
      router.push({ pathname: "/ticket/[seatCode]", params: { seatCode: ticket.seat_code, fresh: "1" } });
    },
    onError: (err: ApiError) => {
      if (err.status === 409) {
        const seat = err.detail?.seat_code ?? null;
        setExistingSeat(seat);
        toast.show("This email already has a hall ticket.", "error");
      } else if (err.status === 429) {
        toast.show("Too many registrations from this network. Try again in a few minutes.", "error");
      } else {
        toast.show(err.message || "Could not register. Please retry.", "error");
      }
    },
  });

  const submit = () => {
    setTouched(true);
    if (!valid || register.isPending) return;
    register.mutate({
      name: name.trim(),
      email: email.trim(),
      college: college.trim(),
      branch,
      year,
      interest,
      ref: attribution?.ref ?? null,
      rep: attribution?.rep ?? null,
      via: attribution?.via ?? null,
      utm_source: attribution?.utm_source ?? null,
      utm_medium: attribution?.utm_medium ?? null,
      utm_campaign: attribution?.utm_campaign ?? null,
    });
  };

  const workshop = config?.workshop;
  const ticketCard = (
    <HallTicket draft={{ name, college, branch, year, seatCode: null, project }} workshop={workshop} registered={false} testID="ticket-preview" />
  );

  return (
    <View style={styles.screen} testID="home-screen">
      <Header />
      <KeyboardAwareScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.container, twoCol && styles.containerWide]}>
          <View style={[styles.col, twoCol && styles.colForm]}>
            {/* Hero */}
            <Animated.View entering={reduce ? undefined : FadeInDown.duration(320)} style={styles.hero}>
              <View style={styles.heroTag}>
                <Text style={styles.heroTagText}>Free online workshop · {workshop?.audience ?? "3rd & 4th year engineering students"}</Text>
              </View>
              <Text style={styles.h1} accessibilityRole="header">
                {workshop?.title ?? "Build Your First AI Project in 60 Minutes"}
              </Text>
              <Text style={styles.lede}>
                Fill the form like an exam form. Get a hall ticket with your seat code and a project picked for your branch. No fees, no fluff.
              </Text>
              <View style={styles.whenRow}>
                <Ionicons name="calendar-outline" size={16} color={colors.onSurface} />
                <Text style={styles.when} testID="hero-datetime">
                  {workshop?.datetime_label ?? "—"}
                </Text>
              </View>
              {workshop?.start_iso ? (
                <View style={styles.countdownChip} testID="hero-countdown">
                  <Ionicons name="time-outline" size={14} color={colors.onBrandSecondary} />
                  <Text style={styles.countdownText}>{countdownLabel(workshop.start_iso).label}</Text>
                </View>
              ) : null}
            </Animated.View>

            {mySeat && (
              <Pressable
                testID="my-seat-banner"
                accessibilityRole="link"
                onPress={() => router.push({ pathname: "/ticket/[seatCode]", params: { seatCode: mySeat } })}
                style={({ focused }: any) => [styles.banner, focused && styles.focused]}
              >
                <Text style={styles.bannerText}>
                  You already have a seat: <Text style={styles.bannerCode}>{mySeat}</Text>
                </Text>
                <Text style={styles.bannerLink}>Open my ticket →</Text>
              </Pressable>
            )}

            {attribution?.ref || attribution?.rep ? (
              <View style={styles.refChip} testID="attribution-chip">
                <Ionicons name="people-outline" size={14} color={colors.onSurfaceTertiary} />
                <Text style={styles.refChipText}>
                  {attribution.ref ? `Invited by seat ${attribution.ref}` : `Via campus rep ${attribution.rep}`}
                  {attribution.utm_source ? ` · ${attribution.utm_source}` : ""}
                </Text>
              </View>
            ) : null}

            {/* Preview (mobile: between hero and form) */}
            {!twoCol && (
              <View style={styles.previewWrap}>
                <Text style={styles.sectionLabel}>Live preview</Text>
                {ticketCard}
              </View>
            )}

            {/* Form */}
            <View style={styles.form} testID="register-form">
              <Text style={styles.sectionLabel}>Candidate details</Text>
              <Field
                label="Full name"
                testID="name-input"
                value={name}
                onChangeText={setName}
                placeholder="As it should appear on the ticket"
                autoCapitalize="words"
                autoComplete="name"
                textContentType="name"
                maxLength={60}
                error={touched ? errors.name : null}
                returnKeyType="next"
              />
              <Field
                label="Email"
                testID="email-input"
                value={email}
                onChangeText={setEmail}
                placeholder="you@college.edu"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                maxLength={120}
                error={touched ? errors.email : null}
                hint="One ticket per email."
              />
              <CollegePicker value={college} onChange={setCollege} error={touched ? errors.college : null} />
              <ChipRow label="Branch" testID="branch-chip" options={config?.branches ?? []} value={branch} onChange={setBranch} />
              {touched && errors.branch && <Text style={styles.inlineError}>{errors.branch}</Text>}
              <ChipRow label="Year" testID="year-chip" options={config?.years ?? []} value={year} onChange={setYear} />
              {touched && errors.year && <Text style={styles.inlineError}>{errors.year}</Text>}
              <ChipRow label="I'm here for" testID="interest-chip" options={config?.interests ?? []} value={interest} onChange={setInterest} />
              {touched && errors.interest && <Text style={styles.inlineError}>{errors.interest}</Text>}

              <Button testID="register-button" title="Register for free" onPress={submit} loading={register.isPending} disabled={touched && !valid} />
              {existingSeat && (
                <Pressable
                  testID="open-existing-ticket"
                  accessibilityRole="link"
                  onPress={() => router.push({ pathname: "/ticket/[seatCode]", params: { seatCode: existingSeat } })}
                  style={({ focused }: any) => [styles.existing, focused && styles.focused]}
                >
                  <Text style={styles.existingText}>Open the ticket already issued to this email ({existingSeat}) →</Text>
                </Pressable>
              )}
              <Text style={styles.fineprint}>
                We store your name, email and college only to issue the ticket. No emails are sent; the joining link is shared before the session.
              </Text>
            </View>
          </View>

          {twoCol && (
            <View style={[styles.col, styles.colPreview]}>
              <Text style={styles.sectionLabel}>Live preview</Text>
              {ticketCard}
            </View>
          )}
        </View>

        <View onLayout={(e) => (faqY.current = e.nativeEvent.layout.y)}>
          <Faq />
        </View>
        <View style={[styles.container, twoCol && styles.footerWide]}>
          <Footer text={workshop?.footer} />
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  container: { width: "100%", maxWidth: 560, alignSelf: "center", gap: spacing.xl },
  containerWide: { maxWidth: 1100, flexDirection: "row", alignItems: "flex-start", gap: spacing["2xl"] },
  col: { gap: spacing.xl, width: "100%" },
  colForm: { flex: 1, minWidth: 0 },
  footerWide: { maxWidth: 1100, marginTop: spacing.xl },
  colPreview: { flex: 1, minWidth: 0, ...(Platform.OS === "web" ? ({ position: "sticky", top: 88 } as any) : {}) },
  hero: { gap: spacing.md },
  heroTag: { alignSelf: "flex-start", backgroundColor: colors.brandSecondary, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.md },
  heroTagText: { fontFamily: fonts.bold, fontSize: 12, color: colors.onBrandSecondary, letterSpacing: 0.4 },
  h1: { fontFamily: fonts.bold, fontSize: 32, lineHeight: 36, color: colors.onSurface, letterSpacing: -0.5 },
  lede: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 23, color: colors.onSurface },
  whenRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  when: { fontFamily: fonts.bold, fontSize: 15, color: colors.onSurface },
  countdownChip: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: colors.brandSecondary, borderWidth: 2, borderColor: colors.border, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.md },
  countdownText: { fontFamily: fonts.bold, fontSize: 13, color: colors.onBrandSecondary },
  banner: {
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    gap: 2,
  },
  bannerText: { fontFamily: fonts.medium, fontSize: 14, color: colors.onSurfaceSecondary },
  bannerCode: { fontFamily: fonts.monoBold },
  bannerLink: { fontFamily: fonts.bold, fontSize: 14, color: colors.brandPrimary },
  refChip: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: colors.surfaceTertiary, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.md },
  refChipText: { fontFamily: fonts.medium, fontSize: 12, color: colors.onSurfaceTertiary },
  previewWrap: { gap: spacing.sm },
  sectionLabel: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: colors.muted },
  form: { gap: spacing.lg },
  inlineError: { fontFamily: fonts.medium, fontSize: 12, color: colors.error, marginTop: -spacing.sm },
  existing: { paddingVertical: spacing.sm },
  existingText: { fontFamily: fonts.bold, fontSize: 14, color: colors.brandPrimary },
  fineprint: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16, color: colors.muted },
  focused: { outlineStyle: "solid", outlineWidth: 3, outlineColor: colors.focus, outlineOffset: 2 } as any,
}));
