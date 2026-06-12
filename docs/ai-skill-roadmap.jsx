import { useState } from "react";

const phases = [
  {
    id: 1,
    label: "Phase 1",
    title: "地基层",
    duration: "第 1-6 周",
    color: "#059669",
    status: "current",
    description: "Python 生产化 + 工程基础设施",
    skills: [
      {
        category: "Python 生产化",
        priority: "P0",
        jdFreq: "100%",
        items: [
          { name: "async / await + asyncio", note: "对应你熟悉的 Promise，必须掌握" },
          { name: "FastAPI 路由 + 依赖注入", note: "国内 JD 出现率最高的后端框架" },
          { name: "Pydantic 数据验证", note: "对应 TS 的类型系统，几乎零学习成本" },
          { name: "httpx 异步 HTTP 客户端", note: "替代 fetch/axios" },
          { name: "错误处理 + 重试机制", note: "生产级必备，教程里最少讲的" },
          { name: "环境变量 + 配置管理", note: "python-dotenv + pydantic-settings" },
        ],
        project: "把 UClaw 某个 TS 接口用 FastAPI 完整重写，包括流式输出",
        checkPoint: "能不看文档独立写一个带 async、Pydantic、错误处理的完整路由",
      },
      {
        category: "工程基础设施",
        priority: "P0",
        jdFreq: "100%",
        items: [
          { name: "CLAUDE.md 建立与维护", note: "每次踩坑立即更新，团队记忆基础" },
          { name: "Git Worktree 并行开发", note: "Boris Cherny 核心工作流" },
          { name: "Slash Commands 自动化", note: "/commit-push-pr 等高频命令" },
          { name: "Docker Compose 调试", note: "LucidPanda 已有基础，深化" },
          { name: "环境隔离 + virtualenv", note: "Python 项目标配" },
        ],
        project: "给 UClaw 和 LucidPanda 各建立 CLAUDE.md，写 5 个 Slash Commands",
        checkPoint: "CLAUDE.md 有 10 条以上踩坑规则，有 3 个可用的 /commands",
      },
    ],
  },
  {
    id: 2,
    label: "Phase 2",
    title: "核心层",
    duration: "第 7-14 周",
    color: "#2563EB",
    status: "upcoming",
    description: "RAG 全链路 + Agent 框架入门",
    skills: [
      {
        category: "RAG 全链路",
        priority: "P0",
        jdFreq: "100%",
        items: [
          { name: "文档解析（PDF/MD/DOCX）", note: "pypdf、python-docx、unstructured" },
          { name: "文本切分策略", note: "固定窗口 vs 语义切分，面试必考" },
          { name: "Embedding 向量化", note: "调 Claude/OpenAI API 或本地 BGE 模型" },
          { name: "pgvector 索引与检索", note: "你已有 PostgreSQL，装扩展即可" },
          { name: "混合检索 Hybrid Search", note: "向量 + BM25 关键词，67% JD 要求" },
          { name: "Rerank 重排序", note: "提升检索精度的关键步骤" },
          { name: "引用溯源", note: "医疗/金融场景必须，防幻觉" },
          { name: "RAG Evals 评估", note: "准确率、召回率、幻觉率" },
        ],
        project: "在 UClaw 里加知识库功能：Zentao 历史需求文档 → pgvector → 自然语言查询",
        checkPoint: "能解释检索质量差时，先看切分策略还是先看 Embedding 模型，为什么",
      },
      {
        category: "LangChain 基础",
        priority: "P1",
        jdFreq: "93%",
        items: [
          { name: "Chain 基础概念", note: "了解即可，不深陷" },
          { name: "工具调用 (Tools)", note: "@tool 装饰器、BaseTool 子类" },
          { name: "Memory 记忆管理", note: "短期(上下文窗口) vs 长期(向量存储)" },
          { name: "Prompt Template", note: "版本化管理，不是写死字符串" },
          { name: "Callbacks + 日志", note: "调试 Agent 必备" },
        ],
        project: "用 LangChain 重写 UClaw 的一个 MCP Server 工具调用，对比两种方式的差异",
        checkPoint: "能说出 LangChain Tools 和 MCP Tools 的核心区别，各自适用场景",
      },
      {
        category: "向量数据库",
        priority: "P1",
        jdFreq: "67%",
        items: [
          { name: "pgvector（主攻）", note: "你已有 PostgreSQL，成本最低" },
          { name: "Milvus 基础了解", note: "大规模场景，知道原理即可" },
          { name: "Qdrant 基础了解", note: "新兴选择，API 简洁" },
          { name: "索引类型（HNSW/IVF）", note: "面试会问，理解原理" },
          { name: "相似度算法（cos/L2/dot）", note: "选错了会导致检索质量差" },
        ],
        project: "为 UClaw 的知识库建立 HNSW 索引，对比有无索引的查询性能",
        checkPoint: "能画出 pgvector 的数据流，解释为什么 cosine 距离适合文本检索",
      },
    ],
  },
  {
    id: 3,
    label: "Phase 3",
    title: "编排层",
    duration: "第 15-24 周",
    color: "#7C3AED",
    status: "future",
    description: "LangGraph + Multi-Agent + 工程化",
    skills: [
      {
        category: "LangGraph（核心）",
        priority: "P0",
        jdFreq: "80%",
        items: [
          { name: "节点(Node) + 边(Edge) 概念", note: "状态机思维，和 Redux 有相似处" },
          { name: "状态(State) 管理", note: "TypedDict 定义状态，贯穿整个图" },
          { name: "条件路由(Conditional Edge)", note: "Agent 决策分支的核心" },
          { name: "循环 + 反思(Reflection)", note: "自我修正机制，53% JD 要求" },
          { name: "持久化 Checkpointer", note: "断点续跑，长任务必备" },
          { name: "Human-in-the-Loop", note: "人工审批节点，金融场景必须" },
          { name: "子图(Subgraph)", note: "模块化复杂工作流" },
        ],
        project: "用 LangGraph 重构 UClaw 编排层：需求查询 → 分析 → 生成报告 → 推送通知",
        checkPoint: "能画出 UClaw Agent 在某个工具调用失败时的完整状态转移图",
      },
      {
        category: "Multi-Agent 系统",
        priority: "P1",
        jdFreq: "53%",
        items: [
          { name: "Router 模式", note: "分发任务给不同专业 Agent" },
          { name: "Supervisor 模式", note: "主 Agent 协调多个子 Agent" },
          { name: "Hierarchical 层次协作", note: "复杂任务分解，类似 Boris 的双审查模式" },
          { name: "Agent 间通信协议", note: "A2A 协议基础了解" },
          { name: "任务分配与冲突消解", note: "资源竞争时的仲裁策略" },
          { name: "结果聚合", note: "多 Agent 输出合并策略" },
        ],
        project: "在 UClaw 里实现双 Agent 审查：计划 Agent + 批评 Agent，模拟 Boris 团队做法",
        checkPoint: "能描述 UClaw 中 Supervisor Agent 如何决定把任务分配给哪个子 Agent",
      },
      {
        category: "Evals 评估体系",
        priority: "P1",
        jdFreq: "53%",
        items: [
          { name: "Eval 用例设计", note: "什么叫做好？先定义再实现" },
          { name: "LLM-as-Judge", note: "用 Claude 当评委，Scott White 核心方法论" },
          { name: "Pass Rate 统计", note: "自动化运行，看通过率" },
          { name: "Bad Case 分析", note: "失败案例的根因分析" },
          { name: "A/B Prompt 实验", note: "两版 Prompt 对比，数据说话" },
          { name: "Langfuse 可观测", note: "20% JD 提及，快速增长中" },
        ],
        project: "为 UClaw 的需求分析功能建立 Evals：10 个测试用例，用 Claude 自动打分",
        checkPoint: "能用 LLM-as-Judge 跑出一份包含分数和原因的 Eval 报告",
      },
      {
        category: "Agent 降级与可靠性",
        priority: "P1",
        jdFreq: "80%",
        items: [
          { name: "工具调用失败重试", note: "参数校验层 + 重生成 + 人工兜底" },
          { name: "上下文溢出处理", note: "Summarize + Sliding Window" },
          { name: "目标漂移检测", note: "每步对齐 + 定期反思" },
          { name: "超时控制", note: "每个工具调用设置 timeout" },
          { name: "降级策略", note: "Fallback 链：主模型 → 备用模型 → 人工" },
          { name: "幻觉检测", note: "输出验证层，金融/医疗必须" },
        ],
        project: "为 UClaw 所有 MCP 工具调用加上重试 + 降级 + 超时，模拟 Zentao 宕机场景",
        checkPoint: "能在面试中不看代码，描述 UClaw 完整的容错链路",
      },
    ],
  },
  {
    id: 4,
    label: "Phase 4",
    title: "进阶层",
    duration: "第 25-40 周",
    color: "#DC2626",
    status: "future",
    description: "平台工程 + 可观测 + 对外输出",
    skills: [
      {
        category: "AI 平台工程",
        priority: "P1",
        jdFreq: "73%",
        items: [
          { name: "MCP Server 深化", note: "OAuth 2.1 认证、工具注册发现机制" },
          { name: "LLM 网关设计", note: "统一模型入口、限流、计费、日志" },
          { name: "Prompt 版本管理", note: "Git 管理提示词，不是写死在代码里" },
          { name: "多租户权限控制", note: "企业场景必须，UClaw 的核心设计" },
          { name: "用量监控 + 成本控制", note: "Token 消耗统计、预算告警" },
          { name: "Kubernetes 基础", note: "73% JD 要求，了解 Pod/Service/Deploy" },
        ],
        project: "给 UClaw 加 LLM 网关层：统一管理模型调用、Token 用量统计、权限控制",
        checkPoint: "能设计一个支持 1000 人并发的 UClaw 架构图，说清楚瓶颈在哪里",
      },
      {
        category: "模型集成与优化",
        priority: "P2",
        jdFreq: "47%",
        items: [
          { name: "国产模型 API", note: "Qwen/DeepSeek/文心一言/豆包，国内 JD 高频" },
          { name: "OpenAI 兼容接口", note: "一套代码多模型切换" },
          { name: "Prompt Caching", note: "Anthropic 特有，大幅降低成本" },
          { name: "Structured Output", note: "JSON Schema 约束输出，生产级必备" },
          { name: "Streaming 流式输出", note: "用户体验关键，FastAPI + SSE" },
          { name: "vLLM/Ollama 本地部署了解", note: "加分项，不必深入" },
        ],
        project: "UClaw 接入 DeepSeek API，实现一键切换 Claude/Qwen/DeepSeek，成本对比",
        checkPoint: "能说出 Claude Prompt Caching 和普通调用的成本差异，适用场景",
      },
      {
        category: "对外技术输出",
        priority: "P0",
        jdFreq: "40%（影响力 x10）",
        items: [
          { name: "掘金/知乎技术文章", note: "每完成一个功能点写一篇，关键词 MCP/RAG/Agent" },
          { name: "GitHub 开源项目", note: "UClaw 或 LucidPanda 的某个子模块开源" },
          { name: "简历两版本维护", note: "平台工程版 vs 全栈工程版" },
          { name: "面试系统设计准备", note: "UClaw 扩展到 1万人怎么设计？" },
          { name: "LeetCode 刷题", note: "50道中等题，应付笔试，Python 作答" },
        ],
        project: "写 3 篇技术文章：①UClaw MCP 踩坑 ②pgvector RAG 实践 ③LangGraph 编排升级",
        checkPoint: "掘金有 500+ 阅读量的文章，GitHub 有 50+ Star 的项目",
      },
    ],
  },
];

const priorityConfig = {
  P0: { bg: "#FEF2F2", border: "#FCA5A5", text: "#DC2626", label: "必须" },
  P1: { bg: "#FFF7ED", border: "#FCD34D", text: "#D97706", label: "重要" },
  P2: { bg: "#EFF6FF", border: "#93C5FD", text: "#2563EB", label: "加分" },
};

const statusConfig = {
  current: { label: "立即开始", bg: "#F0FDF4", text: "#059669" },
  upcoming: { label: "3个月后", bg: "#EFF6FF", text: "#2563EB" },
  future: { label: "6个月后", bg: "#F5F3FF", text: "#7C3AED" },
};

export default function Roadmap() {
  const [activePhase, setActivePhase] = useState(0);
  const [activeSkill, setActiveSkill] = useState(null);

  const phase = phases[activePhase];

  return (
    <div style={{
      fontFamily: "'Inter', 'PingFang SC', 'Helvetica Neue', sans-serif",
      background: "#F8FAFC",
      minHeight: "100vh",
      color: "#1E293B",
    }}>
      {/* Header */}
      <div style={{
        borderBottom: "1px solid #E2E8F0",
        padding: "20px 32px 16px",
        background: "#FFFFFF",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      }}>
        <div style={{ fontSize: "11px", color: "#94A3B8", letterSpacing: "2px", marginBottom: "4px", fontWeight: "600" }}>
          AI ENGINEER · SKILL ROADMAP · 2026
        </div>
        <div style={{ fontSize: "20px", fontWeight: "700", color: "#0F172A" }}>
          上海 AI 岗位技能全景 & 学习演进路线
        </div>
        <div style={{ fontSize: "12px", color: "#94A3B8", marginTop: "3px" }}>
          基于 15 份真实 Boss直聘 JD 分析 · 前端转型 AI 工程师专属定制
        </div>
      </div>

      {/* Phase tabs */}
      <div style={{
        display: "flex",
        background: "#FFFFFF",
        borderBottom: "1px solid #E2E8F0",
        overflowX: "auto",
        gap: "0",
      }}>
        {phases.map((p, i) => {
          const sc = statusConfig[p.status];
          const isActive = activePhase === i;
          return (
            <button
              key={p.id}
              onClick={() => { setActivePhase(i); setActiveSkill(null); }}
              style={{
                flex: "0 0 auto",
                padding: "14px 28px",
                background: isActive ? "#F8FAFC" : "#FFFFFF",
                border: "none",
                borderBottom: isActive ? `2px solid ${p.color}` : "2px solid transparent",
                borderRight: "1px solid #F1F5F9",
                cursor: "pointer",
                textAlign: "left",
                minWidth: "150px",
                transition: "all 0.15s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
                <span style={{
                  fontSize: "9px", fontWeight: "700", letterSpacing: "1px",
                  padding: "2px 6px", borderRadius: "3px",
                  background: sc.bg, color: sc.text,
                }}>
                  {sc.label}
                </span>
              </div>
              <div style={{
                fontSize: "14px", fontWeight: "700",
                color: isActive ? p.color : "#64748B",
              }}>
                {p.label} · {p.title}
              </div>
              <div style={{ fontSize: "11px", color: "#94A3B8", marginTop: "1px" }}>{p.duration}</div>
            </button>
          );
        })}
      </div>

      {/* Phase banner */}
      <div style={{
        padding: "10px 32px",
        background: `${phase.color}08`,
        borderBottom: `1px solid ${phase.color}20`,
        display: "flex",
        alignItems: "center",
        gap: "10px",
      }}>
        <div style={{
          width: "6px", height: "6px", borderRadius: "50%",
          background: phase.color, flexShrink: 0,
        }} />
        <div style={{ fontSize: "13px", color: phase.color, fontWeight: "500" }}>
          {phase.description}
        </div>
      </div>

      {/* Main layout */}
      <div style={{ display: "flex", height: "calc(100vh - 178px)", overflow: "hidden" }}>

        {/* Left sidebar: skill categories */}
        <div style={{
          width: "240px",
          flexShrink: 0,
          borderRight: "1px solid #E2E8F0",
          overflowY: "auto",
          background: "#FFFFFF",
        }}>
          {phase.skills.map((skill, i) => {
            const pc = priorityConfig[skill.priority];
            const isActive = activeSkill === i;
            return (
              <div
                key={i}
                onClick={() => setActiveSkill(isActive ? null : i)}
                style={{
                  padding: "14px 16px",
                  borderBottom: "1px solid #F1F5F9",
                  cursor: "pointer",
                  background: isActive ? "#F8FAFC" : "#FFFFFF",
                  borderLeft: isActive ? `3px solid ${phase.color}` : "3px solid transparent",
                  transition: "all 0.15s",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "5px" }}>
                  <span style={{
                    fontSize: "9px", fontWeight: "700",
                    padding: "2px 7px", borderRadius: "3px",
                    background: pc.bg, border: `1px solid ${pc.border}`,
                    color: pc.text,
                  }}>
                    {skill.priority} {pc.label}
                  </span>
                  <span style={{ fontSize: "10px", color: "#CBD5E1" }}>JD {skill.jdFreq}</span>
                </div>
                <div style={{
                  fontSize: "13px", fontWeight: "600",
                  color: isActive ? "#0F172A" : "#475569",
                  marginBottom: "2px",
                }}>
                  {skill.category}
                </div>
                <div style={{ fontSize: "11px", color: "#94A3B8" }}>
                  {skill.items.length} 个技能点
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: detail panel */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px", background: "#F8FAFC" }}>
          {activeSkill === null ? (
            // Overview
            <div>
              <div style={{ fontSize: "11px", color: "#94A3B8", fontWeight: "600", letterSpacing: "1px", marginBottom: "16px" }}>
                {phase.title} · 技能总览
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "24px" }}>
                {phase.skills.map((skill, i) => {
                  const pc = priorityConfig[skill.priority];
                  return (
                    <div
                      key={i}
                      onClick={() => setActiveSkill(i)}
                      style={{
                        padding: "18px",
                        background: "#FFFFFF",
                        border: "1px solid #E2E8F0",
                        borderRadius: "10px",
                        cursor: "pointer",
                        transition: "all 0.2s",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.borderColor = phase.color;
                        e.currentTarget.style.boxShadow = `0 4px 12px ${phase.color}20`;
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.borderColor = "#E2E8F0";
                        e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)";
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                        <span style={{
                          fontSize: "9px", fontWeight: "700",
                          padding: "2px 7px", borderRadius: "3px",
                          background: pc.bg, border: `1px solid ${pc.border}`, color: pc.text,
                        }}>{skill.priority} {pc.label}</span>
                        <span style={{ fontSize: "10px", color: "#CBD5E1" }}>JD {skill.jdFreq}</span>
                      </div>
                      <div style={{ fontSize: "14px", fontWeight: "700", color: "#0F172A", marginBottom: "10px" }}>
                        {skill.category}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                        {skill.items.slice(0, 4).map((item, j) => (
                          <span key={j} style={{
                            fontSize: "10px", padding: "3px 8px",
                            background: "#F1F5F9", borderRadius: "4px",
                            color: "#64748B",
                          }}>{item.name}</span>
                        ))}
                        {skill.items.length > 4 && (
                          <span style={{ fontSize: "10px", padding: "3px 8px", color: "#94A3B8" }}>
                            +{skill.items.length - 4} 项
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Phase output summary */}
              <div style={{
                padding: "20px",
                background: "#FFFFFF",
                border: `1px solid ${phase.color}30`,
                borderLeft: `4px solid ${phase.color}`,
                borderRadius: "10px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}>
                <div style={{ fontSize: "11px", fontWeight: "700", color: phase.color, letterSpacing: "1px", marginBottom: "14px" }}>
                  📦 本阶段实战产出
                </div>
                {phase.skills.map((skill, i) => (
                  <div key={i} style={{ marginBottom: "14px" }}>
                    <div style={{
                      fontSize: "11px", fontWeight: "600", color: "#64748B",
                      marginBottom: "4px",
                    }}>
                      {skill.category}
                    </div>
                    <div style={{
                      fontSize: "12px", color: "#475569",
                      paddingLeft: "12px",
                      borderLeft: `2px solid ${phase.color}40`,
                      lineHeight: "1.6",
                    }}>
                      {skill.project}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            // Skill detail
            (() => {
              const skill = phase.skills[activeSkill];
              const pc = priorityConfig[skill.priority];
              return (
                <div>
                  {/* Header */}
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                    <span style={{
                      fontSize: "11px", fontWeight: "700",
                      padding: "3px 10px", borderRadius: "4px",
                      background: pc.bg, border: `1px solid ${pc.border}`, color: pc.text,
                    }}>{skill.priority} · {pc.label}</span>
                    <span style={{ fontSize: "11px", color: "#94A3B8" }}>
                      出现在 <strong style={{ color: "#475569" }}>{skill.jdFreq}</strong> 的 JD 中
                    </span>
                  </div>
                  <div style={{ fontSize: "20px", fontWeight: "700", color: "#0F172A", marginBottom: "24px" }}>
                    {skill.category}
                  </div>

                  {/* Skill list */}
                  <div style={{
                    background: "#FFFFFF",
                    border: "1px solid #E2E8F0",
                    borderRadius: "10px",
                    marginBottom: "16px",
                    overflow: "hidden",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                  }}>
                    <div style={{
                      padding: "12px 18px",
                      borderBottom: "1px solid #F1F5F9",
                      background: "#F8FAFC",
                      fontSize: "11px", fontWeight: "600", color: "#64748B", letterSpacing: "1px",
                    }}>
                      技能清单 · {skill.items.length} 项
                    </div>
                    {skill.items.map((item, j) => (
                      <div key={j} style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "14px",
                        padding: "13px 18px",
                        borderBottom: j < skill.items.length - 1 ? "1px solid #F8FAFC" : "none",
                      }}>
                        <div style={{
                          width: "22px", height: "22px",
                          borderRadius: "50%",
                          background: `${phase.color}15`,
                          border: `1px solid ${phase.color}40`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "10px", fontWeight: "700", color: phase.color,
                          flexShrink: 0,
                        }}>{j + 1}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "13px", fontWeight: "600", color: "#1E293B", marginBottom: "2px" }}>
                            {item.name}
                          </div>
                          <div style={{ fontSize: "11px", color: "#94A3B8", lineHeight: "1.5" }}>
                            {item.note}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Project card */}
                  <div style={{
                    padding: "16px 20px",
                    background: "#FFFFFF",
                    border: "1px solid #E2E8F0",
                    borderLeft: `4px solid ${phase.color}`,
                    borderRadius: "10px",
                    marginBottom: "12px",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                  }}>
                    <div style={{
                      fontSize: "10px", fontWeight: "700", color: phase.color,
                      letterSpacing: "1px", marginBottom: "8px",
                    }}>
                      📦 实战项目（UClaw / LucidPanda）
                    </div>
                    <div style={{ fontSize: "13px", color: "#334155", lineHeight: "1.7" }}>
                      {skill.project}
                    </div>
                  </div>

                  {/* Checkpoint card */}
                  <div style={{
                    padding: "16px 20px",
                    background: "#F0FDF4",
                    border: "1px solid #BBF7D0",
                    borderLeft: "4px solid #059669",
                    borderRadius: "10px",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                  }}>
                    <div style={{
                      fontSize: "10px", fontWeight: "700", color: "#059669",
                      letterSpacing: "1px", marginBottom: "8px",
                    }}>
                      ✓ 验收标准（能做到才算真正掌握）
                    </div>
                    <div style={{ fontSize: "13px", color: "#166534", lineHeight: "1.7" }}>
                      {skill.checkPoint}
                    </div>
                  </div>
                </div>
              );
            })()
          )}
        </div>
      </div>
    </div>
  );
}
