import enum

from fastapi import Depends, Header, HTTPException, status


class Role(str, enum.Enum):
    user = "user"
    admin = "admin"
    engineer = "engineer"


# Prefix -> team display name, for the 6 assigned-engineer teams.
# One engineer per team for the demo -- e.g. "engineer_network" is the
# whole username, no trailing number needed.
ENGINEER_TEAM_PREFIXES: dict[str, str] = {
    "engineer_network": "Network Team",
    "engineer_hardware": "Hardware Team",
    "engineer_software": "Software Team",
    "engineer_access": "Access & Security Team",
    "engineer_system": "System Team",
    "engineer_general": "General Team",
}

ADMIN_PREFIX = "admin_"
ENGINEER_PREFIX = "engineer_"

# Display names for the fixed demo identities, purely for the frontend to
# show "who's using it" -- there's no database, so this is just a lookup
# table, not real user data. Add/rename freely; anything not listed here
# still logs in fine, it just falls back to a generic display name.
FULL_NAMES: dict[str, str] = {
    "admin_1": "IT Admin",
    "engineer_network": "Alex Tan (Network)",
    "engineer_hardware": "Priya Nair (Hardware)",
    "engineer_software": "Daniel Wong (Software)",
    "engineer_access": "Farah Aziz (Access & Security)",
    "engineer_system": "Marcus Lee (System)",
    "engineer_general": "Nurul Hana (General)",
}


def get_full_name(username: str) -> str:
    """
    Looks up a friendly display name for known demo usernames. Falls back
    to a title-cased version of the username itself if it's not one of
    the fixed identities above, so this never errors on an unknown user.
    """
    name = (username or "").strip().lower()
    if name in FULL_NAMES:
        return FULL_NAMES[name]
    return name.replace("_", " ").title() or "Unknown User"


class MockUser:
    """Lightweight stand-in for a real authenticated user -- not a DB row."""

    def __init__(self, username: str, role: Role, team: str | None = None, full_name: str | None = None):
        self.username = username
        self.role = role
        self.team = team
        self.full_name = full_name or get_full_name(username)

    def __repr__(self) -> str:
        return (
            f"MockUser(username={self.username!r}, role={self.role.value!r}, "
            f"team={self.team!r}, full_name={self.full_name!r})"
        )


def get_user_role(username: str) -> Role:
    """
    Pure hard-coded check -- no database lookup, no case sensitivity games.
    Anyone can "log in" as whatever role their username implies; this is a
    demo/mock auth layer, not real security.
    """
    name = (username or "").strip().lower()
    if name.startswith(ADMIN_PREFIX):
        return Role.admin
    if name.startswith(ENGINEER_PREFIX):
        return Role.engineer
    return Role.user


def get_engineer_team(username: str) -> str | None:
    """
    Resolves which of the 6 teams an engineer username belongs to.
    Falls back to "General Team" if it's an engineer_ username that
    doesn't match one of the known team prefixes.
    """
    name = (username or "").strip().lower()
    if not name.startswith(ENGINEER_PREFIX):
        return None
    for prefix, team in ENGINEER_TEAM_PREFIXES.items():
        if name.startswith(prefix):
            return team
    return "General Team"


def resolve_user(username: str, full_name: str | None = None) -> MockUser:
    role = get_user_role(username)
    team = get_engineer_team(username) if role == Role.engineer else None
    resolved_name = full_name.strip() if full_name and full_name.strip() else get_full_name(username)
    return MockUser(username=username, role=role, team=team, full_name=resolved_name)


# ------------------------------------------------------------------
# FastAPI dependencies
# ------------------------------------------------------------------
def get_current_user(
    x_username: str = Header(..., alias="X-Username"),
    x_full_name: str | None = Header(None, alias="X-Full-Name"),
) -> MockUser:
    """
    Mock auth dependency. The frontend sends whichever username (and,
    optionally, full name) the person "logged in" with as headers on
    every request -- no password, no token, no DB lookup.
    """
    if not x_username or not x_username.strip():
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing X-Username header")
    return resolve_user(x_username, x_full_name)


def get_current_admin(current_user: MockUser = Depends(get_current_user)) -> MockUser:
    if current_user.role != Role.admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")
    return current_user


def get_current_engineer(current_user: MockUser = Depends(get_current_user)) -> MockUser:
    if current_user.role != Role.engineer:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Engineer access required")
    return current_user


def get_current_staff(current_user: MockUser = Depends(get_current_user)) -> MockUser:
    """Admin OR engineer -- for endpoints both roles are allowed to hit."""
    if current_user.role == Role.user:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Staff access required")
    return current_user