from fastapi import APIRouter

from auth import resolve_user
from schemas import LoginRequest, LoginResponse

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest):
    """
    Mock login -- no password, no database, no token.
    Uses resolve_user to automatically get the correct full name (for engineers) 
    and role based on the username prefix.
    """
    user = resolve_user(payload.username, payload.full_name)
    return LoginResponse(
        username=user.username,
        full_name=user.full_name,
        role=user.role.value,
        team=user.team,
    )