export type ReplyLength = "short" | "medium" | "long";
export type ReplyTone = "balanced" | "gentle" | "rational" | "direct";

export type AppSettings = {
  factionStrength: {
    radical: number;
    conservative: number;
    future: number;
  };
  replyLength: ReplyLength;
  replyTone: ReplyTone;
  emotionTriggerThreshold: number;
  /** 导师聊天页切到导师库后，超过该毫秒仍后台生成则中止并提示（默认 120000） */
  mentorAwayAbortMs: number;
  /** 议会主界面切到记忆库/洞察等子页后，超过该毫秒仍后台生成则中止并提示（默认 120000） */
  councilAwayAbortMs: number;
  uploadToBackend: boolean;
  lettersNotificationEnabled: boolean;
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  factionStrength: {
    radical: 70,
    conservative: 70,
    future: 70,
  },
  replyLength: "medium",
  replyTone: "balanced",
  emotionTriggerThreshold: 0.72,
  mentorAwayAbortMs: 120_000,
  councilAwayAbortMs: 120_000,
  uploadToBackend: true,
  lettersNotificationEnabled: true,
};

