"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Send } from "lucide-react";
import { useRef, useState } from "react";

interface InputBarProps {
  onSend?: (message: string) => void;
  disabled?: boolean;
}

export function InputBar({ onSend, disabled }: InputBarProps) {
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const resizeTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    const next = Math.min(el.scrollHeight, 136);
    el.style.height = `${Math.max(40, next)}px`;
  };

  const handleSend = () => {
    if (disabled) return;
    if (message.trim()) {
      onSend?.(message);
      setMessage("");
      const el = textareaRef.current;
      if (el) el.style.height = "40px";
    }
  };

  return (
    <motion.div
      className="w-full max-w-md md:max-w-lg mx-auto px-4"
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.5 }}
    >
      <div className="relative flex items-end gap-2.5 px-3 py-2.5 bg-card/40 backdrop-blur-xl rounded-2xl border border-border/40">
        <textarea
          ref={textareaRef}
          value={message}
          rows={1}
          onChange={(e) => {
            setMessage(e.target.value);
            resizeTextarea();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="说出你的想法..."
          disabled={disabled}
          aria-label="议题输入"
          className={cn(
            "flex-1 min-h-[40px] max-h-[136px] resize-none overflow-y-auto bg-transparent text-foreground placeholder:text-muted-foreground/50 outline-none text-[13px] leading-5 py-2",
            disabled && "opacity-60"
          )}
        />

        {/* 发送按钮 */}
        <button
          onClick={handleSend}
          disabled={disabled || !message.trim()}
          className={cn(
            "w-9 h-9 rounded-full flex items-center justify-center transition-all",
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
