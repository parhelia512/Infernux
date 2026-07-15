"""Restricted loopback MCP endpoint for an explicitly exported Debug Player."""
from __future__ import annotations

import hmac
import os
import threading
from typing import Any

_THREAD: threading.Thread | None = None


def start_player_gateway(control) -> bool:
    global _THREAD
    if _THREAD is not None and _THREAD.is_alive():
        return True
    if os.environ.get("_INFERNUX_PLAYER_DEBUG_BUILD") != "1" or os.environ.get("_INFERNUX_PLAYER_MCP_COMPILED") != "1":
        return False
    token = str(control.access_token or "")
    if len(token) < 16:
        return False
    from fastmcp import FastMCP

    port = int(os.environ.get("_INFERNUX_PLAYER_MCP_PORT", "9723"))
    if not 1024 <= port <= 65535:
        raise ValueError("Debug Player MCP port must be between 1024 and 65535.")
    server = FastMCP("Infernux Debug Player")

    def call(access_token: str, action: str, arguments: dict[str, Any] | None = None) -> dict:
        if not hmac.compare_digest(str(access_token or ""), token):
            raise PermissionError("Debug Player MCP access token mismatch.")
        return control.call_gateway(action, arguments or {})

    @server.tool(name="player_status")
    def player_status(access_token: str) -> dict:
        return call(access_token, "observe", {"include_scene_objects": True})

    @server.tool(name="player_key")
    def player_key(access_token: str, scancode: int, pressed: bool, repeat: bool = False) -> dict:
        return call(access_token, "key", {"scancode": int(scancode), "pressed": bool(pressed), "repeat": bool(repeat)})

    @server.tool(name="player_press")
    def player_press(access_token: str, scancode: int, duration_seconds: float = 0.1) -> dict:
        return call(access_token, "press", {"scancode": int(scancode), "duration_seconds": float(duration_seconds)})

    @server.tool(name="player_observe")
    def player_observe(access_token: str, object_names: list[str] | None = None, include_scene_objects: bool = False) -> dict:
        return call(access_token, "observe", {"object_names": object_names or [], "include_scene_objects": bool(include_scene_objects)})

    @server.tool(name="player_shutdown")
    def player_shutdown(access_token: str) -> dict:
        return call(access_token, "shutdown")

    _THREAD = threading.Thread(target=lambda: server.run(transport="streamable-http", host="127.0.0.1", port=port), name="InfernuxPlayerMCP", daemon=True)
    _THREAD.start()
    return True
