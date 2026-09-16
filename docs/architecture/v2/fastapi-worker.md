# FastAPI 计算 Worker 部署说明

> 第 4 条收敛后的 Python 服务定位：**无状态计算 Job**，不是产品 API。
> 产品 API（知识 CRUD / Skill / 聊天 / Run）全部在 NestJS Gateway。

## 职责

| 端点 | 职责 | 状态 |
|---|---|---|
| `POST /api/internal/embedding` | 文本 → 向量（SkillResolver 语义兜底匹配） | 服务正常；**模型可用性受百炼免费额度限制**（text-embedding-v2/v3 当前 403），额度开通前 SkillResolver 静默降级为关键词匹配 |
| `POST /api/internal/audio/transcriptions/chunk` | 音频分片 → 转写文本 | 需配置 Whisper 依赖 |

## 本地运行

```bash
cd apps/fastapi-backend
source .venv/bin/activate
# 需要 provider env（与 Gateway 同口径）：
#   DEFAULT_AI_PROVIDER / {P}_API_KEY / {P}_BASE_URL / EMBEDDING_MODEL_NAME
uvicorn main:app --host 0.0.0.0 --port 8000
```

## Docker

`docker compose up -d fastapi-backend`（已配置 healthcheck：GET / 存活探针）。

## 架构约束（回归检查清单）

- [ ] 不引入 SQLAlchemy / psycopg2 / pgvector（业务 ORM 已退役）
- [ ] 不暴露非 `internal` 前缀的产品路由
- [ ] NestJS 是唯一面向客户端的 API；Python 只被 Gateway 内部调用
- [ ] 计算 Job 失败必须对产品路径**静默降级**（如 SkillResolver 关键词兜底），不阻塞主链路
