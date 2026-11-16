# iOS 第三阶段：受控 Agent 理解

日期：2026-09-08。父基线：Product PRD v1.0 §7、§10、§13、§15、§18；子需求：Companion Validation PRD 的 First executable vertical slice。

## 实现边界

- 首个真实模型路径使用 Apple Foundation Models，在支持 Apple Intelligence 且支持简体中文的设备上进行设备端推理。
- 使用 Guided Generation 生成结构化的 `reminder / unsupported` Intent、事项、精确时间、缺失字段和简短解释。
- 模型只负责理解。它不能调用 EventKit，也不能决定自己的权限。运行时只开放 Reminder 能力，并把当前验证策略固定为 `L2 · Confirm`。
- 运行时根据模型结果生成并持久化 Understand、Confirm、Tool Call、Verify 计划；核对弹窗和 Activity 均可查看计划与理解来源。
- 缺少准确时间或事项时进入 Need Information，用户补充后才允许确认。模型不得把“下午”“稍后”等时间段猜成一个精确时间。
- 非提醒请求进入明确的 Unsupported 结果，不显示可执行确认按钮。

## 可靠性

- 单次模型理解最长 15 秒，可由关闭 sheet、新请求或任务取消中止。
- 设备不支持、Apple Intelligence 未开启、模型未准备、中文不支持、超时、拒绝或结构异常时，降级到基础规则并在 UI 标注来源。
- 降级规则能识别明确提醒，也能对“提醒我买两个苹果”等请求要求补充时间；它不冒充通用 AI。
- 旧请求完成后不能修改新任务；执行、验证、Partial 和幂等保护沿用第二阶段实现。

## 云端模型边界

OpenAI 官方要求不要把 API Key 部署到移动 App。当前 iOS 客户端不保存或直接使用 OpenAI Key。未来接入 OpenAI Responses API 时，必须经 OLO 自有后端：后端保存密钥，使用 Structured Outputs 或受控 function calling，客户端只接收经过服务端验证的 Agent Plan。

## 验证

- iOS 27 模拟器共 16 项测试通过：12 项 Reminder/Agent 测试与 4 项语音生命周期回归。
- 新增覆盖：模型缺失时间、用户补充、非提醒拦截、模型失败降级、理解超时。
- Foundation Models 代码已使用 Xcode 27 SDK 编译；模拟器通常会走基础规则，不能证明设备端模型生成质量。

## 真机验收

在已开启 Apple Intelligence 且模型准备完成的兼容 iPhone 上测试：

1. “明天上午九点提醒我开会”应显示来源“设备端模型”、明确事项和时间。
2. “下午提醒我去机场”应显示缺少准确时间，修改 DatePicker 后才出现确认按钮。
3. “提醒我买两个苹果”应要求时间，不应把“两个”解释为两点。
4. “帮我查天气”应显示当前只支持系统提醒，不能到达 ReminderTool。
5. 在 Understanding 阶段关闭或发起新请求，旧结果不能覆盖新任务。
6. 确认后 sheet 关闭；系统提醒只创建一条，Activity 展示执行和验证证据。

## 官方依据

- [Apple Foundation Models framework](https://developer.apple.com/videos/play/wwdc2025/286/)：设备端模型、Guided Generation、可用性检查和错误处理。
- [OpenAI Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create)：结构化 JSON 输出和自定义 function calling。
- [OpenAI API Key 安全](https://help.openai.com/zh-hans-cn/articles/5112595)：移动客户端不得部署 API Key，应通过自有后端调用。
