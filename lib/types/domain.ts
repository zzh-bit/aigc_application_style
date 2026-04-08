export type EmotionType = "happy" | "sad" | "anxious" | "calm" | "excited";

export type ConversationMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
};

export type Conversation = {
  id: string;
  scene: "council" | "mentor";
  roundId: string;
  messages: ConversationMessage[];
  createdAt: string;
  updatedAt: string;
};

export type DecisionRecord = {
  id: string;
  date: string;
  summary: string;
  emotions: EmotionType[];
  keywords: string[];
  messageCount: number;
};

export type MemoryItem = {
  id: string;
  title: string;
  summary: string;
  content?: string;
  date?: string;
  year?: number;
  emotion?: EmotionType;
  type?: string;
  keywords: string[];
};

export type MentorSession = {
  id: string;
  mentorId: string;
  conversationId: string;
  createdAt: string;
};

export type Letter = {
  id: string;
  triggerType: "date" | "emotion" | "event";
  triggerValue: string;
  deliveryDate?: string;
  status: "draft" | "scheduled" | "delivered" | "replied";
  content: string;
  threadId?: string;
};

export type InsightReport = {
  id: string;
  period: string;
  emotionDistribution: Record<EmotionType, number>;
  decisionTopics: Array<{ topic: string; count: number }>;
  summary: string;
  generatedAt: string;
};
