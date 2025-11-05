# backend/services/sheet_embeddings.py
from __future__ import annotations

import io
import os
import re
import json
import math
import hashlib
from typing import Dict, List, Tuple, Optional, Any
from collections import defaultdict, Counter

import numpy as np

from backend.services.openai_client import LLMClient  # ok in your tree

# ================ Storage layout =================
KNOWLEDGEBASE_DIR = os.getenv(
    "KNOWLEDGEBASE_DIR",
    os.path.join(os.path.dirname(__file__), "knowledgebase"),
)

def _safe(s: str) -> str:
    return re.sub(r"[^A-Za-z0-9._:-]", "_", s or "anon")

def _tenant_dir(tenant: Optional[str]) -> str:
    t = _safe(tenant or "user:anonymous_local")
    p = os.path.join(KNOWLEDGEBASE_DIR, t.replace(":", "_"))
    os.makedirs(p, exist_ok=True)
    return p

def _paths(tenant: Optional[str]) -> Dict[str, str]:
    base = _tenant_dir(tenant)
    return {
        "base": base,
        "meta": os.path.join(base, "metas.jsonl"),
        "stats": os.path.join(base, "stats.json"),
        "index": os.path.join(base, "faiss.index"),
        "dim": os.path.join(base, "dim.json"),
        "docs": os.path.join(base, "documents"),
        "manifest": os.path.join(base, "processed_docs.json"),
        "lex": os.path.join(base, "bm25.json"),   # NEW: cached lexical index
    }

def list_kb_tenants() -> List[str]:
    if not os.path.exists(KNOWLEDGEBASE_DIR):
        return []
    out = []
    for d in os.listdir(KNOWLEDGEBASE_DIR):
        path = os.path.join(KNOWLEDGEBASE_DIR, d)
        if os.path.isdir(path):
            out.append("user:" + d.split("user_", 1)[-1] if d.startswith("user_") else d.replace("_", ":"))
    return out

# ===================== Meta helpers ========================
def _count_metas(p_meta: str) -> int:
    if not os.path.exists(p_meta):
        return 0
    with open(p_meta, "r", encoding="utf-8") as f:
        return sum(1 for _ in f if _.strip())

def _save_dim(dim: int, p_dim: str) -> None:
    with open(p_dim, "w", encoding="utf-8") as f:
        json.dump({"dim": dim}, f)

def _load_dim(p_dim: str) -> Optional[int]:
    if not os.path.exists(p_dim):
        return None
    with open(p_dim, "r", encoding="utf-8") as f:
        try:
            return int(json.load(f).get("dim"))
        except Exception:
            return None

def _iter_metas_slice(p_meta: str, start: int, stop: Optional[int] = None):
    if not os.path.exists(p_meta):
        return
    with open(p_meta, "r", encoding="utf-8") as f:
        for i, line in enumerate(f):
            if stop is not None and i >= stop:
                break
            if i < start:
                continue
            if line.strip():
                yield i, json.loads(line)

def _index_ntotal(index) -> int:
    try:
        return int(getattr(index, "ntotal", 0))
    except Exception:
        return 0

# ================ Simple tokenizer ==========================
_TOKEN_SPLIT = re.compile(r"[^\w.%/-]+", re.UNICODE)  # keep %, /, - (finance + paths)

def _tok(s: str) -> List[str]:
    return [t.lower() for t in _TOKEN_SPLIT.split(s or "") if t]

# ================ parsers (files → text/meta) =================
def _yield_text_chunks(text: str, filename: str, chunk_chars: int = 1200, overlap: int = 120):
    text = text.replace("\r\n", "\n")
    i, n = 0, len(text)
    row = 0
    while i < n:
        j = min(n, i + chunk_chars)
        chunk = text[i:j]
        if chunk.strip():
            yield {"text": chunk, "meta": {"workbook": filename, "sheet": "text", "row": row}}
            row += 1
        i = j - overlap if j - overlap > i else j

def _extract_rows_with_meta_from_excel(file_bytes: bytes, filename: str):
    import openpyxl
    from datetime import datetime

    def _norm_header(h):
        if not h:
            return ""
        s = str(h).strip()
        try:
            dt = None
            for fmt in ("%b %Y", "%B %Y", "%Y-%m-%d", "%Y-%m", "%m/%Y", "%m-%Y"):
                try: dt = datetime.strptime(s, fmt); break
                except Exception: continue
            if dt:
                y, m = dt.year, dt.month
                last = 29 if (m == 2 and (y % 4 == 0 and (y % 100 != 0 or y % 400 == 0))) else \
                       28 if m == 2 else 30 if m in (4,6,9,11) else 31
                return f"{y:04d}-{m:02d}-{last:02d}"
        except Exception:
            pass
        return s

    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
    for ws in wb.worksheets:
        rows = list(ws.iter_rows(values_only=True))
        if not rows: continue

        header, start_i = [], 0
        for i, row in enumerate(rows):
            vals = [v for v in row if v is not None and str(v).strip() != ""]
            if vals:
                header = [_norm_header(h) for h in row]
                start_i = i + 1
                break

        r_index = 0
        for row in rows[start_i:]:
            kv = []
            for h, v in zip(header, row):
                if v is None or str(v).strip() == "": continue
                kv.append(f"{h or 'col'}: {v}")
            if not kv:
                r_index += 1; continue
            yield {"text": " | ".join(kv),
                   "meta": {"workbook": filename, "sheet": ws.title, "row": r_index}}
            r_index += 1

def _extract_text_from_file(file_bytes: bytes, filename: str):
    name = filename.lower()
    try:
        if name.endswith((".xlsx", ".xlsm", ".xls")):
            try: return list(_extract_rows_with_meta_from_excel(file_bytes, filename))
            except Exception: return []
        if name.endswith((".txt", ".md", ".csv", ".tsv", ".json", ".html")):
            return file_bytes.decode("utf-8", errors="ignore")
        if name.endswith((".pdf",)):
            try:
                from pypdf import PdfReader
                reader = PdfReader(io.BytesIO(file_bytes))
                return "\n".join([(p.extract_text() or "") for p in reader.pages])
            except Exception: return ""
        if name.endswith((".docx",)):
            try:
                import docx
                doc = docx.Document(io.BytesIO(file_bytes))
                return "\n".join([(p.text or "") for p in doc.paragraphs])
            except Exception: return ""
    except Exception:
        return ""
    return file_bytes.decode("utf-8", errors="ignore")

# ================ sync documents → metas =================
def _file_fingerprint(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""): h.update(chunk)
    return h.hexdigest()

def sync_documents_to_metas(tenant: Optional[str]) -> Dict[str, Any]:
    p = _paths(tenant)
    os.makedirs(p["base"], exist_ok=True)
    os.makedirs(p["docs"], exist_ok=True)

    manifest: Dict[str, str] = {}
    if os.path.exists(p["manifest"]):
        try:
            with open(p["manifest"], "r", encoding="utf-8") as m:
                manifest = json.load(m)
        except Exception:
            manifest = {}

    added_chunks = 0
    files = [
        os.path.join(p["docs"], fn)
        for fn in os.listdir(p["docs"])
        if os.path.isfile(os.path.join(p["docs"], fn))
    ]

    with open(p["meta"], "a", encoding="utf-8") as meta_out:
        for full in files:
            try:
                fp = _file_fingerprint(full)
                if manifest.get(full) == fp:
                    continue
                with open(full, "rb") as fh: raw = fh.read()
                payload = _extract_text_from_file(raw, os.path.basename(full))

                if isinstance(payload, list):
                    for row in payload:
                        meta_out.write(json.dumps(row) + "\n"); added_chunks += 1
                else:
                    text = payload or ""
                    for ch in _yield_text_chunks(text, os.path.basename(full)):
                        meta_out.write(json.dumps(ch) + "\n"); added_chunks += 1
                manifest[full] = fp
            except Exception:
                continue

    with open(p["manifest"], "w", encoding="utf-8") as m:
        json.dump(manifest, m)

    return {"added_chunks": added_chunks, "files_scanned": len(files)}

# ================ Vector index builders =================
def rebuild_index(tenant: Optional[str]) -> Dict[str, Any]:
    import faiss  # type: ignore
    p = _paths(tenant)
    sync_documents_to_metas(tenant)

    total_meta = _count_metas(p["meta"])
    if total_meta == 0: return {"rebuilt": 0, "dim": None}

    llm = LLMClient()
    texts = [m["text"] for _, m in _iter_metas_slice(p["meta"], 0, None) or []]
    vecs = llm.embed_parallel(texts)
    if not vecs: return {"rebuilt": 0, "dim": None}

    dim = len(vecs[0])
    mat = np.array(vecs, dtype="float32"); faiss.normalize_L2(mat)
    index = faiss.IndexFlatIP(dim)
    index.add(mat)
    faiss.write_index(index, p["index"])
    _save_dim(dim, p["dim"])

    # build lexical cache
    _build_bm25_cache(p["meta"], p["lex"])

    return {"rebuilt": len(texts), "dim": dim}

def _ensure_index_built(tenant: Optional[str]):
    import faiss  # type: ignore
    p = _paths(tenant)
    sync_documents_to_metas(tenant)

    p_index, p_meta, p_dim = p["index"], p["meta"], p["dim"]
    total_meta = _count_metas(p_meta)
    if total_meta == 0: return

    llm = LLMClient()

    fresh_bm25_needed = False

    if not os.path.exists(p_index) or not os.path.exists(p_dim):
        texts = [m["text"] for _, m in _iter_metas_slice(p_meta, 0, None) or []]
        if not texts: return
        vecs = llm.embed_parallel(texts)
        dim = len(vecs[0])
        mat = np.array(vecs, dtype="float32"); faiss.normalize_L2(mat)
        index = faiss.IndexFlatIP(dim)
        index.add(mat)
        import faiss as _fa  # type: ignore
        _fa.write_index(index, p_index)
        _save_dim(dim, p_dim)
        fresh_bm25_needed = True
    else:
        try:
            index = faiss.read_index(p_index)
            dim_file = _load_dim(p_dim)
            if dim_file is None: raise RuntimeError("Missing dim.json")

            have = int(getattr(index, "ntotal", 0))
            if have != total_meta:
                new_texts = [m["text"] for _, m in _iter_metas_slice(p_meta, have, total_meta) or []]
                if new_texts:
                    new_vecs = llm.embed_parallel(new_texts)
                    if len(new_vecs[0]) != dim_file:
                        texts = [m["text"] for _, m in _iter_metas_slice(p_meta, 0, None) or []]
                        vecs = llm.embed_parallel(texts); dim = len(vecs[0])
                        mat = np.array(vecs, dtype="float32"); faiss.normalize_L2(mat)
                        index = faiss.IndexFlatIP(dim); index.add(mat); faiss.write_index(index, p_index); _save_dim(dim, p_dim)
                    else:
                        mat_new = np.array(new_vecs, dtype="float32"); faiss.normalize_L2(mat_new)
                        index.add(mat_new); faiss.write_index(index, p_index)
                fresh_bm25_needed = True
        except Exception:
            texts = [m["text"] for _, m in _iter_metas_slice(p_meta, 0, None) or []]
            if not texts: return
            vecs = llm.embed_parallel(texts); dim = len(vecs[0])
            mat = np.array(vecs, dtype="float32"); faiss.normalize_L2(mat)
            index = faiss.IndexFlatIP(dim); index.add(mat); faiss.write_index(index, p_index); _save_dim(dim, p_dim)
            fresh_bm25_needed = True

    # keep lexical cache in sync (cheap)
    if fresh_bm25_needed or not os.path.exists(p["lex"]):
        _build_bm25_cache(p_meta, p["lex"])

def build_or_load_index(tenant: Optional[str]) -> Dict[str, Any]:
    p = _paths(tenant)
    return {"tenant": tenant, "paths": p}

def _load_index_handle(index_handle: Dict[str, Any]):
    import faiss  # type: ignore
    p = index_handle["paths"]
    if not os.path.exists(p["index"]): return None
    return faiss.read_index(p["index"])

# ======================= BM25 (tiny) ==========================
def _build_bm25_cache(p_meta: str, p_cache: str) -> None:
    """Build a lightweight BM25 cache {docs, df, idf, avgdl} for quick lexical search."""
    if not os.path.exists(p_meta):
        return
    docs: List[List[str]] = []
    with open(p_meta, "r", encoding="utf-8") as f:
        for line in f:
            if not line.strip(): continue
            txt = (json.loads(line).get("text") or "")
            docs.append(_tok(txt))

    N = len(docs) or 1
    df = Counter()
    for d in docs:
        for t in set(d): df[t] += 1
    idf = {t: math.log(1 + (N - c + 0.5) / (c + 0.5)) for t, c in df.items()}
    avgdl = sum(len(d) for d in docs) / N
    with open(p_cache, "w", encoding="utf-8") as w:
        json.dump({"docs": docs, "idf": idf, "avgdl": avgdl}, w)

def _bm25_search(p_cache: str, query: str, topk: int = 12) -> List[Tuple[int, float]]:
    if not os.path.exists(p_cache): return []
    try:
        data = json.load(open(p_cache, "r", encoding="utf-8"))
    except Exception:
        return []
    docs: List[List[str]] = data["docs"]
    idf: Dict[str, float] = {k: float(v) for k, v in data["idf"].items()}
    avgdl: float = float(data["avgdl"])
    q = _tok(query)
    k1, b = 1.5, 0.75
    scores: List[Tuple[int, float]] = []
    for i, d in enumerate(docs):
        if not d: continue
        tf = Counter(d)
        dl = len(d)
        s = 0.0
        for t in q:
            if t not in idf: continue
            f = tf.get(t, 0)
            if f == 0: continue
            s += idf[t] * (f * (k1 + 1)) / (f + k1 * (1 - b + b * dl / (avgdl or 1)))
        if s != 0.0:
            scores.append((i, s))
    scores.sort(key=lambda x: x[1], reverse=True)
    return scores[:topk]

# ==================== Multi-query & fusion ====================
def _multi_queries(llm: LLMClient, q: str, n: int = 3) -> List[str]:
    """Generate a few paraphrases to cover alternate phrasings (cheap prompt)."""
    try:
        prompt = (
            "Rewrite the question into up to 3 alternative search queries (short). "
            "Focus on synonyms and key nouns. One per line, no numbering. "
            f"Original: {q}"
        )
        txt = llm.general_answer(prompt)
        outs = [x.strip() for x in txt.splitlines() if x.strip()]
        return [q] + outs[:n]
    except Exception:
        return [q]

def _rrf(fused_lists: List[List[Tuple[int, float]]], k: int = 12, k_const: int = 60) -> List[Tuple[int, float]]:
    """Reciprocal Rank Fusion over lists of (doc_id, score)."""
    score = defaultdict(float)
    for lst in fused_lists:
        for rank, (doc_id, _) in enumerate(lst):
            score[doc_id] += 1.0 / (k_const + rank + 1)
    items = list(score.items())
    items.sort(key=lambda x: x[1], reverse=True)
    return items[:k]

# ===================== Retrieval & answer =====================
def answer_from_topk(llm: LLMClient, query: str, index_handle: Dict[str, Any], k: int = 10) -> Dict[str, Any]:
    import faiss  # type: ignore
    idx = _load_index_handle(index_handle)
    if idx is None:
        return {"type": "nlp", "mode": "kb_miss", "answer": "No context.", "context": []}

    vec = llm.embed([query])[0]
    vec = np.array([vec], dtype="float32")
    faiss.normalize_L2(vec)
    D, I = idx.search(vec, k)

    p = index_handle["paths"]
    hits: List[Dict[str, Any]] = []
    with open(p["meta"], "r", encoding="utf-8") as f:
        rows = [json.loads(x) for x in f if x.strip()]
    for rank, j in enumerate(I[0]):
        if j < 0 or j >= len(rows): continue
        obj = rows[j]
        hits.append({"text": obj["text"], "meta": obj.get("meta", {}), "score": float(D[0][rank])})

    ans = llm.finance_answer(query, hits)
    return {"type": "nlp", "mode": "kb_topk", "answer": ans, "context": hits}

def answer_from_full_index(llm: LLMClient, question: str, index_handle: Dict[str, Any], max_chars: int = 1_000_000) -> Dict[str, Any]:
    p = index_handle["paths"]
    if not os.path.exists(p["meta"]):
        return {"type": "nlp", "mode": "kb_miss", "answer": "No context.", "context": []}

    docs: List[Dict[str, Any]] = []
    total = 0
    with open(p["meta"], "r", encoding="utf-8") as f:
        for line in f:
            if not line.strip(): continue
            obj = json.loads(line)
            txt = (obj.get("text") or "")
            if total + len(txt) > max_chars: break
            total += len(txt)
            docs.append({"text": txt, "meta": obj.get("meta", {})})

    if not docs:
        return {"type": "nlp", "mode": "kb_miss", "answer": "No context.", "context": []}

    ans = llm.finance_answer(question, docs)
    return {"type": "nlp", "mode": "kb_full", "answer": ans, "context": docs}

# ---------- NEW: Hybrid retrieval with BM25 + FAISS + Multi-query + RRF ----------
def hybrid_retrieve(llm: LLMClient, query: str, index_handle: Dict[str, Any],
                    topk_vec: int = 6, topk_lex: int = 6, multi: int = 3) -> List[Dict[str, Any]]:
    """Return fused, de-duplicated hits with metadata."""
    p = index_handle["paths"]
    if not os.path.exists(p["meta"]): return []

    # candidates per query
    queries = _multi_queries(llm, query, n=multi)

    # gather FAISS + BM25 results per query
    vec_lists: List[List[Tuple[int, float]]] = []
    lex_lists: List[List[Tuple[int, float]]] = []

    # Preload rows once
    with open(p["meta"], "r", encoding="utf-8") as f:
        rows = [json.loads(x) for x in f if x.strip()]

    # FAISS handle (if exists)
    idx = _load_index_handle(index_handle)

    for q in queries:
        # BM25
        bm = _bm25_search(p["lex"], q, topk=topk_lex)
        lex_lists.append(bm)

        # FAISS
        if idx is not None:
            import faiss  # type: ignore
            v = llm.embed([q])[0]
            v = np.array([v], dtype="float32"); faiss.normalize_L2(v)
            D, I = idx.search(v, topk_vec)
            pairs = [(int(I[0][i]), float(D[0][i])) for i in range(len(I[0])) if int(I[0][i]) >= 0]
            vec_lists.append(pairs)

    fused = _rrf(vec_lists + lex_lists, k=max(topk_vec, topk_lex) * 2)

    # build result docs
    seen = set()
    hits: List[Dict[str, Any]] = []
    for j, _score in fused:
        if j in seen or j < 0 or j >= len(rows): continue
        seen.add(j)
        obj = rows[j]
        hits.append({"text": obj["text"], "meta": obj.get("meta", {}), "score": float(_score)})
    return hits

def answer_hybrid(llm: LLMClient, question: str, index_handle: Dict[str, Any],
                  max_ctx: int = 8) -> Dict[str, Any]:
    """Hybrid retrieval + optional LLM re-rank → answer."""
    hits = hybrid_retrieve(llm, question, index_handle, topk_vec=6, topk_lex=6, multi=3)
    if not hits:
        return {"type": "nlp", "mode": "kb_miss", "answer": "No context.", "context": []}

    # OPTIONAL tiny re-rank: ask model to order by relevance (cheap; short prompt)
    try:
        lines = [f"[{i}] {h['meta'].get('workbook','')}/{h['meta'].get('sheet','')}#{h['meta'].get('row')} :: {h['text'][:300]}"
                 for i, h in enumerate(hits)]
        prompt = (
            "Rank these snippets by relevance to the question. Reply with a JSON array of indices (most relevant first).\n"
            f"Question: {question}\nSnippets:\n" + "\n".join(lines)
        )
        order_json = llm.general_answer(prompt)
        order = json.loads(order_json)
        if isinstance(order, list) and all(isinstance(x, int) for x in order):
            hits = [hits[i] for i in order if 0 <= i < len(hits)]
    except Exception:
        pass

    ctx = hits[:max_ctx]
    ans = llm.finance_answer(question, ctx)
    return {"type": "nlp", "mode": "kb_hybrid", "answer": ans, "context": ctx}


# ---------- Progressive Scan: stream metas.jsonl in batches with early-stop ----------
def _validation_score(llm: LLMClient, question: str, draft: str) -> float:
    """
    Ask the model to judge confidence (0..1) that the draft answer is
    supported by the provided context it used. Keep it tiny/cheap.
    """
    try:
        prompt = (
            "You are a strict validator. Score from 0 to 1 how well the Draft Answer "
            "is supported by the given Context the assistant referenced.\n"
            "Return ONLY a JSON object: {\"confidence\": number}.\n\n"
            f"Question: {question}\n"
            f"Draft Answer:\n{draft}\n"
        )
        out = llm.general_answer(prompt)
        data = json.loads(out)
        c = float(data.get("confidence", 0.0))
        if c < 0: c = 0.0
        if c > 1: c = 1.0
        return c
    except Exception:
        return 0.0

def _iter_metas_in_bm25_order(paths: Dict[str, str], query: str):
    """
    Yield (idx, obj) rows from metas.jsonl, first scanning any rows ranked by BM25,
    then the remainder in file order. Keeps memory bounded.
    """
    p_meta, p_lex = paths["meta"], paths["lex"]
    if not os.path.exists(p_meta):
        return
    # Load the whole metas index positions cheaply
    # First collect BM25-ordered ids (doc indices), then iterate the file linearly and pick matches.
    ranked_ids = set(i for (i, _score) in _bm25_search(p_lex, query, topk=2000))  # generous pre-order
    # Pass 1: Yields BM25 hits first (in their rank order)
    order_map = {i: r for r, (i, _) in enumerate(_bm25_search(p_lex, query, topk=2000))}
    with open(p_meta, "r", encoding="utf-8") as f:
        for i, line in enumerate(f):
            if not line.strip(): continue
            if i in ranked_ids:
                try:
                    yield i, json.loads(line)
                except Exception:
                    continue
    # Pass 2: Remaining rows
    with open(p_meta, "r", encoding="utf-8") as f:
        for i, line in enumerate(f):
            if not line.strip(): continue
            if i in ranked_ids:
                continue
            try:
                yield i, json.loads(line)
            except Exception:
                continue

def scan_all_answer(
    llm: LLMClient,
    question: str,
    index_handle: Dict[str, Any],
    batch_chars: int = 150_000,
    early_confidence: float = 0.65,
    max_batches: int = 100,
) -> Dict[str, Any]:
    """
    Progressive scan of the full indexed corpus:
    - Streams metas.jsonl in batches (~batch_chars worth of text)
    - For each batch: assemble docs -> finance_answer (map-reduce kicks in if needed)
    - Validates the draft; EARLY-STOP once confidence >= early_confidence
    - Returns the best-so-far draft if the end is reached
    """
    p = index_handle["paths"]
    if not os.path.exists(p["meta"]):
        return {"type": "nlp", "mode": "scan_miss", "answer": "No context.", "context": []}

    best = {"conf": 0.0, "answer": "", "context": []}
    batch_docs: List[Dict[str, Any]] = []
    batch_len = 0
    batches_done = 0

    def _flush_batch():
        nonlocal best
        if not batch_docs:
            return
        # Use the same finance answerer (will fall back to map-reduce if needed)
        draft = llm.finance_answer(question, batch_docs)
        conf = _validation_score(llm, question, draft)
        if conf >= best["conf"]:
            best = {"conf": conf, "answer": draft, "context": list(batch_docs)}
        # reset for next
        batch_docs.clear()

    # Stream rows in BM25-preferred order then file order
    for idx, obj in _iter_metas_in_bm25_order(p, question):
        txt = (obj.get("text") or "").strip()
        if not txt:
            continue
        batch_docs.append({"text": txt, "meta": obj.get("meta", {})})
        batch_len += len(txt)

        if batch_len >= batch_chars:
            _flush_batch()
            batches_done += 1
            batch_len = 0
            if best["conf"] >= early_confidence or batches_done >= max_batches:
                break

    # Final flush
    if batch_docs and (best["conf"] < early_confidence) and batches_done < max_batches:
        _flush_batch()

    mode = "scan_earlystop" if best["conf"] >= early_confidence else "scan_exhausted"
    return {"type": "nlp", "mode": mode, "answer": best["answer"], "context": best["context"], "confidence": best["conf"]}
