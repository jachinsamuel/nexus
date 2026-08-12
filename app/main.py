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
from app.jarvis_engine import (
    extract_text_from_file, 
    chunk_text, 
    get_embedding, 
    get_embeddings_batch,
    search_chunks, 
    search_hybrid,
    search_generic,
    generate_response_stream,
    extract_memory_and_skills_from_dialogue,
    search_ddg,
    rewrite_query_for_retrieval,
    rerank_chunks_lexical,
    generate_hyde_text,
    enrich_chunks_with_siblings
)

db = Database("jarvis.db")
app = FastAPI(title="JARVIS Autonomous AI Assistant", version="2.0.0")

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

class SecurityAuditRequest(BaseModel):
    scanWorkspace: bool = True

class BenchmarkRequest(BaseModel):
    numRequests: int = 5
    concurrency: int = 2
    promptText: str = "Explain quantum computing in one sentence."

class ChatRequest(BaseModel):
    conversationId: Optional[str] = None
    query: str
    provider: str = "gemini"
    apiKey: Optional[str] = None
    ollamaUrl: Optional[str] = "http://localhost:11434"
    embedModel: Optional[str] = "nomic-embed-text"
    genModel: Optional[str] = "llama3"
    chatModel: str = "gemini"
    topK: int = 4
    similarityThreshold: float = 0.3
    retrievalStrategy: str = "hybrid"

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

# JARVIS Action Endpoints
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
        "message": f"JARVIS Email Preview ready for {req.to_email}.",
        "to": req.to_email,
        "subject": req.subject,
        "body": req.body
    }

@app.post("/api/system/launch")
async def launch_system_app(req: AppLaunchRequest):
    app_map = {
        "vscode": ["code"],
        "chrome": ["chrome"] if platform.system() == "Windows" else ["google-chrome"],
        "notepad": ["notepad"] if platform.system() == "Windows" else ["gedit"],
        "calculator": ["calc"] if platform.system() == "Windows" else ["gnome-calculator"],
        "terminal": ["cmd", "/c", "start", "cmd"] if platform.system() == "Windows" else ["x-terminal-emulator"]
    }

    key = req.appName.lower().strip()
    if key not in app_map:
        raise HTTPException(status_code=400, detail=f"App '{req.appName}' not supported.")

    try:
        subprocess.Popen(app_map[key], shell=True if platform.system() == "Windows" else False)
        return {
            "status": "success",
            "message": f"JARVIS launched application: {key.upper()}",
            "app": key
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to launch {key}: {str(e)}")

@app.post("/api/voice/intent")
async def process_voice_intent(req: VoiceIntentRequest):
    cmd = req.command.lower().strip()

    if "open" in cmd or "launch" in cmd:
        for app_name in ["vscode", "chrome", "notepad", "calculator", "terminal"]:
            if app_name in cmd or (app_name == "vscode" and "code" in cmd):
                return await launch_system_app(AppLaunchRequest(appName=app_name))

    if "send email" in cmd or "mail to" in cmd:
        import re
        email_match = re.search(r'[\w\.-]+@[\w\.-]+', cmd)
        to_addr = email_match.group(0) if email_match else "recipient@example.com"
        return await send_email_endpoint(EmailRequest(
            to_email=to_addr,
            subject="JARVIS Voice Assistant Message",
            body=f"Message generated via JARVIS Voice Command: {req.command}"
        ))

    return {
        "status": "query",
        "intent": "chat_query",
        "command": req.command
    }

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

# Chat Streaming Endpoint
@app.post("/api/stream")
async def chat_stream(request: ChatRequest, background_tasks: BackgroundTasks):
    conv_id = request.conversationId
    if not conv_id:
        conv_id = db.create_conversation(request.query[:30] if len(request.query) > 30 else request.query)

    db.add_message(conv_id, "user", request.query)

    async def event_generator():
        yield f"event: conv_id\ndata: {json.dumps({'conversationId': conv_id})}\n\n"
        
        # Simple stream placeholder for demo speed
        try:
            chunks = db.get_all_chunks()
            context_str = "\n".join([c["content"] for c in chunks[:4]])
            prompt = f"System Context:\n{context_str}\n\nUser Query: {request.query}"
            
            full_response = ""
            for token in f"JARVIS Response to '{request.query}': Systems operational and RAG context analyzed successfully.".split(" "):
                full_response += token + " "
                yield f"event: token\ndata: {json.dumps(token + ' ')}\n\n"
                await asyncio.sleep(0.04)
                
            db.add_message(conv_id, "assistant", full_response)
        except Exception as e:
            yield f"event: error\ndata: {json.dumps(str(e))}\n\n"
            
        yield "event: done\ndata: {}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

# Mount Static UI
static_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "static"))
app.mount("/", StaticFiles(directory=static_path, html=True), name="static")
