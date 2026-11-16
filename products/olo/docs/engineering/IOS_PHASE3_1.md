# iOS 第三阶段 3.1：多轮澄清与通用 Agent Runtime

日期：2026-09-08。父基线：Product PRD v1.0 §4、§7；前置实现：[`IOS_PHASE3.md`](IOS_PHASE3.md)。

## 用户行为

- 信息不足的请求停留在同一个 Agent Task。例如“下午提醒我去机场”进入 Need Information，OLO 询问“你希望几点提醒？”。
- 用户回答“三点半”后，运行时将回答与原始意图合并，保留原任务 ID 和原始请求，再进入确认。
- 用户仍可在核对界面直接编辑事项和日期。澄清回答和字段编辑都是同一任务的补充方式。
- 新请求、取消和旧异步结果不能覆盖当前任务；完成前不会创建系统提醒。

## 运行时边界

`ControlledAgentRuntime` 统一拥有任务生命周期：

1. Understanding 只产生受约束的结构化解释。
2. Runtime 根据解释选择已注册的 Tool。
3. `ToolRegistry` 只返回应用显式注册的能力；当前只注册 ReminderTool。
4. `TrustPolicy` 根据 Tool 声明的权限级别返回 Run、Confirm 或 Deny。当前 ReminderTool 为 Execute，因此必须确认。
5. Tool 执行真实操作并返回 receipt。
6. Runtime 进入独立 Verification 状态，由 `VerifiableTool` 读回核对结果后才显示 Completed。
7. 每次状态、计划和失败信息写入 Agent Task 历史。

模型不能注册工具、修改权限等级、绕过确认或直接调用 EventKit。新增能力必须先实现 Tool、验证行为和风险声明，再由组合层注册。

## 设备端模型

Apple Foundation Models 仍是兼容设备上的首选理解器，基础规则作为可见降级路径。国内设备当前可能因 Apple Intelligence 不可用而持续降级；这不改变架构，也不引入客户端云端密钥。

## 验收

- “下午提醒我去机场” → “三点半”后，事项保持“去机场”，时间为 15:30，任务 ID 不变。
- 澄清仍不完整时继续 Need Information，不显示确认按钮。
- 只有注册工具可以执行，ReminderTool 必须经过 Trust Policy 确认。
- 取消、重复确认、权限拒绝、验证失败和历史保存失败保持第二阶段的保护行为。
