"""Single-admin JWT auth (password from ADMIN_PASSWORD, tokens signed with JWT_SECRET)."""
import hmac
import os
from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional

import jwt
from fastapi import Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.exceptions import InvalidTokenError

bearer = HTTPBearer(auto_error=False)
ALGORITHM = "HS256"
TOKEN_DAYS = 7


def _required(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def check_admin_password(password: str) -> bool:
    return hmac.compare_digest(password, _required("ADMIN_PASSWORD"))


def create_admin_token() -> str:
    now = datetime.now(timezone.utc)
    claims = {"sub": "admin", "role": "admin", "iat": now, "exp": now + timedelta(days=TOKEN_DAYS)}
    return jwt.encode(claims, _required("JWT_SECRET"), algorithm=ALGORITHM)


def _decode(token: str) -> dict:
    unauthorized = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired admin session", headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = jwt.decode(token, _required("JWT_SECRET"), algorithms=[ALGORITHM], options={"require": ["exp", "sub", "role"]})
        if payload["sub"] != "admin" or payload["role"] != "admin":
            raise unauthorized
        return payload
    except (InvalidTokenError, KeyError, TypeError, ValueError):
        raise unauthorized


async def require_admin(credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(bearer)]) -> dict:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Admin sign-in required", headers={"WWW-Authenticate": "Bearer"})
    return _decode(credentials.credentials)


async def require_admin_header_or_query(
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(bearer)],
    token: Annotated[Optional[str], Query()] = None,
) -> dict:
    """For file downloads (CSV) where the browser cannot set headers."""
    raw = credentials.credentials if credentials and credentials.scheme.lower() == "bearer" else token
    if not raw:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Admin sign-in required")
    return _decode(raw)
