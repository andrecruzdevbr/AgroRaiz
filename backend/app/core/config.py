"""
AgroRaiz Platform - Core Configuration
All environment variables centralized here.
"""
from functools import lru_cache
from typing import List
from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ─── App ─────────────────────────────────────────────────────────────────
    APP_NAME: str = "AgroRaiz Platform"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    SECRET_KEY: str = "change-me-in-production"
    ALLOWED_HOSTS: List[str] = ["*"]
    CORS_ORIGINS: List[str] = ["http://localhost:3000"]

    # ─── Database ─────────────────────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://agroraiz:agroraiz@localhost:5432/agroraiz"
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    DB_ECHO: bool = False

    # ─── Redis ────────────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_CACHE_TTL: int = 3600

    # ─── JWT ─────────────────────────────────────────────────────────────────
    JWT_SECRET_KEY: str = "change-me-jwt-secret"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # ─── AI Provider ─────────────────────────────────────────────────────────
    # Opções: openrouter | anthropic | gemini
    AI_PROVIDER: str = "openrouter"
    AI_MAX_TOKENS: int = 2048
    AI_TEMPERATURE: float = 0.7
    AI_PERSONA_NAME: str = "Ana"

    # OpenRouter (provider ativo)
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_MODEL: str = "google/gemini-2.5-flash"

    # Anthropic (provider futuro)
    ANTHROPIC_API_KEY: str = ""
    AI_MODEL: str = "claude-opus-4-5"  # usado quando AI_PROVIDER=anthropic

    # Gemini direto (provider futuro)
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash"

    # ─── Evolution API (WhatsApp) ────────────────────────────────────────────
    EVOLUTION_API_URL: str = "http://localhost:8080"
    EVOLUTION_API_KEY: str = ""
    EVOLUTION_INSTANCE_NAME: str = "agroraiz"

    # ─── Instagram Graph API ─────────────────────────────────────────────────
    INSTAGRAM_ACCESS_TOKEN: str = ""
    INSTAGRAM_BUSINESS_ID: str = ""
    INSTAGRAM_WEBHOOK_TOKEN: str = "agroraiz-ig-token"
    INSTAGRAM_APP_SECRET: str = ""

    # ─── Celery ───────────────────────────────────────────────────────────────
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    # ─── Store ────────────────────────────────────────────────────────────────
    STORE_NAME: str = "Agro Raiz"
    STORE_CITY: str = "Ouro Branco - MG"
    STORE_WHATSAPP: str = "+55 31 99512-2303"
    STORE_INSTAGRAM: str = "@_agroraiz_"
    STORE_HOURS: str = "Segunda a Sexta: 8h-18h | Sábado: 8h-13h"

    # ─── Logging ─────────────────────────────────────────────────────────────
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "json"

    # ─── Rate Limiting ────────────────────────────────────────────────────────
    WHATSAPP_MAX_MSGS_PER_MINUTE: int = 10
    API_RATE_LIMIT_PER_MINUTE: int = 100

    @field_validator("CORS_ORIGINS", "ALLOWED_HOSTS", mode="before")
    @classmethod
    def parse_list(cls, v):
        if isinstance(v, str):
            import json
            try:
                return json.loads(v)
            except Exception:
                return [i.strip() for i in v.split(",")]
        return v

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
