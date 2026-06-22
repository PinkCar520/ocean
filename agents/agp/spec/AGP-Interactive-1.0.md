# AGP Interactive — Agent Governance Protocol (Interactive Extension)
## 智能体治理协议：阻断式人机交互扩展规范

**版本**: 1.0 Draft  
**状态**: Proposed Standard（提议中）  
**提出方**: pinkcar  
**创建日期**: 2026-06-22  
**从属规范**: AGP-1.0  
**参考生态**: Claude `ask_user_input_v0` / Generative UI Protocol

---

## 摘要 (Abstract)

在企业级 AI 工作流中，大部分的界面交互属于“推流式/只读展示型”（如输出图表、流水线状态）。然而，在面对高复杂度的业务决策、高危操作拦截、以及意图缺失澄清时，Agent 必须具备**“阻断自身运行，将决策权安全移交用户”**的能力。

**AGP Interactive** 是 Agent Governance Protocol (AGP) 的核心交互扩展子协议。它确立了系统中“主动阻断式交互”的底层契约，定义了从大模型/MCP 工具触发挂起，到前端组件渲染，再到用户决策回传的标准化生命周期与数据结构。

---

## 一、核心架构与生命周期 (SRIR 模型)

所有基于 AGP Interactive 协议的交互，必须严格遵循以下四个生命周期阶段（**SRIR**）：

1. **Suspend (挂起)**：
   系统内的 Agent 或底层 MCP 工具触发交互工具（如 `agp_intent_clarify` 或跑出特定 Hook 异常）。网关（Gateway）拦截请求，暂停当前 Agent 的执行流（设为 `WaitingForUser` 状态）。
2. **Render (渲染)**：
   网关向前端下发特定的 UI 指令（如 `uiType: 'inquiry_card'`）。前端接管界面，渲染表单、单选/复选框或审批卡片，阻断聊天流。
3. **Inject (回传注入)**：
   用户在前端完成填写或点击“同意/拒绝”。前端**不调用特殊的确认 API**，而是将选择结果直接转化为标准的 User Message 格式（例如 `Q: 目标受众\nA: C端用户`）注入当前上下文中发送给网关。
4. **Resume (唤醒)**：
   网关收到用户的决定后，重新唤醒 Agent。Agent 读取到用户的明确回复，基于最新意图继续推进工作流。

---

## 二、标准化协议族 (Protocol Family)

目前 v1.0 版本共收敛为两大核心协议子类：

### 2.1 意图澄清与表单收集 (`agp_intent_clarify`)

专用于主动收集用户偏好、目标和复杂约束。

**数据结构规范：**
```typescript
{
  skillName: string;         // 触发该卡片的技能来源
  description?: string;      // 给用户的补充说明（可为空）
  inquiries: Array<{
    id: string;              // 题目唯一 ID
    header: string;          // 【强制】用于最终聊天记录的精简短标签（< 12字符，如"文档用途"）
    question: string;        // 【强制】完整的提问语句
    type: 'single_select' | 'multi_select' | 'text'; // 交互类型
    options?: string[];      // 互斥或复选的选项数组（强制建议 2-4 个）
  }>
}
```

**交互设计铁律：**
1. **克制发问**：每次下发最多允许 3 题，优先推荐只问 1 题。
2. **拒绝联动**：前端不承载 `dependsOn` 等逻辑级联，任何联动的提问需交由大模型拆分成多轮对话实现。
3. **猜你所想**：大模型应尽可能将主观题转换为 `enum` 猜测，提供选项供用户快捷点击。

### 2.2 阻断式操作审批 (`agp_approval`)

专用于高风险指令拦截（例如 `local_bash`, `local_file_edit` 及其它需要强管控的 MCP 工具）。

**数据结构规范：**
```typescript
{
  requestId: string;         // 审批流水号
  toolName: string;          // 尝试执行的高危工具名 (如 'local_bash')
  description: string;       // 要执行的指令摘要或副作用警告
  args: Record<string, any>; // 工具的原始执行参数
}
```
**交互约定**：
用户可选择直接“拒绝”，或在拒绝时附加指导语句（如：“改为只读模式运行”）。Agent 被唤醒后应读取该指导语句并修正其执行规划。

---

## 三、扩展与演进路线 (Extensibility)

未来 AGP Interactive 协议将在不破坏 SRIR 闭环的前提下扩展以下高阶能力：

1. **可视化方案选项 (Preview Format)**：在 `options` 中引入 HTML/Markdown 渲染。允许 Agent 提供 3 套 UI 或代码方案，前端直接渲染出对应效果卡片，供用户“看图点菜”。
2. **选项外溢输入 (Allow Other)**：允许在单选/多选题中增加 `allowOther: boolean`，前端自动附加文本框兜底 Agent 未能预料的用户真实需求。
3. **MCP 主动 Hook (STATUS_NEED_AGP_INPUT)**：外部的第三方 MCP 工具若缺少执行参数或需确认高危行为，可向 Gateway 抛出特定系统状态码，由 Gateway 自动拉起交互卡片，真正实现跨工具的无缝人机协作。
