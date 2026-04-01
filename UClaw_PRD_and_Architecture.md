# UClaw：银行内网级 AI Agent 需求与架构设计白皮书

**版本：** v1.1 Draft
**日期：** 2026-03-31
**核心定位：** 串联「桌面代码环境」与「企业 IM/DevOps 基建」的双脑智能研发中枢

---

## 一、 产品背景与战略目标 (Background & Vision)

在重度合规与物理隔离的银行内网（Intranet）环境中，研发团队当前面临的最致命问题并不是缺乏工具，而是**工具孤岛与极高的上下文切换（Context Switch）成本**。

一个典型的研发路径是：QA 在**内网 IM（即时通讯）**发来消息报错 -> 研发切出 IDE 去网页登录**禅道**查 Bug 详情 -> 回到 IDE 改代码并提交到**GitLab** -> 再次切到网页进**Jenkins**点发布 -> 跑完流水线后再切回**IM**通知 QA 验证。

**UClaw** 的愿景是打造一个**无缝流转的生成式智能体**。借鉴开源项目 `OpenClaw` 的 “中枢网关 + 多渠道端”理念，UClaw 会将**内网 IM**、前端 Web 与开发者的个人电脑底层（CLI）融为一体。开发者只需在 IM 中发一句话，UClaw 就能帮其走完全程的拉库、打包、改单、通知。

---

## 二、 需求设计 (产品痛点与核心 PRD)

### 1. 核心业务痛点 (Pain Points)
1. **上下文严重割裂**：开发者每天在 IM 群组、禅道面板、Jenkins 控制台和代码编辑器之间来回横跳，碎片化工作占用极大精力。
2. **协同摩擦力高**：测试提单、开发跟进、发版通知等环节过度依赖“人找人”的手动文字粘贴，极容易出现信息漏斗。
3. **本地操作繁琐**：排查日志、跑脚本清理磁盘、检索几十个文档库这类“本地杂活”，目前全靠手工执行。

### 2. 核心应用场景与故事线 (User Stories)

UClaw 支持跨越 **内网 IM、Web 可视化面板、桌面终端** 三大媒介开展工作：

| 场景聚类 | 触达渠道 (Channel) | 典型用户故事线 (User Story) | UClaw 执行的后端动作 (Tools) |
| :--- | :--- | :--- | :--- |
| **【场景 A】 IM 驱动的缺陷流转** | **内网 IM** (如企微/行内自研办公软件) | 测试在群里说：“张三，支付页的报错又复现了”。UClaw 机器人捕捉后自动在群内回复：“已帮您将异常信息在禅道创建 Bug [ID:123] 并指派给张三”。 | 1. 读取 IM 上下文。<br>2. 调用 `tools-zentao` 创建缺陷。<br>3. 调用 IM Webhook 发卡片。 |
| **【场景 B】 一语驱动 CI/CD 发版** | **内网 IM / Web UI** | 开发者修复完毕，在 IM 对 UClaw 发送指令：“我刚 push 了支付热修复分支，帮我发到 Test-01 环境并关闭刚才的 Bug。” | 1. 调 `tools-gitlab` 查最新分支。<br>2. 调 `tools-jenkins` 传参点火构建。<br>3. 调 `tools-zentao` 沉淀状态。 |
| **【场景 C】 生成式数据大盘** | **Web UI (网页端)** | 业务主管在网页上输入：“帮我拉一下三月份各核心业务线的遗留 P0 缺陷报表”。前端不再返回文字，而是直接生成一个可交互的饼图。 | 调禅道聚合 API，前端接管 `tool_call` 渲染 `shadcn/ui` Highcharts 组件。 |
| **【场景 D】 桌面本地杂活助理** | **本地工作站 (CLI)** | 开发者在自己电脑终端敲击 `uclaw run`：“帮我把下载目录里今天生成的所有 .log 文件找出报错字段并生成个总结文本发桌面上。” | NestJS 网关下发指令，由潜伏在局域网里的 `uclaw-cli` 利用 Node.js 原生 `fs/cli` 库执行。 |
| **【场景 E】 内网基建与文档智能问答 (RAG)** | **Web UI / 内网 IM** | 新人入职时在群里问：“咱们测试环境的 UAT 数据库在哪台机器？” UClaw 直接检索行内 Wiki/Confluence 并在群内抛出准确文档链接与脱敏答案。 | 调取内网 PostgreSQL (pgvector) 向量库执行 RAG 文档检索。 |
| **【场景 F】 线上告警与日志一键溯源** | **内网 IM** | 运维机器人刚在群里报了核心网关 500 错误报警。研发立刻@UClaw：“去 Kibana/ELK 提取过去 15 分钟该服务的错误堆栈，并提炼出引发异常的 Root Cause”。 | 调用 `tools-elk` 接口大规模拉取散落日志，由 LLM 清洗后提取关键 `Exception`。 |
| **【场景 G】 代码合规与 MR 自动巡检** | **GitLab Webhook + IM** | 实习生张三发起了一个上千行的合并请求 (MR)。UClaw 被 webhook 触发，读取代码 Diff，在 IM 管理群里通报本次核心修改，并在某行代码处留评：“这里缺少验签逻辑”。 | 被动订阅 GitLab 事件流，并主动运用 `tools-gitlab` 发表 Review 评审与风险拦截。 |
| **【场景 H】 终端代码深度提效 (Interactive CLI)** | **本地工作站终端 (CLI)** | 开发者在 VS Code 终端敲击 `uclaw fix bug-2048`。UClaw 读取禅道后，结合本地根目录的 `.AIGUIDE.md` 团队规范，在终端输出【Plan 规划】，询问开发者 `(Y/N)` 后，直接利用 AST 重构代码。 | `apps/cli` 提供 `inquirer.js` 交互界面，解析正则与 AST 操作本地文件，基于人类建议权（Y/N）闭环提交流水线。 |

---

## 三、 架构设计总纲 (Architecture Design)

借鉴并升维自 `OpenClaw` 的**WebSocket 多渠道网关**思想，本产品采用 **“云端企业中枢 (NestJS Gateway) + 本地动作节点 (Node Daemon) + 多前端触点 (IM/Web)”** 的三体网络拓扑。

### 1. 全景逻辑拓扑图 (带 IM 渠道)

```mermaid
graph TD
    %% 泛前端与交互渠道层 (Channels)
    subgraph 渠道触达层 (Touchpoints)
        direction TB
        WebApp[前端交互面板<br>React/shadcn Generative UI]
        IMBot[内网 IM 机器人<br>群聊机器人 Webhook/长链接]
    end

    %% 核心网络隔离设定
    subgraph 开发者本地工作站 (Developer Local Node)
        LocalDaemon[终端桌面沙箱<br>uclaw-cli (Node.js/WebSocket)]
        FileSystem[(本地 OS 环境<br>fs, bash, git)]
        LocalDaemon -- "Local Tool Exec" --> FileSystem
    end

    %% 企业大脑枢纽
    subgraph 核心网关大脑 (Gateway Server)
        Gateway[企业网关中枢 Gateway<br>NestJS + SSO 守卫 + 多端 Router]
        Memory[(会话长短时记忆<br>Redis / pgvector)]
        LLM[行内私有化推理集群<br>Qwen-Coder / DeepSeek]
        
        Gateway <--> Memory
        Gateway <--> LLM
    end

    subgraph 企业私有 IT 基建 (Enterprise APIs)
        ZenTao[禅道]
        Jenkins[Jenkins CI/CD]
        GitLab[GitLab Repo]
    end

    %% 通信干线
    WebApp == "SSE / WebSocket (带 SSO)" === Gateway
    IMBot == "事件订阅 / 消息回调" === Gateway
    Gateway == "WebSocket 下发动作 (RPC)" === LocalDaemon

    %% 动作派发
    Gateway -. "工具执行 (企业域 API)" .-> ZenTao
    Gateway -. "工具执行 (企业域 API)" .-> Jenkins
    Gateway -. "工具执行 (企业域 API)" .-> GitLab
```

### 2. 技术栈骨架 (Technology Stack)
* **工程架构**：基于 `pnpm workspace` 的 Typescript 全栈大一统 Monorepo。
* **大脑网关 (`gateway`)**：基于 **NestJS** 构建，这是接管多渠道（响应 IM 事件回调、维持 Web 长连接）的神经中枢，利用拦截器进行严格的 SSO 鉴权和工具链白名单管控。
* **前端展示 (`web`)**：React 18 + Vite (SPA) + Vercel AI SDK 构建。重兵投入 **Generative UI**，把枯燥的表单变为大模型召唤的智能极客组件。
* **深度交互终端 (`cli`)**：不再仅仅是僵尸探针，正式融入 Anthropic 工作流理念：
  * 构建一个类似于 Claude Code 的高体验度交互面板（基于 `inquirer.js` 和 `commander.js`）。
  * 开发者在终端输入 `uclaw start [bug_id]` 后，CLI 会联动网关拉取缺陷详情。
  * **强制读取本地 `.AIGUIDE.md`（团队代码准则规范）** 作为系统极上游 Prompt。
  * 向宿主开发者提出**代码修改建议权（Y/N 交互）**，防范恶意 RCE 脚本，开发者同意后利用 AST/文件流修改代码并自动 Commit。

---

## 四、 安全防腐与 SSO 边界校验

这套由 IM 与本地 CLI 混合注入的系统，在金融内网的生命线在于**权限不乱扫**：
1. **SSO 身份防伪**：所有来自 Web UI 与 CLI 的请求，均由网关提取企业 SSO Token 验证其工号。
2. **IM 机器人强绑定**：当通过内网 IM 触发 UClaw 时，网关必须读取内网 IM 发来的 Request Header 中的 `UserId`（如：WangEr），随后在使用 `tools-zentao` / `tools-jenkins` 调用对应基建接口时，以 `WangEr` 的身份校验执行权限（不能发生张三通过 IM 命令关闭了总经理的项目的事故）。
3. **隔离护城河**：UClaw 只做意图调度，**不在自身数据库存储任何脱敏业务数据**。

---

## 五、 物理目录布局 (Monorepo)

```text
uclaw/
├── package.json               # 统一的依赖控制中心
├── pnpm-workspace.yaml        # 定义分包逻辑
├── .npmrc                     # (关键) 锁定指向银行内网的私服镜像源
├── apps/
│   ├── web/             # [前端 UI 交互舱] Generative UI
│   ├── gateway/         # [ NestJS 核心大脑] 统领大模型、SSO、WebSocket 分发
│   └── cli/             # [终端交互极客工具] 具有 Plan Mode、(Y/N) 防御提示以及 `.AIGUIDE.md` 注入能力的高体验命令行入口
├── packages/
│   ├── channel-im/            # [频道包] 内网 IM (企微/钉钉/自研) API 与消息 Webhook 桥接处理器
│   ├── tools-zentao/          # [基建手牌 - 禅道] 缺陷生命周期全链路接口
│   ├── tools-jenkins/         # [基建手牌 - 持续集成] 构建触发器
│   ├── tools-local-fs/        # [本地手牌 - OS] 终端读写封装
│   ├── ui-generative/         # [UI 组件库] 供前端动态挂载的高阶 React 组件
│   └── shared-types/          # 全局强类型
```
