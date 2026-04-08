"use client";

import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { Pin, X } from "lucide-react";
import { useState } from "react";

interface MemoryFragmentProps {
  source: string;
  content: string;
  isVisible: boolean;
  onClose?: () => void;
  onPin?: () => void;
}

export function MemoryFragment({ source, content, isVisible, onClose, onPin }: MemoryFragmentProps) {
  const [isPinned, setIsPinned] = useState(false);

  const handlePin = () => {
    setIsPinned(true);
    onPin?.();
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ x: 100, opacity: 0, scale: 0.8, rotate: 5 }}
          animate={{ x: 0, opacity: 1, scale: 1, rotate: 0 }}
          exit={{ opacity: 0, scale: 0.8, x: 50 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className={cn(
            "relative max-w-xs p-4 backdrop-blur-xl border border-primary/30 rounded-lg",
            "bg-gradient-to-br from-card/80 to-primary/10",
            // 不规则撕裂状边缘效果
            "before:absolute before:inset-0 before:rounded-lg before:shadow-[0_0_15px_rgba(139,92,246,0.3)]"
          )}
          style={{
            clipPath: "polygon(0% 0%, 100% 2%, 98% 100%, 2% 98%)",
          }}
        >
          {/* 边缘微光效果 */}
          <motion.div
            className="absolute inset-0 rounded-lg pointer-events-none"
            animate={{
              boxShadow: [
                "0 0 10px rgba(139,92,246,0.3)",
                "0 0 20px rgba(139,92,246,0.5)",
                "0 0 10px rgba(139,92,246,0.3)",
              ],
            }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />

          {/* 标签 */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-primary/80 font-medium px-2 py-0.5 bg-primary/10 rounded-full">
              {source}
            </span>
            <div className="flex gap-1">
              <button
                onClick={handlePin}
                className={cn(
                  "p-1 rounded-full transition-colors",
                  isPinned ? "text-host bg-host/20" : "text-muted-foreground hover:text-primary"
                )}
              >
                <Pin className="w-3 h-3" />
              </button>
              <button
                onClick={onClose}
                className="p-1 rounded-full text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* 记忆内容 */}
          <p className="text-sm text-foreground/80 leading-relaxed italic">
            {`"${content}"`}
          </p>

          {/* 撕裂装饰线 */}
          <div className="absolute -right-1 top-4 bottom-4 w-px bg-gradient-to-b from-transparent via-primary/50 to-transparent" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
