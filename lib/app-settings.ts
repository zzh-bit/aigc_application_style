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
  uploadToBackend: true,
  lettersNotificationEnabled: true,
};

