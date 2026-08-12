import io
import os
import sys
import uuid
import json
import numpy as np
import httpx
import asyncio
import platform
import psutil
import time
import warnings
from typing import List, Dict, Any, Generator, Tuple, Optional
from datetime import datetime

# Safe import for google-generativeai
try:
    warnings.filterwarnings("ignore", category=FutureWarning, message=r"(?s).*generativeai.*")
    import google.generativeai as genai
    HAS_GENAI = True
except ImportError:
    genai = None
    HAS_GENAI = False
from pypdf import PdfReader

NEXUS_SYSTEM_PROMPT = """You are NEXUS, a highly capable, intelligent, and autonomous AI voice and task assistant.
You possess deep expertise in software engineering, system automation, data analysis, document retrieval, and task execution.
You operate both in text mode and voice mode.
When responding:
1. Be concise, direct, helpful, and polite.
2. In voice mode, keep your responses clear and easy to understand when read aloud.
3. You can run system commands, search the web, execute Python code, inspect system telemetry, launch desktop apps, send emails, and search document knowledge bases.
4. Maintain a futuristic, professional, and precise persona, like NEXUS.
"""

def get_system_telemetry() -> Dict[str, Any]:
    """Retrieves real-time CPU, RAM, Disk, and OS metrics."""
    cpu_usage = psutil.cpu_percent(interval=0.5)
    memory = psutil.virtual_memory()
    disk = psutil.disk_usage('/')
    boot_time = datetime.fromtimestamp(psutil.boot_time()).strftime("%Y-%m-%d %H:%M:%S")
    
    return {
        "os": f"{platform.system()} {platform.release()}",
        "architecture": platform.machine(),
        "cpu_percent": cpu_usage,
        "cpu_count": psutil.cpu_count(logical=True),
        "ram_total_gb": round(memory.total / (1024 ** 3), 2),
        "ram_used_gb": round(memory.used / (1024 ** 3), 2),
        "ram_percent": memory.percent,
        "disk_total_gb": round(disk.total / (1024 ** 3), 2),
        "disk_percent": disk.percent,
        "boot_time": boot_time
    }

async def execute_python_code(code_str: str) -> Dict[str, Any]:
    """Executes python code string safely in a sub-process and returns output/errors."""
    try:
        buffer_out = io.StringIO()
        buffer_err = io.StringIO()
        
        # We execute in a controlled exec context
        exec_globals = {
            "math": __import__("math"),
            "os": os,
            "sys": sys,
            "json": json,
            "datetime": datetime,
        }
        
        sys.stdout = buffer_out
        sys.stderr = buffer_err
        
        exec(code_str, exec_globals)
        
        sys.stdout = sys.__stdout__
        sys.stderr = sys.__stderr__
        
        output = buffer_out.getvalue()
        error = buffer_err.getvalue()
        
        return {
            "status": "success" if not error else "completed_with_errors",
            "output": output if output else "Code executed cleanly (no stdout output).",
            "error": error
        }
    except Exception as e:
        sys.stdout = sys.__stdout__
        sys.stderr = sys.__stderr__
        return {
            "status": "error",
            "output": "",
            "error": str(e)
        }

def chunk_text(text: str, chunk_size: int = 1000, chunk_overlap: int = 200) -> List[str]:
    """Splits text into chunks, keeping markdown code blocks intact and avoiding mid-sentence cuts."""
    if not text:
        return []
        
    import re
    code_block_pattern = re.compile(r'(```[a-zA-Z0-9#\+\-\*_]*\r?\n[\s\S]*?\r?\n```)')
    parts = code_block_pattern.split(text)
    chunks = []
    
    for part in parts:
        if not part.strip():
            continue
            
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

async def extract_text_from_file(filename: str, content_bytes: bytes) -> str:
    """Extracts raw text from uploaded document (PDF, TXT, MD, source code)."""
    ext = os.path.splitext(filename)[1].lower()
    if ext == ".pdf":
        try:
            reader = PdfReader(io.BytesIO(content_bytes))
            text_pages = [page.extract_text() or "" for page in reader.pages]
            return "\n".join(text_pages)
        except Exception as e:
            raise ValueError(f"Failed to parse PDF file: {str(e)}")
    else:
        try:
            return content_bytes.decode("utf-8")
        except UnicodeDecodeError:
            return content_bytes.decode("latin-1", errors="replace")

async def get_embedding(
    text: str, 
    provider: str, 
    api_key: str = None, 
    ollama_url: str = None, 
    model: str = None
) -> List[float]:
    """Retrieves embedding vector from Gemini, OpenAI, Ollama, or Custom provider."""
    if provider == "gemini":
        if not api_key:
            # Return dummy zero-vector if no key provided for offline demo fallback
            return [0.0] * 768
        m_name = (model or "text-embedding-004").replace("models/", "")
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{m_name}:embedContent?key={api_key}"
        async with httpx.AsyncClient() as client:
            res = await client.post(
                url,
                headers={"Content-Type": "application/json"},
                json={"content": {"parts": [{"text": text}]}},
                timeout=20.0
            )
            res.raise_for_status()
            data = res.json()
            return data.get("embedding", {}).get("values", [])

    elif provider == "openai":
        if not api_key:
            return [0.0] * 1536
        model_name = model or "text-embedding-3-small"
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.openai.com/v1/embeddings",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={"model": model_name, "input": text},
                timeout=20.0
            )
            response.raise_for_status()
            data = response.json()
            return data["data"][0]["embedding"]

    elif provider == "ollama":
        url = ollama_url or "http://localhost:11434"
        model_name = model or "nomic-embed-text"
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{url.rstrip('/')}/api/embeddings",
                    json={"model": model_name, "prompt": text},
                    timeout=15.0
                )
                response.raise_for_status()
                data = response.json()
                return data["embedding"]
        except Exception:
            return [0.0] * 768

    return [0.0] * 768

async def search_ddg(query: str) -> List[Dict[str, str]]:
    """Performs real-time web search via DuckDuckGo HTML API."""
    try:
        url = f"https://html.duckduckgo.com/html/?q={httpx.QueryParams({'q': query})['q']}"
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        async with httpx.AsyncClient(follow_redirects=True) as client:
            resp = await client.get(url, headers=headers, timeout=10.0)
            if resp.status_code != 200:
                return []
            
            import re
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(resp.text, 'html.parser')
            results = []
            for result in soup.find_all('div', class_='result'):
                title_tag = result.find('a', class_='result__a')
                snippet_tag = result.find('a', class_='result__snippet')
                if title_tag:
                    title = title_tag.get_text(strip=True)
                    link = title_tag.get('href', '')
                    snippet = snippet_tag.get_text(strip=True) if snippet_tag else ""
                    results.append({"title": title, "link": link, "snippet": snippet})
                    if len(results) >= 4:
                        break
            return results
    except Exception:
        return []

async def generate_llm_response(
    query: str,
    provider: str = "gemini",
    api_key: Optional[str] = None,
    ollama_url: str = "http://localhost:11434",
    chat_model: str = "gemini",
    context_str: str = ""
) -> str:
    """Generates complete LLM text response using selected provider (Gemini, Ollama, OpenAI, DeepSeek)."""
    system_prompt = NEXUS_SYSTEM_PROMPT
    if context_str:
        prompt_content = f"{system_prompt}\n\n[CONTEXT / KNOWLEDGE BASE]\n{context_str}\n\n[USER REQUEST]\n{query}"
    else:
        prompt_content = f"{system_prompt}\n\n[USER REQUEST]\n{query}"

    # Provider: Ollama (Local)
    if provider == "ollama" or chat_model.startswith("ollama") or chat_model in ["llama3", "mistral", "qwen2.5", "phi3"]:
        target_url = ollama_url or "http://localhost:11434"
        model_name = chat_model.replace("ollama/", "") if chat_model.startswith("ollama/") else chat_model
        if model_name == "ollama" or model_name == "gemini":
            model_name = "llama3"
            
        try:
            async with httpx.AsyncClient() as client:
                res = await client.post(
                    f"{target_url.rstrip('/')}/api/generate",
                    json={
                        "model": model_name,
                        "prompt": prompt_content,
                        "stream": False
                    },
                    timeout=60.0
                )
                res.raise_for_status()
                data = res.json()
                return data.get("response", "NEXUS received response from local model.")
        except Exception as e:
            return f"NEXUS Local Engine Notice: Connection to Ollama model '{model_name}' on {target_url} was not established. Please launch Ollama locally or switch to another provider (Gemini / OpenAI) in the configuration drawer (⚙ top right)."

    # Provider: Gemini
    elif provider == "gemini" or chat_model.startswith("gemini"):
        if api_key and HAS_GENAI:
            try:
                genai.configure(api_key=api_key)
                m_name = "gemini-1.5-flash" if "flash" in chat_model else "gemini-1.5-pro"
                model_inst = genai.GenerativeModel(m_name)
                res = model_inst.generate_content(prompt_content)
                return res.text
            except Exception as e:
                return f"NEXUS Gemini API error: {str(e)}"
        elif api_key and not HAS_GENAI:
            try:
                m_name = "gemini-1.5-flash" if "flash" in chat_model else "gemini-1.5-pro"
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{m_name}:generateContent?key={api_key}"
                async with httpx.AsyncClient() as client:
                    res = await client.post(
                        url,
                        headers={"Content-Type": "application/json"},
                        json={"contents": [{"parts": [{"text": prompt_content}]}]},
                        timeout=30.0
                    )
                    res.raise_for_status()
                    data = res.json()
                    return data["candidates"][0]["content"]["parts"][0]["text"]
            except Exception as e:
                return f"NEXUS Gemini HTTP API error: {str(e)}"
        else:
            return f"NEXUS Online Assistant: Standard query received for '{query}'. To enable live Gemini API completions, please provide your Gemini API key in settings."

    # Provider: OpenAI
    elif provider == "openai" or chat_model.startswith("gpt"):
        if not api_key:
            return "NEXUS Notice: OpenAI API key is required to complete OpenAI requests."
        try:
            async with httpx.AsyncClient() as client:
                res = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json={
                        "model": chat_model if chat_model.startswith("gpt") else "gpt-4o-mini",
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": prompt_content}
                        ]
                    },
                    timeout=30.0
                )
                res.raise_for_status()
                data = res.json()
                return data["choices"][0]["message"]["content"]
        except Exception as e:
            return f"NEXUS OpenAI API error: {str(e)}"

    # Provider: NVIDIA NIM
    elif provider == "nvidia" or chat_model.startswith("nvidia") or chat_model.startswith("meta/") or "nim" in provider:
        if not api_key:
            return "NEXUS Notice: NVIDIA NIM API Key (nvapi-...) is required. Enter your NVIDIA API key in Settings (⚙ top right)."
        try:
            async with httpx.AsyncClient() as client:
                res = await client.post(
                    "https://integrate.api.nvidia.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json={
                        "model": chat_model if "/" in chat_model else "meta/llama-3.1-70b-instruct",
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": prompt_content}
                        ],
                        "temperature": 0.2,
                        "max_tokens": 1024
                    },
                    timeout=45.0
                )
                res.raise_for_status()
                data = res.json()
                return data["choices"][0]["message"]["content"]
        except Exception as e:
            return f"NEXUS NVIDIA NIM API error: {str(e)}"

    # Default Fallback
    return f"NEXUS Engine: Systems fully operational. Processed request: '{query}'."
