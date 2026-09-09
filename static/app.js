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
    // Voice Entity Click
    const core = document.getElementById("voice-entity-core") || document.getElementById("arc-reactor-core");
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
    const dockMic = document.getElementById("dock-mic-btn");

    if (stateEl) stateEl.innerText = state;
    if (transcriptEl && transcriptText) transcriptEl.innerText = transcriptText;

    const entityCore = document.getElementById("voice-entity-core");
    if (entityCore) {
        entityCore.classList.remove("listening", "thinking", "speaking");
        if (state === "LISTENING") entityCore.classList.add("listening");
        else if (state === "THINKING") entityCore.classList.add("thinking");
        else if (state === "SPEAKING") entityCore.classList.add("speaking");
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
   11. VOLUMETRIC LIQUID PLASMA LIGHT ENTITY (CHATGPT VOICE & HUME STYLE)
   ========================================================================== */
function initArcReactorCanvas() {
    const canvas = document.getElementById("plasma-canvas") || document.getElementById("arc-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const dpi = window.devicePixelRatio || 2;
    canvas.width = 440 * dpi;
    canvas.height = 440 * dpi;

    let time = 0;
    let smoothState = {
        coreRadius: 60,
        lobeRadius: 75,
        orbitDist: 32,
        speed: 1.0,
        c1: [56, 189, 248],   // Electric Cyan
        c2: [99, 102, 241],   // Cosmic Indigo
        c3: [14, 165, 233],   // Sky Blue
        c4: [139, 92, 246]    // Violet
    };

    // Ambient floating orbital micro-photons
    const photons = [];
    for (let i = 0; i < 16; i++) {
        photons.push({
            angle: Math.random() * Math.PI * 2,
            distance: 50 + Math.random() * 55,
            speed: (0.003 + Math.random() * 0.006) * (Math.random() > 0.5 ? 1 : -1),
            size: 1.0 + Math.random() * 2.0,
            opacity: 0.25 + Math.random() * 0.5
        });
    }

    // Outward soft bioluminescent acoustic pulse rings
    const acousticWaves = [];

    function render() {
        ctx.setTransform(dpi, 0, 0, dpi, 0, 0);
        ctx.clearRect(0, 0, 440, 440);

        const cx = 220;
        const cy = 220;

        // Determine target parameters based on state
        let targetCoreR = 58;
        let targetLobeR = 76;
        let targetDist = 32;
        let targetSpeed = 1.0;
        let targetC1 = [56, 189, 248];  // Cyan
        let targetC2 = [99, 102, 241];  // Indigo
        let targetC3 = [14, 165, 233];  // Sky Blue
        let targetC4 = [139, 92, 246];  // Violet

        if (isSpeaking) {
            targetCoreR = 66 + Math.sin(time * 0.09) * 6;
            targetLobeR = 88 + Math.cos(time * 0.08) * 8;
            targetDist = 42 + Math.sin(time * 0.07) * 6;
            targetSpeed = 2.2;
            targetC1 = [45, 212, 191];  // Turquoise
            targetC2 = [56, 189, 248];  // Cyan
            targetC3 = [16, 185, 129];  // Emerald
            targetC4 = [99, 102, 241];  // Indigo

            if (Math.random() < 0.07 && acousticWaves.length < 5) {
                acousticWaves.push({ r: 65, opacity: 0.5 });
            }
        } else if (isProcessing) {
            targetCoreR = 62;
            targetLobeR = 82;
            targetDist = 38;
            targetSpeed = 1.8;
            targetC1 = [168, 85, 247];  // Violet
            targetC2 = [217, 70, 239];  // Magenta
            targetC3 = [245, 158, 11];  // Warm Amber
            targetC4 = [56, 189, 248];  // Cyan
        } else if (isVoiceActive) {
            targetCoreR = 64 + Math.sin(time * 0.06) * 4;
            targetLobeR = 84 + Math.cos(time * 0.05) * 5;
            targetDist = 36;
            targetSpeed = 1.5;
            targetC1 = [16, 185, 129];  // Emerald
            targetC2 = [45, 212, 191];  // Turquoise
            targetC3 = [56, 189, 248];  // Cyan
            targetC4 = [5, 150, 105];   // Deep Mint
        }

        // Smooth physics interpolation (Spring interpolation)
        smoothState.coreRadius += (targetCoreR - smoothState.coreRadius) * 0.07;
        smoothState.lobeRadius += (targetLobeR - smoothState.lobeRadius) * 0.07;
        smoothState.orbitDist += (targetDist - smoothState.orbitDist) * 0.07;
        smoothState.speed += (targetSpeed - smoothState.speed) * 0.07;

        for (let i = 0; i < 3; i++) {
            smoothState.c1[i] += (targetC1[i] - smoothState.c1[i]) * 0.06;
            smoothState.c2[i] += (targetC2[i] - smoothState.c2[i]) * 0.06;
            smoothState.c3[i] += (targetC3[i] - smoothState.c3[i]) * 0.06;
            smoothState.c4[i] += (targetC4[i] - smoothState.c4[i]) * 0.06;
        }

        const [r1, g1, b1] = smoothState.c1.map(Math.round);
        const [r2, g2, b2] = smoothState.c2.map(Math.round);
        const [r3, g3, b3] = smoothState.c3.map(Math.round);
        const [r4, g4, b4] = smoothState.c4.map(Math.round);

        // Switch to Optical Additive Screen Blending for real light fusion
        ctx.globalCompositeOperation = "screen";

        // 1. Soft Background Chroma Glow
        const bgGlow = ctx.createRadialGradient(cx, cy, 20, cx, cy, 180);
        bgGlow.addColorStop(0, `rgba(${r1}, ${g1}, ${b1}, 0.22)`);
        bgGlow.addColorStop(0.5, `rgba(${r2}, ${g2}, ${b2}, 0.08)`);
        bgGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = bgGlow;
        ctx.beginPath();
        ctx.arc(cx, cy, 180, 0, Math.PI * 2);
        ctx.fill();

        // 2. Outward Acoustic Pulse Waves
        for (let i = acousticWaves.length - 1; i >= 0; i--) {
            const wave = acousticWaves[i];
            wave.r += 1.8;
            wave.opacity -= 0.014;
            if (wave.opacity <= 0) {
                acousticWaves.splice(i, 1);
                continue;
            }
            const waveGrad = ctx.createRadialGradient(cx, cy, Math.max(0, wave.r - 15), cx, cy, wave.r + 15);
            waveGrad.addColorStop(0, `rgba(${r1}, ${g1}, ${b1}, 0)`);
            waveGrad.addColorStop(0.5, `rgba(${r1}, ${g1}, ${b1}, ${wave.opacity * 0.4})`);
            waveGrad.addColorStop(1, `rgba(${r1}, ${g1}, ${b1}, 0)`);
            ctx.fillStyle = waveGrad;
            ctx.beginPath();
            ctx.arc(cx, cy, wave.r + 15, 0, Math.PI * 2);
            ctx.fill();
        }

        // 3. Four Morphing Volumetric Liquid Plasma Lobes
        const t = time * 0.016 * smoothState.speed;
        const lobes = [
            { angle: t * 1.0, distMult: 1.0, rMult: 1.0, color: [r1, g1, b1] },
            { angle: t * 0.8 + Math.PI * 0.5, distMult: 1.1, rMult: 0.95, color: [r2, g2, b2] },
            { angle: -t * 0.9 + Math.PI, distMult: 0.9, rMult: 1.05, color: [r3, g3, b3] },
            { angle: -t * 0.7 + Math.PI * 1.5, distMult: 1.05, rMult: 0.92, color: [r4, g4, b4] }
        ];

        lobes.forEach((lobe, idx) => {
            const dynamicDist = (smoothState.orbitDist + Math.sin(t * 1.4 + idx) * 8) * lobe.distMult;
            const lx = cx + Math.cos(lobe.angle) * dynamicDist;
            const ly = cy + Math.sin(lobe.angle) * dynamicDist;
            const dynamicR = (smoothState.lobeRadius + Math.cos(t * 1.2 + idx * 2) * 10) * lobe.rMult;

            const [lr, lg, lb] = lobe.color;
            const lobeGrad = ctx.createRadialGradient(lx, ly, 0, lx, ly, dynamicR);
            lobeGrad.addColorStop(0, `rgba(${lr}, ${lg}, ${lb}, 0.85)`);
            lobeGrad.addColorStop(0.35, `rgba(${lr}, ${lg}, ${lb}, 0.55)`);
            lobeGrad.addColorStop(0.7, `rgba(${lr}, ${lg}, ${lb}, 0.18)`);
            lobeGrad.addColorStop(1, "rgba(0, 0, 0, 0)");

            ctx.fillStyle = lobeGrad;
            ctx.beginPath();
            ctx.arc(lx, ly, dynamicR, 0, Math.PI * 2);
            ctx.fill();
        });

        // 4. White-Hot Luminous Core Nucleus (Additive Light Peak)
        const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, smoothState.coreRadius);
        coreGrad.addColorStop(0, "rgba(255, 255, 255, 0.96)");
        coreGrad.addColorStop(0.25, `rgba(224, 242, 254, 0.85)`);
        coreGrad.addColorStop(0.55, `rgba(${r1}, ${g1}, ${b1}, 0.45)`);
        coreGrad.addColorStop(0.85, `rgba(${r2}, ${g2}, ${b2}, 0.15)`);
        coreGrad.addColorStop(1, "rgba(0, 0, 0, 0)");

        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, smoothState.coreRadius, 0, Math.PI * 2);
        ctx.fill();

        // 5. Drifting Micro-Photons (Living Plasma Stardust)
        photons.forEach(p => {
            p.angle += p.speed * smoothState.speed;
            const px = cx + Math.cos(p.angle) * p.distance;
            const py = cy + Math.sin(p.angle) * p.distance;
            const pGrad = ctx.createRadialGradient(px, py, 0, px, py, p.size * 2);
            pGrad.addColorStop(0, `rgba(255, 255, 255, ${p.opacity})`);
            pGrad.addColorStop(0.5, `rgba(${r1}, ${g1}, ${b1}, ${p.opacity * 0.6})`);
            pGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
            ctx.fillStyle = pGrad;
            ctx.beginPath();
            ctx.arc(px, py, p.size * 2, 0, Math.PI * 2);
            ctx.fill();
        });

        // Reset composite operation to normal
        ctx.globalCompositeOperation = "source-over";

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

