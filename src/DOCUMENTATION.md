# 📘 Planck Academy — Documentação Completa

> **Tutor de Física Teórica com IA** — backend FastAPI + Gemini com streaming SSE, frontend HTML/CSS/JS puro com renderização LaTeX (KaTeX).

---

## Índice

1. [Visão geral](#1-visão-geral)
2. [Arquitetura](#2-arquitetura)
3. [Estrutura de arquivos](#3-estrutura-de-arquivos)
4. [Pré-requisitos](#4-pré-requisitos)
5. [Instalação passo a passo](#5-instalação-passo-a-passo)
6. [Como executar](#6-como-executar)
7. [Configuração (variáveis de ambiente)](#7-configuração-variáveis-de-ambiente)
8. [Referência da API](#8-referência-da-api)
9. [Frontend](#9-frontend)
10. [Design system](#10-design-system)
11. [Streaming SSE explicado](#11-streaming-sse-explicado)
12. [Renderização LaTeX (KaTeX)](#12-renderização-latex-katex)
13. [Prompt do tutor Planck](#13-prompt-do-tutor-planck)
14. [Segurança](#14-segurança)
15. [Solução de problemas](#15-solução-de-problemas)
16. [Performance e custos](#16-performance-e-custos)
17. [Como contribuir / estender](#17-como-contribuir--estender)
18. [Roadmap](#18-roadmap)
19. [Licença & créditos](#19-licença--créditos)

---

## 1. Visão geral

**Planck Academy** é um web app educacional onde **Planck**, um tutor de IA, ensina Física Teórica de forma adaptativa. O usuário escolhe um nível (Iniciante / Intermediário / Avançado) e um tópico (mecânica quântica, relatividade, cosmologia etc.), e recebe respostas estruturadas em quatro seções: **Conceito**, **Intuição**, **Matemática** (com equações em LaTeX) e **Exemplo**. Há também um modo **quiz** com perguntas de múltipla escolha geradas dinamicamente.

**Stack:**
- **Backend:** Python 3.10+, FastAPI, `google-generativeai` (Gemini 2.0 Flash), uvicorn.
- **Frontend:** HTML5, CSS3, JavaScript ES2022 puro — **sem framework**, **sem build step**.
- **Renderização matemática:** KaTeX 0.16.9 via CDN.
- **Tipografia:** Orbitron (títulos), IBM Plex Mono (corpo) — Google Fonts via CDN.

**Por que essa stack?**
- Frontend puro = zero overhead, fácil de auditar e ensinar.
- FastAPI = APIs assíncronas + streaming nativo via `StreamingResponse`.
- Gemini Flash = barato, rápido e suporta `stream=True` nativamente.

---

## 2. Arquitetura

```
┌──────────────────────────────────────────────────────────────┐
│  Navegador                                                   │
│  ┌────────────┐    ┌──────────────┐    ┌─────────────────┐   │
│  │ index.html │───▶│   app.js     │───▶│ EventSource SSE │   │
│  │ + style.css│    │ (estado UI)  │    │ /api/chat/stream│   │
│  └────────────┘    └──────────────┘    └────────┬────────┘   │
│         │                  │                    │            │
│         └─KaTeX (CDN)──────┘                    │            │
└─────────────────────────────────────────────────┼────────────┘
                                                  │ HTTP
┌─────────────────────────────────────────────────▼────────────┐
│  FastAPI (uvicorn :8000)                                     │
│  ┌──────────────┐  ┌──────────────────┐  ┌────────────────┐  │
│  │ /api/chat    │  │ /api/chat/stream │  │ /api/quiz      │  │
│  │ (POST,JSON)  │  │ (GET, SSE)       │  │ (POST,JSON)    │  │
│  └──────┬───────┘  └────────┬─────────┘  └───────┬────────┘  │
│         │                   │                    │           │
│         └───────┬───────────┴────────────────────┘           │
│                 ▼                                            │
│         google-generativeai                                  │
└─────────────────┼────────────────────────────────────────────┘
                  │ HTTPS
                  ▼
        ┌────────────────────┐
        │ Google Gemini API  │
        │ (gemini-2.0-flash) │
        └────────────────────┘
```

**Fluxo de uma mensagem (streaming):**
1. Usuário digita → `app.js` adiciona ao array `messages`.
2. `app.js` codifica `{messages, level}` em **base64-url-safe** e abre `EventSource` em `GET /api/chat/stream?payload=...`.
3. FastAPI decodifica, monta o histórico no formato Gemini (`assistant` → `model`), chama `generate_content(stream=True)`.
4. Cada chunk do Gemini é reembalado como `event: chunk` SSE e enviado.
5. `EventSource` recebe, anexa ao DOM em tempo real (cursor `▍` piscando).
6. Ao receber `event: done`, KaTeX renderiza as equações finais.

---

## 3. Estrutura de arquivos

```
src/
├── backend/
│   ├── main.py              # FastAPI app: /api/chat, /api/chat/stream, /api/quiz
│   ├── requirements.txt     # fastapi, uvicorn, google-generativeai, python-dotenv, pydantic
│   └── .env.example         # Modelo de configuração — copie para .env e edite
└── frontend/
    ├── index.html           # Marcação + carga de KaTeX/fontes
    ├── style.css            # Tema escuro sci-fi, grid background, animações
    └── app.js               # Estado, módulos, EventSource, render KaTeX, quiz
```

---

## 4. Pré-requisitos

| Requisito | Versão | Como verificar |
|---|---|---|
| Python | 3.10+ | `python3 --version` |
| pip | 22+ | `pip --version` |
| Navegador moderno | Chrome 100+ / Firefox 100+ / Safari 15+ | suporte nativo a `EventSource` |
| Chave Gemini | qualquer | https://aistudio.google.com/apikey |

> Não precisa de Node.js, npm, Docker, banco de dados ou conta na nuvem.

---

## 5. Instalação passo a passo

```bash
# 1. Vá para a pasta do backend
cd src/backend

# 2. Crie e ative o ambiente virtual
python3 -m venv venv
source venv/bin/activate              # macOS / Linux
# venv\Scripts\activate               # Windows PowerShell

# 3. Instale dependências
pip install -r requirements.txt

# 4. Configure a chave Gemini
cp .env.example .env                  # macOS / Linux
# copy .env.example .env              # Windows
# Abra .env e cole: GEMINI_API_KEY=sua_chave_aqui
```

---

## 6. Como executar

### Backend
```bash
cd src/backend
source venv/bin/activate
uvicorn main:app --reload --port 8000
```
Aguarde até ver `Uvicorn running on http://127.0.0.1:8000`. **Mantenha o terminal aberto.**

### Frontend
Em **outro terminal**:

**Opção A — servidor estático Python (recomendado):**
```bash
cd src/frontend
python3 -m http.server 5500
```
Abra **http://localhost:5500**.

**Opção B — abrir o arquivo:** duplo-clique em `src/frontend/index.html` (alguns navegadores bloqueiam `fetch`/`EventSource` em `file://` — prefira a opção A).

**Opção C — Live Server (VS Code):** instale a extensão *Live Server* → clique direito em `index.html` → *Open with Live Server*.

---

## 7. Configuração (variáveis de ambiente)

Arquivo: `src/backend/.env`

| Variável | Obrigatória | Descrição |
|---|---|---|
| `GEMINI_API_KEY` | ✅ | Chave do Google AI Studio. O servidor recusa subir sem ela. |

Outras configurações estão no topo de `main.py`:
- `MODEL_NAME = "gemini-2.0-flash"` — troque por `gemini-2.0-pro` para mais qualidade (mais caro, mais lento).
- `allow_origins=["*"]` — para produção, restrinja ao domínio do frontend.

---

## 8. Referência da API

Base URL local: `http://localhost:8000`

### `GET /`
Health-check.
```json
{ "name": "Planck Academy API", "status": "ok", "streaming": true }
```

### `POST /api/chat` — não-streaming (fallback)
**Body:**
```json
{
  "messages": [
    { "role": "user", "content": "Explique entropia" }
  ],
  "level": "Iniciante"
}
```
**Resposta `200`:**
```json
{ "reply": "**Conceito** ... **Matemática** $S = k_B \\ln \\Omega$ ..." }
```
**Erros:** `400` (messages vazio), `500` (falha do Gemini).

### `GET /api/chat/stream?payload=<base64>` ⚡ — **streaming SSE (padrão da UI)**
- `payload` = `base64-url-safe(JSON({messages, level}))`.
- GET porque `EventSource` só suporta GET.
- Resposta: `text/event-stream` com os eventos:

| Evento | Payload | Significado |
|---|---|---|
| `chunk` | `"<texto JSON-encoded>"` | Pedaço incremental da resposta |
| `done`  | `{}` | Stream finalizou com sucesso |
| `error` | `{"detail": "..."}` | Falha no servidor/Gemini |

**Exemplo de stream cru:**
```
event: chunk
data: "**Conceito** "

event: chunk
data: "Entropia mede a desordem..."

event: done
data: {}
```

### `POST /api/quiz`
**Body:**
```json
{ "topic": "Princípio da incerteza", "level": "Intermediário" }
```
**Resposta `200`:**
```json
[
  {
    "question": "Qual a forma do princípio da incerteza?",
    "options": ["...", "...", "$\\Delta x \\Delta p \\geq \\hbar/2$", "..."],
    "answer": 2
  }
]
```
Sempre retorna **3 perguntas** com **4 opções** cada e índice da correta (`0–3`).

---

## 9. Frontend

### Estado (em `app.js`)
| Variável | Tipo | Descrição |
|---|---|---|
| `messages` | `Array<{role, content}>` | Histórico completo enviado ao backend |
| `level` | `string` | "Iniciante" / "Intermediário" / "Avançado" |
| `activeModule` | `string \| null` | Módulo escolhido na sidebar |
| `lastTopic` | `string` | Usado pelo botão "Me teste" |
| `loading` | `boolean` | Bloqueia envios duplicados |

### Componentes principais
- **Seletor de nível** (3 botões) — atualiza `level`.
- **Sidebar de módulos** — 6 áreas pré-definidas (Mecânica Quântica, Relatividade, Termodinâmica Estatística, TQC, Cosmologia, Física de Partículas) com sub-tópicos clicáveis que injetam um prompt formatado.
- **Área de chat** — bolhas de usuário (direita, fundo `#1a1b2e`) e Planck (esquerda, borda ciano + avatar átomo animado).
- **Composer fixo** — input + botão Enviar (Enter envia, Shift+Enter quebra linha).
- **Botões "Me teste" e "Limpar"** — dispara quiz / limpa histórico.
- **Hambúrguer mobile** — abre/fecha a sidebar abaixo de 768px.

### Eventos-chave
| Evento | Função |
|---|---|
| `submit` no `<form>` | `sendMessage()` |
| `Enter` no textarea | `sendMessage()` |
| Click em `.topic-btn` | injeta prompt + envia |
| Click em `.level-btn` | troca `level` |
| Click em `#quizBtn` | `requestQuiz()` |

---

## 10. Design system

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#08090f` | Fundo geral + grid sutil |
| `--surface` | `#0d0e1a` | Bolhas Planck, painéis |
| `--surface-2` | `#1a1b2e` | Bolhas usuário |
| `--primary` (ciano) | `#00f5ff` | Acentos, borda Planck, avatar |
| `--secondary` (roxo) | `#7c3aed` | Realces secundários |
| `--text` | `#e6e6f0` | Corpo |
| Fonte títulos | **Orbitron** | Logo "Planck Academy" |
| Fonte corpo | **IBM Plex Mono** | Tudo o mais |

**Animações:**
- `@keyframes glow-pulse` — avatar átomo durante carregamento.
- `@keyframes caret-blink` — cursor `▍` durante streaming.
- Pontos de "digitando" — 3 dots pulsantes antes do primeiro chunk.

---

## 11. Streaming SSE explicado

**Por que SSE e não WebSocket?**
- Unidirecional servidor→cliente é exatamente o que precisamos.
- `EventSource` é nativo do navegador, sem libs.
- Atravessa proxies HTTP transparentemente.

**Por que GET com base64 e não POST?**
- `EventSource` da Web Platform só aceita `GET`.
- Codificar `{messages, level}` na URL exige base64 por causa de quebras de linha, aspas e UTF-8.
- Para payloads >8KB ou produção séria, considere migrar para `fetch` + `ReadableStream` (perde reconexão automática, mas suporta POST e cabeçalhos).

**Tratamento de erros do EventSource:**
- `readyState === CLOSED` sem `event: done` → mostra erro + botão "Tentar novamente".
- `event: error` com payload → mostra a mensagem do backend.
- Reconexão automática do navegador é desabilitada fechando explicitamente em erro.

---

## 12. Renderização LaTeX (KaTeX)

Carregado via CDN no `<head>`:
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
```

Após receber a resposta completa, chamamos:
```js
renderMathInElement(node, {
  delimiters: [
    { left: "$$", right: "$$", display: true },
    { left: "$",  right: "$",  display: false },
  ],
  throwOnError: false,
});
```

**Importante:** o prompt do sistema instrui o Gemini a usar **apenas** `$...$` e `$$...$$` — nunca `\(...\)` ou `\[...\]`, que KaTeX trataria como literais.

---

## 13. Prompt do tutor Planck

Construído em `build_system_prompt(level)`:

> Você é Planck, um tutor de Física Teórica. Personalidade: curiosa, paciente e apaixonada pela ciência. Use analogias do cotidiano…

**Adaptação por nível:**
| Nível | Estilo |
|---|---|
| Iniciante | Linguagem simples, sem jargão, foco em intuição |
| Intermediário | Notação matemática gradual, conexões entre conceitos |
| Avançado | Formalismo completo, derivações rigorosas, referências |

**Estrutura imposta** em toda resposta:
1. **Conceito** — definição
2. **Intuição** — analogia
3. **Matemática** — LaTeX (`$...$` / `$$...$$`)
4. **Exemplo** — caso resolvido
5. + 1-2 exercícios + pergunta de checagem

---

## 14. Segurança

⚠️ **Este projeto é de aprendizado/uso local.** Antes de subir em produção:

1. **CORS** — em `main.py` troque `allow_origins=["*"]` pelo seu domínio.
2. **Chave Gemini** — **nunca** comite o `.env`. Já está no padrão; confirme com `cat .gitignore`.
3. **Rate limiting** — adicione `slowapi` ou um proxy (Cloudflare, nginx) para evitar abuso da chave.
4. **Validação de tamanho** — limite `len(messages)` e tamanho total de tokens antes de chamar Gemini.
5. **Autenticação** — não há; qualquer cliente pode chamar a API. Adicione um header `Authorization` com JWT/API key se for público.
6. **HTTPS** — obrigatório em produção (sem TLS, EventSource pode ser bloqueado em algumas redes).

---

## 15. Solução de problemas

| Sintoma | Causa provável | Solução |
|---|---|---|
| `Não foi possível conectar ao servidor` | Backend não está rodando | Verifique o terminal do uvicorn |
| `Erro do servidor: Falha ao chamar Gemini: 401` | `GEMINI_API_KEY` inválida | Cheque o `.env` e o painel do Google AI Studio |
| `Erro do servidor: ...quota...` | Cota grátis estourada | Aguarde reset diário ou ative billing |
| `ModuleNotFoundError: fastapi` | venv não ativado ou `pip install` esquecido | Ative o venv e rode `pip install -r requirements.txt` |
| Equações aparecem como `$x^2$` cru | KaTeX não carregou | Verifique conexão (CDN) e o console do navegador |
| Stream trava no meio | Proxy/antivírus bufferizando SSE | Header `X-Accel-Buffering: no` já está enviado; tente outro navegador |
| CORS error no console | Origem do frontend não permitida | Confirme `allow_origins=["*"]` em dev |
| Nada acontece ao clicar em "Me teste" | Sem tópico ainda escolhido | Mande pelo menos uma pergunta antes |
| `payload inválido: ...` (400) | URL muito longa ou histórico gigante | Use o botão "Limpar" para resetar o chat |

**Logs úteis:**
- Backend: terminal do uvicorn (mostra cada request + tracebacks).
- Frontend: DevTools → Console (erros JS) + Network (eventos SSE em tempo real).

---

## 16. Performance e custos

- **Modelo:** Gemini 2.0 Flash — ~$0.075 por 1M tokens de input, ~$0.30 por 1M de output (preços de referência, consulte o painel atual).
- **Streaming** reduz percepção de latência (primeiro token <500ms na maioria dos casos), mas **não** reduz custo total.
- **Histórico crescente** = mais tokens enviados a cada request. Considere truncar em N mensagens ou resumir o início da conversa periodicamente.
- **Quiz** custa ~3x mais que uma resposta normal (gera 3 perguntas + opções).

---

## 17. Como contribuir / estender

### Adicionar um novo módulo na sidebar
Edite `MODULES` no topo de `app.js`:
```js
{
  name: "Mecânica Clássica",
  topics: ["Leis de Newton", "Lagrangiana", "Hamiltoniana"],
}
```

### Trocar o modelo Gemini
Em `main.py`:
```python
MODEL_NAME = "gemini-2.0-pro"  # mais caro, mais qualidade
```

### Adicionar persistência (localStorage)
No fim de `app.js`, escute mudanças em `messages` e `level`:
```js
window.addEventListener("beforeunload", () => {
  localStorage.setItem("planck:state", JSON.stringify({ messages, level }));
});
```
E restaure no `load`.

### Cancelar geração em andamento
Guarde a referência ao `EventSource` em escopo de módulo e exponha um botão "Parar" que chame `es.close()`.

### Adicionar markdown completo (negrito, listas, títulos)
Inclua `marked` ou `markdown-it` via CDN e troque `body.textContent = acc` por `body.innerHTML = marked.parse(acc)` (lembre de sanitizar com DOMPurify).

---

## 18. Roadmap

- [ ] **Persistência local** — salvar conversa entre sessões.
- [ ] **Markdown rico** — negrito, listas, código com syntax highlighting.
- [ ] **Botão "Parar geração"** — cancela o stream sem perder o que já foi escrito.
- [ ] **Exportar conversa** — Markdown ou PDF com equações renderizadas.
- [ ] **Modo "Derivação passo a passo"** — Planck deriva equações com pausa entre passos.
- [ ] **Histórico de quizzes + score** — gamificação leve.
- [ ] **Migração para Lovable Cloud** — Edge Function substitui o backend Python (deploy zero).
- [ ] **Dockerização** — `Dockerfile` + `docker-compose.yml`.
- [ ] **Testes** — `pytest` para o backend (mock do Gemini), Playwright para o frontend.

---

## 19. Licença & créditos

- **Código:** uso livre para fins educacionais. Adapte como quiser.
- **Gemini:** Google AI — sujeito aos [Termos de Uso do Google AI](https://ai.google.dev/terms).
- **KaTeX:** MIT License.
- **Fontes:** [Orbitron](https://fonts.google.com/specimen/Orbitron) e [IBM Plex Mono](https://fonts.google.com/specimen/IBM+Plex+Mono) — Open Font License.

---

**Construído com ⚛️ por entusiastas de física e IA.**
