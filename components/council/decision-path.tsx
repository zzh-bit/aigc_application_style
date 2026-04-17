"use client";

import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, DollarSign, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { usePerformanceProfile } from "@/lib/performance";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  onSelectBranch: (id: string | null) => void;
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

function factionSupportText(support?: number): string {
  if (typeof support !== "number" || Number.isNaN(support)) return "--";
  const s = Math.max(0, Math.min(100, Math.round(support)));
  return `${s}%`;
}

/** 与后端约定一致：event → finance → emotion 三关键词 */
function pickNodeLabel(nodes: PathNode[] | undefined, type: NodeType): string {
  if (!nodes?.length) return "—";
  const n = nodes.find((x) => x.type === type);
  const t = n?.label?.replace(/\s+/g, " ").trim();
  return t && t.length > 0 ? t : "—";
}

/** 决策树末端一行展示用（控制长度避免与邻分支重叠） */
function branchKeywordLine(branch: DecisionBranch, maxLen: number): string {
  const e = pickNodeLabel(branch.nodes, "event");
  const f = pickNodeLabel(branch.nodes, "finance");
  const m = pickNodeLabel(branch.nodes, "emotion");
  const s = `${e} · ${f} · ${m}`;
  if (s.length <= maxLen) return s;
  return `${s.slice(0, Math.max(4, maxLen - 1))}…`;
}

function BranchCompareSelectRow({
  slot,
  value,
  onChange,
  branches,
  excludeId,
}: {
  slot: "A" | "B";
  value: string | undefined;
  onChange: (id: string | undefined) => void;
  branches: DecisionBranch[];
  excludeId?: string | null;
}) {
  const candidates =
    excludeId && branches.some((b) => b.id === excludeId)
      ? branches.filter((b) => b.id !== excludeId)
      : branches;
  const list = candidates.length > 0 ? candidates : branches;
  const v = value && branches.some((b) => b.id === value) ? value : undefined;
  return (
    <div className="min-w-0 flex-1 flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wide text-white/45">路径 {slot}</span>
      <Select
        value={v}
        onValueChange={(id) => onChange(id)}
      >
        <SelectTrigger
          size="sm"
          className={cn(
            "h-9 w-full min-w-0 border-white/18 bg-black/45 text-xs text-white/92 shadow-sm",
            "focus-visible:ring-2 focus-visible:ring-indigo-400/40 focus-visible:border-indigo-300/45",
            "[&_[data-slot=select-value]]:truncate [&_[data-slot=select-value]]:text-left",
          )}
        >
          <SelectValue placeholder={slot === "A" ? "选择分支 A" : "选择分支 B"} />
        </SelectTrigger>
        <SelectContent
          position="popper"
          sideOffset={6}
          className="z-[300] max-h-[min(280px,46vh)] w-[var(--radix-select-trigger-width)] min-w-[10rem] border-white/15 bg-[oklch(0.12_0.02_260)] text-white/95 shadow-2xl backdrop-blur-xl"
        >
          {list.map((b) => (
            <SelectItem
              key={`cmp-${slot}-${b.id}`}
              value={b.id}
              className="cursor-pointer text-xs py-2.5 focus:bg-white/10 focus:text-white"
            >
              {b.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function BranchComparePanel({
  branches,
  setCompareA,
  setCompareB,
  effectiveCompareA,
  effectiveCompareB,
  compareSummary,
  comparedDelta,
}: {
  branches: DecisionBranch[];
  setCompareA: (id: string | null) => void;
  setCompareB: (id: string | null) => void;
  effectiveCompareA: string | null;
  effectiveCompareB: string | null;
  compareSummary?: string;
  comparedDelta: DecisionPathProps["comparedDelta"];
}) {
  return (
    <>
      <div className="text-xs font-medium text-white/65 mb-2">分支比较</div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-3 mb-3">
        <BranchCompareSelectRow
          slot="A"
          value={effectiveCompareA ?? undefined}
          onChange={(id) => setCompareA(id ?? null)}
          branches={branches}
          excludeId={effectiveCompareB ?? undefined}
        />
        <BranchCompareSelectRow
          slot="B"
          value={effectiveCompareB ?? undefined}
          onChange={(id) => setCompareB(id ?? null)}
          branches={branches}
          excludeId={effectiveCompareA ?? undefined}
        />
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
    </>
  );
}

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

  const closeBranchDrawer = () => {
    setSelectedFaction(null);
    onSelectBranch(null);
  };

  const handleFactionClick = (factionId: string) => {
    setSelectedFaction(prev => (prev === factionId ? null : factionId));
  };

  // SVG 坐标系：viewBox="0 0 100 100"（树在小屏/横屏下更容易被裁切，需更克制的缩放与半径）
  const CX = 50;
  const CY = 26;
  const TREE_SCALE = 1.18;
  const treeTransform = `translate(${CX * (1 - TREE_SCALE)} ${(CY + 1) * (1 - TREE_SCALE)}) scale(${TREE_SCALE})`;
  const tx = CX * (1 - TREE_SCALE);
  const ty = (CY + 1) * (1 - TREE_SCALE);

  const selectedBranchGeom = (() => {
    const selectedBranchId = selectedBranchData?.id ?? null;
    if (!selectedBranchId) return null;
    const index = branches.findIndex((b) => b.id === selectedBranchId);
    if (index < 0) return null;
    const totalBranches = branches.length;
    const spread = 76;
    const angleDenom = Math.max(1, totalBranches - 1);
    const angleOffset = (index - (totalBranches - 1) / 2) * (spread / angleDenom);
    const rad = (angleOffset * Math.PI) / 180;
    const endX = CX + Math.sin(rad) * 46;
    const endY = CY + 44 + Math.abs(Math.sin(rad)) * 4;
    // Apply the same transform as the SVG group: translate then scale.
    const xT = (endX + tx) * TREE_SCALE;
    const yT = (endY + ty) * TREE_SCALE;
    return { xT, yT };
  })();

  return (
    <div className="relative w-full h-full overflow-hidden">

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

      <div className="relative z-10 h-full min-h-0 flex flex-col">
        {/* 上方：决策树（左 3/4） + 分支比较（右侧） */}
        <div className="shrink-0 h-[72dvh] md:h-[75dvh] min-h-[14rem] flex min-w-0 -mt-2 md:-mt-3">
          {/* ── 决策树 SVG：占 3/4，略左移，避免文字被遮挡 ── */}
          <div className="relative z-30 flex-[3] min-w-0 overflow-visible px-2 sm:px-4 md:pl-3 md:pr-1 md:-translate-x-1">
            {/* 顶部主题：用 HTML 叠层，避免 SVG/裁切导致遮挡 */}
            <div className="absolute left-2 right-2 top-2 z-20 flex justify-center pointer-events-none">
              <div
                className="max-w-[min(92%,20rem)] rounded-full border border-white/10 bg-black/35 px-3 py-1 text-[11px] text-white/75 backdrop-blur-md truncate"
                title={question}
              >
                {question}
              </div>
            </div>

            {/* 选中分支：派系意见用 HTML 叠层（避免 WebView foreignObject 不显示） */}
            {selectedBranch && selectedBranchGeom && (
              <div
                className="absolute z-[90] pointer-events-none"
                style={{
                  left: `${selectedBranchGeom.xT}%`,
                  top: `${selectedBranchGeom.yT}%`,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <div className="relative pointer-events-auto">
                  {(() => {
                    const offsets = [
                      { x: -40, y: -44 },
                      { x: 0, y: -58 },
                      { x: 40, y: -44 },
                    ];
                    return FACTIONS.map((f, i) => {
                      const op = currentBranchOpinions[f.id];
                      const isActive = selectedFaction === f.id;
                      const o = offsets[i] ?? { x: 0, y: 0 };
                      return (
                        <div
                          key={`overlay-faction-${f.id}`}
                          className="absolute"
                          style={{ transform: `translate(${o.x}px, ${o.y}px)` }}
                        >
                          {isActive && op?.opinion && (
                            <div
                              className="mb-1 w-[168px] max-w-[42vw] rounded-xl border px-2 py-2 text-[11px] leading-snug text-white/90 backdrop-blur-xl"
                              style={{
                                backgroundColor: "rgba(10,15,26,0.92)",
                                borderColor: f.borderColor,
                                boxShadow: `0 0 18px ${f.glow}`,
                              }}
                            >
                              {op.opinion}
                            </div>
                          )}
                          <button
                            type="button"
                            className="flex flex-col items-center gap-0.5 select-none"
                            onClick={() => handleFactionClick(f.id)}
                          >
                            <div
                              className="h-8 w-8 rounded-full flex items-center justify-center text-[12px] font-bold"
                              style={{
                                backgroundColor: f.bgColor,
                                border: `2px solid ${isActive ? f.color : f.borderColor}`,
                                color: f.color,
                                boxShadow: isActive ? `0 0 18px ${f.glow}` : "none",
                              }}
                            >
                              {f.name[0]}
                            </div>
                            <div className="text-[10px] text-white/55">{factionSupportText(op?.support)}</div>
                          </button>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}

            <svg className="w-full h-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
              <g transform={treeTransform}>
                {/* 分支路径 */}
                {branches.map((branch, index) => {
                  const totalBranches = branches.length;
                  const spread = 76;
                  const angleDenom = Math.max(1, totalBranches - 1);
                  const angleOffset = (index - (totalBranches - 1) / 2) * (spread / angleDenom);
                  const rad = (angleOffset * Math.PI) / 180;
                  const endX = CX + Math.sin(rad) * 46;
                  const endY = CY + 44 + Math.abs(Math.sin(rad)) * 4;

                  const isSelected = selectedBranch === branch.id;
                  const isOther = selectedBranch !== null && !isSelected;

                  const pathD = `M ${CX} ${CY} C ${CX + (endX - CX) * 0.3} ${CY + 8}, ${endX - (endX - CX) * 0.2} ${endY - 8}, ${endX} ${endY}`;

                  return (
                    <g key={branch.id}>
                {/* 主路径 */}
                <motion.path
                  d={pathD}
                  fill="none"
                  strokeLinecap="round"
                  strokeWidth={isSelected ? 1.05 : 0.65}
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
                  strokeWidth="14"
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
                    r={4.6}
                    fill={isSelected ? "rgba(251,191,36,0.2)" : "rgba(99,102,241,0.2)"}
                    stroke={isSelected ? "#fbbf24" : "#818cf8"}
                    strokeWidth="0.45"
                  />
                  <text
                    x={endX}
                    y={endY + 0.5}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="3.2"
                    fill={isSelected ? "#fbbf24" : "rgba(255,255,255,0.85)"}
                    fontWeight={isSelected ? "600" : "400"}
                  >
                    {branch.name}
                  </text>
                  <text
                    x={endX}
                    y={endY + 8.5}
                    textAnchor="middle"
                    fontSize="2.4"
                    fill="rgba(255,255,255,0.45)"
                  >
                    {Math.round(branch.probability * 100)}%
                  </text>
                  <text
                    x={endX}
                    y={endY + 13.2}
                    textAnchor="middle"
                    fontSize="1.75"
                    fill="rgba(255,255,255,0.38)"
                  >
                    {branchKeywordLine(branch, 34)}
                  </text>
                </motion.g>
                    </g>
                  );
                })}

          {/* 中心原点 */}
          <motion.circle
            cx={CX} cy={CY} r={3.6}
            fill="white"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.4 }}
          />
          <motion.circle
            cx={CX} cy={CY} r={7}
            fill="none"
            stroke="rgba(255,255,255,0.3)"
            strokeWidth="0.35"
            style={{ opacity: 0.5 }}
            animate={perf.lowPerformanceMode ? undefined : { r: [6, 11, 6], opacity: [0.5, 0, 0.5] }}
            transition={perf.lowPerformanceMode ? undefined : { duration: 2.5, repeat: Infinity }}
          />

              </g>
            </svg>
          </div>

          {/* ── 分支比较：移到右侧（中大屏显示，小屏继续在底部） ── */}
          {branches.length >= 2 && (
            <div className="hidden sm:flex z-10 flex-1 min-w-[14rem] max-w-[32vw] min-h-0 pr-2 pl-1 py-2 sm:pr-3 sm:pl-1 sm:py-3">
              <div className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 overflow-y-auto">
                <BranchComparePanel
                  branches={branches}
                  setCompareA={setCompareA}
                  setCompareB={setCompareB}
                  effectiveCompareA={effectiveCompareA}
                  effectiveCompareB={effectiveCompareB}
                  compareSummary={compareSummary}
                  comparedDelta={comparedDelta}
                />
              </div>
            </div>
          )}
        </div>

        {/* 下方：分支比较（小屏） */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 sm:px-6 pb-4 sm:pb-6 space-y-4">

        {/* 分支比较视图（小屏保底放在底部；中大屏已移到右侧） */}
        {branches.length >= 2 && (
          <div className="sm:hidden rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <BranchComparePanel
              branches={branches}
              setCompareA={setCompareA}
              setCompareB={setCompareB}
              effectiveCompareA={effectiveCompareA}
              effectiveCompareB={effectiveCompareB}
              compareSummary={compareSummary}
              comparedDelta={comparedDelta}
            />
          </div>
        )}
      </div>

      {/* 选中分支详情：底部抽屉（避免在底部提示条之下不可见） */}
      <AnimatePresence>
        {selectedBranch && !selectedFaction ? (
          <motion.div
            key="branch-drawer"
            className="absolute inset-0 z-[120]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div
              className="absolute inset-0 bg-black/35"
              onClick={closeBranchDrawer}
              role="button"
              aria-label="关闭分支详情"
            />
            <motion.div
              className={`absolute left-0 right-0 bottom-0 mx-auto w-full max-w-3xl rounded-t-3xl border border-white/15 bg-[rgba(10,15,26,0.92)] ${perf.lowPerformanceMode ? "" : "backdrop-blur-xl"} shadow-2xl`}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 280 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 pt-3 pb-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wide text-white/45">路径详情</div>
                    <div className="mt-0.5 text-sm font-medium text-white/90 truncate">
                      {branches.find((b) => b.id === selectedBranch)?.name ?? "已选择路径"}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={closeBranchDrawer}
                    className="shrink-0 rounded-full border border-white/12 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10"
                  >
                    收起
                  </button>
                </div>

                <div className="mt-3 max-h-[52vh] overflow-y-auto pr-1">
                  {(() => {
                    const sel = branches.find((b) => b.id === selectedBranch);
                    const emo = sel?.emotionForecast;
                    const ev = sel ? pickNodeLabel(sel.nodes, "event") : "—";
                    const fi = sel ? pickNodeLabel(sel.nodes, "finance") : "—";
                    const em = sel ? pickNodeLabel(sel.nodes, "emotion") : "—";
                    return (
                      <>
                        <div className="mb-3 rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 space-y-1.5">
                          <div className="text-[10px] font-medium uppercase tracking-wide text-white/40">
                            路径关键词（决策树提炼）
                          </div>
                          <div className="flex items-start gap-2 text-xs text-white/85 leading-snug">
                            <Zap className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400/90" />
                            <span>
                              <span className="text-white/45">事件</span> · {ev}
                            </span>
                          </div>
                          <div className="flex items-start gap-2 text-xs text-white/85 leading-snug">
                            <DollarSign className="w-3.5 h-3.5 shrink-0 mt-0.5 text-sky-400/90" />
                            <span>
                              <span className="text-white/45">财务</span> · {fi}
                            </span>
                          </div>
                          <div className="flex items-start gap-2 text-xs text-white/85 leading-snug">
                            <Heart className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-400/90" />
                            <span>
                              <span className="text-white/45">情绪</span> · {em}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 mb-2 text-xs text-white/45 flex-wrap">
                          {emo && (
                            <span className="text-white/55">
                              路径情绪预测：{EMOTION_LABEL[emo] ?? emo}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-white/80 leading-relaxed">{sel?.description}</p>
                      </>
                    );
                  })()}
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
    </div>
  );
}
