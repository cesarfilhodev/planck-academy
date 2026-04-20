"""
Planck Academy - Backend FastAPI
Tutor de Física Teórica com IA (Gemini) — com streaming SSE
"""
import os
import json
import re
import base64
import asyncio
import random
import logging
from typing import List, Literal
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import google.generativeai as genai

logger = logging.getLogger("planck")

# ---------- Config ----------
load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise RuntimeError(
        "GEMINI_API_KEY não encontrada. Crie um arquivo .env com GEMINI_API_KEY=sua_chave."
    )

genai.configure(api_key=GEMINI_API_KEY)
MODEL_NAME = "gemini-2.5-flash"

# ---------- App ----------
app = FastAPI(title="Planck Academy API", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- Schemas ----------
class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str

class ChatRequest(BaseModel):
    messages: List[Message]
    level: str  # "Iniciante" | "Intermediário" | "Avançado"

class ChatResponse(BaseModel):
    reply: str

class QuizRequest(BaseModel):
    topic: str
    level: str

# ---------- System prompt ----------
def build_system_prompt(level: str) -> str:
    return f"""Você é Planck, um tutor de Física Teórica. Personalidade: curiosa, paciente e apaixonada pela ciência. Use analogias do cotidiano para explicar conceitos abstratos.

NÍVEL DO ALUNO: {level}
- Iniciante: linguagem simples, evite jargão, foque em intuição e analogias.
- Intermediário: introduza notação matemática gradualmente, conecte conceitos.
- Avançado: use formalismo completo, derivações rigorosas, referências a literatura.

FORMATO OBRIGATÓRIO da resposta — sempre estruture em quatro seções com títulos em negrito markdown:
**Conceito** — definição clara e contextualização.
**Intuição** — analogia do cotidiano ou imagem mental.
**Matemática** — equações em LaTeX. Use $...$ para inline e $$...$$ para bloco. NUNCA use \\( \\) ou \\[ \\].
**Exemplo** — caso concreto resolvido passo a passo.

Ao final de TODA explicação:
1. Proponha 1-2 exercícios de fixação adaptados ao nível.
2. Faça uma pergunta curta para checar compreensão (ex.: "Faz sentido até aqui?", "Consegue prever o que aconteceria se...?").

Adapte profundidade, vocabulário e nível matemático conforme o nível {level}. Seja conciso mas completo. Responda em português."""

# ---------- Helpers ----------
def to_gemini_history(messages: List[Message]) -> List[dict]:
    history = []
    for m in messages:
        role = "model" if m.role == "assistant" else "user"
        history.append({"role": role, "parts": [{"text": m.content}]})
    return history

def sse_pack(data: str, event: str | None = None) -> str:
    """Formata um evento SSE. Escapa quebras de linha como múltiplos data:."""
    out = ""
    if event:
        out += f"event: {event}\n"
    for line in data.split("\n"):
        out += f"data: {line}\n"
    out += "\n"
    return out

# ---------- Endpoints ----------
@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return Response(status_code=204)

@app.get("/")
def root():
    return {"name": "Planck Academy API", "status": "ok", "streaming": True}

@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """Endpoint não-streaming (fallback)."""
    if not req.messages:
        raise HTTPException(status_code=400, detail="messages não pode estar vazio.")
    
    system_prompt = build_system_prompt(req.level)
    model = genai.GenerativeModel(model_name=MODEL_NAME, system_instruction=system_prompt)
    history = to_gemini_history(req.messages)
    
    max_retries = 5
    base_delay = 1.0
    
    for attempt in range(max_retries):
        try:
            response = await model.generate_content_async(history)
            text = (response.text or "").strip()
            if not text:
                raise HTTPException(status_code=500, detail="Resposta vazia do modelo.")
            return ChatResponse(reply=text)
            
        except Exception as e:
            error_msg = str(e).lower()
            is_transient = "503" in error_msg or "429" in error_msg or "high demand" in error_msg or "quota" in error_msg
            
            if is_transient and attempt < max_retries - 1:
                delay = base_delay * (2 ** attempt) + random.uniform(0, 1)
                logger.warning(f"Erro transiente no chat (tentativa {attempt+1}/{max_retries}): {e}. Retentando em {delay:.2f}s...")
                await asyncio.sleep(delay)
                continue
            
            logger.error(f"Erro fatal ao chamar Gemini no chat: {e}")
            if isinstance(e, HTTPException):
                raise
            raise HTTPException(status_code=500, detail=f"Falha ao chamar Gemini: {e}")

@app.get("/api/chat/stream")
async def chat_stream(payload: str, request: Request):
    """
    Streaming SSE via EventSource.
    `payload` = base64(JSON({messages, level})) — passado como query string
    porque EventSource só suporta GET.

    Eventos emitidos:
      - event: chunk  → data: <texto parcial JSON-encoded>
      - event: done   → data: {}
      - event: error  → data: {"detail": "..."}
    """
    try:
        # Adiciona o padding base64 que pode ter sido removido no frontend
        padded_payload = payload + "=" * ((4 - len(payload) % 4) % 4)
        decoded = base64.urlsafe_b64decode(padded_payload.encode()).decode()
        body = json.loads(decoded)
        req = ChatRequest(**body)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"payload inválido: {e}")

    if not req.messages:
        raise HTTPException(status_code=400, detail="messages não pode estar vazio.")

    async def event_generator():
        system_prompt = build_system_prompt(req.level)
        model = genai.GenerativeModel(
            model_name=MODEL_NAME,
            system_instruction=system_prompt,
        )
        history = to_gemini_history(req.messages)

        max_retries = 5
        base_delay = 1.0

        for attempt in range(max_retries):
            any_chunk = False
            try:
                stream = await model.generate_content_async(history, stream=True)

                async for piece in stream:
                    try:
                        text = piece.text or ""
                    except Exception:
                        text = ""
                    if text:
                        any_chunk = True
                        yield sse_pack(json.dumps(text), event="chunk")

                if not any_chunk:
                    yield sse_pack(json.dumps({"detail": "Resposta vazia do modelo."}), event="error")
                else:
                    yield sse_pack("{}", event="done")
                
                return # Sucesso, encerra o gerador
                
            except Exception as e:
                error_msg = str(e).lower()
                is_transient = "503" in error_msg or "429" in error_msg or "high demand" in error_msg or "quota" in error_msg
                
                if is_transient and attempt < max_retries - 1:
                    if any_chunk:
                        yield sse_pack(json.dumps({"detail": "Conexão interrompida por alta demanda do modelo durante a resposta. Tente novamente."}), event="error")
                        return
                    
                    delay = base_delay * (2 ** attempt) + random.uniform(0, 1)
                    logger.warning(f"Erro transiente (tentativa {attempt+1}/{max_retries}): {e}. Retentando em {delay:.2f}s...")
                    await asyncio.sleep(delay)
                    continue
                else:
                    logger.error(f"Erro fatal ao chamar Gemini: {e}")
                    yield sse_pack(json.dumps({"detail": f"Falha ao chamar Gemini: {e}"}), event="error")
                    return

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

@app.post("/api/quiz")
async def quiz(req: QuizRequest):
    model = genai.GenerativeModel(model_name=MODEL_NAME)
    prompt = f"""Gere EXATAMENTE 3 perguntas de múltipla escolha sobre o tópico de física: "{req.topic}".
Nível do aluno: {req.level}.

Retorne APENAS um JSON válido (sem markdown, sem ```), com a seguinte estrutura:
[
  {{
    "question": "texto da pergunta (use $...$ para LaTeX inline se necessário)",
    "options": ["alternativa A", "alternativa B", "alternativa C", "alternativa D"],
    "answer": 0
  }},
  ...
]

Onde "answer" é o índice (0-3) da alternativa correta. Adapte a dificuldade ao nível {req.level}."""
    
    max_retries = 5
    base_delay = 1.0
    
    for attempt in range(max_retries):
        try:
            response = await model.generate_content_async(prompt)
            raw = (response.text or "").strip()
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"\s*```$", "", raw)
            match = re.search(r"\[.*\]", raw, re.DOTALL)
            if not match:
                raise HTTPException(status_code=500, detail="Modelo não retornou JSON válido.")
            
            data = json.loads(match.group(0))
            if not isinstance(data, list) or len(data) == 0:
                raise HTTPException(status_code=500, detail="Quiz retornado em formato inesperado.")
            
            for q in data:
                if not all(k in q for k in ("question", "options", "answer")):
                    raise HTTPException(status_code=500, detail="Pergunta sem campos obrigatórios.")
                if not isinstance(q["options"], list) or len(q["options"]) != 4:
                    raise HTTPException(status_code=500, detail="Cada pergunta precisa de 4 opções.")
            
            return data
            
        except Exception as e:
            error_msg = str(e).lower()
            is_transient = "503" in error_msg or "429" in error_msg or "high demand" in error_msg or "quota" in error_msg
            
            if is_transient and attempt < max_retries - 1:
                delay = base_delay * (2 ** attempt) + random.uniform(0, 1)
                logger.warning(f"Erro transiente no quiz (tentativa {attempt+1}/{max_retries}): {e}. Retentando em {delay:.2f}s...")
                await asyncio.sleep(delay)
                continue
                
            if isinstance(e, json.JSONDecodeError):
                logger.error(f"Erro ao parsear JSON do quiz: {e}")
                raise HTTPException(status_code=500, detail=f"Erro ao parsear JSON do quiz: {e}")
                
            logger.error(f"Erro fatal ao gerar quiz: {e}")
            if isinstance(e, HTTPException):
                raise
            raise HTTPException(status_code=500, detail=f"Falha ao gerar quiz: {e}")

# ---------- Run ----------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
