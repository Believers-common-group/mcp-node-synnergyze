from dataclasses import replace
from datetime import UTC, datetime

import pytest

from arc.adapters.memory.river import InMemoryRiver
from arc.adapters.memory.work_packet_repository import InMemoryWorkPacketRepository
from arc.application.closure import prove_closure
from arc.application.transitions import transition_packet
from arc.domain.decision import WardenDecision
from arc.domain.effect import EffectVerification
from arc.domain.enums import (
    EvidenceLevel,
    EvidenceSourceType,
    ProfessionalConclusion,
    WorkPacketState,
)
from arc.domain.errors import ConcurrencyConflictError
from arc.domain.evidence import EvidenceItem
from arc.domain.ids import EvidenceId
from arc.domain.professional import ProfessionalResult
from arc.domain.work_packet import WorkPacket

NOW = datetime(2026, 8, 28, tzinfo=UTC)


def evidence(packet: WorkPacket, level: EvidenceLevel, n: int) -> EvidenceItem:
    return EvidenceItem(
        evidence_id=EvidenceId(f"E-{n}"),
        company_id=packet.company_id,
        matter_id=packet.matter_id,
        level=level,
        source_type=EvidenceSourceType.ARC,
        source_reference=f"source-{n}",
        content_hash=f"hash-{n}",
        observed_at=NOW,
        effective_at=NOW,
        supersedes=None,
    )


@pytest.mark.asyncio
async def test_authority_evidence_effect_closure_slice(
    packet_effect_verification: WorkPacket,
    professional_result: ProfessionalResult,
    effect_match: EffectVerification,
    warden_allow: WardenDecision,
) -> None:
    repo = InMemoryWorkPacketRepository()
    river = InMemoryRiver()
    baseline = replace(packet_effect_verification, revision=0)
    bootstrap = await repo.save(baseline, expected_revision=-1)
    assert bootstrap.new_revision == 0
    items = [
        evidence(baseline, level, n)
        for n, level in enumerate(baseline.required_evidence_levels, 1)
    ]
    receipts = [await river.append_evidence(item) for item in items]
    assert all(
        receipt.evidence_id == item.evidence_id
        for receipt, item in zip(receipts, items, strict=True)
    )
    proof = prove_closure(
        baseline,
        professional_result,
        items,
        effect_match,
        warden_allow,
        current_context_hash="ctx",
        current_authority_snapshot_hash="auth",
        current_evidence_snapshot_hash="evidence",
        now=NOW,
    )
    assert proof.permitted is True
    transition = transition_packet(
        baseline,
        expected_state=WorkPacketState.EFFECT_VERIFICATION,
        target_state=WorkPacketState.CLOSED,
        transition_name="close",
    )
    transition_receipt = await river.append_transition(transition)
    assert transition_receipt.work_packet_id == baseline.work_packet_id
    save = await repo.save(transition.current, expected_revision=baseline.revision)
    assert save.new_revision == transition.current.revision


@pytest.mark.asyncio
async def test_filed_does_not_imply_closed(
    packet_effect_verification: WorkPacket,
    professional_result: ProfessionalResult,
    effect_match: EffectVerification,
    warden_allow: WardenDecision,
) -> None:
    assert professional_result.conclusion is ProfessionalConclusion.FILED
    only_e3 = [
        evidence(packet_effect_verification, EvidenceLevel.E3_PROFESSIONAL_VALIDATION, 1)
    ]
    proof = prove_closure(
        packet_effect_verification,
        professional_result,
        only_e3,
        effect_match,
        warden_allow,
        current_context_hash="ctx",
        current_authority_snapshot_hash="auth",
        current_evidence_snapshot_hash="evidence",
        now=NOW,
    )
    assert proof.permitted is False
    assert proof.reason_code == "EVIDENCE_POLICY_NOT_SATISFIED"


@pytest.mark.asyncio
async def test_stale_warden_and_stale_save_are_rejected(
    packet_effect_verification: WorkPacket,
    professional_result: ProfessionalResult,
    effect_match: EffectVerification,
    warden_allow: WardenDecision,
) -> None:
    items = [
        evidence(packet_effect_verification, level, n)
        for n, level in enumerate(packet_effect_verification.required_evidence_levels, 1)
    ]
    stale = prove_closure(
        packet_effect_verification,
        professional_result,
        items,
        effect_match,
        warden_allow,
        current_context_hash="ctx",
        current_authority_snapshot_hash="changed",
        current_evidence_snapshot_hash="evidence",
        now=NOW,
    )
    assert stale.permitted is False
    assert stale.reason_code == "AUTHORITY_DRIFT"
    repo = InMemoryWorkPacketRepository()
    baseline = replace(packet_effect_verification, revision=0)
    _ = await repo.save(baseline, expected_revision=-1)
    first = transition_packet(
        baseline,
        expected_state=WorkPacketState.EFFECT_VERIFICATION,
        target_state=WorkPacketState.CLOSED,
        transition_name="close",
    )
    _ = await repo.save(first.current, expected_revision=0)
    second = transition_packet(
        baseline,
        expected_state=WorkPacketState.EFFECT_VERIFICATION,
        target_state=WorkPacketState.CLOSED,
        transition_name="close",
    )
    with pytest.raises(ConcurrencyConflictError):
        _ = await repo.save(second.current, expected_revision=0)
