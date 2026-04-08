"use client";

import { motion } from "framer-motion";
import { usePerformanceProfile } from "@/lib/performance";

// 预生成的固定星星数据，避免 SSR/CSR 不匹配
const FIXED_STARS = Array.from({ length: 80 }).map((_, i) => ({
  width: ((i * 7 + 3) % 20) / 10 + 1,
  height: ((i * 11 + 5) % 20) / 10 + 1,
  left: ((i * 37 + 13) % 100),
  top: ((i * 41 + 17) % 100),
  duration: 2 + ((i * 13) % 30) / 10,
  delay: ((i * 19) % 20) / 10,
}));

export function NebulaBackground() {
  const perf = usePerformanceProfile();
  const starCount = perf.lowPerformanceMode ? 22 : FIXED_STARS.length;
  const stars = FIXED_STARS.slice(0, starCount);

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none">
      {/* 深蓝黑渐变背景 */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0A0F1A] via-background to-[#101828]" />

      {/* 中心星云光晕 */}
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(139,92,246,0.08) 0%, rgba(59,130,246,0.05) 30%, transparent 70%)",
          opacity: 0.5,
        }}
        animate={
          perf.lowPerformanceMode
            ? undefined
            : {
                scale: [1, 1.1, 1],
                opacity: [0.5, 0.7, 0.5],
              }
        }
        transition={
          perf.lowPerformanceMode
            ? undefined
            : {
                duration: 8,
                repeat: Infinity,
                ease: "easeInOut",
              }
        }
      />

      {/* 星星 - 仅在客户端渲染以避免 hydration 不匹配 */}
      {stars.map((star, i) =>
        perf.lowPerformanceMode ? (
          <div
            key={i}
            className="absolute rounded-full bg-foreground/60"
            style={{
              width: star.width,
              height: star.height,
              left: `${star.left}%`,
              top: `${star.top}%`,
              opacity: 0.25,
            }}
          />
        ) : (
          <motion.div
            key={i}
            className="absolute rounded-full bg-foreground/60"
            style={{
              width: star.width,
              height: star.height,
              left: `${star.left}%`,
              top: `${star.top}%`,
              opacity: 0.2,
            }}
            animate={{
              opacity: [0.2, 0.8, 0.2],
            }}
            transition={{
              duration: star.duration,
              repeat: Infinity,
              delay: star.delay,
              ease: "easeInOut",
            }}
          />
        ),
      )}

      {/* 远处星云团 */}
      <motion.div
        className={`absolute top-1/4 right-1/4 w-80 h-80 rounded-full ${perf.lowPerformanceMode ? "" : "blur-3xl"}`}
        style={{
          background:
            "radial-gradient(circle, rgba(147,51,234,0.1) 0%, transparent 70%)",
        }}
        animate={
          perf.lowPerformanceMode
            ? undefined
            : {
                x: [0, 20, 0],
                y: [0, -10, 0],
              }
        }
        transition={
          perf.lowPerformanceMode
            ? undefined
            : {
                duration: 15,
                repeat: Infinity,
                ease: "easeInOut",
              }
        }
      />

      <motion.div
        className={`absolute bottom-1/3 left-1/4 w-60 h-60 rounded-full ${perf.lowPerformanceMode ? "" : "blur-3xl"}`}
        style={{
          background:
            "radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)",
        }}
        animate={
          perf.lowPerformanceMode
            ? undefined
            : {
                x: [0, -15, 0],
                y: [0, 15, 0],
              }
        }
        transition={
          perf.lowPerformanceMode
            ? undefined
            : {
                duration: 12,
                repeat: Infinity,
                ease: "easeInOut",
              }
        }
      />
    </div>
  );
}
