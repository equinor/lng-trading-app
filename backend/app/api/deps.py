# backend/app/api/deps.py
# MVP: no DB session, no auth deps.

from typing import Annotated

from fastapi import Depends


def get_current_user():
    # Replace with real auth later
    return {"email": "analyst@example.com"}

CurrentUser = Annotated[dict, Depends(get_current_user)]
