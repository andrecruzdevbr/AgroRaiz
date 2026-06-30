"""
AgroRaiz - WebSocket Manager
Real-time updates: new messages, human takeover alerts, metrics refresh.
"""
import json
from typing import Dict, Set
from uuid import UUID

from fastapi import WebSocket

from app.core.logging import get_logger

logger = get_logger(__name__)


class ConnectionManager:
    """
    Manages WebSocket connections per store.
    Broadcasts updates to all connected dashboards of a store.
    """

    def __init__(self):
        # store_id -> set of WebSocket connections
        self._connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, store_id: str):
        await websocket.accept()
        if store_id not in self._connections:
            self._connections[store_id] = set()
        self._connections[store_id].add(websocket)
        logger.info("ws_connected", store_id=store_id, total=len(self._connections[store_id]))

    def disconnect(self, websocket: WebSocket, store_id: str):
        if store_id in self._connections:
            self._connections[store_id].discard(websocket)
            if not self._connections[store_id]:
                del self._connections[store_id]
        logger.info("ws_disconnected", store_id=store_id)

    async def broadcast(self, store_id: str, event: str, data: dict):
        """Send event to all connected clients of a store."""
        if store_id not in self._connections:
            return

        payload = json.dumps({"event": event, "data": data})
        dead = set()

        for ws in self._connections[store_id].copy():
            try:
                await ws.send_text(payload)
            except Exception:
                dead.add(ws)

        # Clean up dead connections
        for ws in dead:
            self._connections[store_id].discard(ws)

    async def broadcast_new_message(self, store_id: str, conversation_id: str, message: dict):
        await self.broadcast(store_id, "new_message", {
            "conversation_id": conversation_id,
            "message": message,
        })

    async def broadcast_human_takeover(self, store_id: str, phone: str, reason: str):
        await self.broadcast(store_id, "human_takeover", {
            "phone": phone,
            "reason": reason,
            "priority": "high" if reason in ["frustrated", "requested"] else "normal",
        })

    async def broadcast_metrics_update(self, store_id: str, metrics: dict):
        await self.broadcast(store_id, "metrics_update", metrics)

    def active_connections_count(self, store_id: str) -> int:
        return len(self._connections.get(store_id, set()))


# Global singleton
ws_manager = ConnectionManager()
