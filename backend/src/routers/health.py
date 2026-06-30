from fastapi import APIRouter

router = APIRouter(tags=["Health"])


@router.get("/health")
def health():
    return {
        "status": "ok",
        "message": "Backend is running",
    }
