from __future__ import annotations

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.realtime import realtime_manager
from app.utils.auth import verify_token


realtime_router = APIRouter()


@realtime_router.websocket("/ws/realtime")
async def realtime_socket(
    websocket: WebSocket,
    token: str = Query(default=""),
    db: Session = Depends(get_db),
):
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    try:
        payload = verify_token(token)
        user_id = int(payload.get("sub"))
        role = str(payload.get("role") or "")
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await realtime_manager.connect(
        websocket,
        user_id=user.id,
        role=role,
        college_name=user.college_name,
    )

    try:
        while True:
            # Keep-alive: client can send ping messages.
            _ = await websocket.receive_text()
    except WebSocketDisconnect:
        realtime_manager.disconnect(websocket)
    except Exception:
        realtime_manager.disconnect(websocket)
