// Shared clipboard helper. Returns true only when the text actually landed on the clipboard.
import * as Clipboard from "expo-clipboard";
import { Platform } from "react-native";

export const COPY_FAILED_MESSAGE = "Couldn't copy. Press and hold the link below to copy it";

function execCommandCopy(text: string): boolean {
  if (typeof document === "undefined") return false;
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.top = "0";
  ta.style.left = "0";
  ta.style.opacity = "0";
  ta.style.pointerEvents = "none";
  document.body.appendChild(ta);
  try {
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    return document.execCommand("copy") === true;
  } catch {
    return false;
  } finally {
    ta.remove();
  }
}

export async function copyText(text: string): Promise<boolean> {
  if (!text) return false;
  if (Platform.OS === "web") {
    // 1. Async Clipboard API (needs a secure context + user gesture; blocked in many iframes).
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // fall through to the legacy path
    }
    // 2. Legacy hidden-textarea + execCommand("copy").
    return execCommandCopy(text);
  }
  // 3. Native (Expo Go / dev build).
  try {
    return await Clipboard.setStringAsync(text);
  } catch {
    return false;
  }
}
