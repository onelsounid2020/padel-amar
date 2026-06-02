from pydantic import BaseModel

from app.models.player import PreferredSide
from app.schemas.players import PairRead


class PublicRegistrationRequest(BaseModel):
    name: str
    phone: str | None = None
    paid: bool = False
    category: str
    preferred_side: PreferredSide | None = PreferredSide.indiferente
    partner_name: str | None = None
    partner_phone: str | None = None
    partner_paid: bool = False
    partner_preferred_side: PreferredSide | None = PreferredSide.indiferente


class PublicRegistrationResponse(BaseModel):
    pair: PairRead
