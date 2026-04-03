# AGP — Agent Governance Protocol

> **智能体工作流协议 | 由 pinkcar 提出**

AGP（Agent Governance Protocol）是由 pinkcar 提出的企业级 AI 智能体编排与治理协议标准，与 Anthropic 的 **MCP**（接入层）和 **Agent Skill**（技能层）共同构成下一代企业级 AI 技术栈的**三足鼎立基石**。

---

## 协议定位

| 层级 | 协议 | 提出方 | 解决什么问题 |
| :--- | :--- | :--- | :--- |
| 接入层 | MCP (Model Context Protocol) | Anthropic | 大模型与外部系统"怎么通信？" |
| 技能层 | Agent Skill | Anthropic | 大模型面对工具"怎么用？" |
| **编排治理层** | **AGP (Agent Governance Protocol)** | **pinkcar** | 大模型"**按什么规矩、在多大权限范围内干活？**" |

---

## 核心能力

### 1. 动态沙盒白名单 (`allowed-tools`)
网关默认对大模型屏蔽所有工具。仅当特定业务意图被激活时，按白名单精确注入最小权限工具集，从架构底层杜绝越权调用。

### 2. 人工介入强制断点 (`requires-approval`)
协议级声明哪些高危写操作必须经过人工 Y/N 确认方可放行，满足金融级合规与审计需求，网关层程序化拦截，不依赖大模型的"自觉性"。

---

## 目录结构

```
agp/
├── README.md                       # 本文件：快速引导与协议概述
├── spec/
│   └── AGP-1.0.md                  # 完整技术规范核心文档
├── schema/
│   └── agp-manifest.schema.json    # JSON Schema：AGP Manifest 机器可读校验
├── examples/
│   ├── fix-bug.agp.md              # 示例：Bug 修复全链路工作流
│   └── write-prd.agp.md            # 示例：PRD 智能起草工作流
└── validator/
    └── validate.js                 # AGP Manifest 合规性校验脚本
```

---

## 快速开始

### 编写一个符合 AGP 规范的 Skill 文件

```yaml
---
protocol: AGP/1.0          # 必填：声明遵循的协议版本
name: your-workflow
description: "触发时机描述..."

allowed-tools:             # 必填：动态沙盒白名单
  - mcp.yourTool1
  - mcp.yourTool2

requires-approval:         # 按需：高危操作拦截断点
  - mcp.yourTool2

metadata:
  author: your-team
  version: "1.0"
---

# 工作流名称

## 执行步骤

- [ ] 步骤 1：...
- [ ] 步骤 2：...（⚠️ 需要用户确认）
```

### 验证 Manifest 合规性

```bash
node agp/validator/validate.js apps/gateway/skills/fix-bug/SKILL.md
```

---

## 完整规范

详见 [spec/AGP-1.0.md](./spec/AGP-1.0.md)

---

## License

© 2026 pinkcar. AGP 协议规范以 MIT 开源许可证发布，欢迎社区贡献与实现。
