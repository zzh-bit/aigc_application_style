"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Crown, Flame, Leaf, Telescope, UserCheck, LoaderCircle } from "lucide-react";

export type RoleType = "radical" | "conservative" | "future" | "mentor" | "host";

interface RoleSeatProps {
  role: RoleType;
  name: string;
  isActive?: boolean;
  isThinking?: boolean;
  isEmpty?: boolean;
  badgeText?: string;
  position: "top-left" | "top-right" | "top-center" | "bottom-left" | "bottom-right";
  isLandscape?: boolean;
}

const roleColors: Record<RoleType, string> = {
  radical: "text-radical",
  conservative: "text-conservative",
  future: "text-future",
  mentor: "text-blue-300",
  host: "text-host",
};

const roleBgColors: Record<RoleType, string> = {
  radical: "bg-radical/20",
  conservative: "bg-conservative/20",
  future: "bg-future/20",
  mentor: "bg-blue-400/20",
  host: "bg-host/20",
};

const roleShadowColors: Record<RoleType, string> = {
  radical: "shadow-radical/50",
  conservative: "shadow-conservative/50",
  future: "shadow-future/50",
  mentor: "shadow-blue-300/40",
  host: "shadow-host/50",
};

// 基础布局：顶部给未来派/主持人，底部给激进派/保守派；导师固定顶部居中
const positionClasses: Record<string, string> = {
  // 竖屏：两组派系分上下两排，确保同组水平对齐
  "top-left": "top-0 left-4 md:top-2 md:left-6",
  "top-right": "top-0 right-4 md:top-2 md:right-6",
  "top-center": "top-0 left-1/2 -translate-x-1/2 md:top-1",
  "bottom-left": "bottom-40 left-4 md:bottom-44 md:left-6",
  "bottom-right": "bottom-40 right-4 md:bottom-44 md:right-6",
};

const landscapePositionClasses: Record<string, string> = {
  // 横屏：未来派/主持人占原中排；激进派/保守派上移并与导师同水平
  "top-left": "top-[36%] -translate-y-1/2 left-4 md:left-6",
  "top-right": "top-[36%] -translate-y-1/2 right-4 md:right-6",
  "top-center": "top-1 left-1/2 -translate-x-1/2",
  "bottom-left": "top-1 left-4 md:left-6",
  "bottom-right": "top-1 right-4 md:right-6",
};

const roleIcons: Record<RoleType, React.ReactNode> = {
  radical: <Flame className="w-6 h-6" />,
  conservative: <Leaf className="w-6 h-6" />,
  future: <Telescope className="w-6 h-6" />,
  mentor: <UserCheck className="w-6 h-6" />,
  host: <Crown className="w-6 h-6" />,
};

export function RoleSeat({
  role,
  name,
  isActive = false,
  isThinking = false,
  isEmpty = false,
  badgeText,
  position,
  isLandscape = false,
}: RoleSeatProps) {
  const pos = (isLandscape ? landscapePositionClasses : positionClasses)[position];
  return (
    <motion.div
      className={cn(
        // 角色席位应始终在消息气泡之上，避免被覆盖
        "absolute z-20 flex flex-col items-center gap-2 p-2.5 md:p-3 rounded-xl transition-all duration-300",
        pos,
        isActive && roleBgColors[role]
      )}
      animate={isActive ? { scale: [1, 1.05, 1] } : { scale: 1 }}
      transition={{ duration: 2, repeat: isActive ? Infinity : 0, ease: "easeInOut" }}
    >
      <motion.div
        className={cn(
          "relative w-11 h-11 md:w-12 md:h-12 rounded-full border-2 flex items-center justify-center transition-all duration-300",
          isEmpty
            ? "border-dashed border-muted-foreground/40 text-muted-foreground/40"
            : isActive
            ? cn(roleColors[role], "border-current shadow-lg", roleShadowColors[role])
            : "border-muted-foreground/30 text-muted-foreground/50"
        )}
        animate={isActive ? { boxShadow: ["0 0 10px currentColor", "0 0 20px currentColor", "0 0 10px currentColor"] } : {}}
        transition={{ duration: 2, repeat: isActive ? Infinity : 0, ease: "easeInOut" }}
      >
        {isEmpty ? (
          <span className="text-[10px]">空</span>
        ) : (
          <span className="select-none">
            {role === "mentor" && typeof badgeText === "string" && badgeText.trim().length > 0 ? (
              <span className="text-[11px] font-semibold tracking-wide">{badgeText.trim()}</span>
            ) : (
              roleIcons[role]
            )}
          </span>
        )}

        {isThinking && !isEmpty && (
          <motion.div
            className="absolute -bottom-2 -right-2 w-6 h-6 rounded-full bg-card/70 border border-border/60 backdrop-blur flex items-center justify-center"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}>
              <LoaderCircle className="w-4 h-4" />
            </motion.div>
          </motion.div>
        )}
        {isActive && (
          <motion.div
            className={cn("absolute inset-0 rounded-full border-2 border-current", roleColors[role])}
            initial={{ scale: 1, opacity: 1 }}
            animate={{ scale: 1.5, opacity: 0 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
          />
        )}
      </motion.div>
      <span className={cn(
        "text-[11px] md:text-xs font-medium transition-colors duration-300",
        isActive ? roleColors[role] : "text-muted-foreground/50"
      )}>
        {name}
      </span>
    </motion.div>
  );
}
