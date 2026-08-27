from dataclasses import dataclass
from datetime import datetime

from arc.domain.decision import WardenDecision
from arc.domain.enums import DecisionValidityState, WardenDecisionType


@dataclass(frozen=True, slots=True)
class AdmissionValidity:
    state: DecisionValidityState
    reason_code: str


def _freshness(
    decision: WardenDecision,
    *,
    current_context_hash: str,
    current_authority_snapshot_hash: str,
    current_evidence_snapshot_hash: str,
    now: datetime,
) -> AdmissionValidity | None:
    if decision.valid_until is not None and now > decision.valid_until:
        return AdmissionValidity(DecisionValidityState.EXPIRED, "DECISION_EXPIRED")
    if current_context_hash != decision.action_context_hash:
        return AdmissionValidity(DecisionValidityState.RE_ADMISSION_REQUIRED, "CONTEXT_DRIFT")
    if current_authority_snapshot_hash != decision.authority_snapshot_hash:
        return AdmissionValidity(DecisionValidityState.RE_ADMISSION_REQUIRED, "AUTHORITY_DRIFT")
    if current_evidence_snapshot_hash != decision.evidence_snapshot_hash:
        return AdmissionValidity(DecisionValidityState.RE_ADMISSION_REQUIRED, "EVIDENCE_DRIFT")
    return None


def validate_admission_freshness(
    decision: WardenDecision,
    *,
    current_context_hash: str,
    current_authority_snapshot_hash: str,
    current_evidence_snapshot_hash: str,
    now: datetime,
) -> AdmissionValidity:
    match decision.decision_type:
        case WardenDecisionType.DENY:
            return AdmissionValidity(DecisionValidityState.DENIED, "WARDEN_DENIED")
        case WardenDecisionType.REVIEW_REQUIRED:
            freshness = _freshness(
                decision,
                current_context_hash=current_context_hash,
                current_authority_snapshot_hash=current_authority_snapshot_hash,
                current_evidence_snapshot_hash=current_evidence_snapshot_hash,
                now=now,
            )
            return freshness or AdmissionValidity(
                DecisionValidityState.RE_ADMISSION_REQUIRED, "REVIEW_REQUIRED"
            )
        case WardenDecisionType.CONDITIONAL:
            freshness = _freshness(
                decision,
                current_context_hash=current_context_hash,
                current_authority_snapshot_hash=current_authority_snapshot_hash,
                current_evidence_snapshot_hash=current_evidence_snapshot_hash,
                now=now,
            )
            if freshness is not None:
                return freshness
            if decision.conditions:
                return AdmissionValidity(
                    DecisionValidityState.RE_ADMISSION_REQUIRED, "CONDITIONS_REMAIN"
                )
            return AdmissionValidity(DecisionValidityState.VALID, "CONDITIONS_SATISFIED")
        case WardenDecisionType.ALLOW:
            freshness = _freshness(
                decision,
                current_context_hash=current_context_hash,
                current_authority_snapshot_hash=current_authority_snapshot_hash,
                current_evidence_snapshot_hash=current_evidence_snapshot_hash,
                now=now,
            )
            return freshness or AdmissionValidity(DecisionValidityState.VALID, "VALID")
