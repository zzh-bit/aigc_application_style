"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useCallback } from "react";
import { Settings, HelpCircle, Brain, Sun } from "lucide-react";
import { storageClearAll, storageExportAll } from "@/lib/storage";
import { DEFAULT_APP_SETTINGS, type AppSettings } from "@/lib/app-settings";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// 预生成固定粒子数据（象征记忆碎片）
const FIXED_PARTICLES = Array.from({ length: 100 }).map((_, i) => ({
  x: ((i * 37 + 13) % 100),
  y: ((i * 41 + 17) % 100),
  size: ((i * 7 + 3) % 3) + 1,
  duration: 25 + ((i * 13) % 35),
  delay: ((i * 19) % 20),
}));

// 导师类型图标（末层为最前卡片，参考设计稿：绿色光感太阳纹）
const MENTOR_ICONS = [
  { icon: "philosophy", label: "哲学思辨", color: "#8B5CF6" },
  { icon: "balance", label: "理性分析", color: "#3B82F6" },
  { icon: "sun", label: "洞察核心", color: "#10B981" },
] as const;

function MentorColumn({
  isLandscape,
  isHoveringMentor,
  setHoverMentor,
  onGoToMentor,
}: {
  isLandscape: boolean;
  isHoveringMentor: boolean;
  setHoverMentor: (v: boolean) => void;
  onGoToMentor?: () => void;
}) {
  return (
    <motion.div
      className={`pointer-events-auto flex flex-col items-center ${isLandscape ? "flex-1 min-w-0 max-w-[30%]" : "flex-1"}`}
      role="button"
      tabIndex={0}
      onClick={() => onGoToMentor?.()}
      onPointerUp={(e) => {
        if (e.pointerType !== "mouse") onGoToMentor?.();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onGoToMentor?.();
      }}
      onMouseEnter={() => setHoverMentor(true)}
      onMouseLeave={() => setHoverMentor(false)}
    >
      <div className={`relative flex items-center justify-center ${isLandscape ? "w-32 h-24" : "w-36 h-28"}`}>
        {MENTOR_ICONS.map((mentor, i) => {
          const baseAngle = -20 + i * 20;
          const hoverAngle = -30 + i * 30;
          return (
            <motion.div
              key={mentor.icon}
              className={`absolute rounded-xl backdrop-blur-sm flex items-center justify-center z-[1] ${isLandscape ? "w-14 h-20" : "w-16 h-24"}`}
              style={{
                background: `linear-gradient(135deg, ${mentor.color}20, transparent)`,
                border: `1px solid ${mentor.color}30`,
                transformOrigin: "bottom center",
                zIndex: i + 1,
              }}
              animate={{
                rotate: isHoveringMentor ? hoverAngle : baseAngle,
                y: isHoveringMentor ? -10 : 0,
              }}
              transition={{ duration: 0.4 }}
            >
              <div
                className={`${isLandscape ? "w-7 h-7" : "w-8 h-8"} rounded-full flex items-center justify-center`}
                style={{
                  background: `${mentor.color}30`,
                  boxShadow: mentor.icon === "sun" ? `0 0 12px ${mentor.color}88` : undefined,
                }}
              >
                {mentor.icon === "philosophy" && (
                  <svg className={`${isLandscape ? "w-4 h-4" : "w-5 h-5"}`} viewBox="0 0 24 24" fill="none" stroke={mentor.color} strokeWidth="1.5">
                    <circle cx="12" cy="8" r="5" />
                    <path d="M12 13v8M8 17h8" />
                  </svg>
                )}
                {mentor.icon === "balance" && (
                  <svg className={`${isLandscape ? "w-4 h-4" : "w-5 h-5"}`} viewBox="0 0 24 24" fill="none" stroke={mentor.color} strokeWidth="1.5">
                    <path d="M12 3v18M3 9l3-3 3 3M15 9l3-3 3 3M6 9v6a3 3 0 003 3M15 9v6a3 3 0 003 3" />
                  </svg>
                )}
                {mentor.icon === "sun" && (
                  <Sun className={`${isLandscape ? "w-4 h-4" : "w-5 h-5"}`} color={mentor.color} strokeWidth={1.5} />
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className={`text-center ${isLandscape ? "mt-2" : "mt-3"}`}>
        <h3 className={`${isLandscape ? "text-sm" : "text-base"} font-medium text-white/90`}>虚拟导师</h3>
        <p className={`${isLandscape ? "text-[10px] mt-0.5" : "text-xs mt-1"} text-white/50`}>引入顶级心智模型</p>
      </div>

      <motion.button
        onClick={() => onGoToMentor?.()}
        onTouchEnd={(e) => {
          e.preventDefault();
          onGoToMentor?.();
        }}
        onPointerUp={(e) => {
          if (e.pointerType !== "mouse") onGoToMentor?.();
        }}
        className={`${isLandscape ? "mt-2 px-3 py-1.5 text-[10px]" : "mt-3 px-4 py-2 text-xs"} rounded-full backdrop-blur-sm text-white/80`}
        style={{
          touchAction: "manipulation",
          backgroundColor: "rgba(255,255,255,0.1)",
          border: "1px solid rgba(255,255,255,0.2)",
        }}
        whileHover={{ scale: 1.05, backgroundColor: "rgba(255,255,255,0.15)" }}
        whileTap={{ scale: 0.98 }}
      >
        聘请导师
      </motion.button>
    </motion.div>
  );
}

function LettersColumn({
  isLandscape,
  isHoveringLetter,
  setHoverLetter,
  flyingLetters,
  onGoToLetters,
}: {
  isLandscape: boolean;
  isHoveringLetter: boolean;
  setHoverLetter: (v: boolean) => void;
  flyingLetters: number[];
  onGoToLetters?: () => void;
}) {
  return (
    <motion.div
      className={`pointer-events-auto flex flex-col items-center ${isLandscape ? "flex-1 min-w-0 max-w-[30%]" : "flex-1"}`}
      role="button"
      tabIndex={0}
      onClick={() => onGoToLetters?.()}
      onPointerUp={(e) => {
        if (e.pointerType !== "mouse") onGoToLetters?.();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onGoToLetters?.();
      }}
      onMouseEnter={() => setHoverLetter(true)}
      onMouseLeave={() => setHoverLetter(false)}
    >
      <div className={`relative flex items-center justify-center ${isLandscape ? "w-28 h-28" : "w-32 h-32"}`}>
        <motion.div
          className={`relative rounded-2xl ${isLandscape ? "w-20 h-24" : "w-24 h-28"}`}
          style={{
            background: "linear-gradient(135deg, rgba(245,158,11,0.1) 0%, rgba(245,158,11,0.05) 100%)",
            border: "2px solid rgba(245,158,11,0.5)",
            boxShadow: "0 0 30px rgba(245,158,11,0.2)",
          }}
        >
          <svg className="absolute inset-0 w-full h-full opacity-30" viewBox="0 0 96 112">
            <path d="M10 20h20M30 20v20M30 40h15M45 40v30M45 70h20M65 70v20" stroke="#F59E0B" strokeWidth="1" fill="none" />
            <path d="M86 30h-20M66 30v25M66 55h-15M51 55v25M51 80h-20M31 80v10" stroke="#F59E0B" strokeWidth="1" fill="none" />
          </svg>
          <motion.div
            className="absolute top-1/3 left-1/2 -translate-x-1/2 w-12 h-8 rounded overflow-hidden"
            style={{
              background: "linear-gradient(to bottom, rgba(245,158,11,0.2), transparent)",
              border: "1px solid rgba(245,158,11,0.6)",
            }}
          >
            <motion.div
              className="absolute inset-0"
              style={{ backgroundColor: "rgba(245,158,11,0.3)", transformOrigin: "top" }}
              animate={{
                scaleY: isHoveringLetter ? [1, 0, 1] : [1, 0.3, 1],
              }}
              transition={{
                duration: isHoveringLetter ? 0.5 : 2,
                repeat: Infinity,
              }}
            />
          </motion.div>
        </motion.div>

        <AnimatePresence>
          {flyingLetters.map((id, i) => (
            <motion.div
              key={id}
              className="absolute w-6 h-4 rounded-sm"
              style={{
                backgroundColor: "rgba(245,158,11,0.6)",
                boxShadow: "0 0 10px rgba(245,158,11,0.5)",
              }}
              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              animate={{
                x: 100 + i * 20,
                y: -80 - i * 10,
                opacity: 0,
                scale: 0.5,
                rotate: 15,
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.5, ease: "easeOut" }}
            />
          ))}
        </AnimatePresence>
      </div>

      <div className={`text-center ${isLandscape ? "mt-1" : "mt-2"}`}>
        <h3 className={`${isLandscape ? "text-sm" : "text-base"} font-medium text-white/90`}>未来信件</h3>
        <p className={`${isLandscape ? "text-[10px] mt-0.5" : "text-xs mt-1"} text-white/50`}>与时空中的自己对话</p>
      </div>

      <motion.button
        onClick={() => onGoToLetters?.()}
        onTouchEnd={(e) => {
          e.preventDefault();
          onGoToLetters?.();
        }}
        onPointerUp={(e) => {
          if (e.pointerType !== "mouse") onGoToLetters?.();
        }}
        className={`${isLandscape ? "mt-2 px-3 py-1.5 text-[10px]" : "mt-3 px-4 py-2 text-xs"} rounded-full backdrop-blur-sm text-white/80`}
        style={{
          touchAction: "manipulation",
          backgroundColor: "rgba(255,255,255,0.1)",
          border: "1px solid rgba(255,255,255,0.2)",
        }}
        whileHover={{ scale: 1.05, backgroundColor: "rgba(255,255,255,0.15)" }}
        whileTap={{ scale: 0.98 }}
      >
        写信 / 收信
      </motion.button>
    </motion.div>
  );
}

function WelcomeCenterHub({
  isLandscape,
  typedText,
  isHoveringStart,
  setHoverStart,
  onEnter,
}: {
  isLandscape: boolean;
  typedText: string;
  isHoveringStart: boolean;
  setHoverStart: (v: boolean) => void;
  onEnter: () => void;
}) {
  return (
    <div
      className={`pointer-events-auto flex flex-col items-center shrink-0 ${isLandscape ? "w-[36%] max-w-[320px]" : ""}`}
      role="button"
      tabIndex={0}
      onClick={onEnter}
      onPointerUp={(e) => {
        if (e.pointerType !== "mouse") onEnter();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onEnter();
      }}
    >
      <h2 className={`${isLandscape ? "text-lg mb-0.5" : "text-2xl mb-2"} font-light text-white/90 tracking-wide text-center`}>
        与你的平行自我对话
      </h2>
      <div className={`${isLandscape ? "h-4 -mt-1" : "h-5 -mt-0.5"} flex items-center justify-center w-full`}>
        <p className={`${isLandscape ? "text-[11px]" : "text-sm"} font-light text-white/50 tracking-wider text-center px-1`}>
          {typedText}
          <motion.span
            className="inline-block w-0.5 h-4 bg-[#3B82F6] ml-1 align-middle"
            animate={{ opacity: [1, 0, 1] }}
            transition={{ duration: 0.8, repeat: Infinity }}
          />
        </p>
      </div>
      <motion.button
        onClick={onEnter}
        onTouchEnd={(e) => {
          e.preventDefault();
          onEnter();
        }}
        onPointerUp={(e) => {
          if (e.pointerType !== "mouse") onEnter();
        }}
        onMouseEnter={() => setHoverStart(true)}
        onMouseLeave={() => setHoverStart(false)}
        className={`relative rounded-full flex items-center justify-center cursor-pointer ${isLandscape ? "mt-5 w-[92px] h-[92px]" : "mt-7 w-[120px] h-[120px]"}`}
        style={{
          touchAction: "manipulation",
          background: "rgba(59,130,246,0.1)",
          backdropFilter: "blur(10px)",
          border: "1px solid rgba(59,130,246,0.3)",
        }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.98 }}
        animate={{
          boxShadow: isHoveringStart
            ? "0 0 60px rgba(59,130,246,0.5), inset 0 0 30px rgba(59,130,246,0.2)"
            : [
                "0 0 30px rgba(59,130,246,0.2), inset 0 0 15px rgba(59,130,246,0.1)",
                "0 0 45px rgba(59,130,246,0.35), inset 0 0 20px rgba(59,130,246,0.15)",
                "0 0 30px rgba(59,130,246,0.2), inset 0 0 15px rgba(59,130,246,0.1)",
              ],
        }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      >
        <motion.div
          animate={{
            rotate: isHoveringStart ? 360 : 0,
            scale: isHoveringStart ? 1.1 : 1,
          }}
          transition={{
            rotate: { duration: isHoveringStart ? 1 : 8, repeat: Infinity, ease: "linear" },
            scale: { duration: 0.3 },
          }}
        >
          <svg
            width={isLandscape ? 40 : 48}
            height={isLandscape ? 40 : 48}
            viewBox="0 0 48 48"
            fill="none"
            className="text-[#3B82F6]"
          >
            <motion.path
              d="M24 4L42 16V32L24 44L6 32V16L24 4Z"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
              animate={{
                strokeOpacity: [0.6, 1, 0.6],
              }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <motion.path
              d="M24 4V44M6 16L42 32M42 16L6 32"
              stroke="currentColor"
              strokeWidth="1"
              strokeOpacity="0.5"
              fill="none"
            />
            <motion.circle
              cx="24"
              cy="24"
              r="6"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="rgba(59,130,246,0.2)"
              animate={{
                r: [6, 7, 6],
                fillOpacity: [0.2, 0.4, 0.2],
              }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          </svg>
        </motion.div>
        <span className={`absolute text-white/70 whitespace-nowrap ${isLandscape ? "-bottom-8 text-xs" : "-bottom-10 text-sm"}`}>
          与我的平行自我对话
        </span>
      </motion.button>
    </div>
  );
}

interface WelcomeScreenProps {
  onEnter: () => void;
  onGoToMentor?: () => void;
  onGoToLetters?: () => void;
  onGoToDecisionTree?: () => void;
  settings?: AppSettings;
  onSettingsChange?: (next: AppSettings) => void;
}

export function WelcomeScreen({ onEnter, onGoToMentor, onGoToLetters, onGoToDecisionTree, settings, onSettingsChange }: WelcomeScreenProps) {
  const [mounted, setMounted] = useState(false);
  const [clockText, setClockText] = useState("");
  const [isHoveringMentor, setIsHoveringMentor] = useState(false);
  const [isHoveringLetter, setIsHoveringLetter] = useState(false);
  const [isHoveringStart, setIsHoveringStart] = useState(false);

  const [isExiting, setIsExiting] = useState(false);
  const [flyingLetters, setFlyingLetters] = useState<number[]>([]);
  const [typedText, setTypedText] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [guideStep, setGuideStep] = useState(0);
  const [draftSettings, setDraftSettings] = useState<AppSettings>(settings ?? DEFAULT_APP_SETTINGS);
  const [settingsHint, setSettingsHint] = useState("");
  
  const fullSubtitle = "你的决策议会 · 你的记忆锚点 · 你的未来推演";
  const GUIDE_STEPS = [
    {
      title: "欢迎来到 PS²",
      body: "这里是你的决策议会。先从中间按钮进入主会场，输入一个你正在纠结的问题。",
      tag: "入口",
    },
    {
      title: "议会对话怎么用",
      body: "你先发第一句话，随后激进/保守/未来（可选导师）会依次给出建议。需要时点击“决策完成”保存本轮。",
      tag: "议会",
    },
    {
      title: "未来信件机制",
      body: "你可以写给未来的自己；当日期、情绪或事件触发时，信件会自动送达收件箱。",
      tag: "未来信件",
    },
    {
      title: "导师与设置",
      body: "可进入导师对话做深度讨论；右上角设置可调回答长度、语气、阈值、隐私与通知。",
      tag: "高级功能",
    },
  ] as const;

  useEffect(() => {
    setDraftSettings(settings ?? DEFAULT_APP_SETTINGS);
  }, [settings]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const h = d.getHours().toString().padStart(2, "0");
      const m = d.getMinutes().toString().padStart(2, "0");
      setClockText(`${h}:${m}`);
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  // 打字机效果
  useEffect(() => {
    if (!mounted) return;
    let index = 0;
    const interval = setInterval(() => {
      if (index <= fullSubtitle.length) {
        setTypedText(fullSubtitle.slice(0, index));
        index++;
      } else {
        // 重新开始
        setTimeout(() => {
          setTypedText("");
          index = 0;
        }, 3000);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [mounted]);

  // 信件飞出效果
  useEffect(() => {
    if (!mounted) return;
    const interval = setInterval(() => {
      const newId = Date.now();
      setFlyingLetters((prev) => [...prev.slice(-3), newId]);
      setTimeout(() => {
        setFlyingLetters((prev) => prev.filter((id) => id !== newId));
      }, 2000);
    }, isHoveringLetter ? 800 : 3000);
    return () => clearInterval(interval);
  }, [mounted, isHoveringLetter]);

  const handleEnter = useCallback(() => {
    setIsExiting(true);
    setTimeout(onEnter, 800);
  }, [onEnter]);

  // 横屏压缩：在 16:9 横屏下缩小主视觉，确保三块都能完整入屏
  const [isLandscape, setIsLandscape] = useState(false);
  useEffect(() => {
    const update = () => setIsLandscape(window.innerWidth > window.innerHeight);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden">
      {/* ====== 深邃太空背景 ====== */}
      <div 
        className="pointer-events-none absolute inset-0"
        style={{
          background: "linear-gradient(180deg, #0A0F1A 0%, #0D1425 50%, #0F1A2F 100%)",
        }}
      />
      
      {/* 粒子场（记忆碎片） */}
      {mounted && (
        <div className="pointer-events-none absolute inset-0">
          {FIXED_PARTICLES.map((particle, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full"
              style={{
                width: particle.size,
                height: particle.size,
                left: `${particle.x}%`,
                top: `${particle.y}%`,
                backgroundColor: "rgba(255,255,255,0.4)",
                opacity: 0.2,
              }}
              animate={{
                x: [0, 20, -15, 0],
                y: [0, -15, 10, 0],
                opacity: [0.2, 0.6, 0.2],
              }}
              transition={{
                duration: particle.duration,
                repeat: Infinity,
                delay: particle.delay,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>
      )}

      {/* 退出动画遮罩 */}
      <AnimatePresence>
        {isExiting && (
          <motion.div
            className="absolute inset-0 bg-[#0A0F1A] z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
          />
        )}
      </AnimatePresence>

      {/* ====== 顶部：品牌区 (10%) — 避让状态栏 / 刘海安全区，避免设置与系统栏重合 ====== */}
      <header
        className={`absolute left-0 right-0 flex items-center justify-between z-20 box-border ${isLandscape ? "h-[9%] px-6" : "h-[10%] px-8"} top-0 pt-[max(0.75rem,env(safe-area-inset-top,0px))]`}
      >
        {/* 左侧：PS² 发光徽标 */}
        <motion.div 
          className="flex items-center gap-2"
          animate={{
            textShadow: [
              "0 0 10px rgba(59,130,246,0.3)",
              "0 0 20px rgba(59,130,246,0.5)",
              "0 0 10px rgba(59,130,246,0.3)",
            ],
          }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        >
          <span className={`${isLandscape ? "text-xl" : "text-2xl"} font-light tracking-wider text-white`}>PS</span>
          <span className={`${isLandscape ? "text-base" : "text-lg"} font-light text-[#3B82F6] align-super`}>2</span>
          {clockText && (
            <span className={`${isLandscape ? "text-[10px]" : "text-xs"} font-light text-white/40 tabular-nums ml-1`}>
              {clockText}
            </span>
          )}
        </motion.div>

        {/* 中央：标题 */}
        <div className="absolute left-1/2 -translate-x-1/2 text-center">
          <h1 className={`${isLandscape ? "text-lg" : "text-xl"} font-light tracking-wide text-white/90`}>
            Parallel Self 2.0
          </h1>
          <p className={`${isLandscape ? "text-[10px]" : "text-xs"} text-white/50 tracking-widest ${isLandscape ? "mt-0.5" : "mt-1"}`}>
            你的认知进化伙伴
          </p>
        </div>

        {/* 右侧：设置（与 header 一并受 safe-area 下移） */}
        <button
          type="button"
          className="p-2 rounded-full hover:bg-white/5 transition-colors shrink-0"
          onClick={() => setShowSettings(true)}
        >
          <Settings className={`${isLandscape ? "w-4 h-4" : "w-5 h-5"} text-white/50`} />
        </button>
      </header>

      {/* ====== 中部：核心功能区 — 横屏为三列（与设计稿一致），竖屏中间主区 + 底部分栏 ====== */}
      <main
        className={`pointer-events-auto absolute left-0 right-0 z-10 ${
          isLandscape
            ? "top-[9%] h-[69%] flex flex-row items-center justify-between px-4 max-w-[1600px] mx-auto"
            : "top-[10%] h-[70%] flex flex-col justify-between pb-2"
        }`}
      >
        {isLandscape ? (
          <>
            <MentorColumn
              isLandscape
              isHoveringMentor={isHoveringMentor}
              setHoverMentor={setIsHoveringMentor}
              onGoToMentor={onGoToMentor}
            />
            <WelcomeCenterHub
              isLandscape
              typedText={typedText}
              isHoveringStart={isHoveringStart}
              setHoverStart={setIsHoveringStart}
              onEnter={handleEnter}
            />
            <LettersColumn
              isLandscape
              isHoveringLetter={isHoveringLetter}
              setHoverLetter={setIsHoveringLetter}
              flyingLetters={flyingLetters}
              onGoToLetters={onGoToLetters}
            />
          </>
        ) : (
          <>
            <div className="flex-1 flex flex-col items-center justify-center min-h-0 -mt-6">
              <WelcomeCenterHub
                isLandscape={false}
                typedText={typedText}
                isHoveringStart={isHoveringStart}
                setHoverStart={setIsHoveringStart}
                onEnter={handleEnter}
              />
            </div>
            <div className="flex flex-row items-end justify-between gap-3 px-4 w-full shrink-0">
              <MentorColumn
                isLandscape={false}
                isHoveringMentor={isHoveringMentor}
                setHoverMentor={setIsHoveringMentor}
                onGoToMentor={onGoToMentor}
              />
              <LettersColumn
                isLandscape={false}
                isHoveringLetter={isHoveringLetter}
                setHoverLetter={setIsHoveringLetter}
                flyingLetters={flyingLetters}
                onGoToLetters={onGoToLetters}
              />
            </div>
          </>
        )}

        {/* 触控兜底热区：避免 WebView 某些机型/层级导致按钮命中失败 */}
        <div className="pointer-events-none absolute inset-0 z-30">
          {/* 中间进入热区 */}
          <button
            type="button"
            aria-label="进入议会"
            onClick={handleEnter}
            className={`pointer-events-auto absolute rounded-full ${
              isLandscape ? "w-28 h-28 left-1/2 -translate-x-1/2 top-[42%]" : "w-36 h-36 left-1/2 -translate-x-1/2 top-[45%]"
            }`}
            style={{ background: "transparent" }}
          />
          {/* 左侧导师热区 */}
          <button
            type="button"
            aria-label="进入导师"
            onClick={() => onGoToMentor?.()}
            className={`pointer-events-auto absolute rounded-2xl ${
              isLandscape ? "w-44 h-40 left-[6%] top-[48%]" : "w-44 h-40 left-[8%] top-[60%]"
            }`}
            style={{ background: "transparent" }}
          />
          {/* 右侧信件热区 */}
          <button
            type="button"
            aria-label="进入信件"
            onClick={() => onGoToLetters?.()}
            className={`pointer-events-auto absolute rounded-2xl ${
              isLandscape ? "w-44 h-40 right-[6%] top-[48%]" : "w-44 h-40 right-[8%] top-[60%]"
            }`}
            style={{ background: "transparent" }}
          />
        </div>
      </main>

      {/* ====== 底部：功能描述轮播 + 导航 (20%) ====== */}
      <footer 
        className={`pointer-events-none absolute bottom-0 left-0 right-0 z-0 flex flex-col items-center justify-center ${isLandscape ? "h-[22%] px-6" : "h-[20%] px-8"}`}
        style={{
          background: "linear-gradient(to bottom, transparent, rgba(10,15,26,0.9) 40%)",
        }}
      >
        {/* 决策树推演主条（与设计稿一致：宽胶囊 + 左脑中图标） */}
        <div className={`relative flex flex-col items-center justify-center ${isLandscape ? "h-14 mb-1" : "h-16 mb-3"}`}>
          <motion.button
            type="button"
            onClick={() => onGoToDecisionTree?.()}
            className={`pointer-events-auto flex items-center rounded-full ${isLandscape ? "gap-3 px-5 py-2.5 max-w-[min(92vw,520px)] w-full" : "gap-4 px-6 py-3 max-w-[min(94vw,520px)] w-full"} justify-start`}
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              boxShadow: "0 0 24px rgba(59,130,246,0.12)",
            }}
            whileTap={{ scale: 0.99 }}
          >
            <div className={`${isLandscape ? "w-8 h-8" : "w-10 h-10"} rounded-full bg-[#3B82F6]/25 flex items-center justify-center shrink-0`}>
              <Brain className={`${isLandscape ? "w-4 h-4" : "w-5 h-5"} text-[#93C5FD]`} />
            </div>
            <div className="text-left min-w-0">
              <h4 className={`${isLandscape ? "text-xs" : "text-sm"} font-medium text-white/90`}>决策树推演</h4>
              <p className={`${isLandscape ? "text-[10px]" : "text-xs"} text-white/45 leading-snug`}>模拟不同选择的未来路径</p>
            </div>
          </motion.button>

          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${i === 1 ? "bg-[#3B82F6]" : "bg-white/20"}`}
              />
            ))}
          </div>
        </div>

        {/* 页面信息 */}
        <div className="pointer-events-auto absolute bottom-4 left-8 text-xs text-white/30">
          v2.0 · PS² Labs
        </div>
        <button
          className="pointer-events-auto absolute bottom-4 right-8 text-xs text-white/30 hover:text-white/50 transition-colors flex items-center gap-1"
          onClick={() => {
            setGuideStep(0);
            setShowGuide(true);
          }}
        >
          <HelpCircle className="w-3 h-3" />
          新手引导
        </button>
      </footer>

      <AnimatePresence>
        {showSettings && (
          <motion.div
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="w-full max-w-3xl max-h-[88vh] overflow-y-auto rounded-2xl border border-white/15 bg-[#0E1629]/95 p-4 md:p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white text-lg">设置中心</h3>
                <button
                  className="text-white/60 hover:text-white"
                  onClick={() => {
                    setDraftSettings(settings ?? DEFAULT_APP_SETTINGS);
                    setSettingsHint("");
                    setShowSettings(false);
                  }}
                >
                  关闭
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-3">
                  <h4 className="text-sm text-white/80">AI 行为</h4>
                  <label className="block text-xs text-white/60">
                    回答长度
                    <div className="mt-1">
                      <Select
                        value={draftSettings.replyLength}
                        onValueChange={(v) => setDraftSettings((s) => ({ ...s, replyLength: v as AppSettings["replyLength"] }))}
                      >
                        <SelectTrigger className="w-full rounded-xl bg-slate-900/80 border border-white/15 text-white">
                          <SelectValue placeholder="选择…" />
                        </SelectTrigger>
                        <SelectContent className="border-white/15 bg-[#0E1629]/95 backdrop-blur-xl text-white">
                          <SelectItem value="short">短</SelectItem>
                          <SelectItem value="medium">中</SelectItem>
                          <SelectItem value="long">长</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </label>
                  <label className="block text-xs text-white/60">
                    语气
                    <div className="mt-1">
                      <Select
                        value={draftSettings.replyTone}
                        onValueChange={(v) => setDraftSettings((s) => ({ ...s, replyTone: v as AppSettings["replyTone"] }))}
                      >
                        <SelectTrigger className="w-full rounded-xl bg-slate-900/80 border border-white/15 text-white">
                          <SelectValue placeholder="选择…" />
                        </SelectTrigger>
                        <SelectContent className="border-white/15 bg-[#0E1629]/95 backdrop-blur-xl text-white">
                          <SelectItem value="balanced">平衡</SelectItem>
                          <SelectItem value="gentle">温和</SelectItem>
                          <SelectItem value="rational">理性</SelectItem>
                          <SelectItem value="direct">直接</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </label>
                  {(["radical", "conservative", "future"] as const).map((k) => (
                    <label key={k} className="block text-xs text-white/60">
                      派系强度 {k}
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={draftSettings.factionStrength[k]}
                        onChange={(e) =>
                          setDraftSettings((s) => ({
                            ...s,
                            factionStrength: { ...s.factionStrength, [k]: Number(e.target.value) },
                          }))
                        }
                        className="w-full mt-1"
                      />
                    </label>
                  ))}
                  <label className="block text-xs text-white/60">
                    情绪触发阈值（{Math.round(draftSettings.emotionTriggerThreshold * 100)}%）
                    <p className="text-[10px] text-white/40 mt-0.5 mb-1">
                      达到该置信度时触发高焦虑提示与呼吸引导（议会与导师会话均生效）。
                    </p>
                    <input
                      type="range"
                      min={50}
                      max={95}
                      value={Math.round(draftSettings.emotionTriggerThreshold * 100)}
                      onChange={(e) =>
                        setDraftSettings((s) => ({
                          ...s,
                          emotionTriggerThreshold: Number(e.target.value) / 100,
                        }))
                      }
                      className="w-full mt-1"
                    />
                  </label>
                  <label className="block text-xs text-white/60">
                    议会：离开主界面后等待上限（{Math.round(draftSettings.councilAwayAbortMs / 1000)} 秒）
                    <p className="text-[10px] text-white/40 mt-0.5 mb-1">
                      切到记忆库/洞察等时，后台辩论超过此时长将中止。
                    </p>
                    <input
                      type="range"
                      min={30}
                      max={600}
                      step={30}
                      value={Math.round(draftSettings.councilAwayAbortMs / 1000)}
                      onChange={(e) =>
                        setDraftSettings((s) => ({
                          ...s,
                          councilAwayAbortMs: Number(e.target.value) * 1000,
                        }))
                      }
                      className="w-full mt-1"
                    />
                  </label>
                  <label className="block text-xs text-white/60">
                    导师：离开对话后等待上限（{Math.round(draftSettings.mentorAwayAbortMs / 1000)} 秒）
                    <p className="text-[10px] text-white/40 mt-0.5 mb-1">
                      从导师对话返回导师库后，后台生成超过此时长将中止。
                    </p>
                    <input
                      type="range"
                      min={30}
                      max={600}
                      step={30}
                      value={Math.round(draftSettings.mentorAwayAbortMs / 1000)}
                      onChange={(e) =>
                        setDraftSettings((s) => ({
                          ...s,
                          mentorAwayAbortMs: Number(e.target.value) * 1000,
                        }))
                      }
                      className="w-full mt-1"
                    />
                  </label>
                </div>
                <div className="space-y-3">
                  <h4 className="text-sm text-white/80">隐私与通知</h4>
                  <label className="flex items-center justify-between text-xs text-white/70">
                    <span>上传后端（归档/统计）</span>
                    <input
                      type="checkbox"
                      checked={draftSettings.uploadToBackend}
                      onChange={(e) => setDraftSettings((s) => ({ ...s, uploadToBackend: e.target.checked }))}
                    />
                  </label>
                  <label className="flex items-center justify-between text-xs text-white/70">
                    <span>未来信件提醒</span>
                    <input
                      type="checkbox"
                      checked={draftSettings.lettersNotificationEnabled}
                      onChange={(e) => setDraftSettings((s) => ({ ...s, lettersNotificationEnabled: e.target.checked }))}
                    />
                  </label>
                  <div className="pt-2 space-y-2">
                    <button
                      className="w-full rounded-lg bg-white/8 border border-white/15 p-2 text-xs text-white/80"
                      onClick={async () => {
                        const exported = await storageExportAll();
                        const blob = new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = "ps2-export.json";
                        a.click();
                        URL.revokeObjectURL(url);
                        setSettingsHint("本地数据已导出");
                      }}
                    >
                      导出本地数据
                    </button>
                    <button
                      className="w-full rounded-lg bg-red-500/15 border border-red-300/25 p-2 text-xs text-red-100"
                      onClick={async () => {
                        const ok = window.confirm("确认清理所有本地数据？该操作不可恢复。");
                        if (!ok) return;
                        await storageClearAll();
                        setSettingsHint("本地数据已清理");
                      }}
                    >
                      清理本地数据
                    </button>
                  </div>
                </div>
              </div>
              {settingsHint && <p className="mt-3 text-xs text-emerald-300">{settingsHint}</p>}
              <div className="mt-4 flex justify-end gap-2">
                <button
                  className="px-3 py-2 rounded-lg text-xs text-white/70"
                  onClick={() => {
                    setDraftSettings(settings ?? DEFAULT_APP_SETTINGS);
                    setSettingsHint("");
                    setShowSettings(false);
                  }}
                >
                  取消
                </button>
                <button
                  className="px-3 py-2 rounded-lg text-xs bg-blue-500/25 border border-blue-300/30 text-blue-100"
                  onClick={() => {
                    onSettingsChange?.(draftSettings);
                    setSettingsHint("已写入本地并同步到当前应用，议会与导师页立即使用新设置。");
                  }}
                >
                  保存设置
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showGuide && (
          <motion.div
            className="absolute inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#0C1526]/95 p-6"
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs text-blue-200/80 bg-blue-500/20 border border-blue-300/25 rounded-full px-2 py-1">
                  {GUIDE_STEPS[guideStep].tag}
                </div>
                <div className="text-xs text-white/45">
                  {guideStep + 1}/{GUIDE_STEPS.length}
                </div>
              </div>
              <h4 className="text-white text-lg mb-2">{GUIDE_STEPS[guideStep].title}</h4>
              <p className="text-sm text-white/75 leading-6 min-h-[72px]">{GUIDE_STEPS[guideStep].body}</p>

              <div className="flex items-center gap-2 mt-4 mb-5">
                {GUIDE_STEPS.map((_, i) => (
                  <div
                    key={`guide-dot-${i}`}
                    className={`h-1.5 rounded-full transition-all ${i === guideStep ? "w-8 bg-blue-400" : "w-3 bg-white/20"}`}
                  />
                ))}
              </div>

              <div className="flex items-center justify-between">
                <button
                  className="text-xs text-white/55 hover:text-white"
                  onClick={() => setShowGuide(false)}
                >
                  跳过
                </button>
                <div className="flex items-center gap-2">
                  <button
                    className="px-3 py-2 rounded-lg text-xs text-white/70 disabled:opacity-40"
                    disabled={guideStep === 0}
                    onClick={() => setGuideStep((s) => Math.max(0, s - 1))}
                  >
                    上一步
                  </button>
                  {guideStep < GUIDE_STEPS.length - 1 ? (
                    <button
                      className="px-3 py-2 rounded-lg text-xs bg-blue-500/25 border border-blue-300/30 text-blue-100"
                      onClick={() => setGuideStep((s) => Math.min(GUIDE_STEPS.length - 1, s + 1))}
                    >
                      下一步
                    </button>
                  ) : (
                    <button
                      className="px-3 py-2 rounded-lg text-xs bg-emerald-500/25 border border-emerald-300/30 text-emerald-100"
                      onClick={() => {
                        setShowGuide(false);
                        handleEnter();
                      }}
                    >
                      开始体验
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
