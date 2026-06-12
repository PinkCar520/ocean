from fastapi import FastAPI
from routers import knowledge_projects
from routers import skills

app = FastAPI(
    title="Ocean FastAPI Backend",
    description="Python AI Brain for Ocean Platform",
    version="1.0.0"
)

app.include_router(knowledge_projects.router)
app.include_router(skills.router)

@app.get("/")
def read_root():
    return {"message": "Welcome to Ocean FastAPI Backend!"}
