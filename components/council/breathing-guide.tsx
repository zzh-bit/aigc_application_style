"use client";

import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

interface BreathingGuideProps {
  isActive: boolean;
  onReturn?: () => void;
}

type BreathPhase = "inhale" | "hold" | "exhale";

const phaseLabels: Record<BreathPhase, string> = {
  inhale: "吸气...",
  hold: "屏住...",
  exhale: "呼气...",
};

const phaseDurations: Record<BreathPhase, number> = {
  inhale: 4000,
  hold: 2000,
  exhale: 4000,
};

export function BreathingGuide({ isActive, onReturn }: BreathingGuideProps) {
  const [phase, setPhase] = useState<BreathPhase>("inhale");
  const [cycles, setCycles] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isActive) return;

    const phases: BreathPhase[] = ["inhale", "hold", "exhale"];
    let currentPhaseIndex = 0;
    let cancelled = false;

    const runPhase = () => {
      if (cancelled) return;
      const currentPhase = phases[currentPhaseIndex];
      setPhase(currentPhase);

      timerRef.current = window.setTimeout(() => {
        if (cancelled) return;
        currentPhaseIndex = (currentPhaseIndex + 1) % phases.length;
        if (currentPhaseIndex === 0) {
          setCycles((c) => c + 1);
        }
        runPhase();
      }, phaseDurations[currentPhase]);
    };

    runPhase();

    return () => {
      cancelled = true;
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setPhase("inhale");
      setCycles(0);
    };
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;
    if (cycles < 3) return;
    const doneTimer = window.setTimeout(() => {
      onReturn?.();
    }, 600);
    return () => window.clearTimeout(doneTimer);
  }, [isActive, cycles, onReturn]);

  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[oklch(0.12_0.03_280)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          <motion.button
            onClick={onReturn}
            className="absolute top-6 right-6 p-2 rounded-full bg-foreground/5 hover:bg-foreground/10 text-foreground/70 hover:text-foreground transition-colors"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <X className="w-5 h-5" />
          </motion.button>

          {/* 呼吸圆环 */}
          <div className="relative w-64 h-64 flex items-center justify-center">
            {/* 外层同心圆 */}
            {[1, 2, 3].map((ring) => (
              <motion.div
                key={ring}
                className="absolute rounded-full border border-future/30"
                style={{
                  width: `${100 + ring * 30}%`,
                  height: `${100 + ring * 30}%`,
                  opacity: 0.3,
                }}
                animate={
                  phase === "inhale"
                    ? { scale: [0.8, 1], opacity: [0.2, 0.4] }
                    : phase === "exhale"
                    ? { scale: [1, 0.8], opacity: [0.4, 0.2] }
                    : { scale: 1, opacity: 0.3 }
                }
                transition={{
                  duration: phaseDurations[phase] / 1000,
                  ease: "easeInOut",
                  delay: ring * 0.1,
                }}
              />
            ))}

            {/* 核心呼吸圆 */}
            <motion.div
              className="w-32 h-32 rounded-full bg-gradient-to-br from-future/40 to-primary/40 backdrop-blur-sm border border-future/50"
              animate={
                phase === "inhale"
                  ? { scale: [0.6, 1] }
                  : phase === "exhale"
                  ? { scale: [1, 0.6] }
                  : { scale: 1 }
              }
              transition={{
                duration: phaseDurations[phase] / 1000,
                ease: "easeInOut",
              }}
            >
              <motion.div
                className="w-full h-full rounded-full"
                animate={{
                  boxShadow:
                    phase === "inhale"
                      ? ["0 0 20px rgba(147,51,234,0.3)", "0 0 60px rgba(147,51,234,0.5)"]
                      : phase === "exhale"
                      ? ["0 0 60px rgba(147,51,234,0.5)", "0 0 20px rgba(147,51,234,0.3)"]
                      : "0 0 40px rgba(147,51,234,0.4)",
                }}
                transition={{
                  duration: phaseDurations[phase] / 1000,
                  ease: "easeInOut",
                }}
              />
            </motion.div>
          </div>

          {/* 引导文字 */}
          <motion.p
            key={phase}
            className="mt-12 text-2xl font-light text-foreground/80 tracking-wider"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            {phaseLabels[phase]}
          </motion.p>

          {/* 呼吸周期指示 */}
          <div className="absolute bottom-8 flex gap-2">
            {[1, 2, 3].map((i) => (
              <motion.div
                key={i}
                className={cn(
                  "w-2 h-2 rounded-full",
                  cycles >= i ? "bg-future" : "bg-foreground/20"
                )}
                animate={cycles >= i ? { scale: [1, 1.2, 1] } : {}}
                transition={{ duration: 0.3 }}
              />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
