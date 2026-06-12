# Ocean Platform · Skill 系统 PRD

> **版本** v1.1 · 正式 | **日期** 2026-06-12 | **状态** 🟢 已定稿

| 字段 | 内容 |
|------|------|
| 产品 | Ocean（原 UClaw）· 企业 AI 工作流平台 |
| 功能模块 | Skill 系统 —— 上下文感知技能触发引擎 |
| 技术栈 | FastAPI · Next.js · TimescaleDB · Redis · Tencent Cloud |
| 参考对象 | Claude.ai Skill System / Claude Code Skills |

---

## 目录

1. [背景与目标](#1-背景与目标)
2. [系统架构设计](#2-系统架构设计)
3. [功能需求详述](#3-功能需求详述)
4. [API 接口设计](#4-api-接口设计)
5. [前端交互设计](#5-前端交互设计nextjs)
6. [研发排期建议](#6-研发排期建议)
7. [非功能性需求](#7-非功能性需求)
8. [待决策项](#8-待决策项)

---

## 1. 背景与目标

### 1.1 问题陈述

Ocean 是面向企业全员的 AI 工作流自动化平台，连接禅道（Zentao）、Jenkins、GitLab 及 IM 平台。当前版本中，Claude 的系统提示词（System Prompt）是**静态的**——所有场景共用同一份上下文注入，导致以下问题：

- **上下文冗余**：无关工具的说明常驻上下文，token 浪费、响应质量下降
- **扩展性差**：每增加一个集成场景就需要重写整个 System Prompt
- **专业化不足**：通用模式难以为特定岗位（研发 / 测试 / 产品 / 运营）提供深度引导
- **无法复用**：团队沉淀的最佳实践无法模块化分发

### 1.2 产品目标

在 Ocean 平台中实现一套类 Claude Skill 的上下文感知技能系统：

| 目标 | 成功标准 |
|------|---------|
| 上下文精准注入 | 每次请求的 token 消耗降低 ≥ 40%，同等任务响应质量提升 |
| 技能模块化 | 新增集成场景无需修改主 System Prompt，仅需新增 Skill 文件 |
| 团队知识沉淀 | 支持团队级 Skill 创建、分享、版本管理 |
| 低门槛创作 | 非研发同学可通过 UI 向导创建 Skill，无需编写代码 |

---

## 2. 系统架构设计

### 2.1 三层渐进披露模型

参考 Claude.ai Skill System 的核心设计，Ocean Skill 系统采用**三层按需加载架构**：

| 层级 | 内容 | 加载时机 | 大小限制 |
|------|------|---------|---------|
| **L1 元数据** | `name` + `description` | 每次请求始终注入 | ≤ 200 tokens / 个 |
| **L2 指令体** | Skill Prompt 主体 | 触发匹配后动态注入 | ≤ 8K tokens |
| **L3 资源包** | 文档 / 模板 / 脚本 | Skill 主动请求时按需拉取 | 无限制（文件存储） |

**设计意图**：L1 元数据常驻上下文（全部 Skill 的描述总量可控），L2 和 L3 仅在命中时按需加载，避免 context window 膨胀。

### 2.2 触发引擎设计

触发引擎是 Skill 系统的核心。用户消息到达后，在调用 LLM **之前**，系统完成以下流程：

```python
# 触发引擎伪代码（Python / FastAPI）
async def resolve_skills(user_message: str, session: Session):
    # L1: 取所有 Skill 元数据（name + description）—— 来自 Redis 缓存
    skill_catalog = await skill_registry.list_meta(session.scope)

    # L2: 语义匹配 → 得分 ≥ threshold 的 Skill 列表
    matched = await trigger_engine.match(user_message, skill_catalog)

    # L3: 并行拉取命中 Skill 的指令体
    skill_bodies = await asyncio.gather(*[
        skill_registry.load_body(s.id) for s in matched
    ])

    # 注入 System Prompt → 调用 Anthropic API
    return build_system_prompt(skill_bodies)
```

### 2.3 匹配策略

触发匹配支持三种策略，可组合使用：

| 策略 | 机制 | 延迟 | 推荐场景 |
|------|------|------|---------|
| **关键词匹配** | Skill 描述中配置 `trigger_keywords`，与用户消息做词匹配 | < 1ms | 确定性高的场景 |
| **Embedding 语义匹配** | 对用户消息和 Skill description 做向量化，计算余弦相似度 | 5~15ms | 语义模糊场景 |
| **LLM 裁判** | 将消息和 Skill 列表送入轻量 LLM，让 LLM 判断应触发哪些 Skill | 200~800ms | 高精度 / 复杂歧义 |

> **推荐默认策略**：关键词匹配（快速过滤）+ Embedding 语义匹配（补充覆盖）。LLM 裁判用于 Skill 数量 ≥ 50 或场景高度歧义时降级启用。

---

## 3. 功能需求详述

### 3.1 需求总览

| ID | 功能名称 | 描述 | 优先级 | 复杂度 |
|----|---------|------|--------|--------|
| SK-01 | Skill 数据模型 | 定义 Skill 数据结构：id / name / description / trigger_keywords / body / resources / scope / version | P0 | M |
| SK-02 | 触发引擎 | 在每次 LLM 调用前执行 Skill 匹配，将命中 Skill 的 L2 指令体注入 System Prompt | P0 | L |
| SK-03 | Skill CRUD API | 后端提供 Skill 的增删改查 REST 接口，支持版本管理 | P0 | M |
| SK-04 | Skill 管理 UI | 管理后台：Skill 列表 / 创建向导 / 编辑器 / 测试沙盒 | P0 | L |
| SK-05 | 作用域控制 | 支持 global / team / personal 三级作用域，继承与覆盖 | P1 | M |
| SK-06 | 斜杠命令 `/` | 对话框输入 `/` 后弹出 Skill 快捷触发菜单 | P1 | M |
| SK-07 | 流式感知注入 | SSE 流式响应场景下，Skill 注入在 stream 启动前完成，不中断流 | P0 | S |
| SK-08 | Skill 市场 | 内部 Skill 市场，支持团队分享、安装、评分 | P2 | XL |
| SK-09 | A/B 测试 | 同一场景多个 Skill 版本并行测试，统计效果指标 | P2 | L |
| SK-10 | 触发日志 | 记录每次请求的 Skill 触发情况，用于调试与优化 | P1 | S |

---

### 3.2 Skill 数据模型（SK-01）

数据库表设计（TimescaleDB / PostgreSQL + pgvector）：

```sql
-- skills 主表
CREATE TABLE skills (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(100) NOT NULL,
  description   TEXT NOT NULL,           -- L1 触发描述（同时用于 Embedding）
  trigger_kws   TEXT[],                  -- 关键词列表，用于快速匹配
  body          TEXT,                    -- L2 指令体（Markdown 格式）
  embedding     vector(1536),            -- L1 desc 的向量化结果
  scope         VARCHAR(20) DEFAULT 'team', -- global / team / personal
  team_id       UUID REFERENCES teams(id),
  creator_id    UUID REFERENCES users(id),
  version       INTEGER DEFAULT 1,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- resources 资源包表（L3）
CREATE TABLE skill_resources (
  id          UUID PRIMARY KEY,
  skill_id    UUID REFERENCES skills(id) ON DELETE CASCADE,
  type        VARCHAR(20),  -- script / reference / asset
  filename    TEXT,
  storage_key TEXT          -- MinIO / COS object key
);

-- 触发日志表
CREATE TABLE skill_trigger_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID,
  message_id    UUID,
  triggered_ids UUID[],          -- 本次触发的 Skill ID 列表
  match_scores  JSONB,           -- { skill_id: score }
  injected_tokens INTEGER,       -- 注入消耗的 token 数
  created_at    TIMESTAMPTZ DEFAULT now()
);
```

**Redis 缓存策略：**

```
skill:catalog:{team_id}     → L1 元数据列表，进程启动时预热，写入时失效
skill:body:{skill_id}       → L2 指令体，TTL 300s，写入时失效
skill:embedding:{skill_id}  → 向量缓存，与 DB 同步更新
```

---

### 3.3 斜杠命令 `/` 交互设计（SK-06）

这是 UI 层的**显式触发入口**，与自动触发引擎互补：

| 步骤 | 交互设计 |
|------|---------|
| ① 输入 `/` | 对话框监听 `keydown`，检测到 `/` 后立即从前端缓存读取 Skill 列表，**无需 API 调用** |
| ② 弹出浮层菜单 | 渲染可滚动列表，展示 `name` + `description` 摘要（≤ 40 字）；支持键盘 ↑↓ 选择 + Enter 确认 |
| ③ 继续输入过滤 | `/git` 后实时过滤，模糊匹配 `name` 和 `trigger_keywords`（前端 fuse.js） |
| ④ 选择确认 | 选中后对话框展示 Skill **徽章（chip）**，用户可继续追加自然语言描述，发送时 Skill ID 随消息一并提交 |
| ⑤ 后端强制注入 | 显式传入的 Skill ID **绕过触发引擎评分**，强制加载 L2 指令体；与自动触发的 Skill 合并去重注入 |

**UX 细节：**
- 按 `Esc` 关闭浮层，不影响已输入内容
- 已选 Skill chip 可点击 × 移除
- 浮层最多展示 8 条，超出滚动
- AI 回复气泡可选展示本次触发的 Skill 名称（`SkillBadge` 组件，默认折叠）

---

### 3.4 流式对话感知注入（SK-07）

Ocean 使用 SSE 流式响应。**Skill 注入必须在 stream 启动前完成**，核心时序：

```
POST /api/chat/stream
  │
  ├─ 1. 接收请求 { message, session_id, skill_ids? }
  │
  ├─ 2. [并行执行]
  │     ├─ resolve_skills(message)       ← 触发引擎，≤ 50ms
  │     └─ load_session_context()        ← 历史消息、用户信息
  │
  ├─ 3. build_system_prompt(base_prompt, skill_bodies)
  │       └─ 合并策略：XML 分区隔离
  │          <skill name="gitlab-expert">...</skill>
  │          <skill name="code-review">...</skill>
  │
  ├─ 4. → Anthropic API  stream=True
  │
  └─ 5. yield SSE chunks → 前端实时渲染
```

**关键约束：**

```python
# 超时降级
SKILL_RESOLVE_TIMEOUT_MS = 50  # P99 上限
# 超时则跳过 Skill 注入，对话正常继续

# 缓存策略
SKILL_CATALOG_TTL = None      # 进程级缓存，写入时主动失效
SKILL_BODY_TTL_S  = 300       # Redis TTL，更新时失效

# Token 配额
MAX_SKILL_TOKEN_RATIO = 0.30  # 注入 Skill 总量 ≤ 上下文窗口 30%
# 超出时按 scope 优先级截断：personal > team > global
```

---

## 4. API 接口设计

### 4.1 端点总览

| Method | Path | 描述 |
|--------|------|------|
| `GET` | `/api/skills` | 获取当前用户可见的 Skill 列表（含 L1 元数据） |
| `POST` | `/api/skills` | 创建新 Skill |
| `GET` | `/api/skills/{id}` | 获取 Skill 详情（含 L2 body） |
| `PUT` | `/api/skills/{id}` | 更新 Skill（自动版本 +1，重新生成 embedding） |
| `DELETE` | `/api/skills/{id}` | 软删除 Skill（`is_active=false`） |
| `POST` | `/api/skills/resolve` | 输入消息 → 返回命中的 Skill 列表（调试用） |
| `GET` | `/api/skills/catalog` | 获取 L1 元数据列表（用于前端缓存 / `/` 菜单） |
| `POST` | `/api/skills/{id}/test` | 沙盒测试：输入 prompt，返回注入该 Skill 后的完整 System Prompt 及 LLM 响应 |

### 4.2 关键请求体示例

**创建 Skill（POST `/api/skills`）：**

```json
{
  "name": "gitlab-expert",
  "description": "GitLab MR 审查、流水线排查、分支管理专家。当用户提到 MR、合并请求、CI 失败、流水线、GitLab 相关问题时触发。",
  "trigger_keywords": ["MR", "合并请求", "流水线", "CI", "GitLab", "merge request"],
  "body": "# GitLab Expert\n\n你是 GitLab 专家...",
  "scope": "team",
  "team_id": "uuid-here"
}
```

**触发解析（POST `/api/skills/resolve`）：**

```json
// Request
{ "message": "帮我看一下这个 MR 有什么问题", "session_id": "uuid" }

// Response
{
  "matched": [
    { "id": "uuid", "name": "gitlab-expert", "score": 0.91, "match_type": "keyword+embedding" }
  ],
  "resolve_ms": 12
}
```

**流式对话请求（POST `/api/chat/stream`）：**

```json
{
  "message": "帮我看一下这个 MR 有什么问题",
  "session_id": "uuid",
  "skill_ids": ["uuid-gitlab-expert"]   // 可选，显式指定（来自 / 命令）
}
```

---

## 5. 前端交互设计（Next.js）

### 5.1 组件架构

```
ChatInput
├── SkillPicker（浮层）     ← / 触发，fuse.js 过滤
├── SkillChip[]（徽章）     ← 已选 Skill，可移除
└── 发送按钮（附带 skill_ids）

MessageBubble（AI 回复）
└── SkillBadge[]（可选显示）← 本次自动触发的 Skill 名称

SkillEditor（管理页）
├── Markdown 编辑器
├── 实时预览
├── 关键词配置
└── 沙盒测试面板
```

### 5.2 状态管理（Zustand）

```typescript
// skill-store.ts
interface SkillStore {
  // 数据
  catalog: SkillMeta[]        // L1 元数据，启动时加载并缓存到 store
  
  // 对话框状态
  activeSkills: SkillMeta[]   // 当前已选 Skill（/ 命令选择的）
  pickerOpen: boolean         // / 菜单是否展示
  pickerQuery: string         // 过滤关键词（/ 后输入的内容）
  
  // 回复状态
  triggeredSkills: string[]   // 上一次 AI 回复的自动触发 Skill（展示用）
  
  // Actions
  openPicker: () => void
  closePicker: () => void
  selectSkill: (skill: SkillMeta) => void
  removeSkill: (id: string) => void
  clearActiveSkills: () => void
  refreshCatalog: () => Promise<void>
}
```

### 5.3 斜杠命令键盘事件处理

```typescript
// ChatInput 组件内
const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === '/' && inputValue === '') {
    e.preventDefault()
    openPicker()
    return
  }
  if (pickerOpen) {
    if (e.key === 'ArrowDown') selectNext()
    if (e.key === 'ArrowUp') selectPrev()
    if (e.key === 'Enter') confirmSelection()
    if (e.key === 'Escape') closePicker()
  }
}
```

---

## 6. 研发排期建议

| 阶段 | 里程碑 | 交付内容 | 预估周期 |
|------|--------|---------|---------|
| **Phase 1** | MVP · 基础触发 | 数据模型 + CRUD API + 关键词触发引擎 + 基础管理 UI + 流式注入（SK-01/02/03/04/07） | 2 周 |
| **Phase 2** | 语义匹配 + / 命令 | Embedding 语义匹配 + 作用域控制 + 斜杠命令 UI + 触发日志（SK-05/06/10） | 2 周 |
| **Phase 3** | 市场 + A/B 测试 | Skill 市场 + 版本 A/B 测试 + 效果数据大盘（SK-08/09） | 3 周 |

**Phase 1 具体任务拆解：**

```
后端（FastAPI）
├── skills / skill_resources 表创建 + Migration
├── Skill CRUD 接口（含权限校验）
├── 关键词触发引擎（trigger_kws 匹配）
├── System Prompt 构建器（XML 分区合并）
└── /api/chat/stream 接入 Skill 注入逻辑

前端（Next.js）
├── Skill 管理页（列表 + 创建 / 编辑表单）
├── SkillEditor（Markdown 编辑器，推荐 CodeMirror）
└── 沙盒测试面板（输入 prompt → 展示注入结果）
```

---

## 7. 非功能性需求

| 指标 | 要求 |
|------|------|
| **触发延迟** | `resolve_skills` P99 ≤ 50ms（关键词 + Embedding 组合），不阻塞流式输出 |
| **可用性** | Skill 服务不可用时降级：跳过注入，对话正常继续，不影响核心聊天功能 |
| **安全** | Skill body 内容做 Prompt Injection 检测；personal scope Skill 仅创建者可见 |
| **可观测性** | 每次请求记录：触发 Skill 列表 / 匹配得分 / 注入 token 数 / 响应质量评分（👍/👎） |
| **Token 配额** | 单次请求注入的 Skill 总 token ≤ 模型上下文 30%；超出时按优先级截断并通知用户 |
| **扩展性** | Skill 数量 ≤ 200 时关键词 + Embedding 策略可支撑；超出后需引入向量索引（HNSW） |

---

## 8. 架构与设计决策（已确认）

以下关键架构与设计问题已在研发启动前明确：

1. **Embedding 模型选型**：**自建 BGE 模型（如 BGE-m3 或 BGE-large-zh-v1.5）**。考虑到腾讯云国内区部署的网络约束和极低的延迟要求（P99 ≤ 50ms），采用本地自建可避免外部 API 网络波动并保障数据隐私。

2. **Skill 体积上限**：**全模型统一采用 8K tokens 软上限**。尽管 Claude 3/3.5 具备 200K 上下文，但为防止“指令污染”和“Lost in the Middle”现象，L2 指令体保持精简。若 Skill 包含海量参考资料，应剥离至 L3 资源包按需检索。

3. **多 Skill 合并策略**：**采用 XML 分区隔离**。使用 `<injected_skills><skill name="...">...</skill></injected_skills>` 格式。契合 Anthropic 最佳实践，有清晰的上下文边界且不增加 LLM 推理延迟。

4. **品牌命名**：**前端面向用户采用「AI 专家」或「场景插件」，底层代码维持 `Skill`**。为贴合企业工作流心智，交互层进行领域化包装；研发视角代码名与 DB 表保持 `Skill` 不变，降低耦合风险。

5. **LucidPanda 接入**：**明确不接入**。Skill 系统专为 Ocean 平台定制服务，系统设计无需考虑跨应用（`app_id`）的多租户隔离。

---

*本文档基于与 Even 的对话整理，Claude 辅助生成。Ocean Platform · 2026-06-12*
