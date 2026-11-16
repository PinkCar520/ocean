# Conversation evidence — 2026-09-09

Source: Cybercab Deployment Watch, conversation 6aa10037-eda4-83e9-a1b9-eb62337e06a2.

Status: selected assistant discussion excerpts, preserved as evidence, not approved requirements or agent instructions. Market/API assertions and numerical examples have not been verified. User authorization for the document update is recorded in DECISIONS.md. This is not the complete conversation.

## Turn 07c422c5-8cf0-4635-b184-e7203ad5bb02

好。我们先**不急着罗列几十个“AI 能做什么”**，而是按照刚才确定的 OLO 产品哲学，把「起床」当成第一个完整场景来设计。

这里很容易犯一个错误：把 OLO 做成一个更聪明的闹钟。真正的问题应该是：

> **一个人从睡眠状态进入清醒、准备开始一天的过程中，今天有哪些事情仍然需要他自己感知、判断、寻找和操作？OLO 能不能把这些事情组织起来？**

---

# OLO Scene 01：起床 Wake Up

## 01. 今天的「起床」其实是一堆碎片化任务

假设一个普通工作日。

今天用户需要：

**07:30 起床 → 08:40 出门 → 09:30 到公司。**

现在可能是：

闹钟响了。

用户拿起 iPhone：

> 07:30

关掉闹钟。

然后大脑开始工作：

> 今天星期几？

> 几点上班？

> 天气怎么样？

> 下雨吗？

> 穿什么？

> 地铁会不会堵？

> 今天第一场会议几点？

> 我还能睡多久？

于是可能：

打开天气 → 看天气。

打开日历 → 看会议。

打开地图 → 看交通。

打开消息 → 看有没有重要信息。

再决定：

> **“好，我得起来了。”**

这里有一个非常有意思的问题：

### 人脑其实承担了一个 Agent 的工作。

系统已经拥有很多信息：

- 时间
- Calendar
- Weather
- Traffic
- Sleep
- Alarm
- Home
- Location
- Work schedule

但是它们**没有形成一个关于“这个人今天应该什么时候开始一天”的统一判断**。

---

# 02. OLO 不应该首先问「几点叫你起床」

传统产品：

> 设置闹钟：07:30

OLO 的问题应该是：

> **你明天需要什么时候进入 Ready 状态？**

甚至成熟以后，用户都不需要回答。

OLO 可以知道：

**09:30 公司会议**

↓

预计通勤 **42 min**

↓

下雨，交通预计增加 **11 min**

↓

用户通常洗漱 + 早餐 + 准备需要 **47 min**

↓

昨晚睡眠较晚

↓

因此：

### OLO 推导 Wake Window

例如：

**07:18–07:32**

这里第一次出现我们说的：

> **物找人。**

不是：

**人 → 设置 07:30 闹钟**

而是：

**人的生活 → OLO → 推导什么时候应该唤醒人。**

---

# 03. 但 OLO 不应该直接在 07:18 大喊「起床」

这正好涉及我们前面定义的：

## Intervention Model

07:18。

OLO 首先观察：

**Sleep State**

例如来自 Watch / 床边设备 / 环境：

> 用户仍处于睡眠状态。

然后判断：

**Urgency：低**

所以：

> 不打扰。

07:24。

交通状况变化。

预计通勤：

**42 → 51 min**

OLO 重新计算。

现在：

**Urgency ↑**

但仍然不意味着立即把人叫醒。

07:27。

进入适合唤醒的窗口。

OLO：

> **开始 Wake Sequence。**

---

# 04. Wake Sequence 不应该只是声音

这时候 OLO 开始协调环境。

例如：

**07:27**

窗帘：

**0% → 20%**

卧室灯：

**0% → 8%**

色温逐渐改变。

室温：

**22°C → 23°C**

OLO One：

非常轻微的环境光。

然后：

**07:30**

窗帘：

**40%**

灯光：

**20%**

最后才出现声音。

OLO：

> “早。”

停顿。

> “今天九点半有会。”

> “外面下雨。”

> “差不多该起来了。”

注意这里我甚至不希望 OLO 说：

> “现在是 7 点 30 分，东京今天最高气温 XX 度，降雨概率 XX%，您今天有三项日程……”

那又变成：

### AI 播报器。

OLO 应该只告诉你：

### **现在影响你行动的信息。**

---

# 05. 这就是 OLO 非常重要的设计原则

我们可以把它写进 Product Principles：

> ## Don't report information.  
> ## Translate information into action.

不是告诉用户：

> 降雨概率 80%。

而是：

> **“今天带伞。”**

不是：

> 地铁延误 17 分钟。

而是：

> **“今天最好提前十分钟出门。”**

不是：

> 睡眠时间 5h 42m。

而是：

> **“你昨晚睡得比较少，我把第一轮提醒推迟了六分钟，但现在该起来了。”**

数据应该尽量留在后台。

### 人看到的是 Decision。

这就是减少 Cognitive Load。

---

# 06. 用户不起床怎么办？

这个场景特别重要。

07:32。

OLO：

> “早。”

用户：

> “嗯……”

然后继续睡。

传统闹钟：

**Snooze 9 min**

这是非常机械的。

OLO 应该理解：

> **User Intent = 我还想睡。**

于是重新计算：

```text
Current time
07:32

First meeting
09:30

Commute
51 min

Preparation
47 min

Safety buffer
10 min
```

得到：

> **Absolute Latest Wake Time = 07:42**

于是 OLO 可以判断：

> 可以继续睡 7 分钟。

OLO：

> “可以再睡七分钟。”

然后保持安静。

---

到了：

### 07:39

第二次唤醒。

用户：

> “再睡十分钟。”

这时候 OLO 不应该机械执行。

因为：

**Context changed.**

OLO：

> “十分钟可能来不及。”

> “最多三分钟。”

这已经完全不是 Alarm。

这是：

### Context-aware negotiation

---

# 07. 更有意思的是：OLO 可以改变计划，而不是只催人

假设用户说：

> “我真的好困。”

OLO 不一定回答：

> “你必须起床。”

它可以重新 Planning。

发现：

第一场会议：

**09:30**

可以远程参加。

于是：

> “九点半的会可以线上参加。”

> “要不要今天晚点去公司？”

用户：

> “好。”

然后整个世界重新组织。

OLO：

**Commute Plan → Cancel**

**Wake Deadline → 延后**

**Mac → 09:25 准备 Meeting**

**Home → Morning Routine 延迟**

这时候 OLO 第一次真正体现：

# World organizes around you.

而不是：

# AI tells you what to do.

这个区别非常重要。

---

# 08. 起床之后，OLO 不应该继续说话

用户真正坐起来。

OLO 感知：

**Sleep → Awake**

然后：

### Morning State Transition

开始执行已经获得授权的事情：

窗帘打开。

卧室灯调整。

咖啡机预热。

浴室温度调整。

热水器进入准备状态。

新闻？

**不主动播放。**

邮件？

**不主动念。**

股票？

**不主动播报。**

因为现在的 User Intent 是：

> **Wake & Prepare**

不是：

> Consume Information。

---

# 09. 但是发生异常事件怎么办？

例如：

07:44。

用户刚起床。

正常情况下 OLO 不应该说话。

但：

**08:30 航班取消。**

或者：

**公司临时通知 09:00 提前开会。**

或者：

**家人发来紧急消息。**

Intervention Score 突然升高。

这时候：

> OLO：「有件事你现在需要知道。」

然后告诉用户。

这又建立一个重要原则：

### OLO 的主动程度不是固定的，而是动态的。

```text
                         Urgency

Low                                              High
 │                                                 │
 ▼                                                 ▼

Silent → Ambient → Suggest → Ask → Interrupt → Act
```

我认为这个谱系以后会非常重要。

---

# 10. 那么 OLO One 在这里到底做什么？

现在我们终于可以反过来讨论硬件。

起床场景里：

### Apple Watch

知道：

**身体 / 睡眠状态**

### iPhone

知道：

**Calendar / Communication / Apps**

### Home

知道：

**家庭设备**

### Cloud

知道：

**Weather / Traffic / Services**

而：

### OLO

负责：

**理解所有 Context + 做 Decision + Orchestration**

那么 OLO One 可能承担：

**Bedroom Presence**

它知道：

> 人在不在房间？

> 是睡着还是已经醒来？

> 用户有没有回应？

> 当前环境声音如何？

> 房间亮度如何？

> 是否适合语音交互？

然后成为：

### Ambient Interface

而不是：

### Smart Speaker。

---

# 11. 这里也暴露出一个非常重要的问题：OLO ≠ OLO One

我建议从现在开始明确区分：

### OLO

**智能体本身。**

负责：

Context / Memory / Planning / Intervention / Orchestration。

### OLO One

**OLO 的物理 Presence。**

负责：

Sense / Presence / Ambient Interaction / Privacy。

### iPhone

高信息密度交互。

### Watch

身体状态 + 微交互。

### AirPods

私人语音界面。

### Mac

工作 Context。

### Home

环境执行层。

### Car

移动执行层。

所以未来可能不是：

> **一个 OLO One 管所有事情。**

而是：

> **一个 OLO，存在于多个身体之中。**

这跟我们之前讨论 watchOS 时的思路就统一起来了。

---

# 12. 起床场景可以正式形成第一个 OLO Requirement

我们暂时不要写传统 PRD 的 Feature Requirement。

我建议建立一种自己的格式：

## OLO Scenario Requirement — SR-001 Wake Up

**Human Goal**

> 在正确时间、以最低认知负担开始一天。

**Current Friction**

> 用户需要自己设置时间、查看天气、日程、交通，并综合判断什么时候起床以及如何安排早晨。

**OLO Goal**

> 根据用户计划、身体状态、环境和外部世界动态推导 Wake Window，并以最低打扰方式帮助用户进入 Ready 状态。

**Context**

Sleep / Calendar / Weather / Traffic / Home / Location / Historical Routine / Communication

**OLO Decision**

> When should I wake this person?

**Intervention**

Silent → Ambient → Voice → Negotiation → Urgent Intervention

**Actions**

Home environment / Alarm / Calendar / Transportation / Device preparation

**Human Confirmation**

普通环境调整：

> 可预授权自动执行。

改变日程：

> 通常需要确认。

取消预约 / 修改会议：

> 强确认。

**Success Metric**

不是：

> “闹钟是否响了。”

而应该是：

> **用户是否在需要的时间，以最低交互成本进入 Ready 状态。**

---

而这里已经出现了一个让我觉得非常值得继续深挖的东西：

**“起床”其实不是一个 Feature。**

它是一个 **State Transition：**

# Sleeping → Awake → Ready

那么接下来的 OLO 产品架构可能不应该围绕传统的：

**Home / Calendar / Transportation / Health / Work**

这些 App 分类设计。

而应该围绕：

**人的状态变化。**

所以「起床」之后，我建议我们的下一个场景不要马上跳到“天气”“新闻”之类的功能，而是继续研究：

# **Awake → Ready：洗漱、洗澡、穿衣、早餐、喝水、吃药、收拾东西**

这里 OLO 会第一次真正进入**家庭空间感知 + 多设备协作 + 人的日常习惯**，也是「物找人」开始变得非常明显的地方。

---

## Turn e5e930c0-a43f-4e00-9bbd-1edbf09e1b93

继续。沿用刚才已经认可的逻辑，我们进入 **SR-002：Awake → Ready**。

这一阶段比“起床”更关键，因为它第一次检验 OLO 能否从“智能提醒器”变成真正的 **Ambient Agent**。

# SR-002 · Morning Ready

目标不是：

> 帮用户刷牙、洗脸、吃早餐。

而是：

> **让用户从“已经醒来”自然过渡到“可以出门 / 可以开始工作”的状态，同时尽量不需要操作电子设备。**

我们先看今天发生了什么。

用户起床以后，大脑马上又成为“调度中心”：

**上厕所 → 洗脸 → 刷牙 → 洗澡 → 找衣服 → 看天气 → 判断穿什么 → 做早餐 → 喝水 → 找钥匙 → 找耳机 → 找钱包 → 看几点了 → 判断还来不来得及 → 出门。**

其中大量事情不是“家务”，而是：

> **感知 → 判断 → 记忆 → 排序 → 协调。**

这恰恰是 OLO 应该接管的部分。

---

## 01 · 07:42，用户真正起床

前一个场景已经确认：

**Sleeping → Awake**

OLO 不再播报信息。

而是进入：

> **Morning Ready Mode**

后台生成一个动态目标：

**Target Ready Time：08:31**  
**Target Departure：08:38**

这里有个重要变化：

传统系统管理的是：

> Alarm = 07:30

OLO 管理的是：

> **Goal = 08:38 可以出门**

至于中间怎么完成，可以动态调整。

---

# 02 · 用户走进浴室

这里第一次出现真正的 **Spatial Context**。

OLO 知道：

**Bedroom → Bathroom**

而不是用户说：

> “OLO，我现在要洗漱。”

它推断：

> User State = Morning Hygiene

于是环境自己发生变化。

浴室灯打开。

热水系统已经准备。

镜前灯调整到早晨状态。

如果用户通常早晨洗澡：

> 热水已经准备好。

但：

### OLO 不说话。

这是很重要的。

好的 Ambient Computing 应该让用户产生一种感觉：

> **事情已经准备好了。**

而不是：

> **AI 一直在告诉我它做了什么。**

---

# 03 · OLO 应该开始拥有「Routine Memory」

比如 OLO 长期观察到：

工作日用户通常：

**起床 → Bathroom 18 min → Coffee → Breakfast 12 min → Dress 8 min → 出门**

但今天：

Bathroom 已经 **27 min**。

这时候 OLO 不应该马上：

> “你今天洗澡时间比平时长了九分钟。”

这种体验会非常讨厌，甚至令人觉得被监控。

OLO 应该把这个信息留给自己。

重新 Planning：

**08:38 Departure**

↓

剩余时间减少

↓

早餐流程需要调整

↓

交通情况正常

↓

仍然可以按时出门

所以：

### Silent.

这再次强化 OLO 的原则：

> **Context primarily exists for AI decision-making, not for user reporting.**

---

# 04 · 什么时候才应该找人？

08:11。

用户还在浴室。

与此同时：

交通发生变化。

原本：

**08:38 出门**

现在需要：

**08:30 出门**

OLO 计算：

> Current Plan impossible.

Intervention Score ↑

这时候才出现：

> OLO：「今天路上慢了一点。」

停顿。

> 「最好八点半出门。」

只有两句话。

不是：

> “检测到当前 XX 高速发生交通拥堵，根据地图预计……”

人不需要这些。

---

# 05 · 用户问：「我还有多久？」

这里才从 Ambient → Conversational。

OLO：

> **“十九分钟。”**

而不是：

> “现在是 08:11，建议你在 08:30 出发。”

因为 Context 已经明确。

这会成为 OLO 一个非常重要的语言设计原则：

## Context makes language shorter.

传统 Voice Assistant 必须：

> “Hey Siri，距离我今天去公司应该出门还有多少时间？”

OLO 世界里：

> “还有多久？”

因为：

**OLO knows what “多久” means.**

甚至：

> “来得及吗？”

OLO：

> “来得及。”

这种极短交互，我认为会是 OLO 很有辨识度的一部分。

---

# 06 · 穿什么？

这是一个很有意思的边界案例。

OLO 知道：

**Weather**

18–24°C  
下雨  
下午降温

知道：

**Calendar**

上午 Office  
下午客户会议

知道：

**历史偏好**

但 OLO 是否应该主动说：

> “建议穿深色外套。”

我认为：

### 默认不应该。

因为这里涉及一个非常重要的产品概念：

# Agency Boundary

有些事情用户希望 AI 替自己决定：

> 什么时候叫车。

有些事情希望 AI 给建议：

> 今天带不带伞。

有些事情是：

> **我自己的选择。**

例如：

穿什么。

吃什么。

跟谁交朋友。

看什么电影。

这些不能因为 AI “知道得更多”就不断侵入。

所以 OLO 需要逐渐学习：

### 用户希望把哪些决策交给我？

这可能形成：

**Autonomy Profile**

---

# 07 · 但是「伞」不一样

因为今天下雨。

用户已经穿好衣服准备离开卧室。

OLO 判断：

**Umbrella likely needed**

但现在说：

> “今天记得带伞。”

可能太早。

因为用户还没到玄关。

所以：

### 不提醒。

直到：

08:27。

用户进入：

**Entryway / Leaving State**

OLO 感知：

> Umbrella remains at home.

这时候：

> **“带伞。”**

两个字就够了。

这就是：

# Right information × Right moment × Right place.

而不是：

# More information.

---

# 08 · 早餐又是一个很好的 OLO 场景

用户来到厨房。

正常工作日：

> Coffee + simple breakfast

咖啡机已经准备。

但 OLO 发现：

**Departure Deadline = 08:30**

现在：

**08:18**

正常早餐需要：

**12 min**

这意味着：

> Plan conflict.

传统 AI：

> “你还有 12 分钟。”

OLO 可以做更聪明的事情：

**改变环境，而不是催促用户。**

例如：

正常咖啡模式：

**Slow Brew 6 min**

自动改：

**Quick Brew 3 min**

早餐设备：

提前开始。

如果交通服务允许：

**Cybercab pickup 08:30 → 08:33**

于是 OLO 在后台创造出：

**+3 min**

用户甚至不知道发生过 Planning。

这很重要。

---

# 09 · 但这引出一个巨大的产品问题

OLO 到底能不能：

> **未经询问改变 Cybercab 时间？**

答案不能简单是 Yes / No。

应该建立：

# OLO Action Risk Model

我认为至少四级。

### A0 — Silent Automation

低风险、可逆。

例如：

灯光。

窗帘。

空调。

咖啡机预热。

不需要询问。

---

### A1 — Preference Automation

有轻微影响，但高度可逆。

例如：

Cybercab 延后 3 分钟。

音乐暂停。

导航路线调整。

可以执行，然后轻量通知：

> “车改到 8:33。”

---

### A2 — Confirm Before Action

具有成本 / 外部影响。

例如：

叫车。

下单早餐。

取消预约。

发送普通消息。

OLO：

> “车现在过来？”

用户：

> “嗯。”

---

### A3 — Explicit Authorization

高风险 / 金钱 / 身份 / 隐私 / 不可逆。

例如：

支付大额款项。

医疗决定。

签合同。

门锁授权陌生人。

代表用户作重要承诺。

必须明确确认。

---

这会成为未来 OLO OS 非常核心的一层：

## Permission ≠ App Permission

今天的 Permission 是：

> Camera allowed?

> Location allowed?

OLO 的 Permission 应该进一步变成：

> **What decisions are you allowed to make for me?**

这完全是另一种权限系统。

---

# 10 · 喝水是你刚才特别提到的场景

这也非常适合验证「物找人」。

传统：

Apple Watch：

> 💧 该喝水了。

这是：

**Scheduled Notification**

我不认为这是 OLO。

OLO 应该理解：

> 用户刚醒  
> ↓
> 昨晚 7 小时没有饮水  
> ↓
> 已经完成洗漱  
> ↓
> 现在进入厨房  
> ↓
> 水就在附近  
> ↓
> 当前没有赶时间

这个 Moment 非常合适。

OLO：

> **“喝点水。”**

甚至更成熟以后：

智能饮水设备已经准备好了。

这才是：

> **Contextual Intervention**

而不是 Reminder。

---

# 11 · 甚至“不说话”可能才是最终体验

如果未来家里的物理设备真正进入 OLO 网络：

用户走到厨房。

杯子已经准备。

饮水机：

**200 ml 温水。**

咖啡：

正在制作。

窗外下雨。

玄关：

伞旁边出现一个柔和 OLO Light。

你根本没有：

> 打开 App。

没有：

> Hey Siri。

没有：

> Prompt。

甚至没有：

> AI Voice。

但整个环境正在围绕你组织。

这才是我认为 **“物找人”最纯粹的状态。**

OLO 不应该追求：

> **用户一天跟 OLO 说了多少句话。**

甚至应该反过来。

优秀的 OLO：

> **可能让用户一天少操作手机 100 次。**

---

# 12 · 08:26，进入 Ready → Leaving

OLO 判断：

**Bathroom ✓**

**Dressed ✓**

**Breakfast ✓**

**Phone ✓**

**Watch ✓**

**Keys ✓ / Digital Key available**

**Bag ✓**

**Umbrella ?**

**Cybercab ETA 4 min**

于是人的状态：

### Ready

然后 OLO 才主动出现：

> **“车四分钟到。”**

用户穿鞋。

准备离开。

这时候整个 SR-002 完成。

---

# SR-002 的真正产品需求

**Human Goal**

> 以最低认知负担完成早晨准备。

**OLO Goal**

不是：

> 管理智能家居。

而是：

> **理解 Ready Goal，并协调环境、时间、设备和服务，使用户自然达到 Ready State。**

核心 Context：

**Time + Location + Routine + Calendar + Weather + Traffic + Home + Device State + Personal Preference**

核心 Decision：

> **Is the user still on track?**

核心 Intervention：

**Silent → Environmental → Ambient → Verbal → Negotiation**

核心 Action：

**Prepare / Adjust / Remind / Reschedule / Orchestrate**

成功标准：

> **用户按计划进入 Ready 状态，并尽可能少地查看手机、打开 App、处理通知和做重复性判断。**

---

# 到这里，OLO 已经出现了 6 个非常核心的产品概念

我认为值得暂时固定下来：

**① Personal Context Graph**  
OLO 对“人现在处于什么状态”的统一理解。

**② State Transition**  
产品不是围绕 App 功能，而是围绕人的状态变化工作。

**③ Intervention Model**  
什么时候出现，什么时候保持沉默。

**④ Routine Memory**  
理解个人生活规律，但不把“监控感”暴露给用户。

**⑤ Autonomy Profile**  
哪些决定用户愿意交给 OLO。

**⑥ Action Risk Model**  
什么可以自动做、什么需要确认、什么必须明确授权。

这六个东西，我认为已经开始构成 **OLO OS** 的雏形。

---

而现在我们即将进入一个比「起床」和「洗漱」更关键的场景：

# SR-003 · Leaving Home

因为这里会第一次发生真正的：

**Human + OLO + Home + iPhone + Watch + Transportation + Physical World**

协同。

也就是你最开始举的那个例子：

> **用户没有打开打车 App。**

> **Cybercab 自己来到楼下。**

同时：

> 家庭进入 Away State  
> → 灯光关闭  
> → 非必要电源处理  
> → 空调调整  
> → 门锁确认  
> → 电梯/门禁（如果未来系统允许）  
> → Cybercab 到达  
> → 导航 handoff  
> → OLO 从 Home Presence 转移到 Personal/Vehicle Presence。

**这会是 OLO 第一个真正体现“物找人 + 跨系统行动闭环”的 Hero Scenario。**

下一轮我建议就把 **「我要出门」从用户走向玄关一直推演到 Cybercab 开出小区**，而且要开始讨论失败场景——车没来、手机没电、用户突然改变目的地、家门没锁、有人还在家——因为真正的 OLO 产品能力恰恰会在这些异常情况里被定义出来。

---

## Turn 3b0ee070-67cd-4511-a649-953959165a99

可以，而且这一轮非常值得把 Cybercab 当成一个**现实世界已经开始运行的外部执行器**来研究，而不是概念车。

我刚查了截至 **2026 年 9 月 9 日**的最新情况，有一个重要更新：Cybercab 已不只是展示原型。Tesla 官方称 Robotaxi 服务目前已覆盖美国多个城市，而真正的双座 Cybercab 目前仍主要在 **Austin 的有限区域**提供乘车服务；Tesla 香港官方页面称 Austin 已有 **40 多辆 Cybercab**投入服务。Reuters 9 月初报道的 Texas 注册数据则是 45 辆 Cybercab。citeturn0search2turn0search3turn0search6turn0news21

image_group{"layout":"carousel","aspect_ratio":"16:9","query":["Tesla Cybercab 2026 exterior Austin","Tesla Cybercab interior touchscreen 2026","Tesla Cybercab robotaxi passenger pickup Austin"],"num_per_query":1}

这对 OLO 很有价值，因为我们现在可以把 SR-003 从“未来幻想”变成一个**基于现实能力、再向未来推一步**的场景。

## SR-003 · Leaving Home：Ready → In Transit

先确定一个原则：

> **OLO 不应该成为另一个 Robotaxi App。**

Tesla 当前官方流程仍然是典型的“人找物”：官方页面明确写的是 **下载 Robotaxi App → 呼叫 Robotaxi**。Cybercab 本身已经高度自动化，但“我什么时候需要车”这一判断仍主要由人完成。citeturn0search2

这恰恰给 OLO 留出了位置。

### 08:20

上一阶段 OLO 已经知道：

**Target Departure：08:30**

同时它知道：

**Destination：Office**  
**Calendar：09:30 meeting**  
**Cybercab ETA：约 6 min**  
**Preparation State：Almost Ready**

传统模式是：

> 用户看时间 → 判断该叫车了 → 找手机 → Robotaxi App → 输入/选择目的地 → Call → 等车。

OLO 模式应该是：

> **OLO 判断：现在已经进入 Transportation Preparation Window。**

但此时还不能马上叫车。

因为用户可能突然：

> 不去公司了。

所以这里需要结合我们上一轮定义的 **Action Risk Model**。

第一次使用：

> OLO：「今天还是去公司？」

用户：

> “嗯。”

或者更自然：

> OLO：「车六分钟过来，叫吗？」

> “嗯。”

完成一次 A2 授权。

长期使用后，用户可以给予：

> **工作日通勤自动叫车**

的 Autonomy Permission。

从此以后，这句话甚至消失。

---

# 01 · Cybercab 自己开始找人

08:23。

OLO：

> **Call Cybercab**

Cybercab 开始前往用户住宅。

但关键区别出现了：

用户此时**还在家里收拾东西**。

不是：

> 人站在路边 → 打开 App → 找车。

而是：

> **车正在主动靠近即将需要它的人。**

这就是你提出的「物找人」第一次真正进入物理世界。

Cybercab 本身其实已经提供了很好的物理接口：Tesla 官方 Rider Guide 显示，车辆外部 Lightbar 会在接客时改变颜色，并在上下客停车时闪烁；车门通过外部按钮开启。citeturn0search0

所以未来 OLO 完全可以把：

**OLO Identity ↔ Cybercab Identity**

建立联系。

不是：

> “你的车牌号是 ABC123。”

而可能是：

> **OLO 的视觉身份直接出现在来接你的车上。**

例如 OLO 是柔和白色：

Cybercab 到达后：

**Lightbar → OLO White Pulse**

用户看到车：

> **那就是我的车。**

这比读车牌更符合未来 autonomous fleet 的交互方式。

---

# 02 · 与此同时，Home 开始准备「离家」

注意：

**现在还不能关灯。**

因为：

> 人还没离开。

OLO 应该进入：

### Pre-Away State

例如：

咖啡机结束加热。

扫地机器人准备开始，但不启动。

空调准备进入 Away。

非必要设备准备关闭。

门锁等待状态变化。

于是：

> **Home 也在等待人离开。**

Cybercab 在接近。

Home 在准备。

Watch 知道人正在移动。

iPhone 准备交通 Context。

OLO 是唯一知道：

> **这些事情其实属于同一个事件——“我要出门”。**

这就是 Orchestration。

---

# 03 · 08:27：Cybercab 到达

Tesla 当前 Cybercab 是真正为 autonomous mobility 重新设计的：官方资料显示它是 **双座、无方向盘、无加速/刹车踏板**的车辆，中央触摸屏承担主要车内交互。citeturn0search0turn0search2

这件事对 OLO 特别重要。

因为：

> **驾驶行为消失之后，汽车第一次真正变成 Computing Space。**

08:27：

OLO One 不需要：

> “您的 Cybercab 已到达，车牌……”

它只说：

> **“车到了。”**

Watch：

轻微 haptic。

玄关：

OLO Light。

Cybercab：

外部 Lightbar。

三个界面表达的是：

### 同一个事件。

这应该成为 OLO 一个重要设计原则：

> **One event, multiple surfaces.**

不是三个设备分别发三个通知。

---

# 04 · 用户走到玄关

现在进入非常关键的：

## Leaving Check

但 OLO 不能像 checklist 一样：

> 手机带了吗？

> 钥匙带了吗？

> 钱包带了吗？

> 伞带了吗？

> 门关了吗？

那会非常烦。

OLO 应该只说：

### Exception。

例如：

Phone ✓  
Watch ✓  
Bag ✓  
Cybercab ✓  
Umbrella ✕

今天下雨。

所以：

> **“伞。”**

就一个词。

这就是前面定义的：

> **Context makes language shorter.**

---

# 05 · 用户真正离开家

门打开。

用户离开。

门关闭。

OLO 必须解决一个非常关键的问题：

> **家里还有没有其他人？**

如果：

伴侣 / 家人 / 小孩还在家，

那么绝不能：

> Away Mode。

所以 OLO 的 Context Graph 不是简单：

```text
User left home
→ Turn everything off
```

而应该：

```text
Primary user left
↓
House occupancy?
↓
Other people present?
↓
Yes
↓
Personal Away
≠
Home Away
```

这非常重要。

说明 OLO 管理的不是：

> **Device Automation**

而是：

> **World State。**

---

# 06 · 如果家里没人

OLO 判断：

### Home → Away

于是：

灯关闭。

空调进入 Away。

部分插座关闭。

扫地机器人启动。

门锁确认。

安防状态切换。

这些事情：

### 不需要全部告诉用户。

否则 Watch：

> 灯已关闭。

> 空调已关闭。

> 扫地机器人已启动。

> 门已锁。

完全违背 OLO。

正确体验应该是：

> **什么都不说。**

只有异常：

> **“阳台门没关。”**

这句话才值得打扰人。

---

# 07 · 用户走到 Cybercab

这里 Tesla 当前产品已经给我们非常好的现实基础。

Cybercab：

**没有驾驶员。**

所以不存在：

> “跟司机确认目的地。”

OLO 已经把：

**Identity + Destination + Passenger Context**

传递给 Mobility Service。

用户上车。

车知道：

> **This is the passenger.**

Destination：

> Office

已经准备。

用户不用再：

> 打开地图 → 输入地址。

---

# 08 · 上车以后发生一个非常漂亮的 Handoff

这是我认为 OLO 应该重点设计的东西：

## OLO Presence Handoff

刚才：

**OLO One / Home = Primary Presence**

进入车以后：

**Cybercab = Primary Environment**

于是：

```text
Home OLO
        ↓
     Handoff
        ↓
Cybercab
```

但：

> **OLO 没有变。**

只是它的“身体”变了。

这正好验证我们上一轮提出的：

> **One OLO, multiple bodies.**

---

# 09 · Cybercab 甚至应该自动继承个人环境

这里现实已经出现了一部分。

Tesla 官方目前明确说，乘客可以在 Robotaxi App 或车内调整空调、座椅等设置，而且**空调和媒体偏好会保存在 passenger profile，并在不同乘车之间自动延续**。citeturn0search3

这已经非常接近 OLO 思想。

但 OLO 可以再往前一步：

不是：

> Cybercab remembers your climate.

而是：

> **OLO knows your current context.**

例如今天：

刚从 23°C 家里出来。

外面 31°C。

走了 300 米。

Watch 知道身体状态。

所以车内环境已经：

> **Ready for you.**

甚至用户坐进去：

音乐从 AirPods：

→ Cybercab。

Podcast：

→ Continue.

Navigation：

→ Cybercab display。

工作 Context：

→ 暂时保持沉默。

这不是：

> Device Sync。

而是：

# Context Continuity。

我认为这个词以后会很重要。

---

# 10 · 08:31，Cybercab 开走

这时候用户没有：

**打开 Robotaxi App**

没有：

**打开地图**

没有：

**输入公司地址**

没有：

**打开 Home**

没有：

**逐个关闭设备**

没有：

**检查门锁**

没有：

**查看车辆 ETA**

没有：

**把导航重新设置到车里。**

但现实世界完成了：

```text
Human
  ↓
Ready
  ↓
OLO anticipates departure
  ↓
Cybercab approaches
  ↓
Home prepares Away
  ↓
Human leaves
  ↓
Home transitions
  ↓
Cybercab identifies passenger
  ↓
Context handoff
  ↓
Transportation begins
```

这就是 OLO 第一条真正完整的：

# Physical Agent Chain

---

## 这里我反而认为我们应该修正之前 Demo 的一句话

之前我们一直用：

> **“我去机场。” → OLO 调动车辆 + iPhone + 家庭设备**

作为 Hero Demo。

现在我认为最终版本应该更激进。

### V1 Demo

用户：

> “OLO，我要去机场。”

↓

OLO 执行。

### V2

用户：

> **“我要走了。”**

↓

OLO 已经知道 Destination。

### 真正的 OLO

用户：

> **什么都没说。**

因为：

Calendar：

**14:20 Flight**

Location：

Home

Bag：

Ready

Time：

Departure Window

Routine：

Travel

于是：

> **Cybercab 正在来的路上。**

OLO 只在真正需要用户确认的时候：

> “车现在过来？”

用户：

> **“嗯。”**

这一个“嗯”，可能触发十几个系统。

我认为这才应该成为 OLO 产品发布 Demo 最震撼的地方。

---

## 但 Cybercab 也提醒了我们一个现实问题

截至目前，Cybercab 的实际部署仍非常早期，而且正在面临美国监管审查。Reuters 报道 NHTSA 正在调查 Tesla 对无方向盘、踏板等传统控制装置 Cybercab 的合规/自我认证问题。因此我们做 PRD 时应该把 **“Autonomous Mobility Provider”定义成抽象能力层**，Cybercab 是最理想的演示对象，但不能把 OLO 产品架构绑定 Tesla。citeturn0news22turn0news24

也就是说：

```text
                    OLO
                     │
             Mobility Agent
                     │
        ┌────────────┼────────────┐
        ↓            ↓            ↓
    Cybercab       Waymo       Future AV
```

未来在中国：

Robotaxi / 小米汽车 / 小鹏 / 百度 Apollo 等都可能成为执行器。

**OLO 拥有的是人的 Intent；交通公司拥有的是 Mobility Capability。**

这个边界非常重要。

---

现在下一阶段 **SR-004 · In Transit** 就变得非常有意思了。

因为 Cybercab 开走以后，人突然获得了过去用于“驾驶”的几十分钟。**车不再首先是交通工具，而成为一个移动空间。**

OLO 接下来必须判断：

> 现在应该让你工作？休息？处理消息？准备会议？听音乐？还是干脆什么都不做？

这会第一次把 **OLO + autonomous vehicle + iPhone + Watch + AirPods + Mac/Cloud + Work Context** 全部连接起来，也会开始触碰一个更深的问题：

> **OLO 的目标到底是让人“效率更高”，还是让人“少操心”？**

我目前倾向后者。效率只是结果之一，**降低人的 Cognitive Load 才应该是 OLO 更底层的目标。**

navlistCybercab 最新进展turn0news21,turn0news22,turn0news24

如果你愿意，我们还可以持续跟踪 Cybercab 的实际部署和交互变化；这个领域现在变化很快。

---

## Turn e992cfa2-2be1-482a-b488-c58ff9985c26

已经设置好了 **Cybercab Deployment Watch**。

我会每天检查一次，但**只有出现对 OLO 有实际意义的新变化才通知你**，重点关注 Cybercab/Robotaxi 的真实部署、乘客交互、接驾与身份识别、车内 UI、自动驾驶能力、生态/API 开放以及监管变化，并同时告诉你：

> **“这个变化对 OLO 的产品设计意味着什么？”**

这样后续设计 SR-003 / SR-004 时，就可以逐渐从概念假设替换成真实世界能力。

接下来我们可以继续刚才的主线，进入 **SR-004 · In Transit（Cybercab 内的移动场景）**。

---

## Turn c0c0054d-ceaf-4b54-99a1-f8c83d2bfcc3

继续进入 **SR-004 · In Transit**。

这一段我认为要避免把 OLO 做成“车载 AI 助手”。Cybercab 只是一个很好的载体；真正要研究的是：

> **当人从 Home Context 进入 Mobility Context，而且不再需要驾驶之后，OLO 应该如何接管原本散落在人脑、手机、汽车和各种 App 之间的事务？**

核心目标仍然不是“提高效率”，而是：

# **减少人为了生活而管理生活的成本。**

---

# SR-004 · In Transit
## Leaving → Moving → Arriving

先延续刚才的时间线。

08:31。

用户坐进 Cybercab。

车门关闭。

车辆开始前往公司。

传统模式下，人一上车马上重新进入：

> **人找物。**

拿手机。

看路线。

看几点到。

回微信。

看邮件。

刷新闻。

看日历。

找音乐。

回复同事：

> “我大概 9:20 到。”

这里有个很值得注意的现象：

**自动驾驶把 Driving Task 消灭了，但没有消灭 Cognitive Task。**

反而可能把几十分钟重新交还给手机。

如果 OLO 最终只是让用户：

> 在 Cybercab 里多刷 40 分钟手机，

那它并没有完成我们真正想做的事情。

---

# 01 · OLO 首先判断的不是“给你什么内容”

而应该是：

> ## What kind of time is this?

这是 OLO 很重要的一种 Context。

同样 40 分钟通勤：

星期一早晨：

> 可能是 Prepare。

星期五晚上：

> 可能是 Relax。

刚结束高强度会议：

> 可能是 Recover。

马上见客户：

> 可能是 Prepare。

凌晨去机场：

> 可能是 Rest。

和朋友一起坐车：

> 可能是 Social。

所以：

### Mobility ≠ 一个场景。

OLO 需要理解：

**Mobility Context + Human State + Next State**

例如今天：

```text
Current
Commute

Destination
Office

ETA
09:18

Next important event
09:30 Product Review

Preparation required
Medium

Sleep
Below normal

Urgent messages
None

User state
Calm
```

OLO 得到：

> **Recommended Mode = Light Preparation + Rest**

注意：

### 这是 OLO 内部判断。

不是 UI 上弹出来：

> “请选择：工作 / 娱乐 / 休息 / 学习。”

否则又回到了操作系统时代。

---

# 02 · 上车之后，OLO 不应该立刻讲话

车开始行驶。

Cybercab 自动恢复适合用户的环境。

座椅。

温度。

媒体音量。

屏幕状态。

然后：

### Silence.

可能 30 秒以后，OLO 才说：

> “九点半的会正常。”

> “九点十八左右到。”

结束。

为什么只有这两句话？

因为用户现在真正关心的是：

**我来不来得及？**

而不是地图路线本身。

所以：

### Google Maps / Tesla

关注：

> **Route**

OLO 关注：

> **Meaning of the route to this person.**

这是非常重要的产品边界。

---

# 03 · OLO 应该开始出现「Attention Management」

现在手机收到：

**23 个 Notifications。**

传统系统：

> 全部给人。

稍微聪明一点：

> Notification Summary。

但我认为 OLO 应该更进一步：

> **不是 Summary，而是决定现在什么值得进入人的注意力。**

例如：

妈妈：

> “晚上回来吃饭吗？”

不紧急。

→ Hold。

购物 App：

> 优惠券。

→ Ignore。

工作群：

> 12 条讨论。

OLO 理解：

与 09:30 Meeting 无关。

→ Hold。

老板：

> “9:30 我们先聊一下 pricing。”

→ Relevant。

所以 OLO：

> **“九点半会议会聊 pricing。”**

没有：

> “您有 23 条未读消息。”

甚至没有：

> “老板给您发了一条消息。”

它直接把：

**Message → Meaning → Action Relevance**

完成了。

这可能是 OLO 非常核心的能力：

# Attention Firewall

---

# 04 · 但这里一定不能让 AI 变成信息独裁者

这是非常危险的。

如果 OLO 自己决定：

> “这条信息不重要。”

但其实用户认为很重要怎么办？

所以我们需要一个新的系统：

# Attention Policy

例如用户逐渐形成：

**家人紧急消息：Always interrupt**

**工作：工作时间 Contextual**

**社交：Hold**

**Marketing：Silent**

**金融风险：Immediate**

但它不能只是传统 Notification Settings。

OLO 需要学习：

> **什么事情对这个人意味着什么。**

并且始终允许用户说：

> “为什么没告诉我？”

OLO 必须能够回答：

> “我判断它不影响你上午的安排，所以留到了之后。”

然后：

> “以后这种也告诉我。”

OLO：

> “好。”

这就是：

### Explainable Personalization。

---

# 05 · 08:42：出现一个真正的 Agent Moment

Cybercab 行驶中。

突然：

**ETA 09:18 → 09:27**

前方道路发生问题。

09:30 Meeting。

现在 Intervention Score 快速升高。

传统地图：

> +9 min

红色路线。

OLO：

> **“可能会晚几分钟。”**

然后关键来了。

它不只是报告。

它已经计算了几个方案：

### Plan A
继续走。

预计 09:27 到。

走到会议室可能 09:32。

### Plan B
改变下车点。

预计 09:24。

步行 4 min。

### Plan C
继续乘车。

提前通知会议参与者。

### Plan D
09:30 直接在 Cybercab 里加入会议。

这就是：

# Problem → Options → Action

而不是：

# Problem → Notification。

---

# 06 · OLO 不应该把四个方案都扔给用户

如果 OLO：

> “方案 A……”

> “方案 B……”

> “方案 C……”

> “方案 D……”

用户又开始当项目经理。

正确体验可能是：

> OLO：「可能晚几分钟。」

> 「我可以让他们先开始。」

用户：

> **“好。”**

结束。

背后：

OLO → Work Communication

发送：

> 用户预计稍晚到达，请先开始会议。

如果权限足够。

---

# 07 · 这里第一次出现「代理身份」问题

这非常重要。

OLO 发出去的信息到底是谁说的？

不能让别人误以为：

> 用户本人亲手写了。

未来可能需要一种社会规范：

> **Sent by OLO for [Person]**

或者：

> **OLO Agent**

甚至不同等级：

**AI Drafted · Human Approved**

**AI Sent · Pre-authorized**

**AI Autonomous Action**

这不只是 UI 问题。

这是：

# Agent Social Protocol

因为当 OLO 开始真正代表人行动：

**身份、责任、授权、可追溯性**

都会成为产品基础设施。

这个需求应该进入未来 OLO OS。

---

# 08 · 如果一路正常，OLO 应该消失

这是我很希望 OLO 坚持的一点。

08:45。

一切正常。

OLO 不需要：

> “要不要听新闻？”

> “需要我总结邮件吗？”

> “想听音乐吗？”

这种主动推荐实际上仍然是在：

### 抢人的 Attention。

真正成熟的 OLO：

> **知道什么时候不提供价值。**

用户看窗外。

就让他看窗外。

用户闭眼。

车内环境稍微安静。

用户打开一本书。

OLO 不打扰。

用户拿出 iPhone。

OLO 也不需要抢占屏幕。

这会成为很反直觉的产品 KPI：

> **OLO Engagement 越高不一定越好。**

甚至可能相反。

---

# 09 · 我建议 OLO 不使用传统 DAU 思维

传统 App：

> Session ↑  
> Screen Time ↑  
> Engagement ↑  
> Notification CTR ↑

这些指标放到 OLO 身上可能全部有问题。

OLO 应该追求：

### Human Effort ↓

例如：

**App Opens / Day ↓**

**Manual Decisions ↓**

**Repeated Operations ↓**

**Context Switching ↓**

**Unnecessary Notifications ↓**

**Missed Important Events ↓**

以及一个很重要的新指标：

# Cognitive Load Saved

虽然它很难测量，但应该成为 OLO 产品哲学中的北极星指标之一。

甚至未来 OLO 可以告诉用户：

> **今天替你处理了 37 件不需要你操心的事情。**

不过我倾向于默认连这个也不要炫耀。

事情完成即可。

---

# 10 · 09:05：用户主动说话

例如：

> “今天下午是不是有什么事？”

这里体现 OLO 与 ChatGPT 类产品很大的交互差异。

OLO 已经拥有：

**Personal Context Graph**

所以它理解：

“今天” = 当前日程。

“下午” = 用户的 Personal Schedule。

“什么事” = Significant Event，而不是列出所有 Calendar Items。

OLO：

> “三点见客户。”

停顿。

> “两点二十左右得走。”

用户：

> “材料准备了吗？”

OLO：

> “还有一份报价没更新。”

用户：

> “到了公司提醒我。”

OLO：

> “好。”

整个对话没有：

**打开 Calendar。**

没有：

**打开 Project Management。**

没有：

**打开 Maps。**

没有：

**设置 Reminder。**

这就是：

### Context-native Computing。

---

# 11 · 更进一步：为什么还要“到了提醒我”？

成熟的 OLO 甚至应该理解：

> 报价需要 Mac。

现在在车上修改不合适。

因此自动创建：

**Contextual Intent**

不是：

> Reminder @ 09:18

而是：

> **When user reaches work context + Mac available → surface quotation task**

这很关键。

传统 Reminder：

### Time-based

OLO Reminder：

### Context-based

例如：

> “看到老婆的时候提醒我问护照。”

> “下次去超市提醒我买咖啡。”

> “我坐到 Mac 前的时候提醒我改报价。”

> “下次跟 Alex 聊天的时候提醒我问融资。”

这些才真正接近人的记忆方式。

我认为：

# Contextual Intent

应该成为 OLO OS 第七个核心概念。

---

# 12 · 09:16：开始进入 Arrival Window

Cybercab 距公司还有两分钟。

OLO 开始：

### Pre-Arrival Orchestration

注意：

它不是突然：

> “您即将到达目的地。”

而是开始准备下一个世界。

例如：

Mac：

**Work Context Ready**

Office access：

**Ready**

09:30 Meeting：

**Materials Ready**

AirPods：

如果正在播放内容 → 准备暂停。

Watch：

准备 Walking Guidance。

Cybercab：

准备 Drop-off。

OLO：

> **“两分钟。”**

如果用户正在闭眼：

可能轻微 haptic。

甚至不说话。

---

# 13 · Cybercab 停下

车门打开。

用户下车。

这里再次发生：

# Presence Handoff

刚才：

**Cybercab = Primary Environment**

现在：

**Watch / AirPods = Primary Presence**

进入办公室后：

**Mac / Office = Primary Environment**

所以：

```text
Home
 ↓
Watch / OLO One
 ↓
Cybercab
 ↓
Watch / AirPods
 ↓
Office
 ↓
Mac
```

但是：

### Intent 没有断。

这就是我们上一轮定义的：

# Context Continuity

用户不需要在每个设备：

> Login → Open → Restore State → Find Task。

人的世界连续。

OLO 也应该连续。

---

# 14 · 09:21：进入办公室

Mac 感知用户到达。

屏幕不是弹出：

> “Welcome back!”

这种没有价值的 AI 仪式感。

而是：

报价文件已经在合适的位置。

OLO：

> **“报价。”**

用户：

> “哦对。”

打开。

继续工作。

刚才 08:55 在车里产生的 Intent：

> **到了公司提醒我修改报价**

现在完成。

于是：

### In Transit → Work

SR-004 结束。

---

# 到这里，我们应该增加三个 OLO OS 核心能力

前面已经有：

1. **Personal Context Graph**
2. **State Transition**
3. **Intervention Model**
4. **Routine Memory**
5. **Autonomy Profile**
6. **Action Risk Model**

现在增加：

### 7. Contextual Intent

不是：

> 9:30 提醒。

而是：

> **在正确 Context 出现时继续未完成 Intent。**

---

### 8. Attention Firewall

不是：

> 管理通知。

而是：

> **决定什么事情现在值得占用人的注意力。**

---

### 9. Presence Handoff

不是：

> Device Sync。

而是：

> **OLO 根据人的环境，把最合适的设备变成当前交互界面，同时保持 Context 连续。**

这三个非常关键。

---

# 而且现在我们开始看见 OLO 的真正架构了

它越来越不像：

```text
OLO App
 ├ Chat
 ├ Home
 ├ Car
 ├ Calendar
 └ Settings
```

而越来越像：

```text
                HUMAN
                  │
          Personal Context
                  │
           ┌──────▼──────┐
           │   OLO Core   │
           └──────┬──────┘
                  │
      ┌───────────┼───────────┐
      │           │           │
 Understand   Anticipate    Memory
      │           │           │
      └───────────┼───────────┘
                  ↓
          Intervention Model
                  ↓
             Planning
                  ↓
          Autonomy / Risk
                  ↓
           Orchestration
                  ↓
 ┌────────┬───────┼───────┬────────┐
 Home   Mobility  Work   Devices  Services
```

而：

**OLO One / iPhone / Watch / AirPods / Mac / Cybercab**

越来越像：

> **OLO 的 Eyes / Ears / Voice / Hands / Surfaces**

而不是六个独立产品。

---

# SR-005 应该进入 Work

但我认为「工作」不能简单做成：

> AI 帮你写邮件、总结会议、写 PPT。

ChatGPT、Copilot 等已经在做这些事情。

真正属于 OLO 的问题应该是：

> **一个人在一天工作中，为什么需要不断自己记住下一件事、寻找信息、切换软件、追踪别人、判断优先级、准备会议、跟进会议结果？**

也就是说：

# **今天人是自己工作的 Project Manager。**

如果 OLO 的目标是「物找人」，那么 Work 场景真正应该挑战的是：

> **人是否还需要自己管理自己的工作流？**

这会比“AI 帮我写文档”更接近 OLO 的核心，而且很可能是整个项目商业价值最高的一块。

---

## Turn 0a272612-00f1-46b0-abb3-9c0328a9f5bf

那我们进入 **SR-005 · Work**。

而且这一阶段我想把尺度再提高一点：**不要从“AI 如何帮助办公”出发，而从“为什么今天一个人必须亲自管理自己的工作”出发。**

# SR-005 · Work
## Ready to Work → Doing → Coordinating → Completing

今天典型的知识工作者早上坐到电脑前，会发生什么？

打开 Mac。

然后：

> Slack / 微信 / 飞书有没有消息？  
> 邮箱有没有邮件？  
> 今天有哪些会议？  
> Jira / Linear 有什么任务？  
> 昨天做到哪里？  
> 谁在等我？  
> 我在等谁？  
> 哪件事情最重要？  
> 有没有什么快超期了？

然后自己决定：

> **“我现在应该做什么？”**

这件事非常值得注意。

企业购买了几十套软件来管理工作，但最后把这些软件拼成一个完整工作模型的，仍然是：

# 人脑。

---

## 01 · OLO 不应该成为另一个 Productivity App

如果 OLO 最后变成：

```text
OLO Work

Inbox
Tasks
Calendar
Projects
Documents
AI Chat
```

那其实失败了。

因为我们只是创造了：

> **又一个需要人打开和管理的软件。**

真正的 OLO 应该反过来：

> **工作主动找到人。**

但不是 Notifications 找人。

而是：

### 正确的事情，在正确的 Context 下找到人。

---

# 02 · 09:21，用户坐到 Mac 前

延续上一幕。

OLO 已经知道：

**09:30 Product Review**

以及刚才 Cybercab 里的 Contextual Intent：

> “报价还没更新。”

Mac 唤醒。

传统 OS：

**Desktop。**

OLO 不应该立刻出现一个巨大 Dashboard。

它只把：

### 报价文件

放到当前 Context。

OLO：

> **“报价。”**

用户：

> “哦对。”

开始修改。

这件事情非常小，却非常符合 OLO。

因为用户没有：

> 打开 Reminder  
> → 找 Task  
> → 找文件  
> → 找昨天的位置。

---

# 03 · 这里出现一个新的核心能力

我们可以叫：

# Working Context

OLO 不只是知道：

> User is at Mac.

而应该知道：

> **User is currently working on Pricing for Product Review.**

所以：

```text
Person
  ↓
Work Context
  ├── Goal
  ├── Project
  ├── People
  ├── Documents
  ├── Messages
  ├── Decisions
  ├── Dependencies
  └── Deadline
```

这跟今天的文件系统完全不同。

今天：

> 文件属于 Folder。

未来 OLO：

> **信息属于 Context。**

一份 Excel、一封邮件、一段 Slack、一份 Figma、一次会议记录，可能物理上存在五个系统里。

但对人而言：

> **它们是一件事。**

这是 OLO 应该理解的。

---

# 04 · 09:27，会议快开始

传统系统：

> 🔔 Meeting in 5 minutes.

这其实仍然把责任交给人：

> “我通知你了，剩下你自己处理。”

OLO 应该判断：

**User State：正在修改报价**

**Meeting：3 min**

**Document：尚未保存最终版**

**Meeting Link：available**

**AirPods：connected**

**Participants：ready**

于是它开始准备。

报价保存。

相关材料进入 Ready。

会议链接准备。

AirPods 切换。

其他非紧急通知进入 Hold。

然后：

> **“差不多了。”**

用户：

> “嗯。”

进入会议。

---

# 05 · Meeting 应该成为一个 OLO State

这时候：

### Work → Meeting

OLO 的行为规则整体改变。

例如：

普通消息：

→ Hold。

家庭普通事件：

→ Hold。

快递：

→ Hold。

营销：

→ Ignore。

Cybercab：

→ 不相关。

但是：

孩子学校紧急电话：

→ Interrupt。

服务器生产事故：

→ Interrupt。

所以 Attention Firewall 不是简单的：

> Focus Mode。

而是：

> **Context-sensitive Attention Policy。**

---

# 06 · OLO 在会议里做什么？

这里特别容易变成今天的：

> AI Meeting Notes。

当然，转录、总结、Action Items 都应该有。

但这只是基础能力。

OLO 真正应该理解：

# What changed because of this meeting?

例如会议进行了 25 分钟。

大家讨论了很多东西。

最后实际上只发生了三个变化：

> **Pricing 延后到周五。**

> **Alex 负责重新计算成本。**

> **用户周三前完成 Prototype。**

OLO 真正需要保存的不是：

> 12,000 字 Transcript。

而是：

```text
World State Before Meeting
        ↓
      Meeting
        ↓
World State After Meeting
```

也就是：

# State Change Extraction

这可能是 OLO Work 一个非常重要的概念。

---

# 07 · 会议结束后，不应该弹出一份 Summary

10:18。

会议结束。

今天的 AI 产品：

> ✨ Your meeting summary is ready!

然后又要求：

> **人去读 AI 的总结。**

这还是增加 Cognitive Load。

OLO 应该已经完成：

**Alex → Cost calculation**

**User → Prototype Wednesday**

**Pricing decision → Friday**

**Project Context → Updated**

如果用户不需要知道额外信息：

### 什么都不弹。

因为：

> **用户刚刚就在会议里。**

为什么还要让他重新阅读一次自己参加过的会议？

这是很多 AI 产品今天非常奇怪的地方。

---

# 08 · 但用户漏掉了一件重要事情

例如会议过程中用户正在回复一条紧急消息。

这时候讨论确定：

> Prototype deadline moved Tuesday → Monday.

OLO 知道：

**用户注意力当时不在会议。**

会议结束后：

> **“Prototype 提前到周一了。”**

就这一句话。

这又回到：

# Tell me what I need to know, not everything you know.

---

# 09 · 会议产生的工作，不需要用户自己建 Task

这是我认为非常关键的一步。

今天：

会议结束。

然后人：

> 打开 Jira  
> → Create Issue  
> → 写标题  
> → Deadline  
> → Assignee  
> → Link Figma。

其实很多这些信息 AI 已经知道。

OLO 可以形成：

### Intent Object

```text
Goal:
Prototype ready

Owner:
User

Due:
Monday

Context:
OLO Product

Dependencies:
Pricing decision

Artifacts:
Figma Prototype
PRD

Status:
Not started
```

注意：

我甚至不一定希望 OLO 把它叫：

> Task。

因为人的工作不是 Tasks 的集合。

更接近：

> **Intent + Commitment + Dependency。**

---

# 10 · 谁在等谁？

这是现代工作最大的隐性 Cognitive Load 之一。

比如：

Prototype 需要 Alex 的 Pricing。

今天人需要自己记：

> “Alex 还没给我。”

然后：

> Slack 搜 Alex。

> “Hi Alex, any update?”

OLO 已经知道：

```text
Prototype
    ↓ depends on
Pricing
    ↓ owned by
Alex
```

所以：

### 用户根本不需要记住这件事。

这应该进入：

# Dependency Graph

---

# 11 · 下午 14:00

Alex 还没交 Pricing。

Prototype 明天需要开始。

OLO 判断：

> Dependency becoming risky.

但它不应该马上：

> “Alex 还没有完成任务。”

它首先判断：

**Deadline Risk**

**Alex Status**

**Previous Commitment**

**Urgency**

然后可能：

### 14:30

OLO：

> **“Pricing 还没回来。”**

用户：

> “催一下。”

OLO：

> “好。”

然后发送。

---

# 12 · 更成熟以后连「催一下」都可能消失

如果用户授权：

> **低风险工作协调可以自动处理。**

那么 OLO 可以代表用户：

> “Prototype 明天要开始，pricing 今天能给吗？”

Alex 的 OLO 收到。

这时候就出现一个非常重要的未来：

# Agent ↔ Agent

不是：

Human → Slack → Human。

而可能是：

```text
User
 ↓
OLO
 ↓
Alex OLO
 ↓
Alex
```

甚至简单协调：

```text
OLO ↔ OLO
```

人根本不需要参与。

---

# 13 · 这可能会彻底改变企业软件

今天大量 SaaS 本质上是在帮助：

> **人管理人与人的协作状态。**

Jira：

谁做什么。

Slack：

谁说了什么。

Calendar：

谁什么时候见谁。

Notion：

大家知道什么。

Email：

谁需要谁做什么。

未来如果 Agent 真正理解：

**Intent + Commitment + Dependency + Context**

很多协调活动可能直接发生在 Agent Layer。

所以 OLO Work 不应该目标成为：

> Better Jira。

而应该问：

> **为什么人还需要不断更新 Jira？**

这其实已经开始触碰 OLO 非常大的长期价值。

---

# 14 · 但 Agent ↔ Agent 有一个危险

假设：

你的 OLO：

> “Alex 今天必须给 Pricing。”

Alex 的 OLO：

> “Alex 今天有更重要的工作。”

两个 Agent 开始：

> Negotiation。

那谁决定优先级？

所以必须有：

# Human Authority

OLO 永远不能因为：

> “AI 认为这样效率最高”

就擅自改变人与人之间的承诺。

因此：

### Operational Coordination

可以自主。

### Commitment Creation

需要授权。

例如：

OLO 可以问：

> “Alex 能不能下午三点给？”

但是不能未经用户同意：

> “我承诺周一交付。”

这与之前 Action Risk Model 完全一致。

---

# 15 · 中午 11:46，一个新的问题出现

用户正在 Coding。

突然想到：

> **“机场那个事情我晚上得确认一下。”**

今天：

打开 Reminder。

或者：

忘记。

OLO：

用户直接说：

> “晚上提醒我确认机场那个。”

OLO 理解：

**“机场那个”**

不是一个字符串。

它可能关联：

```text
Upcoming Flight
Hotel
Cybercab
Passport
Travel Plan
```

然后：

> “好。”

什么时候提醒？

不一定 18:00。

OLO 可以理解：

> **Evening + Low Work Load + Home Context**

于是可能：

20:12。

用户吃完饭坐到沙发。

OLO：

> **“机场那个。”**

甚至三个字。

因为 Context Continuity 仍然存在。

---

# 16 · 工作中真正的 OLO 体验可能极其安静

这是我越来越确定的一点。

一个非常好的 OLO Work Day：

用户可能只听到：

> “报价。”

> “差不多了。”

> “Prototype 提前到周一。”

> “Pricing 还没回来。”

一天可能就这些。

但后台 OLO 已经处理：

**200 messages**

**34 emails**

**6 calendar changes**

**3 meetings**

**12 documents**

**17 dependencies**

**5 household events**

**transportation**

**personal reminders**

用户没有被这些东西淹没。

这才是：

# Attention Firewall + Orchestration。

---

# 17 · 我们甚至可以定义一个 OLO Work KPI

不是：

> AI generated 32 summaries.

而是：

### Cognitive Operations Avoided

例如过去一天：

用户需要：

**检查 Inbox 18 次**

**切换 App 76 次**

**手动创建 Task 9 次**

**寻找文件 11 次**

**跟进别人 7 次**

**确认 Calendar 12 次**

OLO 后：

大部分消失。

用户真正做的事情变成：

> **Think → Decide → Create → Communicate → Rest**

而不是：

> Manage → Search → Remember → Check → Organize → Follow up。

---

# 18 · 这里出现了 OLO 的第十、第十一个核心能力

在之前 9 个 OLO OS 能力上继续增加：

### 10. Intent Graph

OLO 不以 App / 文件为中心组织世界。

而是：

> **Goal → People → Information → Device → Service → Action**

例如：

```text
          Launch OLO One
                │
        ┌───────┼───────┐
       PRD    Prototype   Pricing
        │         │          │
      Notion    Figma       Alex
        │         │          │
     Meeting ─ Decision ─ Commitment
```

对于 OLO：

这些不是六个 App。

它们：

> **是一件事情。**

---

### 11. Commitment & Dependency Engine

理解：

> **谁答应了什么。**

> **什么时候需要完成。**

> **什么依赖什么。**

> **什么正在阻塞什么。**

然后只有真正需要人的时候：

### 找人。

这就是「物找人」在工作世界里的形式。

---

# 19 · 现在 OLO 的核心模型开始非常漂亮

我们最开始说：

> **物找人。**

经过起床 → Ready → 出门 → Cybercab → Work，现在可以把它进一步形式化：

```text
WORLD
  │
  ↓
Sense
  │
  ↓
Context
  │
  ↓
Intent Graph
  │
  ↓
Predict
  │
  ↓
Plan
  │
  ↓
Risk / Permission
  │
  ├──────── No human needed
  │               ↓
  │             ACT
  │
  └──────── Human needed
                  ↓
              INTERVENE
                  ↓
                HUMAN
```

这里有一个非常重要的反转：

传统计算：

# Human → Computer → World

OLO：

# World → OLO → Human（必要时）

以及：

# World → OLO → World（不需要人时）

这第二条，可能才是 OLO 最革命性的部分。

---

# 下一站我反而不建议继续做「午餐」

因为现在有一个比继续枚举场景更重要的问题浮出来了：

## **OLO 到底如何知道这一切？**

我们目前一直假设 OLO 知道：

> 用户睡没睡、在哪里、准备去哪、日程、交通、家庭状态、工作项目、谁承诺了什么、哪些消息重要、用户有没有注意会议内容……

但真正做产品时，这绝不能成为一句：

> **“AI understands context.”**

这是整个 OLO 能不能成立的技术与产品地基。

所以我建议主线在 SR-005 后第一次暂停场景推演，插入一个非常关键的专题：

# **OLO Context Architecture v0.1**

我们把 OLO 的“感官和大脑”拆开：

**OLO 到底从哪里获得 Context → 哪些数据应该在 One 本地 → 哪些来自 iPhone / Watch / Mac → 哪些来自 Home / Car → 哪些来自第三方 Service → Memory 怎么形成 → 哪些数据绝不能长期保存 → Confidence 怎么计算 → OLO 怎么区分“知道”与“猜测”。**

尤其最后一个非常关键：

> **OLO 必须知道自己什么时候不知道。**

否则一个“物找人”的主动 AI，一旦 Context 判断错误，会比今天回答错误的 Chatbot 危险得多。

我认为现在正好到了应该把这一层研究清楚的时候。

---

## Turn 2a7ce63a-13fd-47a5-8bc0-e3a60ce02164

是的。到这里我建议正式把 OLO 从「场景探索阶段」切到一次 **Architecture Foundation 阶段**。

前面的场景先冻结，不继续无限扩展。因为我们已经证明了一个基本假设：

> **如果 OLO 能持续、可靠、低打扰地理解人的 Context，并获得足够的行动权限，那么“物找人”这个产品范式是成立的。**

现在真正的问题变成：

> **OLO 凭什么知道？凭什么判断？凭什么行动？**

这三件事就是地基。

# OLO Foundation 01 · Context Architecture

我建议先不要从 LLM、模型选型、数据库这些技术名词出发，而是先定义一个产品对象：

## Personal Context

在任意时刻 \(t\)，OLO 对一个人的理解可以抽象成：

```text
Context(t)

Who
Where
When
State
Activity
Environment
Intent
Schedule
Relationships
Devices
World Events
History
Permissions
Confidence
```

例如刚才 08:20 的你，不应该只是数据库里的：

```text
location = home
time = 08:20
weather = rain
calendar = work
```

OLO 真正应该形成的是：

> 用户已经起床，正在准备出门；今天去公司，09:30 有重要会议；正常情况下应该约 08:30 离家；外面下雨；Cybercab 大约需要 6 分钟到达；用户还在厨房；雨伞仍在玄关；目前没有异常情况。

这两者差别巨大。

前者是：

**Data**

后者才是：

# Context

---

# 1. 第一层：Sensing

OLO 首先需要建立自己的“感官”。

但感官不等于 OLO One 上塞满传感器。

整个 OLO Ecosystem 都是它的感官。

```text
                         OLO
                          │
             ┌────────────┼────────────┐
             │            │            │
          Physical      Digital      World
             │            │            │
        OLO One        iPhone       Weather
        Watch          Mac          Traffic
        Home           Apps         Mobility
        Car            Calendar     Places
        AirPods        Messages     Services
```

所以应该把 Sensor 分成三类。

### A. Physical Context

回答：

> **现实世界正在发生什么？**

可能来自：

OLO One：
Presence / Audio / Vision / Light / Environment

Watch：
Motion / Wear State / Sleep / Activity

iPhone：
Location / Motion / Proximity

Home：
Door / Lights / Appliances / Occupancy

Car：
Passenger / Journey / Destination

这里已经能看出：

> **OLO One 不一定需要自己拥有所有传感器。**

它应该成为 Sensor Network 的一个节点。

---

### B. Digital Context

回答：

> **人的数字世界正在发生什么？**

Calendar

Messages

Email

Tasks

Documents

Browser

Apps

Workspaces

Media

Notifications

Device State

例如：

> 用户正在 Figma 修改 OLO Prototype。

比：

> Mac 正在使用。

有价值一百倍。

---

### C. World Context

回答：

> **外部世界发生了什么？**

Weather

Traffic

Flight

Public Transport

Cybercab / Mobility

Places

Deliveries

Events

News

Emergency

等等。

这部分会大量依赖第三方 Service / API / Agent。

---

# 2. 第二层不是 LLM，而是 Context Fusion

这是非常重要的架构判断。

假设：

Watch：

> 用户站起来了。

OLO One：

> 卧室没人。

Home：

> 浴室灯亮。

iPhone：

> 仍在家。

时间：

> 07:43。

单独看都没什么。

融合以后：

> **User likely awake and entering morning hygiene routine.**

所以需要：

# Context Fusion Engine

```text
Raw Signals
    ↓
Normalize
    ↓
Temporal correlation
    ↓
Spatial correlation
    ↓
Identity correlation
    ↓
Pattern / Model inference
    ↓
Context State
```

它把大量弱信号组合成：

> **人的状态。**

这可能比单纯换一个更大的 LLM 重要得多。

---

# 3. OLO 必须拥有 State Model

前面所有场景其实都在暗示这件事。

人的一天不是：

```text
Open App
Close App
```

而是：

```text
Sleeping
   ↓
Waking
   ↓
Getting Ready
   ↓
Leaving
   ↓
Commuting
   ↓
Working
   ↓
Meeting
   ↓
...
```

所以 OLO Core 应该持续维护：

# Human State Machine

但不能是死板状态机。

应该允许：

```text
Primary State:
Working

Secondary:
In Meeting

Location:
Office

Attention:
Focused

Social:
With colleagues

Mobility:
Stationary

Urgency:
Normal
```

也就是：

### Multi-dimensional State

而不是：

`state = work`

这对后面的 Intervention 至关重要。

---

# 4. 第三层：Personal Context Graph

State 解决：

> **现在发生什么？**

Graph 解决：

> **这些东西为什么有关？**

例如：

```text
                   YOU
                    │
              works on
                    ↓
               OLO Project
              /     │      \
             /      │       \
        Prototype  PRD    Pricing
            │               │
         Figma            depends on
                            │
                           Alex
```

再比如生活：

```text
                    YOU
                  /     \
              Home       Flight
                │           │
             Family      Airport
                │           │
              Dog       Cybercab
```

OLO 看到的不是：

> 6 个 App + 19 个 API。

而应该是：

> **一个人的世界。**

---

# 5. 第四层：Memory

这是一个必须非常谨慎的地方。

OLO 不应该：

> **Everything → Forever.**

否则它会变成极其危险的监控系统。

我建议从产品层直接定义四种 Memory。

### M0 · Ephemeral

秒 / 分钟级。

例如：

> 用户刚刚走进厨房。

用完即消失。

---

### M1 · Session Context

一次状态周期。

例如：

> 今天早晨正在准备上班。

结束后大量原始 Context 删除。

---

### M2 · Personal Pattern

长期有价值的规律。

例如：

> 工作日通常需要约 45 分钟准备。

但保存的是：

**Pattern**

而不一定保存：

> 过去 187 天每一天几点刷牙。

这个区别非常重要。

---

### M3 · Explicit Memory

用户明确希望 OLO 长期知道。

例如：

> “以后早上不要跟我说太多话。”

> “工作日我一般去公司。”

> “家人的电话永远优先。”

这种才进入长期 Personal Model。

---

# 6. 我甚至建议定义一个原则

# Store meaning, discard surveillance.

例如：

不要长期保存：

> 2026-09-09 07:42:13 用户进入卫生间。

可以学习：

> **用户工作日晨间准备通常约 45 分钟。**

不要保存：

> 用户过去一年所有房间移动轨迹。

可以学习：

> **睡觉时不希望被普通通知打扰。**

这样 OLO 才有机会做到：

**Personalization without Surveillance。**

这会成为 OLO 很重要的品牌价值。

---

# 7. 第五层：Confidence

这是主动 AI 和 Chatbot 最大的差异之一。

ChatGPT 猜错：

> 用户可能觉得回答错了。

OLO 猜错：

> 可能把车叫来了。

所以任何 Context 都不应该只是：

```text
User is leaving home
```

而应该：

```text
Hypothesis:
User is leaving home

Confidence:
0.91

Evidence:
- Calendar destination
- Typical departure window
- User dressed
- Bag moved
- Entryway presence

Contradiction:
- None
```

于是：

### Confidence 0.45

不行动。

### 0.70

准备。

### 0.88

轻量询问。

### 0.97 + Pre-authorized

行动。

这意味着：

# Confidence × Risk

必须共同决定 Agent 行为。

---

# 8. 我们可以把之前的 Action Risk Model 正式接进来

形成一个非常重要的矩阵：

| | Low Confidence | Medium | High |
|---|---|---|---|
| **低风险** | Wait | Prepare | Act |
| **中风险** | Wait | Ask | Act / Notify |
| **高风险** | Wait | Ask | Confirm |
| **Critical** | Never | Never | Explicit Authorization |

例如：

**把灯调暗**

High confidence + Low risk：

→ 自动。

**叫 Cybercab**

High confidence + Medium risk：

→ 根据 Autonomy Profile 决定。

**取消航班**

即使：

Confidence = 99.9%

→ 仍然需要明确授权。

所以：

> **AI 越确定，不等于 AI 权力越大。**

这是非常重要的 OLO 原则。

---

# 9. 第六层：Intervention Engine

到这里才决定：

> **找不找人。**

输入可能是：

```text
Need
Urgency
Confidence
Risk
User State
Attention State
Permission
History
Alternative Actions
Interruption Cost
```

然后输出：

```text
SILENT
AMBIENT
PREPARE
SUGGEST
ASK
INTERRUPT
ACT
ACT + NOTIFY
```

所以 OLO 不是一个不断生成文本的系统。

它大多数时间的输出应该是：

# SILENT

这甚至应该成为测试指标。

---

# 10. 第七层：Planner

只有真正需要改变世界的时候，才进入：

# OLO Planner

例如：

> **用户需要 09:30 到公司。**

Planner 可以形成：

```text
Goal
↓
Arrive office 09:20

Constraints
↓
Meeting 09:30
Weather: rain
Traffic: slow

Plan
↓
Wake
Prepare
Cybercab
Home Away
Travel
Arrival
Meeting Ready
```

这不是一次 Prompt。

而是一个：

# Persistent Plan

世界变化：

> Traffic +12 min

Planner：

### Replan。

用户：

> “今天在家办公。”

Planner：

### Replan。

会议取消：

### Replan。

这会是 OLO 和普通 Voice Assistant 的巨大区别。

---

# 11. 第八层：Orchestrator

Planner 决定：

> **应该发生什么。**

Orchestrator 决定：

> **谁来做。**

例如：

```text
OLO Intent
"I need to leave"

       ↓

Planner

       ↓

Orchestrator
 │
 ├─ Tesla / Mobility
 ├─ Apple Home
 ├─ Xiaomi Home
 ├─ Calendar
 ├─ Maps
 ├─ Messages
 ├─ Watch
 ├─ iPhone
 └─ OLO One
```

所以长期来看，OLO 很可能需要自己的：

# Tool / Capability Protocol

OLO 不应该关心：

> “打开 Tesla App 第三个 Tab。”

而应该请求：

```text
Mobility.requestRide(
    destination,
    arrivalGoal,
    preferences
)
```

也就是说：

> **OLO 操作 Capability，而不是 UI。**

这也是为什么未来开放 API / Agent Protocol 对 OLO 至关重要。

---

# 12. 第九层：Permission & Trust

我认为这甚至应该与 Intelligence 同级。

今天：

> App 请求 Location Permission。

OLO：

> **AI 请求 Decision Permission。**

例如用户可以授权：

### Home

OLO 可以自动控制灯光和温度。

### Mobility

正常工作通勤可以自动安排车辆。

### Work

可以自动整理工作 Context。

### Communication

可以草拟，但不能发送。

### Purchases

必须确认。

### Financial

必须明确授权。

### Health

只能建议，不自动决定。

这其实是在定义：

# How much of my life can OLO operate?

这是一个非常深的产品问题。

---

# 13. 最底层：Audit

OLO 必须回答：

> **“你为什么这么做？”**

比如用户：

> “为什么车已经来了？”

OLO：

> “你九点半有会议，今天路上比平时慢，而且你允许我在工作日自动安排通勤。”

然后用户：

> “以后别自动叫。”

权限立即变化。

因此任何重要 Action 都应该存在：

```text
Action
Reason
Context
Confidence
Permission
Tool
Result
Timestamp
```

不是为了给用户每天看日志。

而是为了：

### Trust / Explainability / Recovery。

---

# 14. 于是 OLO Core v0.1 已经可以画出来了

```text
                    WORLD
                      │
     ┌────────────────┼────────────────┐
     ↓                ↓                ↓
 Physical          Digital          External
 Sensors           Context          Services
     │                │                │
     └────────────────┼────────────────┘
                      ↓
              Context Fusion
                      ↓
               Human State
                      ↓
          Personal Context Graph
                 ↙          ↘
             Memory        Intent
                 \          /
                  ↓        ↓
                  Prediction
                      ↓
               Confidence
                      ↓
             Intervention Engine
                      ↓
                 Planner
                      ↓
           Permission / Risk
                      ↓
               Orchestrator
                      ↓
     ┌────────────────┼────────────────┐
     ↓                ↓                ↓
  Devices          Services          Agents
     │                │                │
     └────────────────┼────────────────┘
                      ↓
                    WORLD

              ↕ Audit / Trust ↕
```

这已经开始像真正的 **OLO Runtime / OLO OS**，而不是一个 App 架构了。

---

# 15. OLO One 的角色也因此清晰很多

现在不要急着说：

> 需要 2K Camera、6 Mic Array、某某芯片。

应该先定义：

### OLO One 必须提供什么能力？

我目前看到至少四类：

**Presence**  
让 OLO 在没有手机操作时仍然存在于空间。

**Sensing**  
补充手机/手表无法理解的空间 Context。

**Ambient Interaction**  
光、声音、视觉状态，让 AI 可以极低成本地“找人”。

**Trust / Privacy**  
让用户非常明确地知道 OLO 什么时候在感知，以及能够物理关闭某些能力。

这比先确定摄像头规格重要得多。

---

# 16. 而 MVP 也因此可能完全不同

我们其实**不应该一开始造硬件**。

你本身是软件工程背景，这反而很适合现在的路线。

第一阶段完全可以：

```text
iPhone
+
Apple Watch
+
Mac
+
Home APIs
+
Calendar
+
Location
+
Notifications
+
LLM / Models
        ↓
   OLO Core Prototype
```

去验证最关键的假设：

> **OLO 能不能正确理解 Context？**

> **能不能知道什么时候应该找人？**

> **用户愿不愿意把部分行动权交给它？**

如果这三件事验证失败：

造一个漂亮的小方块没有意义。

如果成功：

### OLO One 的硬件需求会从真实数据中长出来。

---

## 所以现在我认为项目应该正式分成三条研究线

**Product Foundation**

继续定义 Human State、Intervention、Autonomy、Trust、场景和失败边界。

**Intelligence Foundation**

Context Fusion、Personal Context Graph、Memory、Intent Graph、Planner、Confidence、Agent Runtime。

**Platform Foundation**

iOS / watchOS / macOS / Home / Mobility / Third-party Capability Integration。

而 **OLO One Hardware** 暂时作为第四条、稍晚进入。

下一步最值得做的不是继续抽象架构，而是把这个架构拿去接受一次非常残酷的检验：

# **“OLO 到底能获得哪些真实数据？”**

逐项检查 **iPhone / Apple Watch / Mac / HomeKit / 小米 Home / Calendar / Email / Messages / Location / Camera / Microphone / Cybercab**：

**哪些今天就有公开 API → 哪些只能有限获取 → 哪些 Apple sandbox 根本不允许 → 哪些需要 OLO One 自己补足 → 哪些在隐私上即使技术能做也不应该做。**

这一轮做完，我们就能得到第一份真正可以指导开发的：

> **OLO Context Capability Matrix v0.1**

这会把现在的产品愿景第一次压到**2026 年现实技术边界**上。我认为这是下一步最关键的工作。

---

## Turn 00c64698-daac-49fd-85b4-9892371e2abc

来。这个阶段我查了 Apple、Tesla、Google 等当前开发者资料后，结论其实很关键：

> **2026 年已经足够做出一个“能验证 OLO 核心假设”的软件 MVP；但还不足以仅靠一个普通 iOS App 实现我们刚才描述的完整 OLO。**

问题不主要是模型不够聪明，而是 **OS 权限、后台执行、跨 App Context 和第三方服务开放程度**。

所以我们做第一版 **OLO Context Capability Matrix v0.1**。

---

# 一、先给结论：OLO 现在能做到多少？

我把能力分成四档：

**🟢 NOW** — 今天公开 API 可以正式做  
**🟡 LIMITED** — 能做，但受 OS / 权限 / 数据质量限制  
**🟠 PARTNER** — 技术存在，但需要厂商/API/商业合作  
**🔴 OLO ONE** — 现有消费设备无法可靠提供，需要未来硬件补足

| Context | 2026 可行性 | 主要来源 |
|---|---|---|
| 时间 | 🟢 | System |
| Calendar | 🟢 | EventKit / Google |
| Reminders | 🟢 | EventKit |
| GPS / 地理围栏 | 🟢 | Core Location |
| Weather | 🟢 | Weather/API |
| Traffic | 🟢 | Maps/API |
| Home Device State | 🟢/🟡 | HomeKit / Matter |
| Sleep | 🟢/🟡 | HealthKit / Watch |
| Activity | 🟢 | HealthKit / Watch |
| Heart rate etc. | 🟢 | HealthKit |
| Gmail | 🟢 | Gmail API |
| 工作 SaaS | 🟢/🟠 | 各厂商 API |
| Tesla Vehicle | 🟢/🟠 | Fleet API |
| Cybercab dispatch | 🟠 | Robotaxi 服务能力 |
| “用户正在用什么 App” | 🟡/🔴 | iOS sandbox 限制 |
| 读取其他 App 通知 | 🔴 | iOS sandbox |
| iMessage 全量 Context | 🔴 | Apple 平台限制 |
| 房间级 Presence | 🟡/🔴 | Home sensors / OLO One |
| “用户正在做饭” | 🟡/🔴 | Context inference |
| “用户准备出门” | 🟡 | Sensor fusion |
| 持续环境视觉理解 | 🔴 | OLO One |
| 持续环境音频理解 | 🔴 | OLO One |
| 真正 Always-on Agent | 🔴 | iOS 后台模型限制 |

最后三四项非常重要。

因为它们开始回答：

> **为什么最终可能真的需要 OLO One？**

---

# 二、iPhone：强大的 Personal Node，但无法成为完整 OLO

iPhone 可以提供非常多 Context。

### 🟢 Location

Core Location 可以做：

**当前位置、Significant Location Change、Region Entry/Exit、后台 Location。**

Apple 明确允许部分场景使用后台位置，包括需要即时处理区域进入/离开等情况。citeturn0search2turn0search6

所以：

> Home → Leaving

这个 State Transition 是可以做 MVP 的。

例如：

```text
Home geofence
       ↓
User exits
       ↓
Leaving hypothesis ↑
       ↓
Calendar + time + routine
       ↓
OLO evaluates next intent
```

### 但问题来了。

普通 iOS App **不能无限期像 daemon 一样在后台运行自己的 Agent loop**。

Apple 明确说明，大多数 App 进入后台后会被 suspend；Background Modes 只针对位置、音频等有限类别。citeturn0search6

所以我们想象中的：

```text
while true {
    observeWorld()
    understandHuman()
    predictNeed()
    decide()
    act()
}
```

不能简单作为 iOS App 常驻运行。

这是第一堵墙。

---

# 三、Apple Watch：OLO MVP 非常重要

我现在比之前更确定：

> **OLO 第一阶段应该认真支持 Apple Watch。**

因为 Watch 给 OLO 一个手机没有的东西：

# Body Context

HealthKit 在用户授权后可以读取具体允许的健康数据类型；Apple 也提供后台 HealthKit 相关能力。citeturn1search5turn0search18

所以我们可以获得类似：

**Sleep**

**Activity**

**Workout**

**Heart Rate**

**Movement**

等等。

这对：

> Sleeping → Awake

非常有价值。

但是 Watch 同样不是 unrestricted always-on computer。

Apple 的 watchOS 文档明确说明，App 主要以前台运行为主，后台只开放特定任务、workout、audio、location 等场景。citeturn0search1

因此：

> **Watch = OLO Body Sensor + Intervention Surface**

非常适合。

但：

> **Watch ≠ OLO Brain。**

---

# 四、Calendar：第一阶段非常好用

这是我认为 MVP 最应该优先接的 Context。

Apple 的 EventKit 在获得授权以后，可以访问 Calendar / Reminders；读取需要 Full Access，用户也可以仅授予写入权限。citeturn0search11turn0search19

这意味着我们可以真实实现：

```text
09:30 Meeting
        +
Home location
        +
Traffic
        +
Routine
        ↓
OLO
        ↓
Suggested Departure
```

这已经足够做我们之前的：

> **Dynamic Wake / Departure Planning**

而不是固定闹钟。

---

# 五、Home 是目前最令人乐观的一块

Apple 的 HomeKit 已经允许第三方 App 在获得对应能力后发现、读取和控制 HomeKit 配件，例如：

**Lights**

**Switches**

**Fans**

**Locks**

**Thermostats**

等等。citeturn0search4turn0search12

更重要的是 Matter。

Apple 已支持通过 Matter 与跨厂商设备通信和控制。citeturn0search0turn0search8

所以我们之前描述：

> 起床  
> ↓  
> 灯光变化  
> ↓  
> 温度调整  
> ↓  
> 离家  
> ↓  
> Home Away  
> ↓  
> 关闭部分设备

### 不是科幻。

相当一部分今天已经可以实现。

真正缺的是：

> **谁来理解什么时候应该发生。**

Apple Home 做 Automation。

OLO 要做：

# Intent-driven Automation

这两者不同。

---

# 六、Email：可做，但不能简单依赖 Apple Mail

这里需要把“邮箱”与“Apple Mail App”分开。

例如 Gmail 有正式 API，并支持 OAuth；Google 明确支持服务器在用户授权后代表用户访问 Gmail，包括用户离线时通过 server-side OAuth 工作。citeturn1search17

所以：

```text
Gmail
 ↓
OLO Cloud
 ↓
Semantic extraction
 ↓
Intent Graph
```

完全可以。

比如：

> Alex：pricing 下午给你。

OLO 可以提取：

```text
Person: Alex
Commitment: deliver pricing
Time: afternoon
Dependency: prototype
```

这就开始构建：

**Commitment & Dependency Engine。**

但如果我们说：

> “OLO 可以直接读取用户 Apple Mail 里所有其他账号邮件。”

就不能这么简单假设。

Apple 的 MailKit 更偏 Mail 扩展能力；Apple 也有 default mail client entitlement，但这不是一个“随意读取整个系统 Mail 数据库”的通用 OLO API。citeturn0search13turn0search20

所以 MVP：

### Gmail / Outlook / 企业邮箱 → Provider API

比：

### 试图读取 Apple Mail

现实得多。

---

# 七、Messages / 微信 / Slack 是一堵很重要的墙

这里必须非常现实。

我们之前描述：

> 老板发消息  
> ↓  
> OLO 判断重要性  
> ↓  
> Attention Firewall

如果消息来自一个**开放 API 的服务**，例如企业 SaaS，这条路可能成立。

但是：

### iOS 不给普通第三方 App 一个“读取其他所有 App 通知内容”的通用能力。

这意味着 OLO iOS App 不能简单：

> 读取微信 + iMessage + Instagram + WhatsApp + 所有通知

然后自己做 Attention Firewall。

这是非常大的现实限制。

所以 OLO 的：

# Universal Attention Firewall

仅靠一个 iOS App 做不到。

---

# 八、“用户现在正在使用什么 App？”同样有限

这件事对 Work Context 非常重要。

我们希望：

> 用户正在 Figma  
> ↓  
> 正在 OLO Prototype  
> ↓  
> Work Context = OLO Design

但是 iOS sandbox 对跨 App activity 非常严格。

Apple 的 Screen Time / Family Controls 确实有 Device Activity 等能力，但目的主要是 Screen Time / parental-control 类体验，而且权限、entitlement 和数据暴露方式都有严格限制；Apple 2026 年的新部分数据访问能力甚至有 EU 区域限制。citeturn1search0turn1search9turn1search12

Apple DTS 最近也明确强调 sandbox 对其他 App 原始使用数据访问的限制。citeturn1search14

因此不能设计成：

> OLO iOS 随时知道用户正在每一个 App 里干什么。

---

# 九、但 Mac 是另一回事

这就是为什么我认为：

# OLO macOS Agent

可能比我们原先想象的重要很多。

Mac 是 Work Context 的主要发生地。

而 macOS 给获得用户许可的应用更多系统级能力，例如 ScreenCaptureKit 可以在用户授权后捕获选定的显示器、App 或窗口内容和音频。citeturn1search2turn1search6

因此我们可以设计：

```text
OLO Mac Agent

Active work context
      ↓
Window / selected screen context
      +
Calendar
      +
Browser / integrations
      +
Documents
      +
SaaS APIs
      ↓
OLO Work Context
```

当然这里必须非常重视：

### Privacy。

我绝对不建议：

> OLO 24h 把 Mac 屏幕录下来上传 Cloud。

而应该：

**On-device extraction → Semantic Context → Raw data discarded。**

例如：

```text
RAW

Figma window pixels
↓
On-device understanding
↓
"OLO One prototype being edited"
↓
discard pixels

STORE

WorkContext {
    project: OLO
    activity: prototype_design
}
```

这正好符合我们刚定义的：

> **Store meaning, discard surveillance.**

---

# 十、Tesla：比我原先预期更开放

这一点挺有意思。

Tesla 现在已经有正式的 **Fleet API**。

Tesla 官方允许经用户授权的第三方应用读取车辆信息、车辆状态，并执行部分 remote commands；认证使用 OAuth 2.0。citeturn0search5turn0search10

所以：

```text
OLO
 ↓
Tesla Fleet API
 ↓
Vehicle
```

已经是现实架构。

但是要注意：

> **Fleet API ≠ Cybercab Robotaxi Dispatch API。**

我们目前没有公开资料证明第三方 OLO 可以直接：

```text
requestCybercab()
```

所以 SR-003 中：

> OLO 自动叫 Cybercab

当前应该标：

### 🟠 Partner / Future API

而不是 NOW。

这也是为什么我们刚才把 Mobility 抽象成：

```text
MobilityProvider
```

是正确的架构选择。

---

# 十一、真正困难的是“空间”

现在开始看到 OLO One 的必要性。

iPhone 可以知道：

> User = Home。

但我们真正需要的是：

> 用户起床了吗？

> 在卧室还是厨房？

> 是准备出门还是拿个快递？

> 一个人还是两个人？

> 用户正在做饭吗？

> 他现在适合被语音打扰吗？

这些：

### Smartphone Context 不够。

Home Sensor 可以补一部分。

但是依然碎片化。

于是出现：

# Spatial Context Gap

```text
Digital World               Physical World

Calendar ✓                  Room Presence ?
Email ✓                     Activity ?
Location ✓                  Attention ?
Traffic ✓                   Social Context ?
Home devices ✓              Human intent ?
Work APIs ✓                 Environment ?
```

中间这个 Gap：

### 正是 OLO One 最有可能存在的地方。

---

# 十二、所以 Camera 的意义开始变了

不是：

> 给 AI 装一个摄像头。

而是：

# Context Sensor

例如 OLO One **本地**理解：

```text
person_present
person_count = 1
room = kitchen
activity ≈ cooking
attention ≈ occupied
```

然后：

### 删除 Frame。

OLO Core 收到的不是视频：

而是：

```text
SpatialContext {
    occupancy: 1,
    activity: cooking,
    confidence: .84
}
```

这将极大降低：

**隐私风险**

**Cloud bandwidth**

**存储风险**

**监控感**

同时解决 Context 问题。

---

# 十三、Microphone 也一样

我们不应该设计：

> OLO 永远录音。

而应该：

```text
Audio
 ↓
On-device detection
 ↓
Semantic Event
 ↓
Discard
```

例如：

**speech detected**

**water running**

**alarm**

**door sound**

**glass breaking**

**baby crying**

等等。

只有明确交互：

> “OLO……”

才进入语言理解。

甚至长期目标可能连 Wake Word 都弱化，通过：

**gaze / proximity / conversational context**

判断是不是在和 OLO 说话。

---

# 十四、这反而给 OLO One 定义出了一个非常强的原则

## Raw Reality Should Stay Local.

我认为这句话甚至应该写进 OLO 的产品宪法。

Camera：

**Raw video → Local**

Microphone：

**Raw audio → Local**

Presence：

**Local**

Identity：

尽可能 **Local**

上传：

### Semantic Context

而不是：

### Surveillance Data。

这会让 OLO One 和很多“云端 AI 摄像头”走完全不同的路线。

---

# 十五、现在可以得到真正的 OLO MVP Architecture

我目前会建议：

```text
                     OLO CLOUD
                         │
              ┌──────────▼──────────┐
              │      OLO Core       │
              │                     │
              │ Context Graph       │
              │ Intent Graph        │
              │ Planner             │
              │ Intervention        │
              │ Memory              │
              │ Permissions         │
              └──────────┬──────────┘
                         │
              Capability / Event Bus
                         │
      ┌──────────────────┼──────────────────┐
      │                  │                  │
      ▼                  ▼                  ▼

 OLO iPhone          OLO Watch          OLO Mac
      │                  │                  │
 Location            Health              Work
 Calendar            Body                Context
 Home                Haptics             Documents
 Voice               Presence            SaaS
 UI                                       Browser

      │
      ▼
 External Services
 ├ Weather
 ├ Maps
 ├ Gmail
 ├ Calendar
 ├ HomeKit
 ├ Matter
 ├ Tesla
 └ Work APIs
```

未来：

```text
                         │
                         ▼
                     OLO One
                         │
             ┌───────────┼───────────┐
           Vision       Audio      Presence
             │            │           │
             └───────────▼───────────┘
                  Local Context AI
                         │
                 Semantic Context
                         │
                         ▼
                     OLO Core
```

这样就非常清晰了。

---

# 十六、这意味着第一阶段其实不用等 OLO One

我认为这是目前最重要的工程结论。

### OLO Alpha

完全可以从：

**iOS + watchOS + macOS + Cloud Agent**

开始。

第一阶段接：

**Calendar + Location + Weather + Maps + HealthKit + HomeKit + Gmail + Notifications belonging to OLO itself**

然后验证三个核心东西：

### Experiment A — Context

> OLO 能不能判断：

**Sleeping → Awake → Ready → Leaving → Commuting → Working**

---

### Experiment B — Intervention

> OLO 什么时候应该主动出现？

记录：

**Correct intervention**

**Unnecessary intervention**

**Missed intervention**

用户：

👍 / 👎 / “以后别告诉我这个”

这会产生非常珍贵的数据。

---

### Experiment C — Autonomy

逐步测试：

> Suggest

↓

> Ask

↓

> Act + Notify

↓

> Silent Act

看看用户到底愿意把多少权力交给 OLO。

这甚至比模型 Benchmark 重要。

---

# 十七、然后 OLO One 应该由 Alpha 的失败反推出来

这是我特别建议坚持的研发哲学：

不要：

> **我们有 Camera，所以找 Camera 用途。**

而应该：

> OLO Alpha 无法可靠判断“用户是否正在准备出门”。

↓

为什么？

↓

缺少 Room Presence / Activity。

↓

现有 Apple APIs 无法解决。

↓

### OLO One Requirement #01

**Spatial Presence**

再比如：

> OLO 经常在用户做饭时说话。

↓

为什么？

↓

不知道用户当前 Attention。

↓

Watch + iPhone 不够。

↓

### OLO One Requirement #02

**Ambient Attention Estimation**

这样最后得到的硬件：

> 每一个 Sensor 都有明确的 Product Reason。

而不是 AI 硬件常见的：

**Camera + Mic + Speaker + LLM = AI Device。**

---

# 十八、现在我们已经发现 OLO 最大的现实技术矛盾

它非常重要：

> **OLO 想成为跨越所有设备和服务的 Personal Intelligence Layer。**

但是：

> **今天的计算世界恰恰由 Apple / Google / Tesla / Xiaomi / 微信 / 企业 SaaS 等一个个权限孤岛组成。**

也就是说：

# OLO 的核心技术问题不只是 AI。

还有：

# Integration.

甚至更准确：

# **Context Interoperability**

这可能最终需要 OLO 自己定义一层协议：

```text
OLO Capability Protocol

Context Provider
Action Provider
Presence Provider
Identity Provider
Agent Provider
```

未来：

Tesla 不需要“支持 OLO App”。

只需要暴露：

```text
Mobility Capability
```

Home 不需要知道 OLO UI。

只需要暴露：

```text
Environment Capability
```

Mac：

```text
Work Context Provider
```

Watch：

```text
Body Context Provider
```

OLO 做：

# Orchestration。

---

## 到这里，我认为 OLO 已经跨过一个很重要的节点

我们最开始是：

> **“做一个 AI 小方块。”**

然后变成：

> **“物找人。”**

现在已经可以形成更严谨的技术定义：

> **OLO 是一个持续构建 Personal Context、理解 Human Intent，并在 Confidence、Risk、Permission 与 Attention 约束下主动协调数字服务、设备与现实世界的 Personal Agent Runtime。**

而 **OLO One**：

> **不是 OLO 本身，而是 OLO 在现实空间中的 sensing + presence + ambient interaction node。**

这两个定义我认为可以正式进入未来 PRD。

---

下一步我建议进入 **Foundation 02：OLO Context Model**，而且开始真正技术化。

不再说抽象的“AI 理解 Context”，而是直接设计第一版数据模型：

**`Person`、`Place`、`Device`、`State`、`Event`、`Intent`、`Commitment`、`Relationship`、`Capability`、`Observation`、`Hypothesis`、`Permission`、`Action`** 到底是什么；它们怎么形成 **Personal Context Graph**；Confidence 怎么传播；什么进入 Memory；Planner 怎么读取它。

做到这一步，我们就已经可以开始写真正的 **OLO Core prototype** 了，而不只是继续写 PRD。

---

## Turn a86e5fbf-335a-4824-b730-ac0af9c362e1

对，这下我们把**真正的 OLO One 原型**重新对齐了。你这次给的产品板和 v16 HTML 很重要，我刚才有一处需要修正：**现在不是重新推导一个 OLO One，而是应该拿已经成形的 Generation 1 原型，去验证我们刚建立的产品与技术地基。** v16 本身已经明确写出了 “A physical presence for AI”“One identity · many bodies”，并把 OLO One 定义为 Presence / Intent 节点。fileciteturn1file0

而且现在回看这张设计板，我反而觉得：**我们前面关于“物找人”的讨论，并没有推翻它，反而第一次给它补上了真正的产品灵魂。**

## 这台 OLO One 其实已经押中了几个关键方向

第一，是 **“Your AI. In the real world.”**

以前这句话更像品牌文案。现在它可以成为非常具体的产品定义：

> ChatGPT 类 AI 主要存在于一个你主动打开的界面里；  
> OLO 要让 AI 获得对现实环境的 Presence。

所以这颗 50 mm 左右的小设备最重要的不是“便携 AI 聊天”，而是：

**让 OLO 在现实空间里有一个身体。**

这正好对应我们刚刚定义的：

> **OLO = Intelligence**  
> **OLO One = Physical Presence**

---

第二，你原来的：

> **One AI. Many Bodies.**

现在看非常重要。

因为我们已经推演出了：

```text
                    OLO
                     │
              Personal Agent
                     │
      ┌──────────────┼──────────────┐
      ↓              ↓              ↓
   OLO One         iPhone          Watch
   Presence        Screen          Body
      │
      ├──────── Mac
      │         Work
      │
      ├──────── Home
      │         Environment
      │
      └──────── Vehicle
                Mobility
```

这意味着这句话不应该只是宣传语。

它应该成为：

# OLO Platform Architecture Principle

而且 v16 下面已经写了：

> OLO One — Presence / Intent  
> iPhone — Screen / Payment  
> Robot — Hands / Legs  
> Vehicle — Mobility / Space  
> Home — Ambient Action

这和我们今天独立推演出的架构高度一致。fileciteturn1file0

这是一个很好的信号。

---

## 但现在我们也能第一次真正挑战这个原型

最重要的问题是：

### OLO One 正面为什么有一块这么大的黑色玻璃？

当前设计非常漂亮。

但产品上它很容易让人形成：

> **这是一个小屏幕设备。**

而我们刚刚建立的 OLO 理论恰恰告诉我们：

> OLO One 不应该成为另一个 Screen。

因此这块黑玻璃的定义必须非常严格：

# 它不是 Display，而是 Presence Surface。

也就是说，它原则上不应该发展成：

天气：

`23°C`

Calendar：

`09:30 Meeting`

Messages：

`3`

Music：

`▶︎`

地图：

`← 200m`

如果这样走下去，OLO One 很快就会变成：

> 圆形迷你智能手表 / AI Pin / 小型手机。

我认为应该坚决避免。

---

# 正面只负责表达「OLO 的状态」

你现在设计板已经有：

**Listening**

**Thinking**

**Acting**

**Done**

v16 里也实现了 OLO Logo、三点 Thinking、光点 Acting、横向 Light Bar，以及 Camera breathing ring。fileciteturn1file0

现在我们可以把它升级成真正的 **Ambient Agent Language**：

```text
Dormant
   ↓
Aware
   ↓
Attending
   ↓
Understanding
   ↓
Considering
   ↓
Asking
   ↓
Acting
   ↓
Done
```

这块玻璃不是告诉你：

> “世界发生了什么。”

而是告诉你：

> **“OLO 现在与你是什么关系。”**

这个区别非常重要。

---

# 甚至原来的两个“眉毛”问题现在也有答案了

之前我们讨论过给 OLO 加两个弯眉毛，让它有生命感。

现在我反而建议：

**不要把 OLO 做成固定卡通脸。**

可以有非常轻微的生命感，但不要让它变成：

> 😊 😢 😠 🤔

因为 OLO 不是 Tamagotchi。

OLO 的生命感应该来自：

**Attention。**

比如你走过去：

原本沉睡的光：

`—`

轻微向你“醒来”。

你说：

> “OLO。”

它不是显示一个笑脸。

而是光产生非常轻微的聚焦。

你停顿：

它等待。

你继续：

它听。

你走开：

它慢慢回到 Ambient。

这会比“眉毛表情”高级很多。

> **Alive ≠ Cute.**
>
> **Alive = Responsive to presence.**

这非常符合你现在设计板上的：

> **Little. Alive. Natural.**

---

# Camera 现在也必须重新定义

当前 Generation 1 的 Camera 位于正面顶部，非常明显。

原来的定义是：

> Camera · 12MP Ultra Wide

v16 则写的是：

> Vision · 广角视觉。fileciteturn1file0

但我们刚才做完 Context Foundation 后，它真正应该叫：

# Spatial Context Sensor

不是：

> 拍照摄像头。

它负责回答：

> 有没有人？

> 人在哪里？

> 是否正在接近？

> 是否在跟 OLO 互动？

> 当前是什么空间活动？

> 当前 Attention 是否适合介入？

未来甚至：

> 用户是不是正准备离开？

而且最好：

### Raw Vision → On Device → Semantic Context → Discard

这会直接决定 OLO One 的 NPU、ISP、Camera、Privacy Architecture。

所以“12MP”现在反而没那么重要。

可能：

> 一个更低分辨率、低功耗、Always-on、隐私友好的视觉传感器

比：

> 12MP Camera

更符合产品。

---

# 6 Mic Array 也是一样

不是为了：

> “更清楚地和 ChatGPT 聊天。”

而是：

### Ambient Context + Far-field Intent

比如：

> 用户是不是在跟 OLO 讲话？

> 声音从哪里来？

> 房间里有没有人？

> 当前环境是否嘈杂？

> 是否发生值得关注的声学事件？

所以：

**Mic Array = Context Sensor**

而不只是 Voice Input。

---

# Speaker 反而应该非常克制

这点我现在非常确定。

因为经过 Wake → Ready → Leaving → Cybercab → Work 场景以后，我们发现：

> **好的 OLO 其实说话很少。**

所以 OLO One 不需要：

> HomePod 级音乐 Speaker。

它需要的是：

### Presence Voice

声音应该：

近。

自然。

克制。

非常清楚。

没有广播感。

它说：

> “伞。”

可能就够了。

而不是：

> “根据当前天气预报，今天降雨概率为……”

所以 Speaker 的产品目标应该从：

**Audio Quality**

转向：

# Intimate Ambient Voice

---

# 而你这个「Flip · Privacy」现在反而非常有价值

v16 里翻转设备以后，进入：

> `PRIVACY`

并停止摄像头 / 麦克风。fileciteturn1file0

以前它可能只是：

> 一个酷的交互。

现在经过 Context Architecture 后，它已经变成：

# Physical Trust Contract

用户不需要进入：

Settings → Privacy → Camera → OLO → Off。

而是：

> **把它翻过去。**

这非常符合 OLO。

甚至我会把这个要求升级：

### Flip Privacy 必须是硬件级的。

不是：

```text
if flipped {
   software.disableCamera()
}
```

而最好最终通过硬件路径：

> Sensor power / mic path physically disconnected。

然后：

### OLO Cloud 根本无法绕过。

这才叫真正的：

> **Physical Privacy State。**

---

# 背部现在也开始有更深的意义

你现在有：

**Magnetic Charge**

**Lanyard**

**Clip**

**Stand**

而 v16 已经统一为同一个背部连接区。fileciteturn1file0

以前这更像 Industrial Design。

现在：

> **这些其实是在改变 OLO One 的 Context。**

挂在胸前：

### Personal Presence

放桌上：

### Work Presence

放床边：

### Sleep Presence

放客厅：

### Home Presence

夹在包上：

### Mobile Presence

所以磁吸底座甚至不应该只是：

> Charger。

它可能最终应该叫：

# Context Dock

Dock 可以告诉 OLO：

> 我现在在哪里、是什么角色。

例如：

```text
Bedroom Dock
→ Sleep Context

Desk Dock
→ Work Context

Kitchen Dock
→ Home Context

Wearable Clip
→ Personal Context
```

这非常有意思。

因为同一个 OLO One：

> **换一个身体位置，就获得不同的 Context Role。**

这与：

> One AI. Many Bodies.

完全一致。

---

# 但 Generation 1 有一个最大的产品问题

现在它同时想成为：

**Pendant**

**Clip**

**Handheld**

**Desktop**

**Stand**

而且概念重量：

> ≈78 g。fileciteturn1file0

这对真正全天佩戴可能偏重。

所以我们未来不能因为效果图很好看，就默认：

> OLO One 必须挂在脖子上。

这必须通过 Prototype 验证。

可能最终用户：

### 家里

放 Dock。

### 出门

Watch / AirPods / iPhone 接管 Presence。

### 办公室

Mac 接管。

那 OLO One 根本不需要全天挂脖子。

这反而更符合：

# One OLO. Many Bodies.

所以我们不应该强迫：

> **One Device. Everywhere.**

这是非常关键的区别。

---

# 于是我现在对这个 Generation 1 的判断是

**工业设计方向：保留。**

尤其：

圆润金属身体、黑玻璃、极少 UI、物理侧键、背部连接、Flip Privacy、Ambient Light。

这些跟现在的产品理论非常吻合。

但是内部定义应该发生一次升级：

| Generation 1 原定义 | 现在的 OLO 定义 |
|---|---|
| AI Device | **Physical AI Presence** |
| Camera | **Spatial Context Sensor** |
| Mic | **Ambient Context Sensor** |
| Speaker | **Ambient Voice** |
| Screen | **Presence Surface** |
| Light | **Agent State Language** |
| Magnetic Charger | **Context Dock** |
| Flip | **Physical Privacy Contract** |
| Pendant | **One possible Body** |
| OLO One | **OLO Physical Node** |

这张表我认为非常重要。

---

而且这里让我对我们下一步的路线稍微改变了想法。

**先不要马上进入 Context Model 数据结构。**

现在应该插入一个非常重要的步骤：

# OLO One Generation 1 · Product Re-evaluation

把你这张工业设计板 + v16 原型作为**冻结的视觉基线**，不重画外观，然后用我们刚才形成的 OLO 理论逐项重新审视：

**01 Presence Surface 到底应该表达什么**

**02 Camera 到底需要看到什么、不允许看到什么**

**03 Mic 到底需要听什么、不允许保存什么**

**04 Speaker 什么时候允许说话**

**05 Side Button 在“物找人”时代还有什么作用**

**06 Flip Privacy 到底做到软件级还是硬件级**

**07 Dock 如何变成 Context Dock**

**08 Pendant / Clip / Desk 三种身体是否真的都成立**

**09 哪些 Intelligence 必须 Local**

**10 哪些能力根本不应该塞进 OLO One**

这样完成以后，再进入 Context Architecture，我们得到的就不只是一个软件架构。

而会第一次形成：

> **OLO Intelligence Architecture ↔ OLO One Industrial Architecture**

两者互相约束。

我认为这一步非常关键，因为**我们现在终于有资格重新审视这台已经设计出来的 OLO One，而不是重新设计它。**

---

## Turn eaa79f94-2cbc-4e7a-a055-af4b9229422c

好，那我们把这个决定固定下来：

> **OLO One Generation 1 的外观不是待推翻的概念稿，而是接下来 Product Re-evaluation 的视觉与工业设计基线。**

后面所有修改都必须回答“为什么”，不能因为技术讨论又重新设计一台设备。现有 v16 已经明确了交互、部件、背部连接以及 “One identity · many bodies” 的基本框架。fileciteturn1file0

接下来我会按刚才的 10 个问题逐项审视，但不是做 Feature Review，而是建立三层对应关系：

**Human Need → OLO Intelligence → OLO One Physical Capability**

例如：

> 用户不希望 AI 随时打扰  
> → Intervention Model 判断是否值得介入  
> → Presence Surface / Light / Voice 分级表达

或者：

> OLO 需要知道用户是否适合被打扰  
> → Spatial Context / Attention inference  
> → Camera/Mic 的本地感知能力

以及：

> 用户必须确信“现在没有被感知”  
> → Privacy State  
> → Flip + 硬件级 Sensor Cutoff + 明确视觉状态

这样每一个孔、灯、按钮、传感器乃至重量和佩戴方式，最后都有产品理由。

下一步我们先做 **01 · Presence Surface**。这是最值得先解决的，因为它决定 OLO One 到底是“一个带屏幕的 AI 设备”，还是我们真正想做的：

> **AI 在现实世界中的 Presence。**

我会从一个很具体的问题开始：**这块圆形黑玻璃在一天 95% 的时间里到底应该是什么样子？**

这个问题一旦回答清楚，Listening / Thinking / Acting / Done、两个“眉毛”、OLO Logo、摄像头环灯、底部 Light Bar，甚至“需不需要真正的 Display”，都会一起得到答案。

---

## Turn 2d129903-5b27-4f9d-a8b1-8a5307d96b6d

对，我赞成，而且我会修正刚才“Presence Surface 是否需要真正 Display”的倾向：

> **Generation 1 应保留 Display。真正需要限制的不是 Display，而是不要让 Display 把 OLO 重新变成一台需要人操作的小手机。**

这两件事并不矛盾。

你提到已经有一批 AI 设备被市场淘汰，这一点对 OLO 很重要。它说明我们不能仅仅追求一种“无屏、纯 AI、极简交互”的概念纯洁性。OLO One 需要在 AI 判断错误、Context 不完整、用户不确定设备状态的时候，提供一个**可靠的视觉兜底通道**。

而且你现有 v16 本身其实已经选择了这个方向：黑色玻璃正面承担 OLO Logo、Listening、Thinking、Acting 等视觉状态，只是目前还没有把 Display 的产品边界定义完整。fileciteturn1file0

### 所以我建议把它重新定义成：Ambient Display

它不是传统意义的 App Screen，也不只是 Presence Surface，而是：

> **OLO 的低信息密度、Context-aware、glanceable Display。**

也就是说，正常情况下它仍然非常安静：

```text
95% 时间
      OLO / Ambient State

需要注意
      ↓
   subtle visual cue

用户看向 / 拿起 OLO
      ↓
增加必要信息

需要确认
      ↓
显示 Action + Confirmation

异常 / 高风险
      ↓
明确显示发生了什么
```

这实际上形成一个很重要的概念：

# Progressive Information Density

不是简单争论：

**有屏 vs 无屏。**

而是：

> **OLO 根据人与设备之间的关系，动态决定信息密度。**

例如平时放在桌面上，两米之外：

**一个微弱状态就够了。**

用户走近：

> `Car · 4 min`

拿到手里：

> `Cybercab arriving`  
> `08:26`

如果这次叫车是 OLO 主动发起：

> `Cybercab`  
> `Arriving in 4 min`  
> `Cancel`

这时候 Display 非常有价值。

---

### Display 还有一个更重要的作用：Trust

我们前面一直讨论主动 AI。

主动 AI 最大的问题之一就是：

> **“它现在到底在干什么？”**

纯语音非常糟糕，因为语音是瞬时的。

例如 OLO 自己判断你准备去公司并开始叫车。

如果只有声音：

> “车已经叫好了。”

用户会问：

> 哪辆？  
> 几分钟？  
> 去哪？  
> 有没有收费？  
> 能不能取消？

Display 可以把这些变成一个持续存在的 **Action State**：

```text
CYBERCAB

Office
3 min

OLO arranged this
```

所以我甚至会把 Display 的第二个职责定义为：

# Agent Legibility

**让 AI 的行为可见。**

这对于一个会替人行动的 Agent，比“显示天气”重要得多。

---

### 第三个作用是 Confirmation

例如 OLO：

> “九点半的会可以线上参加，要不要晚点去公司？”

Display 同时出现：

```text
WORK FROM HOME?

09:30 Meeting · Online

      Yes
      No
```

用户可以：

说“好”。

Tap。

或者什么都不做。

这就实现我们之前说的：

> **Multimodal Intervention**

而不是强迫所有事情都 Voice-first。

特别是在办公室、电梯、公共交通、会议中，**纯语音 AI 本身就是一个很大的交互缺陷。**

---

### 第四个作用是 Recovery

这个我认为特别重要。

Agent 一定会犯错。

例如：

> OLO 误以为你今天要去公司。

Display：

```text
Preparing commute

Office · 08:30
```

你一眼发现不对。

Tap：

```text
Not today
```

OLO：

> Context corrected.

如果完全无屏，错误 Context 很容易在后台继续传播：

```text
错误 Intent
 ↓
错误 Plan
 ↓
错误 Action
 ↓
叫车
 ↓
Home Away
 ↓
更多错误
```

所以 Display 实际上还是：

# Error Recovery Surface

---

### 第五个作用才是 Information

但应该非常克制。

我会给 OLO Display 定一个规则：

> **Display what changes the user's next action.**

可以显示：

**“伞”**

**“车 3 min”**

**“登机口 B27”**

**“Alex 回复了”**

**“会议提前 20 min”**

**“门没锁”**

而不应该默认显示：

天气 Dashboard、News Feed、完整 Calendar、股票列表、App Grid、照片流、社交 Feed。

因为后面这些会不可避免地把 OLO One拖回：

> Smartphone Paradigm。

---

## 这反而让我重新评价现在的圆形 Display

我认为应该**保留，而且可能成为 OLO One 非常重要的产品资产。**

但我们可以给它立一条红线：

### OLO One has a display. It does not have a home screen.

这句话我非常喜欢。

没有：

```text
☀️   💬   🎵
📅   🗺️   ⚙️
```

没有 App Grid。

没有 Desktop。

甚至可能没有传统意义上的 Navigation Hierarchy。

Display 永远由：

# Current Context

驱动。

---

这样 OLO One 就形成一种非常不同的计算模型：

### iPhone

```text
User
 ↓
Home Screen
 ↓
App
 ↓
Information
 ↓
Action
```

### OLO One

```text
World
 ↓
Context
 ↓
OLO
 ↓
Relevant Information / Action
 ↓
Display finds Human
```

所以即使它有 Display，

**“物找人”依然成立。**

区别在于：

> 不是用户去 Display 里寻找功能，而是 Display 在适当的时候呈现当前真正相关的东西。

---

而且这给我们刚才的 **01 Presence Surface** 一个比较明确的结论：

**Generation 1：Display 保留。**

但是它现在应该正式改名为：

# OLO Ambient Display

承担四个核心职责：

**Presence** — OLO 当前状态  
**Legibility** — OLO 正在做什么  
**Confirmation** — 需要人决定什么  
**Recovery** — OLO 错了怎么纠正  

第五个才是：

**Contextual Information** — 此刻真正需要知道什么

而不是 General-purpose UI。

我认为这条边界非常重要。接下来我们甚至可以开始定义 **Ambient Display 的信息层级 L0–L4**，这样 Listening / Thinking / Acting / Done、眉毛、Logo、文字、Action Button 到底什么时候出现，就不再靠视觉感觉决定，而会成为一套真正属于 OLO 的交互系统。

---

## Turn d8bd2d66-8bed-4f72-95d4-346246e4b491

我建议先推进 **Foundation 02：OLO Context Model**，Ambient Display 的 L0–L4 暂缓，但不是放弃。

原因很简单：我们现在已经对硬件方向做出了足够的约束——**Generation 1 保留 Display，且 Display 是 Context-driven，而不是 App-driven。** 到这个程度已经足够支撑架构继续前进。继续细化 L0–L4，很容易又进入 UI 设计细节，而我们当前最大的未知仍然是：

> **OLO 到底如何“理解一个人的世界”。**

而且更关键的是，未来 Ambient Display 显示什么，本身应该由 Context Model 决定，而不是反过来。

例如屏幕显示：

> `车 · 3 min`

背后其实依赖一整串东西：

```text
Person
  ↓
Intent: 去公司
  ↓
Plan: commute
  ↓
Action: Cybercab requested
  ↓
State: vehicle approaching
  ↓
Event: ETA changed
  ↓
Intervention: surface to user
  ↓
Display
```

如果这些对象还没有定义，我们现在做 L0–L4，其实是在凭感觉设计界面。

所以顺序应该是：

> **Context Model → Decision / Intervention → Ambient Display**

---

# Foundation 02 · OLO Context Model v0.1

先从一个根本问题开始：

**OLO 的世界模型里究竟存在什么？**

我不建议一上来设计数据库表，而是先定义 **Ontology——OLO 认为世界由哪些基本对象构成。**

第一版我建议 13 个核心对象：

```text
Person
Place
Device
State
Event
Observation
Hypothesis
Intent
Commitment
Relationship
Capability
Permission
Action
```

再加两个不是 Entity、但非常核心的系统对象：

```text
Context
Plan
```

最终：

# 13 Entities + Context + Plan

---

## 01 · Person

不是简单的：

```json
{
  "name": "User"
}
```

Person 是 OLO 世界里的 **Actor**。

可能是：

```text
You
Partner
Mother
Alex
Boss
Doctor
Delivery person
Stranger
```

Person 最重要的不只是 identity，而是：

```text
Person
├ Identity
├ Relationship
├ Current State
├ Preferences
├ Permissions
├ Commitments
├ History
└ Presence
```

例如：

```text
Person: Alex

Relationship:
Coworker

Current Context:
Working

Related Intent:
Pricing

Commitment:
Deliver pricing today
```

于是 Alex 不再只是一条 Contact。

他是 Context Graph 中一个有意义的节点。

---

# 02 · Place

Place 也不能只是 GPS。

例如：

```text
Home
Bedroom
Kitchen
Office
Meeting Room
Airport
Cybercab
Restaurant
```

这里有两个层级：

### Physical Place

```text
35.6, 139.x
```

和：

### Semantic Place

```text
Home
Work
Bedroom
```

OLO 真正关心后者。

因为：

> “用户进入坐标 X”

价值有限。

而：

> “用户回家了”

会直接触发 Context Transition。

因此：

```text
GPS
 ↓
Place Resolution
 ↓
Semantic Place
```

---

# 03 · Device

Device 不是传统“设备列表”。

而是：

> **OLO 当前可以通过什么东西感知世界、与人交互、执行动作。**

比如：

```text
OLO One
iPhone
Apple Watch
Mac
AirPods
Cybercab
Living Room Light
Door Lock
```

Device 应该拥有：

```text
Device
├ Owner
├ Place
├ State
├ Capabilities
├ Sensors
├ Interfaces
└ Trust Level
```

例如：

```text
Apple Watch
Capabilities:
- haptic
- health_context
- motion
- notification

Role:
Body Presence
```

这就是：

> One OLO. Many Bodies.

第一次进入数据模型。

---

# 04 · State

这个对象可能非常核心。

State 回答：

> **现在是什么情况？**

而且不是只有人的 State。

可以是：

```text
Person State
Device State
Place State
Plan State
Relationship State
Action State
```

例如：

```text
Person:
awake

Home:
occupied

Cybercab:
approaching

Meeting:
starting_soon

OLO One:
ambient
```

但是人的 State 不能只有一个 enum。

更合理的是：

```text
HumanState {
    wakefulness
    activity
    mobility
    attention
    social_context
    work_context
    urgency
}
```

例如：

```text
wakefulness = awake
activity = preparing
mobility = stationary
attention = light
social = alone
urgency = medium
```

这样 OLO 才能判断是否介入。

---

# 05 · Event

这是一个非常容易和 State 混淆的概念。

区别是：

### State

> **世界是什么样。**

### Event

> **世界发生了变化。**

例如：

```text
State:
Door = closed

Event:
Door opened
```

或者：

```text
State:
Meeting starts at 09:30

Event:
Meeting moved to 09:00
```

这非常关键，因为 OLO 很大一部分 Intelligence 都是：

# Event → Context Change

例如：

```text
Traffic increased
 ↓
Arrival Risk ↑
 ↓
Replan
 ↓
Intervention
```

---

# 06 · Observation

这里才开始进入真正的 Context Intelligence。

Observation 是：

> **OLO 的某个 Sensor / Service 实际观察到了什么。**

例如：

```text
Observation

source:
Apple Watch

type:
motion

value:
standing

time:
07:32

confidence:
0.96
```

或者：

```text
source:
OLO One

type:
room_presence

value:
kitchen

confidence:
0.92
```

或者：

```text
source:
Calendar

type:
event

value:
09:30 Product Review

confidence:
1.0
```

注意：

# Observation ≠ Truth

它只意味着：

> 某个来源告诉 OLO 一件事情。

---

# 07 · Hypothesis

这可能是整个 OLO Context Model 最关键的对象之一。

Hypothesis 是：

> **OLO 根据多个 Observation 推测出来的意义。**

比如：

Observation：

```text
Watch: awake
Bedroom: empty
Bathroom: occupied
Time: 07:41
Calendar: workday
```

产生：

```text
Hypothesis

User is preparing for work

confidence:
0.84
```

再过十分钟：

```text
User dressed
Bag moved
Kitchen visited
Traffic queried
```

Confidence：

```text
0.84 → 0.94
```

于是：

> OLO 可以开始准备 Cybercab。

这就是我们之前一直在说的：

# OLO 必须知道“我只是猜的”。

---

# 08 · Intent

Intent 不是命令。

这是非常重要的区别。

今天 Siri：

```text
Command:
Call a car.
```

OLO：

```text
Intent:
Reach office before 09:20.
```

Intent 表示：

> **某个人想让世界最终变成什么状态。**

例如：

```text
Intent
Owner: You

Goal:
Arrive Office

Target:
Before 09:20

Priority:
High

Status:
Active
```

然后 Planner 自己决定：

> Cybercab 是实现 Intent 的一个 Action。

这才是真正 Agent 化。

---

# 09 · Commitment

Commitment 和 Intent 不一样。

Intent：

> **我想做什么。**

Commitment：

> **我答应了什么。**

例如：

```text
Intent:
Finish prototype

Commitment:
Deliver prototype to Alex by Monday
```

Commitment 必须包含至少：

```text
Who
Owes What
To Whom
By When
Under What Context
```

所以：

```text
Commitment {
    debtor: You
    creditor: Alex
    deliverable: Prototype
    due: Monday
}
```

这也是我们 Work 场景里发现的一个非常关键的数据类型。

---

# 10 · Relationship

Relationship 不只是：

```text
Mother
Coworker
Friend
```

更应该表达：

> **两个 Context Entity 为什么相关。**

例如：

```text
You
 ─ works_on → OLO

Prototype
 ─ depends_on → Pricing

Pricing
 ─ owned_by → Alex

Flight
 ─ departs_from → Airport

Cybercab
 ─ transports → You
```

所以真正的 Personal Context Graph，本质上就是：

# Entities + Relationships

---

# 11 · Capability

这是 Action 层非常重要的对象。

OLO 不应该知道：

> Tesla App 怎么点。

它应该知道：

```text
Capability:
request_mobility
```

例如：

```text
Cybercab Provider

Capabilities:
requestRide
cancelRide
getETA
setDestination
```

Home：

```text
setTemperature
lockDoor
turnOffLights
```

Mac：

```text
openDocument
surfaceIntent
startMeeting
```

所以 Capability 描述：

> **这个世界节点能替 OLO 做什么。**

这会变成未来 OLO Capability Protocol 的核心。

---

# 12 · Permission

Permission 绝对不能只是：

```text
camera = true
location = true
```

这是传统 App Permission。

OLO 真正需要的是：

# Decision Permission

例如：

```text
Permission

Actor:
OLO

Capability:
requestRide

Context:
weekday commute

Max Cost:
¥100

Confirmation:
not_required
```

另一个：

```text
Capability:
send_message

Recipient:
coworkers

Mode:
draft_only
```

再一个：

```text
Capability:
unlock_door

Mode:
explicit_confirmation
```

这实际上描述的是：

> **AI 在什么情况下可以代表我做到什么程度。**

---

# 13 · Action

Action 是 OLO 真正改变世界的最小单位。

例如：

```text
Action:
requestRide
```

必须附带：

```text
Why
Which Intent
Which Plan
Confidence
Risk
Permission
Capability
Result
```

例如：

```text
Action

type:
requestRide

provider:
Cybercab

because:
Arrive Office before 09:20

confidence:
0.94

risk:
A1

authorization:
weekday_commute_auto

result:
successful
```

这就形成我们之前讨论的：

# Audit Trail

---

# 然后是两个系统级对象

## 14 · Context

Context 不是一个独立事实。

它是：

> **某个时刻与某个决策相关的一组有效事实、状态和 Hypotheses。**

例如：

```text
Context: Morning Commute

Person:
You

State:
awake
preparing
alone

Place:
Home

Intent:
Office before 09:20

World:
Rain
Traffic +11 min

Devices:
Watch worn
iPhone nearby
OLO One at home

Hypothesis:
Leaving soon = 0.94
```

这才是给 Planner / Intervention Model 使用的东西。

---

# 15 · Plan

Plan 则回答：

> **为了满足 Intent，世界接下来应该发生什么？**

例如：

```text
Intent
Arrive Office ≤ 09:20

        ↓

Plan

08:23 request Cybercab
08:28 departure
08:29 Home → Away
08:31 begin transport
09:16 arrive
09:20 meeting prep
```

但 Plan 不是固定 Workflow。

因为：

```text
Event:
traffic worsened
```

↓

```text
Replan
```

这就是 Agent Runtime 和传统 Automation 最大的区别之一。

---

# 现在 Personal Context Graph 就能真正出现了

比如我们早晨那段：

```text
                         YOU
                          │
             ┌────────────┼─────────────┐
             │            │             │
            at         intends        owns
             │            │             │
             ▼            ▼             ▼
           HOME       ARRIVE WORK      iPhone
             │            │
             │         before
             │            │
             │          09:20
             │            │
             ▼            ▼
          OLO ONE       PLAN
                           │
                  ┌────────┼────────┐
                  ↓        ↓        ↓
              Cybercab   Home     Meeting
                  │
                ETA
                  ↓
                6 min
```

然后 Observation 不断进入：

```text
Watch movement
Weather
Traffic
Door
Camera
Calendar
```

不断改变：

```text
State
Hypothesis
Confidence
```

Graph 不是静态知识图谱。

它是：

# Living Context Graph

---

## Confidence 怎么传播？

这里不要简单做：

```text
average(confidence)
```

例如：

> “用户准备出门。”

证据可能是：

```text
Calendar destination       .95
Typical routine            .72
Bag moved                  .88
Entryway presence          .93
Weather check              .51
```

同时出现反证：

```text
User still in pajamas      -.35
```

所以 Hypothesis Engine 最终：

```text
P(leaving soon | observations)
```

得到：

```text
0.89
```

关键不是第一版就搞出完美 Bayesian Model。

MVP 可以先：

> Rules + weighted evidence + LLM reasoning

以后再逐步模型化。

架构只要从第一天就保留：

```text
Evidence
Contradiction
Confidence
Source
Freshness
```

就够了。

---

# 然后 Memory 的问题也变得容易理解

不是所有这些对象都保存。

例如：

```text
Observation:
OLO One saw user enter kitchen at 07:43
```

可能 10 分钟后：

### Delete。

但是它帮助生成了：

```text
Pattern:
weekday morning preparation ≈ 43 min
```

后者：

### Store。

所以可以形成：

```text
Observation
 ↓
Context
 ↓
Hypothesis
 ↓
Pattern extraction
 ↓
Memory
```

而不是：

```text
Everything
 ↓
Database forever
```

---

# Ambient Display 现在该放在哪里？

现在答案就非常清晰了。

Ambient Display **不是 Context Model 的一部分。**

它应该消费：

```text
Context
+
Action
+
Intervention Decision
```

最终得到：

```text
Presentation
```

例如：

```text
Hypothesis:
User leaving soon .96

Action:
Cybercab requested

Vehicle State:
Arriving 3min

Intervention:
Ambient

            ↓

OLO One Display

CAR
3 min
```

所以 Display L0–L4 应该在 Foundation 02 之后紧接着做。

我建议顺序正式确定为：

```text
Foundation 01
Context Architecture
        ✓

Foundation 02
Context Model
        ← NOW

Foundation 03
Intervention + Planner Runtime

Foundation 04
Ambient Display L0–L4

Foundation 05
OLO One Hardware Requirements
```

这样 Ambient Display 最终就不是“我觉得这个动画挺好看”，而是：

> **哪个 Context、哪个 Risk、哪个 Intervention Level，对应什么信息密度。**

这会让我们已有的 OLO One 工业设计真正和 OLO Core 连起来。

因此我会选 **Context Model 先行**。而且上面的这一版，其实已经是 **OLO Context Model v0.1 的 Ontology 草案**；下一轮最值得做的是不再增加名词，而是拿 **SR-001 Wake Up** 和 **SR-003 Leaving/Cybercab** 两条真实场景，把这 15 个对象实际实例化一遍，看这套模型到底会不会崩。

---

## Turn 5b2927d3-a8bf-490d-8be3-1d3fd9b7cf51

那我们下一步就不继续扩概念了，而是开始做真正的 **Model Stress Test**。

先拿两条最重要、差异也最大的场景：

> **SR-001 Wake Up**：高度依赖身体状态、环境、时间与低打扰介入。  
> **SR-003 Leaving / Cybercab**：高度依赖 Intent、Plan、第三方 Capability、Permission 与真实 Action。

把它们完整塞进刚才的 15 个对象里，看哪里不够、哪里重复、哪里需要拆分。

如果模型能同时解释这两条链路，说明它开始有成为 OLO Core 的可能；如果解释不了，就现在改，而不是等代码写完再返工。

我建议下一轮直接从 **SR-001 Wake Up 的完整 Context Graph 实例化** 开始：从 `Observation → Hypothesis → State → Intent → Plan → Intervention → Action → Memory` 一步一步走通，再用同样结构套 SR-003 Cybercab 做第二轮验证。这样很快就能得到 **OLO Context Model v0.2**。

---

## Turn 193316ad-bf6f-44df-9c22-a425f3da48cf

好。我们开始第一次真正的 **OLO Context Model Stress Test**。这一轮先不考虑 UI，也不考虑 OLO One 长什么样，只问一个问题：

> **如果明天开始写 OLO Core，系统究竟如何从“世界里发生了一些事情”，走到“该叫醒这个人了”？**

# Stress Test 01 · SR-001 Wake Up

先把场景固定下来。

假设：

```text
Calendar
09:30 Product Review

Normal commute
42 min

Weather
Rain

Traffic impact
+11 min

Typical morning preparation
47 min

Sleep
Later than usual

Current time
07:18
```

OLO 最终希望实现的不是：

> 07:30 闹钟响。

而是：

> **在保证 09:30 计划的情况下，让用户尽可能充分休息，并以最低打扰完成 Sleeping → Ready 的状态转换。**

这里已经出现第一个重要发现。

---

# 1. Intent 到底是谁的？

我们之前定义：

`Intent = 某个人希望世界最终变成什么状态。`

那么 Wake Up 场景其实不存在：

```text
Intent:
Wake me at 07:27
```

真正的 Intent 是：

```text
Intent I-001

owner:
User

goal:
Attend Product Review

target:
Office

deadline:
09:30

constraints:
Arrive with sufficient preparation time

priority:
High
```

而：

> 07:27 起床

只是 Planner 推导出的结果。

这非常重要。

因为如果交通变化：

```text
Wake 07:27
↓
Wake 07:19
```

**Intent 完全没变。**

变的是 Plan。

所以：

# Intent ≠ Instruction

这是 Context Model 第一次被验证。

---

# 2. Observation 开始进入系统

06:50。

OLO Core 并不知道：

> “用户现在应该几点起。”

它只拥有 Observations。

例如：

```text
OBS-001

source:
Calendar

type:
scheduled_event

value:
Product Review

start:
09:30

place:
Office

confidence:
1.0
```

Watch：

```text
OBS-002

source:
Apple Watch

type:
sleep_state

value:
asleep

confidence:
0.94
```

Location：

```text
OBS-003

source:
iPhone

type:
location

value:
Home

confidence:
0.98
```

历史 Pattern：

```text
OBS-004

source:
Routine Memory

type:
morning_preparation_duration

value:
47 min

confidence:
0.82
```

Maps：

```text
OBS-005

source:
Mobility Provider

type:
travel_duration

value:
42 min

confidence:
0.88
```

Weather：

```text
OBS-006

type:
rain

confidence:
0.97
```

注意：

这些东西都没有直接说：

> “07:27 叫醒用户。”

它们只是：

# Evidence。

---

# 3. Observation 必须有 Freshness

这里马上发现 v0.1 Ontology 缺了一个非常重要的东西：

> **Observation 不只有 Confidence，还必须有 Freshness / Validity。**

Calendar 的：

> 09:30 Meeting

可能几个小时有效。

但：

> Traffic = 42 min

可能五分钟后就过期。

而：

> User asleep

可能几十秒后就变化。

所以 Observation 至少应该：

```text
Observation {
    source
    type
    value
    observedAt
    confidence
    validUntil
}
```

甚至：

```text
decayFunction
```

例如：

```text
Traffic observation
confidence = .91

5 min later
effective confidence = .84

15 min later
effective confidence = .53
```

因此第一个模型修正：

### v0.1 → v0.2

**Observation 加入 Temporal Validity。**

---

# 4. State Fusion

现在 OLO 把 Observations 融合成 Current State。

07:18：

```text
HumanState

wakefulness:
asleep (.94)

location:
home (.98)

mobility:
stationary (.97)

attention:
unavailable (.92)

social_context:
unknown

health_context:
sleeping
```

同时：

```text
WorldState

weather:
rain

commute:
53 min

meeting:
09:30
```

这里已经体现出：

> Observation ≠ State。

Observation 是证据。

State 是系统当前认为：

> **世界现在是什么样。**

---

# 5. Planner 开始反推时间

现在 Planner 有：

```text
Goal:
Meeting 09:30
```

它开始 backwards planning：

```text
Meeting
09:30
   ↑
Office preparation
10 min
   ↑
Arrival
09:20
   ↑
Commute
53 min
   ↑
Departure
08:27
   ↑
Morning preparation
47 min
   ↑
Wake
07:40
```

先假设得到：

> Latest Wake = 07:40

但这还不是 Wake Time。

为什么？

因为：

**Latest Wake ≠ Best Wake。**

---

# 6. 这里发现我们缺少一个对象：Constraint

这是第一次真正把 Ontology 压出问题来了。

之前我们把 Constraints 塞在 Intent / Plan 里面。

但实际上它非常重要，应该成为一等对象。

例如：

```text
Constraint C-001

type:
deadline

target:
Product Review

value:
09:30

hardness:
hard
```

另一个：

```text
Constraint C-002

type:
sleep_preservation

subject:
User

preference:
maximize

hardness:
soft
```

另一个：

```text
Constraint C-003

type:
arrival_buffer

value:
10 min

hardness:
soft
```

于是 Planner 真正在解决：

> 在 Hard Constraints 全部满足的情况下，尽量优化 Soft Constraints。

所以我们的模型应该从：

**13 Entities + Context + Plan**

升级为：

# 14 Entities + Context + Plan

新增：

### `Constraint`

这个对象以后一定会大量出现。

Cybercab：

> 价格不能超过 ¥X。

工作：

> Monday 前必须完成。

家庭：

> 宝宝睡觉时不要播放声音。

健康：

> 某些动作不能自动执行。

全部都是 Constraint。

---

# 7. Hypothesis 出现

07:18。

Watch 表明用户仍然在睡。

但是 OLO 发现昨晚入睡时间比平常晚。

于是：

```text
HYP-001

type:
sleep_need

claim:
User would benefit from additional sleep

evidence:
- later bedtime
- still asleep
- no urgent event

confidence:
0.81
```

另一个：

```text
HYP-002

claim:
User can remain asleep safely

until:
~07:32

confidence:
0.87
```

注意第二个非常有意思。

它不是：

> “用户会睡到 07:32。”

而是：

> **“根据目前世界状态，我认为让他继续睡到这个时间仍然安全。”**

这是 Agent Hypothesis。

---

# 8. OLO 形成 Wake Window

于是 Planner 不输出一个点：

```text
wakeTime = 07:27
```

而输出：

```text
Wake Window

earliest:
07:24

preferred:
07:29

latest:
07:32
```

为什么要 Window？

因为现实世界不是精确 Workflow。

Watch 可能在 07:25 检测到用户自然醒。

那么 OLO：

### 不需要叫醒。

如果 07:29：

用户仍在深睡状态。

可能延迟一点。

如果 07:31：

Traffic 突然 +8 min。

Wake Window 收缩。

所以：

> **Plan 的某些步骤不是 timestamp，而应该是 Temporal Window。**

这又是一个重要模型修正。

---

# 9. 07:24，为什么 OLO 什么都不做？

这其实是在测试 Intervention Model。

Current Context：

```text
User:
asleep

Wake Window:
07:24–07:32

Current:
07:24

Urgency:
low

Confidence:
high

Interruption Cost:
very high
```

Intervention Engine：

```text
Decision:
SILENT
```

注意：

# SILENT 也是一个 Decision。

而且我认为未来 Audit 中应该能够解释：

```text
07:24

Decision:
Do not intervene

Reason:
Wake deadline remains safe
```

这会非常重要。

因为我们不能只审计：

> AI 做了什么。

还应该能够理解关键节点：

> **为什么 AI 没做。**

---

# 10. 07:26，Traffic Event

突然：

```text
EVENT-017

type:
traffic_change

old:
53 min

new:
61 min
```

这不是 Observation 本身。

背后其实是：

```text
Observation:
traffic = 61 min
```

与：

```text
Previous State:
traffic = 53 min
```

比较以后产生：

```text
Event:
traffic worsened +8 min
```

于是：

# Event → Replan

新的：

```text
Latest Departure
08:19

Latest Wake
07:32 → 07:24
```

问题来了。

现在已经 07:26。

原计划不再成立。

于是：

```text
PlanState:
AT_RISK
```

这个状态很重要。

---

# 11. Hypothesis 更新

系统重新判断：

```text
HYP-002

"User can safely remain asleep"

confidence:
.87 → .18
```

同时：

```text
HYP-003

"Wake intervention is now required"

confidence:
.96
```

这里出现 Confidence propagation：

```text
Traffic
.91
   +
Calendar
1.0
   +
Prep duration
.82
   +
Sleep state
.94
        ↓
Wake intervention required
.96
```

不是简单平均。

因为不同 Evidence 对不同 Hypothesis 权重不同。

---

# 12. Intervention Engine 开始真正工作

输入：

```text
Need:
Wake

Urgency:
High

Confidence:
.96

Risk:
Low

User State:
Asleep

Interruption Cost:
High

Permission:
Wake assistance allowed

Alternatives:
None without threatening goal
```

输出不是：

```text
SPEAK
```

而是：

```text
Intervention Strategy

Level 1:
Environment

Level 2:
Ambient

Level 3:
Voice

Escalation:
progressive
```

于是：

07:26：

窗帘轻微打开。

灯光变化。

室温调整。

OLO One Display 可能从 dormant → subtle presence。

### 不讲话。

---

# 13. 07:28，没有反应

新的 Observation：

```text
Watch:
still asleep

Movement:
none
```

Hypothesis：

```text
Environmental wake insufficient

confidence:
.89
```

Intervention：

### Escalate。

OLO One：

> “早。”

停一下。

如果用户有动作：

不继续。

如果没有：

> “今天路上慢了一点。”

再停。

> “差不多该起来了。”

这时候我们第一次发现：

### Intervention 本身也应该是一个 Plan。

不是：

```text
intervention = voice
```

而是：

```text
InterventionPlan {
    goal: wake_user
    strategy: progressive
    steps: [
        ambient,
        light,
        voice_short,
        voice_context
    ]
}
```

所以以后 Foundation 03 要认真处理这个。

---

# 14. 用户说：“再睡十分钟。”

这是非常关键的一刻。

传统 Voice Assistant：

> 设置十分钟闹钟。

OLO 不能这样。

这句话产生：

```text
Observation:
User requested 10 more minutes
```

然后：

```text
Intent Candidate:
Continue sleeping
```

但是它与已有 Intent：

```text
Attend meeting on time
```

发生冲突。

于是 Planner 计算：

```text
10 min:
Goal violation likely

3 min:
Goal still feasible
```

OLO：

> “十分钟可能来不及。最多三分钟。”

用户：

> “好。”

于是产生：

```text
Intent:
Continue sleeping

duration:
3 min

priority:
temporary
```

Plan 更新。

---

# 15. 这里发现另一个重要问题：Intent 会冲突

所以 Intent 不能只是一个列表。

必须存在：

# Intent Arbitration

例如：

```text
Intent A:
Attend meeting on time
priority = high

Intent B:
Sleep longer
priority = medium
```

Planner 必须寻找：

> 能同时最大化满足两个 Intent 的方案。

如果不可能：

> 找人决定。

这会成为 OLO Intelligence 很核心的一层。

以后会更明显：

> 我要省钱。

和：

> 我要最快到机场。

可能冲突。

> 我不想被打扰。

和：

> 任何家人消息都告诉我。

也可能冲突。

因此：

**Intent Graph 必须支持 Conflict。**

---

# 16. 07:31 用户自然醒

Watch：

```text
wakefulness:
awake (.91)
```

OLO One：

```text
presence:
bedroom movement
```

State transition：

```text
Sleeping
   ↓
Waking
```

产生：

```text
EVENT

type:
human_state_transition

from:
Sleeping

to:
Waking
```

现在 Wake Intervention Plan：

```text
status:
SUCCESS
```

---

# 17. OLO 不再继续说话

这是一个非常重要的逻辑。

因为 Goal：

> Wake user

已经完成。

所以：

```text
Intervention terminated
```

而不是：

> “今天天气下雨，温度……”

新的 State Transition Planner 接管：

```text
Waking
 ↓
Ready
```

这就是 SR-002。

---

# 18. 什么进入 Memory？

整个过程产生了大量信息。

但绝大部分不应该保存。

### 删除：

```text
07:26 用户躺着
07:27 用户没动
07:28 用户翻身
07:31 用户坐起来
```

### Session Memory：

```text
Morning preparation
Wake required escalation to voice
```

当天结束后可能删除。

### Pattern Candidate：

```text
User often requests short extension after forced wake
```

但一次不能形成 Pattern。

可能经过：

```text
N repeated events
+
high confidence
```

才形成：

```text
Personal Pattern

When sleep-deprived:
prefers latest feasible wake time
```

这个可以进入长期 Memory。

---

# 19. Permission 也被验证了

这个场景至少需要：

```text
Permission:
read_calendar
```

```text
Permission:
read_sleep_context
```

```text
Permission:
control_bedroom_environment
```

以及更有 OLO 特征的：

```text
DecisionPermission:

OLO may determine wake timing
when:
scheduled commitments require it
```

注意最后这个。

这不是 OS Permission。

而是：

# Human → Agent Authority

这再次证明 Permission 必须是我们自己的核心模型。

---

# 20. 最终完整链路

现在 SR-001 已经可以真正跑起来：

```text
                 WORLD
                   │
                   ↓
             Observations
                   │
       ┌───────────┼───────────┐
       ↓           ↓           ↓
     Watch      Calendar     Traffic
       │           │           │
       └───────────┼───────────┘
                   ↓
              State Fusion
                   ↓
             Current Context
                   │
                   ├──── Intent
                   │
                   ├──── Constraint
                   │
                   └──── Memory
                           │
                           ↓
                        Planner
                           │
                           ↓
                      Wake Window
                           │
                           ↓
                       Hypothesis
                           │
                  "safe to sleep?"
                           │
             ┌─────────────┴─────────────┐
            YES                          NO
             │                            │
          SILENT                  Intervention
                                          │
                                   Environment
                                          ↓
                                      Ambient
                                          ↓
                                       Voice
                                          │
                                          ↓
                                   State Change
                                          │
                                          ↓
                                   Sleeping→Waking
```

这已经不是 PRD 流程图了。

它开始接近：

# OLO Runtime。

---

# Context Model v0.2

经过 SR-001，原来的模型已经发生了四个重要变化：

**① 新增 `Constraint`**

世界不是只有 Intent；Intent 永远运行在现实约束下。

**② Observation 新增 `Freshness / Validity`**

Context 是时间敏感的。

**③ Intent Graph 新增 `Conflict / Arbitration`**

人的目标天然可能互相冲突。

**④ Plan 支持 `Temporal Window`**

现实 Agent 不能依赖固定 timestamp。

另外我们发现一个很可能需要在 Foundation 03 正式独立出来的对象：

> **InterventionPlan**

暂时先不要增加进核心 Ontology，等第二次 Stress Test 再判断。

---

## 现在最重要的是：不要马上认为模型正确。

因为 SR-001 本质上还是一个相对封闭的场景：

> 一个人 + 家庭 + 时间规划。

真正会把模型压得很痛苦的是 **SR-003 Cybercab**。

因为下一轮会第一次出现：

**外部 Agent、真实金钱成本、第三方 Capability、Action Failure、Reservation、身份交接、Home State Transition、多设备 Presence Handoff，以及“车已经叫了但用户突然改变主意”。**

如果 Context Model v0.2 还能完整解释那条链路，我们就可以开始对 **OLO Core 的第一版工程架构**有比较高的信心了。

---

## Turn d7292753-305c-47cf-a786-8885d634d223

下一步我建议**不要继续增加新场景，也不要开始写代码**。现在最重要的是完成第二次 Stress Test：

# 下一步：SR-003 Leaving / Cybercab Stress Test

原因是 SR-001 已经证明 Context Model 能处理：

> 感知 → 推断 → 时间规划 → Intervention → Human State Transition

但它还没证明 OLO 能真正成为 **Agent**。

Cybercab 场景会第一次测试完整的“物找人 → 世界替人行动”：

```text
用户准备出门
      ↓
OLO 推断 Leaving Intent
      ↓
判断目的地 / 到达目标
      ↓
Planner 形成出行计划
      ↓
Permission / Risk 判断
      ↓
调用 Mobility Capability
      ↓
Cybercab 被调度
      ↓
车辆接近
      ↓
Home → Pre-Away
      ↓
Display / Watch / OLO One 协同
      ↓
用户离家
      ↓
Home → Away
      ↓
身份 / Context → Vehicle
      ↓
In Transit
```

### 为什么必须现在做它？

因为它会故意攻击 Context Model v0.2 最薄弱的地方。

例如 OLO 判断你要上班，Confidence 0.94，于是叫了车。但你突然说：

> “今天不去了。”

这不是普通的 `Replan`。

系统必须处理：

**Intent 被撤销 → 已执行 Action 怎么补偿 → Cybercab 能否取消 → 是否产生费用 → Home Pre-Away 回滚 → Context 恢复 → 为什么判断错 → 是否调整 Routine Memory。**

这会逼出一个我们目前还没有正式定义的概念：

> **Action ≠ 完成以后就结束。**

它可能需要：

`Pending → Executing → Succeeded → Failed → Cancelled → Compensated`

---

再比如车已经叫了，但 Cybercab API 返回：

> No vehicles available.

这会测试：

```text
Capability failure
      ↓
Plan invalid
      ↓
Alternative provider?
      ↓
Taxi?
      ↓
Public transport?
      ↓
Meeting remote?
      ↓
Need human?
```

这才是真正的 Agent Planner，而不是 Automation。

还有一个更麻烦的情况：

> OLO 判断你准备出门，但 Confidence 只有 0.72。

到底：

**不做？**

还是：

**提前查询车辆但不下单？**

还是：

> “车六分钟能到，要叫吗？”

这会逼我们区分一个非常重要的概念：

# Prepare ≠ Act

OLO 可以在没有获得最终行动权限前做大量**可撤销的准备工作**。

```text
Observe
   ↓
Anticipate
   ↓
Prepare     ← 不改变现实/低成本
   ↓
Commit      ← 开始产生现实影响
   ↓
Act
```

我怀疑 `Prepare / Commit / Act` 会成为 OLO Runtime 非常重要的三级结构。

---

## SR-003 还会测试 Permission 是否真的成立

比如用户授权：

> “工作日上班可以自动叫车。”

这句话转换成机器可执行权限不能只是：

```text
autoRide = true
```

而应该接近：

```text
Capability:
request_mobility

Purpose:
work_commute

Destination:
usual_workplace

Time:
weekday_morning

MaxCost:
¥100

ConfidenceThreshold:
0.95

AutoExecute:
true
```

如果今天目的地不是办公室，而是机场：

> **权限不能自动继承。**

这会逼我们把 `Permission` 做成真正的 **Policy Model**。

---

# 还会第一次测试 OLO One Display

但注意顺序。

不是现在设计 L0–L4，而是观察 Cybercab Stress Test 自然产生哪些必须被人看见的状态。

例如：

### OLO 正在考虑，但没行动

也许什么都不显示。

### OLO 准备叫车，需要确认

```text
CYBERCAB
6 min

Call?
```

### OLO 已代表用户行动

```text
CYBERCAB
ARRIVING · 4 MIN
```

### Action Failed

```text
NO CARS

Finding another way…
```

### OLO 自己无法解决

```text
NO CARS

Taxi · ¥82 · 7 min
Confirm
```

这样等 Stress Test 完成以后，我们再设计 **Ambient Display L0–L4**，它会直接从 Runtime 状态长出来。

---

# 我建议接下来的开发路线正式锁成这样

1. **现在：SR-003 Cybercab Stress Test**  
   把 Context Model v0.2 压到真实世界 Action 层，得到 **Context Model v0.3**。

2. **Foundation 03：OLO Agent Runtime**  
   正式定义 `Observe → Infer → Plan → Prepare → Commit → Act → Observe Result → Replan`，以及 Action Lifecycle、Failure、Rollback、Compensation、Intervention。

3. **Foundation 04：Ambient Display L0–L4**  
   把 Runtime 的 Confidence / Risk / Action State / Intervention 映射成 OLO One 的信息密度和视觉语言。

4. **Foundation 05：OLO One Generation 1 Hardware Requirements**  
   回到现有工业设计，反推 Camera、Mic、Display、Speaker、Button、Flip Privacy、Context Dock、本地算力和连接能力。

5. **然后才进入 OLO Core Prototype**  
   这时我们再决定 Swift/SwiftUI、watchOS/macOS Agent、Cloud Runtime、Context Graph 存储、模型层、Event Bus、Planner、Capability Protocol 等工程架构。

所以**下一步就是 SR-003 Cybercab Stress Test**。

它是一个关键分水岭：SR-001 验证的是 **“OLO 能不能理解人”**；SR-003 要验证的是 **“OLO 能不能安全地替人改变世界”**。

这两个都成立以后，我们才真正有了 OLO 的产品与技术地基。

---

## Turn aa384f8f-e4f3-4c2f-834f-52cd4530bf5f

需要更新文档，但**我不建议现在把所有内容都继续塞进一份 PRD**。

我们已经从“产品概念阶段”进入了“产品定义 + Agent 系统设计阶段”。如果继续只有 `OLO Product PRD v1.0`，后面 Context Model、Agent Runtime、Permission、Memory、Capability Protocol 都会把 PRD 写成一份巨大而难维护的混合文档。

我建议现在正式建立 **OLO Product Documentation v1**。

### 文档体系

| 文档 | 解决的问题 | 当前状态 |
|---|---|---|
| **01 · OLO Product PRD** | OLO 是什么、为谁、解决什么问题、核心体验是什么 | 🔄 应更新 |
| **02 · OLO Scenario Specification** | OLO 在人的一天中到底怎么工作 | 🔄 已有 SR-001～005，需要正式化 |
| **03 · OLO Context Model** | OLO 如何表示人与世界 | 🟡 正在设计，v0.2 |
| **04 · OLO Agent Runtime** | OLO 如何推断、规划、介入、行动、失败恢复 | ⏳ 下一阶段 |
| **05 · OLO Interaction System** | Ambient Display L0–L4、Voice、Light、Button、Haptic | ⏳ 后续 |
| **06 · OLO One Hardware Requirements** | Display/Camera/Mic/Speaker/Privacy/Dock/Compute 为什么存在 | ⏳ 后续 |
| **07 · OLO System Architecture** | iOS/watchOS/macOS/OLO One/Cloud/Models/Services 如何实现 | ⏳ 后续 |
| **08 · OLO Capability & Integration Spec** | Home、Mobility、Calendar、Email 等怎么接入 OLO | ⏳ 后续 |

这里有一个重要变化：

> **PRD 负责定义 Product；Context Model / Runtime / Architecture 负责定义 System。**

不要混在一起。

---

## 现在 PRD 确实应该更新一次

因为我们最近已经做出了几个足以改变 PRD 的基础决定。

原来的：

> OLO One 是一个 AI Hardware Device。

现在已经进化成：

> **OLO 是 Persistent Personal Agent / Personal Intelligence Layer；OLO One 是它在现实世界中的主要 Physical Presence。**

这意味着产品层级应该变成：

```text
                         OLO
              Personal Intelligence Layer
                         │
          ┌──────────────┼──────────────┐
          │              │              │
       Context         Agent          Identity
          │            Runtime            │
          └──────────────┬───────────────┘
                         │
                   One Intelligence
                         │
       ┌─────────┬───────┼───────┬─────────┐
       ↓         ↓       ↓       ↓         ↓
    OLO One    iPhone   Watch    Mac     Vehicle/Home
   Presence    Screen   Body     Work       Bodies
```

这应该成为新版 PRD 的核心产品架构。

---

## PRD 里也应该正式写入“人找物 → 物找人”

因为现在它已经不是一句营销文案，而是产品 Paradigm。

传统：

```text
Need
 ↓
Human
 ↓
Find device
 ↓
Find app
 ↓
Find information
 ↓
Understand
 ↓
Decide
 ↓
Operate
```

OLO：

```text
World
 ↓
Context
 ↓
OLO understands
 ↓
OLO anticipates
 ↓
OLO decides whether intervention is needed
 ↓
OLO coordinates the world
 ↓
Human only enters when necessary
```

这应该成为 **Product Principle #1**。

---

## 还要把“少操心”正式写进去

我认为这是目前讨论中非常重要的一次收敛。

OLO 的 North Star 不应该是：

> AI 使用时长。

也不是：

> Agent 完成任务数量。

甚至不应该单纯是：

> Productivity。

而应该接近：

> **Reduce Human Cognitive Load.**

具体可以表现成：

**App Opens ↓ · Context Switching ↓ · Repetitive Decisions ↓ · Manual Coordination ↓ · Unnecessary Notifications ↓ · Missed Important Events ↓**

这会直接决定以后产品是否走偏。

例如我们以后发现：

> OLO 每天主动说 80 次话。

即使 95% 都正确，也可能是一个失败产品。

因为它增加了 Cognitive Load。

---

# 但 Context Model 不应该等 PRD 写完

这里我建议采用软件项目常见的方式：

### PRD 做 Stable Layer

已经确定的产品结论进入 PRD。

### Foundation Docs 做 Living Specs

还在 Stress Test 的东西继续迭代：

```text
OLO Context Model
v0.1
 ↓
SR-001 Stress Test
 ↓
v0.2
 ↓
SR-003 Stress Test
 ↓
v0.3
 ↓
Runtime implementation
 ↓
v0.x
```

等模型稳定到一定程度，再把**产品级结论**回写 PRD。

这样不会出现：

> 每讨论一次 Confidence，PRD 就改一版。

---

# 所以我建议现在做一次 Documentation Milestone

我们可以把目前项目冻结成：

> **OLO Foundation Milestone 01**

其中：

```text
Product Thesis              ✓
Human Pull → World Push     ✓

OLO / OLO One separation    ✓
One AI · Many Bodies        ✓

Scenario Model              ✓
SR-001 → SR-005             ✓

Context Architecture        ✓

Context Model v0.1          ✓
SR-001 Stress Test          ✓
Context Model v0.2          ✓

SR-003 Stress Test          ← NEXT
Agent Runtime               →
Interaction System          →
Hardware Requirements       →
System Architecture         →
Prototype                   →
```

然后做两件事情并行：

**第一条是 Documentation Track：**把已有的 `OLO Product PRD v1.0` 升级为新的产品定义，并建立上述文档目录。

**第二条是 Foundation Track：**继续 SR-003 Cybercab Stress Test → Context Model v0.3 → Agent Runtime。

这样最合理。

等 SR-003 做完，我们就拥有了第一组比较稳定的三份核心文档：

> **OLO Product PRD** —— 我们为什么做、做什么。  
> **OLO Scenario Specification** —— 它在人真实生活里怎么工作。  
> **OLO Context Model** —— 机器如何理解这些生活。

然后才进入第四份：

> **OLO Agent Runtime Specification** —— 机器如何真正替人行动。

所以**现在确实是一个很好的 PRD 更新节点，但不是停下来“写完 PRD 再继续”**。应该把已经确定的东西固化，然后继续压 Context Model。

如果我们后面真的要把 OLO 做出来，这套文档体系会比一份不断膨胀的“超级 PRD”有用得多。

---

## Turn 13b92740-5957-4b96-987b-4944becfcb3c

对，这正是当前 ChatGPT 对话和本地工程之间的边界：**普通对话很适合继续讨论 OLO，但不能直接持续维护你 Mac 本地项目里的 Markdown 文件。**

所以我刚刚已经把这个任务转到 **Work 模式**。在那里更适合直接打开你的本地 OLO 项目，找到现有 `OLO Product PRD v1.0` 和 `docs/`，然后实际修改文件，而不是每次在聊天里生成一份 Markdown 再让你复制。

我建议本地最终整理成类似：

```text
OLO/
├── README.md
├── docs/
│   ├── 01-product/
│   │   └── OLO-Product-PRD.md
│   │
│   ├── 02-scenarios/
│   │   └── OLO-Scenario-Specification.md
│   │
│   ├── 03-context/
│   │   ├── OLO-Context-Architecture.md
│   │   └── OLO-Context-Model.md
│   │
│   ├── 04-runtime/
│   │   └── OLO-Agent-Runtime.md
│   │
│   ├── 05-interaction/
│   │   └── OLO-Interaction-System.md
│   │
│   ├── 06-hardware/
│   │   └── OLO-One-Hardware-Requirements.md
│   │
│   ├── 07-architecture/
│   │   └── OLO-System-Architecture.md
│   │
│   └── 08-integrations/
│       └── OLO-Capability-Specification.md
│
├── prototypes/
│   └── OLO_One_Clickable_Prototype_v16.html
│
└── ...
```

这样以后我们的工作模式也会改变：**这个聊天主要负责思考和决策，本地 OLO 仓库成为 Single Source of Truth。**

比如我们接下来完成 `SR-003 Cybercab Stress Test` 后，不是重新生成一整份 PRD，而是把结果分别沉淀：

```text
SR-003
   ↓
docs/02-scenarios/

Context Model v0.2 → v0.3
   ↓
docs/03-context/

发现新的 Runtime 机制
   ↓
docs/04-runtime/

发现新的 Display Requirement
   ↓
docs/05-interaction/

发现 OLO One 必须增加的能力
   ↓
docs/06-hardware/
```

而真正稳定、属于产品定义层的结论，才回写 `OLO-Product-PRD.md`。

这对 OLO 很重要，因为从现在开始，我们其实已经不只是“聊天讨论一个 AI 硬件创意”，而是在逐渐建立一个**可以被产品、设计、AI、客户端、云端、硬件工程共同使用的产品知识库**。

你可以直接在刚创建的 Work 会话里让它先**扫描 OLO 本地项目，不改代码，先整理现有文档 → 建立 docs 体系 → 更新 PRD**。完成后，我们再继续 **SR-003**，后面的研究结果就可以持续写回本地文档了。