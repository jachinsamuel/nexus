let isVoiceActive = false;
let isSpeaking = false;
let isProcessing = false;
let recognition = null;
let synth = window.speechSynthesis;

document.addEventListener("DOMContentLoaded", () => {
    initApp();
});

function initApp() {
    setupEventListeners();
    loadSavedEngineConfig();
    initSpeechRecognition();
    initArcCanvas();
    fetchTelemetry();
    setInterval(fetchTelemetry, 10000);

    // Auto-activate voice mode by default
    setTimeout(() => {
        if (recognition && !isVoiceActive) {
            toggleVoiceMode();
        }
    }, 500);
}

function setupEventListeners() {
    // Form Submit (if present)
    const cmdForm = document.getElementById("cmd-form");
    if (cmdForm) {
        cmdForm.addEventListener("submit", handleCommandSubmit);
    }

    // Mic Button Trigger (if present)
    const micBtn = document.getElementById("mic-trigger");
    if (micBtn) {
        micBtn.addEventListener("click", toggleVoiceMode);
    }

    // Click Arc Reactor to Toggle Voice
    const arcContainer = document.querySelector(".arc-container");
    if (arcContainer) {
        arcContainer.addEventListener("click", toggleVoiceMode);
    }

    // Keyboard Shortcuts
    document.addEventListener("keydown", (e) => {
        const isInputActive = document.activeElement && (
            document.activeElement.tagName === "INPUT" || 
            document.activeElement.tagName === "TEXTAREA" || 
            document.activeElement.tagName === "SELECT"
        );
        
        // Spacebar to toggle Voice Mode (when not typing in an input field)
        if ((e.code === "Space" || e.key === " " || e.keyCode === 32) && !isInputActive) {
            e.preventDefault();
            toggleVoiceMode();
        }
    });

    // Provider select
    document.getElementById("provider-select").addEventListener("change", (e) => {
        const prov = e.target.value;
        const keyGroup = document.getElementById("key-field-group");
        const modelInput = document.getElementById("model-input");

        if (prov === "ollama") {
            keyGroup.style.display = "none";
            modelInput.value = "qwen2.5-coder:3b";
        } else if (prov === "nvidia") {
            keyGroup.style.display = "block";
            modelInput.value = "meta/llama-3.1-70b-instruct";
        } else if (prov === "gemini") {
            keyGroup.style.display = "block";
            modelInput.value = "gemini-1.5-flash";
        } else if (prov === "openai") {
            keyGroup.style.display = "block";
            modelInput.value = "gpt-4o-mini";
        }
    });
}

function toggleSettingsDrawer() {
    const drawer = document.getElementById("settings-drawer");
    drawer.style.display = drawer.style.display === "none" ? "block" : "none";
}

function saveEngineConfig() {
    const prov = document.getElementById("provider-select").value;
    const apiKey = document.getElementById("api-key-input").value;
    const model = document.getElementById("model-input").value;

    localStorage.setItem("nexus_provider", prov);
    localStorage.setItem("nexus_api_key", apiKey);
    localStorage.setItem("nexus_model", model);

    const msg = document.getElementById("save-status-msg");
    msg.innerText = "✓ Configuration saved.";
    msg.style.display = "block";
    setTimeout(() => { msg.style.display = "none"; }, 2500);
}

function loadSavedEngineConfig() {
    const savedProv = localStorage.getItem("nexus_provider");
    const savedKey = localStorage.getItem("nexus_api_key");
    const savedModel = localStorage.getItem("nexus_model");

    if (savedProv) {
        document.getElementById("provider-select").value = savedProv;
        const keyGroup = document.getElementById("key-field-group");
        if (savedProv === "ollama") {
            keyGroup.style.display = "none";
        } else {
            keyGroup.style.display = "block";
        }
    }
    if (savedKey) {
        document.getElementById("api-key-input").value = savedKey;
    }
    if (savedModel) {
        document.getElementById("model-input").value = savedModel;
    }
}

function toggleShortcutsModal() {
    const modal = document.getElementById("shortcuts-modal");
    modal.style.display = modal.style.display === "none" ? "flex" : "none";
}

async function fetchTelemetry() {
    try {
        const res = await fetch("/api/system/stats");
        const stats = await res.json();
        let ramText = `RAM ${stats.ram_used_gb}/${stats.ram_total_gb}GB`;
        if (stats.battery && stats.battery.percent !== undefined) {
            ramText += ` • BAT ${stats.battery.percent}%`;
        }
        document.getElementById("hdr-cpu").innerText = `CPU ${stats.cpu_percent}%`;
        document.getElementById("hdr-ram").innerText = ramText;
    } catch (err) {}
}

async function fetchProcessList() {
    const box = document.getElementById("proc-list-box");
    box.innerHTML = "Loading processes...";
    try {
        const res = await fetch("/api/system/processes");
        const procs = await res.json();
        box.innerHTML = "";
        procs.forEach(p => {
            const item = document.createElement("div");
            item.className = "proc-item";
            item.innerHTML = `
                <span>${p.name} (RAM ${p.memory_percent}%)</span>
                <button class="proc-kill-btn" onclick="killProcess('${p.pid}')">Kill</button>
            `;
            box.appendChild(item);
        });
    } catch (err) {
        box.innerText = "Error loading processes.";
    }
}

async function killProcess(target) {
    try {
        const res = await fetch("/api/system/process/kill", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: target })
        });
        const data = await res.json();
        alert(data.message);
        fetchProcessList();
    } catch (err) {
        alert("Failed to kill process: " + err.message);
    }
}

function copyStreamResponse() {
    const text = document.getElementById("stream-text").innerText;
    if (text) {
        navigator.clipboard.writeText(text);
        const copyBtn = document.querySelector(".copy-btn");
        copyBtn.innerText = "✓ Copied";
        setTimeout(() => { copyBtn.innerText = "📋 Copy"; }, 2000);
    }
}

function closeStreamResponse() {
    const streamBox = document.getElementById("response-stream-box");
    const streamText = document.getElementById("stream-text");
    streamText.innerText = "";
    streamBox.style.display = "none";
    if (synth) synth.cancel();
    isSpeaking = false;
    isProcessing = false;
    if (isVoiceActive && recognition) {
        try { recognition.start(); } catch (e) {}
    }
}

// Voice Recognition setup
function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
        if (isProcessing || isSpeaking) return;

        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
        }

        document.getElementById("nexus-transcript").innerText = `"${transcript}"`;
        const cmdLower = transcript.toLowerCase().trim();

        if (event.results[event.results.length - 1].isFinal) {
            handleVoiceIntent(cmdLower);
        }
    };

    recognition.onerror = (e) => {
        if (e.error !== "no-speech") {
            isProcessing = false;
        }
        if (isVoiceActive && !isProcessing && !isSpeaking) {
            try { recognition.start(); } catch (err) {}
        }
    };

    recognition.onend = () => {
        if (isVoiceActive && !isProcessing && !isSpeaking) {
            try { recognition.start(); } catch (e) {}
        }
    };
}

function playJarvisChime(type = "activate") {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        gain.gain.setValueAtTime(0.04, ctx.currentTime);

        if (type === "activate") {
            osc.frequency.setValueAtTime(587.33, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1174.66, ctx.currentTime + 0.12);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        } else {
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.12);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        }

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.16);
    } catch (e) {}
}

function toggleVoiceMode() {
    isVoiceActive = !isVoiceActive;
    const micBtn = document.getElementById("mic-trigger");

    if (isVoiceActive) {
        playJarvisChime("activate");
        if (micBtn) micBtn.classList.add("active");
        if (!isProcessing && !isSpeaking) {
            updateReactorState("LISTENING", "Listening for command or query...");
            try { recognition.start(); } catch (e) {}
        }
    } else {
        playJarvisChime("deactivate");
        if (micBtn) micBtn.classList.remove("active");
        updateReactorState("STANDBY", "Click Arc Reactor or press Space for voice mode");
        if (recognition) recognition.stop();
        if (synth) synth.cancel();
    }
}

function updateReactorState(state, transcriptText) {
    const stateEl = document.getElementById("nexus-state");
    const transcriptEl = document.getElementById("nexus-transcript");

    stateEl.innerText = state;
    if (transcriptText) transcriptEl.innerText = transcriptText;

    if (state === "LISTENING") stateEl.style.color = "#38bdf8";
    else if (state === "THINKING") stateEl.style.color = "#e2e8f0";
    else if (state === "SPEAKING") stateEl.style.color = "#38bdf8";
    else stateEl.style.color = "#64748b";
}

async function handleVoiceIntent(cmdText) {
    if (!cmdText || isSpeaking || isProcessing) return;

    isProcessing = true;
    if (recognition) {
        try { recognition.stop(); } catch (e) {}
    }

    if (cmdText.includes("sleep") || cmdText.includes("standby")) {
        isProcessing = false;
        toggleVoiceMode();
        speakText("Entering standby mode.");
        return;
    }

    updateReactorState("THINKING", `Processing: "${cmdText}"`);

    try {
        const res = await fetch("/api/voice/intent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ command: cmdText })
        });
        const data = await res.json();

        if (data.status === "action_executed") {
            displayStreamResponse("NEXUS ACTION", data.message);
            updateReactorState("SPEAKING", "Response ready");
            speakText(data.message);
        } else {
            await executeQuery(cmdText);
        }
    } catch (err) {
        isProcessing = false;
        updateReactorState("STANDBY", "Error: " + err.message);
        if (isVoiceActive && recognition) {
            try { recognition.start(); } catch (e) {}
        }
    }
}

async function handleCommandSubmit(e) {
    e.preventDefault();
    const input = document.getElementById("cmd-input");
    const query = input.value.trim();
    if (!query) return;

    input.value = "";
    updateReactorState("THINKING", `Processing: "${query}"`);
    await handleVoiceIntent(query);
}

async function executeQuery(query) {
    const provider = document.getElementById("provider-select").value;
    const apiKey = document.getElementById("api-key-input").value;
    const model = document.getElementById("model-input").value;

    const streamBox = document.getElementById("response-stream-box");
    const streamRole = document.getElementById("stream-role");
    const streamText = document.getElementById("stream-text");

    streamText.innerText = "";
    streamBox.style.display = "none";
    streamRole.innerText = "NEXUS // COMPUTE CORE";

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
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split("\n\n");
            buffer = events.pop() || "";

            for (const eventStr of events) {
                const lines = eventStr.split("\n");
                let eventType = "";
                let eventData = "";

                for (const l of lines) {
                    const trimmed = l.trim();
                    if (trimmed.startsWith("event:")) eventType = trimmed.replace("event:", "").trim();
                    else if (trimmed.startsWith("data:")) eventData = trimmed.replace("data:", "").trim();
                }

                if (eventType === "token" && eventData) {
                    try {
                        const token = JSON.parse(eventData);
                        if (token !== undefined && token !== null) {
                            streamBox.style.display = "block";
                            streamText.innerText += token;
                        }
                    } catch (e) {}
                } else if (eventType === "error" && eventData) {
                    try {
                        const err = JSON.parse(eventData);
                        streamBox.style.display = "block";
                        streamText.innerText = "Execution Error: " + err;
                    } catch (e) {}
                }
            }
        }

        updateReactorState("SPEAKING", "Response ready");
        if (isVoiceActive) {
            speakText(streamText.innerText);
        } else {
            isProcessing = false;
            updateReactorState("STANDBY", "Click Arc Reactor or press Space for voice mode");
        }

    } catch (err) {
        isProcessing = false;
        streamBox.style.display = "block";
        streamText.innerText = "Execution Error: " + err.message;
        updateReactorState("STANDBY", "Error occurred");
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

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 0.9;

    const maleVoice = getMaleVoice();
    if (maleVoice) {
        utterance.voice = maleVoice;
    }

    utterance.onstart = () => {
        isSpeaking = true;
        updateReactorState("SPEAKING", text);
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
            updateReactorState("STANDBY", "Click Arc Reactor or press Space for voice mode");
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

async function launchApp(appName) {
    try {
        const res = await fetch("/api/system/launch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ appName: appName })
        });
        const data = await res.json();
        displayStreamResponse("NEXUS LAUNCHER", data.message || `Launched ${appName}`);
    } catch (err) {
        alert("Launch failed: " + err.message);
    }
}

// Sleek High-End Audio Spectrum & Arc Ring Renderer
function initArcCanvas() {
    const canvas = document.getElementById("arc-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const dpi = window.devicePixelRatio || 2;
    canvas.width = 340 * dpi;
    canvas.height = 340 * dpi;

    let angle = 0;

    function render() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.scale(dpi, dpi);

        const cx = 170;
        const cy = 170;

        // 1. Rotating Outer Ticks Ring
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle * 0.3);
        ctx.lineWidth = 1;
        for (let i = 0; i < 48; i++) {
            const rot = (i / 48) * Math.PI * 2;
            const isMajor = i % 12 === 0;
            const len = isMajor ? 8 : 4;
            const r1 = 162;
            const r2 = r1 - len;

            ctx.strokeStyle = isMajor ? "#00f0ff" : "rgba(0, 240, 255, 0.25)";
            ctx.lineWidth = isMajor ? 2 : 1;
            ctx.beginPath();
            ctx.moveTo(Math.cos(rot) * r1, Math.sin(rot) * r1);
            ctx.lineTo(Math.cos(rot) * r2, Math.sin(rot) * r2);
            ctx.stroke();
        }
        ctx.restore();

        // 2. High-Frequency Audio Waveform Bars on Speech
        if (isSpeaking) {
            ctx.save();
            ctx.translate(cx, cy);
            const numBars = 64;
            const radius = 135;

            for (let i = 0; i < numBars; i++) {
                const barAngle = (i / numBars) * Math.PI * 2 + angle;
                const barHeight = 8 + Math.random() * 22;

                const x1 = Math.cos(barAngle) * radius;
                const y1 = Math.sin(barAngle) * radius;
                const x2 = Math.cos(barAngle) * (radius + barHeight);
                const y2 = Math.sin(barAngle) * (radius + barHeight);

                ctx.strokeStyle = "rgba(0, 240, 255, 0.9)";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
            }
            ctx.restore();
        }

        // 3. Smooth Inner Pulsing Wave Arc
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-angle * 0.5);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
        ctx.lineWidth = 2.5;
        const waveArc = Math.PI * 0.4;
        ctx.beginPath();
        ctx.arc(0, 0, 88, 0, waveArc);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, 88, Math.PI, Math.PI + waveArc);
        ctx.stroke();
        ctx.restore();

        ctx.restore();
        angle += isSpeaking ? 0.04 : 0.015;
        requestAnimationFrame(render);
    }

    render();
}
