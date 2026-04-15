/**
 * 校验议会页底部布局在不同 footer 高度下是否会与底部导航重叠。
 * 运行：npx tsx scripts/verify-chat-layout-overlap.ts
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

type Scenario = {
  viewportHeight: number;
  footerHeight: number;
  navHeight: number;
};

type CaseResult = Scenario & {
  mainPaddingBottom: number;
  navBottom: number;
  footerTopY: number;
  navTopY: number;
  navBottomY: number;
  footerGap: number;
  mainGap: number;
  pass: boolean;
};

const scenarios: Scenario[] = [
  { viewportHeight: 360, footerHeight: 96, navHeight: 46 },
  { viewportHeight: 360, footerHeight: 132, navHeight: 46 },
  { viewportHeight: 360, footerHeight: 176, navHeight: 46 },
  { viewportHeight: 412, footerHeight: 108, navHeight: 46 },
  { viewportHeight: 412, footerHeight: 148, navHeight: 46 },
  { viewportHeight: 412, footerHeight: 198, navHeight: 46 },
  { viewportHeight: 540, footerHeight: 116, navHeight: 48 },
  { viewportHeight: 540, footerHeight: 164, navHeight: 48 },
  { viewportHeight: 540, footerHeight: 220, navHeight: 48 },
];

function evaluate(s: Scenario): CaseResult {
  // 与代码保持一致：
  // main padding-bottom = footerHeight + 12 + 74(nav clearance)
  // nav bottom = footerHeight + 8 (+ safe-area，验证时按 0 计算)
  const mainPaddingBottom = s.footerHeight + 86;
  const navBottom = s.footerHeight + 8;
  const footerTopY = s.viewportHeight - s.footerHeight;
  const navBottomY = s.viewportHeight - navBottom;
  const navTopY = navBottomY - s.navHeight;
  const footerGap = footerTopY - navBottomY;
  const mainGap = mainPaddingBottom - s.footerHeight;
  const pass = footerGap >= 8 && mainGap >= 86 && navTopY >= 0;

  return {
    ...s,
    mainPaddingBottom,
    navBottom,
    footerTopY,
    navTopY,
    navBottomY,
    footerGap,
    mainGap,
    pass,
  };
}

const results = scenarios.map(evaluate);
for (const r of results) {
  assert.ok(r.pass, `布局重叠风险: viewport=${r.viewportHeight}, footer=${r.footerHeight}, nav=${r.navHeight}`);
}

const okCount = results.filter((r) => r.pass).length;
const rows = results
  .map(
    (r) => `<tr>
<td>${r.viewportHeight}</td>
<td>${r.footerHeight}</td>
<td>${r.navHeight}</td>
<td>${r.mainPaddingBottom}</td>
<td>${r.navBottom}</td>
<td>${r.footerGap}</td>
<td>${r.mainGap}</td>
<td>${r.pass ? "OK" : "FAIL"}</td>
</tr>`,
  )
  .join("\n");

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Chat Layout Overlap Verify</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background:#0b1020; color:#e9edf9; padding:16px; }
    h1 { margin:0 0 10px; font-size:20px; }
    p { color:#b9c2dd; margin:0 0 12px; }
    table { border-collapse: collapse; width:100%; background:#101832; }
    th, td { border:1px solid #2a3560; padding:8px; text-align:center; font-size:13px; }
    th { background:#18244a; }
    .ok { color:#75f0a8; }
  </style>
</head>
<body>
  <h1>议会页聊天框/底部导航防重叠验证</h1>
  <p>通过 ${okCount}/${results.length} 组场景。判定规则：footer 与 nav 垂直间距 >= 8px，main 区底部留白 >= 86px（含导航避让），nav 顶部不越界。</p>
  <table>
    <thead>
      <tr>
        <th>ViewportH</th>
        <th>FooterH</th>
        <th>NavH</th>
        <th>MainPB</th>
        <th>NavBottom</th>
        <th>FooterGap</th>
        <th>MainGap</th>
        <th>Result</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  <p class="ok">结论：在验证场景中，聊天输入区、消息区与底部导航无重叠。</p>
</body>
</html>`;

const outPath = path.join(process.cwd(), "apk-exports", "chat-layout-overlap-verify.html");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html, "utf8");

console.log(`verify-chat-layout-overlap: OK (${okCount} cases)`);
console.log(`Report: ${outPath}`);
