/**
 * 矩阵校验：任意议题下决策树与主题锚定（与 /api/projection 同源逻辑）。
 * 运行：npx tsx scripts/verify-projection-topics.ts
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  buildGroundedProjectionFromCouncil,
  projectionBranchesLookOffTopic,
  type GroundedCouncilMsg,
} from "../lib/projection-grounded";

const repoRoot = process.cwd();

const samples: { topic: string; messages: GroundedCouncilMsg[] }[] = [
  { topic: "要不要去北京工作", messages: [] },
  { topic: "该不该去深圳发展", messages: [] },
  { topic: "是否换城市重新开始", messages: [] },
  { topic: "买不买学区房", messages: [] },
  { topic: "去不去杭州上班", messages: [] },
  { topic: "去北京还是西安发展", messages: [] },
  { topic: "去北京还是留在南京", messages: [] },
  { topic: "晚上吃麻辣烫还是喝粥", messages: [] },
  { topic: "要不要辞职读研", messages: [] },
  { topic: "要不要转行做产品经理", messages: [] },
  { topic: "该不该继续异地恋", messages: [] },
  { topic: "是留在大厂还是去创业公司", messages: [] },
  { topic: "Should I switch to remote work next quarter", messages: [] },
  { topic: "Should I move to Singapore for work", messages: [] },
  { topic: "Should I resign and prepare for grad school", messages: [] },
  {
    topic: "要不要去北京工作（含主持人归纳）",
    messages: [
      { role: "user", name: "你", content: "我纠结要不要去北京工作，怕压力太大" },
      { role: "assistant", name: "主持人", content: "核心是围绕“去北京工作”在成长机会与生活压力之间取舍。" },
    ],
  },
  {
    topic: "要不要转行做产品",
    messages: [{ role: "user", name: "你", content: "现岗稳定但成长慢，怕转过去不适应" }],
  },
];

function normalizeText(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase();
}

function expectAnchored(topic: string, branches: ReturnType<typeof buildGroundedProjectionFromCouncil>["branches"]) {
  const union = normalizeText(
    branches
      .map(
        (b) =>
          `${b.name}${b.description}${b.opinions?.radical?.opinion ?? ""}${b.opinions?.future?.opinion ?? ""}${b.opinions?.conservative?.opinion ?? ""}`,
      )
      .join(" "),
  );
  const t = normalizeText(topic);

  // 要不要类：至少要命中核心动作锚点（例如 去北京工作）
  if (/要不要|该不该|是否|需不需要|能不能|可不可以/.test(topic)) {
    const action = topic
      .replace(/.*(?:要不要|该不该|是否|需不需要|能不能|可不可以)/, "")
      .replace(/[吗呢吧呀啊嘛呗\s?？!！。,.，；;：:]+$/g, "")
      .trim();
    if (action.length >= 2) {
      const actionNorm = normalizeText(action);
      assert.ok(union.includes(actionNorm), `未命中要不要动作锚点: ${topic}`);
      return;
    }
  }

  // 还是类：两侧都应出现至少一侧关键词（弱化校验，避免自然语言同义改写造成误报）
  if (topic.includes("还是")) {
    const [left, right] = topic.split("还是");
    const l = normalizeText(left.replace(/^(请问|我想问|想问|今天|今晚|要不要|该不该)/g, "").trim());
    const r = normalizeText(right.replace(/[吗呢吧呀啊嘛呗\s?？!！。,.，；;：:]+$/g, "").trim());
    assert.ok(union.includes(l.slice(-4)) || union.includes(r.slice(-4)), `未命中还是议题锚点: ${topic}`);
    return;
  }

  // 兜底：主题中至少一个较长词应命中分支内容
  const chunks = topic.match(/[\u4e00-\u9fa5]{2,}|[a-zA-Z][a-zA-Z0-9_-]{2,}/g) ?? [];
  const key = chunks.find((c) => c.length >= 3 && !/should|what|how|why|是否|要不要|该不该/.test(c.toLowerCase()));
  if (key) {
    assert.ok(union.includes(normalizeText(key)), `未命中主题关键词: ${topic}`);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const rows: string[] = [];
for (const { topic, messages } of samples) {
  const { branches, compared } = buildGroundedProjectionFromCouncil(topic, messages);
  assert.ok(branches.length >= 2, topic);
  const off = projectionBranchesLookOffTopic(branches, topic, messages);
  assert.ok(!off, `跑题: ${topic}`);
  for (const b of branches) {
    assert.ok(`${b.name}${b.description}`.length > 4, `空路径: ${topic}`);
  }
  expectAnchored(topic, branches);
  rows.push(
    `<tr><td>${escapeHtml(topic)}</td><td>${off ? "FAIL" : "OK"}</td><td>${escapeHtml(
      branches.map((b) => b.name).join(" / "),
    )}</td><td>${escapeHtml(compared.summary.slice(0, 80))}</td></tr>`,
  );
}

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Projection topic matrix</title>
<style>body{font-family:system-ui;padding:16px;background:#111;color:#eee;} table{border-collapse:collapse;width:100%;} td,th{border:1px solid #444;padding:8px;vertical-align:top;} th{background:#222;}</style></head><body>
<h1>决策树主题锚定校验（${samples.length} 条）</h1>
<p>由 scripts/verify-projection-topics.ts 生成，可在浏览器打开后截图留存。</p>
<table><thead><tr><th>议题</th><th>锚定</th><th>路径名</th><th>对比摘要</th></tr></thead><tbody>
${rows.join("\n")}
</tbody></table></body></html>`;

const outPath = path.join(repoRoot, "apk-exports", "projection-verify-matrix.html");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html, "utf8");

console.log(`verify-projection-topics: OK (${samples.length} cases)`);
console.log(`Report: ${outPath}`);
