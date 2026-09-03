from dataclasses import replace
from datetime import UTC, datetime, timedelta

import pytest

from arc.domain.decision import WardenDecision
from arc.domain.effect import EffectVerification
from arc.domain.enums import (
    EffectResult,
    EvidenceLevel,
    PacketType,
    ProfessionalConclusion,
    WardenDecisionType,
    WorkPacketState,
)
from arc.domain.ids import (
    CompanyId,
    EngagementId,
    MatterId,
    PersonId,
    ProviderId,
    WardenDecisionId,
    WorkPacketId,
)
from arc.domain.professional import ProfessionalResult
from arc.domain.work_packet import WorkPacket

NOW = datetime(2026, 8, 28, tzinfo=UTC)


@pytest.fixture
def packet_draft() -> WorkPacket:
    return WorkPacket(
        work_packet_id=WorkPacketId("WP-1"),
        matter_id=MatterId("M-1"),
        company_id=CompanyId("COMP-1"),
        packet_type=PacketType.CORPORATE_STATE_CHANGE,
        objective="appoint director",
        state=WorkPacketState.DRAFT,
        assigned_provider_id=None,
        assigned_engagement_id=None,
        authority_decision_id=None,
        warden_decision_id=None,
        required_evidence_levels=(
            EvidenceLevel.E3_PROFESSIONAL_VALIDATION,
            EvidenceLevel.E4_EXTERNAL_RECEIPT,
            EvidenceLevel.E5_AUTHORITATIVE_STATE,
            EvidenceLevel.E6_EFFECT_VERIFIED,
        ),
        created_at=NOW,
        revision=0,
    )


@pytest.fixture
def packet_effect_verification(packet_draft: WorkPacket) -> WorkPacket:
    return replace(packet_draft, state=WorkPacketState.EFFECT_VERIFICATION, revision=4)


@pytest.fixture
def professional_result(packet_effect_verification: WorkPacket) -> ProfessionalResult:
    return ProfessionalResult(
        work_packet_id=packet_effect_verification.work_packet_id,
        matter_id=packet_effect_verification.matter_id,
        company_id=packet_effect_verification.company_id,
        provider_id=ProviderId("PROV-1"),
        engagement_id=EngagementId("ENG-1"),
        professional_person_id=PersonId("P-CA"),
        conclusion=ProfessionalConclusion.FILED,
        evidence_refs=(),
        qualification=None,
        input_snapshot_hash="input",
        reviewed_document_hashes=("doc",),
        submitted_at=NOW,
        result_hash="result",
    )


@pytest.fixture
def effect_match(packet_effect_verification: WorkPacket) -> EffectVerification:
    return EffectVerification(
        work_packet_id=packet_effect_verification.work_packet_id,
        matter_id=packet_effect_verification.matter_id,
        company_id=packet_effect_verification.company_id,
        expected_effect="director visible",
        observed_effect="director visible",
        result=EffectResult.MATCH,
        evidence_refs=(),
        verified_at=NOW,
    )


@pytest.fixture
def warden_allow(packet_effect_verification: WorkPacket) -> WardenDecision:
    return WardenDecision(
        warden_decision_id=WardenDecisionId("W-1"),
        company_id=packet_effect_verification.company_id,
        matter_id=packet_effect_verification.matter_id,
        decision_type=WardenDecisionType.ALLOW,
        action_context_hash="ctx",
        authority_snapshot_hash="auth",
        evidence_snapshot_hash="evidence",
        conditions=(),
        issued_at=NOW,
        valid_until=NOW + timedelta(minutes=15),
    )
