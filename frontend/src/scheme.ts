import { useCallback } from "react";

import { ColorScheme, setColorScheme, useTheme } from "@/src/theme";
import { storage } from "@/src/utils/storage";

const KEY = "hallticket.scheme";

export async function restoreScheme() {
  const saved = await storage.getItem(KEY, null);
  if (saved === "light" || saved === "dark") setColorScheme(saved as ColorScheme);
}

export function useSchemeToggle() {
  const { scheme } = useTheme();
  const toggle = useCallback(async () => {
    const next: ColorScheme = scheme === "dark" ? "light" : "dark";
    setColorScheme(next);
    await storage.setItem(KEY, next);
  }, [scheme]);
  return { scheme, toggle };
}
