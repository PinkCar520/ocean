import os
import logging
from openai import OpenAI

logger = logging.getLogger(__name__)

class EmbeddingService:
    _instance = None
    _client = None
    _model_name = "text-embedding-3-small" # default to openai's latest small model

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = EmbeddingService()
            logger.info("Initializing LLM API client for remote embeddings...")
            
            # 与 Skills 计算口径一致：DEFAULT_AI_PROVIDER + {P}_API_KEY/BASE_URL，回退 OPENAI_*
            provider = os.getenv("DEFAULT_AI_PROVIDER", "openai").upper()
            api_key = os.getenv(f"{provider}_API_KEY") or os.getenv("OPENAI_API_KEY")
            base_url = os.getenv(f"{provider}_BASE_URL") or os.getenv("OPENAI_BASE_URL")
            cls._instance._client = OpenAI(api_key=api_key, base_url=base_url)
            cls._instance._model_name = os.getenv("EMBEDDING_MODEL_NAME", "text-embedding-3-small")
        return cls._instance

    def get_embedding(self, text: str) -> list[float]:
        if not self._client:
            raise RuntimeError("OpenAI Client not initialized")
        
        # Replace newlines with spaces as recommended by OpenAI for older models, 
        # though text-embedding-3 handles it well, it's good practice
        text = text.replace("\n", " ")
        
        response = self._client.embeddings.create(
            input=[text],
            model=self._model_name,
            # 显式指定 1536 维以匹配 pgvector(1536)（qwen3.7-text-embedding 默认 1024）
            dimensions=1536,
        )
        return response.data[0].embedding

# Global helper function for ease of use
def generate_embedding(text: str) -> list[float]:
    service = EmbeddingService.get_instance()
    return service.get_embedding(text)
