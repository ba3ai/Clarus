# backend/services/openai_client.py
import os
import time
import json
import math
from typing import List, Dict, Any, Optional, Sequence
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading
import random

try:
    from openai import OpenAI  # SDK >= 1.0
except Exception:
    OpenAI = None  # type: ignore

# ------------------------ Models & Keys ------------------------
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_CHAT_MODEL = os.getenv("OPENAI_CHAT_MODEL", "gpt-4o-mini")
OPENAI_EMBEDDING_MODEL = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")

# -------------------- Context Assembly Knobs -------------------
CONTEXT_UNLIMITED = os.getenv("CONTEXT_UNLIMITED", "0") == "1"
CONTEXT_MAX_TOKENS   = int(os.getenv("CONTEXT_MAX_TOKENS", "24000"))
CONTEXT_SEG_TOKENS   = int(os.getenv("CONTEXT_SEG_TOKENS", "6000"))
CONTEXT_DOC_HEAD_TOK = int(os.getenv("CONTEXT_DOC_HEAD_TOK", "512"))

# -------------------- Embedding Safety Knobs -------------------
EMBED_MAX_REQUEST_TOKENS = int(os.getenv("EMBED_MAX_REQUEST_TOKENS", "260000"))
EMBED_MAX_ITEM_TOKENS    = int(os.getenv("EMBED_MAX_ITEM_TOKENS", "6000"))
EMBED_MAX_CONCURRENCY    = int(os.getenv("EMBED_MAX_CONCURRENCY", "4"))
EMBED_BATCH_SIZE         = int(os.getenv("EMBED_BATCH_SIZE", "128"))
EMBED_RETRY_MAX          = int(os.getenv("EMBED_RETRY_MAX", "5"))
EMBED_RETRY_BASE_DELAY   = float(os.getenv("EMBED_RETRY_BASE_DELAY", "0.5"))

# ------------------- Chat Input Safety Budgets -----------------
CHAT_INPUT_TOKEN_BUDGET = int(os.getenv("CHAT_INPUT_TOKEN_BUDGET", "90000"))
MAP_CHUNK_TOKENS        = int(os.getenv("MAP_CHUNK_TOKENS", "12000"))
MAP_MAX_WORKERS         = int(os.getenv("MAP_MAX_WORKERS", "4"))
CHAT_MIN_CALL_INTERVAL_SEC = float(os.getenv("CHAT_MIN_CALL_INTERVAL_SEC", "0.5"))
MAP_RETRY_MAX = int(os.getenv("MAP_RETRY_MAX", "4"))

# ------------------------ System Prompts -----------------------
_FINANCE_SYSTEM = (
    "You are a concise, role-aware financial reporting copilot for a private fund. "
    "ALWAYS answer strictly from the provided Context segments. "
    "If Context is insufficient, state exactly what’s missing and where to find it "
    "(workbook, sheet, and period). "
    "When you use a Context line, reference its bracketed number(s). "
    "Numbers: use thousands separators; percentages with two decimals and a % sign. "
    "Respect role visibility; never leak hidden values."
)

_GENERAL_SYSTEM = (
    "You are a friendly, concise assistant for small talk and general help. "
    "Answer directly. Do not mention 'Context' or knowledge bases."
)

_INTENT_SYSTEM = (
    "You are an intent classifier. Decide whether the user's message is about "
    "financial reporting (domain='financial') or not (domain='general'). "
    "Return ONLY compact JSON with keys: domain (string 'financial'|'general'), "
    "confidence (number 0..1), and reason (short string). No other text."
)

# -------------------------- Rate Gate --------------------------
class _RateGate:
    def __init__(self, min_interval_sec: float):
        self.min_interval_sec = max(0.0, min_interval_sec)
        self._lock = threading.Lock()
        self._last = 0.0
    def wait(self):
        with self._lock:
            now = time.time()
            wait = self.min_interval_sec - (now - self._last)
            if wait > 0:
                time.sleep(wait)
            self._last = time.time()

_rate_gate = _RateGate(CHAT_MIN_CALL_INTERVAL_SEC)

# ------------------------ Token Helpers ------------------------
def _rough_tokens(s: str) -> int:
    # ≈ 4 chars per token (rough). Always at least 1 for non-empty strings.
    return 0 if not s else max(1, math.ceil(len(s) / 4))

def _truncate_to_tokens(s: str, max_tokens: int) -> str:
    if not s:
        return ""
    if _rough_tokens(s) <= max_tokens:
        return s
    return s[: max_tokens * 4]

def _cap(s: str, max_tokens: int) -> str:
    return _truncate_to_tokens(s, max_tokens)

# ---------------------- Context Assembly -----------------------
def _build_context_segments(context_docs: List[Dict[str, Any]]) -> List[str]:
    lines: List[str] = []
    for i, d in enumerate(context_docs, start=1):
        meta = d.get("meta", {}) or {}
        where = f"{meta.get('workbook','')}/{meta.get('sheet','')}".strip("/")
        row = meta.get("row")
        loc = f"{where}#{row}" if row is not None else where
        text = (d.get("text") or "").strip()
        if not CONTEXT_UNLIMITED:
            text = _cap(text, CONTEXT_DOC_HEAD_TOK)
        lines.append(f"[{i}] {loc}: {text}")
    if not lines:
        return []

    if CONTEXT_UNLIMITED:
        return ["\n".join(lines)]

    # Pack lines into segments
    segments: List[str] = []
    cur = ""
    for line in lines:
        if cur and (_rough_tokens(cur) + _rough_tokens(line) > CONTEXT_SEG_TOKENS):
            segments.append(cur)
            cur = line
        else:
            cur = f"{cur}\n{line}" if cur else line
    if cur:
        segments.append(cur)

    final: List[str] = []
    total = 0
    for seg in segments:
        t = _rough_tokens(seg)
        if total + t > CONTEXT_MAX_TOKENS:
            break
        final.append(seg)
        total += t
    return final

def _clip_context_to_budget(question: str, ctx_lines: List[str], budget: int) -> List[str]:
    base = _rough_tokens(question) + 500  # headroom for system + formatting
    if base >= budget:
        return []
    room = budget - base
    kept: List[str] = []
    used = 0
    for line in ctx_lines:
        t = _rough_tokens(line)
        if used + t > room:
            break
        kept.append(line)
        used += t
    return kept

# ============================ Client ===========================
class LLMClient:
    def __init__(
        self,
        api_key: Optional[str] = None,
        chat_model: str = OPENAI_CHAT_MODEL,
        embedding_model: str = OPENAI_EMBEDDING_MODEL,
    ):
        api_key = api_key or OPENAI_API_KEY
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY is not set.")
        if OpenAI is None:
            raise RuntimeError("openai package not installed (>=1.0 required).")
        self.client = OpenAI(api_key=api_key)
        self.chat_model = chat_model
        self.embedding_model = embedding_model

    # ------------------- General small-talk --------------------
    def general_answer(self, prompt: str) -> str:
        msgs = [
            {"role": "system", "content": _GENERAL_SYSTEM},
            {"role": "user", "content": prompt},
        ]
        resp = self.client.chat.completions.create(
            model=self.chat_model, messages=msgs, temperature=0.6
        )
        return (resp.choices[0].message.content or "").strip()

    # ---------------------- Map-Reduce -------------------------
    def _map_reduce_answer(self, question: str, ctx_lines: List[str]) -> str:
        # shard lines into chunks
        chunks: List[str] = []
        cur, cur_tok = [], 0
        for ln in ctx_lines:
            t = _rough_tokens(ln)
            if cur and cur_tok + t > MAP_CHUNK_TOKENS:
                chunks.append("\n".join(cur)); cur, cur_tok = [], 0
            cur.append(ln); cur_tok += t
        if cur: chunks.append("\n".join(cur))

        summaries = [""] * len(chunks)

        def map_one(idx: int, text: str) -> str:
            # rate-gated + retried mapper
            delay = 0.6
            for attempt in range(1, MAP_RETRY_MAX + 2):
                _rate_gate.wait()
                try:
                    msgs = [
                        {"role": "system", "content": "Extract ONLY facts, figures, and rows strictly relevant to the question. Be terse."},
                        {"role": "system", "content": f"Question: {question}"},
                        {"role": "user", "content": text},
                    ]
                    r = self.client.chat.completions.create(model=self.chat_model, messages=msgs, temperature=0.0)
                    return (r.choices[0].message.content or "").strip()
                except Exception as e:
                    s = str(e).lower()
                    if "rate_limit" in s or "tpm" in s:
                        time.sleep(delay + random.random() * 0.25)
                        delay = min(delay * 2, 5.0)
                        continue
                    raise
            _rate_gate.wait()
            r = self.client.chat.completions.create(model=self.chat_model, messages=msgs, temperature=0.0)
            return (r.choices[0].message.content or "").strip()

        if chunks:
            with ThreadPoolExecutor(max_workers=max(1, MAP_MAX_WORKERS)) as ex:
                futs = {ex.submit(map_one, i, ch): i for i, ch in enumerate(chunks)}
                for fut in as_completed(futs):
                    summaries[futs[fut]] = fut.result()

        reduce_ctx = "\n\n".join(summaries) if summaries else ""
        msgs = [
            {"role": "system", "content": "You are a concise financial reporting copilot. Answer strictly from the summaries; if insufficient, say what's missing (workbook/sheet/period)."},
            {"role": "system", "content": reduce_ctx},
            {"role": "user", "content": question},
        ]
        _rate_gate.wait()
        r = self.client.chat.completions.create(model=self.chat_model, messages=msgs, temperature=0.1)
        return (r.choices[0].message.content or "").strip()

    def _ctx_lines(self, context_docs: List[Dict[str, Any]]) -> List[str]:
        lines: List[str] = []
        for i, d in enumerate(context_docs, start=1):
            meta = d.get("meta", {}) or {}
            where = f"{meta.get('workbook','')}/{meta.get('sheet','')}".strip("/")
            row = meta.get("row")
            loc = f"{where}#{row}" if row is not None else where
            text = (d.get("text") or "").strip()
            lines.append(f"[{i}] {loc}: {text}")
        return lines

    # ----------------- Finance Answers (no history) ------------
    def finance_answer(self, prompt: str, context_docs: List[Dict[str, Any]]) -> str:
        ctx_lines = self._ctx_lines(context_docs)
        clipped = _clip_context_to_budget(prompt, ctx_lines, CHAT_INPUT_TOKEN_BUDGET)

        msgs = [{"role": "system", "content":
                 "You are a concise, role-aware financial reporting copilot. "
                 "Answer strictly from Context; if insufficient, name exactly what's missing (workbook/sheet/period). "
                 "Numbers: thousands separators; % with two decimals."}]
        if clipped:
            msgs.append({"role": "system", "content": "Context:\n" + "\n".join(clipped)})
        msgs.append({"role": "user", "content": prompt})

        try:
            r = self.client.chat.completions.create(model=self.chat_model, messages=msgs, temperature=0.1)
            return (r.choices[0].message.content or "").strip()
        except Exception as e:
            s = str(e).lower()
            if "rate_limit" in s or "tpm" in s or "too large" in s or "maximum context length" in s:
                return self._map_reduce_answer(prompt, ctx_lines)
            raise

    # ---------------- Finance Answers (with history) -----------
    def finance_answer_with_history(
        self,
        prompt: str,
        context_docs: List[Dict[str, Any]],
        history: Sequence[Dict[str, str]] = (),
    ) -> str:
        ctx_lines = self._ctx_lines(context_docs)
        clipped = _clip_context_to_budget(prompt, ctx_lines, CHAT_INPUT_TOKEN_BUDGET)

        msgs = [{"role": "system", "content":
                 "You are a concise, role-aware financial reporting copilot. "
                 "Answer strictly from Context; if insufficient, name exactly what's missing (workbook/sheet/period). "
                 "Numbers: thousands separators; % with two decimals."}]
        if clipped:
            msgs.append({"role": "system", "content": "Context:\n" + "\n".join(clipped)})
        for h in history or []:
            role = h.get("role")
            content = (h.get("content") or "").strip()
            if role in ("user", "assistant") and content:
                msgs.append({"role": role, "content": content})
        msgs.append({"role": "user", "content": prompt})

        try:
            r = self.client.chat.completions.create(model=self.chat_model, messages=msgs, temperature=0.1)
            return (r.choices[0].message.content or "").strip()
        except Exception as e:
            s = str(e).lower()
            if "rate_limit" in s or "tpm" in s or "too large" in s or "maximum context length" in s:
                return self._map_reduce_answer(prompt, ctx_lines)
            raise

    # ----------------------- Intent ----------------------------
    def classify_intent(self, text: str) -> Dict[str, Any]:
        msgs = [
            {"role": "system", "content": _INTENT_SYSTEM},
            {"role": "user", "content": text},
        ]
        resp = self.client.chat.completions.create(
            model=self.chat_model, messages=msgs, temperature=0
        )
        raw = (resp.choices[0].message.content or "").strip()
        try:
            data = json.loads(raw)
            dom = str(data.get("domain", "general")).lower()
            if dom not in ("financial", "general"):
                dom = "general"
            conf = float(data.get("confidence", 0.5))
            reason = str(data.get("reason", ""))
            return {"domain": dom, "confidence": conf, "reason": reason}
        except Exception:
            lower = text.lower()
            flags = any(w in lower for w in ["balance", "investment", "roi", "irr", "moic", "%", "$"])
            return {"domain": "financial" if flags else "general", "confidence": 0.55, "reason": "fallback"}

    # ==================== Embeddings ===========================
    # Cleaning helpers
    def _clean_for_embedding(self, items: List[str]) -> List[str]:
        cleaned: List[str] = []
        for x in items:
            if not isinstance(x, str):
                continue
            x = x.strip()
            if not x:
                continue
            # token-aware truncation
            if _rough_tokens(x) > EMBED_MAX_ITEM_TOKENS:
                x = _truncate_to_tokens(x, EMBED_MAX_ITEM_TOKENS)
            cleaned.append(x)
        return cleaned

    def _call_embeddings(self, payload: List[str]) -> List[List[float]]:
        """Single API call with retries/backoff; splits on 400 $.input errors."""
        delay = EMBED_RETRY_BASE_DELAY
        for attempt in range(1, EMBED_RETRY_MAX + 1):
            try:
                resp = self.client.embeddings.create(model=self.embedding_model, input=payload)
                return [d.embedding for d in resp.data]
            except Exception as e:
                s = str(e).lower()
                # If the server says the input is invalid, split the batch (if possible)
                if "invalid" in s and "input" in s and len(payload) > 1:
                    mid = max(1, len(payload) // 2)
                    left = self._call_embeddings(payload[:mid])
                    right = self._call_embeddings(payload[mid:])
                    return left + right
                # Otherwise, simple backoff (rate-limits/transients)
                time.sleep(delay + random.random() * 0.25)
                delay = min(delay * 2, 6.0)
        # last try (bubble up if it still fails)
        resp = self.client.embeddings.create(model=self.embedding_model, input=payload)
        return [d.embedding for d in resp.data]

    def embed(self, texts: List[str]) -> List[List[float]]:
        """Single-batch embed with cleaning/truncation. Use embed_parallel for large lists."""
        if not texts:
            return []
        payload = self._clean_for_embedding(texts)
        if not payload:
            return []

        # respect a request token budget; split into request batches
        batches: List[List[str]] = []
        cur: List[str] = []
        cur_tok = 0
        for t in payload:
            tok = _rough_tokens(t)
            if cur and (cur_tok + tok) > EMBED_MAX_REQUEST_TOKENS:
                batches.append(cur); cur, cur_tok = [], 0
            cur.append(t); cur_tok += tok
        if cur:
            batches.append(cur)

        out: List[List[float]] = []
        for b in batches:
            out.extend(self._call_embeddings(b))
        return out

    def embed_parallel(self, texts: List[str]) -> List[List[float]]:
        """Large-list embed: clean → batch (size + tokens) → parallel → safe retry."""
        if not texts:
            return []
        payload = self._clean_for_embedding(texts)
        if not payload:
            return []

        # Build batches by size and token budget
        batches: List[List[str]] = []
        cur: List[str] = []
        cur_tok = 0
        for t in payload:
            tok = _rough_tokens(t)
            # if adding t breaks size or token budget, push current batch
            if cur and (len(cur) >= EMBED_BATCH_SIZE or (cur_tok + tok) > EMBED_MAX_REQUEST_TOKENS):
                batches.append(cur); cur, cur_tok = [], 0
            cur.append(t); cur_tok += tok
        if cur:
            batches.append(cur)

        def call_batch(b: List[str]) -> List[List[float]]:
            return self._call_embeddings(b)

        results_by_batch: Dict[int, List[List[float]]] = {}
        with ThreadPoolExecutor(max_workers=max(1, EMBED_MAX_CONCURRENCY)) as pool:
            futs = {pool.submit(call_batch, b): i for i, b in enumerate(batches)}
            for fut in as_completed(futs):
                i = futs[fut]
                results_by_batch[i] = fut.result()

        # Stitch in order
        out: List[List[float]] = []
        for i in range(len(batches)):
            out.extend(results_by_batch[i])
        return out

    # ---------- Compatibility aliases for embeddings -----------
    def embeddings(self, texts: List[str], model: Optional[str] = None) -> List[List[float]]:
        """Alias for .embed(); `model` accepted for compatibility but ignored—use env var to set model."""
        if model:
            self.embedding_model = model
        return self.embed(texts)

    def create_embeddings(self, texts: List[str], model: Optional[str] = None) -> List[List[float]]:
        """Alias for .embed(); mirrors some older client interfaces."""
        if model:
            self.embedding_model = model
        return self.embed(texts)

    # ========================== Chat ===========================
    def chat(
        self,
        prompt: str,
        *,
        model: Optional[str] = None,
        system: Optional[str] = None,
        history: Sequence[Dict[str, str]] = (),
        temperature: float = 0.1,
    ) -> str:
        """
        Minimal chat helper used by the RAG route.
        - `prompt` is treated as the user's message (you may pass a composed prompt).
        - `system` (optional) sets the system instruction; if omitted we use a concise finance default.
        - `history` is a sequence of {'role': 'user'|'assistant', 'content': str}.
        """
        msgs: List[Dict[str, str]] = []
        msgs.append({"role": "system", "content": system or _FINANCE_SYSTEM})
        for h in history or []:
            role = h.get("role")
            content = (h.get("content") or "").strip()
            if role in ("user", "assistant") and content:
                msgs.append({"role": role, "content": content})
        msgs.append({"role": "user", "content": prompt})

        _rate_gate.wait()
        r = self.client.chat.completions.create(
            model=(model or self.chat_model),
            messages=msgs,
            temperature=temperature,
        )
        return (r.choices[0].message.content or "").strip()
