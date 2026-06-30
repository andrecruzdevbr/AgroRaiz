"""
AgroRaiz - Instagram Service
Meta Graph API: directs, comments, content publishing.
"""
import httpx
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

GRAPH_BASE = "https://graph.facebook.com/v21.0"


class InstagramService:

    def __init__(self, redis_client=None):
        self.redis = redis_client
        self._token = settings.INSTAGRAM_ACCESS_TOKEN
        self._account_id = settings.INSTAGRAM_BUSINESS_ID

    # ─── Directs / Conversations ──────────────────────────────────────────────

    async def get_conversations(self, limit: int = 20) -> list:
        """Fetch Instagram DM conversations."""
        return await self._get(
            f"/{self._account_id}/conversations",
            params={"fields": "id,participants,updated_time,messages{message,from,created_time}", "limit": limit},
        )

    async def send_reply(self, recipient_id: str, message: str) -> dict:
        """Reply to an Instagram DM."""
        return await self._post(
            f"/me/messages",
            {
                "recipient": {"id": recipient_id},
                "message": {"text": message},
                "messaging_type": "RESPONSE",
            },
        )

    async def get_direct_messages(self, conversation_id: str) -> dict:
        return await self._get(
            f"/{conversation_id}/messages",
            params={"fields": "message,from,created_time"},
        )

    # ─── Comments ────────────────────────────────────────────────────────────

    async def get_comments(self, media_id: str) -> dict:
        return await self._get(
            f"/{media_id}/comments",
            params={"fields": "id,text,username,timestamp,like_count"},
        )

    async def reply_to_comment(self, comment_id: str, message: str) -> dict:
        return await self._post(
            f"/{comment_id}/replies",
            {"message": message},
        )

    async def get_recent_media(self, limit: int = 10) -> list:
        return await self._get(
            f"/{self._account_id}/media",
            params={
                "fields": "id,caption,media_type,thumbnail_url,timestamp,like_count,comments_count",
                "limit": limit,
            },
        )

    # ─── Publishing ──────────────────────────────────────────────────────────

    async def create_image_container(self, image_url: str, caption: str) -> dict:
        """Step 1: upload image for post."""
        return await self._post(
            f"/{self._account_id}/media",
            {"image_url": image_url, "caption": caption},
        )

    async def publish_container(self, creation_id: str) -> dict:
        """Step 2: publish pre-created container."""
        return await self._post(
            f"/{self._account_id}/media_publish",
            {"creation_id": creation_id},
        )

    async def publish_post(self, image_url: str, caption: str) -> dict:
        """Create + publish in one call."""
        container = await self.create_image_container(image_url, caption)
        creation_id = container.get("id")
        if not creation_id:
            return {"error": "container_failed", "detail": container}
        return await self.publish_container(creation_id)

    # ─── Insights ────────────────────────────────────────────────────────────

    async def get_account_insights(self, period: str = "day") -> dict:
        return await self._get(
            f"/{self._account_id}/insights",
            params={
                "metric": "impressions,reach,profile_views,follower_count",
                "period": period,
            },
        )

    # ─── Webhook helpers ─────────────────────────────────────────────────────

    def verify_webhook(self, mode: str, token: str, challenge: str) -> str | None:
        """Verify webhook subscription from Meta."""
        if mode == "subscribe" and token == settings.INSTAGRAM_WEBHOOK_TOKEN:
            return challenge
        return None

    async def process_webhook(self, payload: dict) -> dict:
        """Route incoming webhook events."""
        for entry in payload.get("entry", []):
            for change in entry.get("changes", []):
                field = change.get("field")
                value = change.get("value", {})

                if field == "messages":
                    await self._handle_dm(value)
                elif field == "comments":
                    await self._handle_comment(value)

        return {"status": "processed"}

    async def _handle_dm(self, value: dict):
        from app.tasks.celery_app import process_instagram_message
        sender_id = value.get("sender", {}).get("id")
        text = value.get("message", {}).get("text", "")
        if sender_id and text:
            process_instagram_message.delay(sender_id=sender_id, message=text)
            logger.info("ig_dm_queued", sender=sender_id)

    async def _handle_comment(self, value: dict):
        logger.info("ig_comment_received", value=value)
        # Auto-reply to comments can be added here

    # ─── HTTP helpers ─────────────────────────────────────────────────────────

    async def _get(self, path: str, params: dict = None) -> dict | list:
        if not self._token:
            return {"error": "instagram_not_configured"}
        all_params = {"access_token": self._token, **(params or {})}
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                resp = await client.get(f"{GRAPH_BASE}{path}", params=all_params)
                resp.raise_for_status()
                data = resp.json()
                return data.get("data", data)
        except Exception as e:
            logger.error("ig_get_error", path=path, error=str(e))
            return {"error": str(e)}

    async def _post(self, path: str, payload: dict) -> dict:
        if not self._token:
            return {"error": "instagram_not_configured"}
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                resp = await client.post(
                    f"{GRAPH_BASE}{path}",
                    params={"access_token": self._token},
                    json=payload,
                )
                resp.raise_for_status()
                return resp.json()
        except Exception as e:
            logger.error("ig_post_error", path=path, error=str(e))
            return {"error": str(e)}
