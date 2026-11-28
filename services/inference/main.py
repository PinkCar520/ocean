from fastapi import FastAPI
from routers import audio
from routers import embedding

app = FastAPI(
    title="Ocean Inference Service",
    description="Python 模型能力 Job（Embedding / 音频转写）。业务 API 已收敛至 NestJS Gateway。",
    version="2.0.0"
)

app.include_router(embedding.router)
app.include_router(audio.router)

@app.get("/")
def read_root():
    return {"message": "Ocean Inference Service"}
