# SR-003 · Leaving / Cybercab Stress Test

状态：**Living spec / 第一轮桌面推演已记录，工程测试未执行，未定稿**  
日期：2026-09-09  
母版：[PRD v1.1](../product/OLO_Product_PRD_v1.1.md)  
输入：[Context Model v0.2](../context/OLO-Context-Model-v0.2.md) · [Scenario Specification](OLO-Scenario-Specification.md)

## 目标与假设

验证 OLO 能否从“理解准备出门”推进到有权限、可验证、可恢复的现实行动。Cybercab 是 Mobility Capability 的场景代称；这里不声称已开放调度 API、不引用未验证的部署新闻，也不承诺 OLO 已接入。

Human Goal：按到达目标出行，减少手动叫车、等车和家庭收尾协调。前提包括可用且有效的日程、目的地、准备状态、出发证据、费用 / ETA、用户政策与能力状态；缺失项必须保留为未知。

## 候选主链

Leaving hypothesis → 目的地 / 到达目标 → Plan → Permission / Risk → 准备或请求车辆 → 结果证据 → 车辆接近 → Home Pre-Away → 合适身体通知 → 实际离家 → Home Away → 身份与 Context 最小化交接 → In Transit。

此链为待测设计，不能把预测离家当作真实离家。Pre-Away 的动作范围、回滚条件和共享家庭占用规则均待定义。

## 压力测试矩阵

T01–T09 已完成第一轮文档级桌面推演，逐步输入、轨迹和缺口见 [Desktop Stress Test 01](SR-003-Desktop-Stress-Test-01.md)。以下为原测试设计；所有软件 / 真实服务验证仍为 **Pending**，没有工程通过结论。

| ID | 输入 / 攻击 | 预期检查 | 需要的证据 |
| --- | --- | --- | --- |
| T01 | 授权通勤、目的地匹配、车辆可用 | 只执行政策允许的动作，正确接驾与接力 | 政策判断、提供方回执、离家 / 上车结果 |
| T02 | 已叫车后“今天不去了” | 撤销 Intent；确认能否取消、是否收费；恢复家庭准备状态 | 取消结果、费用结论、家庭实际状态；不能宣称所有副作用可撤回 |
| T03 | 无车可用 | 原计划失效；查询替代方案并重新判断权限 | 失败回执、候选费用 / ETA、是否需人决定；不自动继承原供应商权限 |
| T04 | Leaving confidence 仅为示例 0.72 | 区分等待、低影响准备和询问，不能直接认作用户已决定出行 | 证据、准备副作用、介入理由；0.72 不是阈值 |
| T05 | 通勤预授权但今天去机场 / 超预算 | 授权范围不匹配时停止提交并请求相应决定 | 目的 / 地点 / 费用匹配结果 |
| T06 | 调度超时、重复回调、断网 | 结果未知时核对已有请求，防止重复下单 | 请求身份、提供方状态查询；机制尚待 Runtime 定义 |
| T07 | 用户尚未离家或家中还有其他人 | 不把 Pre-Away 当 Away，不误关闭共享必需设备 | 真实占用证据、动作范围及失败恢复 |
| T08 | 车辆身份不符 / Watch 不在线 | 不错误交接身份或重复跨身体打扰 | 身份验证、最小共享 Context、可用身体选择 |
| T09 | 等待期间撤销授权或证据过期 | 提交前重新判断；已执行部分进入恢复 | 授权 / 证据版本、行动状态与撤销处理 |

## Policy 示例：非最终 Schema

工作日上班自动叫车，可讨论 capability=request_mobility、purpose=work_commute、destination=usual_workplace、time=weekday_morning、maxCost=¥100、confidenceThreshold=0.95、autoExecute=true。以上金额和概率只是源讨论示例，不能作为默认授权或生产值。有效期、撤销、费用变化、供应商范围与授权凭据尚待定义。

## 尚未定稿的输出

- [Runtime](../runtime/OLO-Agent-Runtime.md)：Prepare / Commit / Act、取消、补偿、部分失败与未知结果。
- Context 候选 v0.3：是否需 Reservation、Action 生命周期、权限版本或交接对象；不先扩充实体表。
- [Ambient Display](../interaction/OLO-Ambient-Display.md)：考虑中、确认、车辆接近、失败与恢复等实际状态如何表达；不先硬套 L0–L4。

完成条件：为每行建立一致输入并执行桌面推演或原型测试，记录方法与真实结果、失败 / 未解决项，评审后才形成模型修订。当前桌面推演已发现契约缺口，尚无工程通过结论。
