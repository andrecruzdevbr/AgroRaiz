"""
AgroRaiz - WebSocket Endpoint
Real-time dashboard: messages, alerts, metrics.
"""
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from jose import JWTError

from app.core.websocket import ws_manager
from app.core.security import decode_token

router = APIRouter()


@router.websocket("/ws/{store_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    store_id: str,
    token: str = Query(...),
):
    """
    WebSocket for real-time dashboard updates.
    Authenticate via token query param.
    
    Events emitted:
    - new_message: incoming customer message
    - human_takeover: conversation needs human
    - metrics_update: dashboard KPIs refresh
    - conversation_update: status change
    """
    # Authenticate
    try:
        payload = decode_token(token)
        if payload.get("store_id") != store_id:
            await websocket.close(code=4001, reason="Unauthorized")
            return
    except JWTError:
        await websocket.close(code=4001, reason="Invalid token")
        return

    await ws_manager.connect(websocket, store_id)

    try:
        # Keep connection alive
        while True:
            # Accept ping/pong from client
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, store_id)
