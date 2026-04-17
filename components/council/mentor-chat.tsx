"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Send,
  Square,
  Sparkles,
  Brain,
  Scale,
  Heart,
  Lightbulb,
  Target,
  Compass,
  Feather,
  Eye,
  Flame,
  BookOpen,
  Quote,
  RefreshCw,
  GraduationCap,
  Microscope,
  Gavel,
  ScrollText,
  Copy,
} from "lucide-react";
import { storageGet } from "@/lib/storage";
import {
  selectRelevantMemories,
  formatHitsForUserEvidence,
  MEMORY_RETRIEVAL_MAX_HITS,
  type MemoryContextHit,
} from "@/lib/memory-context";
import type { MemoryItem } from "@/lib/types/domain";
import { triggerLettersByChatKeywords } from "@/lib/letter-trigger";
import type { AppSettings } from "@/lib/app-settings";
import { fetchJson, fetchWithTimeout, userFacingMessage } from "@/lib/api-client";
import { clientLog } from "@/lib/client-log";

// 导师数据类型
interface MentorData {
  id: string;
  name: string;
  title: string;
  school: string;
  icon: React.ReactNode;
  color: string;
  bgGradient: string;
  greeting: string;
  style: string;
  sampleResponses: string[];
}

// 消息类型
interface Message {
  id: string;
  role: "user" | "mentor";
  content: string;
  timestamp: Date;
  thinking?: boolean;
  cards?: string[];
}

type ApiChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

// 导师数据
const MENTOR_DATA: Record<string, MentorData> = {
  stoic: {
    id: "stoic",
    name: "马可·奥勒留",
    title: "斯多葛哲学家",
    school: "斯多葛学派",
    icon: <Scale className="w-6 h-6" />,
    color: "#6366F1",
    bgGradient: "from-indigo-500/20 to-purple-500/20",
    greeting: "欢迎，寻求智慧的旅人。记住，我们无法控制外部事件，但我们可以控制对它们的反应。今天，有什么困扰着你的内心？",
    style: "理性、冷静、注重实践智慧",
    sampleResponses: [
      "让我们用理性来审视这个问题。首先，问问自己：这件事是否在你的控制范围内？",
      "每一个挑战都是锻炼美德的机会。你现在面临的困境，正是培养坚韧的契机。",
      "不要被情绪的波涛淹没。退后一步，像观察别人的问题一样观察自己的处境。",
    ],
  },
  socratic: {
    id: "socratic",
    name: "苏格拉底",
    title: "辩证法大师",
    school: "古希腊哲学",
    icon: <Brain className="w-6 h-6" />,
    color: "#8B5CF6",
    bgGradient: "from-violet-500/20 to-fuchsia-500/20",
    greeting: "很高兴见到你，年轻的探索者。我知道的唯一一件事就是我什么都不知道。让我们一起通过提问来寻找真理。你今天想探索什么问题？",
    style: "追问式、引导思考、助产术",
    sampleResponses: [
      "有趣的观点。但让我问你：你是如何得出这个结论的？你的前提假设是什么？",
      "你说得很好，但我想更深入一些——当你说「好」的时候，你对「好」的定义是什么？",
      "让我们来检验这个想法。如果它是真的，那会导致什么结果？如果是假的呢？",
    ],
  },
  cognitive: {
    id: "cognitive",
    name: "丹尼尔·卡尼曼",
    title: "认知心理学家",
    school: "行为经济学",
    icon: <Lightbulb className="w-6 h-6" />,
    color: "#F59E0B",
    bgGradient: "from-amber-500/20 to-orange-500/20",
    greeting: "你好！我研究人类如何做决策，以及我们的思维如何欺骗自己。让我们一起识别那些隐藏的认知偏差，做出更明智的选择。",
    style: "科学、分析、识别偏差",
    sampleResponses: [
      "你描述的情况可能涉及「可得性启发」——我们倾向于根据容易想到的例子来判断概率。",
      "这里有一个典型的「锚定效应」。最初的数字已经影响了你后续的判断。",
      "让我们区分一下系统1（快速直觉）和系统2（慢速分析）的反应。你的决定主要来自哪个系统？",
    ],
  },
  plato: {
    id: "plato",
    name: "柏拉图",
    title: "理念论哲学家",
    school: "古希腊哲学",
    icon: <GraduationCap className="w-6 h-6" />,
    color: "#3B82F6",
    bgGradient: "from-blue-500/20 to-indigo-500/20",
    greeting: "欢迎来到理念的殿堂。表象之下，总有更接近「善」的秩序。今天，你想澄清哪一个概念或抉择？",
    style: "理性、层层追问、追求至善",
    sampleResponses: [
      "我们先区分「现象」与「应然」：你描述的是事实，还是你认为应当如此？",
      "若把人生看作灵魂转向光明的旅程，你现在被哪类欲望拖住了视线？",
      "试着用辩证法检验：这个选择的反面会推出什么不可接受的结论吗？",
    ],
  },
  existential: {
    id: "existential",
    name: "让-保罗·萨特",
    title: "存在主义哲学家",
    school: "存在主义",
    icon: <Sparkles className="w-6 h-6" />,
    color: "#EC4899",
    bgGradient: "from-pink-500/20 to-rose-500/20",
    greeting: "存在先于本质。你不是被定义的，而是通过每一个选择来创造自己。让我们一起面对存在的焦虑，在自由中找到意义。",
    style: "深刻、挑战性、关注自由与责任",
    sampleResponses: [
      "你说自己「不得不」这样做——但真的是这样吗？每一刻，你都在选择。承认这个自由，才能承担责任。",
      "焦虑不是需要逃避的东西，它是自由的证明。当你感到焦虑时，意味着你正面对真实的选择。",
      "你正在经历「自欺」——告诉自己没有选择，以逃避选择的重担。但这本身也是一个选择。",
    ],
  },
  eastern: {
    id: "eastern",
    name: "老子",
    title: "道家创始人",
    school: "道家学派",
    icon: <Heart className="w-6 h-6" />,
    color: "#10B981",
    bgGradient: "from-emerald-500/20 to-teal-500/20",
    greeting: "道可道，非常道。水善利万物而不争，处众人之所恶，故几于道。静心片刻，让我们顺着自然之道，寻找你心中的答案。",
    style: "隐喻式、强调顺应、柔和",
    sampleResponses: [
      "水之所以能穿透坚石，不是因为它的力量，而是因为它的持久和顺应。你的问题也许需要柔软的方式来解决。",
      "你正在用力推动，但道的智慧是「无为而无不为」。有时候，放手才是最有力的行动。",
      "万物负阴而抱阳。你所面对的矛盾，或许正是阴阳的平衡在寻找新的和谐。",
    ],
  },
  strategic: {
    id: "strategic",
    name: "孙子",
    title: "战略思想家",
    school: "兵家学派",
    icon: <Target className="w-6 h-6" />,
    color: "#EF4444",
    bgGradient: "from-red-500/20 to-orange-500/20",
    greeting: "知己知彼，百战不殆。无论你面对的是职场竞争还是人生抉择，战略思维都能帮助你运筹帷幄。告诉我你的处境，让我们分析形势。",
    style: "战略性、注重分析、强调准备",
    sampleResponses: [
      "首先，我们需要评估「势」——当前的形势对你有利还是不利？资源和时机如何？",
      "善战者，求之于势，不责于人。与其抱怨对手强大，不如思考如何利用形势。",
      "不战而屈人之兵，善之善者也。在采取行动前，考虑是否有不通过直接对抗就能达成目标的方法。",
    ],
  },
  confucius: {
    id: "confucius",
    name: "孔子",
    title: "儒学创始人",
    school: "儒家学派",
    icon: <BookOpen className="w-6 h-6" />,
    color: "#0EA5E9",
    bgGradient: "from-sky-500/20 to-blue-500/20",
    greeting: "有朋自远方来，不亦乐乎？学而不思则罔，思而不学则殆。让我们以礼相待，以仁为本，探讨你心中的困惑。",
    style: "温和、注重关系、强调修养",
    sampleResponses: [
      "己所不欲，勿施于人。在考虑如何对待他人时，先问问自己是否愿意被如此对待。",
      "君子求诸己，小人求诸人。与其抱怨环境，不如先反思自己是否已尽全力。",
      "知之为知之，不知为不知，是知也。承认自己的不知，才是智慧的开始。",
    ],
  },
  freud: {
    id: "freud",
    name: "西格蒙德·弗洛伊德",
    title: "精神分析学派创始人",
    school: "精神分析",
    icon: <Microscope className="w-6 h-6" />,
    color: "#0D9488",
    bgGradient: "from-teal-600/20 to-cyan-500/20",
    greeting: "请随意联想。我们关注的不只是你说的话，还有没说出的部分——重复的情绪、梦与口误，往往指向被压抑的愿望。从哪里开始谈？",
    style: "洞察潜意识、防御与移情",
    sampleResponses: [
      "这个反应是否在别的人际关系里也出现过？若有，共同点是什么？",
      "你对他人的强烈情绪，有时是自己某部分经验的投射——愿意一起检视吗？",
      "如果把症状当作「被压抑之物的信使」，它想告诉你什么需求？",
    ],
  },
  nietzsche: {
    id: "nietzsche",
    name: "尼采",
    title: "存在主义先驱",
    school: "生命哲学",
    icon: <Flame className="w-6 h-6" />,
    color: "#DC2626",
    bgGradient: "from-red-600/20 to-amber-500/20",
    greeting: "那些杀不死我的，使我更强大。上帝已死，现在是你自己创造价值的时候了。你准备好面对深渊、超越自我了吗？",
    style: "激烈、挑战性、鼓励超越",
    sampleResponses: [
      "你在寻找别人的认可？真正的强者创造自己的价值标准，而不是活在他人的目光中。",
      "痛苦不是需要逃避的东西——它是成长的催化剂。问问自己：这个挑战如何让我变得更强？",
      "你说这是「不可能」的——但「不可能」只是弱者的借口。超人不被「不可能」所限制。",
    ],
  },
  jung: {
    id: "jung",
    name: "卡尔·荣格",
    title: "分析心理学家",
    school: "深度心理学",
    icon: <Eye className="w-6 h-6" />,
    color: "#7C3AED",
    bgGradient: "from-violet-600/20 to-purple-500/20",
    greeting: "欢迎来到意识与无意识的交汇处。每个人内心都有光明与阴影。让我们一起探索你的内在世界，整合那些被压抑的部分。",
    style: "深度探索、象征解读、整合取向",
    sampleResponses: [
      "你描述的这个人让你如此困扰——这可能是你「阴影」的投射。他们身上是否有你不愿承认的自己的特质？",
      "梦境是通往无意识的大门。你反复出现的这个梦，可能在传递一个重要的信息。",
      "你正处于一个「个体化」的关键时刻——旧的自我正在瓦解，为新的自我腾出空间。这是成长，不是危机。",
    ],
  },
  buddha: {
    id: "buddha",
    name: "释迦牟尼",
    title: "佛教创始人",
    school: "佛家学派",
    icon: <Compass className="w-6 h-6" />,
    color: "#F97316",
    bgGradient: "from-orange-500/20 to-amber-400/20",
    greeting: "诸行无常，是生灭法。一切苦源于执着与无明。让我们一起观照内心，在正念中找到平静与智慧。",
    style: "慈悲、正念引导、放下执着",
    sampleResponses: [
      "你的痛苦源于执着。试着观察这个执着本身——它从何而来？如果放下它，你会失去什么？",
      "此刻，呼吸。不评判，只是觉察。你现在感受到什么？",
      "一切皆是因缘和合。你所经历的困境，也会像其他一切一样，生起，然后消逝。",
    ],
  },
  hanfei: {
    id: "hanfei",
    name: "韩非子",
    title: "法家集大成者",
    school: "法家",
    icon: <Gavel className="w-6 h-6" />,
    color: "#64748B",
    bgGradient: "from-slate-600/20 to-zinc-500/20",
    greeting: "明主不恃其私智，而因法数。先把权责、激励与约束说清楚，再谈抱负。你的局面里，谁承担什么、如何验收？",
    style: "冷峻现实、制度与激励",
    sampleResponses: [
      "把「想要的结果」写成可验证指标，否则善意也会变成扯皮。",
      "赏罚不信则令不行：你能否承诺并执行一条简单明确的规则？",
      "势异则事异：旧办法若已失灵，就该改制度而非只改口号。",
    ],
  },
  epicurus: {
    id: "epicurus",
    name: "伊壁鸠鲁",
    title: "快乐主义哲学家",
    school: "伊壁鸠鲁学派",
    icon: <Feather className="w-6 h-6" />,
    color: "#22C55E",
    bgGradient: "from-green-500/20 to-emerald-400/20",
    greeting: "快乐是人生的最高善，但真正的快乐来自简单的生活、真挚的友谊和内心的平静。让我们一起找到你的幸福之道。",
    style: "温和、实用、注重简单快乐",
    sampleResponses: [
      "你追求的这个目标——它真的会带来持久的快乐吗？还是只是欲望驱使的短暂满足？",
      "真正的财富不是拥有更多，而是需要更少。审视你真正需要什么，放下多余的欲望。",
      "友谊是生活中最珍贵的宝藏。在追逐成功的同时，不要忽视那些真正关心你的人。",
    ],
  },
  wangyangming: {
    id: "wangyangming",
    name: "王阳明",
    title: "心学集大成者",
    school: "儒家心学",
    icon: <ScrollText className="w-6 h-6" />,
    color: "#B45309",
    bgGradient: "from-amber-700/20 to-yellow-600/20",
    greeting: "知行合一。真知必落在行上；若行不出，说明知未真。今日一事，你明知当为却未为者是什么？",
    style: "事上磨练、致良知",
    sampleResponses: [
      "把「应当」落成今晚可做的一小步，否则良知只停留在情绪里。",
      "私意起时，正是磨练时：你此刻的犹豫，怕的是失败还是怕丢面子？",
      "心即理：外物纷扰时，先问此心是否自慊，再定去留。",
    ],
  },
  zhuangzi: {
    id: "zhuangzi",
    name: "庄子",
    title: "道家思想家",
    school: "道家学派",
    icon: <Sparkles className="w-6 h-6" />,
    color: "#14B8A6",
    bgGradient: "from-teal-500/20 to-cyan-400/20",
    greeting: "昔者庄周梦为蝴蝶，栩栩然蝴蝶也。不知周之梦为蝴蝶与，蝴蝶之梦为周与？让我们超越是非，在逍遥中寻找真正的自由。",
    style: "超脱、幽默、寓言式",
    sampleResponses: [
      "你执着于「对错」的判断——但对错只是人为的界限。从更高的视角看，万物齐一。",
      "有用之用，众人知之；无用之用，鲜有知之。你认为「无用」的东西，也许正是你最大的财富。",
      "鱼在水中游，子非鱼，安知鱼之乐？不要假设你理解他人的感受——每个人的世界都是独特的。",
    ],
  },
};

interface MentorChatProps {
  mentorId: string;
  /** 为 false 时表示已切到导师库页但组件仍挂载，便于后台继续拉取回复 */
  isUiActive?: boolean;
  onBack: () => void;
  onAnxiousDetected?: (payload: { source: "mentor"; score: number; text: string }) => void;
  onLettersTriggered?: (payload: { count: number; titles: string[] }) => void;
  settings?: AppSettings;
}

export function MentorChat({
  mentorId,
  isUiActive = true,
  onBack,
  onAnxiousDetected,
  onLettersTriggered,
  settings,
}: MentorChatProps) {
  const mentor = MENTOR_DATA[mentorId] || MENTOR_DATA.stoic;
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "greeting",
      role: "mentor",
      content: mentor.greeting,
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [chatStatus, setChatStatus] = useState<"idle" | "generating" | "cancelled" | "retrying">("idle");
  const [diagnosticText, setDiagnosticText] = useState("");
  const [activeMentorMessageId, setActiveMentorMessageId] = useState<string | null>(null);
  const [citedMemories, setCitedMemories] = useState<MemoryContextHit[]>([]);
  const [lastUserInput, setLastUserInput] = useState<string>("");
  const [voiceMockEnabled] = useState(true);
  const emotionThreshold = settings?.emotionTriggerThreshold ?? 0.72;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const abortReasonRef = useRef<"user" | "away-timeout" | null>(null);
  const awayAbortTimerRef = useRef<number | null>(null);
  const awayAbortMs = Math.max(15_000, Math.min(600_000, settings?.mentorAwayAbortMs ?? 120_000));

  const clearAwayAbortTimer = () => {
    if (awayAbortTimerRef.current !== null) {
      window.clearTimeout(awayAbortTimerRef.current);
      awayAbortTimerRef.current = null;
    }
  };

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /** 退回导师库时：短于阈值不中止请求；超过阈值则中止并在气泡内提示 */
  useEffect(() => {
    if (isUiActive) {
      clearAwayAbortTimer();
      return;
    }
    const busy = isThinking || activeMentorMessageId !== null;
    if (!busy) {
      clearAwayAbortTimer();
      return;
    }
    clearAwayAbortTimer();
    awayAbortTimerRef.current = window.setTimeout(() => {
      awayAbortTimerRef.current = null;
      const ac = abortRef.current;
      if (ac && !ac.signal.aborted) {
        abortReasonRef.current = "away-timeout";
        ac.abort();
      }
    }, awayAbortMs);
    return () => {
      clearAwayAbortTimer();
    };
  }, [isUiActive, isThinking, activeMentorMessageId, awayAbortMs]);

  /** 重试时去掉末尾未完成的导师占位，只保留到最后一条用户话为止 */
  const sliceThroughLastUser = (chatMessages: Message[]): Message[] => {
    let lastUser = -1;
    for (let i = 0; i < chatMessages.length; i++) {
      if (chatMessages[i].role === "user") lastUser = i;
    }
    if (lastUser >= 0) return chatMessages.slice(0, lastUser + 1);
    return chatMessages.filter((m) => m.role === "mentor");
  };

  /** 构建发给 /api/chat 的消息：导师→assistant；本轮检索到的记忆附在最后一条用户话后（整段对话仍完整上传） */
  const buildMentorApiMessages = (chatMessages: Message[], memoryHits: MemoryContextHit[]): ApiChatMessage[] => {
    const memoryBlock =
      memoryHits.length > 0 ? `\n\n${formatHitsForUserEvidence(memoryHits, MEMORY_RETRIEVAL_MAX_HITS)}` : "";
    const out: ApiChatMessage[] = [];
    for (let i = 0; i < chatMessages.length; i++) {
      const m = chatMessages[i];
      const base = m.content.trim();
      const isLastUser = m.role === "user" && i === chatMessages.length - 1;
      const content = isLastUser && memoryBlock ? `${base}${memoryBlock}` : base;
      if (content.length === 0) continue;
      out.push({
        role: m.role === "mentor" ? "assistant" : "user",
        content,
      });
    }
    return out;
  };

  const updateMentorMessageContent = (messageId: string, nextChunk: string, append: boolean) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? {
              ...m,
              content: append ? `${m.content}${nextChunk}` : nextChunk,
              timestamp: new Date(),
            }
          : m,
      ),
    );
  };

  const stopStreaming = () => {
    clearAwayAbortTimer();
    const ac = abortRef.current;
    if (ac && !ac.signal.aborted) {
      abortReasonRef.current = "user";
      ac.abort();
    }
    abortRef.current = null;
    setIsThinking(false);
    setChatStatus("cancelled");

    if (activeMentorMessageId) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === activeMentorMessageId && m.content.trim().length === 0
            ? { ...m, content: "（已取消本次生成）", timestamp: new Date() }
            : m,
        ),
      );
      setActiveMentorMessageId(null);
    }
  };

  /** 清除本会话中与导师的对话记录，仅保留开场问候 */
  const resetMentorSession = () => {
    stopStreaming();
    setCitedMemories([]);
    setLastUserInput("");
    setInputValue("");
    setChatStatus("idle");
    setActiveMentorMessageId(null);
    setMessages([
      {
        id: `greeting-${Date.now()}`,
        role: "mentor",
        content: mentor.greeting,
        timestamp: new Date(),
      },
    ]);
  };

  const detectMentorEmotion = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      const data = await fetchJson<{ label?: string; score?: number }>("/api/emotion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: trimmed, inputMode: "text", voiceMockEnabled }),
        timeoutMs: 12_000,
      });
      if (
        (data.label === "anxious" || data.label === "sad") &&
        typeof data.score === "number" &&
        data.score >= emotionThreshold
      ) {
        onAnxiousDetected?.({ source: "mentor", score: data.score, text: trimmed });
      }
    } catch (e) {
      clientLog("warn", "mentor.emotion", "skipped", { detail: String(e) });
    }
  };

  const sendMentorMessage = async (rawText: string, opts?: { retry?: boolean }) => {
    const trimmedInput = rawText.trim();
    if (!trimmedInput || (isThinking && !opts?.retry)) return;
    const isRetry = opts?.retry === true;
    setLastUserInput(trimmedInput);
    setChatStatus(isRetry ? "retrying" : "generating");
    if (!isRetry) {
      const triggerResult = await triggerLettersByChatKeywords(trimmedInput);
      if (triggerResult.deliveredCount > 0) {
        onLettersTriggered?.({
          count: triggerResult.deliveredCount,
          titles: triggerResult.deliveredLetters.map((l) => l.title),
        });
      }
    }

    const nextBaseMessages = isRetry
      ? sliceThroughLastUser(messages)
      : [
          ...messages,
          {
            id: `user-${Date.now()}`,
            role: "user",
            content: trimmedInput,
            timestamp: new Date(),
          } satisfies Message,
        ];

    const mentorMessageId = `mentor-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const mentorMessage: Message = {
      id: mentorMessageId,
      role: "mentor",
      content: "",
      timestamp: new Date(),
      thinking: true,
    };

    const nextMessages = [...nextBaseMessages, mentorMessage];
    setMessages(nextMessages);
    if (!isRetry) setInputValue("");
    setIsThinking(true);
    setActiveMentorMessageId(mentorMessageId);

    abortReasonRef.current = null;
    const controller = new AbortController();
    abortRef.current = controller;
    let assembledMentorText = "";

    try {
      // 模拟“思考时间”，让导师先沉思一会再开始生成
      await new Promise((r) => window.setTimeout(r, 650 + Math.floor(Math.random() * 550)));

      const memoryRecords = await storageGet<MemoryItem[]>("memory.memories.v1", []);
      const hits = selectRelevantMemories({
        query: trimmedInput,
        memories: memoryRecords,
        maxHits: MEMORY_RETRIEVAL_MAX_HITS,
      });
      setCitedMemories(hits);
      const apiMessages = buildMentorApiMessages(sliceThroughLastUser(nextBaseMessages), hits);

      const response = await fetchWithTimeout("/api/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messages: apiMessages,
          mode: `mentor:${mentor.id}`,
          // Android WebView 对 ReadableStream/getReader 支持不完整时会抛 TypeError，被误判为「网络失败」
          stream: false,
        }),
        externalSignal: controller.signal,
        timeoutMs: 240_000,
      });

      const contentType = response.headers.get("content-type") ?? "";

      if (contentType.includes("text/event-stream") && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";

          for (const eventText of events) {
            const lines = eventText.split("\n");
            const dataLine = lines.find((line) => line.startsWith("data:"));
            if (!dataLine) continue;

            const payloadText = dataLine.slice(5).trim();
            if (!payloadText) continue;

            try {
              const payload = JSON.parse(payloadText) as {
                type?: "start" | "token" | "done" | "error" | "meta";
                token?: string;
                message?: string;
                cards?: string[];
              };

              if (payload.type === "token" && typeof payload.token === "string" && payload.token.length > 0) {
                updateMentorMessageContent(mentorMessageId, payload.token, true);
                assembledMentorText += payload.token;
                setIsThinking(false);
                setChatStatus("generating");
              } else if (payload.type === "meta" && Array.isArray(payload.cards)) {
                const metaCards = payload.cards;
                setMessages((prev) =>
                  prev.map((m) => (m.id === mentorMessageId ? { ...m, cards: metaCards.slice(0, 3) } : m)),
                );
              } else if (payload.type === "error") {
                throw new Error(payload.message ?? "生成失败");
              } else if (payload.type === "done") {
                setIsThinking(false);
                setChatStatus("idle");
                void detectMentorEmotion(assembledMentorText);
              }
            } catch (parseError) {
              if (parseError instanceof Error) throw parseError;
            }
          }
        }
      } else {
        const raw = await response.text();
        let data: { message?: { content?: string }; cards?: string[] };
        try {
          data = JSON.parse(raw) as { message?: { content?: string }; cards?: string[] };
        } catch {
          clientLog("warn", "mentor.chat", "non-stream json parse failed", { snippet: raw.slice(0, 80) });
          throw new Error("invalid_json");
        }
        const text = data.message?.content?.trim();
        if (text) {
          updateMentorMessageContent(mentorMessageId, text, false);
          assembledMentorText = text;
          if (Array.isArray(data.cards) && data.cards.length > 0) {
            setMessages((prev) =>
              prev.map((m) => (m.id === mentorMessageId ? { ...m, cards: data.cards?.slice(0, 3) } : m)),
            );
          }
        } else {
          const responseIndex = Math.floor(Math.random() * mentor.sampleResponses.length);
          updateMentorMessageContent(mentorMessageId, mentor.sampleResponses[responseIndex], false);
        }
        setIsThinking(false);
        setChatStatus("idle");
        void detectMentorEmotion(assembledMentorText);
      }
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === "AbortError";
      const reason = abortReasonRef.current;
      abortReasonRef.current = null;
      if (aborted) {
        if (reason === "away-timeout") {
          const sec = Math.round(awayAbortMs / 1000);
          const tip =
            sec >= 60
              ? `离开导师对话超过约 ${Math.round(sec / 60)} 分钟，已停止生成。可点击「重试上次」或重新提问。`
              : `离开导师对话超过 ${sec} 秒，已停止生成。可点击「重试上次」或重新提问。`;
          updateMentorMessageContent(mentorMessageId, tip, false);
        }
        setChatStatus("idle");
      } else {
        clientLog("warn", "mentor.chat", "request failed", { detail: String(error) });
        const fallback = `抱歉：${userFacingMessage(error)} 可点击重试或换个问题继续。`;
        setDiagnosticText(buildDiagnosticText(error));
        updateMentorMessageContent(mentorMessageId, fallback, false);
        setChatStatus("idle");
      }
      setIsThinking(false);
    } finally {
      clearAwayAbortTimer();
      abortRef.current = null;
      setActiveMentorMessageId(null);
      setMessages((prev) =>
        prev.map((m) => (m.id === mentorMessageId ? { ...m, thinking: false } : m)),
      );
    }
  };

  // 发送消息
  const handleSend = async () => {
    await sendMentorMessage(inputValue);
  };

  const buildDiagnosticText = (error: unknown) => {
    const now = new Date().toISOString();
    const detail = userFacingMessage(error);
    const host = typeof window !== "undefined" ? window.location.hostname : "unknown";
    const online = typeof navigator !== "undefined" ? String(navigator.onLine) : "unknown";
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "unknown";
    return [
      `[${now}] 导师聊天请求失败`,
      `页面主机: ${host}`,
      `请求接口: /api/chat (mentor mode)`,
      `状态: ${chatStatus}`,
      `网络在线: ${online}`,
      `错误信息: ${detail}`,
      `原始错误: ${String(error)}`,
      `UA: ${ua}`,
    ].join("\n");
  };

  // 键盘发送
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gradient-to-b from-[#0A0F1A] via-[#0D1526] to-[#0F1A2F]">
      {/* 顶部导航栏 */}
      <header className="flex-shrink-0 h-16 flex items-center justify-between px-6 border-b border-white/5 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <motion.button
            onClick={onBack}
            className="flex items-center gap-2 text-white/60 hover:text-white transition-colors"
            whileHover={{ x: -2 }}
            whileTap={{ scale: 0.95 }}
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm">返回</span>
          </motion.button>
          <div className="h-6 w-px bg-white/10" />
          
          {/* 导师信息 */}
          <div className="flex items-center gap-3">
            <motion.div
              className={`w-10 h-10 rounded-xl bg-gradient-to-br ${mentor.bgGradient} flex items-center justify-center`}
              style={{ color: mentor.color }}
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
              {mentor.icon}
            </motion.div>
            <div>
              <h2 className="text-sm font-medium text-white">{mentor.name}</h2>
              <p className="text-xs text-white/40">{mentor.school}</p>
            </div>
          </div>
        </div>

        <motion.button
          type="button"
          title="清除本会话记忆"
          onClick={resetMentorSession}
          disabled={isThinking}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <RefreshCw className="w-4 h-4" />
          刷新
        </motion.button>
      </header>

      {/* 聊天区域 */}
      <main className="flex-1 overflow-y-auto px-6 py-4">
        <div className="max-w-3xl mx-auto space-y-4">
          {/* 导师风格提示 */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10">
              <Quote className="w-3.5 h-3.5 text-white/40" />
              <span className="text-xs text-white/50">对话风格：{mentor.style}</span>
            </div>
            <div className="mt-2 text-xs text-white/45">
              状态：
              {chatStatus === "generating" && <span className="text-primary"> 生成中</span>}
              {chatStatus === "retrying" && <span className="text-amber-300"> 重试中</span>}
              {chatStatus === "cancelled" && <span className="text-amber-300"> 已取消</span>}
              {chatStatus === "idle" && <span className="text-emerald-300"> 空闲</span>}
            </div>
            {citedMemories.length > 0 && (
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {citedMemories.map((m) => (
                  <span
                    key={m.id}
                    className="px-2 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] text-white/60"
                    title={m.summary}
                  >
                    参考记忆：{m.title}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 消息列表 */}
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] ${
                  message.role === "user"
                    ? "bg-primary/20 border border-primary/30 rounded-2xl rounded-br-md"
                    : "bg-white/5 border border-white/10 rounded-2xl rounded-bl-md"
                } px-4 py-3`}
              >
                {message.role === "mentor" && (
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className={`w-5 h-5 rounded-md bg-gradient-to-br ${mentor.bgGradient} flex items-center justify-center`}
                      style={{ color: mentor.color }}
                    >
                      {mentor.icon}
                    </div>
                    <span className="text-xs font-medium" style={{ color: mentor.color }}>
                      {mentor.name}
                    </span>
                  </div>
                )}
                <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">
                  {message.content}
                </p>
                {message.role === "mentor" && Array.isArray(message.cards) && message.cards.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {message.cards.map((card, idx) => (
                      <div
                        key={`${message.id}-card-${idx}`}
                        className="text-xs text-white/70 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5"
                      >
                        建议卡片 {idx + 1}：{card}
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-white/30 mt-2">
                  {message.timestamp.toLocaleTimeString("zh-CN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </motion.div>
          ))}

          {/* 思考中指示器 */}
          <AnimatePresence>
            {isThinking && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex justify-start"
              >
                <div className="bg-white/5 border border-white/10 rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <motion.div
                      className={`w-5 h-5 rounded-md bg-gradient-to-br ${mentor.bgGradient} flex items-center justify-center`}
                      style={{ color: mentor.color }}
                      animate={{ rotate: [0, 10, -10, 0] }}
                      transition={{ duration: 1, repeat: Infinity }}
                    >
                      {mentor.icon}
                    </motion.div>
                    <span className="text-xs font-medium" style={{ color: mentor.color }}>
                      {mentor.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <motion.div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: mentor.color }}
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1, repeat: Infinity, delay: 0 }}
                    />
                    <motion.div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: mentor.color }}
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
                    />
                    <motion.div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: mentor.color }}
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
                    />
                    <span className="text-xs text-white/40 ml-2">正在沉思...</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* 输入区域 */}
      <footer className="flex-shrink-0 border-t border-white/5 p-4 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto">
          {/* 快捷提问 */}
          <div className="flex gap-2 mb-3 overflow-x-auto pb-2 scrollbar-hide">
            {["帮我分析一下...", "如何面对...", "你怎么看待..."].map((prompt) => (
              <motion.button
                key={prompt}
                onClick={() => setInputValue(prompt)}
                className="flex-shrink-0 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {prompt}
              </motion.button>
            ))}
            <motion.button
              className="flex-shrink-0 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-white/50 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-1"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <RefreshCw className="w-3 h-3" />
              <span>换一批</span>
            </motion.button>
            <motion.button
              onClick={() => {
                if (!lastUserInput || isThinking) return;
                setChatStatus("retrying");
                void sendMentorMessage(lastUserInput, { retry: true });
              }}
              className="flex-shrink-0 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-white/50 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-1"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <RefreshCw className="w-3 h-3" />
              <span>重试上次</span>
            </motion.button>
          </div>

          {/* 输入框 */}
          <div className="flex items-end gap-3">
            <div className="flex-1 relative">
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`向${mentor.name}提问...`}
                rows={1}
                className="w-full px-4 py-3 pr-12 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-primary/50 resize-none transition-colors"
                style={{ minHeight: "48px", maxHeight: "120px" }}
              />
            </div>
            {isThinking ? (
              <motion.button
                onClick={stopStreaming}
                className="p-3 rounded-xl transition-all bg-amber-500/20 text-amber-300 border border-amber-400/30"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                title="停止生成"
              >
                <Square className="w-5 h-5" />
              </motion.button>
            ) : (
              <motion.button
                onClick={handleSend}
                disabled={!inputValue.trim()}
                className={`p-3 rounded-xl transition-all ${
                  inputValue.trim()
                    ? "bg-primary text-white"
                    : "bg-white/5 text-white/30 cursor-not-allowed"
                }`}
                whileHover={inputValue.trim() ? { scale: 1.05 } : {}}
                whileTap={inputValue.trim() ? { scale: 0.95 } : {}}
              >
                <Send className="w-5 h-5" />
              </motion.button>
            )}
          </div>
          <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-white/60">网络诊断文本框（报错后可复制给我）</span>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md border border-white/15 px-2 py-1 text-[11px] text-white/70 hover:text-white"
                onClick={async () => {
                  if (!diagnosticText.trim()) return;
                  try {
                    await navigator.clipboard.writeText(diagnosticText);
                  } catch {
                    // ignore clipboard errors
                  }
                }}
              >
                <Copy className="h-3.5 w-3.5" />
                复制
              </button>
            </div>
            <textarea
              value={diagnosticText}
              readOnly
              placeholder="出现“请求超时/网络失败”后，这里会自动生成诊断信息。"
              className="h-24 w-full resize-y rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs text-white/80 placeholder:text-white/35 focus:outline-none"
            />
          </div>
        </div>
      </footer>
    </div>
  );
}
