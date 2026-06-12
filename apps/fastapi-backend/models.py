import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, Text
from database import Base

def generate_uuid():
    return str(uuid.uuid4())

class KnowledgeProject(Base):
    __tablename__ = "knowledge_projects" # 必须与原本的 Prisma 表名一致

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    category = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    iconUrl = Column("iconUrl", String, nullable=True) # 强制指定列名为骆驼拼写法
    color = Column(String, nullable=True)
    userId = Column("userId", String, nullable=True)
    isPublic = Column("isPublic", Boolean, default=True)
    createdAt = Column("createdAt", DateTime, default=datetime.utcnow)
    updatedAt = Column("updatedAt", DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

