import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from main import app

class InferenceContract(unittest.TestCase):
    def test_health(self):
        self.assertEqual(TestClient(app).get("/").status_code, 200)

    @patch("routers.embedding.generate_embedding", return_value=[0.1] * 1536)
    def test_embedding_contract(self, generate):
        response = TestClient(app).post("/api/internal/embedding", json={"text": "test"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()["embedding"]), 1536)
        generate.assert_called_once_with("test")
