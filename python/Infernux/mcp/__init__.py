"""Embedded MCP integration for the Infernux Editor and Debug Player."""

__all__ = ["current_config", "endpoint_url", "health_url", "is_running", "start_server", "stop_server"]


def __getattr__(name: str):
    """Keep editor-only server imports out of the optional Player gateway."""
    if name == "current_config":
        from Infernux.mcp.capabilities import current_config

        return current_config
    if name in {"endpoint_url", "health_url", "is_running", "start_server", "stop_server"}:
        from Infernux.mcp import server

        return getattr(server, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
