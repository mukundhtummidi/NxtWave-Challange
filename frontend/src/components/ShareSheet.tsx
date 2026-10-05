import Ionicons from "@react-native-vector-icons/ionicons";
import React, { useState } from "react";
import { Platform, Pressable, Share, Text, View } from "react-native";

import type { Ticket, Workshop } from "@/src/api";
import { copyText, COPY_FAILED_MESSAGE } from "@/src/clipboard";
import { Button } from "@/src/components/Button";
import { downloadStory } from "@/src/download";
import { buildMessage, Channel, openUrl, platformShareUrl, TONES, Tone } from "@/src/share";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { track } from "@/src/track";

type Props = {
  ticket: Ticket;
  workshop?: Workshop;
  onToast: (msg: string, kind?: "info" | "error") => void;
};

const canNativeShare = Platform.OS !== "web" || (typeof navigator !== "undefined" && typeof (navigator as any).share === "function");

export function ShareSheet({ ticket, workshop, onToast }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [tone, setTone] = useState<Tone>("casual");
  const [downloading, setDownloading] = useState(false);

  // The link is the backend share page (serves OG preview tags), carrying the platform via=.
  const channelUrl = (ch: Channel) => `${ticket.share_url}?via=${ch}`;
  const messageFor = (ch: Channel) =>
    buildMessage(tone, { name: ticket.name, date: workshop?.datetime_label ?? "", link: channelUrl(ch), project: ticket.project.title });
  const subject = `Free 60-min AI workshop · ${workshop?.datetime_label ?? ""}`;

  // Preview uses a neutral copy link so the shown text matches what "Copy message" copies.
  const previewMessage = messageFor("copy");

  const logShare = (ch: Channel) => track("share_clicked", { path: "/ticket", seat_code: ticket.seat_code, tone, channel: ch });

  // Platforms with a web share intent (open the composer directly).
  const shareIntent = (ch: Channel) => {
    logShare(ch);
    const url = platformShareUrl(ch, { url: channelUrl(ch), text: messageFor(ch), subject });
    if (url) openUrl(url);
  };

  // LinkedIn & Facebook accept only a URL, so copy the message text for the user to paste.
  const shareUrlOnly = async (ch: Channel) => {
    logShare(ch);
    const ok = await copyText(messageFor(ch));
    onToast(ok ? "Message copied — paste it into your post." : COPY_FAILED_MESSAGE, ok ? undefined : "error");
    const url = platformShareUrl(ch, { url: channelUrl(ch), text: messageFor(ch), subject });
    if (url) openUrl(url);
  };

  // Instagram has no web share URL: save the story image + copy the link to add as a sticker.
  const shareInstagram = async () => {
    logShare("instagram");
    setDownloading(true);
    try {
      await downloadStory(ticket.story_url, ticket.seat_code);
    } catch {
      // image is best-effort; link is still copied below
    } finally {
      setDownloading(false);
    }
    await copyText(channelUrl("instagram"));
    onToast("Story image saved and link copied. Add the link as a sticker in Instagram.");
  };

  const shareNative = async () => {
    logShare("native");
    const link = channelUrl("native");
    const msg = messageFor("native");
    if (Platform.OS === "web") {
      try {
        await (navigator as any).share({ title: "Your Hall Ticket", text: msg, url: link });
      } catch {
        // user dismissed; ignore
      }
    } else {
      try {
        await Share.share({ message: `${msg}` });
      } catch {
        // ignore
      }
    }
  };

  const copyLink = async () => {
    logShare("copy");
    const ok = await copyText(channelUrl("copy"));
    onToast(ok ? "Link copied" : COPY_FAILED_MESSAGE, ok ? undefined : "error");
  };

  const copyMessage = async () => {
    const ok = await copyText(previewMessage);
    if (ok) {
      track("message_copied", { path: "/ticket", seat_code: ticket.seat_code, tone });
      onToast("Message copied");
    } else onToast(COPY_FAILED_MESSAGE, "error");
  };

  const download = async () => {
    setDownloading(true);
    try {
      const r = await downloadStory(ticket.story_url, ticket.seat_code);
      onToast(r === "downloaded" ? "Ticket image downloading (1080×1920)" : "Ticket image ready to save");
    } catch {
      onToast("Could not download. Try again.");
    } finally {
      setDownloading(false);
    }
  };

  type Btn = { key: string; testID: string; label: string; icon: any; onPress: () => void; brand?: string };
  const platformButtons: Btn[] = [
    { key: "whatsapp", testID: "share-whatsapp-button", label: "WhatsApp", icon: "logo-whatsapp", onPress: () => shareIntent("whatsapp") },
    { key: "telegram", testID: "share-telegram-button", label: "Telegram", icon: "paper-plane", onPress: () => shareIntent("telegram") },
    { key: "x", testID: "share-x-button", label: "X", icon: "logo-twitter", onPress: () => shareIntent("x") },
    { key: "linkedin", testID: "share-linkedin-button", label: "LinkedIn", icon: "logo-linkedin", onPress: () => shareUrlOnly("linkedin") },
    { key: "facebook", testID: "share-facebook-button", label: "Facebook", icon: "logo-facebook", onPress: () => shareUrlOnly("facebook") },
    { key: "instagram", testID: "share-instagram-button", label: "Instagram", icon: "logo-instagram", onPress: shareInstagram },
    { key: "email", testID: "share-email-button", label: "Email", icon: "mail-outline", onPress: () => shareIntent("email") },
  ];
  if (canNativeShare) {
    platformButtons.push({ key: "native", testID: "share-more-button", label: "More…", icon: "ellipsis-horizontal", onPress: shareNative });
  }

  return (
    <View style={styles.wrap} testID="share-sheet">
      <Text style={styles.heading}>Spread the word</Text>
      <Text style={styles.sub}>Every friend who registers with your link counts for your campus bar.</Text>

      <View style={styles.toneRow} accessibilityRole="radiogroup" accessibilityLabel="Message tone">
        {TONES.map((t) => {
          const selected = t.key === tone;
          return (
            <Pressable
              key={t.key}
              testID={`tone-${t.key}`}
              accessibilityRole="radio"
              accessibilityState={{ selected, checked: selected }}
              onPress={() => setTone(t.key)}
              style={({ focused }: any) => [styles.tone, selected && styles.toneSelected, focused && styles.focused]}
            >
              <Text style={[styles.toneText, selected && styles.toneTextSelected]} numberOfLines={1}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.preview} testID="share-message-preview">
        <Text style={styles.previewText} selectable>
          {previewMessage}
        </Text>
      </View>

      <View style={styles.platformGrid} testID="share-platforms">
        {platformButtons.map((b) => (
          <Pressable
            key={b.key}
            testID={b.testID}
            accessibilityRole="button"
            accessibilityLabel={`Share on ${b.label}`}
            onPress={b.onPress}
            disabled={b.key === "instagram" && downloading}
            style={({ focused }: any) => [styles.platformBtn, focused && styles.focused]}
          >
            <Ionicons name={b.icon} size={20} color={colors.onSurface} />
            <Text style={styles.platformLabel} numberOfLines={1}>
              {b.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.row}>
        <Button
          testID="download-ticket-button"
          title="Download as image"
          onPress={download}
          loading={downloading}
          variant="outline"
          style={{ flex: 1 }}
          icon={<Ionicons name="download-outline" size={18} color={colors.onSurface} />}
        />
        <Button
          testID="copy-link-button"
          title="Copy link"
          onPress={copyLink}
          variant="outline"
          icon={<Ionicons name="link-outline" size={18} color={colors.onSurface} />}
        />
      </View>
      <Button
        testID="copy-message-button"
        title="Copy message"
        onPress={copyMessage}
        variant="outline"
        icon={<Ionicons name="copy-outline" size={18} color={colors.onSurface} />}
      />
      <Text style={styles.refLink} testID="ref-link" selectable>
        {channelUrl("copy")}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { gap: spacing.md },
  heading: { fontFamily: fonts.bold, fontSize: 20, color: colors.onSurface },
  sub: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted, lineHeight: 19 },
  toneRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  tone: {
    height: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceSecondary,
    justifyContent: "center",
  },
  toneSelected: { backgroundColor: colors.brandSecondary, borderColor: colors.border },
  toneText: { fontFamily: fonts.medium, fontSize: 13, color: colors.onSurfaceSecondary },
  toneTextSelected: { color: colors.onBrandSecondary },
  focused: { outlineStyle: "solid", outlineWidth: 3, outlineColor: colors.focus, outlineOffset: 2 } as any,
  preview: { borderWidth: 2, borderColor: colors.border, borderStyle: "dashed", borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.surfaceSecondary },
  previewText: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.onSurfaceSecondary },
  platformGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  platformBtn: {
    flexGrow: 1,
    flexBasis: "30%",
    minWidth: 100,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
  },
  platformLabel: { fontFamily: fonts.bold, fontSize: 13, color: colors.onSurface },
  row: { flexDirection: "row", gap: spacing.sm },
  refLink: { fontFamily: fonts.mono, fontSize: 12, color: colors.muted },
}));
