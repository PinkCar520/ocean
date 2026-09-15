from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from embedding import generate_embedding

# 第 4 条收敛：Python 仅保留无状态计算 Job（Embedding / 音频转写），不再持有业务 ORM。
# 本端点供 NestJS SkillResolver 做语义兜底匹配时调用（返回 1536 维向量）。
router = APIRouter(prefix="/api/internal/embedding", tags=["embedding"])

class EmbeddingRequest(BaseModel):
    text: str

class EmbeddingResponse(BaseModel):
    embedding: list[float]

@router.post("", response_model=EmbeddingResponse)
def create_embedding(request: EmbeddingRequest):
    try:
        return EmbeddingResponse(embedding=generate_embedding(request.text))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
