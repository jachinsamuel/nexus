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
    initArcReactorCanvas();
    startUptimeTimer();

    // Initial Telemetry & Diagnostics
    fetchTelemetry();
    fetchNetworkPing();
    fetchProcessList();
    fetchWorkspaceProjects();
    fetchNotesList();
    probeLocalEngines();

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
    // Agent Emblem Click
    const emblem = document.getElementById("agent-emblem-stage") || document.getElementById("avatar-stage") || document.getElementById("voice-entity-core") || document.getElementById("arc-reactor-core");
    if (emblem) {
        emblem.addEventListener("click", toggleVoiceMode);
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
    const dockMic = document.getElementById("dock-mic-btn");

    if (stateEl) stateEl.innerText = state;
    if (transcriptEl && transcriptText) transcriptEl.innerText = transcriptText;

    const emblemStage = document.getElementById("agent-emblem-stage") || document.getElementById("avatar-stage") || document.getElementById("voice-entity-core");
    if (emblemStage) {
        emblemStage.classList.remove("listening", "thinking", "speaking");
        if (state === "LISTENING") emblemStage.classList.add("listening");
        else if (state === "THINKING") emblemStage.classList.add("thinking");
        else if (state === "SPEAKING") emblemStage.classList.add("speaking");
    }

    if (dockMic) {
        if (state === "LISTENING" || isVoiceActive) {
            dockMic.classList.add("active");
        } else {
            dockMic.classList.remove("active");
        }
    }

    if (stateEl) {
        if (state === "LISTENING") {
            stateEl.style.color = "var(--accent-emerald)";
            stateEl.style.borderColor = "rgba(16, 185, 129, 0.35)";
            stateEl.style.background = "rgba(16, 185, 129, 0.1)";
        } else if (state === "THINKING") {
            stateEl.style.color = "var(--accent-violet)";
            stateEl.style.borderColor = "rgba(139, 92, 246, 0.35)";
            stateEl.style.background = "rgba(139, 92, 246, 0.1)";
        } else if (state === "SPEAKING") {
            stateEl.style.color = "var(--accent-teal)";
            stateEl.style.borderColor = "rgba(45, 212, 191, 0.35)";
            stateEl.style.background = "rgba(45, 212, 191, 0.1)";
        } else {
            stateEl.style.color = "var(--accent-cyan)";
            stateEl.style.borderColor = "rgba(56, 189, 248, 0.25)";
            stateEl.style.background = "rgba(56, 189, 248, 0.08)";
        }
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
   11. ICONIC 3D ISOMETRIC GEOMETRIC AGENT EMBLEM (CODEX / CURSOR STYLE)
   ========================================================================== */
function initArcReactorCanvas() {
    const canvas = document.getElementById("emblem-canvas") || document.getElementById("avatar-optic-canvas") || document.getElementById("plasma-canvas") || document.getElementById("arc-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const dpi = window.devicePixelRatio || 2;
    const baseW = 360;
    const baseH = 360;
    canvas.width = baseW * dpi;
    canvas.height = baseH * dpi;

    let time = 0;
    let rotX = 0.45;
    let rotY = 0.3;
    let rotZ = 0.15;
    let coreRotY = 0;
    let coreRotX = 0;

    let mouseOffset = { x: 0, y: 0 };
    let smoothMouse = { x: 0, y: 0 };

    window.addEventListener("mousemove", (e) => {
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        mouseOffset.x = Math.max(-1, Math.min(1, (e.clientX - cx) / (cx || 1)));
        mouseOffset.y = Math.max(-1, Math.min(1, (e.clientY - cy) / (cy || 1)));
    });

    window.addEventListener("mouseleave", () => {
        mouseOffset.x = 0;
        mouseOffset.y = 0;
    });

    // Color interpolation
    let smoothColor = [56, 189, 248]; // Cyan
    const waveRings = [];

    // Precompute Trefoil Knot Geometry (Perfect 3-Lobe Centered Symmetry)
    const N = 120;
    const R = 38;
    const ribbonWidth = 13.5;
    const ribbonHeight = 5.8;

    const knotPoints = [];
    const tangents = [];

    for (let i = 0; i < N; i++) {
        const t = (i / N) * Math.PI * 2;
        const x = (Math.sin(t) + 2 * Math.sin(2 * t)) * R;
        const y = (Math.cos(t) - 2 * Math.cos(2 * t)) * R;
        const z = -Math.sin(3 * t) * 0.95 * R;
        knotPoints.push([x, y, z]);

        const dx = (Math.cos(t) + 4 * Math.cos(2 * t)) * R;
        const dy = (-Math.sin(t) + 4 * Math.sin(2 * t)) * R;
        const dz = -3 * Math.cos(3 * t) * 0.95 * R;
        const len = Math.hypot(dx, dy, dz) || 1;
        tangents.push([dx / len, dy / len, dz / len]);
    }

    function dot3(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }
    function cross3(a, b) {
        return [
            a[1]*b[2] - a[2]*b[1],
            a[2]*b[0] - a[0]*b[2],
            a[0]*b[1] - a[1]*b[0]
        ];
    }
    function norm3(v) {
        const l = Math.hypot(...v) || 1;
        return [v[0]/l, v[1]/l, v[2]/l];
    }
    function rotateAround(v, axis, angle) {
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        const d = dot3(axis, v);
        const c = cross3(axis, v);
        return [
            v[0] * cosA + c[0] * sinA + axis[0] * d * (1 - cosA),
            v[1] * cosA + c[1] * sinA + axis[1] * d * (1 - cosA),
            v[2] * cosA + c[2] * sinA + axis[2] * d * (1 - cosA)
        ];
    }

    // Parallel transport normals
    const normals = [];
    normals.push(norm3(cross3([0, 0, 1], tangents[0])));

    for (let i = 0; i < N - 1; i++) {
        const T1 = tangents[i];
        const T2 = tangents[i + 1];
        let A = cross3(T1, T2);
        const aLen = Math.hypot(...A);
        if (aLen < 1e-6) {
            normals.push(normals[i]);
        } else {
            A = [A[0]/aLen, A[1]/aLen, A[2]/aLen];
            const angle = Math.acos(Math.max(-1, Math.min(1, dot3(T1, T2))));
            normals.push(norm3(rotateAround(normals[i], A, angle)));
        }
    }

    // Twist holonomy correction to perfectly close the ribbon
    let Alast = cross3(tangents[N - 1], tangents[0]);
    let nFinal = normals[N - 1];
    const aLenLast = Math.hypot(...Alast);
    if (aLenLast >= 1e-6) {
        Alast = [Alast[0]/aLenLast, Alast[1]/aLenLast, Alast[2]/aLenLast];
        const angle = Math.acos(Math.max(-1, Math.min(1, dot3(tangents[N - 1], tangents[0]))));
        nFinal = norm3(rotateAround(normals[N - 1], Alast, angle));
    }
    const twistDiff = Math.atan2(dot3(cross3(nFinal, normals[0]), tangents[0]), dot3(nFinal, normals[0]));
    for (let i = 0; i < N; i++) {
        normals[i] = norm3(rotateAround(normals[i], tangents[i], (i / N) * twistDiff));
    }

    // Build base mesh slices
    const baseSlices = [];
    for (let i = 0; i < N; i++) {
        const p = knotPoints[i];
        const n = normals[i];
        const b = norm3(cross3(tangents[i], n));
        const w = ribbonWidth;
        const h = ribbonHeight;
        baseSlices.push([
            [p[0] + w*n[0] + h*b[0], p[1] + w*n[1] + h*b[1], p[2] + w*n[2] + h*b[2]],
            [p[0] - w*n[0] + h*b[0], p[1] - w*n[1] + h*b[1], p[2] - w*n[2] + h*b[2]],
            [p[0] - w*n[0] - h*b[0], p[1] - w*n[1] - h*b[1], p[2] - w*n[2] - h*b[2]],
            [p[0] + w*n[0] - h*b[0], p[1] + w*n[1] - h*b[1], p[2] + w*n[2] - h*b[2]]
        ]);
    }

    // Core Octahedron Vertices & Faces
    const coreRadius = 20;
    const coreVerts = [
        [0, 0, coreRadius],
        [0, 0, -coreRadius],
        [coreRadius, 0, 0],
        [-coreRadius, 0, 0],
        [0, coreRadius, 0],
        [0, -coreRadius, 0]
    ];
    const coreFaces = [
        [0, 2, 4], [0, 4, 3], [0, 3, 5], [0, 5, 2],
        [1, 4, 2], [1, 3, 4], [1, 5, 3], [1, 2, 5]
    ];

    // Light source & camera vectors
    const lightDir = norm3([-0.5, -0.65, 0.58]);
    const camDir = [0, 0, 1];
    const halfDir = norm3([lightDir[0] + camDir[0], lightDir[1] + camDir[1], lightDir[2] + camDir[2]]);

    function render() {
        ctx.setTransform(dpi, 0, 0, dpi, 0, 0);
        ctx.clearRect(0, 0, baseW, baseH);

        smoothMouse.x += (mouseOffset.x - smoothMouse.x) * 0.06;
        smoothMouse.y += (mouseOffset.y - smoothMouse.y) * 0.06;

        // Color target based on state
        let targetColor = [56, 189, 248]; // Cyan (Standby)
        let rotSpeed = 0.007;
        let scaleFactor = 1.0;

        if (isSpeaking) {
            targetColor = [45, 212, 191]; // Turquoise
            rotSpeed = 0.012;
            scaleFactor = 1.04 + Math.sin(time * 0.15) * 0.03;
        } else if (isProcessing) {
            targetColor = [168, 85, 247]; // Violet / Iris
            rotSpeed = 0.024;
            scaleFactor = 1.02 + Math.sin(time * 0.25) * 0.02;
        } else if (isVoiceActive) {
            targetColor = [16, 185, 129]; // Emerald
            rotSpeed = 0.009;
            scaleFactor = 1.05 + Math.sin(time * 0.08) * 0.02;
        }

        for (let i = 0; i < 3; i++) {
            smoothColor[i] += (targetColor[i] - smoothColor[i]) * 0.08;
        }
        const [cr, cg, cb] = smoothColor.map(Math.round);

        // Isometric 3D Rotation angles (Z-axis revolution preserves 3-lobe iconic silhouette)
        rotZ += rotSpeed;
        const curRotX = 0.58 + smoothMouse.y * 0.25 + (isProcessing ? Math.sin(time * 0.04) * 0.1 : 0);
        const curRotY = smoothMouse.x * 0.28;
        const curRotZ = rotZ;

        coreRotY -= 0.018;
        coreRotX += 0.012;

        const cosX = Math.cos(curRotX), sinX = Math.sin(curRotX);
        const cosY = Math.cos(curRotY), sinY = Math.sin(curRotY);
        const cosZ = Math.cos(curRotZ), sinZ = Math.sin(curRotZ);

        function project3D(pt, sc = 1.0) {
            const px = pt[0] * sc;
            const py = pt[1] * sc;
            const pz = pt[2] * sc;

            const x1 = px * cosY + pz * sinY;
            const y1 = py;
            const z1 = -px * sinY + pz * cosY;

            const x2 = x1;
            const y2 = y1 * cosX - z1 * sinX;
            const z2 = y1 * sinX + z1 * cosX;

            const x3 = x2 * cosZ - y2 * sinZ;
            const y3 = x2 * sinZ + y2 * cosZ;
            const z3 = z2;

            const fov = 500;
            const pers = fov / (fov + z3);
            return [
                (baseW / 2) + x3 * pers,
                (baseH / 2) + y3 * pers,
                z3,
                [x3, y3, z3]
            ];
        }

        // 1. Acoustic Wave Rings when Voice Active or Speaking
        if ((isVoiceActive || isSpeaking) && time % 36 === 0) {
            waveRings.push({ r: 50, opacity: 0.8 });
        }

        for (let i = waveRings.length - 1; i >= 0; i--) {
            const ring = waveRings[i];
            ring.r += 1.4;
            ring.opacity -= 0.018;
            if (ring.opacity <= 0) {
                waveRings.splice(i, 1);
                continue;
            }
            ctx.save();
            ctx.beginPath();
            ctx.arc(baseW / 2, baseH / 2, ring.r, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${ring.opacity * 0.35})`;
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.restore();
        }

        // Project all knot vertices
        const projSlices = [];
        for (let i = 0; i < N; i++) {
            const s = baseSlices[i];
            projSlices.push([
                project3D(s[0], scaleFactor),
                project3D(s[1], scaleFactor),
                project3D(s[2], scaleFactor),
                project3D(s[3], scaleFactor)
            ]);
        }

        // Build polygons to render with depth
        const polys = [];

        for (let i = 0; i < N; i++) {
            const next = (i + 1) % N;
            const s1 = projSlices[i];
            const s2 = projSlices[next];

            const faces = [
                [s1[0], s1[1], s2[1], s2[0]], // Top
                [s1[1], s1[2], s2[2], s2[1]], // Right
                [s1[2], s1[3], s2[3], s2[2]], // Bottom
                [s1[3], s1[0], s2[0], s2[3]]  // Left
            ];

            faces.forEach((f, fIdx) => {
                const avgZ = (f[0][2] + f[1][2] + f[2][2] + f[3][2]) / 4;
                const p0 = f[0][3], p1 = f[1][3], p2 = f[2][3];
                const v1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
                const v2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
                const norm = norm3(cross3(v1, v2));

                polys.push({
                    pts: f,
                    z: avgZ,
                    norm: norm,
                    type: 'ribbon',
                    sliceIdx: i,
                    faceIdx: fIdx
                });
            });
        }

        // Project Core Octahedron
        const cCosX = Math.cos(coreRotX), cSinX = Math.sin(coreRotX);
        const cCosY = Math.cos(coreRotY), cSinY = Math.sin(coreRotY);

        const projCore = coreVerts.map(v => {
            const x1 = v[0] * cCosY + v[2] * cSinY;
            const y1 = v[1];
            const z1 = -v[0] * cSinY + v[2] * cCosY;
            const x2 = x1;
            const y2 = y1 * cCosX - z1 * cSinX;
            const z2 = y1 * cSinX + z1 * cCosX;
            const fov = 500;
            const pers = fov / (fov + z2);
            return [
                (baseW / 2) + x2 * pers,
                (baseH / 2) + y2 * pers,
                z2,
                [x2, y2, z2]
            ];
        });

        coreFaces.forEach(cf => {
            const fPts = [projCore[cf[0]], projCore[cf[1]], projCore[cf[2]]];
            const avgZ = (fPts[0][2] + fPts[1][2] + fPts[2][2]) / 3;
            const p0 = fPts[0][3], p1 = fPts[1][3], p2 = fPts[2][3];
            const v1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
            const v2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
            const norm = norm3(cross3(v1, v2));
            polys.push({
                pts: fPts,
                z: avgZ,
                norm: norm,
                type: 'core'
            });
        });

        // Depth Sort: Painter's Algorithm
        polys.sort((a, b) => b.z - a.z);

        // Render sorted polygons
        for (let k = 0; k < polys.length; k++) {
            const poly = polys[k];
            const pts = poly.pts;

            if (poly.type === 'core') {
                const diffuse = Math.max(0, dot3(poly.norm, lightDir));
                ctx.beginPath();
                ctx.moveTo(pts[0][0], pts[0][1]);
                ctx.lineTo(pts[1][0], pts[1][1]);
                ctx.lineTo(pts[2][0], pts[2][1]);
                ctx.closePath();

                ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${0.28 + diffuse * 0.38})`;
                ctx.fill();
                ctx.strokeStyle = `rgba(255, 255, 255, ${0.6 + diffuse * 0.4})`;
                ctx.lineWidth = 1.0;
                ctx.stroke();
                continue;
            }

            // Ribbon Face Shading (Anodized Titanium / Obsidian Metamaterial)
            const diff = Math.max(0, dot3(poly.norm, lightDir));
            const spec = Math.pow(Math.max(0, dot3(poly.norm, halfDir)), 16);

            const phase = (poly.sliceIdx / N) * Math.PI * 2 + time * 0.03;
            const waveGlow = Math.sin(phase) * 0.15 + 0.15;

            // Rich multi-tonal shading
            const ambientR = 14, ambientG = 18, ambientB = 28;
            const diffR = diff * 42, diffG = diff * 48, diffB = diff * 64;
            const specR = spec * 200, specG = spec * 215, specB = spec * 240;
            const tintFactor = 0.12 + diff * 0.22 + waveGlow * 0.18;
            const tintR = cr * tintFactor;
            const tintG = cg * tintFactor;
            const tintB = cb * tintFactor;

            const r = Math.min(255, Math.round(ambientR + diffR + specR + tintR));
            const g = Math.min(255, Math.round(ambientG + diffG + specG + tintG));
            const b = Math.min(255, Math.round(ambientB + diffB + specB + tintB));

            ctx.beginPath();
            ctx.moveTo(pts[0][0], pts[0][1]);
            for (let p = 1; p < pts.length; p++) {
                ctx.lineTo(pts[p][0], pts[p][1]);
            }
            ctx.closePath();

            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            ctx.fill();

            // Crisp vector edge outline (Codex signature aesthetic)
            const edgeAlpha = Math.min(0.9, 0.3 + diff * 0.4 + spec * 0.3);
            ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${edgeAlpha})`;
            ctx.lineWidth = 0.75;
            ctx.stroke();
        }

        // Render Singularity Core Vertices (Glowing points)
        projCore.forEach(cv => {
            ctx.beginPath();
            ctx.arc(cv[0], cv[1], 2, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
            ctx.fill();
        });

        // Central Quantum Singularity Radiant Point
        const centerPt = project3D([0, 0, 0]);
        const singGrad = ctx.createRadialGradient(centerPt[0], centerPt[1], 0, centerPt[0], centerPt[1], 18);
        singGrad.addColorStop(0, "rgba(255, 255, 255, 1.0)");
        singGrad.addColorStop(0.35, `rgba(${cr}, ${cg}, ${cb}, 0.75)`);
        singGrad.addColorStop(1, "rgba(0, 0, 0, 0)");

        ctx.fillStyle = singGrad;
        ctx.beginPath();
        ctx.arc(centerPt[0], centerPt[1], 18, 0, Math.PI * 2);
        ctx.fill();

        time += 1;
        requestAnimationFrame(render);
    }

    render();
}

/* ==========================================================================
   13. MULTI-AGENT CREW DISPATCHER (CrewAI / AutoGPT)
   ========================================================================== */
async function dispatchAgentCrew() {
    const input = document.getElementById("agent-mission-input");
    const mission = input.value.trim();
    if (!mission) return;

    const streamBox = document.getElementById("agent-steps-stream");
    const resultBox = document.getElementById("agent-result-box");
    streamBox.style.display = "flex";
    resultBox.style.display = "none";
    resultBox.innerHTML = "";

    logEvent("AGENT", `Dispatching Autonomous Crew for mission: "${mission}"`);

    // Reset step styles
    const step1 = document.getElementById("agent-step-commander");
    const step2 = document.getElementById("agent-step-researcher");
    const step3 = document.getElementById("agent-step-engineer");
    step1.style.borderColor = "var(--cyan-core)";
    step2.style.borderColor = "rgba(56, 189, 248, 0.15)";
    step3.style.borderColor = "rgba(56, 189, 248, 0.15)";

    const provider = localStorage.getItem("nexus_provider") || "gemini";
    const apiKey = localStorage.getItem("nexus_api_key") || "";
    const model = localStorage.getItem("nexus_model") || "";

    try {
        const res = await fetch("/api/agents/orchestrate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mission, provider, apiKey, model })
        });
        const data = await res.json();
        
        step1.style.borderColor = "var(--green-core)";
        step2.style.borderColor = "var(--green-core)";
        step3.style.borderColor = "var(--green-core)";

        resultBox.style.display = "block";
        resultBox.innerHTML = `<strong>MISSION COMPLETE (${data.elapsed_seconds}s)</strong><br><br>${data.final_response.replace(/\n/g, '<br>')}`;
        logEvent("AGENT", `Crew mission resolved in ${data.elapsed_seconds}s.`);
        speakText(data.final_response.slice(0, 140));
    } catch (e) {
        resultBox.style.display = "block";
        resultBox.innerHTML = `<span style="color: var(--red-core);">Crew execution error: ${e.message}</span>`;
    }
}

/* ==========================================================================
   14. RAG KNOWLEDGE VAULT (RAGFlow / Dify)
   ========================================================================== */
async function handleRagFileUpload(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    const statusLabel = document.getElementById("rag-upload-status");
    statusLabel.innerText = `Indexing ${file.name}...`;

    const formData = new FormData();
    formData.append("file", file);

    try {
        const res = await fetch("/api/documents/upload", {
            method: "POST",
            body: formData
        });
        const data = await res.json();
        statusLabel.innerText = `Indexed ${data.chunk_count} chunks`;
        logEvent("RAG", `Document '${file.name}' indexed into vector memory (${data.chunk_count} chunks).`);
    } catch (e) {
        statusLabel.innerText = "Upload failed";
    }
}

async function queryRagVault() {
    const input = document.getElementById("rag-query-input");
    const query = input.value.trim();
    if (!query) return;

    const stream = document.getElementById("rag-results-stream");
    stream.innerHTML = "<div class='stream-empty'>Executing hybrid vector search...</div>";

    const provider = localStorage.getItem("nexus_provider") || "gemini";
    const apiKey = localStorage.getItem("nexus_api_key") || "";

    try {
        const res = await fetch("/api/rag/query", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query, provider, apiKey })
        });
        const data = await res.json();
        
        if (!data.results || data.results.length === 0) {
            stream.innerHTML = "<div class='stream-empty'>No vector matches found.</div>";
            return;
        }

        stream.innerHTML = data.results.map(r => `
            <div class="rag-chunk-card">
                <div class="rag-chunk-title">${r.doc_name} (Chunk ${r.chunk_index} // Score ${r.score})</div>
                <div>${r.content.slice(0, 120)}...</div>
            </div>
        `).join("");
    } catch (e) {
        stream.innerHTML = `<div class='stream-empty' style='color: var(--red-core);'>Search error: ${e.message}</div>`;
    }
}

/* ==========================================================================
   15. LOCAL AI RUNTIMES PROBER
   ========================================================================== */
async function probeLocalEngines() {
    try {
        const res = await fetch("/api/providers/status");
        const data = await res.json();
        const local = data.local || {};

        const setPill = (id, online) => {
            const el = document.getElementById(id);
            if (el) {
                if (online) el.classList.add("online");
                else el.classList.remove("online");
            }
        };

        setPill("probe-ollama", local.ollama?.online);
        setPill("probe-llamacpp", local.llama_cpp?.online);
        setPill("probe-lmstudio", local.lm_studio?.online);
        setPill("probe-comfyui", local.comfyui?.online);
        setPill("probe-sdwebui", local.sd_webui?.online);
    } catch (e) {}
}

/* ==========================================================================
   16. GENERATIVE VISUAL STUDIO (ComfyUI / SD / Pollinations)
   ========================================================================== */
async function generateVisualConcept() {
    const input = document.getElementById("gen-prompt-input");
    const prompt = input.value.trim();
    if (!prompt) return;

    const preview = document.getElementById("gen-preview-box");
    preview.style.display = "block";
    preview.innerHTML = "<div class='stream-empty'>Synthesizing visual concept...</div>";
    logEvent("GEN", `Generating visual concept: "${prompt}"`);

    try {
        const res = await fetch("/api/generative/image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt, width: 400, height: 400 })
        });
        const data = await res.json();
        
        const imgSrc = data.image_base64 || data.image_url;
        preview.innerHTML = `
            <img src="${imgSrc}" class="gen-preview-img" alt="Generative Concept">
            <div style="font-family: var(--font-mono); font-size: 0.54rem; color: var(--cyan-core); margin-top: 3px;">ENGINE: ${data.engine}</div>
        `;
        logEvent("GEN", `Visual concept rendered via ${data.engine}.`);
    } catch (e) {
        preview.innerHTML = `<div class='stream-empty' style='color: var(--red-core);'>Render failed: ${e.message}</div>`;
    }
}

