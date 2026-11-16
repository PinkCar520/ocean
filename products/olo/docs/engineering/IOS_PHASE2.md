# iOS 第二阶段：提醒 Agent 闭环

日期：2026-09-08。父基线：Product PRD v1.0 §7、§10、§13、§15；子需求：Companion Validation PRD 的 First executable vertical slice。

## 实现

- App 层 ReminderAgent 独立拥有任务生命周期，页面只绑定输入和提交用户动作。实体动画不再决定任务是否完成。
- Core 保留任务、规则解析和执行/存储契约；EventKit 由 Services 适配；SwiftData 由 Repository 适配。
- 接收、理解、规划、补充信息、确认、执行、验证与终态写入同一个任务记录。页面切换不取消已确认的执行。
- 确认表单展示原始请求，支持编辑事项和未来日期；无法解析时明确要求补充信息，不假装已理解。
- 核对提醒与新请求输入均使用系统 sheet、Form 与导航 toolbar；顶部左侧为取消图标、右侧为确认或发送图标。依赖 iOS 26 的原生 Liquid Glass 呈现，不覆盖自定义 sheet 背景或绘制内嵌材料卡片。
- 用户点击核对提醒的确认图标后立即关闭 sheet；Agent 在后台继续执行和验证，首页呈现当前状态，结果写入 Activity。
- 支持今天/明天/后天、中文或数字时分、半点、上午/下午等限定语。过去时间、重复时间、周期与相对时间暂要求手动填写；不是通用大模型理解。
- 保留当前验证阶段的人工确认，不重新定义整个产品的 Trust Policy。
- 授权后再次检查取消与任务身份，确认按钮同步锁定执行。相同当前请求不能重复执行。
- 保存 EKReminder 和绝对时间 EKAlarm，再读取核对标题、日期和闹钟；保存真实标识作为证据。
- 写入尝试后的错误标记 Partial，提示检查系统提醒，不提供盲目重试；写入前的权限失败允许重新核对后重试。
- 历史保存失败明确展示；写入前历史保存失败阻止执行，写入后失败不会声称没有创建提醒。

## 验证

iOS 27 模拟器：12 项测试通过，包含 8 项解析/Agent 测试与 4 项既有语音生命周期回归。
iPhone 通用设备无签名构建通过；构建工具提示未使用 AppIntents，以及现有 iPad 方向配置警告。
Agent 覆盖中文时间、歧义输入、重复确认、授权取消、拒绝重试、旧回调隔离、验证失败、历史写入失败。
这些测试使用可控的 EventKit 替身，不证明系统权限、真实提醒数据库或通知到时展示已通过真机验收。

用户已反馈上一阶段轻触不再卡死；本阶段未修改录音服务。

## 真机验收

1. 说“明天九点提醒我开会”，核对表单内容，再修改时间并确认。
2. 允许提醒事项权限，检查系统提醒事项中的标题、时间和闹钟；Activity 应显示验证证据。
3. 连续点击确认只能生成一条；确认前取消不能生成提醒。
4. 首次拒绝提醒权限，应显示失败；去系统设置开启后重新核对、确认可以继续。
5. 换到 Activity 查看任务；重启后历史仍可查看。

系统提醒事项的通知设置决定提醒能否实际呈现；OLO 不声称验证了未来通知送达。
本阶段不自动恢复进程终止时的任务，也不自动重放历史；未终结旧记录显示人工核查提示，避免重复创建。
原有 SwiftData 容器的内存降级策略仍待独立审查。

## 官方实现依据

- [SwiftUI 模型数据管理](https://developer.apple.com/documentation/SwiftUI/Managing-model-data-in-your-app)：使用可观察模型作为共享状态来源。
- [提醒事项授权](https://developer.apple.com/documentation/eventkit/ekeventstore/requestfullaccesstoreminders(completion:))：通过 EventKit 请求提醒访问。
- [创建事件与提醒](https://developer.apple.com/documentation/eventkit/creating-events-and-reminders)：保存提醒，并添加 alarm。
