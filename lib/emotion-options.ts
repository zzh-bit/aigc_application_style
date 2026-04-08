export const EMOTION_TRIGGER_OPTIONS = [
  { value: "anxious", label: "感到焦虑时" },
  { value: "lost", label: "感到迷茫时" },
  { value: "tired", label: "感到疲惫时" },
  { value: "lonely", label: "感到孤独时" },
  { value: "down", label: "情绪低落时" },
  { value: "stressed", label: "压力过大时" },
  { value: "sad", label: "感到难过时" },
  { value: "calm", label: "内心平静时" },
  { value: "happy", label: "感到开心时" },
  { value: "excited", label: "感到兴奋时" },
  { value: "grateful", label: "心怀感恩时" },
  { value: "confident", label: "信心充足时" },
] as const;

export type EmotionTriggerValue = (typeof EMOTION_TRIGGER_OPTIONS)[number]["value"];

export const EMOTION_TRIGGER_LABEL_MAP: Record<string, string> = Object.fromEntries(
  EMOTION_TRIGGER_OPTIONS.map((o) => [o.value, o.label]),
);

