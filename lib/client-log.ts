/**
 * 客户端排障日志：结构化输出，便于在控制台过滤与上报扩展。
 * 生产环境同样输出 warn/error，避免“演示黑盒”无法定位问题。
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogPayload = {
  level: LogLevel;
  scope: string;
  message: string;
  /** 可序列化的附加信息，勿放敏感原文 */
  meta?: Record<string, unknown>;
  error?: { name?: string; message?: string; stack?: string };
  ts: string;
};

function safeStringify(meta: Record<string, unknown> | undefined) {
  if (!meta) return "";
  try {
    return JSON.stringify(meta);
  } catch {
    return "[unserializable]";
  }
}

export function clientLog(level: LogLevel, scope: string, message: string, meta?: Record<string, unknown>) {
  const payload: LogPayload = {
    level,
    scope,
    message,
    meta,
    ts: new Date().toISOString(),
  };
  const prefix = `[PS2][${scope}]`;
  const suffix = meta ? ` ${safeStringify(meta)}` : "";
  const line = `${prefix} ${message}${suffix}`;

  if (level === "debug" && process.env.NODE_ENV === "production") {
    return;
  }

  switch (level) {
    case "debug":
      console.debug(line);
      break;
    case "info":
      console.info(line);
      break;
    case "warn":
      console.warn(line);
      break;
    case "error":
      console.error(line);
      break;
    default:
      console.log(line);
  }
}

export function logApiFailure(scope: string, err: unknown, meta?: Record<string, unknown>) {
  const e = err instanceof Error ? err : new Error(String(err));
  const payload: LogPayload = {
    level: "error",
    scope,
    message: e.message,
    meta,
    error: { name: e.name, message: e.message, stack: e.stack },
    ts: new Date().toISOString(),
  };
  console.error(`[PS2][${scope}]`, payload.message, { ...meta, err: payload.error });
}
