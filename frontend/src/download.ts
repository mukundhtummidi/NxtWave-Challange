import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

/** Downloads the 1080x1920 story PNG. Web: browser download. Native: save to cache + share sheet. */
export async function downloadStory(url: string, seatCode: string): Promise<"downloaded" | "shared" | "opened"> {
  if (Platform.OS === "web") {
    const a = document.createElement("a");
    a.href = url;
    a.download = `hall-ticket-${seatCode}.png`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return "downloaded";
  }
  const target = `${FileSystem.cacheDirectory}hall-ticket-${seatCode}.png`;
  const res = await FileSystem.downloadAsync(url, target);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(res.uri, { mimeType: "image/png", dialogTitle: "Save or share your hall ticket" });
    return "shared";
  }
  return "opened";
}
