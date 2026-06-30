"""
AgroRaiz - Security & JWT
Authentication, authorization, RBAC.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.core.database import get_db

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


# ─── Password ────────────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ─── JWT Tokens ──────────────────────────────────────────────────────────────

def create_access_token(subject: str, store_id: str, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {
        "sub": subject,
        "store_id": store_id,
        "role": role,
        "exp": expire,
        "type": "access",
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(subject: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS
    )
    payload = {"sub": subject, "exp": expire, "type": "refresh"}
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido ou expirado",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e


# ─── Dependencies ─────────────────────────────────────────────────────────────

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
):
    from app.models.models import User

    payload = decode_token(token)
    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Token inválido")

    user_id = payload.get("sub")
    user = await db.get(User, UUID(user_id))

    if not user or not user.active:
        raise HTTPException(status_code=401, detail="Usuário não encontrado ou inativo")

    return user


def require_role(*roles: str):
    """RBAC: require one of the specified roles."""
    async def checker(current_user=Depends(get_current_user)):
        if current_user.role.value not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permissão insuficiente",
            )
        return current_user
    return checker


# Dependency shortcuts
async def require_admin(current_user=Depends(get_current_user)):
    """Require owner or admin role."""
    if current_user.role.value not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Permissão insuficiente")
    return current_user

async def require_attendant(current_user=Depends(get_current_user)):
    """Require owner, admin, or attendant role."""
    if current_user.role.value not in ("owner", "admin", "attendant"):
        raise HTTPException(status_code=403, detail="Permissão insuficiente")
    return current_user


# ─── Anti-Prompt-Injection Sanitizer ─────────────────────────────────────────

INJECTION_PATTERNS = [
    "ignore previous instructions",
    "ignore all instructions",
    "you are now",
    "act as",
    "jailbreak",
    "DAN mode",
    "pretend you",
    "forget your instructions",
    "new persona",
    "system prompt",
    "</system>",
    "<|im_start|>",
    "[[SYSTEM]]",
]


def sanitize_user_input(text: str) -> str:
    """
    Remove tentativas de prompt injection de mensagens de clientes.
    Preserva o texto original, apenas neutraliza padrões perigosos.
    """
    sanitized = text
    for pattern in INJECTION_PATTERNS:
        sanitized = sanitized.replace(pattern, "[removido]")
        sanitized = sanitized.replace(pattern.upper(), "[removido]")
        sanitized = sanitized.replace(pattern.title(), "[removido]")
    return sanitized
