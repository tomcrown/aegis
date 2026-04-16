"""
Central settings loaded once at import time via pydantic-settings.
All values sourced from environment / .env — never hardcoded.
"""
from __future__ import annotations

from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    pacifica_rest_url: str = "https://test-api.pacifica.fi/api/v1"
    pacifica_ws_url: str = "wss://test-ws.pacifica.fi/ws"
    pacifica_api_config_key: str = ""

    agent_key_private_key_b58: str = ""   
    agent_key_public_key: str = ""

    fernet_master_key: str  

    redis_url: str = "redis://localhost:6379/0"

    elfa_api_key: str = ""
    elfa_base_url: str = "https://api.elfa.ai/v2"

    fuul_api_key: str = ""          
    fuul_trigger_key: str = ""     

    builder_code: str = "AEGIS"           # immutable
    vault_wallet_address: str = ""
    vault_premium_bps: int = 10           # 10 bps = 0.10%

    log_level: str = "INFO"
    cors_origins: list[str] = ["http://localhost:5173"]

    @field_validator("builder_code", mode="before")
    @classmethod
    def _lock_builder_code(cls, v: str) -> str:
        """Enforce builder_code is always AEGIS regardless of env."""
        return "AEGIS"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _parse_cors(cls, v: str | list[str]) -> list[str]:
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",")]
        return v


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
