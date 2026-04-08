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
  const [currentPage, setCurrentPage] = useState<PageType>("welcome");
  const [currentMentorId, setCurrentMentorId] = useState<string | null>(null);
  const [mentorChatSessionId, setMentorChatSessionId] = useState(0);
  const [showProjection, setShowProjection] = useState(false);
  const [showBreathing, setShowBreathing] = useState(false);
  const [anxietyLevel, setAnxietyLevel] = useState(0);
  const [letterTriggerToast, setLetterTriggerToast] = useState<{ count: number; titles: string[] } | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const perf = usePerformanceProfile();

  // 加载设置
  useEffect(() => {
    void (async () => {
      const saved = await storageGet<AppSettings>("app.settings.v1", DEFAULT_APP_SETTINGS);
      setAppSettings(saved);
    })();
  }, []);
  const handleAnxiousDetected = (payload: { source: "council" | "mentor"; score: number }) => {
    const nextLevel = Math.round(payload.score * 100);
    setAnxietyLevel(nextLevel);
    if (nextLevel >= 90) setShowBreathing(true);
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
              settings={appSettings}
              onSettingsChange={handleSettingsChange}
            />
          </motion.div>
        )}

        {currentPage === "council" && (
          <motion.div
            key="main"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="relative w-full min-h-screen overflow-hidden"
          >
            {/* 星云背景 */}
            <NebulaBackground />

            {/* 主议会界面 */}
            <div className="relative z-10">
              <CouncilMain
                onAnxiousDetected={handleAnxiousDetected}
                onLettersTriggered={handleLettersTriggered}
                settings={appSettings}
              />
            </div>

            {/* 底部导航栏 */}
            <div
              className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 p-2 bg-card/60 ${
                perf.lowPerformanceMode ? "" : "backdrop-blur-sm"
              } rounded-full border border-border/50`}
            >
              {/* 返回欢迎页 */}
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

              {/* 推演按钮 */}
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

              {/* 记忆库按钮 */}
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

              {/* 数据洞察按钮 */}
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

            {/* 焦虑指示器（当检测到高焦虑时显示） */}
            <AnimatePresence>
              {anxietyLevel >= 90 && !showBreathing && (
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
                    onClick={() => setShowBreathing(true)}
                    className="ml-2 px-2 py-0.5 text-xs bg-destructive/30 hover:bg-destructive/40 text-destructive rounded-full transition-colors"
                  >
                    冥想
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 推演视图 */}
            <ProjectionView
              isOpen={showProjection}
              onClose={() => setShowProjection(false)}
            />

          </motion.div>
        )}

        {currentPage === "memory" && (
          <motion.div
            key="memory"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="relative w-full min-h-screen overflow-hidden"
          >
            {/* 星云背景 */}
            <NebulaBackground />

            {/* 记忆库界面 */}
            <div className="relative z-10 h-screen">
              <MemoryVault onBack={() => setCurrentPage("council")} />
            </div>
          </motion.div>
        )}

        {currentPage === "mentor" && (
          <motion.div
            key="mentor"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="relative w-full min-h-screen overflow-hidden"
          >
            {/* 虚拟导师库界面 */}
            <MentorLibrary 
              onBack={() => setCurrentPage("welcome")} 
              onStartChat={handleStartChat}
            />
          </motion.div>
        )}

        {currentPage === "mentor-chat" && currentMentorId && (
          <motion.div
            key="mentor-chat"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="relative w-full min-h-screen overflow-hidden"
          >
            {/* 导师聊天界面 */}
            <MentorChat 
              key={`${currentMentorId}-${mentorChatSessionId}`}
              mentorId={currentMentorId} 
              onBack={() => setCurrentPage("mentor")}
              onAnxiousDetected={handleAnxiousDetected}
              onLettersTriggered={handleLettersTriggered}
              settings={appSettings}
            />
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

        {currentPage === "insights" && (
          <motion.div
            key="insights"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="relative w-full min-h-screen overflow-hidden"
          >
            {/* 数据洞察界面 */}
            <DataInsights onBack={() => setCurrentPage("council")} />
          </motion.div>
        )}
      </AnimatePresence>
      <BreathingGuide
        isActive={showBreathing}
        onReturn={() => {
          setShowBreathing(false);
          setAnxietyLevel(30);
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
    </>
  );
}
