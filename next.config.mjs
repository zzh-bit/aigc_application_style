/** @type {import('next').NextConfig} */
const isVercel = process.env.VERCEL === "1"

const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  // 用于 Android WebView 离线加载（next build 会生成 out/ 静态资源）
  // Vercel 需要 Server 模式来运行 app/api/*；本地打 APK 才用 export
  output: isVercel ? undefined : "export",
  trailingSlash: true,
  allowedDevOrigins: ["192.168.56.1"],
  images: {
    unoptimized: true,
  },
  /**
   * APK / WebViewAssetLoader：页面在 .../assets/web/index.html。
   * 默认绝对路径 /_next/... 会解析到主机根路径，无法映射到 assets/web/_next/，导致样式与 JS 全挂。
   * 打 Android 包前请设置 NEXT_STATIC_ASSET_PREFIX=./ 再 build（见 npm run build:android）。
   */
  assetPrefix:
    isVercel
      ? undefined
      : process.env.NEXT_STATIC_ASSET_PREFIX === "./"
      ? "./"
      : undefined,
}

export default nextConfig
