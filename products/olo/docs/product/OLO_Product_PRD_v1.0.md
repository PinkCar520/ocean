# OLO Product PRD v1.0

**产品类别：** Personal AI Hardware / Ambient Agent\
**核心硬件：** OLO One\
**当前阶段：** Product Definition → Prototype Validation\
**当前原型基线：** OLO One v16 · Glass Light Bar\
**验证界面：** iOS Companion Prototype（验证工具，不是产品本体）\
**核心原则：** One Identity · Many Bodies

> **OLO 不是一个 App。OLO
> 是一个在现实世界中持续存在、理解、行动和记忆的个人 AI。**

------------------------------------------------------------------------

## 0. Executive Summary

OLO 旨在创造一种新的个人 AI 产品形态：AI 不再主要存在于聊天窗口，而通过
OLO One 获得现实世界中的物理存在，并通过持续 Identity、Memory 与 Agent
能力理解用户目标、规划行动、调用不同设备与服务完成任务。

OLO One 是核心硬件与第一交互入口；iPhone、Robot、Vehicle、Home 等是 OLO
在特定任务中可调用的能力载体。当前 iOS App
的定位仅是验证屏幕型交互、复杂确认、管理与调试，不应成为 OLO
的产品中心。

长期目标是：随着 OLO One 与 Agent
能力成熟，用户为了完成日常目标而主动打开 Companion App 的需求应下降。

------------------------------------------------------------------------

## 1. 产品定义

### 1.1 核心命题

**一个不是手机、不是手表、不是耳机的个人 AI，到底应该怎样被人使用？**

### 1.2 产品定义

**OLO = OLO Identity + OLO Intelligence + OLO One + OLO World +
Companion Interfaces**

  --------------------------------------------------------------------------------------------
  层                      定义                    产品职责
  ----------------------- ----------------------- --------------------------------------------
  OLO Identity            持续存在的"同一个 OLO"  偏好、记忆、权限、信任、关系与跨设备连续性

  OLO Intelligence        理解与行动系统          Observe → Understand → Think → Plan → Act →
                                                  Verify → Remember

  OLO One                 核心 AI 硬件            Presence / Intent / Sensing / Ambient
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

**存在 → 感知 → 理解 → 规划 → 行动 → 验证 → 记忆**

  -----------------------------------------------------------------------------------------------
  阶段                    系统行为                                 用户体验
  ----------------------- ---------------------------------------- ------------------------------
  Presence                OLO One 随用户存在于现实环境             无需先打开 App

  Observe                 按权限获取语音、视觉、时间、设备上下文   自然表达或环境触发

  Understand              识别 Intent 与约束                       用户不用逐项配置

  Plan                    生成步骤、选择 Bodies、判断风险          复杂目标转化为可执行计划

  Act                     调用本机、iPhone、服务或其他 Body        任务持续推进

  Verify                  确认动作是否真正完成                     不把"请求成功"冒充"结果成功"

  Remember                按规则沉淀长期有价值信息                 下次更少重复解释
  -----------------------------------------------------------------------------------------------

------------------------------------------------------------------------

## 5. Golden Path：我去机场

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
  概念尺寸      ≈ 50 × 12 mm（未冻结）
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

### 7.1 Agent 状态机

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

具体动作的风险映射需形成独立 **Action Permission Matrix**。

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

> **"个人 AI 硬件 + Agent 闭环"是否成立。**

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

1.  OLO One 能成为用户 Intent 的第一入口。
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

-   ≈ 50 × 12 mm 与 ≈ 78 g 为概念目标。
-   Camera、6-Mic、Speaker、Type-C、磁吸 / 无线充电和配件结构未冻结。
-   是否需要独立 Cellular 尚未确定。
-   On-device Model 与 Cloud 推理边界未确定。
-   持续环境感知的功耗、隐私与法规边界未确定。
-   Memory 数据架构、加密、同步、保留与删除机制未冻结。
-   Agent Action Permission Matrix 未冻结。
-   Home / Vehicle / Robot 首批真实集成对象未确定。
-   最终产品是否包含显示屏、投影或其他视觉输出未确定。
-   商业模式、定价、订阅和服务成本尚未形成正式需求。

------------------------------------------------------------------------

## 19. 子 PRD 结构

本 Product PRD 是最高层产品基线。后续研发建议拆分：

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

## 21. PRD v1.0 冻结结论

> **OLO 的产品中心是 OLO One + OLO Identity + OLO Intelligence，而不是
> iOS App。**

iOS 在当前阶段承担验证与 Companion 角色。

后续所有原型与需求评审，优先回答七个问题：

1.  这项能力是否属于 OLO 本身？
2.  是否必须依赖屏幕？
3.  OLO One 能否自然完成？
4.  需要哪个 Body？
5.  风险等级是什么？
6.  结果如何验证？
7.  是否应该进入 Memory？

------------------------------------------------------------------------

**One OLO. Many bodies. In the real world.**
