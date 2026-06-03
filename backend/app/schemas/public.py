from pydantic import BaseModel

from app.models.player import PreferredSide
from app.schemas.players import PairRead
from app.schemas.common import ORMModel


class PublicRegistrationRequest(BaseModel):
    player_user_id: int | None = None
    name: str
    email: str
    phone: str | None = None
    paid: bool = False
    category: str
    preferred_side: PreferredSide | None = PreferredSide.indiferente
    partner_user_id: int | None = None
    partner_name: str | None = None
    partner_email: str | None = None
    partner_phone: str | None = None
    partner_paid: bool = False
    partner_preferred_side: PreferredSide | None = PreferredSide.indiferente


class PublicRegistrationResponse(BaseModel):
    pair: PairRead


class PublicMemberRead(ORMModel):
    id: int
    name: str
    email: str
    phone: str | None = None
    category: str | None = None
    preferred_side: PreferredSide | None = None
