/**
 * NEXUS // STARK INDUSTRIES TACTICAL HUD CONTROLLER
 * Architecture: Autonomous Voice Core, Live Telemetry Poller, 
 * Real-Time Event Log Terminal, Multi-Layer Arc Reactor Canvas Engine.
 */

let isVoiceActive = false;
let isSpeaking = false;
let isProcessing = false;
let recognition = null;
let synth = window.speechSynthesis;
let uptimeSeconds = 0;

// Panel visibility states
let isLeftPanelOpen = true;
let isRightPanelOpen = true;

document.addEventListener("DOMContentLoaded", () => {
    initStarkHUD();
});

function initStarkHUD() {
    setupKeyboardAndMouseListeners();
    loadSavedEngineConfig();
    initSpeechRecognition();
    initBackgroundCanvas();
    initArcReactorCanvas();
    startUptimeTimer();

    // Initial Telemetry & Diagnostics
    fetchTelemetry();
    fetchNetworkPing();
    fetchProcessList();
    fetchWorkspaceProjects();
    fetchNotesList();

    // Periodic Polling
    setInterval(fetchTelemetry, 6000);
    setInterval(fetchNetworkPing, 15000);

    logEvent("SYS", "NEXUS Core Mk-VII Online. All telemetry sensors connected.");

    // Auto-activate voice mode after short boot delay
    setTimeout(() => {
        if (recognition && !isVoiceActive) {
            toggleVoiceMode();
        }
    }, 600);
}

/* ==========================================================================
   1. KEYBOARD & EVENT LISTENERS
   ========================================================================== */
function setupKeyboardAndMouseListeners() {
    // Arc Reactor Click
    const core = document.getElementById("arc-reactor-core");
    if (core) {
        core.addEventListener("click", toggleVoiceMode);
    }

    // Command Form Submit
    const cmdForm = document.getElementById("cmd-form");
    if (cmdForm) {
        cmdForm.addEventListener("submit", handleCommandSubmit);
    }

    // Global Tactical Keyboard Shortcuts
    document.addEventListener("keydown", (e) => {
        const isInputActive = document.activeElement && (
            document.activeElement.tagName === "INPUT" || 
            document.activeElement.tagName === "TEXTAREA" || 
            document.activeElement.tagName === "SELECT"
        );

        // Spacebar: Toggle Voice Mode (when not typing)
        if ((e.code === "Space" || e.key === " " || e.keyCode === 32) && !isInputActive) {
            e.preventDefault();
            toggleVoiceMode();
        }

        // 'L': Toggle Left Telemetry Panel
        if ((e.key === "l" || e.key === "L") && !isInputActive) {
            toggleTelemetryPanel();
        }

        // 'R': Toggle Right Automation Panel
        if ((e.key === "r" || e.key === "R") && !isInputActive) {
            toggleAutomationPanel();
        }

        // 'T' or '/': Toggle Quick Input Capsule
        if ((e.key === "/" || e.key === "t" || e.key === "T") && !isInputActive) {
            e.preventDefault();
            toggleQuickInput();
        }

        // 'Escape': Close response box or drawer
        if (e.key === "Escape") {
            closeStreamResponse();
            const drawer = document.getElementById("settings-drawer");
            if (drawer && drawer.style.display !== "none") {
                drawer.style.display = "none";
            }
            const telemDrawer = document.getElementById("telemetry-drawer");
            if (telemDrawer && telemDrawer.classList.contains("open")) {
                toggleTelemetryPanel();
            }
            const autoDrawer = document.getElementById("automation-drawer");
            if (autoDrawer && autoDrawer.classList.contains("open")) {
                toggleAutomationPanel();
            }
        }
    });

    // Provider select change
    const provSelect = document.getElementById("provider-select");
    if (provSelect) {
        provSelect.addEventListener("change", (e) => {
            const prov = e.target.value;
            const keyGroup = document.getElementById("key-field-group");
            const modelInput = document.getElementById("model-input");

            if (prov === "ollama") {
                keyGroup.style.display = "none";
                modelInput.value = "qwen2.5-coder:3b";
            } else if (prov === "gemini") {
                keyGroup.style.display = "block";
                modelInput.value = "gemini-1.5-flash";
            } else if (prov === "openai") {
                keyGroup.style.display = "block";
                modelInput.value = "gpt-4o-mini";
            } else if (prov === "nvidia") {
                keyGroup.style.display = "block";
                modelInput.value = "meta/llama-3.1-70b-instruct";
            }
        });
    }
}

/* ==========================================================================
   2. TACTICAL HUD EVENT LOG TERMINAL
   ========================================================================== */
function logEvent(type, message) {
    const stream = document.getElementById("activity-log-stream");
    if (!stream) return;

    const timeStr = new Date().toTimeString().split(' ')[0];
    const entry = document.createElement("div");
    entry.className = `log-entry log-${type.toLowerCase()}`;
    entry.innerText = `[${timeStr}] ${type}: ${message}`;

    stream.appendChild(entry);
    stream.scrollTop = stream.scrollHeight;
}

function clearEventLog() {
    const stream = document.getElementById("activity-log-stream");
    if (stream) {
        stream.innerHTML = '<div class="log-entry log-sys">[00:00:00] LOG TERMINAL BUFFER CLEARED.</div>';
    }
}

/* ==========================================================================
   3. UI PANEL TOGGLES & UPTIME
   ========================================================================== */
function toggleTelemetryPanel() {
    const drawer = document.getElementById("telemetry-drawer");
    const btn = document.getElementById("btn-toggle-telemetry");
    if (!drawer) return;
    drawer.classList.toggle("open");
    if (btn) btn.classList.toggle("active", drawer.classList.contains("open"));
}

function toggleAutomationPanel() {
    const drawer = document.getElementById("automation-drawer");
    const btn = document.getElementById("btn-toggle-automation");
    if (!drawer) return;
    drawer.classList.toggle("open");
    if (btn) btn.classList.toggle("active", drawer.classList.contains("open"));
}

function toggleQuickInput() {
    const capsule = document.getElementById("quick-input-capsule");
    if (capsule) {
        const isOpen = capsule.style.display !== "none";
        capsule.style.display = isOpen ? "none" : "block";
        if (!isOpen) {
            const input = document.getElementById("cmd-input");
            if (input) input.focus();
        }
    }
}

function toggleSettingsDrawer() {
    const drawer = document.getElementById("settings-drawer");
    if (drawer) {
        drawer.style.display = drawer.style.display === "none" ? "flex" : "none";
    }
}

function startUptimeTimer() {
    setInterval(() => {
        uptimeSeconds++;
        const hrs = String(Math.floor(uptimeSeconds / 3600)).padStart(2, '0');
        const mins = String(Math.floor((uptimeSeconds % 3600) / 60)).padStart(2, '0');
        const secs = String(uptimeSeconds % 60).padStart(2, '0');
        const el = document.getElementById("hud-uptime");
        if (el) el.innerText = `${hrs}:${mins}:${secs}`;
    }, 1000);
}

/* ==========================================================================
   4. TELEMETRY & SYSTEM METRICS POLLER
   ========================================================================== */
async function fetchTelemetry() {
    try {
        const res = await fetch("/api/system/stats");
        const stats = await res.json();

        // Topbar
        document.getElementById("hdr-cpu").innerText = `CPU ${stats.cpu_percent}%`;
        document.getElementById("hdr-ram").innerText = `RAM ${stats.ram_used_gb}/${stats.ram_total_gb}GB`;
        if (stats.battery && stats.battery.percent !== undefined) {
            document.getElementById("hdr-bat").innerText = `BAT ${stats.battery.percent}%`;
        }

        // Left Panel Diagnostics
        document.getElementById("diag-cpu-val").innerText = `${stats.cpu_percent}%`;
        document.getElementById("diag-cpu-bar").style.width = `${Math.min(stats.cpu_percent, 100)}%`;
        document.getElementById("diag-cpu-meta").innerText = `Logical Cores: ${stats.cpu_count} // Architecture: ${stats.architecture || 'x64'}`;

        document.getElementById("diag-ram-val").innerText = `${stats.ram_used_gb} / ${stats.ram_total_gb} GB`;
        document.getElementById("diag-ram-bar").style.width = `${Math.min(stats.ram_percent, 100)}%`;
        document.getElementById("diag-ram-pct").innerText = `Utilization: ${stats.ram_percent}%`;

        document.getElementById("diag-disk-val").innerText = `${stats.disk_percent}%`;
        document.getElementById("diag-disk-bar").style.width = `${Math.min(stats.disk_percent, 100)}%`;
        document.getElementById("diag-disk-meta").innerText = `Total Volume: ${stats.disk_total_gb} GB`;

    } catch (err) {}
}

async function fetchNetworkPing() {
    try {
        const res = await fetch("/api/system/ping");
        const data = await res.json();
        const el = document.getElementById("hud-ping");
        if (el && data.latency !== undefined) {
            el.innerText = `PING ${data.latency}ms`;
        }
    } catch (err) {}
}

async function fetchProcessList() {
    const box = document.getElementById("proc-list-box");
    if (!box) return;
    try {
        const res = await fetch("/api/system/processes");
        const procs = await res.json();
        box.innerHTML = "";
        procs.slice(0, 6).forEach(p => {
            const row = document.createElement("div");
            row.className = "proc-row";
            row.innerHTML = `
                <span class="proc-name" title="${p.name}">${p.name}</span>
                <span class="proc-mem">${p.memory_percent}%</span>
                <button class="proc-kill-tag" onclick="killTargetProcess('${p.pid}')">KILL</button>
            `;
            box.appendChild(row);
        });
    } catch (err) {
        box.innerHTML = '<div class="stream-empty">Process inspection offline.</div>';
    }
}

async function killTargetProcess(pidOrName) {
    try {
        const res = await fetch("/api/system/process/kill", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: pidOrName })
        });
        const data = await res.json();
        logEvent("PROC", data.message || `Terminated PID: ${pidOrName}`);
        fetchProcessList();
    } catch (err) {
        logEvent("WARN", `Process kill failed: ${err.message}`);
    }
}

async function fetchWorkspaceProjects() {
    const box = document.getElementById("project-list-box");
    if (!box) return;
    try {
        const res = await fetch("/api/workspace/projects");
        const data = await res.json();
        box.innerHTML = "";
        if (data.projects && data.projects.length > 0) {
            data.projects.slice(0, 6).forEach(p => {
                const item = document.createElement("div");
                item.className = "project-item";
                item.onclick = () => executeQuickIntent(`open ${p.name}`);
                item.innerHTML = `
                    <span class="proj-name"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px; vertical-align:-1px;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>${p.name}</span>
                    ${p.isGit ? '<span class="git-badge">GIT</span>' : ''}
                `;
                box.appendChild(item);
            });
        } else {
            box.innerHTML = '<div class="stream-empty">No projects in d:\\Projects.</div>';
        }
    } catch (err) {
        box.innerHTML = '<div class="stream-empty">Workspace offline.</div>';
    }
}

async function fetchNotesList() {
    const box = document.getElementById("notes-list-box");
    if (!box) return;
    try {
        const res = await fetch("/api/notes");
        const data = await res.json();
        box.innerHTML = "";
        if (data.message && data.message.includes("•")) {
            const lines = data.message.split("\n").filter(l => l.startsWith("•"));
            lines.forEach(line => {
                const card = document.createElement("div");
                card.className = "note-card";
                card.innerText = line.replace("•", "").trim();
                box.appendChild(card);
            });
        } else {
            box.innerHTML = '<div class="stream-empty">No active notes saved.</div>';
        }
    } catch (err) {
        box.innerHTML = '<div class="stream-empty">Notes offline.</div>';
    }
}

async function clearAllNotes() {
    try {
        await fetch("/api/notes", { method: "DELETE" });
        logEvent("NOTE", "Memory notes buffer cleared.");
        fetchNotesList();
    } catch (err) {}
}

/* ==========================================================================
   5. STARK INTERFACE AUDIO CHIMES (WEB AUDIO API)
   ========================================================================== */
function playStarkSound(type) {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        gain.gain.setValueAtTime(0.04, ctx.currentTime);

        if (type === "activate") {
            osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
            osc.frequency.exponentialRampToValueAtTime(1174.66, ctx.currentTime + 0.12); // D6
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        } else if (type === "deactivate") {
            osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
            osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.12); // A4
            gain.gain.exponentialRampToTime(0.001, ctx.currentTime + 0.15);
        } else if (type === "action") {
            osc.frequency.setValueAtTime(1046.50, ctx.currentTime); // C6
            osc.frequency.exponentialRampToValueAtTime(1318.51, ctx.currentTime + 0.08); // E6
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
        }

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.16);
    } catch (e) {}
}

/* ==========================================================================
   6. VOICE ENGINE & SPEECH RECOGNITION
   ========================================================================== */
function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        updateReactorState("OFFLINE", "Speech API not supported in this browser");
        return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
        if (isSpeaking || isProcessing) return;
        const last = event.results.length - 1;
        const text = event.results[last][0].transcript.trim();
        if (text) {
            handleVoiceIntent(text);
        }
    };

    recognition.onerror = (event) => {
        if (event.error !== "no-speech" && event.error !== "aborted") {
            isProcessing = false;
            if (isVoiceActive) {
                try { recognition.start(); } catch (e) {}
            }
        }
    };

    recognition.onend = () => {
        if (isVoiceActive && !isSpeaking && !isProcessing) {
            try { recognition.start(); } catch (e) {}
        }
    };
}

function toggleVoiceMode() {
    isVoiceActive = !isVoiceActive;

    if (isVoiceActive) {
        playStarkSound("activate");
        logEvent("VOICE", "Voice Mode Activated. Listening for user queries...");
        if (!isProcessing && !isSpeaking) {
            updateReactorState("LISTENING", "Listening for command or query...");
            try { recognition.start(); } catch (e) {}
        }
    } else {
        playStarkSound("deactivate");
        logEvent("VOICE", "Voice Mode Standby.");
        updateReactorState("STANDBY", "Press Spacebar or Click Arc Reactor to speak");
        if (recognition) recognition.stop();
        if (synth) synth.cancel();
    }
}

function updateReactorState(state, transcriptText) {
    const stateEl = document.getElementById("nexus-state");
    const transcriptEl = document.getElementById("nexus-transcript");

    if (stateEl) stateEl.innerText = state;
    if (transcriptEl && transcriptText) transcriptEl.innerText = transcriptText;

    if (stateEl) {
        if (state === "LISTENING") stateEl.style.color = "#00f0ff";
        else if (state === "THINKING") stateEl.style.color = "#ffaa00";
        else if (state === "SPEAKING") stateEl.style.color = "#00ffaa";
        else stateEl.style.color = "#64748b";
    }
}

async function handleVoiceIntent(cmdText) {
    if (!cmdText || isSpeaking || isProcessing) return;

    isProcessing = true;
    if (recognition) {
        try { recognition.stop(); } catch (e) {}
    }

    updateReactorState("THINKING", `Processing: "${cmdText}"`);
    logEvent("INTENT", `Query Received: "${cmdText}"`);

    try {
        const res = await fetch("/api/voice/intent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ command: cmdText })
        });
        const data = await res.json();

        if (data.status === "action_executed") {
            logEvent("EXEC", `Intent: ${data.intent} -> SUCCESS`);
            displayStreamResponse(`NEXUS // ${data.intent.toUpperCase()}`, data.message);
            speakText(data.message);
            fetchTelemetry();
            fetchNotesList();
        } else {
            // General Intelligence Fallback to LLM Stream
            logEvent("AI", `Routing query to Intelligence Core...`);
            streamChatResponse(cmdText);
        }
    } catch (err) {
        logEvent("WARN", `Intent Error: ${err.message}`);
        streamChatResponse(cmdText);
    }
}

function executeQuickIntent(cmdText) {
    playStarkSound("action");
    handleVoiceIntent(cmdText);
}

/* ==========================================================================
   7. CHAT STREAMING & RESPONSE HUD
   ========================================================================== */
async function streamChatResponse(query) {
    const streamBox = document.getElementById("response-stream-box");
    const streamRole = document.getElementById("stream-role");
    const streamText = document.getElementById("stream-text");

    streamBox.style.display = "block";
    streamRole.innerText = "NEXUS // COMPUTE CORE";
    streamText.innerText = "";
    updateReactorState("THINKING", "Synthesizing intelligence response...");

    const provider = document.getElementById("provider-select").value;
    const apiKey = document.getElementById("api-key-input").value;
    const model = document.getElementById("model-input").value;

    try {
        const res = await fetch("/api/stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                query: query,
                provider: provider,
                apiKey: apiKey,
                chatModel: model
            })
        });

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = "";

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n");

            for (const line of lines) {
                if (line.startsWith("data: ")) {
                    const dataStr = line.slice(6).trim();
                    if (!dataStr || dataStr === "{}") continue;
                    try {
                        const token = JSON.parse(dataStr);
                        if (typeof token === "string") {
                            fullResponse += token;
                            streamText.innerText = fullResponse;
                        }
                    } catch (e) {}
                }
            }
        }

        logEvent("AI", `Response Generated (${fullResponse.length} chars)`);
        speakText(fullResponse);

    } catch (err) {
        streamText.innerText = "Execution Error: " + err.message;
        updateReactorState("STANDBY", "Error occurred during execution");
        isProcessing = false;
        if (isVoiceActive && recognition) {
            try { recognition.start(); } catch (e) {}
        }
    }
}

function displayStreamResponse(role, text) {
    const streamBox = document.getElementById("response-stream-box");
    const streamRole = document.getElementById("stream-role");
    const streamText = document.getElementById("stream-text");

    if (!text || !text.trim()) {
        streamBox.style.display = "none";
        return;
    }

    streamBox.style.display = "block";
    streamRole.innerText = role;
    streamText.innerText = text;
}

function closeStreamResponse() {
    const streamBox = document.getElementById("response-stream-box");
    if (streamBox) streamBox.style.display = "none";
    if (synth) synth.cancel();
    isSpeaking = false;
    isProcessing = false;
    if (isVoiceActive && recognition) {
        try { recognition.start(); } catch (e) {}
    }
}

function copyStreamResponse() {
    const text = document.getElementById("stream-text").innerText;
    if (text) {
        navigator.clipboard.writeText(text);
        logEvent("CLIP", "Response copied to system clipboard.");
    }
}

/* ==========================================================================
   8. SPEECH SYNTHESIS (DEEP MALE VOICE)
   ========================================================================== */
function getMaleVoice() {
    if (!synth) return null;
    const voices = synth.getVoices();
    if (!voices || voices.length === 0) return null;

    const maleNames = ["david", "george", "mark", "male", "guy", "alex", "daniel", "james"];
    for (const name of maleNames) {
        const found = voices.find(v => v.name.toLowerCase().includes(name));
        if (found) return found;
    }

    return voices.find(v => v.lang.startsWith("en")) || voices[0];
}

function speakText(text) {
    if (!synth) {
        isProcessing = false;
        return;
    }
    synth.cancel();

    // Remove markdown symbols for speech synthesis
    const cleanSpeech = text
        .replace(/[#*_`~\[\]\(\)]/g, '')
        .replace(/•/g, '')
        .replace(/\n+/g, '. ');

    const utterance = new SpeechSynthesisUtterance(cleanSpeech);
    
    const pitchSlider = document.getElementById("voice-pitch-slider");
    const rateSlider = document.getElementById("voice-rate-slider");

    utterance.pitch = pitchSlider ? parseFloat(pitchSlider.value) : 0.9;
    utterance.rate = rateSlider ? parseFloat(rateSlider.value) : 1.0;

    const maleVoice = getMaleVoice();
    if (maleVoice) {
        utterance.voice = maleVoice;
    }

    utterance.onstart = () => {
        isSpeaking = true;
        updateReactorState("SPEAKING", "Speaking response...");
    };

    utterance.onend = () => {
        isSpeaking = false;
        isProcessing = false;
        if (isVoiceActive) {
            updateReactorState("LISTENING", "Listening for command or query...");
            if (recognition) {
                try { recognition.start(); } catch (e) {}
            }
        } else {
            updateReactorState("STANDBY", "Press Spacebar or Click Arc Reactor to speak");
        }
    };

    utterance.onerror = () => {
        isSpeaking = false;
        isProcessing = false;
        if (isVoiceActive && recognition) {
            try { recognition.start(); } catch (e) {}
        }
    };

    synth.speak(utterance);
}

/* ==========================================================================
   9. AUTOMATION ACTIONS (LAUNCH APPS, GIT, SECURITY AUDIT)
   ========================================================================== */
async function launchApp(appName) {
    playStarkSound("action");
    try {
        const res = await fetch("/api/system/launch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ appName: appName })
        });
        const data = await res.json();
        logEvent("LAUNCH", data.message || `Launched: ${appName.toUpperCase()}`);
        displayStreamResponse("NEXUS LAUNCHER", data.message || `Launched ${appName}`);
    } catch (err) {
        logEvent("WARN", `Launch failed: ${err.message}`);
    }
}

async function executeGitAction(action) {
    playStarkSound("action");
    logEvent("GIT", `Executing: git ${action}...`);
    try {
        const res = await fetch("/api/git/action", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: action })
        });
        const data = await res.json();
        displayStreamResponse(`GIT // ${action.toUpperCase()}`, data.output || "Git command executed.");
    } catch (err) {
        logEvent("WARN", `Git error: ${err.message}`);
    }
}

async function runWorkspaceSecurityAudit() {
    playStarkSound("action");
    logEvent("SEC", "Initiating workspace security audit...");
    try {
        const res = await fetch("/api/security/audit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scanWorkspace: true })
        });
        const data = await res.json();
        const scoreEl = document.getElementById("sec-score-val");
        if (scoreEl) scoreEl.innerText = `${data.securityScore} / 100`;

        const msg = `Security Audit Completed.\n• Integrity Score: ${data.securityScore}/100\n• Files Scanned: ${data.scannedFilesCount}\n• Vulnerabilities: ${data.vulnerabilities.length}`;
        displayStreamResponse("SECURITY AUDIT", msg);
        logEvent("SEC", `Audit complete. Score: ${data.securityScore}/100`);
    } catch (err) {
        logEvent("WARN", `Security audit error: ${err.message}`);
    }
}

function handleCommandSubmit(e) {
    e.preventDefault();
    const input = document.getElementById("cmd-input");
    const query = input.value.trim();
    if (!query) return;

    input.value = "";
    handleVoiceIntent(query);
}

/* ==========================================================================
   10. CONFIGURATION PERSISTENCE
   ========================================================================== */
function saveEngineConfig() {
    const prov = document.getElementById("provider-select").value;
    const key = document.getElementById("api-key-input").value;
    const model = document.getElementById("model-input").value;

    localStorage.setItem("nexus_provider", prov);
    localStorage.setItem("nexus_api_key", key);
    localStorage.setItem("nexus_model", model);

    const msg = document.getElementById("save-status-msg");
    msg.innerText = "[OK] CONFIGURATION SAVED";
    msg.style.display = "block";
    logEvent("CFG", `Engine config saved: ${prov.toUpperCase()} // ${model}`);
    setTimeout(() => { msg.style.display = "none"; }, 2500);
}

function loadSavedEngineConfig() {
    const prov = localStorage.getItem("nexus_provider");
    const key = localStorage.getItem("nexus_api_key");
    const model = localStorage.getItem("nexus_model");

    if (prov) {
        document.getElementById("provider-select").value = prov;
        const keyGroup = document.getElementById("key-field-group");
        keyGroup.style.display = prov === "ollama" ? "none" : "block";
    }
    if (key) {
        document.getElementById("api-key-input").value = key;
    }
    if (model) {
        document.getElementById("model-input").value = model;
    }
}

/* ==========================================================================
   11. MULTI-LAYER STARK ARC REACTOR CANVAS ENGINE (60 FPS)
   ========================================================================== */
function initArcReactorCanvas() {
    const canvas = document.getElementById("arc-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const dpi = window.devicePixelRatio || 2;
    canvas.width = 440 * dpi;
    canvas.height = 440 * dpi;

    let angle = 0;

    function render() {
        // Reset matrix to avoid compounding scale bugs
        ctx.setTransform(dpi, 0, 0, dpi, 0, 0);
        ctx.clearRect(0, 0, 440, 440);

        const cx = 220;
        const cy = 220;

        // 1. Outer Turbine Calibration Ring (Rotating Clockwise)
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle * 0.15);
        
        // Outer boundary circle
        ctx.strokeStyle = "rgba(56, 189, 248, 0.25)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, 208, 0, Math.PI * 2);
        ctx.stroke();

        // 60 Azimuth Ticks
        for (let i = 0; i < 60; i++) {
            const rot = (i / 60) * Math.PI * 2;
            const isMajor = i % 6 === 0;
            const isMedium = i % 2 === 0;
            const len = isMajor ? 12 : (isMedium ? 6 : 3);
            const r1 = 206;
            const r2 = r1 - len;

            ctx.strokeStyle = isMajor ? "#38bdf8" : (isMedium ? "rgba(56, 189, 248, 0.6)" : "rgba(56, 189, 248, 0.2)");
            ctx.lineWidth = isMajor ? 2.5 : 1;
            ctx.beginPath();
            ctx.moveTo(Math.cos(rot) * r1, Math.sin(rot) * r1);
            ctx.lineTo(Math.cos(rot) * r2, Math.sin(rot) * r2);
            ctx.stroke();

            // Outer node dots at major angles
            if (isMajor) {
                ctx.fillStyle = "#38bdf8";
                ctx.beginPath();
                ctx.arc(Math.cos(rot) * 192, Math.sin(rot) * 192, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();

        // 2. Ten Authentic Electromagnetic Copper Coil Transformer Blocks
        const numCoils = 10;
        const rOuter = 182;
        const rInner = 120;
        const arcHalfWidth = 0.22; // ~25.2 degrees span

        for (let i = 0; i < numCoils; i++) {
            const coilAngle = (i / numCoils) * Math.PI * 2;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(coilAngle);

            // Transformer Core Block Fill
            ctx.beginPath();
            ctx.arc(0, 0, rOuter, -arcHalfWidth, arcHalfWidth);
            ctx.arc(0, 0, rInner, arcHalfWidth, -arcHalfWidth, true);
            ctx.closePath();
            ctx.fillStyle = "rgba(12, 20, 40, 0.95)";
            ctx.fill();
            ctx.strokeStyle = "rgba(56, 189, 248, 0.6)";
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Copper Coil Windings (Concentric Gold/Amber Filament Lines)
            const numWindings = 5;
            ctx.strokeStyle = "rgba(245, 158, 11, 0.85)";
            ctx.lineWidth = 1.4;
            for (let w = 0; w < numWindings; w++) {
                const wAngle = -arcHalfWidth + (w + 1) * ((arcHalfWidth * 2) / (numWindings + 1));
                ctx.beginPath();
                ctx.moveTo(Math.cos(wAngle) * (rInner + 3), Math.sin(wAngle) * (rInner + 3));
                ctx.lineTo(Math.cos(wAngle) * (rOuter - 3), Math.sin(wAngle) * (rOuter - 3));
                ctx.stroke();
            }

            // Central Luminous Power Conduit Line
            const pulseGlow = Math.sin(angle * 3 + i) * 0.35 + 0.65;
            ctx.strokeStyle = `rgba(56, 189, 248, ${pulseGlow})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(rInner + 2, 0);
            ctx.lineTo(rOuter - 2, 0);
            ctx.stroke();

            // Central Core Specular Dot
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc((rInner + rOuter) / 2, 0, 2.5, 0, Math.PI * 2);
            ctx.fill();

            // Outer Mechanical Retention Clamp Bracket (Titanium Anchor)
            ctx.strokeStyle = "rgba(148, 163, 184, 0.8)";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, rOuter + 2, -arcHalfWidth * 0.45, arcHalfWidth * 0.45);
            ctx.stroke();

            ctx.restore();
        }

        // 3. Counter-Rotating Inner Turbine Ring (Rotating Counter-Clockwise)
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-angle * 0.35);
        for (let j = 0; j < 30; j++) {
            const rot = (j / 30) * Math.PI * 2;
            const r1 = 114;
            const r2 = 106;
            ctx.strokeStyle = "rgba(56, 189, 248, 0.6)";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(Math.cos(rot) * r1, Math.sin(rot) * r1);
            ctx.lineTo(Math.cos(rot) * r2, Math.sin(rot) * r2);
            ctx.stroke();
        }
        ctx.restore();

        // 4. Audio Frequency Oscilloscope Plasma Waves
        if (isSpeaking || isVoiceActive) {
            ctx.save();
            ctx.translate(cx, cy);
            const numBars = 48;
            const radius = 96;

            for (let i = 0; i < numBars; i++) {
                const barAngle = (i / numBars) * Math.PI * 2 + angle * 0.4;
                const dynamicHeight = isSpeaking 
                    ? (4 + Math.random() * 22) 
                    : (2 + Math.sin(angle * 4 + i) * 7);

                const x1 = Math.cos(barAngle) * radius;
                const y1 = Math.sin(barAngle) * radius;
                const x2 = Math.cos(barAngle) * (radius + dynamicHeight);
                const y2 = Math.sin(barAngle) * (radius + dynamicHeight);

                ctx.strokeStyle = isSpeaking ? "#10b981" : "rgba(56, 189, 248, 0.9)";
                ctx.lineWidth = 1.8;
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
            }
            ctx.restore();
        }

        // 5. Inner Concentric Power Ring & Radial Tri-Spoke Crystal Lines
        ctx.save();
        ctx.translate(cx, cy);
        ctx.strokeStyle = "rgba(56, 189, 248, 0.75)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 92, 0, Math.PI * 2);
        ctx.stroke();

        // 3 Radial Spoke Power Lines (120 deg apart)
        for (let s = 0; s < 3; s++) {
            const spokeAngle = (s / 3) * Math.PI * 2 + angle * 0.1;
            ctx.strokeStyle = "rgba(56, 189, 248, 0.5)";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(Math.cos(spokeAngle) * 40, Math.sin(spokeAngle) * 40);
            ctx.lineTo(Math.cos(spokeAngle) * 90, Math.sin(spokeAngle) * 90);
            ctx.stroke();
        }
        ctx.restore();

        angle += 0.015;
        requestAnimationFrame(render);
    }

    render();
}

/* ==========================================================================
   12. TACTICAL BACKGROUND CANVAS & PARTICLE ENGINE (60 FPS)
   ========================================================================== */
function initBackgroundCanvas() {
    const canvas = document.getElementById("bg-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    window.addEventListener("resize", () => {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
    });

    // 40 Floating Ambient Tactical Particles
    const particles = [];
    const numParticles = 40;
    for (let i = 0; i < numParticles; i++) {
        particles.push({
            x: Math.random() * width,
            y: Math.random() * height,
            vx: (Math.random() - 0.5) * 0.35,
            vy: (Math.random() - 0.5) * 0.35,
            size: Math.random() * 2 + 1,
            alpha: Math.random() * 0.45 + 0.15
        });
    }

    let bgAngle = 0;

    function renderBg() {
        ctx.clearRect(0, 0, width, height);

        const cx = width / 2;
        const cy = height / 2;

        // 1. Slow-Rotating Tactical Sonar Rings
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(bgAngle * 0.05);

        // Ring 1 (Radius 360)
        ctx.strokeStyle = "rgba(56, 189, 248, 0.08)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, 360, 0, Math.PI * 2);
        ctx.stroke();

        // Ring 2 (Radius 520) with dashed intervals
        ctx.strokeStyle = "rgba(56, 189, 248, 0.05)";
        ctx.setLineDash([8, 12]);
        ctx.beginPath();
        ctx.arc(0, 0, 520, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Ring 3 (Radius 680) with 8 Azimuth Compass Crosshair Notches
        ctx.strokeStyle = "rgba(56, 189, 248, 0.07)";
        for (let i = 0; i < 8; i++) {
            const rot = (i / 8) * Math.PI * 2;
            const r1 = 680;
            const r2 = 665;
            ctx.beginPath();
            ctx.moveTo(Math.cos(rot) * r1, Math.sin(rot) * r1);
            ctx.lineTo(Math.cos(rot) * r2, Math.sin(rot) * r2);
            ctx.stroke();
        }

        ctx.restore();

        // 2. Blueprint Grid Intersect Crosshairs (+)
        const gridStep = 200;
        const startX = (width % gridStep) / 2;
        const startY = (height % gridStep) / 2;

        ctx.strokeStyle = "rgba(56, 189, 248, 0.18)";
        ctx.lineWidth = 1;

        for (let x = startX; x < width; x += gridStep) {
            for (let y = startY; y < height; y += gridStep) {
                const arm = 4;
                ctx.beginPath();
                ctx.moveTo(x - arm, y);
                ctx.lineTo(x + arm, y);
                ctx.moveTo(x, y - arm);
                ctx.lineTo(x, y + arm);
                ctx.stroke();
            }
        }

        // 3. Floating Ambient Tactical Energy Particles
        for (let p of particles) {
            p.x += p.vx;
            p.y += p.vy;

            if (p.x < 0) p.x = width;
            if (p.x > width) p.x = 0;
            if (p.y < 0) p.y = height;
            if (p.y > height) p.y = 0;

            ctx.fillStyle = `rgba(56, 189, 248, ${p.alpha})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }

        bgAngle += 0.01;
        requestAnimationFrame(renderBg);
    }

    renderBg();
}
