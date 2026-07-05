from fastapi import APIRouter

from auth import get_engineer_team, get_user_role
from schemas import LoginRequest, LoginResponse

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest):
    """
    Mock login -- no password, no database, no token.

    Role (and team, if the role is engineer) is derived from the
    username. The display name is whatever full_name the person typed
    in at login -- it's just echoed back, not looked up from anywhere.
    The frontend should hang onto both and send the username back as
    the `X-Username` header on every subsequent request that needs a
    role check.
    """
    role = get_user_role(payload.username)
    team = get_engineer_team(payload.username) if role.value == "engineer" else None
    return LoginResponse(
        username=payload.username,
        full_name=payload.full_name.strip(),
        role=role.value,
        team=team,
    )