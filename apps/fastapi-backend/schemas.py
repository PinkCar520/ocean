from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

# 这个相当于 TypeScript 里的 CreateKnowledgeProjectDTO
class KnowledgeProjectCreate(BaseModel):
    name: str
    category: str
    description: Optional[str] = None
    iconUrl: Optional[str] = None
    color: Optional[str] = None

# 这个相当于 TypeScript 里的 KnowledgeProject 接口/类型
class KnowledgeProjectResponse(BaseModel):
    id: str
    name: str
    category: str
    description: Optional[str]
    iconUrl: Optional[str]
    color: Optional[str]
    userId: Optional[str]
    isPublic: bool
    createdAt: datetime
    updatedAt: datetime

    # 允许 Pydantic 直接读取 SQLAlchemy 模型对象
    model_config = ConfigDict(from_attributes=True)
