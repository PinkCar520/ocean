from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from typing import List, Optional
from database import get_db

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
    skills_query = text("SELECT id, name, description, content, \"triggerKws\" FROM skills WHERE \"isPublic\" = true")
    result = db.execute(skills_query)
    
    all_skills = result.fetchall()
    
    matched_skills = []
    user_msg_lower = request.message.lower()
    
    for row in all_skills:
        skill_id = row[0]
        name = row[1]
        desc = row[2]
        content = row[3]
        trigger_kws = row[4]
        
        should_trigger = False
        
        if request.skill_ids and skill_id in request.skill_ids:
            should_trigger = True
            
        elif trigger_kws:
            for kw in trigger_kws:
                if kw.lower() in user_msg_lower:
                    should_trigger = True
                    break
                    
        if should_trigger:
            matched_skills.append({
                "id": skill_id,
                "name": name,
                "content": content
            })
            
    injected_prompt = ""
    if matched_skills:
        injected_prompt += "<injected_skills>\n"
        injected_prompt += "以下为你注入了多个专门领域的AI专家技能，请根据用户的问题，综合运用它们的规则来回答。\n"
        for s in matched_skills:
            injected_prompt += f'<skill name="{s["name"]}">\n'
            injected_prompt += f'{s["content"]}\n'
            injected_prompt += f'</skill>\n'
        injected_prompt += "</injected_skills>\n"
        
    return ResolveResponse(
        injected_prompt=injected_prompt,
        matched_skills=[{"id": s["id"], "name": s["name"]} for s in matched_skills]
    )
