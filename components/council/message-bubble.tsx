"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Crown, Flame, Leaf, Sparkles, Telescope } from "lucide-react";
import type { RoleType } from "./role-seat";

interface MessageBubbleProps {
  role: RoleType;
  name: string;
  message: string;
  direction: "left" | "right" | "center";
  isHost?: boolean;
  isSpeaking?: boolean;
}

const roleAccentColors: Record<RoleType, string> = {
  radical: "bg-radical",
  conservative: "bg-conservative",
  future: "bg-future",
  mentor: "bg-blue-400",
  host: "bg-gradient-to-b from-host/80 to-host/40",
};

const speakingIcons: Record<RoleType, React.ReactNode> = {
  radical: <Flame className="w-3.5 h-3.5" />,
  conservative: <Leaf className="w-3.5 h-3.5" />,
  future: <Telescope className="w-3.5 h-3.5" />,
  mentor: <Sparkles className="w-3.5 h-3.5" />,
  host: <Crown className="w-3.5 h-3.5" />,
};

const directionVariants = {
  left: { x: -100, opacity: 0 },
  right: { x: 100, opacity: 0 },
  center: { y: -50, opacity: 0 },
};

export function MessageBubble({ role, name, message, direction, isHost = false, isSpeaking = false }: MessageBubbleProps) {
  return (
    <motion.div
      initial={directionVariants[direction]}
      animate={{ x: 0, y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={cn(
        "relative flex gap-2.5 p-3 rounded-2xl backdrop-blur-xl border border-border/50 max-w-[20rem] md:max-w-[22rem]",
        isHost
          ? "bg-gradient-to-r from-host/10 via-card/80 to-host/10"
          : "bg-card/60"
      )}
    >
      {/* 左侧光带 */}
      <div className={cn("absolute left-0 top-2 bottom-2 w-1 rounded-full", roleAccentColors[role])} />
      {isSpeaking && (
        <motion.div
          className="absolute -top-2 left-3 text-white/90"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: [0.3, 1, 0.3], y: [4, -2, 4] }}
          transition={{ duration: 1.1, repeat: Infinity }}
        >
          {speakingIcons[role]}
        </motion.div>
      )}
      
      {/* 主持人羽翼装饰 */}
      {isHost && (
        <>
          <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-8 opacity-30">
            <svg viewBox="0 0 20 40" className="w-full h-full fill-host">
              <path d="M20 20 Q5 10 2 0 Q5 10 0 20 Q5 30 2 40 Q5 30 20 20" />
            </svg>
          </div>
          <div className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-8 opacity-30 scale-x-[-1]">
            <svg viewBox="0 0 20 40" className="w-full h-full fill-host">
              <path d="M20 20 Q5 10 2 0 Q5 10 0 20 Q5 30 2 40 Q5 30 20 20" />
            </svg>
          </div>
        </>
      )}
      
      <div className="flex flex-col gap-1 pl-2.5">
        <span className={cn(
          "text-xs font-semibold",
          role === "radical" && "text-radical",
          role === "conservative" && "text-conservative",
          role === "future" && "text-future",
          role === "mentor" && "text-blue-300",
          role === "host" && "text-host"
        )}>
          {name}
        </span>
        <p className="text-[13px] text-foreground/90 leading-relaxed">{message}</p>
      </div>
    </motion.div>
  );
}
