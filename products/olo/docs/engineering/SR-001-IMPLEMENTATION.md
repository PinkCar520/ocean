# SR-001 implementation · 2026-09-10

实现边界见 [SR-001 v0.1](../scenarios/SR-001-Wake-Up-v0.1.md)。2026-09-10 已撤销无实际作用的前台模拟，改为真实 Calendar → AlarmKit 闭环。

## 使用

1. 在 Home 长按 OLO 约 600ms，允许麦克风和语音识别，并说“根据明天的日程安排我起床”。
2. OLO 识别起床意图后自动打开计划并读取 Calendar；设置页保留手动验证入口。
3. 检查下一项安排，调整晨间准备与通勤时间。
4. 点击“确认并创建系统闹钟”，允许 AlarmKit。
5. 只有系统返回并能按 UUID 核验该闹钟后，页面才显示成功。
6. App 恢复前台时重新核对闹钟；停止闹钟后仍需点击“我醒了”，也可以明确取消计划。

## 工程变更

模拟代码已删除。新增 WakePlan、WakeLifecycle、WakeVoiceIntent、WakePlannerController、WakeCalendarService、WakeAlarmService、WakeRecordStore、WakePlannerView、单元测试与 UI 测试。OLOCenter 持有规划控制器，Home 以长按语音作为真实起床计划入口；Watch 语音入口改用系统听写。提醒事项源代码保持原样。

AlarmKit 现在覆盖创建、UUID 核验、状态恢复、系统停止 App Intent、取消和取消核验。本地只保存一个原子 JSON 会话。创建成功但持久化失败时会补偿取消；AlarmKit 中找不到原 UUID 时显示失败，并明确禁止把它解释为用户已醒。

Home 不再展示 SR-001 功能卡片。长按直接进入与轻触相同的真实 iPhone 麦克风 → 本地语音识别链，起床语句由 `WakeVoiceIntent` 路由到 WakePlanner；其它语句继续进入现有 Agent Runtime。

Watch App 删除了“检测到声音便返回占位文字”的实现。轻触或长按现在打开 watchOS 系统听写，并使用系统返回的真实文字识别起床意图。下一工程切片使用 WatchConnectivity 同步同一个 `WakeSessionRecord`：iPhone 保持唯一 AlarmKit 执行权，Watch 呈现同一状态并回传停止 / 已醒，不在两端创建重复闹钟。

修复真机签名：project.yml 的正常构建恢复 `CODE_SIGNING_ALLOWED/REQUIRED = YES`。无签名检查只通过单次构建命令覆盖。修复后的签名包已校验并成功安装到设备 `00008150-001E29503ED8C01C`；随后设备锁定，新的真机构建需解锁后继续。

重新生成工程前发现 Watch Core 源文件成员只存在于旧 pbxproj；现已回填 project.yml，保证生成不会丢失既有依赖。机器签名配置保留于被 .gitignore 排除的 project.local.yml，主 project.yml 可选包含该文件；不要提交本机配置。共享 scheme 的格式变化由当前 XcodeGen 生成。

## 验证记录

- iPhone 17 Pro / iOS 27.0 模拟器最终回归：**27 项单元测试，0 失败；1 项 UI 测试，0 失败**。结果：`Test-OLO-2026.09.10_16-14-45-+0800.xcresult`。
- 同一模拟器的真实界面流程：启动 App、滚动进入 SR-001、打开起床计划、调用真实 EventKit；在测试日历为空时正确显示“未来七天没有可用于起床规划的日程”。**1 项 UI 测试，0 失败**。结果：`Test-OLO-2026.09.10_15-42-02-+0800.xcresult`。
- 测试覆盖反向时间计算、输入边界、生命周期编码、创建后核验再持久化、重复创建抑制、持久化失败补偿取消、明确取消、明确 Awake、恢复时系统闹钟丢失不推断 Awake，以及既有 Agent / Voice 回归。
- 模拟器没有可由 `simctl` 预授权的 AlarmKit 服务，也没有预置未来 Calendar 事件。因此本轮没有把模拟器中的 Calendar 空结果当作 AlarmKit 实际响铃通过。
- AlarmKit 后台响铃、系统停止 Intent 和 Apple Watch 触觉/回应仍需要真机与真表验收。它们是运行证据缺口，不是模拟完成项。
- 通用 iOS Debug 构建成功，并使用 Apple Development 证书和 `app.olo.OLO` provisioning profile 完成严格签名校验；此前 “No code signature found” 的构建配置问题未复发。
- 通用 watchOS Debug 构建和签名成功。当前 Watch App 仍是独立目标，SR-001 跨设备状态与触觉唤醒尚未实现。

## Shared action protocol update · 2026-09-11

Wake 的 AlarmKit 调度现已接入与 Reminder 共用的受控 Action 协议。用户确认后，iPhone 先固定 action / request 身份并写入本地 Receipt ledger，再调用 AlarmKit；只有 AlarmKit UUID 回读和本地 WakeSessionRecord 保存均成功后，才记录 `verified` 以及 `alarmID`、`systemState`、`wakeDate` 证据。失败路径记录 `rejected` 或 `outcome_unknown`，补偿取消是否核验也进入 evidence，不会把 Control Plane 受理当作闹钟成功。

Control Plane 同步仍是可选、持久、best effort。Actions 页面可查看本地 Receipt、outbox 数量和同步错误，并可手动重试；未设置 `OLO_CONTROL_PLANE_URL` 时保持纯本地能力。

本轮 iPhone 18 Pro / iOS 27.0 模拟器执行 **29 项 OLOTests，0 失败**，新增覆盖 Wake 的 `submitted → accepted → completed → verified` 顺序、provider read-back evidence 和本地 Receipt 重启恢复；Actions 离线 Receipt / Control Plane 状态入口 UI 测试通过。严格并发 iOS Simulator 与 watchOS Simulator 构建通过；AlarmKit 真机响铃、后台停止 Intent 与 Watch 真表交互仍未在本轮验证。

[本次变更记录](../changes/2026-09-10-sr001-lifecycle.md)列出本轮代码、配置与文档范围。既有未提交 / 已暂存工作保留，没有新增 Git 提交或暂存操作。
