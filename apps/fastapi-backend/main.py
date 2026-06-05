from fastapi import FastAPI
from routers import knowledge_projects

app = FastAPI(
    title="UClaw FastAPI Backend",
    description="Python rewrite of UClaw API",
    version="1.0.0"
)

app.include_router(knowledge_projects.router)

@app.get("/")
def read_root():
    return {"message": "Welcome to UClaw FastAPI Backend!"}


from fastapi import FastAPI

app = FastAPI(
    title="Uclaw FastAPI Backend",
    description="Python rewrite of Uclaw API",
    version="1.0.0"
)

app.include_router(knowledge_projects.router)

def read_root():
    return {"message": "Welcome to Uclaw FastAPI Backend!"}
