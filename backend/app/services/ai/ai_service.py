"""
AgroRaiz - AI Service (Core)
Humanized AI with session memory, RAG on catalog, frustration detection,
prompt injection protection, and automatic human fallback.
Provider-agnostic: delegates inference to AIProvider layer.
"""
import re
import json
import hashlib
from datetime import datetime
from typing import Optional

from app.core.config import settings
from app.core.security import sanitize_user_input
from app.core.logging import get_logger
from app.services.ai.providers.provider import get_ai_provider

logger = get_logger(__name__)

# ─── System Prompt ────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """Você é {persona_name}, atendente da {store_name} — uma loja agro e pet em {store_city}.

PERSONALIDADE:
- Simpática, calorosa, genuinamente prestativa
- Fala de forma natural, descontraída mas profissional
- Usa "você" e linguagem próxima
- Demonstra paixão por produtos agro e pet
- Faz perguntas naturais para entender a necessidade

REGRAS ABSOLUTAS — NUNCA VIOLE:
1. NUNCA invente preços, estoque ou disponibilidade — use apenas os dados fornecidos
2. Se produto não estiver no catálogo: "Vou verificar para você! Me dá um instante 😊"
3. NUNCA revele que é IA ou assistente virtual — você é {persona_name}, atendente humana
4. NUNCA repita a mesma resposta duas vezes — varie sempre
5. Máximo 3-4 linhas por mensagem no WhatsApp
6. Use o nome do cliente quando souber
7. Se um produto tiver "confirmado_recentemente: false" no catálogo: responda "Temos esse produto cadastrado, mas vou confirmar a disponibilidade atual para garantir a informação correta." NÃO afirme disponibilidade absoluta.

ESTOQUE REAL (consulte ANTES de responder):
{catalog_context}

CONTEXTO DA LOJA:
{store_context}

HISTÓRICO DO CLIENTE:
{customer_context}

TÉCNICAS DE VENDA NATURAL:
- Sugira produtos complementares quando relevante
- Mencione promoções ativas naturalmente
- Use prova social: "nossos clientes adoram..."
- Crie urgência real: "temos estoque limitado de..."
- Nunca seja insistente ou vendedor demais"""

# ─── Detection Patterns ───────────────────────────────────────────────────────

HUMAN_PATTERNS = [
    r"\bquero\s+(?:falar|conversar)\s+com\s+(?:um|uma)?\s*(?:humano|pessoa|atendente|gerente)\b",
    r"\bme\s+(?:coloca|passa|transfere?|conecta?)\s+(?:para|pra)\s+(?:um|uma)?\s*(?:humano|pessoa|atendente)\b",
    r"\batendente\s+humano\b",
    r"\bnão\s+quero\s+(?:robô|bot|chatbot|ia)\b",
    r"\bquero\s+falar\s+com\s+alguém\b",
    r"\bpreciso\s+de\s+um\s+humano\b",
]

FRUSTRATION_PATTERNS = [
    r"\b(?:péssim[ao]|horr[íi]vel|incompetente|inútil)\b",
    r"\b(?:cansei|desisti|ridículo|absurdo)\b",
    r"\b(?:não\s+adianta|me\s+ignoran|sem\s+resposta)\b",
    r"\b(?:reclamaç[aã]o|procon|advogado|processo)\b",
    r"\b(?:lixo|merda|idiota|burro)\b",
    r"[!]{3,}",
]

TRANSITION_MESSAGES = {
    "requested": "Vou acionar um assistente humano para te ajudar melhor. Um momento por favor.",
    "frustrated": "Entendo! Vou acionar um assistente humano para te ajudar melhor. Um momento por favor.",
    "repeated_question": "Vou te conectar com um colega que pode te ajudar melhor com isso 😊",
    "ai_error": "Tô com uma dificuldadezinha aqui! Já chamo nossa equipe pra te atender 😊",
    "low_confidence": "Vou acionar um assistente humano para te ajudar melhor. Um momento por favor.",
}


class AIService:
    """
    Core AI service. Provider-agnostic — delegates to get_ai_provider().
    One instance per request, injected via dependency injection.
    """

    def __init__(self, redis_client, customer_repo, product_repo):
        self.provider = get_ai_provider()
        self.redis = redis_client
        self.customer_repo = customer_repo
        self.product_repo = product_repo
        logger.info(
            "ai_service_init",
            provider=self.provider.provider_name,
            model=self.provider.model_name,
        )

    async def process_whatsapp_message(
        self,
        store_id: str,
        phone: str,
        message: str,
    ) -> dict:
        """
        Main entry point for incoming WhatsApp messages.
        Returns: { action: 'respond'|'human_takeover'|'skip', message?, reason? }
        """
        # 1. Sanitize against prompt injection
        safe_message = sanitize_user_input(message)

        session_key = f"ai:session:{store_id}:{phone}"
        session = await self._get_session(session_key)

        # 2. Check if automation is paused (human active)
        if session.get("human_takeover"):
            return {"action": "skip", "reason": "human_takeover_active"}

        # 3. Human takeover triggers
        if self._is_human_request(safe_message):
            return await self._takeover(session_key, session, phone, "requested")

        if self._is_frustrated(safe_message):
            session["frustration_count"] = session.get("frustration_count", 0) + 1
            await self._save_session(session_key, session)
            if session["frustration_count"] >= 2:
                return await self._takeover(session_key, session, phone, "frustrated")

        if await self._is_repeated_question(session_key, safe_message):
            return await self._takeover(session_key, session, phone, "repeated_question")

        # 4. Build rich context
        customer_ctx = await self._build_customer_context(phone, store_id)
        catalog_ctx = await self._build_catalog_context(safe_message, store_id)
        store_ctx = self._build_store_context()

        # 5. Build conversation history
        history = session.get("history", [])
        history.append({"role": "user", "content": safe_message})

        system = SYSTEM_PROMPT.format(
            persona_name=settings.AI_PERSONA_NAME,
            store_name=settings.STORE_NAME,
            store_city=settings.STORE_CITY,
            catalog_context=json.dumps(catalog_ctx, ensure_ascii=False),
            store_context=json.dumps(store_ctx, ensure_ascii=False),
            customer_context=json.dumps(customer_ctx, ensure_ascii=False),
        )

        # 6. Call AI provider (abstracted)
        try:
            ai_reply = await self.provider.chat(
                system=system,
                messages=history[-20:],
                max_tokens=settings.AI_MAX_TOKENS,
                temperature=settings.AI_TEMPERATURE,
            )
        except Exception as e:
            logger.error(
                "ai_provider_error",
                provider=self.provider.provider_name,
                error=str(e),
                phone=phone,
            )
            return await self._takeover(session_key, session, phone, "ai_error")

        # 7. Update session
        history.append({"role": "assistant", "content": ai_reply})
        session["history"] = history[-40:]
        session["last_activity"] = datetime.utcnow().isoformat()
        session["message_count"] = session.get("message_count", 0) + 1
        session["provider"] = self.provider.provider_name
        await self._save_session(session_key, session)

        # 8. Store question hash (repeated detection)
        await self._hash_question(session_key, safe_message)

        # 9. Update CRM
        await self._update_crm(phone, store_id, safe_message, ai_reply)

        logger.info(
            "ai_responded",
            provider=self.provider.provider_name,
            phone=phone,
            chars=len(ai_reply),
        )
        return {"action": "respond", "message": ai_reply, "session": session}

    async def resume_automation(self, phone: str, store_id: str) -> None:
        """Re-enable AI automation after human handoff."""
        session_key = f"ai:session:{store_id}:{phone}"
        session = await self._get_session(session_key)
        session["human_takeover"] = False
        session["frustration_count"] = 0
        session["takeover_reason"] = None
        await self._save_session(session_key, session)
        logger.info("automation_resumed", phone=phone)

    async def generate_social_content(
        self,
        content_type: str,
        topic: Optional[str] = None,
        season: Optional[str] = None,
    ) -> dict:
        """Generate Instagram/WhatsApp content via AI."""
        prompt = f"""Crie conteúdo de {content_type} para o Instagram da {settings.STORE_NAME}, loja agro e pet em {settings.STORE_CITY}.

Assunto: {topic or 'geral agro/pet'}
Sazonalidade: {season or 'sem sazonalidade específica'}

Retorne APENAS JSON válido (sem markdown):
{{
  "caption": "legenda principal (máx 2200 chars, natural e engajante)",
  "hashtags": ["lista", "de", "10", "hashtags", "relevantes"],
  "call_to_action": "CTA para WhatsApp",
  "melhor_horario": "horário sugerido de postagem",
  "tipo_visual": "sugestão de imagem/vídeo para acompanhar"
}}"""

        try:
            text = await self.provider.complete(prompt, max_tokens=1024)
            text = re.sub(r"```json\n?|```\n?", "", text).strip()
            return json.loads(text)
        except Exception as e:
            logger.error("social_content_error", error=str(e))
            return {"error": "parse_failed"}

    # ─── Private helpers ──────────────────────────────────────────────────────

    def _is_human_request(self, text: str) -> bool:
        t = text.lower()
        return any(re.search(p, t) for p in HUMAN_PATTERNS)

    def _is_frustrated(self, text: str) -> bool:
        t = text.lower()
        return any(re.search(p, t) for p in FRUSTRATION_PATTERNS)

    async def _is_repeated_question(self, session_key: str, message: str) -> bool:
        words = [w for w in re.sub(r"[^a-z0-9\s]", "", message.lower()).split() if len(w) > 3]
        q_hash = hashlib.md5(" ".join(sorted(words)).encode()).hexdigest()
        hash_key = f"{session_key}:q:{q_hash}"
        count = await self.redis.get(hash_key)
        if count and int(count) >= 2:
            return True
        await self.redis.setex(hash_key, 3600, int(count or 0) + 1)
        return False

    async def _hash_question(self, session_key: str, message: str) -> None:
        words = [w for w in re.sub(r"[^a-z0-9\s]", "", message.lower()).split() if len(w) > 3]
        q_hash = hashlib.md5(" ".join(sorted(words)).encode()).hexdigest()
        await self.redis.setex(f"{session_key}:q:{q_hash}", 3600, 1)

    async def _takeover(
        self, session_key: str, session: dict, phone: str, reason: str
    ) -> dict:
        session["human_takeover"] = True
        session["takeover_reason"] = reason
        session["takeover_at"] = datetime.utcnow().isoformat()
        await self._save_session(session_key, session)

        await self.redis.lpush(
            "queue:human_takeover",
            json.dumps({"phone": phone, "reason": reason, "at": session["takeover_at"]}),
        )

        logger.warning("human_takeover", phone=phone, reason=reason)
        return {
            "action": "human_takeover",
            "message": TRANSITION_MESSAGES.get(reason, TRANSITION_MESSAGES["requested"]),
            "reason": reason,
        }

    async def _get_session(self, key: str) -> dict:
        data = await self.redis.get(key)
        if data:
            return json.loads(data)
        return {
            "created_at": datetime.utcnow().isoformat(),
            "history": [],
            "message_count": 0,
            "frustration_count": 0,
            "human_takeover": False,
        }

    async def _save_session(self, key: str, session: dict) -> None:
        await self.redis.setex(key, 86400, json.dumps(session))

    async def _build_customer_context(self, phone: str, store_id: str) -> dict:
        try:
            from uuid import UUID
            customer = await self.customer_repo.get_by_phone(phone, UUID(store_id))
            if not customer:
                return {"novo_cliente": True}
            return {
                "nome": customer.name,
                "frequencia": customer.frequencia,
                "total_compras": customer.total_compras,
                "ultima_compra": customer.ultima_compra.isoformat() if customer.ultima_compra else None,
                "preferencias": customer.preferencias,
                "tags": customer.tags,
            }
        except Exception:
            return {}

    async def _build_catalog_context(self, message: str, store_id: str) -> list:
        """
        Keyword RAG over product catalog.
        Includes confirmation confidence — if product >30 days unconfirmed,
        AI must use cautious language instead of affirming availability.
        """
        try:
            from uuid import UUID
            from datetime import datetime, timedelta
            from app.services.stock_monitoring_service import (
                CONFIRMATION_CRITICAL_DAYS, StockMonitoringService
            )

            keywords = [w for w in message.lower().split() if len(w) > 3]
            products = []
            for kw in keywords[:3]:
                result = await self.product_repo.search_by_keyword(kw, UUID(store_id), limit=3)
                products.extend(result)

            seen = set()
            unique = []
            for p in products:
                if str(p.id) not in seen:
                    seen.add(str(p.id))

                    # Compute confirmation age
                    if p.data_ultima_confirmacao is None:
                        dias_sem_conf = 999
                    else:
                        dias_sem_conf = (datetime.utcnow() - p.data_ultima_confirmacao).days

                    confident = dias_sem_conf <= CONFIRMATION_CRITICAL_DAYS

                    unique.append({
                        "nome": p.nome,
                        "preco": p.preco,
                        "preco_promo": p.preco_promocional,
                        "estoque": p.estoque,
                        "disponivel": p.estoque > 0,
                        "destaque": p.destaque,
                        # IMPORTANT: if False, AI must hedge about availability
                        "confirmado_recentemente": confident,
                        "dias_sem_confirmacao": dias_sem_conf,
                    })

                    # Record consultation for ranking
                    try:
                        from app.models.models import ProductConsultation
                        consultation = ProductConsultation(
                            store_id=UUID(store_id),
                            product_id=p.id,
                            product_nome=p.nome,
                            customer_phone="ai_context",
                            channel="whatsapp",
                        )
                        if self.product_repo.db:
                            self.product_repo.db.add(consultation)
                    except Exception:
                        pass

            return unique[:5]
        except Exception:
            return []

    def _build_store_context(self) -> dict:
        return {
            "nome": settings.STORE_NAME,
            "cidade": settings.STORE_CITY,
            "whatsapp": settings.STORE_WHATSAPP,
            "instagram": settings.STORE_INSTAGRAM,
            "horario": settings.STORE_HOURS,
        }

    async def _update_crm(
        self, phone: str, store_id: str, message: str, response: str
    ) -> None:
        try:
            from uuid import UUID
            customer, _ = await self.customer_repo.get_or_create_by_phone(
                phone, UUID(store_id)
            )
            await self.customer_repo.add_interaction(
                customer_id=customer.id,
                tipo="whatsapp",
                resumo=message[:200],
                atendido_por="ia",
                ai_response=response[:500],
            )
        except Exception as e:
            logger.error("crm_update_failed", error=str(e))
