# OLO Product PRD v1.2

**产品类别：** Persistent Personal Agent / Personal Intelligence Layer\
**核心硬件：** OLO One\
**当前阶段：** Product Definition → Prototype Validation\
**当前原型基线：** OLO One v16 · Glass Light Bar\
**验证界面：** iOS Companion Prototype（验证工具，不是产品本体）\
**核心原则：** Human Pull → World Push · One AI · Many Bodies · Reduce Cognitive Load

**版本日期：** 2026-09-10  
**状态：** 当前产品定义基线 v1.2；系统设计与行业动态另见 living specs，未承诺实现。  
**来源：** [v1.1 原文](OLO_Product_PRD_v1.1.md)、[决策记录](DECISIONS.md)与产品负责人授权。  
**阅读入口：** [文档索引](../README.md)。v1.0 与 v1.1 永久保留；本版完整承接其未被新决策取代的要求。

> **OLO 不是一个 App。OLO
> 是一个在现实世界中持续存在、理解、行动和记忆的个人 AI。**

------------------------------------------------------------------------

## 0. Executive Summary

OLO 是持续存在的个人智能体与 Personal Intelligence Layer：理解人与世界的 Context，预判需求，判断何时介入，并在授权范围内协调设备、服务与现实世界，验证结果并按规则学习。

**Human Pull → World Push** 是产品范式：把原本由人承担的寻找信息、判断、跨 App 切换和协调，转交给 OLO；让合适的信息与行动在合适的情境下找到人。主动行为包括保持安静、准备、询问与获授权行动，不能等同于增加通知。

**OLO 与 OLO One 分层。** OLO 负责 Context / Memory / Planning / Intervention / Orchestration / Identity；OLO One 是主要的现实 Physical Presence，负责 Sense / Presence / Ambient Interaction / Privacy。OLO 的身份与任务连续性跨身体存在，用户无需全天携带同一设备。

**One AI · Many Bodies** 与既有 One Identity · Many Bodies 一致：同一个 OLO 根据情境通过 One、iPhone、Watch、AirPods、Mac、Home、Vehicle 等身体感知、交互与执行。它们是角色与能力方向，不代表现阶段已接通。

北极星是 **Reduce Human Cognitive Load（少操心）**。AI 使用时长和完成任务数量不能单独代表成功。iOS Companion 保持验证与辅助窗口定位。


### 0.1 Industry Convergence — The Future Is Becoming Visible

OLO 接受并认可与主流公司的方向重合。这种重合是对未来产品方向的外部验证，不要求 OLO 为了差异化而偏离共同愿景。

> **OLO 并非建立在一个孤立的硬件猜想上。Apple、Meta、Google、Lenovo 与 OpenAI 的最新方向共同验证了 Persistent Personal Agent、Ambient Intelligence 与 One AI, Many Bodies 正在成为下一代个人计算范式。OLO 的任务，是通过具体的人类生活状态和真实行动闭环，让这个未来先成立。**

这一判断不代表上述公司的未发布产品、传闻规格或时间表已经确认，也不把竞品尚未实现的能力定义为 OLO 的必要差异。行业事实、来源状态及后续变化由 [AI Device & Industry Convergence](../research/OLO-AI-Device-Industry-Convergence.md) living spec 持续维护。

------------------------------------------------------------------------

## 1. 产品定义

### 1.1 核心命题

**一个不是手机、不是手表、不是耳机的个人 AI，到底应该怎样被人使用？**

### 1.2 产品定义

**OLO = 持续的个人智能层；OLO One = 主要物理 Presence。**

下面的 Identity / Intelligence / World / Companion 仍是产品职责分解，并非要求所有智能集中在 OLO One 上。软件、云端及设备间的部署方式留给系统架构验证。

  --------------------------------------------------------------------------------------------
  层                      定义                    产品职责
  ----------------------- ----------------------- --------------------------------------------
  OLO Identity            持续存在的"同一个 OLO"  偏好、记忆、权限、信任、关系与跨设备连续性

  OLO Intelligence        理解与行动系统          Observe → Understand → Think → Plan → Act →
                                                  Verify → Remember

  OLO One                 主要物理 Presence            Presence / Intent / Sensing / Ambient
                                                  Feedback

  OLO World               能力网络                将 iPhone、Home、Vehicle、Robot 等作为可调用
                                                  Bodies

  Companion Interfaces    辅助界面                复杂信息、确认、设置、调试、历史回顾；iOS
                                                  为当前验证载体
  --------------------------------------------------------------------------------------------

### 1.3 非目标

-   OLO One 不以替代智能手机所有功能为目标。
-   OLO 不以"更小的手机"或"带摄像头的语音助手"为产品定义。
-   Companion App 不应成为用户完成 OLO 核心任务的必经入口。
-   首版不要求 OLO One 自己拥有大屏、完整 App 生态或复杂 GUI。
-   首版不承诺 Robot、Vehicle、Home
    的全面真实控制；这些能力按路线图逐步接入。

------------------------------------------------------------------------

## 2. 产品原则

- **Human Pull → World Push**：减少人主动寻找和组织服务的需要；明确命令仍是有效输入。
- **Reduce Cognitive Load**：减少无谓操作、重复决定和打扰，同时不遗漏重要事件。
- **One AI · Many Bodies**：跨身体保持身份、Context 和任务连续性；感知许可与行动权限逐域判断。
- **Confidence 不等于 Authority**：推断再确定也不能扩大用户授权；缺失或过期证据不能冒充事实。


  ----------------------------------------------------------------------------------------
  原则                                要求
  ----------------------------------- ----------------------------------------------------
  Presence before UI                  AI
                                      首先作为现实中的存在出现，而不是等待用户打开界面。

  Intent, not Apps                    用户表达目标；系统负责拆解任务和选择能力。

  One Identity, Many Bodies           Identity 不绑定某一设备；不同硬件是能力身体。

  Quiet by Default                    没有足够价值时不打扰。

  Progressive Trust                   风险越高，确认与认证越强。

  Show Why                            重要行动必须可解释、可追溯。

  Physical Privacy                    隐私不仅是软件开关，还必须有用户可感知的物理状态。

  App Second                          屏幕是必要时的辅助窗口，而不是 OLO 的家。
  ----------------------------------------------------------------------------------------

------------------------------------------------------------------------

## 3. 目标用户与 Jobs to Be Done

目标用户画像仍需正式用户研究验证。当前原型阶段假设：早期用户愿意尝试 AI
原生硬件，并希望减少设备切换、重复输入和多 App 编排。

  JTBD                  期望
  --------------------- ----------------------------------
  告诉 OLO 一个目标     不需要自己拆解成多个 App 操作
  让 OLO 理解当前情境   少重复解释时间、地点、日程和偏好
  让 OLO 替我行动       能调用正确的设备/服务并持续执行
  只在必要时问我        低风险自动，高风险确认
  知道 OLO 做了什么     结果可验证、过程可回顾
  控制 OLO 知道什么     Memory 与传感器使用透明、可管理

------------------------------------------------------------------------

## 4. OLO Product Loop

**Presence → Sense → Understand → Anticipate → Decide → Intervene when needed → Orchestrate → Act → Verify → Learn**

这是产品闭环，具体执行顺序、并发与生命周期由 [Agent Runtime living spec](../runtime/OLO-Agent-Runtime.md)验证。SILENT 是合法决策；准备与产生现实影响的行动需要区分。下表保留既有职责，其中 Understand 扩展为 Context 理解和预判，Plan 纳入介入与授权判断。

  -----------------------------------------------------------------------------------------------
  阶段                    系统行为                                 用户体验
  ----------------------- ---------------------------------------- ------------------------------
  Presence                OLO 通过合适 Body 存在于现实环境             无需先打开 App

  Observe                 按权限获取语音、视觉、时间、设备上下文   自然表达或环境触发

  Understand              识别 Intent 与约束                       用户不用逐项配置

  Plan                    生成步骤、选择 Bodies、判断风险          复杂目标转化为可执行计划

  Act                     调用本机、iPhone、服务或其他 Body        任务持续推进

  Verify                  确认动作是否真正完成                     不把"请求成功"冒充"结果成功"

  Remember                按规则沉淀长期有价值信息                 下次更少重复解释
  -----------------------------------------------------------------------------------------------

------------------------------------------------------------------------

## 5. Golden Path 与场景规格

保留“我去机场”作为显式 Intent 验证路径。主动场景按人的状态变化组织：SR-001 Wake Up、SR-002 Morning Ready、SR-003 Leaving、SR-004 In Transit、SR-005 Work，详见 [Scenario Specification](../scenarios/OLO-Scenario-Specification.md)。这些是期望体验与设计推演，不能当作已实现的服务承诺。

### 5.1 我去机场

1.  用户对 OLO One 说："我今天下午去机场。"
2.  OLO One 进入 Listening，并将 Intent 交给 OLO Intelligence。
3.  OLO
    结合可用上下文理解航班、时间、位置等信息；缺失关键条件时再询问用户。
4.  OLO 生成计划，并为每一步选择合适的 Body 或服务。
5.  低风险准备动作可自动执行；叫车、支付、门锁等按 Trust Policy 决定
    Confirm / Authenticate。
6.  若需要复杂视觉确认，OLO 将该步骤 handoff 到 iPhone；若不需要，iPhone
    可以完全不出现。
7.  Vehicle / iPhone / Home 等按能力接力执行。
8.  OLO 验证关键结果，并只在 Need You、Done 或 Worth Knowing
    时主动打扰。
9.  任务结束后生成 Agent Record；仅符合 Memory Policy
    的信息进入长期记忆。

------------------------------------------------------------------------

## 6. OLO One 硬件需求

### 6.1 当前原型基线

> 以下为当前产品设计基线，其中尺寸、重量、内部结构与充电方案仍需工程验证。

  模块          当前需求 / 概念
  ------------- ---------------------------------------------------------
  形态          小型圆润独立 AI 硬件；前部黑色 Glass 区域 + 金属机身
  概念尺寸      50 mm × 12.7 mm（外观目标，工程待验证）
  概念重量      ≈ 78 g（未冻结）
  视觉          前置广角摄像头概念
  语音输入      6-Mic Array 概念
  音频输出      独立 Speaker 概念
  状态反馈      Glass + Light Bar + 摄像头环灯
  物理输入      侧键 + Tap / Hold / Double / Flip
  连接 / 充电   Type-C + 背部磁吸 / 无线充电区域概念
  使用形态      手持 / 穿戴 / 桌面，连接结构待工程验证
  Finish        Moon Silver / Graphite Black / Sand Gold / Forest Green

### 6.2 Physical UX

  动作                 产品语义           当前原型行为
  -------------------- ------------------ --------------------------
  Tap / 侧键单击       开始 / 结束聆听    Listening ↔ Standby
  Hold ≈600ms 后松开   显式唤醒 Agent     进入 Agent
  Double Tap           快速回到安静状态   Standby
  Flip                 物理隐私           Camera / Microphone 暂停
  Hold ≈3s             电源意图           进入电源确认
  3D / 拆解            原型展示工具       非量产用户功能

### 6.3 Hardware State Language

Generation 1 保留 Display / Presence Surface，采用 Context-driven 的克制表达；不采用 App 网格、键盘或复杂信息架构。可表达 Agent 状态、重要行动、确认、恢复与此刻必要的信息。以下为原型语义；[Ambient Display L0–L4](../interaction/OLO-Ambient-Display.md)的分级和映射尚未定义，不能从此表推断已冻结。

-   **Standby** --- OLO 标识；低亮/常亮；安静但可感知存在。
-   **Listening** --- 输入反馈；Light Bar / Ring 呼吸。
-   **Thinking** --- 三点思考态，与 Listening 明确区分。
-   **Acting** --- 执行光点，表示正在现实执行。
-   **Need You** --- 高可见但克制，提示 handoff / 确认。
-   **Done** --- 短暂完成反馈。
-   **Privacy** --- 工作灯熄灭，相关传感器暂停。
-   **Power Off** --- 无活动反馈，不可误显示为在线。

### 6.4 工程要求（进入 Hardware PRD）

-   麦克风阵列拾音距离、波束成形与噪声环境性能。
-   摄像头 FOV、低照度、功耗、工作指示与隐私机制。
-   扬声器响度、频响、漏音和反馈音设计。
-   续航、待机功耗、Agent 活跃功耗与充电时间。
-   BLE / Wi-Fi / UWB / Cellular 等连接方案。
-   热设计、跌落、防水防尘、材料与穿戴安全。
-   磁吸、无线充电、Type-C、背夹 / 挂绳 / Dock 结构验证。
-   DFM、法规认证与维修策略。

------------------------------------------------------------------------

## 7. OLO Intelligence & Agent

### 7.1 Agent 状态语义

以下保留 v1.0 的体验状态参考，不构成完整 Runtime 状态转移契约。重试、取消、部分失败与补偿由独立 living spec 验证。

`Captured → Understanding → Planning → Need Information / Need Confirmation → Executing → Verifying → Done`

异常终态包括：

-   Partial
-   Failed
-   Cancelled

### 7.2 Trust Architecture

  -------------------------------------------------------------------------------------
  等级                    行为                           示例
  ----------------------- ------------------------------ ------------------------------
  L1 · Auto               低风险、可逆、已授权           提醒、准备信息、部分环境调整

  L2 · Confirm            具有现实影响、费用或对外动作   叫车、修改预约、发送信息

  L3 · Authenticate       支付、安全、身份、敏感数据     付款、门锁、身份确认
  -------------------------------------------------------------------------------------

具体动作的风险映射需形成独立 **Action Permission Matrix**。L1–L3 为信任分层，不是 Ambient Display L0–L4。自动行为仍须匹配能力、目的、情境、费用、有效期与用户授权；通勤授权不自动覆盖机场出行。具体策略字段与阈值待 SR-003 验证。

### 7.3 Agent 可解释性与验证

-   重要动作记录 Intent、Plan、Actor、Action、Result。
-   用户能够查看 Why。
-   系统区分 `requested / accepted / completed / verified`。
-   没有真实完成证据时，不得显示为 Verified Done。
-   失败时提供 Retry / Change Plan / Cancel。

------------------------------------------------------------------------

## 8. OLO Identity & Memory

OLO Identity 是跨设备持续性的核心。用户更换 iPhone、OLO One 或进入不同
Body 时，仍应面对同一个 OLO。

核心能力：

-   Preferences
-   Routine
-   Places
-   Relationships
-   Agent History
-   Trust
-   Memory Controls

### 8.1 Memory 原则

-   不是所有 Context 都进入长期 Memory。
-   Memory 应具有来源、时间与可编辑性。
-   用户必须能知道"为什么 OLO 记住了这件事"。
-   用户可查看、修改、删除并控制继续学习。
-   敏感信息采用更严格的写入与展示规则。
-   数据存储、加密、同步、保留和删除机制后续冻结。

------------------------------------------------------------------------

## 9. OLO World · One Identity, Many Bodies

  -----------------------------------------------------------------------
  Body                    核心角色                阶段
  ----------------------- ----------------------- -----------------------
  OLO One                 Presence / Intent       核心产品

  iPhone                  Screen / Payment /      验证期与 V1 Companion
                          Authentication          

  Home                    Ambient Action          后续真实集成

  Vehicle                 Mobility / Space        后续真实集成

  Robot                   Hands / Legs            长期方向

  Future Bodies           Glasses / Mac / TV /    开放方向
                          Drone / Third-party     
                          devices                 
  -----------------------------------------------------------------------

OLO World 的核心不是"设备列表"，而是 **Capability Routing**：

> 面对一个 Intent，OLO 判断哪个 Body 最适合执行哪一步。

------------------------------------------------------------------------

## 10. Companion Interfaces

### 10.1 iOS Companion 定位

iOS App 是当前产品验证工具和未来辅助界面，**不是 OLO 本体**。

主要承担：

-   复杂信息展示与 Agent Plan 回顾。
-   Confirm / Authenticate。
-   Payment / Boarding Pass / Maps 等系统能力 handoff。
-   OLO One 配对、设备状态、升级与诊断。
-   Memory / Privacy / Identity 管理。
-   原型阶段验证 OLO 状态语言、Agent Flow 和信任模型。

### 10.2 Companion IA（验证基线）

-   **OLO / Now** --- 当前状态、Context、Need You
-   **Agent** --- 任务、计划、执行、结果
-   **World** --- Bodies / Capabilities
-   **Me** --- Identity / Memory / Privacy / Settings

该 IA 不应反向限制未来 OLO One 的无屏 / 轻屏交互。

------------------------------------------------------------------------

## 11. Privacy & Safety

-   Flip Privacy 是核心物理隐私动作。
-   Privacy 开启后 Camera / Microphone 暂停。
-   传感器工作状态必须有物理可感知反馈。
-   用户可查看 Camera / Microphone / Location / Memory / Cloud
    Processing 权限。
-   建立感知使用记录或等价可解释机制。
-   高风险现实动作进入 Trust Architecture。
-   遵循最小权限、最小数据、必要时认证原则。

------------------------------------------------------------------------

## 12. Proactive Behavior & Notifications

允许 OLO 主动打扰的三种产品语义：

### Need You

任务无法继续或需要用户确认 / 认证。

### Done

用户关心的重要任务已完成。

### Worth Knowing

此刻知道这件事会显著改善用户决策或避免损失。

普通内部状态变化不制造通知。

**Quiet by Default 是产品约束，不只是视觉风格。**

------------------------------------------------------------------------

## 13. 系统数据对象

本节为产品层责任清单，不是数据库 Schema。核心语义另见 [Context Architecture](../context/OLO-Context-Architecture.md)与 [Context Model v0.2](../context/OLO-Context-Model-v0.2.md)：14 个核心实体 + Context / Plan 两个系统对象。v0.2 由 SR-001 设计推演修订，仍为 living spec，未通过 SR-003。

  对象          核心字段（产品层）
  ------------- ---------------------------------------------------
  Identity      identity_id, preferences, trust, privacy
  Body          body_id, type, capabilities, state, permissions
  Context       source, time, freshness, scope
  Intent        raw_input, interpreted_goal, constraints
  Plan          steps, dependencies, risk, alternatives
  Action        actor, capability, request, status
  Result        accepted / completed / verified, evidence
  Memory        content, category, source, retention, editability
  Audit Event   time, actor, sensor/capability, reason, result

------------------------------------------------------------------------

## 14. MVP 产品范围

MVP 的目标不是完成全部生态，而是验证：

> **OLO 是否能够在有权限、可验证的条件下理解 Context、恰当介入、协调行动，并减少用户的认知负担。**

下面 P0 保留已有验证范围，不因本次文档更新自动增加开发任务。场景范围的 Must / Should / Future 分级、实现方式和上线指标仍需独立评审。

### P0

-   OLO One 工业 / 交互原型
-   基础语音 Intent
-   Listening / Thinking / Acting / Privacy 状态闭环
-   OLO Intelligence 基础 Agent Plan
-   iPhone Companion Handoff
-   Agent Confirm / Authenticate 框架
-   基础 Identity / Memory
-   设备配对 / 电量 / 连接 / 更新
-   Agent History / Why / Result

### 后续

-   Home：P1 / P2
-   Vehicle：P2
-   Robot：P2
-   Payment / Transaction：P2
-   Third-party Body / Agent SDK：Future

------------------------------------------------------------------------

## 15. MVP 验收闭环

1.  OLO One 能成为自然的物理 Intent 入口，其他身体可按情境接力。
2.  用户无需先打开 iPhone 即可开始核心交互。
3.  Listening → Thinking → Acting 能通过硬件被理解，并与 Companion
    状态一致。
4.  自然语言目标能够形成结构化 Agent Plan。
5.  系统能够区分自动执行、确认和认证。
6.  需要屏幕时自然 handoff 到 iPhone；不需要时 iPhone 不出现。
7.  至少一个真实或高保真模拟的跨 Body 场景完成端到端执行。
8.  任务结果区分执行请求与验证完成。
9.  用户能回顾 Agent 做了什么以及为什么。
10. Privacy 可以通过物理动作进入，并真实阻止相关传感能力。
11. Memory 写入可被用户看到并管理。

------------------------------------------------------------------------

## 16. 产品成功指标

**North Star：Reduce Human Cognitive Load。** 在可比较的场景下观察 App Opens、Context Switching、Repetitive Decisions、Manual Coordination、Unnecessary Notifications 是否减少，以及 Missed Important Events 是否减少。结合用户主观“少操心”反馈，避免用通知量或自动任务数代替体验价值。

这些是测量方向；采样周期、对照方式、指标定义与目标数值尚未冻结。误判、误行动、纠正成本和重要事件遗漏必须与节省操作一起评估。

当前尚未冻结量化阈值。

建议指标：

-   **Activation** --- OLO One 激活 / 配对完成率
-   **Intent** --- Intent 成功理解率、澄清率
-   **Agent** --- Plan 生成成功率、任务完成率、失败恢复率
-   **Trust** --- Confirm / Authenticate 完成率、取消原因
-   **App Second** --- 无需主动打开 Companion 即完成核心任务的比例
-   **Quiet** --- 主动提醒有用率、通知关闭率
-   **Memory** --- 记忆准确反馈、编辑 / 删除率
-   **Privacy** --- Privacy 使用率、权限撤销原因
-   **Reliability** --- Verified Done 准确率、跨 Body 失败率

------------------------------------------------------------------------

## 17. Roadmap

当前 Foundation 顺序：整理既有产品结论 → SR-003 Stress Test → 根据发现修订 Context Model（候选 v0.3）→ Agent Runtime → Ambient Display L0–L4 → Hardware Requirements → Core Prototype。此顺序是研究依赖，不是已经完成的里程碑或交付日期。


  ------------------------------------------------------------------------------
  阶段                                目标
  ----------------------------------- ------------------------------------------
  Phase 0 · Concept                   验证工业形态、Physical
                                      UX、状态语言与核心命题

  Phase 1 · Experience Prototype      OLO One 高保真硬件原型 + iOS 验证界面 +
                                      Agent Golden Path

  Phase 2 · Functional EVT            真实传感 / 音频 / 连接 / 电源 + 基础 Agent
                                      Runtime

  Phase 3 · MVP / DVT                 可靠性、隐私、安全、续航、配对、Identity /
                                      Memory 闭环

  Phase 4 · Launch                    量产硬件 + Companion + 核心服务

  Phase 5 · World Expansion           Home / Vehicle / Robot / Third-party
                                      Bodies
  ------------------------------------------------------------------------------

------------------------------------------------------------------------

## 18. 待验证 / 未冻结事项

-   50 mm × 12.7 mm 为外观目标，≈ 78 g 为旧概念参考；工程可行性与舒适性未验证。
-   Camera、6-Mic、Speaker、Type-C、磁吸 / 无线充电和配件结构未冻结。
-   是否需要独立 Cellular 尚未确定。
-   On-device Model 与 Cloud 推理边界未确定。
-   持续环境感知的功耗、隐私与法规边界未确定。
-   Memory 数据架构、加密、同步、保留与删除机制未冻结。
-   Agent Action Permission Matrix 未冻结。
-   Home / Vehicle / Robot 首批真实集成对象未确定。
-   Generation 1 保留 Ambient Display；显示技术、功耗、信息密度与 L0–L4 映射未冻结。
-   商业模式、定价、订阅和服务成本尚未形成正式需求。

------------------------------------------------------------------------

## 19. 子 PRD 结构

产品文档权威顺序见 [docs/README](../README.md)。Scenario、Context Architecture、Context Model、Runtime 与 Ambient Display 已独立建档。Hardware 与 Companion 沿用现有文档；系统部署架构和 Capability / Integration 的正式契约后续建立，不以空壳文档冒充完成。

以下保留后续可按需求建立的子领域：

1.  **OLO One Hardware PRD**
2.  **OLO Physical UX & Industrial Design Spec**
3.  **OLO Intelligence / Agent PRD**
4.  **OLO Identity & Memory PRD**
5.  **OLO Trust / Privacy / Safety Spec**
6.  **OLO Companion iOS Validation PRD**
7.  **OLO World / Body Integration Spec**
8.  **OLO Cloud / Runtime Technical Design**

所有子 PRD 必须服从本 Product PRD 的产品边界。

------------------------------------------------------------------------

## 20. 当前设计基线

当前 OLO One v16 原型已经展示：

-   `Little. Alive. Natural.`
-   `Your AI. In the real world.`
-   交互体验 / 3D 查看
-   Tap / Hold / Double / Flip
-   Listening / Agent / Standby / Privacy / Power
-   Glass / Light Bar / Camera Ring 状态反馈
-   Camera / 6-Mic / Speaker / Dock 概念结构
-   手持 / 穿戴 / 桌面场景
-   OLO One / iPhone / Robot / Vehicle / Home
-   One Identity · Many Bodies

Agent Trust Architecture、MVP 分层、成功指标和 Roadmap
是基于现阶段产品讨论形成的产品决策框架；工程参数、量化
KPI、商业模式和完整技术实现尚未由当前原型冻结。

------------------------------------------------------------------------

## 21. PRD v1.2 产品基线

> **OLO 是持续个人智能层；OLO One 是主要物理 Presence。One AI · Many Bodies 的目标是让世界在恰当时机围绕人协调，降低认知负担。**

iOS 在当前阶段承担验证与 Companion 角色。

后续所有原型与需求评审，优先回答七个问题：

1.  这项能力是否属于 OLO 本身？
2.  是否必须依赖屏幕？
3.  哪个身体能以最低认知成本完成，是否需要 OLO One 的物理能力？
4.  需要哪个 Body？
5.  风险等级是什么？
6.  结果如何验证？
7.  是否应该进入 Memory？

------------------------------------------------------------------------

**One OLO. Many bodies. In the real world.**
