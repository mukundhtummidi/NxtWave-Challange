import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fonts, makeStyles, radius, spacing } from "@/src/theme";

type ToastCtx = { show: (msg: string, kind?: "info" | "error") => void };
const Ctx = createContext<ToastCtx>({ show: () => {} });

export function useToast() {
  return useContext(Ctx);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<{ msg: string; kind: "info" | "error" } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((msg: string, kind: "info" | "error" = "info") => {
    setToast({ msg, kind });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      {toast && (
        <View style={[styles.host, { bottom: insets.bottom + spacing.lg }]}>
          <Animated.View entering={FadeInDown.duration(180)} exiting={FadeOutDown.duration(160)} style={[styles.toast, toast.kind === "error" && styles.error]} testID="toast" accessibilityLiveRegion="polite" accessibilityRole="alert">
            <Text style={styles.text}>{toast.msg}</Text>
          </Animated.View>
        </View>
      )}
    </Ctx.Provider>
  );
}

const useStyles = makeStyles((colors) => ({
  host: { position: "absolute", left: spacing.lg, right: spacing.lg, alignItems: "center", pointerEvents: "none" },
  toast: {
    backgroundColor: colors.surfaceInverse,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    maxWidth: 520,
    borderWidth: 2,
    borderColor: colors.surfaceInverse,
  },
  error: { backgroundColor: colors.error, borderColor: colors.error },
  text: { fontFamily: fonts.medium, fontSize: 14, color: colors.onSurfaceInverse, textAlign: "center" },
}));
