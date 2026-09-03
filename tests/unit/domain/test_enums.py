from dataclasses import FrozenInstanceError
from datetime import UTC, datetime

import pytest

from arc.domain.authority import AuthorityGrant
from arc.domain.enums import AuthorityType, EffectResult, WorkPacketState
from arc.domain.ids import AuthorityGrantId, CompanyId, EvidenceId, PersonId


def test_closed_vocabularies_serialize_to_stable_strings() -> None:
    assert WorkPacketState.CLOSED.value == "CLOSED"
    assert EffectResult.MATCH.value == "MATCH"


def test_authority_grant_is_immutable() -> None:
    grant = AuthorityGrant(
        authority_grant_id=AuthorityGrantId("AUTH-1"),
        company_id=CompanyId("COMP-1"),
        holder_id=PersonId("P-1"),
        authority_type=AuthorityType.CORPORATE_ACTION,
        purpose_code="DIRECTOR_APPOINTMENT",
        source_ref=EvidenceId("E-1"),
        valid_from=datetime(2026, 8, 28, tzinfo=UTC),
        valid_until=None,
        financial_limit_minor=None,
        delegable=False,
        revision=1,
    )
    with pytest.raises(FrozenInstanceError):
        setattr(grant, "revision", 2)
