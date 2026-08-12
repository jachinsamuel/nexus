let isVoiceActive = false;
let isSpeaking = false;
let recognition = null;
let synth = window.speechSynthesis;

document.addEventListener("DOMContentLoaded", () => {
    initApp();
});

function initApp() {
    setupEventListeners();
    initSpeechRecognition();
    initArcCanvas();
    fetchTelemetry();
    setInterval(fetchTelemetry, 10000);
}

function setupEventListeners() {
    // Form Submit
    document.getElementById("cmd-form").addEventListener("submit", handleCommandSubmit);

    // Mic Button Trigger
    document.getElementById("mic-trigger").addEventListener("click", toggleVoiceMode);

    // Click Arc Reactor to Toggle Voice
    document.querySelector(".arc-container").addEventListener("click", toggleVoiceMode);

    // Keyboard Shortcut (Space bar when not typing in input)
    document.addEventListener("keydown", (e) => {
        if (e.code === "Space" && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
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

async function fetchTelemetry() {
    try {
        const res = await fetch("/api/system/stats");
        const stats = await res.json();
        document.getElementById("hdr-cpu").innerText = `CPU ${stats.cpu_percent}%`;
        document.getElementById("hdr-ram").innerText = `RAM ${stats.ram_used_gb}/${stats.ram_total_gb}GB`;
    } catch (err) {}
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

    recognition.onend = () => {
        if (isVoiceActive) {
            try { recognition.start(); } catch (e) {}
        }
    };
}

function toggleVoiceMode() {
    isVoiceActive = !isVoiceActive;
    const micBtn = document.getElementById("mic-trigger");

    if (isVoiceActive) {
        micBtn.classList.add("active");
        updateReactorState("LISTENING", "Listening for command or query...");
        try { recognition.start(); } catch (e) {}
    } else {
        micBtn.classList.remove("active");
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
    if (!cmdText || isSpeaking) return;

    if (cmdText.includes("sleep") || cmdText.includes("standby")) {
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
            updateReactorState("SPEAKING", data.message);
            speakText(data.message);
        } else {
            await executeQuery(cmdText);
        }
    } catch (err) {
        updateReactorState("STANDBY", "Error: " + err.message);
    }
}

async function handleCommandSubmit(e) {
    e.preventDefault();
    const input = document.getElementById("cmd-input");
    const query = input.value.trim();
    if (!query) return;

    input.value = "";
    updateReactorState("THINKING", `Executing: "${query}"`);
    await executeQuery(query);
}

async function executeQuery(query) {
    const provider = document.getElementById("provider-select").value;
    const apiKey = document.getElementById("api-key-input").value;
    const model = document.getElementById("model-input").value;

    const streamBox = document.getElementById("response-stream-box");
    const streamRole = document.getElementById("stream-role");
    const streamText = document.getElementById("stream-text");

    streamBox.style.display = "block";
    streamRole.innerText = "NEXUS // COMPUTE CORE";
    streamText.innerText = "";

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

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split("\n\n");

            for (const line of lines) {
                if (line.startsWith("event: token")) {
                    const jsonStr = line.replace("event: token\ndata: ", "");
                    try {
                        const token = JSON.parse(jsonStr);
                        streamText.innerText += token;
                    } catch (e) {}
                }
            }
        }

        updateReactorState("SPEAKING", "Response ready");
        if (isVoiceActive) {
            speakText(streamText.innerText);
        }

    } catch (err) {
        streamText.innerText = "Execution Error: " + err.message;
        updateReactorState("STANDBY", "Error occurred");
    }
}

function displayStreamResponse(role, text) {
    const streamBox = document.getElementById("response-stream-box");
    const streamRole = document.getElementById("stream-role");
    const streamText = document.getElementById("stream-text");

    streamBox.style.display = "block";
    streamRole.innerText = role;
    streamText.innerText = text;
}

function speakText(text) {
    if (!synth) return;
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;

    utterance.onstart = () => {
        isSpeaking = true;
        updateReactorState("SPEAKING", text);
    };

    utterance.onend = () => {
        isSpeaking = false;
        if (isVoiceActive) updateReactorState("LISTENING", "Listening...");
        else updateReactorState("STANDBY", "Click Arc Reactor or press Space for voice mode");
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

// Precise Mechanical Canvas Arc Reactor Renderer
function initArcCanvas() {
    const canvas = document.getElementById("arc-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    let angle = 0;

    function render() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;

        // Core Pulse
        const coreRadius = 55 + Math.sin(angle * 2) * (isSpeaking ? 6 : 2);
        const grad = ctx.createRadialGradient(cx, cy, 5, cx, cy, coreRadius);
        grad.addColorStop(0, "rgba(56, 189, 248, 0.95)");
        grad.addColorStop(0.6, "rgba(56, 189, 248, 0.25)");
        grad.addColorStop(1, "transparent");

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, coreRadius, 0, Math.PI * 2);
        ctx.fill();

        // Mechanical Segment Arc Ring
        const segments = 12;
        ctx.lineWidth = 4;
        ctx.strokeStyle = isSpeaking ? "#38bdf8" : "rgba(255, 255, 255, 0.4)";

        for (let i = 0; i < segments; i++) {
            const startAng = (i / segments) * Math.PI * 2 + angle;
            const endAng = startAng + (Math.PI / segments) * 0.7;

            ctx.beginPath();
            ctx.arc(cx, cy, 78, startAng, endAng);
            ctx.stroke();
        }

        // Frequency Spikes when speaking
        if (isSpeaking) {
            const spikes = 32;
            for (let i = 0; i < spikes; i++) {
                const sAngle = (i / spikes) * Math.PI * 2 + (angle * 3);
                const len = 10 + Math.random() * 25;

                const x1 = cx + Math.cos(sAngle) * 88;
                const y1 = cy + Math.sin(sAngle) * 88;
                const x2 = cx + Math.cos(sAngle) * (88 + len);
                const y2 = cy + Math.sin(sAngle) * (88 + len);

                ctx.strokeStyle = "rgba(56, 189, 248, 0.8)";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
            }
        }

        angle += isSpeaking ? 0.05 : 0.015;
        requestAnimationFrame(render);
    }

    render();
}
