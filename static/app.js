
let activeConvId = null;
let jarvisVoiceActive = false;
let jarvisRecognition = null;
let jarvisCanvasAnimId = null;

// Initialize Arc Reactor Canvas
function initJarvisCanvas() {
    const canvas = document.getElementById('jarvis-reactor-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    let angle = 0;
    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        
        ctx.beginPath();
        ctx.arc(cx, cy, 40, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 243, 255, 0.7)';
        ctx.shadowColor = '#00f3ff';
        ctx.shadowBlur = 24;
        ctx.fill();
        ctx.shadowBlur = 0;
        
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        for (let i = 0; i < 8; i++) {
            ctx.rotate((Math.PI * 2) / 8);
            ctx.beginPath();
            ctx.moveTo(22, 0);
            ctx.lineTo(54, 0);
            ctx.strokeStyle = 'rgba(0, 243, 255, 0.85)';
            ctx.lineWidth = 3.5;
            ctx.stroke();
        }
        ctx.restore();
        
        angle += 0.035;
        jarvisCanvasAnimId = requestAnimationFrame(draw);
    }
    if (!jarvisCanvasAnimId) draw();
}

function jarvisSpeak(text) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    
    const badge = document.getElementById('jarvis-voice-status');
    const box = document.getElementById('jarvis-voice-transcript');
    if (badge) badge.textContent = 'JARVIS SPEAKING';
    if (box) box.textContent = text;
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.onend = () => {
        if (badge) badge.textContent = jarvisVoiceActive ? 'JARVIS LISTENING' : 'JARVIS STANDBY';
    };
    window.speechSynthesis.speak(utterance);
}

function initJarvisVoice() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) return;
    
    jarvisRecognition = new SpeechRec();
    jarvisRecognition.continuous = true;
    jarvisRecognition.interimResults = false;
    
    jarvisRecognition.onresult = async (e) => {
        const last = e.results[e.results.length - 1];
        if (!last) return;
        const text = last[0].transcript.trim();
        const lower = text.toLowerCase();
        
        const box = document.getElementById('jarvis-voice-transcript');
        if (box) box.textContent = `"${text}"`;
        
        if (lower.includes('jarvis wake up') || lower.includes('hey jarvis') || lower.includes('wake up jarvis')) {
            jarvisVoiceActive = true;
            document.getElementById('jarvis-voice-fullscreen').style.display = 'flex';
            initJarvisCanvas();
            jarvisSpeak('JARVIS active, sir. How may I assist you?');
            return;
        }
        
        if (lower.includes('jarvis sleep') || lower.includes('go to sleep')) {
            jarvisVoiceActive = false;
            jarvisSpeak('JARVIS entering standby.');
            setTimeout(() => {
                document.getElementById('jarvis-voice-fullscreen').style.display = 'none';
            }, 1800);
            return;
        }
        
        if (jarvisVoiceActive || lower.startsWith('jarvis')) {
            try {
                const res = await fetch('/api/voice/intent', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ command: text })
                });
                const data = await res.json();
                if (data.status === 'success') {
                    jarvisSpeak(data.message);
                } else {
                    document.getElementById('query-input').value = text;
                    document.getElementById('chat-form').dispatchEvent(new Event('submit'));
                }
            } catch (err) {
                console.error(err);
            }
        }
    };
    
    jarvisRecognition.onend = () => {
        if (jarvisVoiceActive && jarvisRecognition) {
            try { jarvisRecognition.start(); } catch (e) {}
        }
    };
}

async function loadConversations() {
    const res = await fetch('/api/conversations');
    const convs = await res.json();
    const list = document.getElementById('conv-list');
    list.innerHTML = '';
    convs.forEach(c => {
        const item = document.createElement('div');
        item.className = 'conv-item' + (c.id === activeConvId ? ' active' : '');
        item.textContent = c.title;
        item.onclick = () => selectConversation(c.id, c.title);
        list.appendChild(item);
    });
}

async function selectConversation(id, title) {
    activeConvId = id;
    document.getElementById('active-chat-title').textContent = title;
    await loadMessages(id);
    loadConversations();
}

async function loadMessages(id) {
    const res = await fetch(`/api/conversations/${id}/messages`);
    const msgs = await res.json();
    const history = document.getElementById('chat-history');
    history.innerHTML = '';
    msgs.forEach(m => {
        const b = document.createElement('div');
        b.className = 'message-bubble ' + m.role;
        b.textContent = m.content;
        history.appendChild(b);
    });
    history.scrollTop = history.scrollHeight;
}

document.getElementById('new-chat-btn').onclick = async () => {
    const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Session' })
    });
    const data = await res.json();
    selectConversation(data.id, data.title);
};

document.getElementById('chat-form').onsubmit = async (e) => {
    e.preventDefault();
    const input = document.getElementById('query-input');
    const query = input.value.trim();
    if (!query) return;
    input.value = '';
    
    if (!activeConvId) {
        const res = await fetch('/api/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: query.slice(0, 25) })
        });
        const data = await res.json();
        activeConvId = data.id;
    }
    
    // Add User Bubble
    const history = document.getElementById('chat-history');
    const uBubble = document.createElement('div');
    uBubble.className = 'message-bubble user';
    uBubble.textContent = query;
    history.appendChild(uBubble);
    
    // Assistant Bubble
    const aBubble = document.createElement('div');
    aBubble.className = 'message-bubble assistant';
    aBubble.textContent = 'JARVIS is thinking...';
    history.appendChild(aBubble);
    history.scrollTop = history.scrollHeight;
    
    const streamRes = await fetch('/api/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: activeConvId, query: query })
    });
    
    const reader = streamRes.body.getReader();
    const decoder = new TextDecoder();
    aBubble.textContent = '';
    
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (let line of lines) {
            if (line.startsWith('data: ')) {
                try {
                    const token = JSON.parse(line.slice(6));
                    if (typeof token === 'string') aBubble.textContent += token;
                } catch(err) {}
            }
        }
    }
    loadConversations();
};

document.getElementById('jarvis-voice-trigger-btn').onclick = () => {
    document.getElementById('jarvis-voice-fullscreen').style.display = 'flex';
    jarvisVoiceActive = true;
    initJarvisCanvas();
    if (!jarvisRecognition) initJarvisVoice();
    try { jarvisRecognition.start(); } catch (e) {}
    jarvisSpeak('JARVIS active.');
};

document.getElementById('jarvis-voice-close-btn').onclick = () => {
    document.getElementById('jarvis-voice-fullscreen').style.display = 'none';
    jarvisVoiceActive = false;
    if (jarvisRecognition) try { jarvisRecognition.stop(); } catch (e) {}
};

document.getElementById('jarvis-action-trigger-btn').onclick = () => {
    document.getElementById('action-modal').style.display = 'flex';
};
document.getElementById('action-modal-close').onclick = () => {
    document.getElementById('action-modal').style.display = 'none';
};

window.launchApp = async (appName) => {
    const res = await fetch('/api/system/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appName })
    });
    const data = await res.json();
    alert(data.message);
};

window.sendJarvisEmail = async () => {
    const to_email = document.getElementById('email-to').value;
    const subject = document.getElementById('email-sub').value;
    const body = document.getElementById('email-body').value;
    const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_email, subject, body })
    });
    const data = await res.json();
    alert(data.message);
};

document.addEventListener('DOMContentLoaded', () => {
    loadConversations();
    initJarvisVoice();
});
