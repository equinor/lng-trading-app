from fastapi import APIRouter

from app.api.deps import CurrentUser

router = APIRouter()

@router.get("/health-check")
def health_check():
    return True


@router.get("/me")
def read_current_user(current_user: CurrentUser):
    """Return the identity forwarded by the Radix OAuth2 proxy (or the dev fallback)."""
    return current_user