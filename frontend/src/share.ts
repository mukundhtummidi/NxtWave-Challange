import { Linking, Platform } from "react-native";

export type Tone = "casual" | "placement" | "funny";

export const TONES: { key: Tone; label: string }[] = [
  { key: "casual", label: "Casual" },
  { key: "placement", label: "Placement pressure" },
  { key: "funny", label: "Funny" },
];

export function buildMessage(tone: Tone, opts: { name: string; date: string; link: string; project: string }): string {
  const { date, link, project } = opts;
  switch (tone) {
    case "placement":
      return `Placements are close and "AI project" on the resume actually matters now.\nFree 60-min workshop on ${date}, you leave with a working project (mine: ${project}).\nGrab a seat: ${link}`;
    case "funny":
      return `Breaking: I am now an AI engineer (hall ticket pending, skills loading).\nFree 60-min workshop on ${date}, come fail-then-succeed with me.\nSeat here: ${link}`;
    default:
      return `Yo, booked a seat for a free 60-min AI workshop on ${date}. You build an actual project live, no theory dump.\nGet your hall ticket: ${link}`;
  }
}

export function buildRepMessage(tone: Tone, opts: { date: string; link: string; college: string }): string {
  const { date, link, college } = opts;
  switch (tone) {
    case "placement":
      return `${college} folks: free 60-min AI workshop on ${date}, you walk out with a real project for your resume.\nSeats are per college, grab yours before the batch does.\nHall ticket: ${link}`;
    case "funny":
      return `PSA for ${college}: become an AI engineer in 60 minutes (results may vary, snacks not included).\nFree workshop on ${date}. First 25 from our college unlock a template pack.\nSeat here: ${link}`;
    default:
      return `Hey ${college} batch, free 60-min AI workshop on ${date}. You build an actual project live, no theory dump.\nGet your hall ticket: ${link}`;
  }
}

export function openWhatsApp(message: string) {
  const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
  if (Platform.OS === "web") {
    window.open(url, "_blank", "noopener");
    return;
  }
  Linking.openURL(url);
}

// ---------------------------------------------------------------------------
// Multi-platform sharing
// ---------------------------------------------------------------------------
export type Channel = "whatsapp" | "telegram" | "linkedin" | "x" | "facebook" | "instagram" | "email" | "native" | "copy";

/** Build the share-intent URL for a platform. Returns null for platforms with no web intent
 *  (instagram, native, copy) — those are handled specially in the UI. */
export function platformShareUrl(channel: Channel, opts: { url: string; text: string; subject: string }): string | null {
  const { url, text, subject } = opts;
  switch (channel) {
    case "whatsapp":
      return `https://wa.me/?text=${encodeURIComponent(text)}`;
    case "telegram":
      return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
    case "linkedin":
      return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
    case "x":
      return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
    case "email":
      return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
    default:
      return null;
  }
}

export function openUrl(url: string) {
  if (Platform.OS === "web") {
    window.open(url, "_blank", "noopener");
    return;
  }
  Linking.openURL(url);
}
