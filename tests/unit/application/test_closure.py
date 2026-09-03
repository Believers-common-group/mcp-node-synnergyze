from dataclasses import replace
from datetime import UTC, datetime

import pytest

from arc.application.closure import ClosureProof, prove_closure
from arc.domain.decision import WardenDecision
from arc.domain.effect import EffectVerification
from arc.domain.enums import EffectResult, EvidenceLevel, EvidenceSourceType, WorkPacketState
from arc.domain.evidence import EvidenceItem
from arc.domain.ids import EvidenceId
from arc.domain.professional import ProfessionalResult
from arc.domain.work_packet import WorkPacket

NOW = datetime(2026, 8, 28, tzinfo=UTC)


def item(packet: WorkPacket, level: EvidenceLevel, n: int) -> EvidenceItem:
    return EvidenceItem(
        evidence_id=EvidenceId(f"E-{n}"),
        company_id=packet.company_id,
        matter_id=packet.matter_id,
        level=level,
        source_type=EvidenceSourceType.ARC,
        source_reference="src",
        content_hash=f"hash-{n}",
        observed_at=NOW,
        effective_at=None,
        supersedes=None,
    )


def proof(
    packet: WorkPacket,
    professional_result: ProfessionalResult,
    effect_match: EffectVerification,
    warden_allow: WardenDecision,
    evidence: list[EvidenceItem],
) -> ClosureProof:
    return prove_closure(
        packet,
        professional_result,
        evidence,
        effect_match,
        warden_allow,
        current_context_hash="ctx",
        current_authority_snapshot_hash="auth",
        current_evidence_snapshot_hash="evidence",
        now=NOW,
    )


def test_match_alone_does_not_close_without_required_evidence(
    packet_effect_verification: WorkPacket,
    professional_result: ProfessionalResult,
    effect_match: EffectVerification,
    warden_allow: WardenDecision,
) -> None:
    result = proof(packet_effect_verification, professional_result, effect_match, warden_allow, [])
    assert result.permitted is False
    assert result.reason_code == "EVIDENCE_POLICY_NOT_SATISFIED"


def test_complete_match_path(
    packet_effect_verification: WorkPacket,
    professional_result: ProfessionalResult,
    effect_match: EffectVerification,
    warden_allow: WardenDecision,
) -> None:
    evidence = [
        item(packet_effect_verification, level, n)
        for n, level in enumerate(packet_effect_verification.required_evidence_levels, 1)
    ]
    result = proof(
        packet_effect_verification,
        professional_result,
        effect_match,
        warden_allow,
        evidence,
    )
    assert result.permitted is True


@pytest.mark.parametrize(
    ("effect", "reason"),
    [
        (EffectResult.NOT_YET_VISIBLE, "EFFECT_NOT_YET_VISIBLE"),
        (EffectResult.MISMATCH, "EFFECT_MISMATCH"),
        (EffectResult.REJECTED, "EFFECT_REJECTED"),
        (EffectResult.UNKNOWN, "EFFECT_UNKNOWN"),
    ],
)
def test_non_match_effects_do_not_close(
    packet_effect_verification: WorkPacket,
    professional_result: ProfessionalResult,
    effect_match: EffectVerification,
    warden_allow: WardenDecision,
    effect: EffectResult,
    reason: str,
) -> None:
    evidence = [
        item(packet_effect_verification, level, n)
        for n, level in enumerate(packet_effect_verification.required_evidence_levels, 1)
    ]
    result = proof(
        packet_effect_verification,
        professional_result,
        replace(effect_match, result=effect),
        warden_allow,
        evidence,
    )
    assert result.permitted is False
    assert result.reason_code == reason


def test_wrong_state_and_stale_admission_fail(
    packet_effect_verification: WorkPacket,
    professional_result: ProfessionalResult,
    effect_match: EffectVerification,
    warden_allow: WardenDecision,
) -> None:
    evidence = [
        item(packet_effect_verification, level, n)
        for n, level in enumerate(packet_effect_verification.required_evidence_levels, 1)
    ]
    wrong_state = replace(packet_effect_verification, state=WorkPacketState.SUBMITTED)
    invalid = proof(wrong_state, professional_result, effect_match, warden_allow, evidence)
    assert invalid.reason_code == "INVALID_PACKET_STATE"
    stale = prove_closure(
        packet_effect_verification,
        professional_result,
        evidence,
        effect_match,
        warden_allow,
        current_context_hash="ctx",
        current_authority_snapshot_hash="changed",
        current_evidence_snapshot_hash="evidence",
        now=NOW,
    )
    assert stale.reason_code == "AUTHORITY_DRIFT"
