"use client";

import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, DollarSign, Zap, X } from "lucide-react";
import { useState } from "react";
import { usePerformanceProfile } from "@/lib/performance";

// ─── 类型定义 ──────────────────────────────────────────────────────────────────

type NodeType = "emotion" | "finance" | "event";

interface PathNode {
  id: string;
  type: NodeType;
  label: string;
  sentiment: "positive" | "neutral" | "negative";
  x: number;
  y: number;
}

interface DecisionBranch {
  id: string;
  name: string;
  probability: number;
  nodes: PathNode[];
  description: string;
  riskScore?: number;
  benefitScore?: number;
  emotionForecast?: string;
  opinions?: Record<string, { opinion: string; support: number }>;
}

interface DecisionPathProps {
  question: string;
  branches: DecisionBranch[];
  selectedBranch: string | null;
  onSelectBranch: (id: string) => void;
  compareSummary?: string;
  /** 服务端推荐的默认对比分支（打开时同步到下拉框） */
  defaultCompare?: { branchA: string; branchB: string } | null;
  /** 对比维度的数值差异（来自 API） */
  comparedDelta?: {
    benefit: number;
    risk: number;
    emotionA: string;
    emotionB: string;
  } | null;
}

// ─── 三个派系 ──────────────────────────────────────────────────────────────────

interface Faction {
  id: string;
  name: string;
  color: string;
  bgColor: string;
  borderColor: string;
  glow: string;
}

const FACTIONS: Faction[] = [
  {
    id: "radical",
    name: "激进派",
    color: "#EF4444",
    bgColor: "rgba(239,68,68,0.15)",
    borderColor: "rgba(239,68,68,0.6)",
    glow: "rgba(239,68,68,0.35)",
  },
  {
    id: "future",
    name: "未来派",
    color: "#8B5CF6",
    bgColor: "rgba(139,92,246,0.15)",
    borderColor: "rgba(139,92,246,0.6)",
    glow: "rgba(139,92,246,0.35)",
  },
  {
    id: "conservative",
    name: "保守派",
    color: "#10B981",
    bgColor: "rgba(16,185,129,0.15)",
    borderColor: "rgba(16,185,129,0.6)",
    glow: "rgba(16,185,129,0.35)",
  },
];

// ─── 主组件 ────────────────────────────────────────────────────────────────────

const EMOTION_LABEL: Record<string, string> = {
  excited: "兴奋",
  calm: "平静",
  anxious: "焦虑",
  happy: "积极",
  sad: "低落",
};

export function DecisionPath({
  question,
  branches,
  selectedBranch,
  onSelectBranch,
  compareSummary,
  defaultCompare,
  comparedDelta,
}: DecisionPathProps) {
  const [selectedFaction, setSelectedFaction] = useState<string | null>(null);
  const [compareA, setCompareA] = useState<string | null>(null);
  const [compareB, setCompareB] = useState<string | null>(null);
  const perf = usePerformanceProfile();

  const branchIds = new Set(branches.map((b) => b.id));
  const suggestedA =
    defaultCompare?.branchA && branchIds.has(defaultCompare.branchA) ? defaultCompare.branchA : null;
  const suggestedB =
    defaultCompare?.branchB && branchIds.has(defaultCompare.branchB) ? defaultCompare.branchB : null;
  const effectiveCompareA = compareA ?? suggestedA;
  const effectiveCompareB = compareB ?? suggestedB;

  const selectedBranchData = branches.find((b) => b.id === selectedBranch) ?? null;
  const currentBranchOpinions = selectedBranchData?.opinions ?? {};
  const activeFaction         = FACTIONS.find(f => f.id === selectedFaction) ?? null;
  const activeOpinion         = selectedFaction ? currentBranchOpinions[selectedFaction] ?? null : null;

  const handleBranchClick = (branchId: string) => {
    onSelectBranch(branchId);
    setSelectedFaction(null);
  };

  const handleFactionClick = (factionId: string) => {
    setSelectedFaction(prev => (prev === factionId ? null : factionId));
  };

  // SVG 坐标系：viewBox="0 0 100 100"
  const CX = 50;
  const CY = 32;
  const TREE_SCALE = 1.22;
  const treeTransform = `translate(${CX * (1 - TREE_SCALE)} ${(CY + 2) * (1 - TREE_SCALE)}) scale(${TREE_SCALE})`;

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden">

      {/* 星空背景 */}
      <div className="absolute inset-0 pointer-events-none">
        {Array.from({ length: perf.lowPerformanceMode ? 14 : 40 }).map((_, i) => {
          const style = {
            width: i % 3 === 0 ? 2 : 1,
            height: i % 3 === 0 ? 2 : 1,
            left: `${(i * 37 + 13) % 100}%`,
            top: `${(i * 41 + 17) % 100}%`,
            opacity: perf.lowPerformanceMode ? 0.16 : 0.2,
          } as const;
          return perf.lowPerformanceMode ? (
            <div key={i} className="absolute rounded-full bg-white" style={style} />
          ) : (
            <motion.div
              key={i}
              className="absolute rounded-full bg-white"
              style={style}
              animate={{ opacity: [0.2, 0.7, 0.2] }}
              transition={{ duration: 2 + (i % 3), repeat: Infinity, delay: (i % 5) * 0.4 }}
            />
          );
        })}
      </div>

      {/* ── 决策树 SVG ── */}
      <div className="relative flex-1 min-h-0">
        <svg
          className="w-full h-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid meet"
        >
          <g transform={treeTransform}>
          {/* 分支路径 */}
          {branches.map((branch, index) => {
            const totalBranches = branches.length;
            const spread        = 64;
            const angleOffset   = (index - (totalBranches - 1) / 2) * (spread / (totalBranches - 1));
            const rad           = (angleOffset * Math.PI) / 180;
            const endX          = CX + Math.sin(rad) * 42;
            const endY          = CY + 40 + Math.abs(Math.sin(rad)) * 4;

            const isSelected = selectedBranch === branch.id;
            const isOther    = selectedBranch !== null && !isSelected;

            const pathD = `M ${CX} ${CY} C ${CX + (endX - CX) * 0.3} ${CY + 8}, ${endX - (endX - CX) * 0.2} ${endY - 8}, ${endX} ${endY}`;

            return (
              <g key={branch.id}>
                {/* 主路径 */}
                <motion.path
                  d={pathD}
                  fill="none"
                  strokeLinecap="round"
                  strokeWidth={isSelected ? 0.8 : 0.5}
                  stroke={isSelected ? "#fbbf24" : "#818cf8"}
                  initial={perf.lowPerformanceMode ? { opacity: 0 } : { pathLength: 0, opacity: 0 }}
                  animate={
                    perf.lowPerformanceMode
                      ? { opacity: isOther ? 0.2 : 1 }
                      : {
                          pathLength: 1,
                          opacity: isOther ? 0.2 : 1,
                        }
                  }
                  transition={perf.lowPerformanceMode ? { duration: 0.18 } : { duration: 1.2, delay: index * 0.15 }}
                />

                {/* 大透明点击热区 */}
                <path
                  d={pathD}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="10"
                  style={{ cursor: "pointer" }}
                  onClick={() => handleBranchClick(branch.id)}
                />

                {/* 路径线 - 不在线上添加任何节点圆点或标签 */}

                {/* 路径终点：分支名 + 概率圆 */}
                <motion.g
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: isOther ? 0.25 : 1, scale: 1 }}
                  transition={perf.lowPerformanceMode ? { duration: 0.18 } : { delay: index * 0.15 + 0.8 }}
                  style={{ cursor: "pointer" }}
                  onClick={() => handleBranchClick(branch.id)}
                >
                  <circle
                    cx={endX}
                    cy={endY}
                    r={4}
                    fill={isSelected ? "rgba(251,191,36,0.2)" : "rgba(99,102,241,0.2)"}
                    stroke={isSelected ? "#fbbf24" : "#818cf8"}
                    strokeWidth="0.4"
                  />
                  <text
                    x={endX}
                    y={endY + 0.5}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="3"
                    fill={isSelected ? "#fbbf24" : "rgba(255,255,255,0.85)"}
                    fontWeight={isSelected ? "600" : "400"}
                  >
                    {branch.name}
                  </text>
                  <text
                    x={endX}
                    y={endY + 7}
                    textAnchor="middle"
                    fontSize="2.2"
                    fill="rgba(255,255,255,0.45)"
                  >
                    {Math.round(branch.probability * 100)}%
                  </text>
                </motion.g>
              </g>
            );
          })}

          {/* 中心原点 */}
          <motion.circle
            cx={CX} cy={CY} r={3}
            fill="white"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.4 }}
          />
          <motion.circle
            cx={CX} cy={CY} r={6}
            fill="none"
            stroke="rgba(255,255,255,0.3)"
            strokeWidth="0.3"
            style={{ opacity: 0.5 }}
            animate={perf.lowPerformanceMode ? undefined : { r: [5, 9, 5], opacity: [0.5, 0, 0.5] }}
            transition={perf.lowPerformanceMode ? undefined : { duration: 2.5, repeat: Infinity }}
          />

          {/* 问题标签 */}
          <foreignObject x={CX - 18} y={CY - 12} width={36} height={8}>
            <div
              className="flex items-center justify-center w-full h-full text-center"
              style={{ fontSize: "3px", color: "rgba(255,255,255,0.7)", lineHeight: 1.3 }}
            >
              {question}
            </div>
          </foreignObject>
          </g>
        </svg>
      </div>

      {/* ── 底部交互区 ── */}
      <div className="flex-shrink-0 px-6 pb-6 space-y-4">

        {/* 三个派系按钮（选中路径后显示） */}
        <AnimatePresence>
          {selectedBranch && (
            <motion.div
              key="factions"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.3 }}
              className="flex items-end justify-center gap-8"
            >
              {FACTIONS.map((faction, i) => {
                const opinion   = currentBranchOpinions[faction.id];
                const isActive  = selectedFaction === faction.id;

                return (
                  <motion.button
                    key={faction.id}
                    onClick={() => handleFactionClick(faction.id)}
                    className="flex flex-col items-center gap-2 select-none"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: i * 0.08 }}
                    whileHover={perf.lowPerformanceMode ? undefined : { y: -4 }}
                    whileTap={perf.lowPerformanceMode ? undefined : { scale: 0.92 }}
                  >
                    {/* 头像圆 */}
                    <div
                      className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold transition-all duration-200"
                      style={{
                        backgroundColor: faction.bgColor,
                        border:          `2.5px solid ${isActive ? faction.color : faction.borderColor}`,
                        color:           faction.color,
                        boxShadow:       isActive ? `0 0 24px ${faction.glow}` : "none",
                        transform:       isActive ? "translateY(-4px)" : "none",
                      }}
                    >
                      {faction.name[0]}
                    </div>

                    {/* 派系名 */}
                    <span
                      className="text-xs font-medium transition-colors duration-200"
                      style={{ color: isActive ? faction.color : "rgba(255,255,255,0.65)" }}
                    >
                      {faction.name}
                    </span>

                    {/* 支持度指示条 */}
                    {opinion && (
                      <div
                        className="h-1 rounded-full transition-all duration-300"
                        style={{
                          width:           `${Math.max(opinion.support * 0.55, 18)}px`,
                          backgroundColor: faction.color,
                          opacity:         isActive ? 1 : 0.45,
                        }}
                      />
                    )}
                  </motion.button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* 意见详情卡片 */}
        <AnimatePresence mode="wait">
          {activeFaction && activeOpinion ? (
            <motion.div
              key={`opinion-${selectedFaction}`}
              className={`rounded-2xl border ${perf.lowPerformanceMode ? "" : "backdrop-blur-xl"} px-5 py-4`}
              style={{
                backgroundColor: "rgba(10,15,26,0.92)",
                borderColor:      activeFaction.borderColor,
                boxShadow:        `0 0 32px ${activeFaction.glow}`,
              }}
              initial={{ opacity: 0, y: 14, scale: 0.97 }}
              animate={{ opacity: 1, y: 0,  scale: 1    }}
              exit={{   opacity: 0, y: 8,   scale: 0.98 }}
              transition={{ duration: 0.22 }}
            >
              {/* 卡片头部 */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-base font-bold"
                    style={{ backgroundColor: activeFaction.bgColor, color: activeFaction.color }}
                  >
                    {activeFaction.name[0]}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{activeFaction.name}</p>
                    <p className="text-xs" style={{ color: activeFaction.color }}>
                      支持度 {activeOpinion.support}%
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedFaction(null)}
                  className="p-1.5 rounded-full hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 支持度进度条 */}
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mb-3">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: activeFaction.color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${activeOpinion.support}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>

              {/* 意见正文 */}
              <p className="text-sm text-white/85 leading-relaxed">
                {activeOpinion.opinion}
              </p>
            </motion.div>
          ) : selectedBranch && !selectedFaction ? (
            <motion.div
              key="description"
              className={`rounded-2xl border border-white/15 ${perf.lowPerformanceMode ? "" : "backdrop-blur-xl"} px-5 py-4 bg-white/5`}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0  }}
              exit={{   opacity: 0, y: 8   }}
              transition={{ duration: 0.22 }}
            >
              {(() => {
                const sel = branches.find((b) => b.id === selectedBranch);
                const emo = sel?.emotionForecast;
                return (
                  <>
                    <div className="flex items-center gap-4 mb-2 text-xs text-white/50 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Heart className="w-3 h-3 text-emerald-400" /> 情感
                      </span>
                      <span className="flex items-center gap-1">
                        <DollarSign className="w-3 h-3 text-blue-400" /> 财务
                      </span>
                      <span className="flex items-center gap-1">
                        <Zap className="w-3 h-3 text-red-400" /> 事件
                      </span>
                      {emo && (
                        <span className="text-white/60">
                          情绪预测：{EMOTION_LABEL[emo] ?? emo}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-white/80 leading-relaxed">{sel?.description}</p>
                  </>
                );
              })()}
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* 无选择时的提示 */}
        {!selectedBranch && (
          <motion.p
            className="text-center text-xs text-white/35"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
          >
            点击路径查看三个派系的意见
          </motion.p>
        )}

        {/* 分支比较视图（至少两条分支） */}
        {branches.length >= 2 && (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <div className="text-xs text-white/60 mb-2">分支比较</div>
            <div className="flex flex-wrap gap-2 mb-3">
              <select
                value={effectiveCompareA ?? ""}
                onChange={(e) => setCompareA(e.target.value || null)}
                className="px-2 py-1 rounded-lg bg-black/30 border border-white/10 text-xs text-white"
              >
                <option value="">选择分支A</option>
                {branches.map((b) => (
                  <option key={`a-${b.id}`} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <select
                value={effectiveCompareB ?? ""}
                onChange={(e) => setCompareB(e.target.value || null)}
                className="px-2 py-1 rounded-lg bg-black/30 border border-white/10 text-xs text-white"
              >
                <option value="">选择分支B</option>
                {branches.map((b) => (
                  <option key={`b-${b.id}`} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            {effectiveCompareA && effectiveCompareB && effectiveCompareA !== effectiveCompareB && (
              <div className="text-xs text-white/75 leading-relaxed space-y-2">
                {(() => {
                  const a = branches.find((b) => b.id === effectiveCompareA);
                  const b = branches.find((b) => b.id === effectiveCompareB);
                  if (!a || !b) return "请选择有效分支。";
                  const emoA = a.emotionForecast ? EMOTION_LABEL[a.emotionForecast] ?? a.emotionForecast : "-";
                  const emoB = b.emotionForecast ? EMOTION_LABEL[b.emotionForecast] ?? b.emotionForecast : "-";
                  return (
                    <>
                      <p>
                        <span className="text-white/90 font-medium">A · {a.name}</span>：收益 {a.benefitScore ?? "-"} /
                        风险 {a.riskScore ?? "-"} · 情绪预测 {emoA}
                      </p>
                      <p>
                        <span className="text-white/90 font-medium">B · {b.name}</span>：收益 {b.benefitScore ?? "-"} /
                        风险 {b.riskScore ?? "-"} · 情绪预测 {emoB}
                      </p>
                      {comparedDelta && (
                        <p className="text-white/55">
                          相对差值（A−B）：收益 {comparedDelta.benefit > 0 ? "+" : ""}
                          {comparedDelta.benefit}，风险 {comparedDelta.risk > 0 ? "+" : ""}
                          {comparedDelta.risk}
                        </p>
                      )}
                      {(compareSummary ?? "").trim().length > 0 && <p>{compareSummary}</p>}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
