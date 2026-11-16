# OLO Scenario Specification

状态：已认可的体验方向 / 场景工作规范，未完成工程验证  
日期：2026-09-09  
母版：[PRD v1.1](../product/OLO_Product_PRD_v1.1.md)  
来源：[讨论摘录](../research/2026-09-09-foundation-discussion.md)。场景中的设备与第三方服务均需另行验证可用性。

## 场景组织原则

围绕人的状态变化组织需求，记录“发生什么 → 可感知什么 → 推断什么 → 是否介入 → 哪个身体找人 → 什么权限 → 什么结果”。用户目标是少操心；不以功能入口数量或主动播报次数衡量价值。

每个场景至少记录 Human Goal、Current Friction、OLO Goal、Context / Evidence、Decision、Intervention / Body、Actions、Human Confirmation、Success / Failure 与开放问题。下面为原讨论的结构化摘要；新增的失败检查是待验证条件。

## SR-001 · Wake Up

- **状态 / Human Goal**：Sleeping → Waking / Awake，为后续 Ready 保留足够时间，同时尽量充分休息。
- **Current Friction**：人自己检查日程、天气、交通并决定起床时间。
- **OLO Goal / Context**：结合日程、通勤、准备时长、睡眠与授权反推 Wake Window；信号缺失时不能假装知道用户仍在睡。
- **Decision / Intervention**：安全窗口内保持安静；必要时按环境、Ambient、简短语音逐步介入。用户已醒则停止唤醒。
- **Body / Actions / Confirmation**：One 提供空间 Presence；Watch 可提供身体信号与轻反馈；Home 环境动作仅在授权范围内。改变日程或冲突目标需要人决定。
- **Success**：有证据表明用户进入 Awake，且交互成本低；“闹钟已响”不能替代成功。
- **Failure / Open**：未响应、交通变化、用户要求多睡、信号过期。原讨论时间算例不一致，见 [v0.2 校核](../context/OLO-Context-Model-v0.2.md)。SR-001 仅完成设计推演。

## SR-002 · Morning Ready

- **状态 / Human Goal**：Awake → Ready，在需要的时间自然完成洗漱、早餐、穿衣、收拾。
- **Current Friction**：人反复检查时间、排序日常事务、找东西并操作家庭设备。
- **OLO Goal / Context**：结合空间、日程、天气、家庭状态与 Routine 动态调整准备计划；不用细粒度监视播报制造负担。
- **Decision / Intervention**：普通进展保持安静；接近目标风险时简短提示。缺失物品与活动属于可纠正推断。
- **Body / Actions / Confirmation**：One / Home 做已授权环境准备；必要信息通过合适身体出现。热水等现实设备按具体风险策略判断，不因属于家庭场景就自动授权。
- **Success**：进入 Ready，减少反复查看和手动协调。
- **Failure / Open**：准备延迟、多人同处、临时在家工作；单次异常不写成长期习惯。具体识别准确度与 Ready 证据待验证。

## SR-003 · Leaving / Cybercab

- **状态 / Human Goal**：Ready → Leaving → In Transit，以低协调成本按目标出发。
- **Current Friction**：查车、选时间、等车、检查家中设备并切换终端。
- **OLO Goal / Context**：结合目的地、到达目标、准备状态、车辆与家庭状态规划出发。
- **Decision / Intervention / Actions**：区分准备、询问和获授权叫车；以真实离家证据推进 Home 状态与跨身体接力。
- **Confirmation / Success**：费用与情境须匹配授权，取消和失败可解释；实际接驾和离家证据不能由“请求已受理”替代。
- **状态**：SR-003 第一轮桌面推演已完成，工程测试尚未执行，详见 [独立 living spec](SR-003-Leaving-Cybercab.md)。

## SR-004 · In Transit

- **状态 / Human Goal**：Leaving → Moving → Arriving，在通勤中获得适合的准备、休息或恢复。
- **Current Friction**：人检查 ETA、路线、下一事项并跨 App 协调。
- **OLO Goal / Context**：结合行程、下个目标、身体与注意力状态判断这一段时间的意义；不默认填满内容。
- **Decision / Intervention**：上车后可以保持安静，仅在有价值或需要决策时介入；休息 / 准备是可纠正假设。
- **Body / Actions / Confirmation**：Vehicle 负责移动；私人信息由个人身体承接；对外消息需要发送授权，导航变化需匹配行动范围。
- **Success**：用户抵达并保有下一情境所需的连续性，减少路线 / 事务检查。
- **Failure / Open**：ETA 突变、身份交接失败、共享车内隐私、离线与目的地变化，尚待压力测试。

## SR-005 · Work

- **状态 / Human Goal**：Ready to Work → Doing → Coordinating → Completing，合适的工作在合适情境找到人。
- **Current Friction**：人从邮件、消息、会议、任务和文档中重建工作模型。
- **OLO Goal / Context**：维护 Goal / Project / People / Documents / Messages / Commitments / Dependencies 之间的关联。
- **Decision / Intervention**：通过 Mac 等身体呈现当下需要的文档或事项；专注时避免重复通知。
- **Actions / Confirmation**：在授权范围内整理和准备；草稿、对外发送与承诺变更分开判断，不能把工作上下文访问权当作发送权。
- **Success**：降低重新寻找和协调成本，以完成结果及承诺状态验证，而非以打开文档作为全部完成。
- **Failure / Open**：权限不足、过时版本、错误人物匹配、冲突承诺和泄露私人上下文；具体连接能力未承诺。

## 验证与变更

后续测试必须分别记录输入证据、预期判断、权限、可观察副作用、用户打扰、恢复行为和实际结果。未执行项标 Pending。SR-003 发现先落到场景与 Context / Runtime / Interaction；稳定产品结论才回写 PRD。
