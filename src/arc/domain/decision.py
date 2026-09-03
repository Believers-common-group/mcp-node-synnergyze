from dataclasses import dataclass
from datetime import datetime

from arc.domain.authority import ActionContext, AuthorityDecision
from arc.domain.enums import EvidenceLevel, WardenDecisionType
from arc.domain.ids import CompanyId, MatterId, WardenDecisionId


@dataclass(frozen=True, slots=True)
class WardenAdmissionRequest:
    context: ActionContext
    authority_decision: AuthorityDecision
    required_evidence_levels: tuple[EvidenceLevel, ...]
    open_blocking_exception_ids: tuple[str, ...]
    authority_snapshot_hash: str
    evidence_snapshot_hash: str


@dataclass(frozen=True, slots=True)
class WardenDecision:
    warden_decision_id: WardenDecisionId
    company_id: CompanyId
    matter_id: MatterId
    decision_type: WardenDecisionType
    action_context_hash: str
    authority_snapshot_hash: str
    evidence_snapshot_hash: str
    conditions: tuple[str, ...]
    issued_at: datetime
    valid_until: datetime | None
