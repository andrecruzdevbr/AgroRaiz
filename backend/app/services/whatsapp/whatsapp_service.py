"""
AgroRaiz - WhatsApp Service
Full Evolution API integration with anti-spam, debounce, retry.
"""
import asyncio
import hashlib
import re
from datetime import datetime
from typing import Optional

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class WhatsAppService:

    def __init__(self, redis_client):
        self.redis = redis_client
        self._base = settings.EVOLUTION_API_URL.rstrip("/")
        self._headers = {
            "apikey": settings.EVOLUTION_API_KEY,
            "Content-Type": "application/json",
        }
        self._instance = settings.EVOLUTION_INSTANCE_NAME

    # ─── Send ─────────────────────────────────────────────────────────────────

    async def send_text(
        self,
        phone: str,
        message: str,
        simulate_typing: bool = True,
        delay_ms: int = 1500,
        retry: int = 0,
    ) -> dict:
        """Send message with anti-spam, anti-loop and typing simulation."""
        phone_fmt = self._format_phone(phone)

        # Anti-spam: rate limit per number
        spam_key = f"wz:spam:{phone_fmt}"
        count = await self.redis.get(spam_key) or 0
        if int(count) >= settings.WHATSAPP_MAX_MSGS_PER_MINUTE:
            logger.warning("wz_rate_limit", phone=phone)
            return {"error": "rate_limit"}

        await self.redis.setex(spam_key, 60, int(count) + 1)

        # Anti-loop: prevent exact duplicate sends
        loop_key = f"wz:loop:{hashlib.md5(f'{phone}{message}'.encode()).hexdigest()}"
        if await self.redis.get(loop_key):
            logger.warning("wz_duplicate_prevented", phone=phone)
            return {"error": "duplicate"}

        await self.redis.setex(loop_key, 30, 1)

        # Simulate typing
        if simulate_typing:
            await self._send_presence(phone_fmt, "composing", delay_ms)
            await asyncio.sleep(delay_ms / 1000)

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{self._base}/message/sendText/{self._instance}",
                    headers=self._headers,
                    json={"number": phone_fmt, "text": message},
                )
                resp.raise_for_status()
                logger.info("wz_sent", phone=phone, chars=len(message))
                return resp.json()

        except httpx.HTTPError as e:
            logger.error("wz_send_error", phone=phone, error=str(e), retry=retry)
            if retry < 3:
                await asyncio.sleep(2 ** retry)
                return await self.send_text(phone, message, False, 0, retry + 1)
            return {"error": str(e)}

    async def send_image(self, phone: str, url: str, caption: str = "") -> dict:
        return await self._post(f"/message/sendMedia/{self._instance}", {
            "number": self._format_phone(phone),
            "mediatype": "image",
            "media": url,
            "caption": caption,
        })

    # ─── Webhook ──────────────────────────────────────────────────────────────

    async def process_webhook(self, payload: dict) -> dict:
        event = payload.get("event", "")
        data = payload.get("data", {})

        handlers = {
            "messages.upsert": self._handle_inbound_message,
            "messages.update": self._handle_status_update,
            "connection.update": self._handle_connection,
            "qrcode.updated": self._handle_qr,
        }

        handler = handlers.get(event)
        if handler:
            return await handler(data)
        return {"status": "ignored", "event": event}

    async def _handle_inbound_message(self, data: dict) -> dict:
        if data.get("key", {}).get("fromMe"):
            return {"status": "own_message"}

        phone = data.get("key", {}).get("remoteJid", "").split("@")[0]
        text = self._extract_text(data)

        if not phone or not text:
            return {"status": "no_content"}

        # Debounce: wait for burst of messages to settle
        debounce_key = f"wz:debounce:{phone}"
        await self.redis.setex(debounce_key, 3, text)
        await asyncio.sleep(2)

        latest = await self.redis.get(debounce_key)
        if latest and latest != text:
            return {"status": "debounced"}

        # Check if this is the admin phone with a pending stock reply
        from app.core.redis_client import get_redis
        redis = await get_redis()
        store_id = await redis.get("default_store_id")
        if store_id:
            pending_key = f"stock:pending_admin_reply:{store_id}"
            is_admin_reply = await redis.get(pending_key)

            # Also check if phone matches store admin number
            clean_phone = re.sub(r"[^0-9]", "", phone)
            store_wz = re.sub(r"[^0-9]", "", settings.STORE_WHATSAPP)
            is_admin_number = clean_phone.endswith(store_wz[-8:])

            if is_admin_reply and is_admin_number:
                from app.tasks.celery_app import process_admin_stock_reply
                process_admin_stock_reply.delay(
                    store_id=store_id, phone=phone, message=text
                )
                return {"status": "admin_stock_reply_queued", "phone": phone}

        # Regular message → AI pipeline
        from app.tasks.celery_app import process_whatsapp_message
        process_whatsapp_message.delay(phone=phone, message=text)

        return {"status": "queued", "phone": phone}

    async def _handle_status_update(self, data: dict) -> dict:
        # Update message delivery status
        external_id = data.get("key", {}).get("id")
        status = data.get("update", {}).get("status", "")
        if external_id and status:
            await self.redis.setex(f"wz:msg_status:{external_id}", 3600, status)
        return {"status": "updated"}

    async def _handle_connection(self, data: dict) -> dict:
        state = data.get("state", "unknown")
        await self.redis.set("wz:connection:status", state)
        logger.info("wz_connection", state=state)
        return {"status": "updated", "state": state}

    async def _handle_qr(self, data: dict) -> dict:
        qr = data.get("qrcode", {}).get("base64", "")
        if qr:
            await self.redis.setex("wz:qrcode", 120, qr)
        return {"status": "qr_updated"}

    # ─── Status & Info ────────────────────────────────────────────────────────

    async def get_status(self) -> dict:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"{self._base}/instance/connectionState/{self._instance}",
                    headers=self._headers,
                )
                state = resp.json()
        except Exception as e:
            state = {"error": str(e)}

        qr = await self.redis.get("wz:qrcode")
        connection = await self.redis.get("wz:connection:status") or "unknown"
        return {
            "state": state,
            "connection": connection,
            "qr_code": qr,
        }

    async def get_messages(self, phone: str, limit: int = 50) -> list:
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    f"{self._base}/chat/findMessages/{self._instance}",
                    headers=self._headers,
                    json={
                        "where": {
                            "key": {
                                "remoteJid": f"{self._format_phone(phone)}@s.whatsapp.net"
                            }
                        },
                        "limit": limit,
                    },
                )
                return resp.json().get("messages", {}).get("records", [])
        except Exception:
            return []

    # ─── Helpers ──────────────────────────────────────────────────────────────

    async def _send_presence(self, phone: str, presence: str, duration_ms: int):
        try:
            await self._post(
                f"/chat/sendPresence/{self._instance}",
                {
                    "number": phone,
                    "options": {"duration": duration_ms, "presence": presence},
                },
            )
        except Exception:
            pass  # Non-critical

    async def _post(self, endpoint: str, payload: dict) -> dict:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{self._base}{endpoint}",
                headers=self._headers,
                json=payload,
            )
            resp.raise_for_status()
            return resp.json()

    def _format_phone(self, phone: str) -> str:
        phone = re.sub(r"[^0-9]", "", phone)
        if not phone.startswith("55"):
            phone = f"55{phone}"
        return phone

    def _extract_text(self, data: dict) -> str:
        msg = data.get("message", {})
        if "conversation" in msg:
            return msg["conversation"]
        if "extendedTextMessage" in msg:
            return msg["extendedTextMessage"].get("text", "")
        if "buttonsResponseMessage" in msg:
            return msg["buttonsResponseMessage"].get("selectedDisplayText", "")
        if "listResponseMessage" in msg:
            return msg["listResponseMessage"].get("title", "")
        return ""
