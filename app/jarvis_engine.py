import io
import uuid
import json
import numpy as np
import httpx
import asyncio
import warnings
# Suppress the google-generativeai SDK deprecation warning
warnings.filterwarnings("ignore", category=FutureWarning, message=r"(?s).*generativeai.*")
import google.generativeai as genai
from typing import List, Dict, Any, Generator, Tuple
from pypdf import PdfReader

def chunk_text(text: str, chunk_size: int, chunk_overlap: int) -> List[str]:
    """Splits text into chunks, keeping markdown code blocks intact and avoiding mid-sentence cuts in plain text."""
    if not text:
        return []
        
    import re
    # Detect markdown code blocks
    code_block_pattern = re.compile(r'(```[a-zA-Z0-9#\+\-\*_]*\r?\n[\s\S]*?\r?\n```)')
    
    parts = code_block_pattern.split(text)
    chunks = []
    
    for part in parts:
        if not part.strip():
            continue
            
        # Keep code blocks as atomic chunks, or chunk by line if exceeding chunk_size
        if part.startswith("```"):
            if len(part) <= chunk_size:
                chunks.append(part)
            else:
                lines = part.split("\n")
                header = lines[0]
                footer = "```"
                current_code_chunk = [header]
                current_len = len(header) + len(footer)
                
                for line in lines[1:-1]:
                    line_len = len(line) + 1
                    if current_len + line_len > chunk_size:
                        current_code_chunk.append(footer)
                        chunks.append("\n".join(current_code_chunk))
                        current_code_chunk = [header, line]
                        current_len = len(header) + len(footer) + line_len
                    else:
                        current_code_chunk.append(line)
                        current_len += line_len
                        
                if len(current_code_chunk) > 1:
                    current_code_chunk.append(footer)
                    chunks.append("\n".join(current_code_chunk))
        else:
            # Split plain text sentence-by-sentence
            sentence_ends = re.compile(r'(?<=[.!?])\s+')
            sentences = sentence_ends.split(part)
            current_chunk = []
            current_length = 0
            
            for sentence in sentences:
                sentence = sentence.strip()
                if not sentence:
                    continue
                sentence_len = len(sentence)
                
                if sentence_len > chunk_size:
                    if current_chunk:
                        chunks.append(" ".join(current_chunk))
                        current_chunk = []
                        current_length = 0
                    
                    start = 0
                    while start < sentence_len:
                        end = start + chunk_size
                        chunks.append(sentence[start:end])
                        start += (chunk_size - chunk_overlap)
                    continue
                    
                if current_length + sentence_len + (1 if current_chunk else 0) > chunk_size:
                    chunks.append(" ".join(current_chunk))
                    
                    overlap_chunk = []
                    overlap_length = 0
                    for prev_sentence in reversed(current_chunk):
                        prev_len = len(prev_sentence)
                        if overlap_length + prev_len + (1 if overlap_chunk else 0) <= chunk_overlap:
                            overlap_chunk.insert(0, prev_sentence)
                            overlap_length += prev_len + (1 if overlap_chunk else 0)
                        else:
                            break
                    current_chunk = overlap_chunk
                    current_length = overlap_length
                    
                current_chunk.append(sentence)
                current_length += sentence_len + (1 if len(current_chunk) > 1 else 0)
                
            if current_chunk:
                chunks.append(" ".join(current_chunk))
                
    return chunks


async def get_embedding(
    text: str, 
    provider: str, 
    api_key: str = None, 
    ollama_url: str = None, 
    model: str = None
) -> List[float]:
    """Retrieves text embedding vector from Gemini, OpenAI, Claude (fallback), Ollama, or Custom provider."""
    if provider == "claude":
        if api_key and "|||" in api_key:
            _, fallback_provider, fallback_key = api_key.split("|||")
            return await get_embedding(
                text=text,
                provider=fallback_provider,
                api_key=fallback_key,
                ollama_url=ollama_url,
                model=model
            )
        else:
            raise ValueError("Claude provider requires a packed embedding fallback key configuration.")

    elif provider == "gemini":
        if not api_key:
            raise ValueError("Gemini API key is required for embedding.")
        m_name = (model or "text-embedding-004").replace("models/", "")
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{m_name}:embedContent?key={api_key}"
        async with httpx.AsyncClient() as client:
            res = await client.post(
                url,
                headers={"Content-Type": "application/json"},
                json={"content": {"parts": [{"text": text}]}},
                timeout=30.0
            )
            res.raise_for_status()
            data = res.json()
            return data.get("embedding", {}).get("values", [])
        
    elif provider == "openai":
        if not api_key:
            raise ValueError("OpenAI API key is required for embedding.")
        model_name = model or "text-embedding-3-small"
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.openai.com/v1/embeddings",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json={"model": model_name, "input": text},
                timeout=30.0
            )
            response.raise_for_status()
            data = response.json()
            return data["data"][0]["embedding"]

    elif provider == "ollama":
        url = ollama_url or "http://localhost:11434"
        model_name = model or "nomic-embed-text"
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{url.rstrip('/')}/api/embeddings",
                json={"model": model_name, "prompt": text},
                timeout=30.0
            )
            response.raise_for_status()
            data = response.json()
            return data["embedding"]
            
    elif provider == "custom":
        if not ollama_url:
            raise ValueError("Custom Base URL is required for custom embedding.")
        model_name = model
        if not model_name:
            raise ValueError("Custom embedding model name is required.")
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        # NVIDIA NIM and most OpenAI-compatible embedding APIs require input as an array
        payload = {"model": model_name, "input": [text]}
        # Add input_type for NVIDIA NIM compatibility (ignored by others)
        if "nvidia" in ollama_url.lower() or "nvcf" in ollama_url.lower():
            payload["input_type"] = "query"
            payload["encoding_format"] = "float"
            payload["truncate"] = "NONE"
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{ollama_url.rstrip('/')}/embeddings",
                headers=headers,
                json=payload,
                timeout=30.0
            )
            response.raise_for_status()
            data = response.json()
            return data["data"][0]["embedding"]

    else:
        raise ValueError(f"Unsupported embedding provider: {provider}")

async def get_embeddings_batch(
    texts: List[str],
    provider: str,
    api_key: str = None,
    ollama_url: str = None,
    model: str = None
) -> List[List[float]]:
    """Retrieves embeddings for a batch of texts concurrently/efficiently."""
    if not texts:
        return []
        
    if provider == "claude":
        if api_key and "|||" in api_key:
            _, fallback_provider, fallback_key = api_key.split("|||")
            return await get_embeddings_batch(
                texts=texts,
                provider=fallback_provider,
                api_key=fallback_key,
                ollama_url=ollama_url,
                model=model
            )
        else:
            raise ValueError("Claude provider requires a packed embedding fallback key configuration.")

    elif provider == "gemini":
        if not api_key:
            raise ValueError("Gemini API key is required for embedding.")
        m_name = (model or "text-embedding-004").replace("models/", "")
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{m_name}:batchEmbedContents?key={api_key}"
        results = []
        batch_size = 50
        async with httpx.AsyncClient() as client:
            for i in range(0, len(texts), batch_size):
                batch = texts[i:i+batch_size]
                requests = [{"model": f"models/{m_name}", "content": {"parts": [{"text": t}]}} for t in batch]
                res = await client.post(
                    url,
                    headers={"Content-Type": "application/json"},
                    json={"requests": requests},
                    timeout=60.0
                )
                res.raise_for_status()
                data = res.json()
                for emb_item in data.get("embeddings", []):
                    results.append(emb_item.get("values", []))
        return results
        
    elif provider == "openai":
        if not api_key:
            raise ValueError("OpenAI API key is required for embedding.")
        model_name = model or "text-embedding-3-small"
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.openai.com/v1/embeddings",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json={"model": model_name, "input": texts},
                timeout=60.0
            )
            response.raise_for_status()
            data = response.json()
            sorted_data = sorted(data["data"], key=lambda x: x.get("index", 0))
            return [x["embedding"] for x in sorted_data]

    elif provider == "ollama":
        url = ollama_url or "http://localhost:11434"
        model_name = model or "nomic-embed-text"
        
        async def embed_single(text: str) -> List[float]:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{url.rstrip('/')}/api/embeddings",
                    json={"model": model_name, "prompt": text},
                    timeout=30.0
                )
                response.raise_for_status()
                data = response.json()
                return data["embedding"]
                
        semaphore = asyncio.Semaphore(10)
        
        async def sem_embed(text: str):
            async with semaphore:
                return await embed_single(text)
                
        tasks = [sem_embed(t) for t in texts]
        return await asyncio.gather(*tasks)
        
    elif provider == "custom":
        if not ollama_url:
            raise ValueError("Custom Base URL is required for custom embedding.")
        model_name = model
        if not model_name:
            raise ValueError("Custom embedding model name is required.")
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        is_nvidia = "nvidia" in ollama_url.lower() or "nvcf" in ollama_url.lower()
        if is_nvidia:
            # NVIDIA NIM limits batch size — process in chunks of 96
            all_embeddings = []
            batch_size = 96
            async with httpx.AsyncClient() as client:
                for i in range(0, len(texts), batch_size):
                    batch = texts[i:i+batch_size]
                    payload = {
                        "model": model_name,
                        "input": batch,
                        "input_type": "passage",
                        "encoding_format": "float",
                        "truncate": "NONE"
                    }
                    response = await client.post(
                        f"{ollama_url.rstrip('/')}/embeddings",
                        headers=headers,
                        json=payload,
                        timeout=60.0
                    )
                    response.raise_for_status()
                    data = response.json()
                    sorted_data = sorted(data["data"], key=lambda x: x.get("index", 0))
                    all_embeddings.extend([x["embedding"] for x in sorted_data])
            return all_embeddings
        else:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{ollama_url.rstrip('/')}/embeddings",
                    headers=headers,
                    json={"model": model_name, "input": texts},
                    timeout=60.0
                )
                response.raise_for_status()
                data = response.json()
                if "data" in data:
                    sorted_data = sorted(data["data"], key=lambda x: x.get("index", 0))
                    return [x["embedding"] for x in sorted_data]
                else:
                    raise ValueError("Unexpected response format from custom embedding API.")

    else:
        raise ValueError(f"Unsupported embedding provider: {provider}")

def cosine_similarity(v1: List[float], v2: List[float]) -> float:
    """Computes cosine similarity between two vectors.
    Returns 0.0 silently if dimensions don't match (model mismatch).
    """
    a = np.array(v1)
    b = np.array(v2)
    if a.shape != b.shape:
        return 0.0
    dot_product = np.dot(a, b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(dot_product / (norm_a * norm_b))

async def search_chunks(
    query_embedding: List[float], 
    chunks: List[Dict[str, Any]], 
    top_k: int, 
    threshold: float
) -> tuple:
    """Searches and scores chunks based on query embedding similarity.
    Returns (results, mismatched_count) — mismatched_count > 0 means some
    chunks were indexed with a different embedding model.
    """
    if query_embedding is None:
        return [], 0
    results = []
    query_dim = len(query_embedding)
    mismatched = 0
    for chunk in chunks:
        chunk_emb = chunk.get("embedding")
        if not chunk_emb:
            continue
        if len(chunk_emb) != query_dim:
            mismatched += 1
            continue
        sim = cosine_similarity(query_embedding, chunk_emb)
        if sim >= threshold:
            results.append({
                "id": chunk["id"],
                "doc_id": chunk["doc_id"],
                "doc_name": chunk["doc_name"],
                "idx": chunk["idx"],
                "text": chunk["text"],
                "similarity": sim
            })
            
    results.sort(key=lambda x: x["similarity"], reverse=True)
    return results[:top_k], mismatched

async def search_hybrid(
    query_text: str,
    query_embedding: List[float],
    chunks: List[Dict[str, Any]],
    top_k: int,
    threshold: float,
    retrieval_strategy: str = "hybrid"
) -> tuple:
    if not chunks:
        return [], 0
        
    mismatched = 0
    vector_results = []
    
    # 1. Semantic Vector Similarity Search
    if retrieval_strategy in ["hybrid", "vector"] and query_embedding is not None:
        query_dim = len(query_embedding)
        for chunk in chunks:
            chunk_emb = chunk.get("embedding")
            if not chunk_emb:
                continue
            if len(chunk_emb) != query_dim:
                mismatched += 1
                continue
            sim = cosine_similarity(query_embedding, chunk_emb)
            if sim >= threshold:
                vector_results.append((chunk, sim))
                
        # Sort vector results by similarity
        vector_results.sort(key=lambda x: x[1], reverse=True)

    # 2. Keyword TF-IDF Scoring Search
    keyword_results = []
    if retrieval_strategy in ["hybrid", "keyword"]:
        import re
        import math
        query_tokens = set(re.findall(r'\w+', query_text.lower()))
        if query_tokens:
            doc_count = len(chunks)
            df = {}
            for token in query_tokens:
                df[token] = sum(1 for c in chunks if token in c["text"].lower())
                
            idfs = {}
            for token, count in df.items():
                idfs[token] = math.log((doc_count - count + 0.5) / (count + 0.5) + 1.0)
                
            for chunk in chunks:
                chunk_text_lower = chunk["text"].lower()
                score = 0.0
                for token in query_tokens:
                    if token in chunk_text_lower:
                        tf = chunk_text_lower.count(token)
                        score += tf * idfs.get(token, 0.0)
                if score > 0:
                    keyword_results.append((chunk, score))
            
            # Sort keyword results by score
            keyword_results.sort(key=lambda x: x[1], reverse=True)

    if retrieval_strategy == "vector":
        final_results = []
        for chunk, sim in vector_results[:top_k]:
            final_results.append({
                "id": chunk["id"],
                "doc_id": chunk["doc_id"],
                "doc_name": chunk["doc_name"],
                "idx": chunk["idx"],
                "text": chunk["text"],
                "similarity": sim
            })
        return final_results, mismatched

    if retrieval_strategy == "keyword":
        final_results = []
        for chunk, score in keyword_results[:top_k]:
            final_results.append({
                "id": chunk["id"],
                "doc_id": chunk["doc_id"],
                "doc_name": chunk["doc_name"],
                "idx": chunk["idx"],
                "text": chunk["text"],
                "similarity": min(1.0, score / 10.0)
            })
        return final_results, mismatched

    # 3. Reciprocal Rank Fusion (RRF) for Hybrid
    vector_ranks = {item[0]["id"]: idx for idx, item in enumerate(vector_results)}
    keyword_ranks = {item[0]["id"]: idx for idx, item in enumerate(keyword_results)}
    
    rrf_scores = {}
    k_constant = 60
    
    all_matched_chunks = {}
    for chunk, _ in vector_results:
        all_matched_chunks[chunk["id"]] = chunk
    for chunk, _ in keyword_results:
        all_matched_chunks[chunk["id"]] = chunk
        
    for chunk_id, chunk in all_matched_chunks.items():
        v_rank = vector_ranks.get(chunk_id, None)
        k_rank = keyword_ranks.get(chunk_id, None)
        
        score = 0.0
        if v_rank is not None:
            score += 1.0 / (k_constant + v_rank)
        if k_rank is not None:
            score += 1.0 / (k_constant + k_rank)
            
        rrf_scores[chunk_id] = score
        
    sorted_chunk_ids = sorted(rrf_scores.keys(), key=lambda x: rrf_scores[x], reverse=True)
    
    final_results = []
    for chunk_id in sorted_chunk_ids[:top_k]:
        chunk = all_matched_chunks[chunk_id]
        sim = 0.0
        v_idx = vector_ranks.get(chunk_id, None)
        if v_idx is not None:
            sim = vector_results[v_idx][1]
        else:
            sim = 0.5
            
        final_results.append({
            "id": chunk["id"],
            "doc_id": chunk["doc_id"],
            "doc_name": chunk["doc_name"],
            "idx": chunk["idx"],
            "text": chunk["text"],
            "similarity": sim
        })
        
    return final_results, mismatched

def search_generic(
    query_embedding: List[float], 
    items: List[Dict[str, Any]], 
    top_k: int, 
    threshold: float,
    query_text: str = None
) -> List[Dict[str, Any]]:
    """Generic cosine similarity search for lists of items containing 'embedding' keys.
    If query_embedding is None, performs keyword matching on all string values of the items as a fallback.
    """
    if query_embedding is not None:
        query_dim = len(query_embedding)
        results = []
        for item in items:
            item_emb = item.get("embedding")
            if not item_emb or len(item_emb) != query_dim:
                continue
            sim = cosine_similarity(query_embedding, item_emb)
            if sim >= threshold:
                # Strip out embedding vector representation to save memory/context footprint
                item_copy = {k: v for k, v in item.items() if k != "embedding"}
                item_copy["similarity"] = sim
                results.append(item_copy)
                
        results.sort(key=lambda x: x["similarity"], reverse=True)
        return results[:top_k]
        
    elif query_text:
        # Keyword-based fallback search
        import re
        query_tokens = set(re.findall(r'\w+', query_text.lower()))
        if not query_tokens:
            return []
            
        results = []
        for item in items:
            text_parts = []
            for k, v in item.items():
                if k not in ["id", "embedding", "created_at"] and isinstance(v, str):
                    text_parts.append(v.lower())
            item_text = " ".join(text_parts)
            
            score = 0.0
            for token in query_tokens:
                if token in item_text:
                    score += 1.0 + item_text.count(token) * 0.1
            if score > 0:
                item_copy = {k: v for k, v in item.items() if k != "embedding"}
                # Normalize similarity score
                item_copy["similarity"] = min(0.99, score / (len(query_tokens) + 1))
                results.append(item_copy)
                
        results.sort(key=lambda x: x["similarity"], reverse=True)
        return results[:top_k]
        
    return []

def extract_text_from_file(file_content: bytes, filename: str) -> str:
    """Extracts raw text from PDF, TXT or MD files."""
    ext = filename.split(".")[-1].lower()
    if ext == "pdf":
        pdf_file = io.BytesIO(file_content)
        reader = PdfReader(pdf_file)
        text = ""
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
        return text
    elif ext in ["txt", "md"]:
        return file_content.decode("utf-8", errors="ignore")
    else:
        raise ValueError("Unsupported file format. Use PDF, TXT, or MD.")

async def generate_response_stream(
    messages: List[Dict[str, str]],
    context_chunks: List[Dict[str, Any]],
    provider: str,
    api_key: str = None,
    ollama_url: str = None,
    model: str = None,
    system_prompt: str = None,
    profile_memories: List[Dict[str, Any]] = None,
    skills: List[Dict[str, Any]] = None,
    past_messages: List[Dict[str, Any]] = None
) -> Generator[str, None, None]:
    """Generates streaming chat response from Gemini, OpenAI, Claude, Ollama, or Custom provider with retrieved RAG contexts."""
    
    default_system = (
        "You are Nexus, an expert full-stack AI engineer and senior web developer. "
        "Your primary directive is to write and output high-quality, complete, production-ready code. "
        "Never say 'I cannot create a website' or 'I cannot write/deploy files'. Always provide the exact HTML, CSS, JavaScript, Python, or shell code blocks. "
        "If the user asks for a website or app, write a fully functional SPA (Single Page Application) combining styles and scripts directly, "
        "or output clean separate files clearly. "
        "Do NOT output disclaimers about hosting, servers, or domain registration. Get straight to the code. "
        "Format all code blocks using correct Markdown syntax (e.g., ```html ... ```). "
        "You must NEVER use emojis under any circumstances in your responses. Keep all text highly professional, clean, and developer-oriented. "
        "If source document context is provided, ground your answers in it and cite relevant details; otherwise, use your full software engineering capabilities."
    )
    # Apply local sliding window memory (keep last 10 messages verbatim) to prevent context/token limit overflows
    if len(messages) > 10:
        messages = messages[-10:]

    full_system_prompt = system_prompt or default_system
    
    # 1. Inject User Profile Memories / Preferences
    if profile_memories:
        profile_text = "\n".join([f"- {m['fact']}" for m in profile_memories])
        full_system_prompt += f"\n\nRetrieved User Preferences & Environmental Facts:\n{profile_text}"
        
    # 2. Inject Learned Custom Skills
    if skills:
        skills_text = "\n\n".join([
            f"--- Learned Skill: {s['name']} (Description: {s['description']}) ---\n{s['content']}"
            for s in skills
        ])
        full_system_prompt += f"\n\nRetrieved Custom Skills/Code Snippets:\n{skills_text}"
        
    # 3. Inject Semantically Related Past Dialogues (Episodic Recall)
    if past_messages:
        past_text = "\n\n".join([
            f"--- Past Dialogue Context (Similarity: {m['similarity']:.2f}) ---\nRole: {m['role']}\nContent: {m['content']}"
            for m in past_messages
        ])
        full_system_prompt += f"\n\nRetrieved Relevant Past Dialogue Context:\n{past_text}"
        
    # 4. Inject Document Text Context
    if context_chunks:
        context_text = "\n\n".join([
            f"--- Source Document: {c['doc_name']} (Chunk {c['idx']}) ---\n{c['text']}"
            for c in context_chunks
        ])
        full_system_prompt += f"\n\nRetrieved Source Documents Context:\n{context_text}"
        
    last_user_msg = messages[-1]["content"] if messages else ""
    dialogue_history = messages[:-1] if len(messages) > 1 else []

    if provider == "gemini":
        if not api_key:
            raise ValueError("Gemini API Key is required for generating responses.")
        
        contents_payload = []
        for msg in messages:
            r = "user" if msg["role"] == "user" else "model"
            contents_payload.append({"role": r, "parts": [{"text": msg["content"]}]})
            
        payload = {
            "systemInstruction": {"parts": [{"text": full_system_prompt}]},
            "contents": contents_payload
        }
        
        last_error = None
        async with httpx.AsyncClient() as client:
            # Query available models for this specific API key
            candidate_models = []
            req_model = (model or "gemini-1.5-flash").replace("models/", "")
            candidate_models.append(req_model)
            candidate_models.append(f"models/{req_model}")
            
            try:
                list_url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
                l_res = await client.get(list_url, timeout=10.0)
                if l_res.status_code == 200:
                    m_data = l_res.json()
                    for m_info in m_data.get("models", []):
                        if "generateContent" in m_info.get("supportedGenerationMethods", []):
                            raw_name = m_info.get("name", "")
                            clean_name = raw_name.replace("models/", "")
                            if clean_name not in candidate_models:
                                candidate_models.append(clean_name)
                            if raw_name not in candidate_models:
                                candidate_models.append(raw_name)
            except Exception as ex:
                print(f"Model listing fallback notice: {ex}")
                
            # Add hardcoded fallbacks if list failed
            for fb in ["gemini-1.5-flash-latest", "gemini-2.0-flash", "gemini-2.0-flash-exp", "gemini-1.5-flash-8b", "gemini-1.5-pro", "models/gemini-1.5-flash"]:
                if fb not in candidate_models:
                    candidate_models.append(fb)
                    
            seen = set()
            unique_candidates = [m for m in candidate_models if not (m in seen or seen.add(m))]
            
            for m_name in unique_candidates:
                # Format URL
                endpoint_model = m_name if m_name.startswith("models/") else f"models/{m_name}"
                url = f"https://generativelanguage.googleapis.com/v1beta/{endpoint_model}:streamGenerateContent?alt=sse&key={api_key}"
                try:
                    async with client.stream("POST", url, headers={"Content-Type": "application/json"}, json=payload, timeout=60.0) as response:
                        if response.status_code != 200:
                            err_body = await response.aread()
                            last_error = RuntimeError(f"HTTP {response.status_code}: {err_body.decode('utf-8', errors='ignore')}")
                            continue
                        
                        has_yielded = False
                        async for line in response.aiter_lines():
                            trimmed = line.strip()
                            if not trimmed:
                                continue
                            if trimmed.startswith("data: "):
                                data_str = trimmed[6:]
                                try:
                                    data = json.loads(data_str)
                                    candidates = data.get("candidates", [])
                                    if candidates:
                                        parts = candidates[0].get("content", {}).get("parts", [])
                                        for p in parts:
                                            txt = p.get("text", "")
                                            if txt:
                                                has_yielded = True
                                                yield txt
                                except Exception:
                                    pass
                        if has_yielded:
                            return
                except Exception as err:
                    last_error = err
                    continue
                    
        if last_error:
            raise last_error
                
    elif provider == "openai":
        if not api_key:
            raise ValueError("OpenAI API Key is required.")
        model_name = model or "gpt-4o"
        
        openai_messages = [{"role": "system", "content": full_system_prompt}]
        for msg in messages:
            openai_messages.append({"role": msg["role"], "content": msg["content"]})
            
        payload = {
            "model": model_name,
            "messages": openai_messages,
            "stream": True
        }
        
        async with httpx.AsyncClient() as client:
            async with client.stream(
                "POST",
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json=payload,
                timeout=60.0
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    trimmed = line.strip()
                    if not trimmed:
                        continue
                    if trimmed.startswith("data: "):
                        data_str = trimmed[6:]
                        if data_str == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                            content = data.get("choices", [{}])[0].get("delta", {}).get("content", "")
                            if content:
                                yield content
                        except Exception as e:
                            print(f"Error parsing OpenAI stream chunk: {e}")

    elif provider == "claude":
        claude_key = api_key
        if api_key and "|||" in api_key:
            claude_key, _, _ = api_key.split("|||")
            
        if not claude_key:
            raise ValueError("Claude API Key is required.")
        model_name = model or "claude-3-5-sonnet-latest"
        
        claude_messages = []
        for msg in messages:
            role = msg["role"]
            if role not in ["user", "assistant"]:
                role = "user"
            claude_messages.append({"role": role, "content": msg["content"]})
            
        payload = {
            "model": model_name,
            "system": full_system_prompt,
            "messages": claude_messages,
            "stream": True,
            "max_tokens": 4096
        }
        
        headers = {
            "x-api-key": claude_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"
        }
        
        async with httpx.AsyncClient() as client:
            async with client.stream(
                "POST",
                "https://api.anthropic.com/v1/messages",
                headers=headers,
                json=payload,
                timeout=60.0
            ) as response:
                response.raise_for_status()
                current_event = None
                async for line in response.aiter_lines():
                    trimmed = line.strip()
                    if not trimmed:
                        continue
                    if trimmed.startswith("event: "):
                        current_event = trimmed[7:]
                    elif trimmed.startswith("data: "):
                        data_str = trimmed[6:]
                        try:
                            data = json.loads(data_str)
                            if current_event == "content_block_delta" or data.get("type") == "content_block_delta":
                                text_delta = data.get("delta", {}).get("text", "")
                                if text_delta:
                                    yield text_delta
                        except Exception as e:
                            print(f"Error parsing Claude stream chunk: {e}")

    elif provider == "ollama":
        url = ollama_url or "http://localhost:11434"
        model_name = model or "llama3"
        
        ollama_messages = [{"role": "system", "content": full_system_prompt}]
        for msg in messages:
            ollama_messages.append({"role": msg["role"], "content": msg["content"]})
            
        payload = {
            "model": model_name,
            "messages": ollama_messages,
            "stream": True
        }
        
        async with httpx.AsyncClient() as client:
            async with client.stream(
                "POST", 
                f"{url.rstrip('/')}/api/chat", 
                json=payload,
                timeout=60.0
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if line.strip():
                        data = json.loads(line)
                        content = data.get("message", {}).get("content", "")
                        if content:
                            yield content

    elif provider == "custom":
        if not ollama_url:
            raise ValueError("Custom Base URL is required.")
        model_name = model
        if not model_name:
            raise ValueError("Custom generative model name is required.")
            
        custom_messages = [{"role": "system", "content": full_system_prompt}]
        for msg in messages:
            custom_messages.append({"role": msg["role"], "content": msg["content"]})
            
        payload = {
            "model": model_name,
            "messages": custom_messages,
            "stream": True
        }
        
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
            
        async with httpx.AsyncClient() as client:
            async with client.stream(
                "POST",
                f"{ollama_url.rstrip('/')}/chat/completions",
                headers=headers,
                json=payload,
                timeout=60.0
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    trimmed = line.strip()
                    if not trimmed:
                        continue
                    if trimmed.startswith("data: "):
                        data_str = trimmed[6:]
                        if data_str == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                            content = data.get("choices", [{}])[0].get("delta", {}).get("content", "")
                            if content:
                                yield content
                        except Exception as e:
                            print(f"Error parsing Custom stream chunk: {e}")

async def extract_memory_and_skills_from_dialogue(
    dialogue_turn: List[Dict[str, str]],
    provider: str,
    api_key: str = None,
    ollama_url: str = None,
    model: str = None
) -> Tuple[List[str], List[Dict[str, str]]]:
    """
    Analyzes the latest dialogue turn (user prompt + assistant response) to extract user profile facts and learned skills.
    Returns a tuple: (list_of_profile_facts, list_of_skills)
    """
    if len(dialogue_turn) < 2:
        return [], []
        
    turn_str = ""
    # Look at the last user message and the last assistant message
    for msg in dialogue_turn[-2:]:
        turn_str += f"Role: {msg['role']}\nContent: {msg['content']}\n\n"
        
    extraction_prompt = (
        "You are an AI metadata extractor. Analyze the following dialogue turn and perform two extractions.\n"
        "Return your response ONLY as a JSON object with two keys: 'profile_facts' and 'skills'. Do not write markdown formatting (like ```json), explanations, or extra text, just raw JSON.\n\n"
        "1. 'profile_facts': A list of strings. Extract any long-term personal facts, environment details, project structures, technologies, or coding preferences the user stated about themselves.\n"
        "   - E.g.: 'User prefers TypeScript/React for frontend, Flask/Python for backend/AI scripts'\n"
        "   - E.g.: 'User works on Windows 11'\n"
        "   - E.g.: 'User's email is jachinsamuel007@gmail.com'\n"
        "   - E.g.: 'User interests: interactive animations (Framer Motion, DotField), terminal UIs (TUI), dev tools'\n"
        "   - E.g.: 'User prefers optimized, production-grade code with error handling, loading states, and edge cases'\n"
        "   - E.g.: 'User is studying Computer Science Engineering at Karunya Institute of Science and Technology'\n"
        "   - CRITICAL: Do NOT extract generic chat statements (e.g. 'User is good', 'User is testing the chatbot', 'User wants to chat'). Be highly specific and technical.\n"
        "   - If no specific tech/personal/environment facts are found, return an empty list.\n\n"
        "2. 'skills': A list of objects. If the assistant provided a highly valuable script, custom code solution, or complex configuration instruction, extract it as a reusable skill. Each skill object must contain three keys: 'name' (a short descriptive name), 'description' (what the skill does), and 'content' (the actual code block or instructions). If no reusable code/skills are found, return an empty list.\n\n"
        "Response format must be valid JSON matching this structure:\n"
        "{\n"
        "  \"profile_facts\": [],\n"
        "  \"skills\": []\n"
        "}\n\n"
        f"Dialogue Turn:\n{turn_str}"
    )
    
    try:
        response_text = ""
        if provider == "gemini":
            if not api_key:
                return [], []
            
            payload = {
                "contents": [{"parts": [{"text": extraction_prompt}]}],
                "generationConfig": {"responseMimeType": "application/json"}
            }
            
            async with httpx.AsyncClient() as client:
                candidate_models = []
                req_model = (model or "gemini-1.5-flash").replace("models/", "")
                candidate_models.append(req_model)
                candidate_models.append(f"models/{req_model}")
                
                try:
                    list_url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
                    l_res = await client.get(list_url, timeout=10.0)
                    if l_res.status_code == 200:
                        m_data = l_res.json()
                        for m_info in m_data.get("models", []):
                            if "generateContent" in m_info.get("supportedGenerationMethods", []):
                                raw_name = m_info.get("name", "")
                                clean_name = raw_name.replace("models/", "")
                                if clean_name not in candidate_models:
                                    candidate_models.append(clean_name)
                                if raw_name not in candidate_models:
                                    candidate_models.append(raw_name)
                except Exception:
                    pass
                    
                for fb in ["gemini-1.5-flash-latest", "gemini-2.0-flash", "gemini-2.0-flash-exp", "gemini-1.5-flash-8b", "gemini-1.5-pro", "models/gemini-1.5-flash"]:
                    if fb not in candidate_models:
                        candidate_models.append(fb)
                        
                seen = set()
                unique_candidates = [m for m in candidate_models if not (m in seen or seen.add(m))]
                
                for m_name in unique_candidates:
                    endpoint_model = m_name if m_name.startswith("models/") else f"models/{m_name}"
                    url = f"https://generativelanguage.googleapis.com/v1beta/{endpoint_model}:generateContent?key={api_key}"
                    try:
                        res = await client.post(
                            url,
                            headers={"Content-Type": "application/json"},
                            json=payload,
                            timeout=60.0
                        )
                        if res.status_code == 200:
                            data = res.json()
                            candidates = data.get("candidates", [])
                            if candidates:
                                parts = candidates[0].get("content", {}).get("parts", [])
                                if parts:
                                    response_text = parts[0].get("text", "")
                                    if response_text.strip():
                                        break
                    except Exception:
                        continue
            
        elif provider == "openai":
            if not api_key:
                return [], []
            model_name = model or "gpt-4o-mini"
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": model_name,
                        "messages": [{"role": "user", "content": extraction_prompt}],
                        "response_format": {"type": "json_object"},
                        "stream": False
                    },
                    timeout=180.0
                )
                response.raise_for_status()
                data = response.json()
                response_text = data.get("choices", [{}])[0].get("message", {}).get("content", "")

        elif provider == "claude":
            claude_key = api_key
            if api_key and "|||" in api_key:
                claude_key, _, _ = api_key.split("|||")
            if not claude_key:
                return [], []
            model_name = model or "claude-3-5-sonnet-latest"
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": claude_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json"
                    },
                    json={
                        "model": model_name,
                        "messages": [{"role": "user", "content": extraction_prompt}],
                        "max_tokens": 4096,
                        "stream": False
                    },
                    timeout=180.0
                )
                response.raise_for_status()
                data = response.json()
                response_text = data.get("content", [{}])[0].get("text", "")

        elif provider == "ollama":
            url = ollama_url or "http://localhost:11434"
            model_name = model or "llama3"
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{url.rstrip('/')}/api/chat",
                    json={
                        "model": model_name,
                        "messages": [{"role": "user", "content": extraction_prompt}],
                        "format": "json",
                        "stream": False
                      },
                      timeout=180.0
                  )
                response.raise_for_status()
                data = response.json()
                response_text = data.get("message", {}).get("content", "")

        elif provider == "custom":
            if not ollama_url:
                return [], []
            model_name = model
            if not model_name:
                return [], []
            headers = {"Content-Type": "application/json"}
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{ollama_url.rstrip('/')}/chat/completions",
                    headers=headers,
                    json={
                        "model": model_name,
                        "messages": [{"role": "user", "content": extraction_prompt}],
                        "stream": False
                    },
                    timeout=180.0
                )
                response.raise_for_status()
                data = response.json()
                response_text = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                  
        if response_text.strip():
            clean_text = response_text.strip()
            
            # Robustly strip markdown code blocks if the model outputs them
            if clean_text.startswith("```"):
                lines = clean_text.splitlines()
                if lines[0].startswith("```"):
                    lines = lines[1:]
                if lines and lines[-1].startswith("```"):
                    lines = lines[:-1]
                clean_text = "\n".join(lines).strip()
                
            extracted = json.loads(clean_text)
            return extracted.get("profile_facts", []), extracted.get("skills", [])
    except Exception as e:
        print(f"Memory extraction failed: {e}")
          
    return [], []

async def search_ddg(query: str, max_results: int = 5) -> List[Dict[str, str]]:
    """Performs a keyless web search via DuckDuckGo HTML search and parses results."""
    import urllib.parse
    import re
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    encoded_query = urllib.parse.quote_plus(query)
    url = f"https://html.duckduckgo.com/html/?q={encoded_query}"
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers, timeout=10.0)
            response.raise_for_status()
            html = response.text
            
            results = []
            # Split results by the web-result class wrapper with robust regex spacing support
            blocks = re.split(r'class="result results_links results_links_deep web-result\s*"', html)
            if len(blocks) <= 1:
                # Try fallback split in case classes are simplified or ordered differently
                blocks = re.split(r'class="[^"]*web-result[^"]*"', html)
            
            for block in blocks[1:max_results+1]:
                url_match = re.search(r'href="([^"]+)"', block)
                if not url_match:
                    continue
                href = url_match.group(1)
                
                if "uddg=" in href:
                    parsed = urllib.parse.urlparse(href)
                    queries = urllib.parse.parse_qs(parsed.query)
                    if "uddg" in queries:
                        href = queries["uddg"][0]
                        
                title_match = re.search(r'class="result__a"[^>]*>([\s\S]*?)</a>', block)
                title = title_match.group(1) if title_match else "No Title"
                title = re.sub(r'<[^>]+>', '', title).strip()
                
                snippet_match = re.search(r'class="result__snippet"[^>]*>([\s\S]*?)(?:</a>|</div>)', block)
                if not snippet_match:
                    snippet_match = re.search(r'class="result__snippet"[^>]*>([\s\S]*?)$', block)
                snippet = snippet_match.group(1) if snippet_match else ""
                snippet = re.sub(r'<[^>]+>', '', snippet).strip()
                
                results.append({
                    "title": title,
                    "url": href,
                    "snippet": snippet
                })
                
            return results
    except Exception as e:
        print(f"DuckDuckGo keyless search failed: {e}")
        return []

async def get_completion(
    prompt: str,
    provider: str,
    api_key: str = None,
    ollama_url: str = None,
    model: str = None,
    timeout_val: float = 5.0
) -> str:
    """Helper to fetch a standard non-streaming text completion from any active provider."""
    try:
        if provider == "gemini":
            if not api_key:
                return ""
            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
            }
            async with httpx.AsyncClient() as client:
                candidate_models = []
                req_model = (model or "gemini-1.5-flash").replace("models/", "")
                candidate_models.append(req_model)
                candidate_models.append(f"models/{req_model}")
                for fb in ["gemini-1.5-flash-latest", "gemini-2.0-flash", "gemini-1.5-flash-8b", "models/gemini-1.5-flash"]:
                    if fb not in candidate_models:
                        candidate_models.append(fb)
                seen = set()
                unique_candidates = [m for m in candidate_models if not (m in seen or seen.add(m))]
                
                for m_name in unique_candidates:
                    endpoint_model = m_name if m_name.startswith("models/") else f"models/{m_name}"
                    url = f"https://generativelanguage.googleapis.com/v1beta/{endpoint_model}:generateContent?key={api_key}"
                    try:
                        res = await client.post(url, headers={"Content-Type": "application/json"}, json=payload, timeout=timeout_val)
                        if res.status_code == 200:
                            data = res.json()
                            candidates = data.get("candidates", [])
                            if candidates:
                                parts = candidates[0].get("content", {}).get("parts", [])
                                if parts:
                                    txt = parts[0].get("text", "")
                                    if txt.strip():
                                        return txt.strip()
                    except Exception:
                        continue

        elif provider == "openai":
            if not api_key:
                return ""
            model_name = model or "gpt-4o-mini"
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json={
                        "model": model_name,
                        "messages": [{"role": "user", "content": prompt}],
                        "stream": False
                    },
                    timeout=timeout_val
                )
                response.raise_for_status()
                data = response.json()
                return data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()

        elif provider == "claude":
            claude_key = api_key
            if api_key and "|||" in api_key:
                claude_key, _, _ = api_key.split("|||")
            if not claude_key:
                return ""
            model_name = model or "claude-3-5-sonnet-latest"
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": claude_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json"
                    },
                    json={
                        "model": model_name,
                        "messages": [{"role": "user", "content": prompt}],
                        "max_tokens": 120,
                        "stream": False
                    },
                    timeout=timeout_val
                )
                response.raise_for_status()
                data = response.json()
                return data.get("content", [{}])[0].get("text", "").strip()

        elif provider == "ollama":
            url = ollama_url or "http://localhost:11434"
            model_name = model or "llama3"
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{url.rstrip('/')}/api/chat",
                    json={
                        "model": model_name,
                        "messages": [{"role": "user", "content": prompt}],
                        "stream": False
                    },
                    timeout=timeout_val
                )
                response.raise_for_status()
                data = response.json()
                return data.get("message", {}).get("content", "").strip()

        elif provider == "custom":
            if not ollama_url:
                return ""
            model_name = model
            if not model_name:
                return ""
            headers = {"Content-Type": "application/json"}
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{ollama_url.rstrip('/')}/chat/completions",
                    headers=headers,
                    json={
                        "model": model_name,
                        "messages": [{"role": "user", "content": prompt}],
                        "stream": False
                    },
                    timeout=timeout_val
                )
                response.raise_for_status()
                data = response.json()
                return data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()

    except Exception as e:
        print(f"Warning: Completion request failed: {e}")
    return ""

async def rewrite_query_for_retrieval(
    messages: List[Dict[str, str]],
    current_query: str,
    provider: str,
    api_key: str = None,
    ollama_url: str = None,
    model: str = None
) -> str:
    """Uses a fast completion call to rewrite the user's latest query as a standalone search query,
    resolving any pronouns or references based on the context of the recent message history.
    """
    if not messages or len(messages) <= 1:
        return current_query

    recent_history = messages[-4:] if len(messages) > 4 else messages
    
    history_text = ""
    for msg in recent_history[:-1]:
        role_label = "User" if msg["role"] == "user" else "Assistant"
        content_preview = msg['content'][:300] + "..." if len(msg['content']) > 300 else msg['content']
        history_text += f"{role_label}: {content_preview}\n"
    
    rewrite_prompt = (
        "You are a search query optimizer. Given a conversation history and a new user message, "
        "your task is to rewrite the new user message into a single, standalone search query "
        "that fully captures the search intent, resolving pronouns (like 'it', 'them', 'that', 'this') or context "
        "using the conversation history.\n\n"
        "Rules:\n"
        "1. Output ONLY the standalone search query. Do NOT write greetings, explanations, markdown blocks, quotes, or extra text.\n"
        "2. Keep it concise (less than 10 words) and search-oriented.\n"
        "3. Preserve technical terms, file names, or code identifiers exactly as they are.\n"
        "4. If the message is already a standalone search query or doesn't refer to the history, output the original message exactly.\n\n"
        f"Conversation History:\n{history_text}\n"
        f"New User Message:\n{current_query}\n\n"
        "Standalone search query:"
    )

    res = await get_completion(
        prompt=rewrite_prompt,
        provider=provider,
        api_key=api_key,
        ollama_url=ollama_url,
        model=model,
        timeout_val=4.0
    )
    cleaned_text = res.strip().strip('"').strip("'")
    return cleaned_text if cleaned_text else current_query

async def generate_hyde_text(
    query: str,
    provider: str,
    api_key: str = None,
    ollama_url: str = None,
    model: str = None
) -> str:
    """Generates a hypothetical document passage (HyDE) to improve vector embedding similarity match."""
    hyde_prompt = (
        f"Please write a brief passage (2-3 sentences) that directly answers the following technical question. "
        f"Do not include introductions, explanations, or meta-talk. Just write the factual hypothetical answer content.\n\n"
        f"Question: {query}\n\n"
        f"Hypothetical Answer:"
    )
    
    res = await get_completion(
        prompt=hyde_prompt,
        provider=provider,
        api_key=api_key,
        ollama_url=ollama_url,
        model=model,
        timeout_val=4.0
    )
    return res if res else query


def rerank_chunks_lexical(query: str, chunks: List[Dict[str, Any]], top_n: int) -> List[Dict[str, Any]]:
    """Reranks chunks by calculating the term distance density of query terms inside the text.
    Promotes chunks where search terms appear closer together.
    """
    import re
    # Clean and split query into terms
    terms = [t.lower() for t in re.findall(r'\w+', query) if len(t) > 2]
    if not terms or not chunks:
        return chunks[:top_n]
        
    scored_chunks = []
    for chunk in chunks:
        text = chunk["text"].lower()
        words = re.findall(r'\w+', text)
        
        # Find indices of all query terms in the text words list
        term_indices = []
        for i, word in enumerate(words):
            if word in terms:
                term_indices.append(i)
                
        if not term_indices:
            # No matching words, base score on original rank/similarity
            scored_chunks.append((chunk, chunk.get("similarity", 0.0) * 0.1))
            continue
            
        # Calculate term density (inverse of average distance between query terms)
        gaps = []
        for a, b in zip(term_indices[:-1], term_indices[1:]):
            gaps.append(b - a)
            
        avg_gap = sum(gaps) / len(gaps) if gaps else 100.0
        density_score = 1.0 / (avg_gap + 1.0)
        
        # Cover ratio: what percentage of query terms are matched in this chunk?
        matched_terms = sum(1 for t in terms if t in text)
        cover_ratio = matched_terms / len(terms)
        
        # Combine density, coverage, and original similarity score
        final_score = (cover_ratio * 0.6) + (density_score * 0.2) + (chunk.get("similarity", 0.0) * 0.2)
        scored_chunks.append((chunk, final_score))
        
    # Sort by the combined lexical/density score
    scored_chunks.sort(key=lambda x: x[1], reverse=True)
    return [item[0] for item in scored_chunks[:top_n]]


def enrich_chunks_with_siblings(retrieved_chunks: List[Dict[str, Any]], all_chunks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Enriches retrieved chunks by prepending and appending adjacent chunks (preceding and succeeding index)
    to provide the LLM with broader document context.
    """
    if not retrieved_chunks or not all_chunks:
        return retrieved_chunks

    # Build a fast mapping of (doc_id, idx) to chunk text
    chunk_map = {(c["doc_id"], c["idx"]): c["text"] for c in all_chunks}
    
    enriched = []
    for chunk in retrieved_chunks:
        doc_id = chunk.get("doc_id")
        idx = chunk.get("idx")
        if doc_id is None or idx is None:
            enriched.append(chunk)
            continue
            
        prev_text = chunk_map.get((doc_id, idx - 1), "")
        next_text = chunk_map.get((doc_id, idx + 1), "")
        
        # Build enriched text representation
        enriched_text = ""
        if prev_text:
            # Highlight context boundaries
            enriched_text += f"[... {prev_text.strip()} ...]\n"
        enriched_text += chunk["text"]
        if next_text:
            enriched_text += f"\n[... {next_text.strip()} ...]"
            
        chunk_copy = dict(chunk)
        chunk_copy["text"] = enriched_text
        enriched.append(chunk_copy)
        
    return enriched

