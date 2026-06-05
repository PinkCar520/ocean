from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from database import get_db
import models
import schemas

router = APIRouter(
    prefix="/api/knowledge-projects",
    tags=["Knowledge Projects"]
)

# =========================================================
# 【新手踩坑记录 / FastAPI 学习笔记】
#
# 坑1：运行环境
# - 报错：zsh: command not found: uvicorn
# - 原因：Python 项目必须激活虚拟环境并安装依赖 (source .venv/bin/activate)
#
# 坑2：引入路径 (ImportError)
# - 报错：attempted relative import with no known parent package
# - 原因：在直接作为根目录运行的 FastAPI 中，同级文件引入要用绝对路径 (如 from database import Base)
#   不能像前端 JS/Vue 里那样使用带点的相对路径 (如 from .database import Base)。
#
# 坑3：缩进陷阱 (Indentation)
# - 现象：本该报错返回 404，却默默返回了 200 OK，而且数据没删掉。
# - 原因：Python 不用大括号 {} 划分代码块，纯靠缩进。如果不小心把 db.delete() 缩进到了
#   if not project: 里面，它就只有在“找不到数据”时才会执行删除操作，导致逻辑严重 Bug。
#
# 坑4：HTTP 请求方法
# - 删除操作一定要用 @router.delete()，习惯了写 @router.post 容易顺手打错。
# =========================================================
@router.get("/")
def get_projects(db: Session = Depends(get_db)):
    """
    【查询全部】获取所有的知识库项目
    对应 SQL: SELECT * FROM knowledge_projects;
    """
    projects = db.query(models.KnowledgeProject).all()
    return projects


@router.get("/{project_id}")
def get_project_by_id(project_id: str,db: Session = Depends(get_db)):
    """
    【查询单条】根据 ID 获取对应的知识库项目
    URL 参数 project_id 会被自动提取并传入该函数。
    对应 SQL: SELECT * FROM knowledge_projects WHERE id = project_id LIMIT 1;
    """
    project = db.query(models.KnowledgeProject).filter(models.KnowledgeProject.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404,detail="找不到该项目")
    return project

@router.post('/')
def create_project(project: schemas.KnowledgeProjectCreate,db: Session = Depends(get_db)):
    """
    【新增数据】创建一个新的知识库项目
    - `project`: 前端传来的 JSON 数据会通过 schemas.KnowledgeProjectCreate 进行验证。
    - `**project.model_dump()`: 相当于 JS 的对象展开符 `...project`，将字段自动赋给数据库模型。
    """
    db_project = models.KnowledgeProject(**project.model_dump())
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project

@router.delete('/{project_id}')
def delete_project(project_id: str,db: Session = Depends(get_db)):
    """
    【删除数据】根据 ID 删除指定的知识库项目
    注意点：
    1. HTTP 方法是 DELETE (@router.delete)。
    2. Python 的代码块依靠缩进，db.delete() 必须和 if 对齐，不能缩进到 if 里面！
    """
    project = db.query(models.KnowledgeProject).filter(models.KnowledgeProject.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404,detail="找不到该项目")
    db.delete(project)
    db.commit()
    return {"message":"删除成功"}