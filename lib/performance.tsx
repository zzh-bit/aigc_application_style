"use client";

import React from "react";
import { useIsMobile } from "@/hooks/use-mobile";

type PerformanceProfile = {
  isMobile: boolean;
  prefersReducedMotion: boolean;
  /** 低性能模式：用于 WebView/低端机降级粒子/模糊/阴影/持续动效 */
  lowPerformanceMode: boolean;
};

const PerformanceContext = React.createContext<PerformanceProfile | null>(null);

function getPrefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
}

function getHardwareHeuristics(): { lowCpu: boolean; lowMemory: boolean } {
  if (typeof navigator === "undefined") return { lowCpu: false, lowMemory: false };
  const anyNav = navigator as unknown as {
    deviceMemory?: number;
    hardwareConcurrency?: number;
  };
  const cores = anyNav.hardwareConcurrency ?? 8;
  const mem = anyNav.deviceMemory ?? 8;
  return {
    lowCpu: cores <= 4,
    lowMemory: mem <= 4,
  };
}

export function PerformanceProvider({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(false);
  const [lowPerformanceMode, setLowPerformanceMode] = React.useState(false);

  React.useEffect(() => {
    const mql = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const update = () => setPrefersReducedMotion(getPrefersReducedMotion());
    update();
    mql?.addEventListener?.("change", update);
    return () => mql?.removeEventListener?.("change", update);
  }, []);

  React.useEffect(() => {
    const { lowCpu, lowMemory } = getHardwareHeuristics();
    // 规则：移动端/低 CPU/低内存 -> 开启降级；若用户偏好减少动效也强制降级
    setLowPerformanceMode(Boolean(isMobile || lowCpu || lowMemory || prefersReducedMotion));
  }, [isMobile, prefersReducedMotion]);

  const value = React.useMemo<PerformanceProfile>(
    () => ({ isMobile, prefersReducedMotion, lowPerformanceMode }),
    [isMobile, prefersReducedMotion, lowPerformanceMode],
  );

  return <PerformanceContext.Provider value={value}>{children}</PerformanceContext.Provider>;
}

export function usePerformanceProfile(): PerformanceProfile {
  const ctx = React.useContext(PerformanceContext);
  return (
    ctx ?? {
      isMobile: false,
      prefersReducedMotion: false,
      lowPerformanceMode: false,
    }
  );
}

