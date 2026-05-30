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

// ─── 子组件（提取到组件外，避免渲染期间创建组件） ──────────────────────────────

function ScoreBar({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | null;
  tone: "benefit" | "risk";
}) {
  const v = typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null;
  const track = "bg-white/10";
  const fill =
    tone === "benefit"
      ? "bg-gradient-to-r from-emerald-400/70 via-emerald-300/70 to-emerald-200/60"
      : "bg-gradient-to-r from-rose-400/70 via-rose-300/70 to-rose-200/60";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] text-white/55">
        <span>{label}</span>
        <span className="tabular-nums text-white/70">{v === null ? "—" : v}</span>
      </div>
      <div className={cn("h-2 w-full rounded-full overflow-hidden", track)}>
        <div className={cn("h-full rounded-full", fill)} style={{ width: `${v ?? 0}%` }} />
      </div>
    </div>
  );
}

function EmotionPill({ emo }: { emo: string | undefined }) {
  const text = emo ? EMOTION_LABEL[emo] ?? emo : "—";
  return (
    <span className="inline-flex items-center rounded-full border border-white/10 bg-black/30 px-2 py-0.5 text-[11px] text-white/70">
      {text}
    </span>
  );
}

function DeltaChip({ label, value, tone }: { label: string; value: number; tone: "good" | "bad" }) {
  const good = value > 0;
  const isGood = tone === "good" ? good : !good;
  const color = isGood ? "text-emerald-200 border-emerald-300/25 bg-emerald-500/10" : "text-rose-200 border-rose-300/25 bg-rose-500/10";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] tabular-nums", color)}>
      <span className="text-white/60">{label}</span>
      <span>{value > 0 ? `+${value}` : `${value}`}</span>
    </span>
  );
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
  const a = effectiveCompareA ? branches.find((b) => b.id === effectiveCompareA) ?? null : null;
  const b = effectiveCompareB ? branches.find((b) => b.id === effectiveCompareB) ?? null : null;

  return (
    <>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-medium text-white/70">分支比较</div>
        {a && b && a.id !== b.id && comparedDelta && (
          <div className="flex items-center gap-1.5">
            <DeltaChip label="收益" value={comparedDelta.benefit} tone="good" />
            <DeltaChip label="风险" value={comparedDelta.risk} tone="bad" />
          </div>
        )}
      </div>
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
      {a && b && a.id !== b.id && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wide text-white/45">A 路径</div>
                  <div className="mt-0.5 text-xs font-medium text-white/90 leading-snug break-words">{a.name}</div>
                </div>
                <EmotionPill emo={a.emotionForecast} />
              </div>
              <div className="mt-2 space-y-2">
                <ScoreBar label="收益" value={typeof a.benefitScore === "number" ? a.benefitScore : null} tone="benefit" />
                <ScoreBar label="风险" value={typeof a.riskScore === "number" ? a.riskScore : null} tone="risk" />
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wide text-white/45">B 路径</div>
                  <div className="mt-0.5 text-xs font-medium text-white/90 leading-snug break-words">{b.name}</div>
                </div>
                <EmotionPill emo={b.emotionForecast} />
              </div>
              <div className="mt-2 space-y-2">
                <ScoreBar label="收益" value={typeof b.benefitScore === "number" ? b.benefitScore : null} tone="benefit" />
                <ScoreBar label="风险" value={typeof b.riskScore === "number" ? b.riskScore : null} tone="risk" />
              </div>
            </div>
          </div>

          {(compareSummary ?? "").trim().length > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-wide text-white/45 mb-1">对比结论</div>
              <div className="text-xs text-white/80 leading-relaxed">{compareSummary}</div>
            </div>
          )}
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

      {/* 选中分支详情：底部抽屉（内置派系意见按钮，避免被遮挡） */}
      <AnimatePresence>
        {selectedBranch ? (
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
                    const opinions = sel?.opinions ?? {};
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

                        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
                          <div className="text-[10px] font-medium uppercase tracking-wide text-white/45 mb-2">
                            各派系意见（点击查看）
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            {FACTIONS.map((f) => {
                              const op = opinions[f.id];
                              const isActive = selectedFaction === f.id;
                              return (
                                <button
                                  key={`drawer-faction-${f.id}`}
                                  type="button"
                                  onClick={() => handleFactionClick(f.id)}
                                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px]"
                                  style={{
                                    backgroundColor: f.bgColor,
                                    border: `1.5px solid ${isActive ? f.color : f.borderColor}`,
                                    color: f.color,
                                    boxShadow: isActive ? `0 0 12px ${f.glow}` : "none",
                                  }}
                                >
                                  <span className="font-semibold">{f.name}</span>
                                  <span className="text-white/65">{factionSupportText(op?.support)}</span>
                                </button>
                              );
                            })}
                          </div>
                          {selectedFaction && activeFaction && activeOpinion?.opinion && (
                            <div
                              className="mt-3 rounded-lg border px-2.5 py-2 text-xs leading-relaxed text-white/90"
                              style={{
                                backgroundColor: "rgba(10,15,26,0.92)",
                                borderColor: activeFaction.borderColor,
                              }}
                            >
                              <div className="mb-1 text-[10px]" style={{ color: activeFaction.color }}>
                                {activeFaction.name}观点
                              </div>
                              {activeOpinion.opinion}
                            </div>
                          )}
                        </div>
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
