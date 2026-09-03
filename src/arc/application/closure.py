from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from arc.application.admission import validate_admission_freshness
from arc.application.evidence_policy import evaluate_evidence_policy
from arc.application.lineage import validate_lineage
from arc.domain.decision import WardenDecision
from arc.domain.effect import EffectVerification
from arc.domain.enums import DecisionValidityState, EffectResult, WorkPacketState
from arc.domain.errors import LineageMismatchError
from arc.domain.evidence import EvidenceItem
from arc.domain.ids import EvidenceId
from arc.domain.professional import ProfessionalResult
from arc.domain.work_packet import WorkPacket


@dataclass(frozen=True, slots=True)
class ClosureProof:
    permitted: bool
    reason_code: str
    verified_evidence_ids: tuple[EvidenceId, ...]


def prove_closure(
    packet: WorkPacket,
    professional_result: ProfessionalResult,
    evidence: Sequence[EvidenceItem],
    verification: EffectVerification,
    warden_decision: WardenDecision,
    *,
    current_context_hash: str,
    current_authority_snapshot_hash: str,
    current_evidence_snapshot_hash: str,
    now: datetime,
) -> ClosureProof:
    ids = tuple(item.evidence_id for item in evidence)
    if packet.state is not WorkPacketState.EFFECT_VERIFICATION:
        return ClosureProof(False, "INVALID_PACKET_STATE", ids)
    try:
        validate_lineage(packet, professional_result, verification, evidence)
    except LineageMismatchError:
        return ClosureProof(False, "LINEAGE_MISMATCH", ids)
    if (
        warden_decision.company_id != packet.company_id
        or warden_decision.matter_id != packet.matter_id
    ):
        return ClosureProof(False, "WARDEN_LINEAGE_MISMATCH", ids)
    validity = validate_admission_freshness(
        warden_decision,
        current_context_hash=current_context_hash,
        current_authority_snapshot_hash=current_authority_snapshot_hash,
        current_evidence_snapshot_hash=current_evidence_snapshot_hash,
        now=now,
    )
    if validity.state is not DecisionValidityState.VALID:
        return ClosureProof(False, validity.reason_code, ids)
    policy = evaluate_evidence_policy(packet.required_evidence_levels, evidence)
    if not policy.satisfied:
        return ClosureProof(False, "EVIDENCE_POLICY_NOT_SATISFIED", ids)
    match verification.result:
        case EffectResult.MATCH:
            return ClosureProof(True, "CLOSURE_PERMITTED", ids)
        case EffectResult.NOT_YET_VISIBLE:
            return ClosureProof(False, "EFFECT_NOT_YET_VISIBLE", ids)
        case EffectResult.MISMATCH:
            return ClosureProof(False, "EFFECT_MISMATCH", ids)
        case EffectResult.REJECTED:
            return ClosureProof(False, "EFFECT_REJECTED", ids)
        case EffectResult.UNKNOWN:
            return ClosureProof(False, "EFFECT_UNKNOWN", ids)
