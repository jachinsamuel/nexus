<div align="center">

# ⚡ NEXUS Autonomous Voice & Task AI Assistant

**A Next-Generation Voice & Task Automation System powered by Local (Ollama, LM Studio) & Cloud AI Models (Gemini, OpenAI, Claude, DeepSeek, OpenRouter).**

![Python](https://img.shields.io/badge/Python-3.10%2B-blue?style=for-the-badge&logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-0.100%2B-009688?style=for-the-badge&logo=fastapi)
![Ollama](https://img.shields.io/badge/Ollama-Local_LLM-orange?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

</div>

---

## ✨ Features

- **🎙️ Fullscreen Cybernetic Voice Interface**:
  - Hands-free wake word activation (*"Nexus"* / *"Nexus wake up"*).
  - Real-time cybernetic Arc Reactor canvas visualizer with dynamic state rings (STANDBY, LISTENING, THINKING, SPEAKING).
  - Web Speech API integration for continuous speech-to-text (STT) and smooth voice responses (TTS).

- **🧠 Dual Local & Cloud AI Engines**:
  - **Local Models**: Native Ollama & LM Studio integration (`llama3`, `mistral`, `qwen2.5`, `nomic-embed-text`).
  - **API Models**: Google Gemini (`gemini-1.5-flash`), OpenAI (`gpt-4o`), Claude, DeepSeek, and OpenRouter.

- **🚀 System Automation & Desktop Action Center**:
  - Launch desktop applications (VS Code, Chrome, Terminal, Notepad, Calculator, Custom apps).
  - Fetch real-time hardware telemetry (CPU, RAM, Disk usage, OS uptime).
  - Safe Python sandbox code execution engine.
  - Security & privacy vulnerability auditing (scan workspace for hardcoded secrets and API keys).
  - Email dispatch and automated draft preview.

- **📚 Document RAG & Hybrid Knowledge Retrieval**:
  - Multi-format document parser (PDF, TXT, Markdown, Source Code).
  - Chunking with code-block preservation, vector embedding search + hybrid lexical search + reciprocal rank fusion (RRF).

---

## 🚀 Quick Start

### 1. Requirements
- **Python 3.10+**
- (Optional for local AI) **[Ollama](https://ollama.ai)** installed and running locally on `http://localhost:11434`.

### 2. Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/your-username/NEXUS.git
cd NEXUS
pip install -r requirements.txt
```

### 3. Launching NEXUS

#### On Windows:
Double-click `run.bat` or run:

```cmd
run.bat
```

Or for silent background boot:
```cmd
wscript NEXUS_Background_Start.vbs
```

#### On Linux / macOS:
```bash
python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

Then open your browser to **`http://localhost:8001`**.

---

## 🎤 Voice Commands Guide

| Command | Action |
| :--- | :--- |
| `"Nexus wake up"` | Activates full voice assistant overlay |
| `"Open VS Code"` / `"Launch Chrome"` | Opens specified desktop application |
| `"System stats"` | Reports current CPU, RAM, and system metrics |
| `"Run security audit"` | Scans workspace files for exposed keys or vulnerabilities |
| `"Send email to user@domain.com"` | Opens automated email composer |
| `"Nexus sleep"` | Returns assistant to standby mode |

---

## 🛠️ Architecture

```
NEXUS/
├── app/
│   ├── main.py            # FastAPI REST & Streaming server
│   ├── nexus_engine.py    # Multi-provider LLM, RAG & system task engine
│   ├── database.py        # SQLite persistence (nexus.db)
│   └── filesystem.py      # Safe workspace file management
├── static/
│   ├── index.html         # Futuristic dark cybernetic web UI
│   ├── style.css          # Glassmorphism & visualizer styling
│   └── app.js             # Voice recognition, TTS, audio visualizer & websocket streaming
├── run.bat                # Windows boot launcher
├── NEXUS_Background_Start.vbs # Background boot script
├── requirements.txt       # Dependencies
├── .gitignore             # Repository exclusion rules
├── LICENSE                # MIT License
└── README.md              # Documentation
```

---

## 📜 License

Distributed under the MIT License. See `LICENSE` for details.
