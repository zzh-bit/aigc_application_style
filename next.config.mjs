/** @type {import('next').NextConfig} */
const isExportBuild = process.env.NEXT_OUTPUT_MODE === "export";

const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  // 双模式构建：
  // - export: Android WebView 离线静态包
  // - server: 云服务器 API（next start）
  ...(isExportBuild
    ? {
        output: "export",
        trailingSlash: true,
      }
    : {}),
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
    process.env.NEXT_STATIC_ASSET_PREFIX === "./"
      ? "./"
      : undefined,
}

export default nextConfig
