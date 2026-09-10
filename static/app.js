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

/* ==========================================================================
   1. INITIALIZATION & LIFECYCLE
   ========================================================================== */
document.addEventListener("DOMContentLoaded", () => {
    initSplineInteraction();
    initSpeechRecognition();
    initKeyboardShortcuts();
    loadSavedEngineSettings();
});

/* ==========================================================================
   2. 3D SPLINE ROBOT & INTERACTION ENGINE
   ========================================================================== */
function initSplineInteraction() {
    const iframe = document.getElementById("spline-robot-iframe");
    if (!iframe) return;

    window.addEventListener("mousemove", (e) => {
        try {
            if (!iframe.contentDocument) return;
            const canvas = iframe.contentDocument.getElementById("canvas3d");
            if (!canvas) return;

            const rect = iframe.getBoundingClientRect();
            const clientX = e.clientX - rect.left;
            const clientY = e.clientY - rect.top;

            const pointerEvent = new PointerEvent("pointermove", {
                bubbles: true,
                cancelable: true,
                clientX: clientX,
                clientY: clientY,
                screenX: e.screenX,
                screenY: e.screenY,
                pointerType: "mouse"
            });
            canvas.dispatchEvent(pointerEvent);

            const mouseEvent = new MouseEvent("mousemove", {
                bubbles: true,
                cancelable: true,
                clientX: clientX,
                clientY: clientY,
                screenX: e.screenX,
                screenY: e.screenY
            });
            canvas.dispatchEvent(mouseEvent);
        } catch (err) {
            // Same origin access safe
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
    recognition.lang = "en-US";

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

    const wrapper = document.getElementById("spline-robot-wrapper") || document.getElementById("jarvis-canvas-wrapper");
    const badge = document.getElementById("jarvis-status-badge");
    const statusLabel = document.getElementById("status-text");
    const dot = document.getElementById("system-status-dot");
    const micBtn = document.getElementById("btn-voice-toggle");
    const mesh = document.getElementById("ambient-mesh");

    if (wrapper) wrapper.classList.remove("listening", "thinking", "speaking");
    if (badge) badge.classList.remove("listening", "thinking", "speaking");

    if (state === "LISTENING") {
        if (wrapper) wrapper.classList.add("listening");
        if (badge) badge.classList.add("listening");
        if (dot) dot.classList.add("active");
        if (micBtn) micBtn.classList.add("active");
        if (mesh) mesh.style.background = "radial-gradient(circle at 50% 36%, rgba(16, 185, 129, 0.12) 0%, transparent 60%)";
    } else if (state === "THINKING") {
        if (wrapper) wrapper.classList.add("thinking");
        if (badge) badge.classList.add("thinking");
        if (micBtn) micBtn.classList.remove("active");
        if (mesh) mesh.style.background = "radial-gradient(circle at 50% 36%, rgba(168, 85, 247, 0.12) 0%, transparent 60%)";
    } else if (state === "SPEAKING") {
        if (wrapper) wrapper.classList.add("speaking");
        if (badge) badge.classList.add("speaking");
        if (micBtn) micBtn.classList.remove("active");
        if (mesh) mesh.style.background = "radial-gradient(circle at 50% 36%, rgba(45, 212, 191, 0.14) 0%, transparent 60%)";
    } else {
        // STANDBY
        if (dot) dot.classList.remove("active");
        if (micBtn) micBtn.classList.remove("active");
        if (mesh) mesh.style.background = "radial-gradient(circle at 50% 36%, rgba(14, 165, 233, 0.09) 0%, transparent 55%)";
    }

    if (statusLabel && statusText) statusLabel.innerText = statusText;
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
            speakText(answer);
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
        let fullText = "";

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
                            fullText += token;
                            streamOutput.innerText = fullText;
                        }
                    } catch (e) {}
                }
            }
        }

        currentResponseText = fullText;
        speakText(fullText);

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

    const priorityNames = ["david", "george", "guy", "daniel", "james", "oliver", "alex"];
    for (const name of priorityNames) {
        const match = voices.find(v => v.name.toLowerCase().includes(name));
        if (match) return match;
    }
    return voices.find(v => v.lang.startsWith("en")) || voices[0];
}

function speakText(text) {
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

    synth.cancel();

    const cleanSpeech = text
        .replace(/[#*_`~\[\]\(\)]/g, '')
        .replace(/•/g, '')
        .replace(/```[\s\S]*?```/g, 'Code block.')
        .replace(/\n+/g, '. ');

    const utterance = new SpeechSynthesisUtterance(cleanSpeech);
    utterance.rate = 1.0;
    utterance.pitch = 0.95;

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
        speakText(currentResponseText);
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
   7. SETTINGS MODAL & CONFIGURATION
   ========================================================================== */
function openSettingsModal() {
    const modal = document.getElementById("settings-modal");
    if (modal) modal.style.display = "flex";
}

function closeSettingsModal() {
    const modal = document.getElementById("settings-modal");
    if (modal) modal.style.display = "none";
}

function onProviderChanged() {
    const prov = document.getElementById("provider-select").value;
    const keyGroup = document.getElementById("api-key-group");
    if (keyGroup) {
        keyGroup.style.display = prov === "ollama" ? "none" : "flex";
    }
}

function saveEngineSettings() {
    const prov = document.getElementById("provider-select").value;
    const key = document.getElementById("api-key-input").value.trim();
    const model = document.getElementById("model-input").value.trim();

    localStorage.setItem("nexus_provider", prov);
    localStorage.setItem("nexus_api_key", key);
    localStorage.setItem("nexus_model", model);

    updateHeaderModelBadge(prov, model);

    const feedback = document.getElementById("save-status-msg");
    if (feedback) {
        feedback.innerText = "Saved";
        setTimeout(() => {
            feedback.innerText = "";
            closeSettingsModal();
        }, 800);
    } else {
        closeSettingsModal();
    }
}

function loadSavedEngineSettings() {
    const prov = localStorage.getItem("nexus_provider") || "ollama";
    const key = localStorage.getItem("nexus_api_key") || "";
    const model = localStorage.getItem("nexus_model") || "qwen2.5-coder:3b";

    const provSelect = document.getElementById("provider-select");
    const keyInput = document.getElementById("api-key-input");
    const modelInput = document.getElementById("model-input");

    if (provSelect) provSelect.value = prov;
    if (keyInput) keyInput.value = key;
    if (modelInput) modelInput.value = model;

    onProviderChanged();
    updateHeaderModelBadge(prov, model);
}

function updateHeaderModelBadge(prov, model) {
    const badge = document.getElementById("active-model-name");
    if (badge) {
        badge.innerText = `${prov} // ${model}`;
    }
}

/* ==========================================================================
   8. KEYBOARD SHORTCUTS
   ========================================================================== */
function initKeyboardShortcuts() {
    window.addEventListener("keydown", (e) => {
        if (e.code === "Space" && document.activeElement.id !== "prompt-input") {
            const isModalOpen = document.getElementById("settings-modal")?.style.display === "flex";
            if (!isModalOpen) {
                e.preventDefault();
                toggleVoiceMode();
            }
        }

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
