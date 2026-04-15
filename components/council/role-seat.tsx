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

// 让四周分布更均匀：四派系固定四角；导师留在顶部居中；底部预留输入区高度
const positionClasses: Record<string, string> = {
  "top-left": "top-4 left-4 md:top-6 md:left-6",
  "top-right": "top-4 right-4 md:top-6 md:right-6",
  "top-center": "top-0.5 left-1/2 -translate-x-1/2 md:top-2",
  "bottom-left": "bottom-32 left-4 md:bottom-36 md:left-6",
  "bottom-right": "bottom-32 right-4 md:bottom-36 md:right-6",
};

const landscapePositionClasses: Record<string, string> = {
  // 横屏：左侧顺序需要是 PS² -> 激进派 -> 未来派，因此激进派放到中上段
  "top-left": "top-[39%] -translate-y-1/2 left-4 md:left-6",
  "top-right": "top-[39%] -translate-y-1/2 right-4 md:right-6",
  // 顶到最上侧：与顶部 PS² 齐平或略高
  "top-center": "top-1 left-1/2 -translate-x-1/2",
  "bottom-left": "bottom-28 left-4 md:bottom-32 md:left-6",
  "bottom-right": "bottom-28 right-4 md:bottom-32 md:right-6",
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
