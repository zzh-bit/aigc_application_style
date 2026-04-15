import type { MemoryItem } from "@/lib/types/domain";

export type MemoryContextHit = Pick<MemoryItem, "id" | "title" | "summary" | "keywords"> & {
  score: number;
};

/** 单次检索最多返回条数（全产品统一上限） */
export const MEMORY_RETRIEVAL_MAX_HITS = 6;

const CN_STOP = new Set([
  "我们",
  "你们",
  "他们",
  "这个",
  "那个",
  "就是",
  "然后",
  "如果",
  "但是",
  "因为",
  "所以",
  "什么",
  "怎么",
  "如何",
  "可以",
  "不能",
  "一个",
  "没有",
  "的话",
  "请问",
  "现在",
  "今天",
  "为什么",
  "觉得",
  "感觉",
  "一下",
  "这样",
  "那样",
]);

function tokenize(text: string) {
  return (text.toLowerCase().match(/[\u4e00-\u9fa5]{1,}|[a-z0-9-]{2,}/g) ?? []).filter(Boolean);
}

function normalizeLoose(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** 去掉常见标点，便于「整句 / 分句」包含判断 */
function stripPunct(s: string) {
  return s
    .replace(/[\s\u3000\uff0c\u3002\uff1f\uff01\u201c\u201d\u2018\u2019,.;:!?'"()[\]{}、。！？；：「」『』—…\-]/g, "")
    .toLowerCase();
}

function significantTokensFromQuery(q: string) {
  return tokenize(q).filter((t) => !CN_STOP.has(t) && t.length >= 2);
}

/** 字二元组得分，上限避免长问句刷分 */
function bigramOverlapScoreCapped(query: string, haystack: string, cap: number) {
  const qh = query.replace(/\s/g, "").toLowerCase();
  const hh = haystack.replace(/\s/g, "").toLowerCase();
  if (qh.length < 2 || hh.length < 2) return 0;
  let raw = 0;
  for (let i = 0; i < qh.length - 1; i++) {
    const bg = qh.slice(i, i + 2);
    if (hh.includes(bg)) raw += 1.15;
  }
  return Math.min(cap, raw);
}

/** 按标点切分后的子句命中（用户常一口气打多个意群） */
function clauseHitScore(query: string, hayStrip: string) {
  const parts = query
    .split(/[，,。；;\n、]+/)
    .map((p) => stripPunct(p).trim())
    .filter((p) => p.length >= 3);
  let s = 0;
  for (const p of parts.slice(0, 6)) {
    if (hayStrip.includes(p)) s += 3.8;
  }
  return Math.min(14, s);
}

function jaccardTokenSimilarity(a: string, b: string) {
  const sa = new Set(tokenize(a));
  const sb = new Set(tokenize(b));
  if (sa.size === 0 && sb.size === 0) return 1;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

function dedupeMemoriesById(memories: MemoryItem[]): MemoryItem[] {
  const seen = new Set<string>();
  const out: MemoryItem[] = [];
  for (const m of memories) {
    const id = (m.id ?? "").trim() || `${m.title}\0${m.summary}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(m);
  }
  return out;
}

/**
 * 从记忆库中按「当前用户这一句」检索相关条目：0～6 条。
 * - 归一化整句 / 分句 / 标题 / 关键词 / 显著词覆盖率 / 二元组（有上限）/ 年份
 * - 相对阈值 + 摘要相似去重，减少重复条目
 */
export function selectRelevantMemories(input: {
  query: string;
  memories: MemoryItem[];
  /** 最多返回条数，不超过 {@link MEMORY_RETRIEVAL_MAX_HITS}（默认 6） */
  maxHits?: number;
  /** @deprecated 同 maxHits */
  topK?: number;
  /** 保留 score >= bestScore * relativeFloor（默认 0.22） */
  relativeFloor?: number;
  /** 绝对分下限（默认 2.4，随打分尺度一并调高） */
  minAbsoluteScore?: number;
  /** 与已选摘要过近则跳过（默认 0.8） */
  dedupeSimilarity?: number;
}) {
  const requested = input.maxHits ?? input.topK ?? MEMORY_RETRIEVAL_MAX_HITS;
  const maxHits = Math.max(1, Math.min(MEMORY_RETRIEVAL_MAX_HITS, requested));
  const relativeFloor = input.relativeFloor ?? 0.22;
  const minAbsoluteScore = input.minAbsoluteScore ?? 2.4;
  const dedupeSimilarity = input.dedupeSimilarity ?? 0.8;

  const qRaw = input.query.trim();
  if (!qRaw || input.memories.length === 0) return [];

  const qLower = qRaw.toLowerCase();
  const qNorm = normalizeLoose(qRaw);
  const qStrip = stripPunct(qRaw);
  const qSig = significantTokensFromQuery(qRaw);
  const qTokenSet = new Set(tokenize(qRaw));

  const uniqueMemories = dedupeMemoriesById(input.memories);

  const ranked: MemoryContextHit[] = uniqueMemories.map((m) => {
    const title = (m.title ?? "").trim();
    const summary = (m.summary ?? "").trim();
    const content = (m.content ?? "").trim();
    const kw = m.keywords ?? [];
    const hay = `${title} ${summary} ${content} ${kw.join(" ")}`;
    const hayLower = hay.toLowerCase();
    const hayNorm = normalizeLoose(hay);
    const hayStrip = stripPunct(hay);

    let score = 0;

    if (qStrip.length >= 2 && hayStrip.includes(qStrip)) {
      score += 18;
    } else if (qNorm.length >= 2 && hayNorm.includes(qNorm)) {
      score += 15;
    } else if (qLower.length >= 2 && hayLower.includes(qLower)) {
      score += 13;
    }

    score += clauseHitScore(qRaw, hayStrip);

    if (title) {
      const tl = title.toLowerCase();
      const tStrip = stripPunct(title);
      if (qStrip.length >= 2 && tStrip.length >= 2 && (qStrip.includes(tStrip) || tStrip.includes(qStrip))) {
        score += 10;
      }
      if (qLower.length >= 2 && tl.includes(qLower)) score += 7;
      for (const t of qSig) {
        if (t.length >= 2 && tl.includes(t)) score += 3.2;
      }
    }

    if (qSig.length > 0) {
      let hit = 0;
      for (const t of qSig) {
        if (hayLower.includes(t)) hit++;
      }
      score += (hit / qSig.length) * 11;
    } else {
      for (const t of tokenize(hay)) {
        if (qTokenSet.has(t) && t.length >= 2 && !CN_STOP.has(t)) score += 2;
      }
    }

    for (const k of kw) {
      const ks = String(k).trim();
      if (ks.length < 2) continue;
      const kl = ks.toLowerCase();
      if (qRaw.includes(ks) || qLower.includes(kl)) score += 5.5;
      else if (ks.length >= 2 && qStrip.includes(stripPunct(ks))) score += 4;
    }

    score += bigramOverlapScoreCapped(qRaw, hay, 11);

    if (typeof m.year === "number") {
      const age = Math.max(0, new Date().getFullYear() - m.year);
      score += Math.max(0, 2 - age * 0.2);
    }

    if (!Number.isFinite(score)) score = 0;
    return {
      id: m.id,
      title: m.title,
      summary: m.summary,
      keywords: kw,
      score,
    };
  });

  ranked.sort((a, b) => b.score - a.score);
  const best = ranked[0]?.score ?? 0;
  if (best <= 0) return [];

  const threshold = Math.max(minAbsoluteScore, best * relativeFloor);
  const pool = ranked.filter((m) => m.score >= threshold).slice(0, maxHits * 3);

  const selected: MemoryContextHit[] = [];
  for (const cand of pool) {
    if (selected.length >= maxHits) break;
    const textA = `${cand.title} ${cand.summary}`;
    const tooSimilar = selected.some(
      (s) => jaccardTokenSimilarity(textA, `${s.title} ${s.summary}`) >= dedupeSimilarity,
    );
    if (tooSimilar) continue;
    selected.push(cand);
  }

  return selected;
}

/**
 * 议会 / 导师气泡：拼接本轮命中的记忆（最多 6 条，截断防刷屏）。
 */
export function formatHitsForUserEvidence(hits: MemoryContextHit[], maxItems = MEMORY_RETRIEVAL_MAX_HITS) {
  if (hits.length === 0) return "";
  const cap = Math.min(MEMORY_RETRIEVAL_MAX_HITS, maxItems);
  const parts = hits.slice(0, cap).map((h, idx) => {
    const s = h.summary.trim();
    const short = s.length > 120 ? `${s.slice(0, 120)}…` : s;
    return `${idx + 1}.「${h.title}」：${short}`;
  });
  return `【本轮与用户发言相关的个人记忆】\n${parts.join("\n")}`;
}
