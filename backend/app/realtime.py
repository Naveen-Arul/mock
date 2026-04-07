from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from fastapi import WebSocket


@dataclass
class ConnectionInfo:
    websocket: WebSocket
    user_id: int
    role: str
    college_name: Optional[str]


class RealtimeManager:
    def __init__(self) -> None:
        self._connections: List[ConnectionInfo] = []

    async def connect(
        self,
        websocket: WebSocket,
        *,
        user_id: int,
        role: str,
        college_name: Optional[str],
    ) -> None:
        await websocket.accept()
        self._connections.append(
            ConnectionInfo(
                websocket=websocket,
                user_id=user_id,
                role=role,
                college_name=(college_name or None),
            )
        )

    def disconnect(self, websocket: WebSocket) -> None:
        self._connections = [c for c in self._connections if c.websocket is not websocket]

    async def broadcast_malpractice_update(
        self,
        payload: Dict[str, Any],
        *,
        college_name: Optional[str] = None,
    ) -> None:
        # Only admin/super_admin dashboards need malpractice push updates.
        targets = [
            c
            for c in self._connections
            if c.role in {"admin", "super_admin"}
            and (college_name is None or (c.college_name or "") == (college_name or ""))
        ]

        dead: List[WebSocket] = []
        for conn in targets:
            try:
                await conn.websocket.send_json(
                    {
                        "type": "malpractice_update",
                        "payload": payload,
                    }
                )
            except Exception:
                dead.append(conn.websocket)

        for ws in dead:
            self.disconnect(ws)


realtime_manager = RealtimeManager()
