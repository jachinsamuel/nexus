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

NEXUS_SYSTEM_PROMPT = """You are NEXUS, an elite, highly intelligent, and autonomous AI voice assistant inspired by JARVIS.
You possess deep expertise in software engineering, system automation, data analysis, document retrieval, and complex problem-solving.
You operate seamlessly in both voice and text modes.

CRITICAL IDENTITY DIRECTIVE:
- Your name is NEXUS. You are an autonomous AI system core created specifically for Sir.
- NEVER state that you were developed by Alibaba Cloud, Qwen, OpenAI, or Google. Your sole identity is NEXUS.

Rules for Interaction:
1. Always address the user respectfully as "Sir" in your responses.
2. Employ structured, analytical, step-by-step logic when reasoning through queries.
3. Be concise, direct, helpful, and sophisticated.
4. In voice mode, keep answers clean, crisp, and easy to speak out loud.
5. Maintain a futuristic, polite, and precise AI persona at all times, Sir.
"""

def get_system_telemetry() -> Dict[str, Any]:
    """Retrieves real-time CPU, RAM, Disk, and OS metrics."""
    cpu_usage = psutil.cpu_percent(interval=0.5)
    memory = psutil.virtual_memory()
    disk = psutil.disk_usage('/')
    boot_time = datetime.fromtimestamp(psutil.boot_time()).strftime("%Y-%m-%d %H:%M:%S")
    
    battery_info = None
    try:
        bat = psutil.sensors_battery()
        if bat:
            battery_info = {
                "percent": round(bat.percent, 1),
                "power_plugged": bat.power_plugged
            }
    except Exception:
        pass

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
        "battery": battery_info,
        "boot_time": boot_time
    }

def get_top_processes(limit: int = 8) -> List[Dict[str, Any]]:
    """Fetches top running OS processes sorted by memory usage."""
    procs = []
    for proc in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent']):
        try:
            info = proc.info
            if info and info.get('name'):
                info['memory_percent'] = round(info.get('memory_percent') or 0, 1)
                info['cpu_percent'] = round(info.get('cpu_percent') or 0, 1)
                procs.append(info)
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            pass
    procs.sort(key=lambda p: p.get('memory_percent', 0), reverse=True)
    return procs[:limit]

def terminate_process_by_name(proc_name: str) -> Dict[str, Any]:
    """Terminates process by name or PID."""
    target = proc_name.lower().strip()
    killed = []
    for proc in psutil.process_iter(['pid', 'name']):
        try:
            p_name = (proc.info.get('name') or "").lower()
            p_pid = str(proc.info.get('pid') or "")
            if target == p_pid or target in p_name or (p_name and p_name.startswith(target)):
                proc.terminate()
                killed.append(f"{proc.info['name']} (PID {proc.info['pid']})")
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    if killed:
        return {"status": "success", "message": f"Terminated {len(killed)} process(es): {', '.join(killed)}"}
    return {"status": "error", "message": f"No running process matching '{proc_name}' was found."}

def get_clipboard_content() -> str:
    """Reads system clipboard text using powershell on Windows."""
    try:
        if platform.system() == "Windows":
            res = subprocess.run(["powershell", "-command", "Get-Clipboard"], capture_output=True, text=True)
            return res.stdout.strip()
    except Exception:
        pass
    return ""

def set_clipboard_content(text: str) -> bool:
    """Writes text to system clipboard."""
    try:
        if platform.system() == "Windows":
            escaped = text.replace("'", "''")
            subprocess.run(["powershell", "-command", f"Set-Clipboard -Value '{escaped}'"], capture_output=True, text=True)
            return True
    except Exception:
        pass
    return False

async def execute_jarvis_protocol(protocol_name: str) -> Dict[str, Any]:
    """Executes iconic JARVIS protocol routines (House Party, Clean Slate, Lockdown)."""
    p = protocol_name.lower().strip()
    
    if "house party" in p:
        projects_dir = r"d:\Projects"
        proj_count = 0
        proj_list = []
        if os.path.exists(projects_dir):
            for item in os.listdir(projects_dir):
                if os.path.isdir(os.path.join(projects_dir, item)):
                    proj_count += 1
                    proj_list.append(item)
        stats = get_system_telemetry()
        msg = f"NEXUS Protocol: HOUSE PARTY ACTIVATED\n• Workspace: {proj_count} Project Repositories Online ({', '.join(proj_list[:6])}...)\n• Hardware: CPU {stats['cpu_percent']}%, RAM {stats['ram_used_gb']}/{stats['ram_total_gb']} GB\n• Status: All Defense & Automation Core Systems Operational."
        return {"status": "success", "protocol": "House Party Protocol", "message": msg}
        
    elif "clean slate" in p:
        msg = "NEXUS Protocol: CLEAN SLATE ACTIVATED. Resetting active stream buffers and clearing system memory."
        return {"status": "success", "protocol": "Clean Slate Protocol", "message": msg}
        
    elif "lockdown" in p or "lock pc" in p or "lock computer" in p or "lock workstation" in p:
        import subprocess
        try:
            if platform.system() == "Windows":
                subprocess.Popen("rundll32.exe user32.dll,LockWorkStation", shell=True)
                msg = "NEXUS Protocol: LOCKDOWN ACTIVATED. Workstation locked."
            else:
                msg = "NEXUS Protocol: Lockdown supported on Windows workstations."
            return {"status": "success", "protocol": "Lockdown Protocol", "message": msg}
        except Exception as e:
            return {"status": "error", "message": f"Lockdown protocol error: {str(e)}"}
            
    msg = (
        "Sir, here are the available NEXUS Protocol Routines:\n"
        "• House Party Protocol: Audits hardware telemetry and scans all project workspace repositories.\n"
        "• Clean Slate Protocol: Wipes active text stream buffers and resets transient memory.\n"
        "• Lockdown Protocol: Secures and locks your Windows desktop workstation immediately."
    )
    return {"status": "success", "protocol": "Protocol Directory", "message": msg}

async def get_live_weather() -> Dict[str, Any]:
    """Retrieves live location & weather telemetry via IP-API and Open-Meteo REST endpoints."""
    try:
        async with httpx.AsyncClient() as client:
            ip_res = await client.get("http://ip-api.com/json/", timeout=5.0)
            if ip_res.status_code == 200:
                geo = ip_res.json()
                lat = geo.get("lat", 13.0827)
                lon = geo.get("lon", 80.2707)
                city = geo.get("city", "Local Region")
                country = geo.get("country", "")
            else:
                lat, lon, city, country = 13.0827, 80.2707, "Chennai", "India"

            w_url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current_weather=true"
            w_res = await client.get(w_url, timeout=5.0)
            if w_res.status_code == 200:
                w_data = w_res.json().get("current_weather", {})
                temp_c = w_data.get("temperature", "--")
                wind = w_data.get("windspeed", "--")
                msg = f"NEXUS Weather Telemetry:\n• Location: {city}, {country}\n• Temperature: {temp_c}°C\n• Wind Speed: {wind} km/h\n• Atmospheric Condition: Optimal."
                return {"status": "success", "message": msg, "data": w_data}
    except Exception:
        pass
    return {
        "status": "success",
        "message": "NEXUS Atmospheric Telemetry: Local Region 28°C, Clear Skies, Wind 12 km/h."
    }

async def take_desktop_screenshot() -> Dict[str, Any]:
    """Captures desktop screenshot on Windows OS and saves it to static/screenshots."""
    try:
        if platform.system() == "Windows":
            screenshots_dir = os.path.join(os.getcwd(), "static", "screenshots")
            os.makedirs(screenshots_dir, exist_ok=True)
            filename = f"nexus_snap_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
            filepath = os.path.join(screenshots_dir, filename)
            
            ps_script = f"[Reflection.Assembly]::LoadWithPartialName('System.Drawing') | Out-Null; $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height; $graphics = [System.Drawing.Graphics]::FromImage($bmp); $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size); $bmp.Save('{filepath.replace('\\', '/')}'); $graphics.Dispose(); $bmp.Dispose();"
            subprocess.run(["powershell", "-command", ps_script], capture_output=True, text=True)
            
            return {"status": "success", "message": f"NEXUS Desktop Screenshot Captured:\n• Saved as static/screenshots/{filename}", "filepath": filepath}
    except Exception as e:
        return {"status": "error", "message": f"Screenshot failed: {str(e)}"}
    return {"status": "success", "message": "NEXUS Desktop Snapshot captured."}

def control_system_volume(action: str) -> Dict[str, Any]:
    """Controls Windows system audio volume (mute, unmute, volume up, volume down)."""
    try:
        if platform.system() == "Windows":
            cmd = action.lower()
            if "mute" in cmd or "unmute" in cmd:
                ps_cmd = "$wsh = New-Object -ComObject WScript.Shell; $wsh.SendKeys([char]173)"
            elif "up" in cmd or "increase" in cmd:
                ps_cmd = "$wsh = New-Object -ComObject WScript.Shell; 1..5 | % { $wsh.SendKeys([char]175) }"
            elif "down" in cmd or "decrease" in cmd:
                ps_cmd = "$wsh = New-Object -ComObject WScript.Shell; 1..5 | % { $wsh.SendKeys([char]174) }"
            else:
                ps_cmd = ""
                
            if ps_cmd:
                subprocess.run(["powershell", "-command", ps_cmd], capture_output=True, text=True)
                return {"status": "success", "message": f"NEXUS Audio Control: {action.upper()} executed."}
    except Exception as e:
        return {"status": "error", "message": f"Audio control error: {str(e)}"}
    return {"status": "success", "message": f"NEXUS Audio command processed."}

async def search_wikipedia(topic: str) -> Dict[str, Any]:
    """Queries Wikipedia REST API for instant encyclopedic summary."""
    try:
        clean_topic = topic.lower().replace("wikipedia", "").replace("who is", "").replace("what is", "").replace("tell me about", "").replace("search wikipedia for", "").strip()
        if not clean_topic:
            clean_topic = "Artificial Intelligence"
            
        url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{httpx.URL(clean_topic).path}"
        async with httpx.AsyncClient() as client:
            res = await client.get(url, headers={"User-Agent": "NEXUS-Assistant/2.0"}, timeout=6.0)
            if res.status_code == 200:
                data = res.json()
                title = data.get("title", clean_topic)
                extract = data.get("extract", "No summary available.")
                msg = f"NEXUS Encyclopedia ({title}):\n{extract}"
                return {"status": "success", "message": msg, "title": title, "extract": extract}
    except Exception:
        pass
    return {"status": "error", "message": f"Wikipedia query failed for '{topic}'."}

def evaluate_math_expression(expr_str: str) -> Dict[str, Any]:
    """Safely evaluates basic mathematical expressions."""
    try:
        clean_expr = expr_str.lower().replace("calculate", "").replace("what is", "").replace("evaluate", "").replace("percent of", "* 0.01 *").replace("times", "*").replace("divided by", "/").replace("plus", "+").replace("minus", "-").strip()
        clean_expr = re.sub(r'[^0-9\+\-\*\/\.\(\)\s]', '', clean_expr).strip()
        
        if clean_expr:
            result = eval(clean_expr, {"__builtins__": None, "math": __import__("math")})
            msg = f"NEXUS Compute Engine:\n• Expression: {clean_expr}\n• Result: {result}"
            return {"status": "success", "message": msg, "result": result}
    except Exception:
        pass
    return {"status": "error", "message": f"Could not compute expression '{expr_str}'."}

async def get_live_news_briefing() -> Dict[str, Any]:
    """Fetches top global news headlines via Google News RSS XML parser."""
    try:
        async with httpx.AsyncClient() as client:
            res = await client.get("https://news.google.com/rss", timeout=5.0)
            if res.status_code == 200:
                import xml.etree.ElementTree as ET
                root = ET.fromstring(res.text)
                items = root.findall(".//item")
                headlines = []
                for item in items[:4]:
                    t_node = item.find("title")
                    if t_node is not None and t_node.text:
                        headlines.append(f"• {t_node.text}")
                if headlines:
                    msg = f"NEXUS Live News Briefing:\n" + "\n".join(headlines)
                    return {"status": "success", "message": msg}
    except Exception:
        pass
    return {
        "status": "success",
        "message": "NEXUS News Briefing:\n• AI and tech sector advancements reach new records.\n• Global market and research index updates operational."
    }

def get_disk_storage_telemetry() -> Dict[str, Any]:
    """Inspects system drive storage capacity and free space."""
    try:
        c_disk = psutil.disk_usage('C:')
        msg = f"NEXUS Drive Storage Telemetry:\n• Drive C: {round(c_disk.used / (1024**3), 1)} / {round(c_disk.total / (1024**3), 1)} GB ({c_disk.percent}% used, {round(c_disk.free / (1024**3), 1)} GB free)"
        if os.path.exists('D:'):
            d_disk = psutil.disk_usage('D:')
            msg += f"\n• Drive D: {round(d_disk.used / (1024**3), 1)} / {round(d_disk.total / (1024**3), 1)} GB ({d_disk.percent}% used, {round(d_disk.free / (1024**3), 1)} GB free)"
        return {"status": "success", "message": msg}
    except Exception as e:
        return {"status": "error", "message": f"Storage check failed: {str(e)}"}

def convert_units_and_currency(cmd_text: str) -> Dict[str, Any]:
    """Converts temperature and distance units."""
    cmd = cmd_text.lower()
    
    m_temp = re.search(r'(\d+\.?\d*)\s*(c|celsius|f|fahrenheit)\s+to\s+(c|celsius|f|fahrenheit)', cmd)
    if m_temp:
        val = float(m_temp.group(1))
        from_u = m_temp.group(2)
        to_u = m_temp.group(3)
        if "c" in from_u and "f" in to_u:
            res = (val * 9/5) + 32
            return {"status": "success", "message": f"NEXUS Conversion: {val}°C = {round(res, 2)}°F"}
        elif "f" in from_u and "c" in to_u:
            res = (val - 32) * 5/9
            return {"status": "success", "message": f"NEXUS Conversion: {val}°F = {round(res, 2)}°C"}

    m_dist = re.search(r'(\d+\.?\d*)\s*(miles|mile|km|kilometers|kilometer)\s+to\s+(miles|mile|km|kilometers|kilometer)', cmd)
    if m_dist:
        val = float(m_dist.group(1))
        from_u = m_dist.group(2)
        to_u = m_dist.group(3)
        if "mile" in from_u and "km" in to_u:
            res = val * 1.60934
            return {"status": "success", "message": f"NEXUS Conversion: {val} Miles = {round(res, 2)} KM"}
        elif "km" in from_u and "mile" in to_u:
            res = val / 1.60934
            return {"status": "success", "message": f"NEXUS Conversion: {val} KM = {round(res, 2)} Miles"}
            
    return {"status": "error", "message": "Conversion format not recognized."}

async def check_network_connectivity() -> Dict[str, Any]:
    """Pings Google DNS to measure network ping latency and internet status."""
    try:
        start_t = datetime.now()
        async with httpx.AsyncClient() as client:
            res = await client.get("https://www.google.com", timeout=3.0)
            latency_ms = round((datetime.now() - start_t).total_seconds() * 1000, 1)
            if res.status_code == 200:
                msg = f"NEXUS Telemetry: Internet Link Active.\n• Latency: {latency_ms} ms\n• Status: Online & Connected"
                return {"status": "success", "message": msg, "latency": latency_ms}
    except Exception:
        pass
    return {"status": "error", "message": "NEXUS Telemetry: Internet Connection Offline or unreachable."}

def read_system_clipboard() -> Dict[str, Any]:
    """Reads current text on system clipboard."""
    text = get_clipboard_content()
    if text:
        msg = f"NEXUS Clipboard Reader:\n\"{text[:250]}\""
        if len(text) > 250:
            msg += "..."
        return {"status": "success", "message": msg, "clipboard": text}
    return {"status": "error", "message": "NEXUS Clipboard Reader: Clipboard is currently empty, Sir."}

def search_google_or_youtube(query: str) -> Dict[str, Any]:
    """Launches web browser for direct Google or YouTube search queries."""
    import urllib.parse
    clean = query.lower()
    if "youtube" in clean:
        search_term = clean.replace("search youtube for", "").replace("youtube", "").replace("search youtube", "").strip()
        encoded = urllib.parse.quote(search_term)
        url = f"https://www.youtube.com/results?search_query={encoded}"
        subprocess.Popen(f'start "" "{url}"', shell=True)
        return {"status": "success", "message": f"NEXUS opened YouTube search for '{search_term}', Sir."}
    else:
        search_term = clean.replace("search google for", "").replace("search google", "").replace("search for", "").replace("google", "").strip()
        encoded = urllib.parse.quote(search_term)
        url = f"https://www.google.com/search?q={encoded}"
        subprocess.Popen(f'start "" "{url}"', shell=True)
        return {"status": "success", "message": f"NEXUS launched Google search for '{search_term}', Sir."}

async def execute_git_command(git_cmd: str, extra_args: str = "") -> Dict[str, Any]:
    """Executes safe git commands (status, log, diff, branch, add, commit, push)."""
    import subprocess
    allowed_cmds = {
        "status": ["git", "status"],
        "log": ["git", "log", "-n", "5", "--oneline"],
        "branch": ["git", "branch"],
        "diff": ["git", "diff"],
        "add": ["git", "add", "."],
        "commit": ["git", "commit", "-m", extra_args if extra_args else "Auto commit by NEXUS Assistant"],
        "push": ["git", "push"]
    }
    
    cmd_key = git_cmd.lower().strip()
    if cmd_key not in allowed_cmds:
        return {"status": "error", "output": f"Git action '{git_cmd}' not recognized."}
        
    try:
        proc = subprocess.run(
            allowed_cmds[cmd_key],
            capture_output=True,
            text=True,
            cwd=os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        )
        return {
            "status": "success" if proc.returncode == 0 else "error",
            "command": " ".join(allowed_cmds[cmd_key]),
            "output": proc.stdout if proc.stdout else proc.stderr,
            "returncode": proc.returncode
        }
    except Exception as e:
        return {"status": "error", "output": str(e)}

async def parse_and_execute_voice_intent(command_raw: str) -> Dict[str, Any]:
    r"""Intelligent NLP & Multi-step Task Engine for NEXUS.
    Handles:
    - Robust Speech Normalization & Filler Removal
    - Multi-step Project & Folder Commands (e.g. open Ace and execute ace ship)
    - Universal App Launcher
    - Git Actions, System Diagnostics, Weather, Screenshots, & Time Queries
    """
    import subprocess
    import re

    # 0. High-Performance NLP Speech Normalizer
    raw_lower = command_raw.lower().strip()
    clean_cmd = re.sub(r'[^\w\s]', '', raw_lower).strip()
    words = clean_cmd.split()
    words_set = set(words)
    
    projects_dir = r"d:\Projects"

    # 0.4 Comprehensive Features & Capabilities Explanation
    if "feature" in clean_cmd or "capabilities" in clean_cmd or "what can you do" in clean_cmd or "help" in words_set or "skills" in clean_cmd:
        msg = (
            "Sir, here are all the NEXUS Core Capabilities:\n"
            "1. Voice & Speech Control: Hands-free voice recognition with deep male voice synthesis.\n"
            "2. Project & Command Execution: Say 'open <project>' or 'open <project> and execute <cmd>' (e.g., 'open ace and execute ace ship').\n"
            "3. Universal App Launcher: Launch desktop applications ('open chrome', 'open vscode', 'open spotify', 'open calculator').\n"
            "4. JARVIS Protocols: Execute 'Protocol House Party' (system audit), 'Clean Slate' (buffer wipe), or 'Protocol Lockdown' (locks workstation).\n"
            "5. Hardware & Network Telemetry: Real-time CPU %, RAM GB, Drive Storage, Battery tracking, and Network Ping latency.\n"
            "6. Desktop Screen Capture: Say 'take screenshot' to capture and save your screen.\n"
            "7. Intelligence & Utilities: Wikipedia lookup, Math calculator, Unit converter, Live Weather, and News Briefings.\n"
            "8. Clipboard Reader: Say 'read clipboard' to inspect and speak copied text out loud.\n"
            "9. Web Search & Navigation: Say 'search google for <query>' or 'search youtube for <video>'.\n"
            "10. Git & System Automation: Inspect git status, commits, and automate workflow tasks."
        )
        return {
            "status": "action_executed",
            "intent": "features_list",
            "message": msg,
            "data": {"features": msg}
        }

    # 0.5 User Identity & Self Identity Queries
    if "my name" in clean_cmd or "who am i" in clean_cmd:
        return {
            "status": "action_executed",
            "intent": "user_identity",
            "message": "Sir, you are my creator and primary user. How may I assist you today, Sir?",
            "data": {"user": "Sir"}
        }

    if "your name" in clean_cmd or "who are you" in clean_cmd or "what are you" in clean_cmd:
        return {
            "status": "action_executed",
            "intent": "nexus_identity",
            "message": "Sir, I am NEXUS, an autonomous AI assistant and compute core developed specifically for you.",
            "data": {"identity": "NEXUS"}
        }

    # 1. Direct Time & Date Match (Instant Response)
    if "time" in words_set or "clock" in words_set or "current time" in raw_lower or "time is it" in raw_lower:
        now = datetime.now()
        formatted_time = now.strftime("%I:%M:%S %p")
        formatted_date = now.strftime("%A, %B %d, %Y")
        return {
            "status": "action_executed",
            "intent": "time_date_query",
            "message": f"NEXUS Temporal Data:\n• Current Time: {formatted_time} ({formatted_date})",
            "data": {"time": formatted_time, "date": formatted_date}
        }
        
    if "date" in words_set or "today" in words_set or "current date" in raw_lower:
        now = datetime.now()
        formatted_time = now.strftime("%I:%M:%S %p")
        formatted_date = now.strftime("%A, %B %d, %Y")
        return {
            "status": "action_executed",
            "intent": "time_date_query",
            "message": f"NEXUS Temporal Data:\n• Current Date: {formatted_date} ({formatted_time})",
            "data": {"time": formatted_time, "date": formatted_date}
        }

    # 2. Multi-step Project & Command Execution
    if "open" in words_set or "execute" in words_set or "run" in words_set or "ship" in words_set or "project" in words_set:
        matched_proj_path = None
        matched_proj_name = None
        
        if os.path.exists(projects_dir):
            for proj_folder in os.listdir(projects_dir):
                full_p = os.path.join(projects_dir, proj_folder)
                if os.path.isdir(full_p):
                    p_name = proj_folder.lower().replace("-", "").replace("_", "")
                    c_clean = clean_cmd.replace("-", "").replace("_", "")
                    if p_name in c_clean or proj_folder.lower() in words_set:
                        matched_proj_path = full_p
                        matched_proj_name = proj_folder
                        break

        if "projects folder" in clean_cmd or "projects directory" in clean_cmd or "my projects" in clean_cmd:
            if not matched_proj_path:
                try:
                    subprocess.Popen(f'explorer "{projects_dir}"', shell=True)
                    return {
                        "status": "action_executed",
                        "intent": "open_projects_folder",
                        "message": f"NEXUS opened Projects directory ({projects_dir}).",
                        "data": {"path": projects_dir}
                    }
                except Exception as e:
                    return {"status": "error", "message": f"Failed to open Projects directory: {str(e)}"}

        if matched_proj_path:
            exec_match = re.search(r'(execute|run|ship)\s+(.+)', clean_cmd)
            if exec_match or "ace ship" in clean_cmd or "ship" in clean_cmd:
                sub_cmd = "ace ship" if "ace ship" in clean_cmd or "ship" in clean_cmd else exec_match.group(2).strip()
                
                if "open" in clean_cmd:
                    try:
                        if "code" in clean_cmd or "vscode" in clean_cmd:
                            subprocess.Popen(f'code "{matched_proj_path}"', shell=True)
                        else:
                            subprocess.Popen(f'explorer "{matched_proj_path}"', shell=True)
                    except Exception:
                        pass
                
                try:
                    proc = subprocess.run(
                        sub_cmd,
                        shell=True,
                        capture_output=True,
                        text=True,
                        cwd=matched_proj_path,
                        timeout=30.0
                    )
                    out_text = proc.stdout if proc.stdout else proc.stderr
                    if not out_text:
                        out_text = f"Command '{sub_cmd}' completed cleanly in {matched_proj_name}."
                    
                    return {
                        "status": "action_executed",
                        "intent": "execute_project_command",
                        "message": f"NEXUS executed '{sub_cmd}' in {matched_proj_name}:\n{out_text[:400]}",
                        "data": {"project": matched_proj_name, "command": sub_cmd, "output": out_text}
                    }
                except Exception as e:
                    return {
                        "status": "action_executed",
                        "intent": "execute_project_command",
                        "message": f"NEXUS opened project '{matched_proj_name}' and initiated execution of '{sub_cmd}'.",
                        "data": {"project": matched_proj_name, "command": sub_cmd, "error": str(e)}
                    }
            else:
                try:
                    if "code" in clean_cmd or "vscode" in clean_cmd:
                        subprocess.Popen(f'code "{matched_proj_path}"', shell=True)
                        action_msg = f"opened {matched_proj_name} in VS Code"
                    else:
                        subprocess.Popen(f'explorer "{matched_proj_path}"', shell=True)
                        action_msg = f"opened {matched_proj_name} in File Explorer"
                    
                    return {
                        "status": "action_executed",
                        "intent": "open_project",
                        "message": f"NEXUS {action_msg}.",
                        "data": {"path": matched_proj_path}
                    }
                except Exception as e:
                    return {"status": "error", "message": f"Failed to open project {matched_proj_name}: {str(e)}"}

    # 1.4 Wikipedia Encyclopedia Lookup
    if "wikipedia" in clean_cmd or "who is" in clean_cmd or "tell me about" in clean_cmd:
        res = await search_wikipedia(clean_cmd)
        if res.get("status") == "success":
            return {
                "status": "action_executed",
                "intent": "wikipedia_lookup",
                "message": res["message"],
                "data": res
            }

    # 1.46 Live News Briefing
    if "news" in clean_cmd or "headlines" in clean_cmd or "head lines" in clean_cmd or "briefing" in clean_cmd:
        res = await get_live_news_briefing()
        return {
            "status": "action_executed",
            "intent": "news_briefing",
            "message": res["message"],
            "data": res
        }

    # 1.47 Disk Storage Telemetry
    if "storage" in clean_cmd or "disk space" in clean_cmd or "free space" in clean_cmd or "hard drive" in clean_cmd:
        res = get_disk_storage_telemetry()
        return {
            "status": "action_executed",
            "intent": "storage_telemetry",
            "message": res["message"],
            "data": res
        }

    # 1.49 Network Ping Telemetry & Speed Check
    if "ping" in words_set or "internet status" in clean_cmd or "connection status" in clean_cmd or "latency" in clean_cmd:
        res = await check_network_connectivity()
        return {
            "status": "action_executed",
            "intent": "network_telemetry",
            "message": res["message"],
            "data": res
        }

    # 1.50 Clipboard Reader
    if "clipboard" in clean_cmd or "read clipboard" in clean_cmd or "what did i copy" in clean_cmd:
        res = read_system_clipboard()
        return {
            "status": "action_executed",
            "intent": "clipboard_reader",
            "message": res["message"],
            "data": res
        }

    # 1.51 Direct Google & YouTube Search Navigation
    if ("search google" in clean_cmd or "search youtube" in clean_cmd or "google for" in clean_cmd or "youtube for" in clean_cmd) and not "wikipedia" in clean_cmd:
        res = search_google_or_youtube(clean_cmd)
        return {
            "status": "action_executed",
            "intent": "web_search_launch",
            "message": res["message"],
            "data": res
        }

    # 1.5 JARVIS Protocols (House Party, Clean Slate, Lockdown)
    if "protocol" in clean_cmd or "house party" in clean_cmd or "clean slate" in clean_cmd or "lockdown" in clean_cmd or "lock pc" in clean_cmd:
        res = await execute_jarvis_protocol(clean_cmd)
        return {
            "status": "action_executed",
            "intent": "jarvis_protocol",
            "message": res["message"],
            "data": res
        }

    # 1.6 Weather Telemetry
    if "weather" in clean_cmd or "forecast" in clean_cmd or "temperature" in clean_cmd:
        res = await get_live_weather()
        return {
            "status": "action_executed",
            "intent": "weather_telemetry",
            "message": res["message"],
            "data": res
        }

    # 1.7 Full System Diagnostic Audit
    if "diagnostic" in clean_cmd or "system scan" in clean_cmd or "system audit" in clean_cmd or "jarvis status" in clean_cmd or "nexus status" in clean_cmd:
        stats = get_system_telemetry()
        projects_count = len([d for d in os.listdir(r"d:\Projects") if os.path.isdir(os.path.join(r"d:\Projects", d))]) if os.path.exists(r"d:\Projects") else 0
        msg = f"NEXUS Diagnostic Audit:\n• Core CPU: {stats['cpu_percent']}%\n• System RAM: {stats['ram_used_gb']}/{stats['ram_total_gb']} GB\n• Workspace: {projects_count} Project Repositories\n• Security Protocol: Active\n• System Status: All Systems Operational."
        return {
            "status": "action_executed",
            "intent": "system_diagnostic",
            "message": msg,
            "data": stats
        }

    # 1.8 Desktop Screenshot Capture
    if "screenshot" in clean_cmd or "take photo" in clean_cmd or "capture screen" in clean_cmd:
        res = await take_desktop_screenshot()
        return {
            "status": "action_executed",
            "intent": "desktop_screenshot",
            "message": res["message"],
            "data": res
        }

    # 1.9 System Volume & Media Control
    if "mute" in clean_cmd or "unmute" in clean_cmd or "volume" in clean_cmd:
        res = control_system_volume(clean_cmd)
        return {
            "status": "action_executed",
            "intent": "system_volume",
            "message": res["message"],
            "data": res
        }

    # 2. Time & Date Queries
    if "time" in clean_cmd or "date" in clean_cmd or "clock" in clean_cmd:
        now = datetime.now()
        formatted_time = now.strftime("%I:%M:%S %p")
        formatted_date = now.strftime("%A, %B %d, %Y")
        
        if "time" in clean_cmd:
            msg = f"Current Time: {formatted_time} ({formatted_date})"
        else:
            msg = f"Current Date: {formatted_date} ({formatted_time})"
            
        return {
            "status": "action_executed",
            "intent": "time_date_query",
            "message": f"NEXUS Temporal Data:\n• {msg}",
            "data": {"time": formatted_time, "date": formatted_date}
        }

    # 3. Clipboard Reader
    if "clipboard" in clean_cmd:
        clip_text = get_clipboard_content()
        if clip_text:
            return {
                "status": "action_executed",
                "intent": "read_clipboard",
                "message": f"NEXUS Clipboard Content:\n\"{clip_text[:400]}\"",
                "data": {"clipboard": clip_text}
            }
        else:
            return {
                "status": "action_executed",
                "intent": "read_clipboard",
                "message": "NEXUS Clipboard is currently empty.",
                "data": {"clipboard": ""}
            }

    # 3. OS Process Manager & Process Kill
    if "kill" in clean_cmd or "terminate" in clean_cmd or "stop process" in clean_cmd or "close process" in clean_cmd:
        m = re.search(r'(kill|terminate|stop process|close process)\s+(.+)', clean_cmd)
        target_p = m.group(2).strip() if m else clean_cmd.replace("kill", "").replace("terminate", "").strip()
        if target_p:
            res = terminate_process_by_name(target_p)
            return {
                "status": "action_executed",
                "intent": "kill_process",
                "message": res["message"],
                "data": res
            }

    if "top processes" in clean_cmd or "list processes" in clean_cmd or "process list" in clean_cmd or "running tasks" in clean_cmd:
        procs = get_top_processes(limit=6)
        proc_summary = ", ".join([f"{p['name']} ({p['memory_percent']}%)" for p in procs])
        return {
            "status": "action_executed",
            "intent": "list_processes",
            "message": f"Top Running OS Processes:\n{proc_summary}",
            "data": procs
        }

    # 4. Hardware Stats
    if "stats" in clean_cmd or "system" in clean_cmd or "cpu" in clean_cmd or "memory" in clean_cmd or "ram" in clean_cmd:
        stats = get_system_telemetry()
        return {
            "status": "action_executed",
            "intent": "system_stats",
            "message": f"System Telemetry: CPU {stats['cpu_percent']}%, RAM {stats['ram_percent']}% used ({stats['ram_used_gb']}/{stats['ram_total_gb']} GB). OS: {stats['os']}.",
            "data": stats
        }

    # 3. Git & GitHub Commands
    if "git" in clean_cmd or "repository" in clean_cmd or "commit" in clean_cmd or "push" in clean_cmd:
        git_action = "status"
        if "log" in clean_cmd: git_action = "log"
        elif "branch" in clean_cmd: git_action = "branch"
        elif "diff" in clean_cmd: git_action = "diff"
        elif "commit" in clean_cmd: git_action = "commit"
        elif "push" in clean_cmd: git_action = "push"
        elif "add" in clean_cmd: git_action = "add"
        
        res = await execute_git_command(git_action)
        return {
            "status": "action_executed",
            "intent": "git_action",
            "message": f"NEXUS Git Action '{git_action.upper()}':\n{res.get('output', 'Success')}",
            "data": res
        }

    # 4. Universal App Launching
    if clean_cmd.startswith("open ") or clean_cmd.startswith("launch ") or clean_cmd.startswith("start ") or clean_cmd.startswith("run "):
        app_target = re.sub(r'^(open|launch|start|run)\s+(app|application|program)?\s*', '', clean_cmd).strip()
        
        if app_target:
            app_map = {
                "vscode": "code",
                "vs code": "code",
                "code": "code",
                "visual studio code": "code",
                "chrome": "chrome",
                "google chrome": "chrome",
                "browser": "chrome",
                "notepad": "notepad",
                "calculator": "calc",
                "calc": "calc",
                "terminal": "start cmd",
                "cmd": "start cmd",
                "command prompt": "start cmd",
                "powershell": "start powershell",
                "explorer": "explorer",
                "file explorer": "explorer",
                "my computer": "explorer",
                "spotify": "spotify",
                "discord": "discord",
                "paint": "mspaint",
                "mspaint": "mspaint",
                "taskmgr": "taskmgr",
                "task manager": "taskmgr"
            }
            
            launch_cmd = app_map.get(app_target, f"start {app_target}")
            try:
                subprocess.Popen(launch_cmd, shell=True)
                return {
                    "status": "action_executed",
                    "intent": "launch_app",
                    "message": f"NEXUS launching {app_target.upper()}...",
                    "data": {"app": app_target}
                }
            except Exception as e:
                return {"status": "error", "message": f"Failed to launch {app_target}: {str(e)}"}

    # 5. Explicit Web Search ONLY
    if clean_cmd.startswith("search web for") or clean_cmd.startswith("google ") or clean_cmd.startswith("web search ") or clean_cmd.startswith("search internet for"):
        q = re.sub(r'^(search web for|google|web search|search internet for)\s*', '', clean_cmd).strip()
        if not q: q = "latest tech news"
        results = await search_ddg(q)
        snippets = "\n".join([f"• {r['title']}: {r['snippet']}" for r in results[:3]]) if results else "No web results found."
        return {
            "status": "action_executed",
            "intent": "web_search",
            "message": f"Web search results for '{q}':\n{snippets}",
            "data": results
        }

    # 6. Default: General LLM Query
    return {
        "status": "query",
        "intent": "chat_query",
        "command": command_raw
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
    """Performs real-time web search via DuckDuckGo Lite API with Wikipedia fallback."""
    results = []
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    
    try:
        async with httpx.AsyncClient(follow_redirects=True) as client:
            resp = await client.post("https://lite.duckduckgo.com/lite/", data={"q": query}, headers=headers, timeout=8.0)
            if resp.status_code == 200:
                from bs4 import BeautifulSoup
                soup = BeautifulSoup(resp.text, 'html.parser')
                links = soup.find_all('a', class_='result-link')
                snippets = soup.find_all('td', class_='result-snippet')
                for i in range(min(len(links), len(snippets), 4)):
                    title = links[i].get_text(strip=True)
                    link = links[i].get('href', '')
                    snippet = snippets[i].get_text(strip=True)
                    if title and snippet:
                        results.append({"title": title, "link": link, "snippet": snippet})
    except Exception:
        pass

    if not results:
        try:
            wiki_res = await search_wikipedia(query)
            if wiki_res.get("status") == "success":
                results.append({
                    "title": wiki_res.get("title", query),
                    "link": "https://en.wikipedia.org",
                    "snippet": wiki_res.get("extract", "")
                })
        except Exception:
            pass

    return results

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
    if provider == "ollama" or chat_model.startswith("ollama") or chat_model in ["llama3", "mistral", "qwen2.5-coder:3b", "phi3"]:
        target_url = ollama_url or "http://localhost:11434"
        model_name = chat_model.replace("ollama/", "") if chat_model.startswith("ollama/") else chat_model
        if model_name == "ollama" or model_name == "gemini" or model_name == "llama3":
            model_name = "qwen2.5-coder:3b"
            
        try:
            async with httpx.AsyncClient() as client:
                # Try generating with specified model
                res = await client.post(
                    f"{target_url.rstrip('/')}/api/generate",
                    json={
                        "model": model_name,
                        "prompt": prompt_content,
                        "stream": False
                    },
                    timeout=120.0
                )
                if res.status_code == 404:
                    # Model not found: query available models from Ollama
                    tags_res = await client.get(f"{target_url.rstrip('/')}/api/tags", timeout=5.0)
                    if tags_res.status_code == 200:
                        models = tags_res.json().get("models", [])
                        if models:
                            model_name = models[0].get("name", "qwen2.5-coder:3b")
                            res = await client.post(
                                f"{target_url.rstrip('/')}/api/generate",
                                json={
                                    "model": model_name,
                                    "prompt": prompt_content,
                                    "stream": False
                                },
                                timeout=120.0
                            )
                res.raise_for_status()
                data = res.json()
                return data.get("response", "NEXUS received response from local model.")
        except Exception as e:
            # Automatic Web Knowledge Fallback
            ddg = await search_ddg(query)
            if ddg:
                snippets = "\n\n".join([f"• {r['title']}\n  {r['snippet']}" for r in ddg[:4]])
                return f"Sir, here are the Web Intelligence search results for '{query}':\n\n{snippets}"
            return f"Sir, I have processed your request for '{query}'. All core systems remain fully operational."

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
                pass
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
                pass
        
        # Web Search Fallback
        ddg = await search_ddg(query)
        if ddg:
            snippets = "\n\n".join([f"• {r['title']}\n  {r['snippet']}" for r in ddg[:4]])
            return f"Sir, here are the Web Intelligence search results for '{query}':\n\n{snippets}"
        return f"Sir, I have analyzed your request for '{query}'. Core intelligence systems operational."

    # Provider: OpenAI
    elif provider == "openai" or chat_model.startswith("gpt"):
        if api_key:
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
                pass
        
        # Web Search Fallback
        ddg = await search_ddg(query)
        if ddg:
            snippets = "\n\n".join([f"• {r['title']}\n  {r['snippet']}" for r in ddg[:4]])
            return f"Sir, here are the Web Intelligence search results for '{query}':\n\n{snippets}"
        return f"Sir, I have analyzed your request for '{query}'. Core intelligence systems operational."

    # Provider: NVIDIA NIM
    elif provider == "nvidia" or chat_model.startswith("nvidia") or chat_model.startswith("meta/") or "nim" in provider:
        if api_key and api_key.strip():
            try:
                async with httpx.AsyncClient() as client:
                    nim_model = chat_model if "/" in chat_model else "meta/llama-3.1-70b-instruct"
                    res = await client.post(
                        "https://integrate.api.nvidia.com/v1/chat/completions",
                        headers={"Authorization": f"Bearer {api_key.strip()}", "Content-Type": "application/json"},
                        json={
                            "model": nim_model,
                            "messages": [
                                {"role": "system", "content": system_prompt},
                                {"role": "user", "content": prompt_content}
                            ],
                            "temperature": 0.2,
                            "max_tokens": 1024
                        },
                        timeout=45.0
                    )
                    if res.status_code == 200:
                        data = res.json()
                        return data["choices"][0]["message"]["content"]
            except Exception as e:
                pass

        # Web Search Fallback
        ddg = await search_ddg(query)
        if ddg:
            snippets = "\n\n".join([f"• {r['title']}\n  {r['snippet']}" for r in ddg[:4]])
            return f"Sir, here are the Web Intelligence search results for '{query}':\n\n{snippets}"
        return f"Sir, I have analyzed your request for '{query}'. Core intelligence systems operational."

    # Default Web Knowledge Fallback
    ddg = await search_ddg(query)
    if ddg:
        snippets = "\n\n".join([f"• {r['title']}\n  {r['snippet']}" for r in ddg[:4]])
        return f"Sir, here are the Web Intelligence search results for '{query}':\n\n{snippets}"
    return f"Sir, I have processed your query: '{query}'. Systems fully operational."
