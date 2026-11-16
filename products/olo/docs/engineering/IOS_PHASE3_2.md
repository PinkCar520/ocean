# iOS 第三阶段 3.2：语音澄清闭环

日期：2026-09-08。父基线：Product PRD v1.0 §4、§7；前置实现：[`IOS_PHASE3_1.md`](IOS_PHASE3_1.md)。

## 用户行为

- Agent Task 处于 Need Information 时，核对 sheet 显示 OLO 的具体问题，并同时提供文字和语音回答。
- 用户轻触麦克风回答后，实时转写显示在当前 sheet；最终文本通过 `provideInformation` 合并到当前任务。
- 澄清不会创建新的 Agent Task。记录保留原始请求、OLO 的问题、用户回答、输入来源和合并后的计划。
- 补充完整后进入 Waiting for Permission，仍需用户确认才执行 ReminderTool。

## 生命周期要求

- 语音澄清复用已验证的 `VoiceService`，开始捕获前独立检查麦克风和语音识别权限。
- 用户停止、关闭 sheet、识别取消、权限拒绝、超时、音频故障或空结果时停止语音会话。
- 失败不会取消 Agent Task，也不会清除已有事项；任务继续停留在 Need Information，允许文字输入或再次语音回答。
- 关闭 sheet 时取消所属语音任务，旧识别结果不能提交到后来打开的任务。

## 记录

`AgentTask.clarifications` 保存每轮 `question / answer / source / createdAt`，并随任务写入 SwiftData。Activity 在当前任务和历史任务中展示这些记录。

## 验收

1. 输入“下午提醒我去机场”，等待 OLO 询问时间。
2. 点击麦克风回答“三点半”，看到实时或最终转写。
3. 任务 ID 不变，事项为“去机场”，时间为 15:30，并进入确认。
4. Activity 显示“OLO：你希望几点提醒？”和“你：三点半”。
5. 拒绝权限、没听清、主动停止和超时均不创建提醒，仍可继续回答。
