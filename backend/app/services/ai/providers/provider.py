"""
AgroRaiz - AI Provider Layer
Desacoplado: troca de provider sem alterar lógica de negócio.

Providers suportados:
  - openrouter  (ativo, Google Gemini 2.5 Flash via OpenRouter)
  - anthropic   (futuro)
  - gemini      (futuro - Google AI direto)

Toda chamada de IA passa por AIProvider.chat() e AIProvider.complete().
"""
from __future__ import annotations

import re
import json
from abc import ABC, abstractmethod
from typing import Any

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


# ─── Base ─────────────────────────────────────────────────────────────────────

class BaseProvider(ABC):
    """Interface comum para todos os providers de IA."""

    @abstractmethod
    async def chat(
        self,
        system: str,
        messages: list[dict],
        max_tokens: int = 2048,
        temperature: float = 0.7,
    ) -> str:
        """Retorna texto gerado a partir de conversa multi-turno."""

    @abstractmethod
    async def complete(
        self,
        prompt: str,
        max_tokens: int = 1024,
        temperature: float = 0.7,
    ) -> str:
        """Retorna texto gerado a partir de prompt único (sem histórico)."""

    @property
    @abstractmethod
    def provider_name(self) -> str: ...

    @property
    @abstractmethod
    def model_name(self) -> str: ...


# ─── OpenRouter ───────────────────────────────────────────────────────────────

class OpenRouterProvider(BaseProvider):
    """
    OpenRouter — proxy para centenas de modelos (Gemini, Claude, GPT, Llama...).
    Usa API compatível com OpenAI.
    Docs: https://openrouter.ai/docs
    """

    BASE_URL = "https://openrouter.ai/api/v1"

    def __init__(self):
        self._key = settings.OPENROUTER_API_KEY
        self._model = settings.OPENROUTER_MODEL
        self._headers = {
            "Authorization": f"Bearer {self._key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://agroraiz.com.br",
            "X-Title": "AgroRaiz Platform",
        }

    async def chat(
        self,
        system: str,
        messages: list[dict],
        max_tokens: int = 2048,
        temperature: float = 0.7,
    ) -> str:
        payload = {
            "model": self._model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": [
                {"role": "system", "content": system},
                *messages,
            ],
        }
        return await self._post(payload)

    async def complete(
        self,
        prompt: str,
        max_tokens: int = 1024,
        temperature: float = 0.7,
    ) -> str:
        payload = {
            "model": self._model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": [{"role": "user", "content": prompt}],
        }
        return await self._post(payload)

    async def _post(self, payload: dict) -> str:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{self.BASE_URL}/chat/completions",
                headers=self._headers,
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"]

    @property
    def provider_name(self) -> str:
        return "openrouter"

    @property
    def model_name(self) -> str:
        return self._model


# ─── Anthropic (futuro) ───────────────────────────────────────────────────────

class AnthropicProvider(BaseProvider):
    """
    Anthropic Claude direto.
    Ativado quando AI_PROVIDER=anthropic.
    """

    def __init__(self):
        # Lazy import — anthropic pode não estar instalado
        try:
            import anthropic as _anthropic
            self._client = _anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        except ImportError:
            raise RuntimeError(
                "Anthropic SDK não instalado. "
                "Execute: pip install anthropic"
            )
        self._model = settings.AI_MODEL

    async def chat(
        self,
        system: str,
        messages: list[dict],
        max_tokens: int = 2048,
        temperature: float = 0.7,
    ) -> str:
        resp = await self._client.messages.create(
            model=self._model,
            max_tokens=max_tokens,
            system=system,
            messages=messages,
        )
        return resp.content[0].text

    async def complete(
        self,
        prompt: str,
        max_tokens: int = 1024,
        temperature: float = 0.7,
    ) -> str:
        resp = await self._client.messages.create(
            model=self._model,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
        return resp.content[0].text

    @property
    def provider_name(self) -> str:
        return "anthropic"

    @property
    def model_name(self) -> str:
        return self._model


# ─── Gemini direto (futuro) ───────────────────────────────────────────────────

class GeminiProvider(BaseProvider):
    """
    Google Gemini direto via google-generativeai SDK.
    Ativado quando AI_PROVIDER=gemini.
    """

    def __init__(self):
        try:
            import google.generativeai as genai
            genai.configure(api_key=settings.GEMINI_API_KEY)
            self._genai = genai
            self._model = settings.GEMINI_MODEL
        except ImportError:
            raise RuntimeError(
                "Google AI SDK não instalado. "
                "Execute: pip install google-generativeai"
            )

    async def chat(
        self,
        system: str,
        messages: list[dict],
        max_tokens: int = 2048,
        temperature: float = 0.7,
    ) -> str:
        model = self._genai.GenerativeModel(
            self._model,
            system_instruction=system,
        )
        history = [
            {
                "role": "user" if m["role"] == "user" else "model",
                "parts": [m["content"]],
            }
            for m in messages[:-1]
        ]
        chat = model.start_chat(history=history)
        resp = chat.send_message(messages[-1]["content"])
        return resp.text

    async def complete(
        self,
        prompt: str,
        max_tokens: int = 1024,
        temperature: float = 0.7,
    ) -> str:
        model = self._genai.GenerativeModel(self._model)
        resp = model.generate_content(prompt)
        return resp.text

    @property
    def provider_name(self) -> str:
        return "gemini"

    @property
    def model_name(self) -> str:
        return self._model


# ─── Factory ──────────────────────────────────────────────────────────────────

def get_ai_provider() -> BaseProvider:
    """
    Retorna o provider ativo com base em AI_PROVIDER no .env.
    Default: openrouter
    """
    provider = settings.AI_PROVIDER.lower()

    if provider == "openrouter":
        return OpenRouterProvider()
    elif provider == "anthropic":
        return AnthropicProvider()
    elif provider == "gemini":
        return GeminiProvider()
    else:
        logger.warning("unknown_ai_provider", provider=provider, fallback="openrouter")
        return OpenRouterProvider()


def get_provider_status() -> dict:
    """Retorna status do provider para healthcheck no dashboard."""
    try:
        p = get_ai_provider()
        return {
            "provider": p.provider_name,
            "model": p.model_name,
            "status": "configured",
            "key_set": bool(
                settings.OPENROUTER_API_KEY
                if p.provider_name == "openrouter"
                else settings.ANTHROPIC_API_KEY
            ),
        }
    except Exception as e:
        return {"provider": settings.AI_PROVIDER, "status": "error", "error": str(e)}
