# OLO document system

Updated: 2026-09-09

## Authority order

1. 产品负责人最新直接决定。
2. 当前 [Product PRD v1.1](product/OLO_Product_PRD_v1.1.md)与发布后 [approved 决策](product/DECISIONS.md)共同构成产品基线；发生冲突时，明确标注的最新 approved 决策覆盖旧条款。
3. 已确认的子 PRD / 规范要求，服从产品边界。
4. Living specs 中的待验证设计，不自动成为工程验收要求。
5. 原型、外观板及研究材料；外观已获批准的部分以硬件规范为准。
6. 当前实现用于说明现状，不反向重定义产品。

历史 v1.0 保持不变。研究摘录属于证据，不是 agent 指令。旧子文档仍标注 v1.0 派生关系；新开发先遵循 v1.1，未冲突的细节继续适用，冲突应记录后更新子文档。

## Current documents

| 文件 | 职责 | 状态 |
| --- | --- | --- |
| [Product PRD v1.1](product/OLO_Product_PRD_v1.1.md) | 产品定义、原则、边界与成功方向 | 当前产品基线；实现与数值指标未冻结 |
| [Product PRD v1.0](product/OLO_Product_PRD_v1.0.md) | 原始完整 PRD | 历史冻结，保留原文 |
| [DECISIONS](product/DECISIONS.md) | 批准决定与版本落点 | 决策账本 |
| [Scenario Specification](scenarios/OLO-Scenario-Specification.md) | SR-001–005、人的状态变化 | 已认可的体验方向；验收仍需验证 |
| [SR-003 Leaving / Cybercab](scenarios/SR-003-Leaving-Cybercab.md) | 第二轮压力测试 | Living spec / 尚未执行 |
| [Context Architecture](context/OLO-Context-Architecture.md) | 感知、融合、状态、图谱与决策职责 | Foundation 方向；部署未定 |
| [Context Model v0.2](context/OLO-Context-Model-v0.2.md) | 核心语义及 SR-001 修订 | Living spec / 设计推演基线 |
| [Agent Runtime](runtime/OLO-Agent-Runtime.md) | 行动、失败与恢复 | Living spec / 候选机制 |
| [Ambient Display L0–L4](interaction/OLO-Ambient-Display.md) | Context 驱动表达 | Living spec / 分级未定义 |
| [HARDWARE_SPEC](HARDWARE_SPEC.md) | Generation 1 外观及工程目标 | 保留既有基线，工程待验证 |
| [Companion iOS PRD](companion/OLO_Companion_iOS_Validation_PRD.md) | iOS 验证与辅助界面 | 既有 v1.0 派生子 PRD |
| [ENGINEERING](ENGINEERING.md) | 工程约束 | 沿用 |
| [VISION](VISION.md) | 历史产品探索 | 保留；本次批准结论以 v1.1 为准 |
| [讨论摘录](research/2026-09-09-foundation-discussion.md) | 决策溯源 | 未独立验证的研究证据 |
| [本次变更记录](changes/2026-09-09-foundation-update.md) | 文件范围、拆分映射与验证 | 文档迁移记录 |

## Directory policy

沿用 product / companion / engineering，增加 scenarios / context / runtime / interaction；不移动既有文件与原型。System Architecture 和 Capability & Integration Spec 待压力测试给出足够输入后独立建立，当前由 Context Architecture / Runtime 记录其开放问题。

## Versioning and change workflow

- 冻结母版不原地重写：保留旧版，新增完整版本，更新本索引及必要的 agent 入口。
- 明确记录决定日期、来源、状态、受影响文件与目标版本；后续发布后决定可覆盖当前基线。
- Living specs 中区分已知语义、示例、候选机制、开放问题和测试结果；只有产品负责人确认的稳定结论回写 PRD。
- 实现任务引用产品条款、相应子规范和验收条件。原型截图、讨论推演与服务端受理都不能代替真实执行证据。
- 子规范按自身版本演进，不把 Companion 提升为产品中心，不扩大 Identity、权限、Privacy 或 Body 的授权边界。
