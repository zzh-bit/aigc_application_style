"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Search,
  Sparkles,
  Brain,
  Scale,
  Heart,
  Lightbulb,
  MessageCircle,
  X,
  BookOpen,
  Users,
  Target,
  Compass,
  Eye,
  Flame,
  Feather,
  GraduationCap,
  Microscope,
  Gavel,
  ScrollText,
} from "lucide-react";

// 导师类型定义
interface Mentor {
  id: string;
  name: string;
  title: string;
  school: string;
  category: string;
  icon: React.ReactNode;
  color: string;
  bgGradient: string;
  description: string;
  corePhilosophy: string;
  thinkingModel: string[];
  famousQuotes: string[];
  bestFor: string[];
}

// 预设导师数据 — 四类各 4 位
const MENTORS: Mentor[] = [
  // 哲学思辨 (4)
  {
    id: "stoic",
    name: "马可·奥勒留",
    title: "斯多葛哲学家",
    school: "斯多葛学派",
    category: "philosophy",
    icon: <Scale className="w-6 h-6" />,
    color: "#6366F1",
    bgGradient: "from-indigo-500/20 to-purple-500/20",
    description: "罗马帝国皇帝，斯多葛哲学的践行者。专注于内心平静与理性思考。",
    corePhilosophy: "控制你能控制的，接受你不能控制的。",
    thinkingModel: ["二分法", "消极想象", "晨间反思", "命运之爱"],
    famousQuotes: [
      "你有力量控制自己的思想——认识到这一点。",
      "浪费时间抱怨昨天，不如投入今天。",
      "最好的复仇是不变得像敌人一样。",
    ],
    bestFor: ["情绪管理", "逆境应对", "自律养成"],
  },
  {
    id: "socratic",
    name: "苏格拉底",
    title: "辩证法大师",
    school: "古希腊哲学",
    category: "philosophy",
    icon: <Brain className="w-6 h-6" />,
    color: "#8B5CF6",
    bgGradient: "from-violet-500/20 to-fuchsia-500/20",
    description: "西方哲学奠基人，以追问和辩证法著称。帮助你通过提问发现真理。",
    corePhilosophy: "未经审视的人生不值得过。",
    thinkingModel: ["苏格拉底式提问", "助产术", "无知之知", "定义追问"],
    famousQuotes: [
      "我只知道一件事，那就是我什么都不知道。",
      "认识你自己。",
      "教育不是灌输，而是点燃火焰。",
    ],
    bestFor: ["深度思考", "自我认知", "批判性思维"],
  },
  {
    id: "existential",
    name: "让-保罗·萨特",
    title: "存在主义哲学家",
    school: "存在主义",
    category: "philosophy",
    icon: <Sparkles className="w-6 h-6" />,
    color: "#EC4899",
    bgGradient: "from-pink-500/20 to-rose-500/20",
    description: "强调自由、责任与自我创造，帮助你直面选择焦虑。",
    corePhilosophy: "你并非被定义的人，而是通过选择塑造自己。",
    thinkingModel: ["存在焦虑", "自由与责任", "自欺识别", "价值自我建构"],
    famousQuotes: [
      "人注定是自由的。",
      "存在先于本质。",
      "我们是我们的选择总和。",
    ],
    bestFor: ["选择焦虑", "意义探索", "行动勇气"],
  },
  {
    id: "plato",
    name: "柏拉图",
    title: "理念论哲学家",
    school: "古希腊哲学",
    category: "philosophy",
    icon: <GraduationCap className="w-6 h-6" />,
    color: "#3B82F6",
    bgGradient: "from-blue-500/20 to-indigo-500/20",
    description: "学园派创始人，以理念论与对话体著作著称，强调至善与理性秩序。",
    corePhilosophy: "现象可变，理念恒在；灵魂趋向真理与善。",
    thinkingModel: ["理念与现象", "洞穴隐喻", "辩证法", "灵魂三分"],
    famousQuotes: [
      "哲学始于惊奇。",
      "至善是万物所趋向的目的。",
      "未经省察的人生不值得过。（学园传统中与苏格拉底一脉相承）",
    ],
    bestFor: ["价值排序", "教育规划", "公共与私人之善"],
  },

  // 认知心理 (4)
  {
    id: "cognitive",
    name: "丹尼尔·卡尼曼",
    title: "认知心理学家",
    school: "行为经济学",
    category: "psychology",
    icon: <Lightbulb className="w-6 h-6" />,
    color: "#F59E0B",
    bgGradient: "from-amber-500/20 to-orange-500/20",
    description: "诺贝尔经济学奖得主，研究人类决策中的认知偏差。",
    corePhilosophy: "了解你的思维陷阱，才能做出更好的决策。",
    thinkingModel: ["系统1与系统2", "锚定效应", "可得性启发", "损失厌恶"],
    famousQuotes: [
      "我们对自己思维的信心远超其准确性。",
      "眼见为实是一种错觉。",
      "慢思考是努力的，快思考是自动的。",
    ],
    bestFor: ["决策优化", "避免偏见", "理性分析"],
  },
  {
    id: "jung",
    name: "卡尔·荣格",
    title: "分析心理学家",
    school: "深度心理学",
    category: "psychology",
    icon: <Eye className="w-6 h-6" />,
    color: "#7C3AED",
    bgGradient: "from-violet-600/20 to-purple-500/20",
    description: "分析心理学创始人，研究无意识、原型与个体化过程。",
    corePhilosophy: "认识你的阴影，才能成为完整的人。",
    thinkingModel: ["阴影整合", "原型分析", "个体化", "积极想象"],
    famousQuotes: [
      "你无法觉察的事物，将会成为你的命运。",
      "向内看的人会清醒，向外看的人在做梦。",
      "我不是发生在我身上的事，我是我选择成为的人。",
    ],
    bestFor: ["自我整合", "梦境解读", "人格发展"],
  },
  {
    id: "nietzsche",
    name: "尼采",
    title: "生命哲学家",
    school: "生命哲学",
    category: "psychology",
    icon: <Flame className="w-6 h-6" />,
    color: "#DC2626",
    bgGradient: "from-red-600/20 to-amber-500/20",
    description: "强调自我超越与价值重估，适合在低谷中重建内在力量。",
    corePhilosophy: "那些杀不死我的，使我更强大。",
    thinkingModel: ["价值重估", "意志力锻造", "超越自我", "反脆弱"],
    famousQuotes: [
      "与怪物战斗的人，当心自己也成为怪物。",
      "凝视深渊时，深渊也在凝视你。",
      "成为你自己。",
    ],
    bestFor: ["低谷重建", "意志力", "突破舒适圈"],
  },
  {
    id: "freud",
    name: "西格蒙德·弗洛伊德",
    title: "精神分析学派创始人",
    school: "精神分析",
    category: "psychology",
    icon: <Microscope className="w-6 h-6" />,
    color: "#0D9488",
    bgGradient: "from-teal-600/20 to-cyan-500/20",
    description: "探索潜意识、防御机制与梦的意涵，帮助理解重复模式背后的动力。",
    corePhilosophy: "被压抑之物会以症状或行动归来；觉察即疗愈的起点。",
    thinkingModel: ["本我自我超我", "压抑与移情", "梦的显隐意", "防御机制"],
    famousQuotes: [
      "本我在哪里，自我便在哪里。",
      "梦是通往无意识的皇家大道。",
      "爱与工作，人生足矣。",
    ],
    bestFor: ["反复模式", "关系纠缠", "焦虑与梦的困惑"],
  },

  // 战略思维 (4)
  {
    id: "strategic",
    name: "孙子",
    title: "战略思想家",
    school: "兵家学派",
    category: "strategy",
    icon: <Target className="w-6 h-6" />,
    color: "#EF4444",
    bgGradient: "from-red-500/20 to-orange-500/20",
    description: "《孙子兵法》作者，战略思维的集大成者。",
    corePhilosophy: "知己知彼，百战不殆。",
    thinkingModel: ["势与节", "奇正相生", "先胜后战", "因敌制胜"],
    famousQuotes: [
      "兵者，诡道也。",
      "不战而屈人之兵，善之善者也。",
      "知可以战与不可以战者胜。",
    ],
    bestFor: ["战略规划", "竞争分析", "资源配置"],
  },
  {
    id: "confucius",
    name: "孔子",
    title: "儒学创始人",
    school: "儒家学派",
    category: "strategy",
    icon: <BookOpen className="w-6 h-6" />,
    color: "#0EA5E9",
    bgGradient: "from-sky-500/20 to-blue-500/20",
    description: "儒家学派创始人，强调仁义礼智信的人生哲学。",
    corePhilosophy: "己所不欲，勿施于人。",
    thinkingModel: ["中庸之道", "仁义礼智", "修齐治平", "君子之道"],
    famousQuotes: [
      "学而不思则罔，思而不学则殆。",
      "三人行，必有我师焉。",
      "君子坦荡荡，小人长戚戚。",
    ],
    bestFor: ["人际关系", "领导力", "道德修养"],
  },
  {
    id: "epicurus",
    name: "伊壁鸠鲁",
    title: "快乐主义哲学家",
    school: "伊壁鸠鲁学派",
    category: "strategy",
    icon: <Feather className="w-6 h-6" />,
    color: "#22C55E",
    bgGradient: "from-green-500/20 to-emerald-400/20",
    description: "以长期幸福为导向，帮助区分真实需要与短期欲望。",
    corePhilosophy: "真正的快乐来自简单、节制与清醒。",
    thinkingModel: ["欲望分层", "长期幸福优先", "低成本高收益生活", "风险节制"],
    famousQuotes: [
      "不要败给无尽欲望。",
      "简单生活是幸福源泉。",
      "快乐是痛苦缺席后的平静。",
    ],
    bestFor: ["生活取舍", "压力管理", "长期幸福感"],
  },
  {
    id: "hanfei",
    name: "韩非子",
    title: "法家集大成者",
    school: "法家",
    category: "strategy",
    icon: <Gavel className="w-6 h-6" />,
    color: "#64748B",
    bgGradient: "from-slate-600/20 to-zinc-500/20",
    description: "以法、术、势一体论著称，强调制度、激励与权责边界，适合复杂组织与博弈场景。",
    corePhilosophy: "明法审令，因能授官；信赏必罚，则人尽其力。",
    thinkingModel: ["法势术", "激励相容", "权责清晰", "可验证约束"],
    famousQuotes: [
      "不期修古，不法常可。",
      "事异则备变。",
      "以计代力，以智取胜。",
    ],
    bestFor: ["制度设计", "团队管理", "合规与博弈"],
  },

  // 东方智慧 (4)
  {
    id: "eastern",
    name: "老子",
    title: "道家创始人",
    school: "道家学派",
    category: "eastern",
    icon: <Heart className="w-6 h-6" />,
    color: "#10B981",
    bgGradient: "from-emerald-500/20 to-teal-500/20",
    description: "道家学派创始人，主张顺应自然，无为而治。",
    corePhilosophy: "道法自然，无为而无不为。",
    thinkingModel: ["无为", "阴阳调和", "柔弱胜刚强", "返璞归真"],
    famousQuotes: [
      "上善若水，水善利万物而不争。",
      "知人者智，自知者明。",
      "大音希声，大象无形。",
    ],
    bestFor: ["压力释放", "顺势而为", "内心平和"],
  },
  {
    id: "zhuangzi",
    name: "庄子",
    title: "道家思想家",
    school: "道家学派",
    category: "eastern",
    icon: <Sparkles className="w-6 h-6" />,
    color: "#14B8A6",
    bgGradient: "from-teal-500/20 to-cyan-400/20",
    description: "道家代表人物，以寓言和超脱精神著称，追求逍遥自在。",
    corePhilosophy: "天地与我并生，万物与我为一。",
    thinkingModel: ["齐物论", "逍遥游", "无用之用", "坐忘心斋"],
    famousQuotes: [
      "昔者庄周梦为蝴蝶，栩栩然蝴蝶也。",
      "相濡以沫，不如相忘于江湖。",
      "井蛙不可以语于海者，拘于虚也。",
    ],
    bestFor: ["超脱执念", "自由思想", "人生智慧"],
  },
  {
    id: "buddha",
    name: "释迦牟尼",
    title: "佛教创始人",
    school: "佛家学派",
    category: "eastern",
    icon: <Compass className="w-6 h-6" />,
    color: "#F97316",
    bgGradient: "from-orange-500/20 to-amber-400/20",
    description: "通过正念与观照帮助你降低内耗，提升情绪稳定与慈悲行动。",
    corePhilosophy: "观照当下，放下执着，苦可转化为智慧。",
    thinkingModel: ["四圣谛", "八正道", "正念观照", "缘起性空"],
    famousQuotes: [
      "心净则国土净。",
      "执着越重，痛苦越深。",
      "觉察即自由的开始。",
    ],
    bestFor: ["情绪调节", "正念训练", "关系修复"],
  },
  {
    id: "wangyangming",
    name: "王阳明",
    title: "心学集大成者",
    school: "儒家心学",
    category: "eastern",
    icon: <ScrollText className="w-6 h-6" />,
    color: "#B45309",
    bgGradient: "from-amber-700/20 to-yellow-600/20",
    description: "倡导致良知与知行合一，强调在日用事上磨练，把道德直觉落到具体行动。",
    corePhilosophy: "知是行之始，行是知之成；事上磨练，方见真功夫。",
    thinkingModel: ["致良知", "知行合一", "事上磨练", "心即理"],
    famousQuotes: [
      "破山中贼易，破心中贼难。",
      "你未看此花时，此花与汝心同归于寂。",
      "志不立，天下无可成之事。",
    ],
    bestFor: ["拖延与知行不一", "职业伦理", "日常决策中的良知"],
  },
];

// 分类标签
const CATEGORIES = [
  { id: "all", label: "全部导师", icon: <Users className="w-4 h-4" /> },
  { id: "philosophy", label: "哲学思辨", icon: <Brain className="w-4 h-4" /> },
  { id: "psychology", label: "认知心理", icon: <Lightbulb className="w-4 h-4" /> },
  { id: "strategy", label: "战略思维", icon: <Target className="w-4 h-4" /> },
  { id: "eastern", label: "东方智慧", icon: <Heart className="w-4 h-4" /> },
];

interface MentorLibraryProps {
  onBack: () => void;
  onStartChat?: (mentorId: string) => void;
}

export function MentorLibrary({ onBack, onStartChat }: MentorLibraryProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedMentor, setSelectedMentor] = useState<Mentor | null>(null);

  // 过滤导师
  const filteredMentors = useMemo(() => {
    return MENTORS.filter((mentor) => {
      const matchesSearch =
        mentor.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        mentor.school.toLowerCase().includes(searchQuery.toLowerCase()) ||
        mentor.description.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCategory =
        selectedCategory === "all" || mentor.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [searchQuery, selectedCategory]);
  const categoryCounts = useMemo(() => {
    return {
      all: MENTORS.length,
      philosophy: MENTORS.filter((m) => m.category === "philosophy").length,
      psychology: MENTORS.filter((m) => m.category === "psychology").length,
      strategy: MENTORS.filter((m) => m.category === "strategy").length,
      eastern: MENTORS.filter((m) => m.category === "eastern").length,
    };
  }, []);

  return (
    <div className="h-screen flex flex-col bg-gradient-to-b from-[#0A0F1A] via-[#0D1526] to-[#0F1A2F]">
      {/* 顶部导航栏 */}
      <header className="flex-shrink-0 h-16 flex items-center justify-between px-6 border-b border-white/5">
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
          <div className="flex items-center gap-2">
            <div className="text-primary font-bold text-lg tracking-wider">
              PS<sup className="text-xs">2</sup>
            </div>
            <span className="text-white/40 text-sm">虚拟导师库</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
            <BookOpen className="w-4 h-4 text-primary" />
            <span className="text-xs text-primary">{MENTORS.length} 位导师可用</span>
          </div>
          <div className="hidden md:flex items-center gap-1.5 text-[10px] text-white/55">
            <span className="px-2 py-1 rounded-full bg-white/5 border border-white/10">哲学 {categoryCounts.philosophy}</span>
            <span className="px-2 py-1 rounded-full bg-white/5 border border-white/10">心理 {categoryCounts.psychology}</span>
            <span className="px-2 py-1 rounded-full bg-white/5 border border-white/10">战略 {categoryCounts.strategy}</span>
            <span className="px-2 py-1 rounded-full bg-white/5 border border-white/10">东方 {categoryCounts.eastern}</span>
          </div>
        </div>
      </header>

      {/* 主内容区 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：分类与搜索 */}
        <aside className="w-56 flex-shrink-0 border-r border-white/5 p-4 flex flex-col gap-4">
          {/* 搜索框 */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <input
              type="text"
              placeholder="搜索导师..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>

          {/* 分类标签 */}
          <div className="flex flex-col gap-1">
            <span className="text-xs text-white/40 uppercase tracking-wider mb-2">分类</span>
            {CATEGORIES.map((category) => (
              <motion.button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                  selectedCategory === category.id
                    ? "bg-primary/20 text-primary border border-primary/30"
                    : "text-white/60 hover:bg-white/5 hover:text-white"
                }`}
                whileHover={{ x: 4 }}
                whileTap={{ scale: 0.98 }}
              >
                {category.icon}
                <span>{category.label}</span>
                <span className={`ml-auto text-xs ${selectedCategory === category.id ? "text-primary/70" : "text-white/35"}`}>
                  {categoryCounts[category.id as keyof typeof categoryCounts]}
                </span>
              </motion.button>
            ))}
          </div>
        </aside>

        {/* 中间：导师卡片网格 */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredMentors.map((mentor, index) => (
              <motion.div
                key={mentor.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => setSelectedMentor(mentor)}
                className={`relative p-5 rounded-2xl cursor-pointer transition-all border ${
                  selectedMentor?.id === mentor.id
                    ? "border-primary/50 bg-primary/10"
                    : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8"
                }`}
                whileHover={{ y: -4, scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {/* 导师图标 */}
                <div
                  className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${mentor.bgGradient} flex items-center justify-center mb-4`}
                  style={{ color: mentor.color }}
                >
                  {mentor.icon}
                </div>

                {/* 导师信息 */}
                <h3 className="text-lg font-semibold text-white mb-1">{mentor.name}</h3>
                <p className="text-xs text-white/40 mb-3">{mentor.title} · {mentor.school}</p>
                <p className="text-sm text-white/60 line-clamp-2 mb-4">{mentor.description}</p>

                {/* 擅长领域标签 */}
                <div className="flex flex-wrap gap-1.5">
                  {mentor.bestFor.slice(0, 2).map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded-full text-[10px] bg-white/5 text-white/50"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </main>

        {/* 右侧：导师详情面板 */}
        <AnimatePresence mode="wait">
          {selectedMentor && (
            <motion.aside
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              className="w-96 flex-shrink-0 border-l border-white/5 overflow-y-auto"
            >
              <div className="p-6">
                {/* 关闭按钮 */}
                <motion.button
                  onClick={() => setSelectedMentor(null)}
                  className="absolute top-4 right-4 p-2 rounded-full bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <X className="w-4 h-4" />
                </motion.button>

                {/* 导师头像与基本信息 */}
                <div className="text-center mb-6">
                  <motion.div
                    className={`w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br ${selectedMentor.bgGradient} flex items-center justify-center mb-4`}
                    style={{ color: selectedMentor.color }}
                    animate={{ rotate: [0, 5, -5, 0] }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  >
                    {selectedMentor.icon}
                  </motion.div>
                  <h2 className="text-xl font-bold text-white mb-1">{selectedMentor.name}</h2>
                  <p className="text-sm text-white/50">{selectedMentor.title}</p>
                  <p className="text-xs text-primary mt-1">{selectedMentor.school}</p>
                </div>

                {/* 核心哲学 */}
                <div className="mb-6 p-4 rounded-xl bg-gradient-to-br from-white/5 to-white/0 border border-white/10">
                  <h4 className="text-xs text-white/40 uppercase tracking-wider mb-2">核心哲学</h4>
                  <p className="text-sm text-white/80 italic">&ldquo;{selectedMentor.corePhilosophy}&rdquo;</p>
                </div>

                {/* 思维模型 */}
                <div className="mb-6">
                  <h4 className="text-xs text-white/40 uppercase tracking-wider mb-3">思维模型</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedMentor.thinkingModel.map((model) => (
                      <span
                        key={model}
                        className="px-3 py-1.5 rounded-lg text-xs bg-white/5 text-white/70 border border-white/10"
                      >
                        {model}
                      </span>
                    ))}
                  </div>
                </div>

                {/* 名言选录 */}
                <div className="mb-6">
                  <h4 className="text-xs text-white/40 uppercase tracking-wider mb-3">名言选录</h4>
                  <div className="space-y-2">
                    {selectedMentor.famousQuotes.map((quote, i) => (
                      <div
                        key={i}
                        className="p-3 rounded-lg bg-white/5 border-l-2 text-xs text-white/60 leading-relaxed"
                        style={{ borderColor: selectedMentor.color }}
                      >
                        {quote}
                      </div>
                    ))}
                  </div>
                </div>

                {/* 擅长领域 */}
                <div className="mb-6">
                  <h4 className="text-xs text-white/40 uppercase tracking-wider mb-3">擅长帮助</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedMentor.bestFor.map((area) => (
                      <span
                        key={area}
                        className="px-3 py-1.5 rounded-full text-xs border"
                        style={{
                          backgroundColor: `${selectedMentor.color}15`,
                          borderColor: `${selectedMentor.color}30`,
                          color: selectedMentor.color,
                        }}
                      >
                        {area}
                      </span>
                    ))}
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className="space-y-3">
                  <motion.button
                    onClick={() => onStartChat?.(selectedMentor.id)}
                    className="w-full py-3 rounded-xl bg-primary text-white font-medium flex items-center justify-center gap-2"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>开始对话</span>
                  </motion.button>
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
