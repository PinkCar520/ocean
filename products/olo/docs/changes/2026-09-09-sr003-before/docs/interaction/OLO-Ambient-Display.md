# OLO Ambient Display · L0–L4

状态：**Living spec / L0–L4 待定义，未定稿**  
日期：2026-09-09  
母版：[PRD v1.1](../product/OLO_Product_PRD_v1.1.md)  
既有基线：[Generation 1 Hardware](../HARDWARE_SPEC.md)

## 已确认边界

Generation 1 保留克制的 Display / Presence Surface，并保留既有外观与 v16 视觉参考。Display 由 Context 驱动，表达 Presence、Agent State、Confirmation、Recovery，以及此刻真正必要的 Contextual Information。复杂编辑、详细计划和管理交给合适的 Companion 身体。

“无传统通用屏幕 UI”不等于禁止像素或一切文字。现有 Listening / Thinking / Acting / Done 属原型状态语义，不等于 L0–L4。屏幕技术、亮度、活跃面积、常亮策略与功耗仍需工程验证。

## 输入与待测试表达

Context + Action state + Intervention decision → Presentation。显示本身不能决定行动已获授权或成功。

| 场景状态 | 源讨论示例 / 待测方向 | 边界 |
| --- | --- | --- |
| 正在考虑，没有行动 | 可以保持安静 | 不能误显示已叫车 |
| 需要用户确认 | 车约 6 分钟到 / Call? | 时长仅示例，确认范围需清晰 |
| 已调度、车辆接近 | Arriving · 4 min | 依赖有效提供方证据，ETA 过期不能当实时 |
| 无车 / Action Failed | No cars / 查询替代 | 不把失败隐藏为持续成功动画 |
| 需要人选择替代 | Taxi · ¥82 · 7 min / Confirm | 金额与时长是示例，不能自动继承权限 |
| Privacy / Offline | 清楚表达实际状态 | 不把不可感知误装成正在观察 |

## L0–L4 开放问题

尚未指定每一级名称、信息密度、亮度、动画、持续时长、升级 / 降级规则，亦未映射 Confidence / Risk / Action state。不要用五个看似完整的占位等级冒充交互标准。

待 SR-003 产生真实所需状态后，再评审：哪些无需表达；哪些用灯、文字、声音或触觉；哪个身体最合适；多身体如何避免重复；撤销、失败与恢复如何区分；哪些情况需可访问的替代反馈。

验收需检查可理解性、误读率、打扰成本、隐私可感知性与跨身体一致性，阈值和测试样本未定。本文不改变原型动画或硬件状态代码。
