from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import uuid4

import httpx
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from ..config import settings
from ..db import pool

logger = logging.getLogger(__name__)

router = APIRouter()


class ConversationMessage(BaseModel):
    role: str
    content: str


class CollaborationAiRequest(BaseModel):
    prompt: str
    persona: str = Field(default="pm", pattern="^(pm|assistant)$")
    intent: str = Field(default="advise", pattern="^(notify|advise|both)$")
    context: Dict[str, Any] = Field(default_factory=dict)
    history: List[ConversationMessage] = Field(default_factory=list)


class CollaborationAiResponse(BaseModel):
    reply: str
    persona: str
    confidence: float = 0.75
    escalate: bool = False
    suggested_actions: Optional[List[str]] = None


class CollaborationMember(BaseModel):
    id: str
    thread_id: str
    persona: str
    name: str
    role: str
    history_access: str
    created_by: Optional[str] = None
    created_at: datetime


class CollaborationMemberCreate(BaseModel):
    thread_id: str
    persona: str = Field(pattern="^(pm|engineer|scm|supervisor|crew|ai)$")
    name: str
    role: str
    history_access: str = Field(default="full", pattern="^(full|current)$")
    created_by: Optional[str] = None


def _extract_payload(context: Dict[str, Any]) -> Dict[str, Any]:
    if not context:
        return {}
    if "payload" in context:
        payload = context.get("payload") or {}
        if isinstance(payload, dict):
            return payload
    return context


def _build_system_prompt(payload: Dict[str, Any], persona: str) -> str:
    scope = payload.get("scope") or {}
    process = scope.get("process_name") or scope.get("process_id") or "the target process"
    project = scope.get("project_name") or scope.get("project_id") or "the program"
    persona_title = "construction project manager" if persona == "pm" else "AI assistant embedded inside the control tower"
    return (
        f"You are {persona_title} supporting {project}. "
        f"Act as a real teammate and respond in first person. "
        f"Reference the alarm context when useful and keep responses concise, actionable, and professional.\n"
        f"Alarm payload:\n{json.dumps(payload, indent=2)}"
    )


def _build_user_prompt(request: CollaborationAiRequest, payload: Dict[str, Any]) -> str:
    status = payload.get("status") or "open"
    severity = payload.get("severity") or payload.get("type") or "critical"
    message = payload.get("message") or payload.get("title") or "the active alarm"
    intent_text = {
        "notify": "They mainly want you to acknowledge and confirm next steps.",
        "advise": "They need coaching on what action to take.",
        "both": "They are alerting you and also need your guidance.",
    }[request.intent]
    return (
        f"Alarm status: {status}, severity {severity}. Summary: {message}.\n"
        f"{intent_text}\n"
        f"Engineer says: {request.prompt}\n"
        "Answer as yourself, mention approvals when relevant, and propose 2-3 next steps."
    )


async def _call_openai(messages: List[Dict[str, str]]) -> Optional[str]:
    if not settings.openai_api_key:
        return None
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.openai_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.openai_model,
                    "messages": messages,
                    "temperature": 0.2,
                    "max_tokens": 320,
                },
            )
        response.raise_for_status()
        data = response.json()
        content = data["choices"][0]["message"]["content"]
        return content.strip()
    except Exception as exc:  # pragma: no cover - network errors
        logger.warning("OpenAI request failed, falling back to heuristic response: %s", exc)
        return None


def _fallback_response(payload: Dict[str, Any], request: CollaborationAiRequest) -> CollaborationAiResponse:
    scope = payload.get("scope") or {}
    process = scope.get("process_name") or scope.get("process_id") or "the process"
    coverage = payload.get("kpis", {}).get("coveragePct")
    buffer_days = payload.get("kpis", {}).get("bufferDays")
    coverage_text = f"{coverage}% coverage" if coverage is not None else "current coverage"
    buffer_text = f"{buffer_days} day buffer" if buffer_days is not None else "limited buffer"
    reply = (
        f"Thanks for the update. I see the signal on {process} with {coverage_text} and {buffer_text}. "
        "You have my approval to proceed—log the change request and make sure procurement gets the paperwork. "
        "I'll brief finance once the CR is in the queue."
    )
    suggested = [
        "Submit the CR with revised excavator requirement",
        "Document the cost / schedule delta under the alarm thread",
        "Ping procurement so they can source the additional capacity",
    ]
    escalate = request.intent in {"notify", "both"}
    return CollaborationAiResponse(
        reply=reply,
        persona="pm",
        confidence=0.55,
        escalate=escalate,
        suggested_actions=suggested,
    )


@router.post("/ai/respond", response_model=CollaborationAiResponse)
async def collaboration_ai_respond(request: CollaborationAiRequest):
    payload = _extract_payload(request.context)
    system_prompt = _build_system_prompt(payload, request.persona)
    user_prompt = _build_user_prompt(request, payload)
    history = request.history[-8:]
    messages = [{"role": "system", "content": system_prompt}]
    for item in history:
        messages.append({"role": item.role, "content": item.content})
    messages.append({"role": "user", "content": user_prompt})

    ai_reply = await _call_openai(messages)
    if not ai_reply:
        return _fallback_response(payload, request)

    escalate = request.intent in {"notify", "both"}
    suggested = None
    if "next step" in ai_reply.lower():
        suggested = [line.strip(" -•") for line in ai_reply.splitlines() if line.strip().startswith(("-", "•", "1", "2", "3"))]
        suggested = [item for item in suggested if item]
        if not suggested:
            suggested = None

    return CollaborationAiResponse(
        reply=ai_reply,
        persona=request.persona,
        confidence=0.82,
        escalate=escalate,
        suggested_actions=suggested,
    )


@router.get("/members", response_model=List[CollaborationMember])
def list_collaboration_members(thread_id: str = Query(..., alias="threadId")):
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id::text, thread_id, persona, name, role, history_access, created_by, created_at
                FROM dipgos.collaboration_members
                WHERE thread_id = %s
                ORDER BY created_at
                """,
                (thread_id,),
            )
            rows = cur.fetchall()
    return [
        CollaborationMember(
            id=row[0],
            thread_id=row[1],
            persona=row[2],
            name=row[3],
            role=row[4],
            history_access=row[5],
            created_by=row[6],
            created_at=row[7],
        )
        for row in rows
    ]


@router.post("/members", response_model=CollaborationMember, status_code=status.HTTP_201_CREATED)
def create_collaboration_member(payload: CollaborationMemberCreate):
    member_id = uuid4()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO dipgos.collaboration_members (id, thread_id, persona, name, role, history_access, created_by)
                VALUES (%s,%s,%s,%s,%s,%s,%s)
                RETURNING id::text, thread_id, persona, name, role, history_access, created_by, created_at
                """,
                (
                    member_id,
                    payload.thread_id,
                    payload.persona,
                    payload.name,
                    payload.role,
                    payload.history_access,
                    payload.created_by,
                ),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unable to add collaborator")
            conn.commit()
    return CollaborationMember(
        id=row[0],
        thread_id=row[1],
        persona=row[2],
        name=row[3],
        role=row[4],
        history_access=row[5],
        created_by=row[6],
        created_at=row[7],
    )
