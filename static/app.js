/* ==========================================================================
   NEXUS // AUTONOMOUS AI OPERATING SYSTEM
   Acoustic Waveform Controller & Speech Interface
   ========================================================================== */

let isVoiceActive = false;
let isSpeaking = false;
let isProcessing = false;
let recognition = null;
let synth = window.speechSynthesis;
let currentResponseText = "";

// Audio Analysis for Living Waveform
let audioCtx = null;
let analyser = null;
let micStream = null;
let audioDataArray = null;

// Animation & State
let currentState = "STANDBY"; // STANDBY | LISTENING | THINKING | SPEAKING
let animFrameId = null;
let canvas = null;
let ctx = null;
let globalAngle = 0;
let isCursorTrackingEnabled = true;

/* ==========================================================================
   1. INITIALIZATION & LIFECYCLE
   ========================================================================== */
document.addEventListener("DOMContentLoaded", () => {
    initSplineInteraction();
    initSpeechRecognition();
    initKeyboardShortcuts();
    loadSavedEngineSettings();
    updateGreeting();
});

function updateGreeting() {
    const greetingEl = document.getElementById("nexus-greeting") || document.getElementById("jarvis-greeting");
    if (!greetingEl) return;
    const hour = new Date().getHours();
    let timeGreeting = "How can I help?";
    if (hour >= 5 && hour < 12) {
        timeGreeting = "Good morning, how can I help?";
    } else if (hour >= 12 && hour < 17) {
        timeGreeting = "Good afternoon, how can I help?";
    } else if (hour >= 17 && hour < 22) {
        timeGreeting = "Good evening, how can I help?";
    } else {
        timeGreeting = "Hello, how can I help?";
    }
    greetingEl.innerText = timeGreeting;
}

/* ==========================================================================
   2. 3D SPLINE ROBOT & INTERACTION ENGINE
   ========================================================================== */
function initSplineInteraction() {
    const iframe = document.getElementById("spline-robot-iframe");
    if (!iframe) return;

    window.addEventListener("mousemove", (e) => {
        if (!isCursorTrackingEnabled) return;
        try {
            if (!iframe.contentDocument) return;
            const canvas = iframe.contentDocument.getElementById("canvas3d");
            if (!canvas) return;

            const rect = iframe.getBoundingClientRect();
            // Calculate cursor offset relative to iframe center
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            // Normalized screen-wide direction (-1 to +1 from center)
            const normX = (e.clientX - centerX) / (window.innerWidth / 2);
            const normY = (e.clientY - centerY) / (window.innerHeight / 2);

            // Map smoothly to canvas dimensions so look-at tracking remains active anywhere on screen
            const targetX = rect.width / 2 + normX * (rect.width * 0.45);
            const targetY = rect.height / 2 + normY * (rect.height * 0.45);

            const pointerEvent = new PointerEvent("pointermove", {
                bubbles: true,
                cancelable: true,
                clientX: targetX,
                clientY: targetY,
                screenX: e.screenX,
                screenY: e.screenY,
                pointerType: "mouse"
            });
            canvas.dispatchEvent(pointerEvent);

            const mouseEvent = new MouseEvent("mousemove", {
                bubbles: true,
                cancelable: true,
                clientX: targetX,
                clientY: targetY,
                screenX: e.screenX,
                screenY: e.screenY
            });
            canvas.dispatchEvent(mouseEvent);
        } catch (err) {
            // Safe cross-frame interaction
        }
    });
}

function initCanvasVisualizer() {
    canvas = document.getElementById("jarvis-core-canvas");
    if (!canvas) return;
    ctx = canvas.getContext("2d");

    if (animFrameId) cancelAnimationFrame(animFrameId);
    renderAcousticFrame();
}

function renderAcousticFrame() {
    if (!canvas || !ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const cx = width / 2;
    const cy = height / 2;
    const baseR = width * 0.28;

    ctx.clearRect(0, 0, width, height);
    globalAngle += 0.015;

    // Get live audio data if mic is active
    let micVolume = 0;
    if (audioDataArray && analyser && isVoiceActive) {
        analyser.getByteFrequencyData(audioDataArray);
        let sum = 0;
        for (let i = 0; i < 32; i++) {
            sum += audioDataArray[i];
        }
        micVolume = sum / 32 / 255;
    }

    // Color palette based on state
    let primaryColor, glowColor, coreGlow;
    if (currentState === "LISTENING") {
        primaryColor = "#10b981"; // Emerald
        glowColor = "rgba(16, 185, 129, 0.4)";
        coreGlow = "rgba(16, 185, 129, 0.15)";
    } else if (currentState === "THINKING") {
        primaryColor = "#a855f7"; // Violet
        glowColor = "rgba(168, 85, 247, 0.4)";
        coreGlow = "rgba(168, 85, 247, 0.15)";
    } else if (currentState === "SPEAKING") {
        primaryColor = "#2dd4bf"; // Teal
        glowColor = "rgba(45, 212, 191, 0.45)";
        coreGlow = "rgba(45, 212, 191, 0.2)";
    } else {
        // STANDBY
        primaryColor = "#38bdf8"; // Celestial Cyan
        glowColor = "rgba(56, 189, 248, 0.3)";
        coreGlow = "rgba(56, 189, 248, 0.1)";
    }

    // 1. Central Ambient Core Radial Glow
    const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseR * 1.3);
    coreGrad.addColorStop(0, coreGlow);
    coreGrad.addColorStop(0.6, "transparent");
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, baseR * 1.3, 0, Math.PI * 2);
    ctx.fill();

    // 2. Inner Concentric Ring with breathing pulse
    const innerPulse = Math.sin(globalAngle * 2) * 3;
    const innerR = baseR * 0.52 + innerPulse;
    ctx.save();
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 1.6;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // 3. Middle Rotating Segmented Arcs
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(globalAngle * 0.8);
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 4; i++) {
        const startA = (i * Math.PI) / 2 + 0.15;
        const endA = startA + Math.PI / 2 - 0.3;
        ctx.beginPath();
        ctx.arc(0, 0, baseR * 0.76, startA, endA);
        ctx.stroke();
    }
    ctx.restore();

    // 4. Acoustic Waveform Radial Bars (84 bars around circle)
    const barCount = 84;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 1.8;
    ctx.lineCap = "round";

    for (let i = 0; i < barCount; i++) {
        const angle = (i * 2 * Math.PI) / barCount;
        let amp = 0;

        if (currentState === "LISTENING") {
            const raw = audioDataArray ? audioDataArray[i % audioDataArray.length] / 255 : micVolume;
            amp = 8 + raw * 38 + Math.sin(globalAngle * 6 + i * 0.4) * 8;
        } else if (currentState === "THINKING") {
            amp = 10 + Math.sin(globalAngle * 10 + i * 0.6) * 16 + Math.cos(i * 3 + globalAngle * 4) * 6;
        } else if (currentState === "SPEAKING") {
            amp = 12 + Math.sin(globalAngle * 8 + i * 0.5) * 22 + Math.cos(globalAngle * 4 + i) * 10;
        } else {
            // STANDBY harmonic wave
            amp = 6 + Math.sin(globalAngle * 3 + i * 0.25) * 7 * Math.cos(globalAngle * 1.5 + i * 0.1);
        }

        const r1 = baseR * 0.84;
        const r2 = r1 + Math.max(2, amp);

        const x1 = Math.cos(angle) * r1;
        const y1 = Math.sin(angle) * r1;
        const x2 = Math.cos(angle) * r2;
        const y2 = Math.sin(angle) * r2;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }
    ctx.restore();

    // 5. Outer Calibrated Tick Ring
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-globalAngle * 0.4);
    const tickR = baseR * 1.25;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 1;

    for (let i = 0; i < 48; i++) {
        const a = (i * 2 * Math.PI) / 48;
        const isMajor = i % 6 === 0;
        const len = isMajor ? 6 : 3;

        const tx1 = Math.cos(a) * tickR;
        const ty1 = Math.sin(a) * tickR;
        const tx2 = Math.cos(a) * (tickR + len);
        const ty2 = Math.sin(a) * (tickR + len);

        ctx.beginPath();
        ctx.moveTo(tx1, ty1);
        ctx.lineTo(tx2, ty2);
        ctx.stroke();
    }
    ctx.restore();

    // 6. Central Anchor Node
    ctx.save();
    ctx.fillStyle = primaryColor;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    animFrameId = requestAnimationFrame(renderAcousticFrame);
}

/* ==========================================================================
   3. SPEECH RECOGNITION & AUDIO HARDWARE
   ========================================================================== */
function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        console.warn("Speech recognition not supported in this browser.");
        return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = localStorage.getItem("nexus_stt_lang") || "en-US";

    recognition.onresult = (event) => {
        const last = event.results.length - 1;
        const transcript = event.results[last][0].transcript.trim();
        if (transcript) {
            processQuery(transcript);
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

async function startMicrophoneStream() {
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === "suspended") {
            await audioCtx.resume();
        }
        if (!micStream) {
            micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = 128;
            const source = audioCtx.createMediaStreamSource(micStream);
            source.connect(analyser);
            audioDataArray = new Uint8Array(analyser.frequencyBinCount);
        }
    } catch (e) {
        console.warn("AudioContext / Mic:", e);
    }
}

function stopMicrophoneStream() {
    if (micStream) {
        micStream.getTracks().forEach(t => t.stop());
        micStream = null;
    }
    audioDataArray = null;
}

function toggleVoiceMode() {
    isVoiceActive = !isVoiceActive;

    if (isVoiceActive) {
        startMicrophoneStream();
        setNexusState("LISTENING", "Listening...");
        if (recognition && !isProcessing && !isSpeaking) {
            try { recognition.start(); } catch (e) {}
        }
    } else {
        stopMicrophoneStream();
        setNexusState("STANDBY", "Ready");
        if (recognition) {
            try { recognition.stop(); } catch (e) {}
        }
        if (synth) synth.cancel();
        isSpeaking = false;
        isProcessing = false;
    }
}

/* ==========================================================================
   4. STATE & VISUAL CONTROLLER
   ========================================================================== */
function setNexusState(state, statusText) {
    currentState = state;

    const wrapper = document.getElementById("spline-robot-wrapper");
    const micBtn = document.getElementById("btn-voice-toggle");
    const mesh = document.getElementById("ambient-mesh");

    if (wrapper) wrapper.classList.remove("listening", "thinking", "speaking");

    if (state === "LISTENING") {
        if (wrapper) wrapper.classList.add("listening");
        if (micBtn) micBtn.classList.add("active");
        if (mesh) mesh.style.background = "radial-gradient(circle at 50% 40%, rgba(56, 189, 248, 0.08) 0%, transparent 60%)";
    } else if (state === "THINKING") {
        if (wrapper) wrapper.classList.add("thinking");
        if (micBtn) micBtn.classList.remove("active");
        if (mesh) mesh.style.background = "radial-gradient(circle at 50% 40%, rgba(56, 189, 248, 0.06) 0%, transparent 60%)";
    } else if (state === "SPEAKING") {
        if (wrapper) wrapper.classList.add("speaking");
        if (micBtn) micBtn.classList.remove("active");
        if (mesh) mesh.style.background = "radial-gradient(circle at 50% 40%, rgba(56, 189, 248, 0.09) 0%, transparent 60%)";
    } else {
        // STANDBY
        if (micBtn) micBtn.classList.remove("active");
        if (mesh) mesh.style.background = "radial-gradient(circle at 50% 40%, rgba(56, 189, 248, 0.05) 0%, transparent 55%)";
    }
}

/* ==========================================================================
   5. QUERY EXECUTION & INTENT ROUTING
   ========================================================================== */
function handlePromptSubmit(event) {
    event.preventDefault();
    const input = document.getElementById("prompt-input");
    const query = input.value.trim();
    if (!query) return;

    input.value = "";
    processQuery(query);
}

async function processQuery(query) {
    if (isProcessing) return;
    isProcessing = true;

    if (recognition) {
        try { recognition.stop(); } catch (e) {}
    }

    const stage = document.getElementById("app-stage");
    if (stage) stage.classList.add("has-thread");

    const threadContainer = document.getElementById("chat-thread-container");
    const userText = document.getElementById("user-query-text");
    const streamOutput = document.getElementById("stream-output-text");

    threadContainer.style.display = "flex";
    userText.innerText = query;
    streamOutput.innerText = "";
    currentResponseText = "";

    setNexusState("THINKING", "Thinking...");

    // 1. Natural Language Intent Execution
    try {
        const intentRes = await fetch("/api/voice/intent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ command: query })
        });
        const intentData = await intentRes.json();

        if (intentData.status === "action_executed") {
            const answer = intentData.message || "Done.";
            currentResponseText = answer;
            streamOutput.innerText = answer;
            speakText(answer, true);
            return;
        }
    } catch (err) {
        console.warn("Intent fallback to LLM:", err);
    }

    // 2. Intelligence Streaming
    await streamIntelligenceResponse(query);
}

async function streamIntelligenceResponse(query) {
    const streamOutput = document.getElementById("stream-output-text");
    const provider = localStorage.getItem("nexus_provider") || "ollama";
    const apiKey = localStorage.getItem("nexus_api_key") || "";
    const model = localStorage.getItem("nexus_model") || "qwen2.5-coder:3b";
    const temp = parseFloat(localStorage.getItem("nexus_temp") || "0.7");
    const personaText = localStorage.getItem("nexus_persona_text") || "";

    try {
        const res = await fetch("/api/stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                query: query,
                provider: provider,
                apiKey: apiKey,
                chatModel: model,
                temperature: temp,
                systemPrompt: personaText
            })
        });

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";
        let buffer = "";

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            // Keep the last potentially incomplete line in the buffer
            buffer = lines.pop() || "";

            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith("data: ")) {
                    const dataStr = trimmed.slice(6).trim();
                    if (!dataStr || dataStr === "{}") continue;
                    try {
                        const token = JSON.parse(dataStr);
                        if (typeof token === "string") {
                            fullText += token;
                            streamOutput.innerText = fullText;
                        }
                    } catch (e) {}
                }
            }
        }

        // Process any leftover line
        if (buffer.trim().startsWith("data: ")) {
            const dataStr = buffer.trim().slice(6).trim();
            if (dataStr && dataStr !== "{}") {
                try {
                    const token = JSON.parse(dataStr);
                    if (typeof token === "string") {
                        fullText += token;
                        streamOutput.innerText = fullText;
                    }
                } catch (e) {}
            }
        }

        currentResponseText = fullText;
        speakText(fullText, true);

    } catch (err) {
        streamOutput.innerText = `Error: ${err.message}`;
        isProcessing = false;
        setNexusState("STANDBY", "Ready");
    }
}

/* ==========================================================================
   6. SPEECH SYNTHESIS
   ========================================================================== */
function getPreferredVoice() {
    if (!synth) return null;
    const voices = synth.getVoices();
    if (!voices || voices.length === 0) return null;

    const savedVoiceURI = localStorage.getItem("nexus_tts_voice_uri");
    if (savedVoiceURI) {
        const match = voices.find(v => v.voiceURI === savedVoiceURI);
        if (match) return match;
    }

    const priorityNames = ["david", "george", "guy", "daniel", "james", "oliver", "alex"];
    for (const name of priorityNames) {
        const match = voices.find(v => v.name.toLowerCase().includes(name));
        if (match) return match;
    }
    return voices.find(v => v.lang.startsWith("en")) || voices[0];
}

function speakText(text, isAuto = false) {
    if (!synth || !text) {
        isProcessing = false;
        if (isVoiceActive) {
            setNexusState("LISTENING", "Listening...");
            if (recognition) {
                try { recognition.start(); } catch (e) {}
            }
        } else {
            setNexusState("STANDBY", "Ready");
        }
        return;
    }

    // If triggered automatically after response and user turned off auto-read
    if (isAuto) {
        const autoSpeak = localStorage.getItem("nexus_auto_speak");
        if (autoSpeak === "false") {
            isProcessing = false;
            if (isVoiceActive) {
                setNexusState("LISTENING", "Listening...");
                if (recognition) {
                    try { recognition.start(); } catch (e) {}
                }
            } else {
                setNexusState("STANDBY", "Ready");
            }
            return;
        }
    }

    synth.cancel();

    const cleanSpeech = text
        .replace(/[#*_`~\[\]\(\)]/g, '')
        .replace(/•/g, '')
        .replace(/```[\s\S]*?```/g, 'Code block.')
        .replace(/\n+/g, '. ');

    const utterance = new SpeechSynthesisUtterance(cleanSpeech);

    const rate = parseFloat(localStorage.getItem("nexus_tts_speed") || "1.0");
    const pitch = parseFloat(localStorage.getItem("nexus_tts_pitch") || "1.0");
    utterance.rate = isNaN(rate) ? 1.0 : rate;
    utterance.pitch = isNaN(pitch) ? 1.0 : pitch;

    const voice = getPreferredVoice();
    if (voice) utterance.voice = voice;

    utterance.onstart = () => {
        isSpeaking = true;
        setNexusState("SPEAKING", "Speaking...");
    };

    utterance.onend = () => {
        isSpeaking = false;
        isProcessing = false;
        if (isVoiceActive) {
            setNexusState("LISTENING", "Listening...");
            if (recognition) {
                try { recognition.start(); } catch (e) {}
            }
        } else {
            setNexusState("STANDBY", "Ready");
        }
    };

    utterance.onerror = () => {
        isSpeaking = false;
        isProcessing = false;
        if (isVoiceActive && recognition) {
            try { recognition.start(); } catch (e) {}
        }
        setNexusState("STANDBY", "Ready");
    };

    synth.speak(utterance);
}

function speakCurrentResponse() {
    if (currentResponseText) {
        speakText(currentResponseText, false);
    }
}

function copyResponseText() {
    if (currentResponseText) {
        navigator.clipboard.writeText(currentResponseText);
    }
}

function closeChatThread() {
    const stage = document.getElementById("app-stage");
    if (stage) stage.classList.remove("has-thread");

    const thread = document.getElementById("chat-thread-container");
    if (thread) thread.style.display = "none";
    if (synth) synth.cancel();
    isSpeaking = false;
    isProcessing = false;
    setNexusState("STANDBY", "Ready");
}

function resetConversation() {
    closeChatThread();
    const input = document.getElementById("prompt-input");
    if (input) input.value = "";
    currentResponseText = "";
}

/* ==========================================================================
   7. ADVANCED SETTINGS SUITE & CONFIGURATION
   ========================================================================== */
function openSettingsModal() {
    const modal = document.getElementById("settings-modal");
    if (modal) {
        modal.style.display = "flex";
        populateVoiceList();
    }
}

function closeSettingsModal() {
    const modal = document.getElementById("settings-modal");
    if (modal) modal.style.display = "none";
}

function switchSettingsTab(tabName, btnEl) {
    document.querySelectorAll(".settings-tab-bar .tab-btn").forEach(btn => btn.classList.remove("active"));
    if (btnEl) btnEl.classList.add("active");

    document.querySelectorAll(".settings-tab-pane").forEach(pane => pane.classList.remove("active"));
    const targetPane = document.getElementById(`tab-pane-${tabName}`);
    if (targetPane) targetPane.classList.add("active");
}

function onProviderChanged() {
    const prov = document.getElementById("provider-select")?.value || "ollama";
    const keyGroup = document.getElementById("api-key-group");
    if (keyGroup) {
        keyGroup.style.display = prov === "ollama" ? "none" : "flex";
    }
}

function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isPass = input.type === "password";
    input.type = isPass ? "text" : "password";
    const btn = input.parentElement?.querySelector(".field-toggle-btn");
    if (btn) btn.innerText = isPass ? "Hide" : "Show";
}

function selectModelPreset(modelName) {
    const input = document.getElementById("model-input");
    if (input) input.value = modelName;
}

function onPersonaPresetChanged() {
    const sel = document.getElementById("persona-preset-select");
    const textarea = document.getElementById("system-persona-input");
    if (!sel || !textarea) return;

    const presets = {
        default: "You are NEXUS, an ultra-advanced cybernetic artificial intelligence companion. Be concise, direct, helpful, and insightful. Avoid conversational filler.",
        concise: "Provide ultra-concise, rapid-fire responses. Keep answers strictly under 2 sentences unless complex code or structured data is explicitly requested.",
        coding: "Act as an elite Staff Software Engineer and System Architect. Provide robust, production-grade code, optimal algorithms, and precise architectural rationale.",
        jarvis: "You are Stark Industries' J.A.R.V.I.S. Address the user with supreme wit, polite British sophistication, and unflappable competence. Call the user 'Sir'."
    };

    if (presets[sel.value]) {
        textarea.value = presets[sel.value];
    }
}

function populateVoiceList() {
    if (!synth) return;
    const voiceSelect = document.getElementById("tts-voice-select");
    if (!voiceSelect) return;

    const voices = synth.getVoices();
    if (!voices || voices.length === 0) return;

    const savedVoiceURI = localStorage.getItem("nexus_tts_voice_uri") || "";
    voiceSelect.innerHTML = `<option value="">System Default Voice</option>`;

    voices.forEach(v => {
        const opt = document.createElement("option");
        opt.value = v.voiceURI;
        opt.innerText = `${v.name} (${v.lang})${v.default ? ' — Default' : ''}`;
        if (v.voiceURI === savedVoiceURI) opt.selected = true;
        voiceSelect.appendChild(opt);
    });
}

if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = populateVoiceList;
}

const THEME_ACCENTS = {
    cyan: { accent: "#38bdf8", glow: "rgba(56, 189, 248, 0.3)" },
    indigo: { accent: "#818cf8", glow: "rgba(129, 140, 248, 0.3)" },
    teal: { accent: "#2dd4bf", glow: "rgba(45, 212, 191, 0.3)" },
    violet: { accent: "#c084fc", glow: "rgba(192, 132, 252, 0.3)" }
};

function applyThemeAccent(colorName) {
    const theme = THEME_ACCENTS[colorName] || THEME_ACCENTS.cyan;
    document.documentElement.style.setProperty("--accent-cyan", theme.accent);
    document.documentElement.style.setProperty("--border-glow", theme.glow);
    localStorage.setItem("nexus_theme_accent", colorName);
}

function selectThemeAccent(colorName, el) {
    document.querySelectorAll(".theme-option").forEach(opt => opt.classList.remove("active"));
    if (el) el.classList.add("active");
    applyThemeAccent(colorName);
}

function updateAuraIntensity(val) {
    const display = document.getElementById("aura-val-display");
    if (display) display.innerText = `${val}%`;
    const mesh = document.getElementById("ambient-mesh");
    if (mesh) {
        const alpha = (parseFloat(val) / 100) * 0.12;
        mesh.style.background = `radial-gradient(circle at 50% 40%, rgba(56, 189, 248, ${alpha}) 0%, transparent 65%)`;
    }
    localStorage.setItem("nexus_aura_intensity", val);
}

function exportConversation(format = "markdown") {
    const userQuery = document.getElementById("user-query-text")?.innerText || "";
    const reply = document.getElementById("stream-output-text")?.innerText || currentResponseText || "";

    if (!userQuery && !reply) {
        alert("No active session transcript to export.");
        return;
    }

    const dateStr = new Date().toISOString().replace(/[:.]/g, "-");
    const content = `# NEXUS Intelligence Transcript\n**Date:** ${new Date().toLocaleString()}\n\n---\n\n### User\n${userQuery}\n\n### NEXUS\n${reply}\n`;
    
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nexus_transcript_${dateStr}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function clearCurrentConversation() {
    closeChatThread();
    const input = document.getElementById("prompt-input");
    if (input) input.value = "";
    currentResponseText = "";
    const feedback = document.getElementById("save-status-msg");
    if (feedback) {
        feedback.innerText = "Session cleared ✓";
        setTimeout(() => { feedback.innerText = ""; }, 1200);
    }
}

function resetToFactoryDefaults() {
    if (!confirm("Reset all NEXUS settings to default?")) return;
    localStorage.clear();
    loadSavedEngineSettings();
    const feedback = document.getElementById("save-status-msg");
    if (feedback) {
        feedback.innerText = "Restored defaults ✓";
        setTimeout(() => {
            feedback.innerText = "";
            closeSettingsModal();
        }, 800);
    }
}

function saveAllSettings() {
    // 1. Intelligence
    const prov = document.getElementById("provider-select")?.value || "ollama";
    const key = document.getElementById("api-key-input")?.value.trim() || "";
    const model = document.getElementById("model-input")?.value.trim() || "qwen2.5-coder:3b";
    const temp = document.getElementById("temp-slider")?.value || "0.7";
    const personaPreset = document.getElementById("persona-preset-select")?.value || "default";
    const personaText = document.getElementById("system-persona-input")?.value.trim() || "";

    localStorage.setItem("nexus_provider", prov);
    localStorage.setItem("nexus_api_key", key);
    localStorage.setItem("nexus_model", model);
    localStorage.setItem("nexus_temp", temp);
    localStorage.setItem("nexus_persona_preset", personaPreset);
    localStorage.setItem("nexus_persona_text", personaText);

    // 2. Voice & Speech
    const voiceURI = document.getElementById("tts-voice-select")?.value || "";
    const speed = document.getElementById("tts-speed-slider")?.value || "1.0";
    const pitch = document.getElementById("tts-pitch-slider")?.value || "1.0";
    const autoSpeak = document.getElementById("auto-speak-toggle")?.checked ? "true" : "false";
    const sttLang = document.getElementById("stt-lang-select")?.value || "en-US";

    localStorage.setItem("nexus_tts_voice_uri", voiceURI);
    localStorage.setItem("nexus_tts_speed", speed);
    localStorage.setItem("nexus_tts_pitch", pitch);
    localStorage.setItem("nexus_auto_speak", autoSpeak);
    localStorage.setItem("nexus_stt_lang", sttLang);

    if (recognition) {
        recognition.lang = sttLang;
    }

    // 3. Automation
    const autoApps = document.getElementById("auto-apps-toggle")?.checked ? "true" : "false";
    const autoWeb = document.getElementById("auto-web-toggle")?.checked ? "true" : "false";
    const autoTelem = document.getElementById("auto-telemetry-toggle")?.checked ? "true" : "false";

    localStorage.setItem("nexus_auto_apps", autoApps);
    localStorage.setItem("nexus_auto_web", autoWeb);
    localStorage.setItem("nexus_auto_telemetry", autoTelem);

    // 4. Appearance
    const tracking = document.getElementById("tracking-toggle")?.checked ? "true" : "false";
    const aura = document.getElementById("aura-slider")?.value || "50";

    localStorage.setItem("nexus_tracking", tracking);
    isCursorTrackingEnabled = tracking === "true";

    localStorage.setItem("nexus_aura_intensity", aura);
    updateAuraIntensity(aura);

    const feedback = document.getElementById("save-status-msg");
    if (feedback) {
        feedback.innerText = "Settings Saved ✓";
        setTimeout(() => {
            feedback.innerText = "";
            closeSettingsModal();
        }, 700);
    } else {
        closeSettingsModal();
    }
}

function loadSavedEngineSettings() {
    // 1. Intelligence
    const prov = localStorage.getItem("nexus_provider") || "ollama";
    const key = localStorage.getItem("nexus_api_key") || "";
    const model = localStorage.getItem("nexus_model") || "qwen2.5-coder:3b";
    const temp = localStorage.getItem("nexus_temp") || "0.7";
    const personaPreset = localStorage.getItem("nexus_persona_preset") || "default";
    const personaText = localStorage.getItem("nexus_persona_text") || "You are NEXUS, an ultra-advanced cybernetic artificial intelligence companion. Be concise, direct, helpful, and insightful. Avoid conversational filler.";

    const provSelect = document.getElementById("provider-select");
    const keyInput = document.getElementById("api-key-input");
    const modelInput = document.getElementById("model-input");
    const tempSlider = document.getElementById("temp-slider");
    const tempDisplay = document.getElementById("temp-val-display");
    const personaSelect = document.getElementById("persona-preset-select");
    const personaInput = document.getElementById("system-persona-input");

    if (provSelect) provSelect.value = prov;
    if (keyInput) keyInput.value = key;
    if (modelInput) modelInput.value = model;
    if (tempSlider) tempSlider.value = temp;
    if (tempDisplay) tempDisplay.innerText = temp;
    if (personaSelect) personaSelect.value = personaPreset;
    if (personaInput) personaInput.value = personaText;

    onProviderChanged();

    // 2. Voice
    populateVoiceList();
    const speed = localStorage.getItem("nexus_tts_speed") || "1.0";
    const pitch = localStorage.getItem("nexus_tts_pitch") || "1.0";
    const autoSpeak = localStorage.getItem("nexus_auto_speak") !== "false";
    const sttLang = localStorage.getItem("nexus_stt_lang") || "en-US";

    const speedSlider = document.getElementById("tts-speed-slider");
    const speedDisplay = document.getElementById("speed-val-display");
    const pitchSlider = document.getElementById("tts-pitch-slider");
    const pitchDisplay = document.getElementById("pitch-val-display");
    const autoSpeakToggle = document.getElementById("auto-speak-toggle");
    const sttLangSelect = document.getElementById("stt-lang-select");

    if (speedSlider) speedSlider.value = speed;
    if (speedDisplay) speedDisplay.innerText = `${speed}x`;
    if (pitchSlider) pitchSlider.value = pitch;
    if (pitchDisplay) pitchDisplay.innerText = pitch;
    if (autoSpeakToggle) autoSpeakToggle.checked = autoSpeak;
    if (sttLangSelect) sttLangSelect.value = sttLang;
    if (recognition) recognition.lang = sttLang;

    // 3. Automation
    const autoApps = localStorage.getItem("nexus_auto_apps") !== "false";
    const autoWeb = localStorage.getItem("nexus_auto_web") !== "false";
    const autoTelem = localStorage.getItem("nexus_auto_telemetry") !== "false";

    const autoAppsToggle = document.getElementById("auto-apps-toggle");
    const autoWebToggle = document.getElementById("auto-web-toggle");
    const autoTelemToggle = document.getElementById("auto-telemetry-toggle");

    if (autoAppsToggle) autoAppsToggle.checked = autoApps;
    if (autoWebToggle) autoWebToggle.checked = autoWeb;
    if (autoTelemToggle) autoTelemToggle.checked = autoTelem;

    // 4. Appearance
    const themeAccent = localStorage.getItem("nexus_theme_accent") || "cyan";
    applyThemeAccent(themeAccent);
    document.querySelectorAll(".theme-option").forEach(opt => {
        opt.classList.toggle("active", opt.getAttribute("data-color") === themeAccent);
    });

    const tracking = localStorage.getItem("nexus_tracking") !== "false";
    isCursorTrackingEnabled = tracking;
    const trackingToggle = document.getElementById("tracking-toggle");
    if (trackingToggle) trackingToggle.checked = tracking;

    const aura = localStorage.getItem("nexus_aura_intensity") || "50";
    const auraSlider = document.getElementById("aura-slider");
    if (auraSlider) auraSlider.value = aura;
    updateAuraIntensity(aura);
}

/* ==========================================================================
   8. KEYBOARD SHORTCUTS
   ========================================================================== */
function initKeyboardShortcuts() {
    window.addEventListener("keydown", (e) => {
        // Spacebar to talk when not typing in input/textarea
        if (e.code === "Space" && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
            const isModalOpen = document.getElementById("settings-modal")?.style.display === "flex";
            if (!isModalOpen) {
                e.preventDefault();
                toggleVoiceMode();
            }
        }

        // 'S' key to open settings when not typing
        if ((e.key === "s" || e.key === "S") && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
            const isModalOpen = document.getElementById("settings-modal")?.style.display === "flex";
            if (!isModalOpen) {
                e.preventDefault();
                openSettingsModal();
            }
        }

        // Escape to close modal or active thread
        if (e.key === "Escape") {
            const settingsModal = document.getElementById("settings-modal");
            if (settingsModal && settingsModal.style.display === "flex") {
                closeSettingsModal();
                return;
            }
            const thread = document.getElementById("chat-thread-container");
            if (thread && thread.style.display !== "none") {
                closeChatThread();
                return;
            }
        }
    });

    const settingsModal = document.getElementById("settings-modal");
    if (settingsModal) {
        settingsModal.addEventListener("click", (e) => {
            if (e.target === settingsModal) closeSettingsModal();
        });
    }
}
