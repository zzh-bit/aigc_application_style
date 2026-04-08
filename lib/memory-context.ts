import type { MemoryItem } from "@/lib/types/domain";

export type MemoryContextHit = Pick<MemoryItem, "id" | "title" | "summary" | "keywords"> & {
  score: number;
};

function tokenize(text: string) {
  return (text.toLowerCase().match(/[\u4e00-\u9fa5]{1,}|[a-z0-9-]{2,}/g) ?? []).filter(Boolean);
}

export function selectRelevantMemories(input: {
  query: string;
  memories: MemoryItem[];
  topK?: number;
}) {
  const topK = input.topK ?? 3;
  const qTokens = new Set(tokenize(input.query));

  const ranked: MemoryContextHit[] = input.memories.map((m) => {
    const base = `${m.title} ${m.summary} ${(m.keywords ?? []).join(" ")}`;
    const tokens = tokenize(base);

    let score = 0;
    for (const t of tokens) {
      if (qTokens.has(t)) score += 2;
    }

    for (const kw of m.keywords ?? []) {
      if (input.query.includes(kw)) score += 3;
    }

    if (typeof m.year === "number") {
      const age = Math.max(0, new Date().getFullYear() - m.year);
      score += Math.max(0, 3 - age * 0.3);
    }

    if (!Number.isFinite(score)) score = 0;
    return {
      id: m.id,
      title: m.title,
      summary: m.summary,
      keywords: m.keywords ?? [],
      score,
    };
  });

  return ranked
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
