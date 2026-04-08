/**
 * 打包 APK 前自检：静态页必须引用 ./_next/...，否则 WebViewAssetLoader 无法映射到 assets/web/_next。
 * 由 npm run build:android 自动执行。
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const indexPath = path.join(root, "out", "index.html")

if (!fs.existsSync(indexPath)) {
  console.error("verify-android-export: missing out/index.html — run next build first")
  process.exit(1)
}

const html = fs.readFileSync(indexPath, "utf8")

const bad =
  html.includes('"/_next/') ||
  html.includes("'/_next/") ||
  html.includes("href=/_next/") ||
  html.includes("src=/_next/")

if (bad) {
  console.error(
    "verify-android-export: out/index.html still has absolute /_next paths.\n" +
      "Use: npm run build:android (sets NEXT_STATIC_ASSET_PREFIX=./)\n" +
      "Do not copy out/ from a plain npm run build for APK.",
  )
  process.exit(1)
}

if (!html.includes("./_next/")) {
  console.error(
    "verify-android-export: out/index.html has no ./_next/ asset references — check next.config assetPrefix",
  )
  process.exit(1)
}

console.log("verify-android-export: OK (relative ./_next for WebView)")
