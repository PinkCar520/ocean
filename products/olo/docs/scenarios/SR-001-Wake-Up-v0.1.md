# SR-001 Wake Up · Executable Prototype v0.1

日期：2026-09-09  
状态：真实 Calendar → 起床计划 → 用户确认 → AlarmKit 系统闹钟闭环；通勤时间仍由用户提供。  
母版：[PRD v1.2](../product/OLO_Product_PRD_v1.2.md) §4、§5、§7、§12、§15–16。
授权来源：产品负责人明确要求先开发 SR-001，并于本次要求“开发吧”。此前 SR-003 为架构压力测试，不代表开发顺序。

## 用户目标与范围

以最低打扰帮助用户从 Sleeping / 未确认醒来进入 Awake。初期仅以用户点击“我醒了”作为明确回应，不能把提示已显示、时间已到或没有响应当作已醒。到达 Awake 后停止唤醒，并显示等待 SR-002；不宣称已经 Ready。

主入口：用户在 Home 长按 OLO 实体并说出任务。iPhone 使用真实设备端语音识别；识别为起床规划意图后自动读取未来七天第一项非全天日程，并打开计划核对。用户检查晨间准备和通勤时间，确认后请求 AlarmKit 权限、创建系统闹钟，并通过闹钟标识核验结果。设置页保留手动入口用于开发验证。不会读取 HealthKit、控制灯光或自动修改日程。

Apple Watch MVP 的长按与轻触均调用 watchOS 系统听写，取得真实识别文本后判断起床意图。iPhone 与 Watch 不建立两套起床任务：OLO 只维护一个 `WakeSessionRecord` 和一个系统闹钟标识。iPhone 作为当前 AlarmKit 执行端，Watch 是同一会话的触觉、状态与回应端。跨设备同步完成前，Watch 只能显示“正在交给 iPhone 核对”，不能显示闹钟已创建。

Apple 自带的睡眠时间表 / 下一次起床闹钟在 iPhone 与 Apple Watch 间属于同一套系统睡眠体验；普通 Clock 闹钟则与睡眠时间表分开。OLO 的第三方实现不假设可以写入 Apple 的睡眠时间表，也不假设 AlarmKit 闹钟会自动变成 Watch 睡眠闹钟。若未来 Apple 提供公开写入或跨平台 AlarmKit 能力，再替换执行适配器，`WakeSessionRecord` 语义保持不变。

## 当前计算规则

使用日程的真实开始日期和当前系统时区：起床时间 = 日程开始 − 10 分钟到达缓冲 − 用户输入通勤时间 − 用户输入晨间准备时间。若结果已过去，不能创建闹钟。

当前通勤时间由用户填写，不声称已接入实时交通。Wake Window、睡眠阶段判断和动态交通重规划留待后续真实数据接入。

Calendar 访问被拒绝、未来七天没有适用日程、计划时间已过去、AlarmKit 授权被拒绝或闹钟无法核验时，都显示真实错误，不显示成功。

## 执行契约

| 条件 / 输入 | 行为 |
| --- | --- |
| 点击读取下一项日程 | 按需请求 Calendar 完整访问，再读取最近的非全天安排 |
| 修改准备 / 通勤 | 立即重算计划，不产生系统副作用 |
| 点击确认 | 按需请求 AlarmKit 权限，并提交当前计划 |
| AlarmKit 返回闹钟 | 再从系统闹钟列表核对同一 UUID，成功后才显示完成 |
| App 回到前台 | 重新读取持久化会话并与 AlarmKit 当前状态核对 |
| 用户在系统闹钟中停止 | 记录 `stopped`；仍等待用户明确点击“我醒了” |
| 点击“我醒了” | 取消仍存在的系统闹钟并记录 `awakeConfirmed` |
| 点击取消 | 取消并核验系统闹钟，再记录 `cancelled` |
| 权限拒绝 / 时间已过 / 调度失败 | 显示失败原因，允许修正后重试，不伪造完成 |

窗口、升级间隔和记录上限为原型策略。既无自动传感器，也无临床睡眠判断；“保持安静”仅在当前输入假设下针对计划可行性成立。

## 最小技术架构

- `Core/Wake/WakePlan`：平台无关的反向时间计算。
- `Services/WakeCalendarService`：EventKit 权限、查询和错误边界。
- `Services/WakeAlarmService`：AlarmKit 授权、调度、停止 App Intent、取消和结果核验。
- `Services/WakeRecordStore`：单一会话的原子 JSON 持久化。
- `App/WakePlannerController`：MainActor 管理可编辑计划和执行状态。
- `Features/Wake/WakePlannerView`：展示真实日程与确认界面，不直接调用系统框架。

本次不把纯计算注册成有现实副作用的 Tool。未来若接闹钟、通知、Home 或语音输出，必须通过现有 Tool / Trust / Verification 边界，并重新定义平台能力和生命周期。

## 持久化与生命周期

保存单一 `Application Support/OLO/sr-001-wake-session.json`，内容包括日程快照、计算参数、系统闹钟 UUID 和生命周期状态。写入采用原子替换；不会写入长期 Routine Memory。

生命周期为 `scheduled → alerting → stopped → awakeConfirmed`，也可由活动状态进入 `cancelled`。系统闹钟创建成功而本地记录失败时，必须补偿取消；系统中找不到闹钟时显示失败，不能推断用户已醒。读取或写入失败均显示真实错误；终态重复输入无副作用。

## 验收

[实现与测试记录](../engineering/SR-001-IMPLEMENTATION.md)记录实际执行的测试及未完成项。iPhone 纵向闭环完成后，下一验证层是 Apple Watch 作为 OLO One MVP 身体的触觉反馈与明确回应；Watch 端能力仍需真表运行证据，不在本规范中假装完成。
