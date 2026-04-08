"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export type MoodType = "calm" | "anxious" | "excited" | "happy" | "sad";

interface MoodIndicatorProps {
  mood: MoodType;
  level: number; // 0-100
}

const moodStroke: Record<MoodType, string> = {
  calm: "#22d3ee",
  anxious: "#f87171",
  excited: "#fb923c",
  happy: "#fbbf24",
  sad: "#60a5fa",
};

const moodLabels: Record<MoodType, string> = {
  calm: "平静",
  anxious: "焦虑",
  excited: "兴奋",
  happy: "开心",
  sad: "难过",
};

export function MoodIndicator({ mood, level }: MoodIndicatorProps) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (level / 100) * circumference;

  return (
    <div className="flex items-center gap-2">
      <div className="relative w-12 h-12">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 44 44">
          {/* 背景圆环 */}
          <circle
            cx="22"
            cy="22"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className="text-muted/30"
          />
          {/* 进度圆环 */}
          <motion.circle
            cx="22"
            cy="22"
            r={radius}
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            stroke={moodStroke[mood]}
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </svg>
        <motion.div
          className={cn(
            "absolute inset-0 flex items-center justify-center text-xs font-medium",
            mood === "calm" && "text-cyan-300",
            mood === "anxious" && "text-red-300",
            mood === "excited" && "text-orange-300",
            mood === "happy" && "text-amber-300",
            mood === "sad" && "text-blue-300"
          )}
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          {level}%
        </motion.div>
      </div>
      <span className="text-xs text-muted-foreground hidden sm:block">{moodLabels[mood]}</span>
    </div>
  );
}
