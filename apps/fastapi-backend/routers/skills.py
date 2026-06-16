from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from typing import List, Optional
from database import get_db
from models import SkillTriggerLog, SystemConfig
import uuid
import json
import asyncio

# Lazy load embedding to avoid blocking startup
from embedding import generate_embedding

router = APIRouter(prefix="/api/internal/skills", tags=["skills"])

class ResolveRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    skill_ids: Optional[List[str]] = None

class ResolveResponse(BaseModel):
    injected_prompt: str
    matched_skills: List[dict]

@router.post("/resolve", response_model=ResolveResponse)
def resolve_skills(request: ResolveRequest, db: Session = Depends(get_db)):
    # 1. 优先获取所有有效的 Skill
    skills_query = text("SELECT id, slug, name, description, content, \"triggerKws\", embedding FROM skills WHERE \"isPublic\" = true")
    result = db.execute(skills_query)
    all_skills = result.fetchall()
    
    matched_skills = []
    user_msg_lower = request.message.lower()
    
    # 2. 区分已命中的和未命中的（用于 Embedding 兜底匹配）
    pending_skills = []
    
    for row in all_skills:
        skill_id = str(row[0])
        slug = str(row[1]).lower() if row[1] else ""
        name = row[2]
        desc = row[3]
        content = row[4]
        trigger_kws = row[5]
        # embedding is row[6]
        
        should_trigger = False
        match_type = ""
        
        # 策略 A: 显式指定 (依赖网关传过来的 skill_ids)
        if request.skill_ids and (skill_id in request.skill_ids or slug in request.skill_ids):
            should_trigger = True
            match_type = "explicit"
            
        # 策略 B: 关键词精确匹配
        elif trigger_kws:
            for kw in trigger_kws:
                if kw.lower() in user_msg_lower:
                    should_trigger = True
                    match_type = "keyword"
                    break
                    
        if should_trigger:
            matched_skills.append({
                "id": skill_id,
                "name": name,
                "content": content,
                "match_type": match_type
            })
        else:
            pending_skills.append(row)
            
    # 策略 C: Embedding 语义匹配 (仅当没有任何命中或者需要补全时)
    # 如果关键词没命中，我们用 Embedding 在剩余的 skill 中找
    if pending_skills and len(matched_skills) < 3:
        try:
            # 生成用户消息的 embedding
            user_embedding = generate_embedding(request.message)
            
            # 使用 pgvector 在数据库层做查询
            # 为了简单，我们构建一个包含了 pending skill ID 的查询
            pending_ids = tuple([s[0] for s in pending_skills])
            if pending_ids:
                vector_query = text("""
                    SELECT id, name, content, 1 - (embedding <=> CAST(:emb AS vector)) as score
                    FROM skills
                    WHERE id IN :p_ids
                      AND embedding IS NOT NULL
                    ORDER BY embedding <=> CAST(:emb AS vector)
                    LIMIT 2
                """)
                v_res = db.execute(vector_query, {"emb": str(user_embedding), "p_ids": pending_ids})
                for v_row in v_res:
                    # 假定阈值 > 0.4 算作命中
                    if v_row[3] > 0.4:
                        matched_skills.append({
                            "id": v_row[0],
                            "name": v_row[1],
                            "content": v_row[2],
                            "match_type": f"embedding (score: {v_row[3]:.2f})"
                        })
        except Exception as e:
            print("Embedding match failed:", e)

    # 去重
    seen = set()
    final_matched = []
    for s in matched_skills:
        if s["id"] not in seen:
            final_matched.append(s)
            seen.add(s["id"])

    injected_prompt = ""
    if final_matched:
        injected_prompt += "<injected_skills>\n"
        injected_prompt += "以下为你注入了多个专门领域的AI专家技能，请根据用户的问题，综合运用它们的规则来回答。\n"
        for s in final_matched:
            injected_prompt += f'<skill name="{s["name"]}">\n'
            injected_prompt += f'{s["content"]}\n'
            injected_prompt += f'</skill>\n'
        injected_prompt += "</injected_skills>\n"
        
    # 记录触发日志 (SK-10)
    try:
        log = SkillTriggerLog(
            sessionId=request.session_id,
            messageId=str(uuid.uuid4()), # 暂无 message_id，用新的顶替
            triggeredIds=[s["id"] for s in final_matched],
            injectedTokens=len(injected_prompt) // 4  # 粗略估算
        )
        db.add(log)
        db.commit()
    except Exception as e:
        print("Failed to save trigger log:", e)
        db.rollback()
        
    return ResolveResponse(
        injected_prompt=injected_prompt,
        matched_skills=[{"id": s["id"], "name": s["name"], "match_type": s.get("match_type")} for s in final_matched]
    )


class GenerateSkillRequest(BaseModel):
    instruction: str

class GenerateSkillResponse(BaseModel):
    name: str
    description: str
    content: str
    triggerKws: List[str]

DEFAULT_SKILL_CREATOR_PROMPT = """You are an expert AI Assistant specialized in writing high-quality Skill Prompts for other AI agents.
The user will give you a brief instruction on what they want the skill to do.
You need to generate:
1. 'name': A short, descriptive name (max 3 words).
2. 'description': A brief explanation of what the skill does.
3. 'content': The detailed system prompt for this skill. It should be well-structured, clear, and comprehensive. Use markdown. You can define variables like {{variable_name}} if the skill needs dynamic context.
4. 'triggerKws': A list of 2-5 keyword strings that would trigger this skill based on user queries.

Return the result strictly as a valid JSON object. No markdown code blocks, just raw JSON.
Example:
{
  "name": "PR Reviewer",
  "description": "Reviews pull requests for code quality",
  "content": "You are a senior engineer. Review the provided code...",
  "triggerKws": ["review", "pr", "pull request", "code check"]
}
"""

@router.post("/generate", response_model=GenerateSkillResponse)
def generate_skill(request: GenerateSkillRequest, db: Session = Depends(get_db)):
    # 1. Fetch system config for the prompt
    config = db.query(SystemConfig).filter(SystemConfig.key == 'skill_creator_prompt').first()
    
    if not config:
        # Insert default if missing
        config = SystemConfig(
            key='skill_creator_prompt',
            value=DEFAULT_SKILL_CREATOR_PROMPT,
            description="Default system prompt for the AI Skill Creator feature."
        )
        db.add(config)
        db.commit()
    
    system_prompt = config.value

    # 2. Call OpenAI
    from openai import OpenAI
    import os
    
    provider = os.getenv("DEFAULT_AI_PROVIDER", "openai").upper()
    api_key = os.getenv(f"{provider}_API_KEY") or os.getenv("OPENAI_API_KEY")
    base_url = os.getenv(f"{provider}_BASE_URL") or os.getenv("OPENAI_BASE_URL")
    
    client = OpenAI(
        api_key=api_key,
        base_url=base_url
    )
    
    # Try dynamic model, fallback to gpt-4o, then gpt-3.5-turbo
    model_name = os.getenv(f"{provider}_MODEL") or os.getenv("OPENAI_MODEL", "gpt-4o")
    if not model_name:
        model_name = "gpt-3.5-turbo" # fallback

    response = client.chat.completions.create(
        model=model_name,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": request.instruction}
        ],
        response_format={"type": "json_object"}
    )
    
    result_text = response.choices[0].message.content
    try:
        data = json.loads(result_text)
        return GenerateSkillResponse(
            name=data.get("name", "New Skill"),
            description=data.get("description", ""),
            content=data.get("content", ""),
            triggerKws=data.get("triggerKws", [])
        )
    except json.JSONDecodeError:
        # Fallback if json is malformed
        return GenerateSkillResponse(
            name="Generated Skill",
            description="",
            content=result_text,
            triggerKws=[]
        )
