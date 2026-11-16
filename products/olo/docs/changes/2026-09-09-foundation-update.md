# Foundation documentation update · 2026-09-09

状态：文档整理记录；仅更新 Markdown 与审阅材料，无代码修改。

## 原文保留与拟修改文件

冻结 [PRD v1.0](../product/OLO_Product_PRD_v1.0.md)保持原文。修改前 `AGENTS.md`、`docs/README.md`、`docs/product/DECISIONS.md` 快照保存在本目录 `2026-09-09-before/`，便于与本次结果比较。所有既有代码改动保持原状，不提交或暂存。

修改：`AGENTS.md` 的当前 PRD 链接；`docs/README.md` 的索引与版本规则；`docs/product/DECISIONS.md` 追加本次决定（历史正文保留）。新增：根 README、完整 PRD v1.1、Scenario Specification、SR-003、Context Architecture、Context v0.2、Runtime、Ambient Display、讨论摘录及本变更材料。

[逐文件 patch](2026-09-09-foundation-update.patch)记录主变更。它不包含本变更记录自身与修改前快照，以避免自引用。另见 [v1.0 → v1.1 对比](2026-09-09-prd-v1.0-to-v1.1.diff)。

## 内容拆分映射

| 原位置 / 讨论 | 新落点 | 处理 |
| --- | --- | --- |
| v1.0 产品定义、原则、Loop、指标 | PRD v1.1 §0–4、§16、§21 | 明确 Human Pull → World Push、OLO / One 分层与少操心 |
| v1.0 Golden Path + SR-001–005 | Scenario Specification、独立 SR-003 | 保留显式机场路径，增加人的状态变化视角 |
| v1.0 §13 + Foundation 01 / 02 | Context Architecture / Model v0.2 | 产品对象清单与系统语义分开；PRD 保留概要 |
| v1.0 §7 + Prepare / Commit / Act | Runtime living spec | 原型状态与执行契约区分，不宣称完整状态机 |
| v1.0 §6 + Display 讨论 | Ambient Display living spec | 保留外观；L0–L4 未定义 |
| 9 月 8 日 approved 外观决定 | v1.1 §6、§18 | 50 × 12.7 mm 目标取代早期 50 × 12 mm，工程仍待验证 |
| Hardware、Companion、VISION、工程资料 | 原路径不变 | 历史父版本关系保留，由索引明确 v1.1 优先 |

## 质量与限制

检查本次新增 / 修改的 Markdown 相对链接、冻结 v1.0 哈希、决策原文前缀、改动文件范围，并对既有非文档改动做内容哈希比较。未运行编译或设备测试，因为本次没有代码变更；SR-003 也未执行。

SR-001 的原始时间推演不一致，已在 Context v0.2 明确列出算术校核；原文留在研究摘录，置信度 / 金额 / 时间均非生产阈值。第三方 API 和部署信息未在本轮验证，也不作为已接入能力写入规范。

尚未发布 Context v0.3、最终 Runtime、L0–L4 分级、系统部署架构或 Capability 协议。下一轮从 SR-003 的 Pending 矩阵开始。
