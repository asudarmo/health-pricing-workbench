"""Demo logins, signed JWTs and role checks. Demo users hold no real credentials."""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import User as UserRow
from app.schemas import LoginResponse, Role, User, errors, roles

DEMO_USERS: dict[str, str] = {"Analyst": "Demo Analyst", "Reviewer": "Demo Reviewer"}
ALGORITHM = "HS256"


@dataclass(frozen=True)
class CurrentUser:
    name: str
    role: str


class LoginRequest(BaseModel):
    role: Role


def create_token(settings: Settings, name: str, role: str) -> str:
    expires = datetime.now(timezone.utc) + timedelta(hours=settings.jwt_hours)
    return jwt.encode({"sub": name, "role": role, "exp": expires}, settings.jwt_secret, algorithm=ALGORITHM)


def get_db(request: Request):
    with Session(request.app.state.engine) as session:
        yield session


def current_user(request: Request) -> CurrentUser:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Not signed in")
    try:
        claims = jwt.decode(token, request.app.state.settings.jwt_secret, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token") from None
    if claims.get("role") not in DEMO_USERS or not claims.get("sub"):
        raise HTTPException(status_code=401, detail="Invalid token")
    return CurrentUser(name=claims["sub"], role=claims["role"])


def require_role(*roles: str):
    def check(user: CurrentUser = Depends(current_user)) -> CurrentUser:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail=f"Requires role: {', '.join(roles)}")
        return user

    return check


router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse, responses=errors(422), openapi_extra=roles(),
             summary="Demo login (public). Pick a role; there are no passwords.")
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)) -> LoginResponse:
    name = DEMO_USERS[body.role]
    if db.scalar(select(UserRow).where(UserRow.name == name)) is None:
        db.add(UserRow(name=name, role=body.role))
        db.commit()
    token = create_token(request.app.state.settings, name, body.role)
    return LoginResponse(token=token, user=User(name=name, role=body.role))


@router.get("/me", response_model=User, responses=errors(401), openapi_extra=roles("Analyst", "Reviewer"),
            summary="The signed-in user")
def me(user: CurrentUser = Depends(current_user)) -> User:
    return User(name=user.name, role=user.role)
