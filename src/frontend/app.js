/* ============ Planck Academy — app.js ============ */
const API_BASE = "http://localhost:8000";

// ---------- Estado ----------
let messages = [];          // [{ role: "user"|"assistant", content: string }]
let level = "Iniciante";
let activeModule = null;
let loading = false;
let lastTopic = "Física Teórica";

// ---------- Módulos ----------
const MODULES = [
  {
    name: "Mecânica Quântica",
    topics: ["Dualidade onda-partícula", "Princípio da incerteza", "Equação de Schrödinger", "Emaranhamento"],
  },
  {
    name: "Relatividade",
    topics: ["Relatividade especial", "Dilatação do tempo", "E = mc²", "Relatividade geral", "Curvatura do espaço-tempo"],
  },
  {
    name: "Termodinâmica Estatística",
    topics: ["Entropia", "Distribuição de Boltzmann", "Gás ideal quântico"],
  },
  {
    name: "Teoria Quântica de Campos",
    topics: ["Campo", "Bóson", "Férmion", "QED"],
  },
  {
    name: "Cosmologia",
    topics: ["Big Bang", "Inflação cósmica", "Matéria escura", "Energia escura"],
  },
  {
    name: "Física de Partículas",
    topics: ["Modelo Padrão", "Quarks", "Léptons", "Bósons de gauge"],
  },
];

// ---------- DOM refs ----------
const $messages = document.getElementById("messages");
const $input = document.getElementById("input");
const $sendBtn = document.getElementById("sendBtn");
const $quizBtn = document.getElementById("quizBtn");
const $clearBtn = document.getElementById("clearBtn");
const $composer = document.getElementById("composer");
const $moduleNav = document.getElementById("moduleNav");
const $sidebar = document.getElementById("sidebar");
const $menuBtn = document.getElementById("menuBtn");
const $backdrop = document.getElementById("sidebarBackdrop");

// ---------- Atom SVG (avatar) ----------
function atomSVG() {
  return `<svg class="planck-avatar" viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="32" cy="32" r="3" fill="currentColor"/>
    <ellipse cx="32" cy="32" rx="26" ry="10" fill="none" stroke="currentColor" stroke-width="2"/>
    <ellipse cx="32" cy="32" rx="26" ry="10" fill="none" stroke="currentColor" stroke-width="2" transform="rotate(60 32 32)"/>
    <ellipse cx="32" cy="32" rx="26" ry="10" fill="none" stroke="currentColor" stroke-width="2" transform="rotate(-60 32 32)"/>
  </svg>`;
}

// ---------- Sidebar render ----------
function renderModules() {
  $moduleNav.innerHTML = "";
  MODULES.forEach((mod) => {
    const group = document.createElement("div");
    group.className = "module-group";
    const header = document.createElement("div");
    header.className = "module-header";
    header.textContent = mod.name;
    group.appendChild(header);
    const topics = document.createElement("div");
    topics.className = "module-topics";
    mod.topics.forEach((t) => {
      const btn = document.createElement("button");
      btn.className = "topic-btn";
      btn.textContent = t;
      btn.addEventListener("click", () => {
        activeModule = mod.name;
        lastTopic = t;
        const text = `Quero aprender sobre ${t}. Estou no nível ${level}. Comece com uma introdução.`;
        $input.value = text;
        sendMessage();
        closeSidebar();
      });
      topics.appendChild(btn);
    });
    group.appendChild(topics);
    $moduleNav.appendChild(group);
  });
}

// ---------- Level selector ----------
document.querySelectorAll(".level-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".level-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    level = btn.dataset.level;
  });
});

// ---------- Sidebar toggle (mobile) ----------
function openSidebar() { $sidebar.classList.add("open"); $backdrop.hidden = false; }
function closeSidebar() { $sidebar.classList.remove("open"); $backdrop.hidden = true; }
$menuBtn.addEventListener("click", () => $sidebar.classList.contains("open") ? closeSidebar() : openSidebar());
$backdrop.addEventListener("click", closeSidebar);

// ---------- Render helpers ----------
function renderMath(node) {
  if (window.renderMathInElement) {
    try {
      window.renderMathInElement(node, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
        ],
        throwOnError: false,
      });
    } catch (e) { console.warn("KaTeX render error:", e); }
  }
}

function scrollToBottom() {
  requestAnimationFrame(() => { $messages.scrollTop = $messages.scrollHeight; });
}

function appendUserMessage(text) {
  const div = document.createElement("div");
  div.className = "msg msg-user";
  div.textContent = text;
  $messages.appendChild(div);
  renderMath(div);
  scrollToBottom();
}

function appendPlanckMessage(text) {
  const wrap = document.createElement("div");
  wrap.className = "msg msg-planck";
  wrap.innerHTML = `${atomSVG()}<div class="planck-body"></div>`;
  const body = wrap.querySelector(".planck-body");
  body.textContent = text;
  $messages.appendChild(wrap);
  renderMath(wrap);
  scrollToBottom();
  return wrap;
}

function appendTypingIndicator() {
  const wrap = document.createElement("div");
  wrap.className = "msg msg-planck typing-wrap";
  wrap.innerHTML = `${atomSVG()}<div class="planck-body"><div class="typing"><span></span><span></span><span></span></div></div>`;
  wrap.querySelector(".planck-avatar").classList.add("loading");
  $messages.appendChild(wrap);
  scrollToBottom();
  return wrap;
}

function appendError(message, retryFn) {
  const div = document.createElement("div");
  div.className = "error-msg";
  const span = document.createElement("span");
  span.textContent = message;
  const btn = document.createElement("button");
  btn.textContent = "Tentar novamente";
  btn.addEventListener("click", () => { div.remove(); retryFn && retryFn(); });
  div.appendChild(span);
  div.appendChild(btn);
  $messages.appendChild(div);
  scrollToBottom();
}

// ---------- Streaming helpers ----------
// Codifica o payload em base64-url-safe (EventSource só aceita GET).
function encodePayload(obj) {
  const json = JSON.stringify(obj);
  // btoa só lida com latin1 — codificamos UTF-8 antes
  const utf8 = new TextEncoder().encode(json);
  let bin = "";
  utf8.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function appendStreamingPlanckBubble() {
  const wrap = document.createElement("div");
  wrap.className = "msg msg-planck streaming";
  wrap.innerHTML = `${atomSVG()}<div class="planck-body"></div>`;
  wrap.querySelector(".planck-avatar").classList.add("loading");
  $messages.appendChild(wrap);
  scrollToBottom();
  return wrap;
}

// ---------- Send message (streaming via SSE) ----------
function sendMessage() {
  const text = $input.value.trim();
  if (!text || loading) return;

  $input.value = "";
  messages.push({ role: "user", content: text });
  appendUserMessage(text);

  // Heurística: extrai tópico da mensagem para futuro quiz
  const m = text.match(/sobre\s+(.+?)(?:\.|$)/i);
  if (m) lastTopic = m[1].trim();

  loading = true;
  $sendBtn.disabled = true;
  const typingEl = appendTypingIndicator();

  let bubble = null;
  let body = null;
  let acc = "";
  let es = null;
  let scrollTick = false;

  const retry = () => {
    const last = messages[messages.length - 1];
    if (last && last.role === "user") {
      messages.pop();
      $input.value = last.content;
      sendMessage();
    }
  };

  const cleanup = () => {
    if (es) { try { es.close(); } catch (_) {} es = null; }
    loading = false;
    $sendBtn.disabled = false;
    $input.focus();
  };

  const failWith = (msg) => {
    if (typingEl && typingEl.parentNode) typingEl.remove();
    if (bubble && bubble.parentNode && !acc) bubble.remove();
    appendError(msg, retry);
    cleanup();
  };

  try {
    const payload = encodePayload({ messages, level });
    const url = `${API_BASE}/api/chat/stream?payload=${payload}`;
    es = new EventSource(url);

    es.addEventListener("chunk", (ev) => {
      // Primeiro chunk: troca o indicador de digitação por bolha real
      if (!bubble) {
        if (typingEl && typingEl.parentNode) typingEl.remove();
        bubble = appendStreamingPlanckBubble();
        body = bubble.querySelector(".planck-body");
      }
      try {
        const piece = JSON.parse(ev.data);
        acc += piece;
        body.textContent = acc;
        if (!scrollTick) {
          scrollTick = true;
          requestAnimationFrame(() => {
            scrollTick = false;
            scrollToBottom();
          });
        }
      } catch (e) {
        console.warn("chunk parse err", e);
      }
    });

    es.addEventListener("done", () => {
      if (bubble) {
        bubble.classList.remove("streaming");
        bubble.querySelector(".planck-avatar")?.classList.remove("loading");
        // Render final do KaTeX (agora que temos texto completo)
        renderMath(bubble);
        messages.push({ role: "assistant", content: acc });
      } else {
        // Nenhum chunk recebido
        if (typingEl && typingEl.parentNode) typingEl.remove();
        appendError("Resposta vazia do modelo. Tente novamente.", retry);
      }
      cleanup();
    });

    es.addEventListener("error", (ev) => {
      // Pode ser erro de rede OU evento "error" enviado pelo backend
      let backendMsg = null;
      if (ev && ev.data) {
        try { backendMsg = JSON.parse(ev.data).detail; } catch (_) {}
      }
      if (backendMsg) {
        failWith(`Erro do servidor: ${backendMsg}`);
      } else if (es && es.readyState === EventSource.CLOSED) {
        // Conexão fechada sem evento "done" → erro
        if (!acc) {
          failWith("Não foi possível conectar ao servidor. Verifique se o backend está rodando.");
        } else {
          // Já tínhamos texto: trata como concluído
          if (bubble) {
            bubble.classList.remove("streaming");
            bubble.querySelector(".planck-avatar")?.classList.remove("loading");
            renderMath(bubble);
            messages.push({ role: "assistant", content: acc });
          }
          cleanup();
        }
      } else {
        // readyState === CONNECTING: deixa o navegador tentar reconectar uma vez,
        // mas se persistir, fechamos. Aqui simplificamos fechando.
        failWith("Falha na conexão de streaming. Tente novamente.");
      }
    });
  } catch (err) {
    console.error(err);
    failWith("Erro ao iniciar streaming. Tente novamente.");
  }
}

// ---------- Quiz ----------
async function requestQuiz() {
  if (loading) return;
  loading = true;
  $quizBtn.disabled = true;
  const typingEl = appendTypingIndicator();

  try {
    const res = await fetch(`${API_BASE}/api/quiz`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: lastTopic, level }),
    });
    typingEl.remove();

    if (res.status === 500) {
      appendError("Erro interno do servidor. Tente novamente em instantes.", requestQuiz);
      return;
    }
    if (!res.ok) {
      appendError(`Erro inesperado (${res.status}). Tente novamente.`, requestQuiz);
      return;
    }

    const questions = await res.json();
    if (!Array.isArray(questions)) {
      appendError("Formato de quiz inválido recebido do servidor.", requestQuiz);
      return;
    }
    questions.forEach((q, idx) => renderQuizCard(q, idx));
  } catch (err) {
    typingEl.remove();
    console.error(err);
    appendError("Não foi possível conectar ao servidor. Verifique se o backend está rodando.", requestQuiz);
  } finally {
    loading = false;
    $quizBtn.disabled = false;
  }
}

function renderQuizCard(q, idx) {
  const card = document.createElement("div");
  card.className = "quiz-card";
  const title = document.createElement("div");
  title.className = "quiz-q";
  title.textContent = `${idx + 1}. ${q.question}`;
  card.appendChild(title);

  const opts = document.createElement("div");
  opts.className = "quiz-options";
  q.options.forEach((opt, i) => {
    const btn = document.createElement("button");
    btn.className = "quiz-opt";
    btn.textContent = `${String.fromCharCode(65 + i)}) ${opt}`;
    btn.addEventListener("click", () => {
      const buttons = opts.querySelectorAll(".quiz-opt");
      buttons.forEach((b, j) => {
        b.disabled = true;
        if (j === q.answer) b.classList.add("correct");
        else if (j === i) b.classList.add("wrong");
      });
    });
    opts.appendChild(btn);
  });
  card.appendChild(opts);
  $messages.appendChild(card);
  renderMath(card);
  scrollToBottom();
}

// ---------- Clear ----------
function clearHistory() {
  messages = [];
  $messages.innerHTML = "";
}

// ---------- Eventos ----------
$composer.addEventListener("submit", (e) => { e.preventDefault(); sendMessage(); });
$input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
$quizBtn.addEventListener("click", requestQuiz);
$clearBtn.addEventListener("click", clearHistory);

// ---------- Init ----------
renderModules();

// Mensagem de boas-vindas
window.addEventListener("load", () => {
  const welcome = `Olá! Eu sou **Planck**, seu tutor de Física Teórica. ⚛️

Escolha uma trilha na barra lateral ou me faça uma pergunta direto. Você também pode mudar o **nível** lá em cima a qualquer momento.

Exemplo: pergunte "$E = mc^2$ realmente significa que matéria vira energia?" ou clique em **Mecânica Quântica → Princípio da incerteza**.`;
  appendPlanckMessage(welcome);
});
