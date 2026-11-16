# OLO Context Model v0.3 · Candidate delta

状态：**Living spec / 候选差异，未批准、未发布为当前模型**  
日期：2026-09-09  
基线：[v0.2](OLO-Context-Model-v0.2.md)，原文保持不变。  
依据：[SR-003 桌面推演](../scenarios/SR-003-Desktop-Stress-Test-01.md)。本文是差异提案，不是完整替代 Schema。

## 保留

14 entities + Context / Plan；Constraint、Observation 时效、Intent 冲突、Plan 时间窗口全部保留。Reservation、InterventionPlan、Handoff 暂不提升为核心实体，先作为执行记录和关系验证。

## 候选语义扩展

| 对象 | 提议增加 / 明确的语义 | 证据 |
| --- | --- | --- |
| Intent | revision、revokedAt；撤销仅改变目标有效性，不清除 Action | T02、T09 |
| Plan | revision、dependsOn、适用的目标 / 证据版本、失效原因、逐步完成条件 | T01、T03、T05 |
| Action | 稳定逻辑 requestId、providerRef、关联 Plan revision、完成证据、结果未知、实际副作用 | T01、T06 |
| Action 关系 | cancellationOf / compensates 指向原动作，保留原结果与残余费用 | T02、T07 |
| Permission | policy revision、目的 / 对象 / 提供方 / 费用范围、有效期、撤销；一次确认绑定具体提案 | T04、T05、T09 |
| Observation / Event | source event identity、来源时间与接收时间、顺序信息（若可用），支持重复与乱序核对 | T06 |
| Capability | 查询、幂等保证及作用域、取消限制、报价与费用条款、副作用声明 | T04、T06 |
| State / Context | Person mobility、Home occupancy、departure preparation 分维度与作用域；Unknown 显式保留 | T07 |

这些为概念字段建议，不意味着数据库列、枚举或供应商能力已经存在。提供方不具备的保证必须保留为 unavailable / unknown，不能由本地命名“补齐”。

## 待检验的不变量

1. 新的正向提交必须针对当前目标、有效证据、报价与授权重新判断；已提交请求的晚到回执不能丢弃。
2. 取消是对已有现实状态的处理；原动作的历史成功不能被改写成从未执行。
3. 无确定结果时不自动建立替代行程；有幂等保证也仅在其明确范围内使用。
4. 每个 Done 绑定一个明确完成目标与证据；请求受理不是到达办公室。
5. 家庭环境动作按共享空间权限与占用判断；一人的离家不定义全屋状态。
6. 一次确认仅适用于所展示的提案；跨身体投递与确认都关联同一提案版本。

## 未解决与晋级门槛

费用取消的权限体验、断网期间的撤销保证、证据冲突解决、保留期限、跨设备确认重放、车内身份协议、无可用身体时的升级均待进一步设计。需要含重复 / 乱序 / 崩溃恢复的可重放测试、真实能力限制清单和产品评审，才能形成下一版本的完整模型。
