# Inference Service 部署说明

Python Inference Service 是 Ocean 的独立模型能力服务，提供内部 Embedding 与音频转写接口。当前通过统一 Provider 配置调用外部模型 API；未来如有本地模型部署需求，可在此服务边界内扩展模型加载、推理和资源管理。它不是面向客户端的产品 API，也不负责 Agent 生命周期编排。

## 职责

| 端点 | 职责 |
|---|---|
| `POST /api/internal/embedding` | 文本生成向量，供 Skill 语义匹配等内部能力使用 |
| `POST /api/internal/audio/transcriptions/chunk` | 音频分片转写 |

## 本地运行

```bash
cd services/inference
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

运行时需要配置 `DEFAULT_AI_PROVIDER`、对应的 `{P}_API_KEY` / `{P}_BASE_URL` 和 `EMBEDDING_MODEL_NAME` 等 Provider 配置。

## Docker

```bash
docker compose build inference
docker compose up -d inference
```

服务在 Compose 网络内通过 `http://inference:8000` 供 Gateway / Worker 调用。生产环境不向公网发布该端口，并通过 `secrets/inference.env` 注入服务所需凭据。

## 架构约束

- NestJS Gateway 是唯一面向客户端的产品 API。
- Inference Service 仅提供内部模型能力接口，不承载知识项目、Skills 管理或 Agent Session 业务。
- 外部模型调用必须经统一 Provider 配置；不得在各业务路由中复制 Provider 选择逻辑。
- 本地模型只有在确有部署需求时才加载；不得把独立服务部署等同于必须托管本地模型。
- Inference 服务故障时，调用方应按具体能力定义超时、重试和降级策略，不得无限阻塞 Agent 主执行链路。
