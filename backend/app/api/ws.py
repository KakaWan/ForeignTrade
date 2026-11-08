"""WebSocket endpoint for real-time progress updates.

Used for:
- Batch email deduction progress
- Batch email verification progress
- AI generation progress
"""

import asyncio
from typing import Dict, Set

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

router = APIRouter(tags=["websocket"])


class ProgressMessage(BaseModel):
    """WebSocket message format for progress updates."""
    type: str  # deduction_progress / verification_progress / ai_progress
    task_id: str
    total: int
    completed: int
    current_item: str = ""
    status: str = "running"  # running / completed / failed
    detail: str = ""


# In-memory connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, client_id: str):
        await websocket.accept()
        if client_id not in self.active_connections:
            self.active_connections[client_id] = set()
        self.active_connections[client_id].add(websocket)

    def disconnect(self, websocket: WebSocket, client_id: str):
        if client_id in self.active_connections:
            self.active_connections[client_id].discard(websocket)
            if not self.active_connections[client_id]:
                del self.active_connections[client_id]

    async def send_progress(self, client_id: str, message: ProgressMessage):
        """Send progress update to all connections of a client."""
        if client_id in self.active_connections:
            data = message.model_dump_json()
            disconnected = set()
            for ws in self.active_connections[client_id]:
                try:
                    await ws.send_text(data)
                except Exception:
                    disconnected.add(ws)
            for ws in disconnected:
                self.active_connections[client_id].discard(ws)

    async def broadcast(self, message: ProgressMessage):
        """Broadcast to all connected clients."""
        for client_id in list(self.active_connections.keys()):
            await self.send_progress(client_id, message)


manager = ConnectionManager()


@router.websocket("/ws/progress")
async def progress_websocket(websocket: WebSocket):
    """WebSocket endpoint for progress updates.

    Client connects and receives real-time progress messages
    for background tasks (email deduction, verification, etc.).
    """
    client_id = id(websocket)  # Use object id as unique client identifier
    await manager.connect(websocket, str(client_id))
    try:
        while True:
            # Keep connection alive, client can send pings
            data = await websocket.receive_text()
            # Echo back for keepalive
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket, str(client_id))


# Utility function for services to send progress
async def emit_progress(
    task_type: str,
    task_id: str,
    total: int,
    completed: int,
    current_item: str = "",
    status: str = "running",
    detail: str = "",
):
    """Emit a progress update to all connected WebSocket clients."""
    msg = ProgressMessage(
        type=task_type,
        task_id=task_id,
        total=total,
        completed=completed,
        current_item=current_item,
        status=status,
        detail=detail,
    )
    await manager.broadcast(msg)
