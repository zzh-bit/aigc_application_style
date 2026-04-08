"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Send } from "lucide-react";
import { useState } from "react";

interface InputBarProps {
  onSend?: (message: string) => void;
  disabled?: boolean;
}

export function InputBar({ onSend, disabled }: InputBarProps) {
  const [message, setMessage] = useState("");

  const handleSend = () => {
    if (disabled) return;
    if (message.trim()) {
      onSend?.(message);
      setMessage("");
    }
  };

  return (
    <motion.div
      className="w-full max-w-lg md:max-w-xl mx-auto px-4"
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.5 }}
    >
      <div className="relative flex items-center gap-3 px-4 py-3 bg-card/40 backdrop-blur-xl rounded-full border border-border/50">
        {/* 输入框 */}
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="说出你的想法..."
          disabled={disabled}
          className={cn(
            "flex-1 bg-transparent text-foreground placeholder:text-muted-foreground/50 outline-none text-sm",
            disabled && "opacity-60"
          )}
        />

        {/* 发送按钮 */}
        <button
          onClick={handleSend}
          disabled={disabled || !message.trim()}
          className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center transition-all",
            !disabled && message.trim()
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-secondary text-muted-foreground cursor-not-allowed"
          )}
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}
