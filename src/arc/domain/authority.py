from dataclasses import dataclass
from datetime import datetime

from arc.domain.enums import ActionType, AuthorityDecisionType, AuthorityType
from arc.domain.ids import (
    AuthorityDecisionId,
    AuthorityGrantId,
    CompanyId,
    EvidenceId,
    MatterId,
    PersonId,
)


@dataclass(frozen=True, slots=True)
class AuthorityGrant:
    authority_grant_id: AuthorityGrantId
    company_id: CompanyId
    holder_id: PersonId
    authority_type: AuthorityType
    purpose_code: str
    source_ref: EvidenceId
    valid_from: datetime
    valid_until: datetime | None
    financial_limit_minor: int | None
    delegable: bool
    revision: int


@dataclass(frozen=True, slots=True)
class ActionContext:
    matter_id: MatterId
    company_id: CompanyId
    actor_id: PersonId
    action_type: ActionType
    purpose_code: str
    authority_refs: tuple[AuthorityGrantId, ...]
    evidence_refs: tuple[EvidenceId, ...]
    requested_at: datetime
    context_hash: str


@dataclass(frozen=True, slots=True)
class AuthorityDecision:
    authority_decision_id: AuthorityDecisionId
    company_id: CompanyId
    matter_id: MatterId
    decision_type: AuthorityDecisionType
    context_hash: str
    authority_snapshot_hash: str
    authority_refs: tuple[AuthorityGrantId, ...]
    conditions: tuple[str, ...]
    reason_code: str
    decided_at: datetime
