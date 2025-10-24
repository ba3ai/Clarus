# backend/services/openai_client.py
import os
from typing import List, Dict, Optional

try:
    from openai import OpenAI
except Exception as e:
    raise RuntimeError("OpenAI SDK not installed. Run: pip install openai") from e

DEFAULT_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
EMBED_MODEL = os.getenv("OPENAI_EMBED_MODEL", "text-embedding-3-small")

_FINANCE_SYSTEM = (
    "You are a concise, role-aware financial reporting copilot. "
    "When numbers are returned, format with thousands separators; "
    "percentages to 2 decimals with a % sign. "
    "If user role limits visibility, say so and avoid leaking hidden values."
)

class LLMClient:
    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        self.client = OpenAI(api_key=api_key or os.getenv("OPENAI_API_KEY"))
        self.model = model or DEFAULT_MODEL

    # ----- Chat -----
    def chat(self, messages: List[Dict[str, str]], temperature: float = 0.2, model: Optional[str] = None) -> str:
        resp = self.client.chat.completions.create(
            model=model or self.model,
            messages=messages,
            temperature=temperature,
        )
        return resp.choices[0].message.content or ""

    def finance_answer(self, user_prompt: str, role_hint: Optional[str] = None) -> str:
        sys = _FINANCE_SYSTEM + (f" Current user role: {role_hint}." if role_hint else "")
        return self.chat(
            messages=[{"role": "system", "content": sys}, {"role": "user", "content": user_prompt}]
        )

    # ----- Embeddings -----
    def embed(self, texts: List[str], model: Optional[str] = None) -> List[List[float]]:
        if not texts:
            return []
        resp = self.client.embeddings.create(model=model or EMBED_MODEL, input=texts)
        return [d.embedding for d in resp.data]
