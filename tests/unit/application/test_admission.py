from dataclasses import replace
from datetime import UTC, datetime, timedelta

import pytest

from arc.adapters.memory.warden import InMemoryWarden
from arc.application.admission import validate_admission_freshness
from arc.domain.authority import ActionContext, AuthorityDecision
from arc.domain.decision import WardenAdmissionRequest, WardenDecision
from arc.domain.enums import (
    ActionType,
    AuthorityDecisionType,
    DecisionValidityState,
    EvidenceLevel,
    WardenDecisionType,
)
from arc.domain.ids import AuthorityDecisionId, CompanyId, MatterId, PersonId


def test_stale_context_requires_readmission(warden_allow: WardenDecision) -> None:
    validity = validate_admission_freshness(
        warden_allow,
        current_context_hash="new",
        current_authority_snapshot_hash="auth",
        current_evidence_snapshot_hash="evidence",
        now=warden_allow.issued_at,
    )
    assert validity.state is DecisionValidityState.RE_ADMISSION_REQUIRED
    assert validity.reason_code == "CONTEXT_DRIFT"


@pytest.mark.parametrize(
    ("decision_type", "state"),
    [
        (WardenDecisionType.DENY, DecisionValidityState.DENIED),
        (WardenDecisionType.REVIEW_REQUIRED, DecisionValidityState.RE_ADMISSION_REQUIRED),
    ],
)
def test_non_allow_decisions_are_not_valid(
    warden_allow: WardenDecision,
    decision_type: WardenDecisionType,
    state: DecisionValidityState,
) -> None:
    decision = replace(warden_allow, decision_type=decision_type)
    validity = validate_admission_freshness(
        decision,
        current_context_hash="ctx",
        current_authority_snapshot_hash="auth",
        current_evidence_snapshot_hash="evidence",
        now=decision.issued_at,
    )
    assert validity.state is state


def test_expired_and_drift(warden_allow: WardenDecision) -> None:
    assert warden_allow.valid_until is not None
    expired = validate_admission_freshness(
        warden_allow,
        current_context_hash="ctx",
        current_authority_snapshot_hash="auth",
        current_evidence_snapshot_hash="evidence",
        now=warden_allow.valid_until + timedelta(seconds=1),
    )
    assert expired.state is DecisionValidityState.EXPIRED
    authority = validate_admission_freshness(
        warden_allow,
        current_context_hash="ctx",
        current_authority_snapshot_hash="new",
        current_evidence_snapshot_hash="evidence",
        now=warden_allow.issued_at,
    )
    evidence = validate_admission_freshness(
        warden_allow,
        current_context_hash="ctx",
        current_authority_snapshot_hash="auth",
        current_evidence_snapshot_hash="new",
        now=warden_allow.issued_at,
    )
    assert authority.reason_code == "AUTHORITY_DRIFT"
    assert evidence.reason_code == "EVIDENCE_DRIFT"


def test_allow_is_valid(warden_allow: WardenDecision) -> None:
    validity = validate_admission_freshness(
        warden_allow,
        current_context_hash="ctx",
        current_authority_snapshot_hash="auth",
        current_evidence_snapshot_hash="evidence",
        now=warden_allow.issued_at,
    )
    assert validity.state is DecisionValidityState.VALID


@pytest.mark.asyncio
async def test_deterministic_warden_maps_allow_and_hashes() -> None:
    now = datetime(2026, 8, 28, tzinfo=UTC)
    context = ActionContext(
        matter_id=MatterId("M"),
        company_id=CompanyId("C"),
        actor_id=PersonId("P"),
        action_type=ActionType.CORPORATE_STATE_CHANGE,
        purpose_code="PURPOSE",
        authority_refs=(),
        evidence_refs=(),
        requested_at=now,
        context_hash="ctx-hash",
    )
    authority = AuthorityDecision(
        authority_decision_id=AuthorityDecisionId("A"),
        company_id=context.company_id,
        matter_id=context.matter_id,
        decision_type=AuthorityDecisionType.ALLOW,
        context_hash=context.context_hash,
        authority_snapshot_hash="auth-hash",
        authority_refs=(),
        conditions=(),
        reason_code="OK",
        decided_at=now,
    )
    request = WardenAdmissionRequest(
        context=context,
        authority_decision=authority,
        required_evidence_levels=(EvidenceLevel.E3_PROFESSIONAL_VALIDATION,),
        open_blocking_exception_ids=(),
        authority_snapshot_hash="auth-hash",
        evidence_snapshot_hash="ev-hash",
    )
    decision = await InMemoryWarden().admit(request)
    assert decision.decision_type is WardenDecisionType.ALLOW
    assert decision.action_context_hash == "ctx-hash"
    assert decision.authority_snapshot_hash == "auth-hash"
    assert decision.evidence_snapshot_hash == "ev-hash"
