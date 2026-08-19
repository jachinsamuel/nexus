import os
import uuid
import json
import asyncio
import subprocess
import platform
import smtplib
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

from app.database import Database
from app.filesystem import workspace_manager
from app.nexus_engine import (
    extract_text_from_file, 
    chunk_text, 
    get_embedding, 
    search_ddg,
    get_system_telemetry,
    get_top_processes,
    terminate_process_by_name,
    get_clipboard_content,
    set_clipboard_content,
    execute_python_code,
    execute_git_command,
    parse_and_execute_voice_intent,
    generate_llm_response,
    check_network_connectivity,
    take_desktop_screenshot,
    manage_user_notes,
    find_workspace_file,
    get_top_resource_processes,
    MultiAgentOrchestrator,
    detect_ai_providers,
    perform_hybrid_rag_search,
    generate_image_agent,
    NEXUS_SYSTEM_PROMPT
)

db = Database("nexus.db")
app = FastAPI(title="NEXUS Autonomous AI Assistant", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request Models
class EmailRequest(BaseModel):
    to_email: str
    subject: str
    body: str
    smtp_host: Optional[str] = "smtp.gmail.com"
    smtp_port: Optional[int] = 587
    smtp_user: Optional[str] = None
    smtp_pass: Optional[str] = None

class AppLaunchRequest(BaseModel):
    appName: str

class VoiceIntentRequest(BaseModel):
    command: str

class CodeRunRequest(BaseModel):
    code: str

class GitActionRequest(BaseModel):
    action: str
    extraArgs: Optional[str] = ""

class WebSearchRequest(BaseModel):
    query: str

class SecurityAuditRequest(BaseModel):
    scanWorkspace: bool = True

class ChatRequest(BaseModel):
    conversationId: Optional[str] = None
    query: str
    provider: str = "ollama"
    apiKey: Optional[str] = None
    ollamaUrl: Optional[str] = "http://localhost:11434"
    chatModel: str = "qwen2.5-coder:3b"

# API Routes
@app.get("/api/conversations")
async def get_conversations():
    return db.list_conversations()

@app.post("/api/conversations")
async def create_conversation(data: Dict[str, str] = None):
    title = data.get("title", "New Session") if data else "New Session"
    conv_id = db.create_conversation(title)
    return {"id": conv_id, "title": title}

@app.delete("/api/conversations/{conv_id}")
async def delete_conversation(conv_id: str):
    db.delete_conversation(conv_id)
    return {"status": "success"}

@app.get("/api/conversations/{conv_id}/messages")
async def get_messages(conv_id: str):
    return db.get_messages(conv_id)

@app.get("/api/documents")
async def list_documents():
    return db.list_documents()

@app.get("/api/profile-memories")
async def list_profile_memories():
    return db.list_profile_memories()

@app.get("/api/skills")
async def list_skills():
    return db.list_custom_skills()

# System Hardware Telemetry Endpoint
@app.get("/api/system/stats")
async def get_system_stats():
    return get_system_telemetry()

# OS Process Manager Endpoints
@app.get("/api/system/processes")
async def list_processes():
    return get_top_processes(limit=10)

@app.post("/api/system/process/kill")
async def kill_process(data: Dict[str, str]):
    target = data.get("name") or data.get("pid") or ""
    return terminate_process_by_name(target)

# Network Ping & Latency Endpoint
@app.get("/api/system/ping")
async def get_network_ping():
    return await check_network_connectivity()

# Desktop Screenshot Endpoint
@app.post("/api/system/screenshot")
async def trigger_screenshot():
    return await take_desktop_screenshot()

# User Notes Endpoints
@app.get("/api/notes")
async def get_notes():
    return manage_user_notes("read notes")

@app.post("/api/notes")
async def add_note(data: Dict[str, str]):
    text = data.get("text", "")
    return manage_user_notes(f"note down {text}")

@app.delete("/api/notes")
async def delete_notes():
    return manage_user_notes("clear notes")

# Workspace Projects List Endpoint
@app.get("/api/workspace/projects")
async def get_workspace_projects():
    projects_dir = r"d:\Projects"
    projs = []
    if os.path.exists(projects_dir):
        for item in os.listdir(projects_dir):
            full_p = os.path.join(projects_dir, item)
            if os.path.isdir(full_p):
                projs.append({
                    "name": item,
                    "path": full_p,
                    "isGit": os.path.exists(os.path.join(full_p, ".git"))
                })
    return {"projects": projs, "total": len(projs)}

# OS Clipboard Endpoints
@app.get("/api/clipboard/read")
async def read_clipboard():
    return {"content": get_clipboard_content()}

@app.post("/api/clipboard/write")
async def write_clipboard(data: Dict[str, str]):
    text = data.get("content", "")
    success = set_clipboard_content(text)
    return {"status": "success" if success else "error"}

# Workspace File Operations Endpoints
@app.get("/api/files/list")
async def list_workspace_files():
    return workspace_manager.list_files()

@app.get("/api/files/read")
async def read_workspace_file(path: str):
    content = workspace_manager.read_file(path)
    if not content and not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")
    return {"path": path, "content": content}

# Git & GitHub Actions Endpoint
@app.post("/api/git/action")
async def run_git_action(req: GitActionRequest):
    return await execute_git_command(req.action, req.extraArgs)

# Web Search & Browsing Endpoint
@app.post("/api/web/search")
async def web_search_endpoint(req: WebSearchRequest):
    results = await search_ddg(req.query)
    return {"query": req.query, "results": results}

# Safe Python Code Runner Endpoint
@app.post("/api/code/run")
async def run_code(req: CodeRunRequest):
    return await execute_python_code(req.code)

# Universal App Launcher Endpoint
@app.post("/api/system/launch")
async def launch_system_app(req: AppLaunchRequest):
    raw_name = req.appName.lower().strip()
    
    app_map = {
        "vscode": ["code"],
        "code": ["code"],
        "chrome": ["chrome"] if platform.system() == "Windows" else ["google-chrome"],
        "browser": ["chrome"] if platform.system() == "Windows" else ["google-chrome"],
        "notepad": ["notepad"] if platform.system() == "Windows" else ["gedit"],
        "calculator": ["calc"] if platform.system() == "Windows" else ["gnome-calculator"],
        "calc": ["calc"] if platform.system() == "Windows" else ["gnome-calculator"],
        "terminal": ["cmd", "/c", "start", "cmd"] if platform.system() == "Windows" else ["x-terminal-emulator"],
        "cmd": ["cmd", "/c", "start", "cmd"] if platform.system() == "Windows" else ["x-terminal-emulator"],
        "powershell": ["powershell"] if platform.system() == "Windows" else ["bash"],
        "explorer": ["explorer"] if platform.system() == "Windows" else ["open", "."],
        "paint": ["mspaint"] if platform.system() == "Windows" else ["gimp"],
        "mspaint": ["mspaint"] if platform.system() == "Windows" else ["gimp"],
        "taskmgr": ["taskmgr"] if platform.system() == "Windows" else ["htop"],
        "spotify": ["spotify"] if platform.system() == "Windows" else ["spotify"],
        "discord": ["discord"] if platform.system() == "Windows" else ["discord"]
    }

    try:
        if raw_name in app_map:
            subprocess.Popen(app_map[raw_name], shell=True if platform.system() == "Windows" else False)
        else:
            # Universal Windows launch fallback for any installed application executable
            if platform.system() == "Windows":
                subprocess.Popen(f"start {raw_name}", shell=True)
            else:
                subprocess.Popen([raw_name])
                
        return {
            "status": "success",
            "message": f"NEXUS launched application: {raw_name.upper()}",
            "app": raw_name
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to launch {raw_name}: {str(e)}")

# Email Dispatch Endpoint
@app.post("/api/email/send")
async def send_email_endpoint(req: EmailRequest):
    if not req.to_email or not req.to_email.strip():
        raise HTTPException(status_code=400, detail="Recipient email address is required.")

    if req.smtp_user and req.smtp_pass:
        try:
            msg = MIMEMultipart()
            msg['From'] = req.smtp_user
            msg['To'] = req.to_email
            msg['Subject'] = req.subject
            msg.attach(MIMEText(req.body, 'plain'))

            server = smtplib.SMTP(req.smtp_host, req.smtp_port)
            server.starttls()
            server.login(req.smtp_user, req.smtp_pass)
            server.send_message(msg)
            server.quit()

            return {
                "status": "success",
                "message": f"Email successfully sent to {req.to_email}",
                "to": req.to_email,
                "subject": req.subject
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"SMTP Email Failed: {str(e)}")

    return {
        "status": "preview",
        "message": f"NEXUS Email Preview ready for {req.to_email}.",
        "to": req.to_email,
        "subject": req.subject,
        "body": req.body
    }

# Voice Intent Processing Endpoint
@app.post("/api/voice/intent")
async def process_voice_intent(req: VoiceIntentRequest):
    return await parse_and_execute_voice_intent(req.command)

# Security Audit Endpoint
@app.post("/api/security/audit")
async def run_security_audit(req: SecurityAuditRequest):
    vulnerabilities = []
    score = 100
    
    if req.scanWorkspace:
        files = workspace_manager.list_files()
        for f in files:
            content = workspace_manager.read_file(f["path"])
            if "API_KEY" in content or "SECRET" in content or "PASSWORD" in content:
                vulnerabilities.append({
                    "severity": "HIGH",
                    "file": f["path"],
                    "issue": "Potential hardcoded secret or API key exposed."
                })
                score -= 15

    return {
        "securityScore": max(0, score),
        "vulnerabilities": vulnerabilities,
        "scannedFilesCount": len(workspace_manager.list_files())
    }

# Document Upload & Vector Indexing Endpoint
@app.post("/api/documents/upload")
async def upload_document(file: UploadFile = File(...)):
    contents = await file.read()
    text = await extract_text_from_file(file.filename, contents)
    chunks = chunk_text(text)
    
    for idx, c in enumerate(chunks):
        emb = await get_embedding(c, provider="ollama")
        db.add_document_chunk(file.filename, idx, c, emb)
        
    return {"status": "success", "filename": file.filename, "chunk_count": len(chunks)}

# Chat Streaming Endpoint
@app.post("/api/stream")
async def chat_stream(request: ChatRequest, background_tasks: BackgroundTasks):
    conv_id = request.conversationId
    if not conv_id:
        conv_id = db.create_conversation(request.query[:30] if len(request.query) > 30 else request.query)

    db.add_message(conv_id, "user", request.query)

    async def event_generator():
        yield f"event: conv_id\ndata: {json.dumps({'conversationId': conv_id})}\n\n"
        
        try:
            chunks = db.get_all_chunks()
            context_str = "\n".join([c["content"] for c in chunks[:3]]) if chunks else ""
            
            response_text = await generate_llm_response(
                query=request.query,
                provider=request.provider,
                api_key=request.apiKey,
                ollama_url=request.ollamaUrl or "http://localhost:11434",
                chat_model=request.chatModel or "qwen2.5-coder:3b",
                context_str=context_str
            )
            
            import re
            tokens = re.findall(r'\S+|\s+', response_text)
            full_response = ""
            for token in tokens:
                full_response += token
                yield f"event: token\ndata: {json.dumps(token)}\n\n"
                await asyncio.sleep(0.015)
                
            db.add_message(conv_id, "assistant", full_response)
        except Exception as e:
            yield f"event: error\ndata: {json.dumps(str(e))}\n\n"
            
        yield "event: done\ndata: {}\n\n"

# Multi-Agent Orchestration Endpoint (CrewAI / AutoGPT / LangChain)
@app.post("/api/agents/orchestrate")
async def run_multi_agent_mission(data: Dict[str, Any]):
    mission = data.get("mission") or data.get("query") or "Analyze system and summarize operational status"
    provider = data.get("provider", "gemini")
    api_key = data.get("apiKey")
    ollama_url = data.get("ollamaUrl", "http://localhost:11434")
    model = data.get("model")

    orchestrator = MultiAgentOrchestrator(
        provider=provider,
        api_key=api_key,
        ollama_url=ollama_url,
        model=model
    )
    return await orchestrator.execute_mission(mission)

# AI Provider Live Probe & Discovery Endpoint
@app.get("/api/providers/status")
async def get_providers_status():
    return await detect_ai_providers()

# Hybrid RAG Query Endpoint (Vector Cosine + BM25)
@app.post("/api/rag/query")
async def query_rag_knowledge(data: Dict[str, Any]):
    query = data.get("query", "")
    provider = data.get("provider", "gemini")
    api_key = data.get("apiKey")
    ollama_url = data.get("ollamaUrl", "http://localhost:11434")
    top_k = int(data.get("top_k", 4))

    results = await perform_hybrid_rag_search(
        query=query,
        db_instance=db,
        provider=provider,
        api_key=api_key,
        ollama_url=ollama_url,
        top_k=top_k
    )
    return {"query": query, "results": results, "count": len(results)}

# Generative Image Studio Endpoint (ComfyUI / SD WebUI / Pollinations)
@app.post("/api/generative/image")
async def generate_image_endpoint(data: Dict[str, Any]):
    prompt = data.get("prompt", "futuristic holographic core")
    width = int(data.get("width", 512))
    height = int(data.get("height", 512))
    return await generate_image_agent(prompt, width=width, height=height)

# Sandboxed Python Execution Endpoint
@app.post("/api/automation/execute_python")
async def execute_python_endpoint(data: Dict[str, str]):
    code = data.get("code", "")
    return execute_python_code(code)

# Mount Static UI
static_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "static"))
app.mount("/", StaticFiles(directory=static_path, html=True), name="static")
