"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { NebulaBackground } from "./nebula-background";
import { CouncilMain } from "./council-main";
import { ProjectionView } from "./projection-view";
import { BreathingGuide } from "./breathing-guide";
import { WelcomeScreen } from "./welcome-screen";
import { MemoryVault } from "./memory-vault";
import { MentorLibrary } from "./mentor-library";
import { MentorChat } from "./mentor-chat";
import { FutureLetters } from "./future-letters";
import { DataInsights } from "./data-insights";
import { ChevronUp, Activity, Home, Database, BarChart3 } from "lucide-react";
import { storageGet, storageSet } from "@/lib/storage";
import { DEFAULT_APP_SETTINGS, type AppSettings } from "@/lib/app-settings";
import { PerformanceProvider, usePerformanceProfile } from "@/lib/performance";

type PageType = "welcome" | "council" | "memory" | "mentor" | "mentor-chat" | "letters" | "insights";

export function PS2App() {
  return (
    <PerformanceProvider>
      <PS2AppInner />
    </PerformanceProvider>
  );
}

function PS2AppInner() {
  const [showBootTransition, setShowBootTransition] = useState(true);
  const [currentPage, setCurrentPage] = useState<PageType>("welcome");
  const [currentMentorId, setCurrentMentorId] = useState<string | null>(null);
  const [mentorChatSessionId, setMentorChatSessionId] = useState(0);
  const [showProjection, setShowProjection] = useState(false);
  const [openProjectionAfterCouncil, setOpenProjectionAfterCouncil] = useState(false);
  const [showBreathing, setShowBreathing] = useState(false);
  const [anxietyLevel, setAnxietyLevel] = useState(0);
  const [isHighAnxiety, setIsHighAnxiety] = useState(false);
  const [breathingCooldownUntil, setBreathingCooldownUntil] = useState(0);
  const [breathingRecoveredAt, setBreathingRecoveredAt] = useState(0);
  const [letterTriggerToast, setLetterTriggerToast] = useState<{ count: number; titles: string[] } | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const perf = usePerformanceProfile();

  // 加载设置
  useEffect(() => {
    void (async () => {
      const saved = await storageGet<Partial<AppSettings>>("app.settings.v1", {});
      setAppSettings({ ...DEFAULT_APP_SETTINGS, ...saved });
    })();
  }, []);
  const handleAnxiousDetected = (payload: { source: "council" | "mentor"; score: number }) => {
    const nextLevel = Math.round(payload.score * 100);
    setAnxietyLevel(nextLevel);
    const thresholdPct = Math.round((appSettings.emotionTriggerThreshold ?? 0.72) * 100);
    const high = nextLevel >= thresholdPct;
    setIsHighAnxiety(high);
    if (high && Date.now() >= breathingCooldownUntil) setShowBreathing(true);
  };

  // 开始与导师聊天
  const handleStartChat = (mentorId: string) => {
    setCurrentMentorId(mentorId);
    setMentorChatSessionId((v) => v + 1);
    setCurrentPage("mentor-chat");
  };

  const handleLettersTriggered = (payload: { count: number; titles: string[] }) => {
    if (!appSettings.lettersNotificationEnabled) return;
    setLetterTriggerToast(payload);
  };
  const handleSettingsChange = (next: AppSettings) => {
    setAppSettings(next);
    void storageSet("app.settings.v1", next);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setShowBootTransition(false);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (currentPage === "council" && openProjectionAfterCouncil) {
      setShowProjection(true);
      setOpenProjectionAfterCouncil(false);
    }
  }, [currentPage, openProjectionAfterCouncil]);

  // 使用 AnimatePresence 而不是条件返回，保持 hooks 调用顺序一致
  return (
    <>
      <AnimatePresence mode="wait">
        {currentPage === "welcome" && (
          <motion.div
            key="welcome"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <WelcomeScreen 
              onEnter={() => setCurrentPage("council")} 
              onGoToMentor={() => setCurrentPage("mentor")}
              onGoToLetters={() => setCurrentPage("letters")}
              onGoToDecisionTree={() => {
                setOpenProjectionAfterCouncil(true);
                setCurrentPage("council");
              }}
              settings={appSettings}
              onSettingsChange={handleSettingsChange}
            />
          </motion.div>
        )}

        {(currentPage === "council" || currentPage === "memory" || currentPage === "insights") && (
          <motion.div
            key="council-bench"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="relative w-full min-h-screen overflow-hidden pointer-events-auto"
          >
            <div className={currentPage === "council" ? "contents" : "hidden"}>
              <NebulaBackground />

              <div className="relative z-10">
                <CouncilMain
                  isUiActive={currentPage === "council"}
                  onAnxiousDetected={handleAnxiousDetected}
                  onLettersTriggered={handleLettersTriggered}
                  settings={appSettings}
                  breathingRecoveredAt={breathingRecoveredAt}
                />
              </div>

              <div
                className={`fixed left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 p-2 bg-card/60 ${
                  currentPage === "council" ? "" : "bottom-6"
                } ${
                  perf.lowPerformanceMode ? "" : "backdrop-blur-sm"
                } rounded-full border border-border/50`}
                style={
                  currentPage === "council"
                    ? { bottom: "calc(var(--ps2-council-footer-height, 0px) + max(8px, env(safe-area-inset-bottom)))" }
                    : undefined
                }
              >
                <div className="relative group">
                  <motion.button
                    onClick={() => setCurrentPage("welcome")}
                    className="flex items-center gap-2 px-3 py-2 rounded-full text-sm text-muted-foreground hover:text-foreground hover:bg-card/80 transition-colors"
                    whileHover={perf.lowPerformanceMode ? undefined : { scale: 1.05 }}
                    whileTap={perf.lowPerformanceMode ? undefined : { scale: 0.95 }}
                  >
                    <Home className="w-4 h-4" />
                  </motion.button>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded bg-card/90 border border-border/50 text-xs text-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    返回首页
                  </div>
                </div>

                <div className="relative group">
                  <motion.button
                    onClick={() => setShowProjection(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-full text-sm text-muted-foreground hover:text-foreground hover:bg-card/80 transition-colors"
                    whileHover={perf.lowPerformanceMode ? undefined : { scale: 1.05 }}
                    whileTap={perf.lowPerformanceMode ? undefined : { scale: 0.95 }}
                  >
                    <ChevronUp className="w-4 h-4" />
                    <span>推演</span>
                  </motion.button>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded bg-card/90 border border-border/50 text-xs text-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    决策树推演
                  </div>
                </div>

                <div className="relative group">
                  <motion.button
                    onClick={() => setCurrentPage("memory")}
                    className="flex items-center gap-2 px-3 py-2 rounded-full text-sm text-muted-foreground hover:text-foreground hover:bg-card/80 transition-colors"
                    whileHover={perf.lowPerformanceMode ? undefined : { scale: 1.05 }}
                    whileTap={perf.lowPerformanceMode ? undefined : { scale: 0.95 }}
                  >
                    <Database className="w-4 h-4" />
                  </motion.button>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded bg-card/90 border border-border/50 text-xs text-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    记忆库
                  </div>
                </div>

                <div className="relative group">
                  <motion.button
                    onClick={() => setCurrentPage("insights")}
                    className="flex items-center gap-2 px-3 py-2 rounded-full text-sm text-muted-foreground hover:text-foreground hover:bg-card/80 transition-colors"
                    whileHover={perf.lowPerformanceMode ? undefined : { scale: 1.05 }}
                    whileTap={perf.lowPerformanceMode ? undefined : { scale: 0.95 }}
                  >
                    <BarChart3 className="w-4 h-4" />
                  </motion.button>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded bg-card/90 border border-border/50 text-xs text-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    数据洞察
                  </div>
                </div>
              </div>

              <AnimatePresence>
                {isHighAnxiety && !showBreathing && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className={`fixed top-20 right-6 z-30 flex items-center gap-2 px-3 py-2 bg-destructive/20 ${
                      perf.lowPerformanceMode ? "" : "backdrop-blur-sm"
                    } rounded-full border border-destructive/30`}
                  >
                    <Activity className="w-4 h-4 text-destructive animate-pulse" />
                    <span className="text-xs text-destructive">检测到情绪波动</span>
                    <button
                      type="button"
                      onClick={() => setShowBreathing(true)}
                      className="ml-2 px-2 py-0.5 text-xs bg-destructive/30 hover:bg-destructive/40 text-destructive rounded-full transition-colors"
                    >
                      冥想
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              <ProjectionView isOpen={showProjection} onClose={() => setShowProjection(false)} />
            </div>

            <div className={currentPage === "memory" ? "contents" : "hidden"}>
              <NebulaBackground />
              <div className="relative z-10 h-[100dvh] max-h-[100dvh] min-h-0 overflow-hidden">
                <MemoryVault onBack={() => setCurrentPage("council")} />
              </div>
            </div>

            <div className={currentPage === "insights" ? "contents" : "hidden"}>
              <DataInsights onBack={() => setCurrentPage("council")} />
            </div>
          </motion.div>
        )}

        {(currentPage === "mentor" || (currentPage === "mentor-chat" && currentMentorId)) && (
          <motion.div
            key="mentor-flow"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="relative w-full min-h-screen overflow-hidden"
          >
            <div className={currentPage === "mentor" ? "contents" : "hidden"}>
              <MentorLibrary
                onBack={() => {
                  setCurrentMentorId(null);
                  setCurrentPage("welcome");
                }}
                onStartChat={handleStartChat}
              />
            </div>
            {currentMentorId && (
              <div className={currentPage === "mentor-chat" ? "contents" : "hidden"}>
                <MentorChat
                  key={`${currentMentorId}-${mentorChatSessionId}`}
                  mentorId={currentMentorId}
                  isUiActive={currentPage === "mentor-chat"}
                  onBack={() => setCurrentPage("mentor")}
                  onAnxiousDetected={handleAnxiousDetected}
                  onLettersTriggered={handleLettersTriggered}
                  settings={appSettings}
                />
              </div>
            )}
          </motion.div>
        )}

        {currentPage === "letters" && (
          <motion.div
            key="letters"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="relative w-full min-h-screen overflow-hidden"
          >
            {/* 未来信件界面 */}
            <FutureLetters onBack={() => setCurrentPage("welcome")} />
          </motion.div>
        )}

      </AnimatePresence>
      <BreathingGuide
        isActive={showBreathing}
        onReturn={() => {
          setShowBreathing(false);
          setAnxietyLevel(60);
          setIsHighAnxiety(false);
          setBreathingRecoveredAt(Date.now());
          setBreathingCooldownUntil(Date.now() + 30_000);
        }}
      />
      <AnimatePresence>
        {letterTriggerToast && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            className={`fixed bottom-24 right-6 z-40 w-[320px] p-4 rounded-2xl border border-amber-300/30 bg-amber-500/10 ${
              perf.lowPerformanceMode ? "" : "backdrop-blur-md"
            }`}
          >
            <div className="text-sm text-amber-100 font-medium">触发条件已命中，信件已送达</div>
            <div className="mt-1 text-xs text-amber-50/80">
              本次送达 {letterTriggerToast.count} 封：
              {letterTriggerToast.titles.slice(0, 2).join("、")}
              {letterTriggerToast.titles.length > 2 ? "..." : ""}
            </div>
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                className="px-3 py-1.5 rounded-lg text-xs text-white/70 hover:text-white"
                onClick={() => setLetterTriggerToast(null)}
              >
                稍后
              </button>
              <button
                className="px-3 py-1.5 rounded-lg text-xs bg-amber-300/25 border border-amber-200/30 text-amber-100"
                onClick={() => {
                  setCurrentPage("letters");
                  setLetterTriggerToast(null);
                }}
              >
                查看信件
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showBootTransition && (
          <motion.div
            className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center"
            style={{
              background: "radial-gradient(circle at 50% 45%, #10264B 0%, #0A0F1A 58%, #070B14 100%)",
            }}
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: "easeInOut" }}
          >
            <motion.div
              className="text-center"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: "easeOut" }}
            >
              <div className="text-3xl tracking-wide font-light text-white/90">Parallel Self 2.0</div>
              <div className="mt-2 text-xs tracking-[0.22em] text-white/45">LOADING YOUR COUNCIL...</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
