from datetime import timedelta

from arc.domain.decision import WardenAdmissionRequest, WardenDecision
from arc.domain.enums import AuthorityDecisionType, WardenDecisionType
from arc.domain.ids import WardenDecisionId


class InMemoryWarden:
    async def admit(self, request: WardenAdmissionRequest) -> WardenDecision:
        authority = request.authority_decision.decision_type
        if request.open_blocking_exception_ids or authority is AuthorityDecisionType.DENY:
            decision_type = WardenDecisionType.DENY
        elif authority is AuthorityDecisionType.REVIEW_REQUIRED:
            decision_type = WardenDecisionType.REVIEW_REQUIRED
        elif authority is AuthorityDecisionType.CONDITIONAL:
            decision_type = WardenDecisionType.CONDITIONAL
        else:
            decision_type = WardenDecisionType.ALLOW
        return WardenDecision(
            warden_decision_id=WardenDecisionId(
                f"WARDEN-{request.authority_decision.authority_decision_id}"
            ),
            company_id=request.context.company_id,
            matter_id=request.context.matter_id,
            decision_type=decision_type,
            action_context_hash=request.context.context_hash,
            authority_snapshot_hash=request.authority_snapshot_hash,
            evidence_snapshot_hash=request.evidence_snapshot_hash,
            conditions=request.authority_decision.conditions,
            issued_at=request.context.requested_at,
            valid_until=request.context.requested_at + timedelta(minutes=15),
        )
