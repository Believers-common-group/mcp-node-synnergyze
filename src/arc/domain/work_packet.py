from dataclasses import dataclass
from datetime import datetime

from arc.domain.enums import EvidenceLevel, PacketType, WorkPacketState
from arc.domain.ids import (
    AuthorityDecisionId,
    CompanyId,
    EngagementId,
    MatterId,
    ProviderId,
    WardenDecisionId,
    WorkPacketId,
)


@dataclass(frozen=True, slots=True)
class WorkPacket:
    work_packet_id: WorkPacketId
    matter_id: MatterId
    company_id: CompanyId
    packet_type: PacketType
    objective: str
    state: WorkPacketState
    assigned_provider_id: ProviderId | None
    assigned_engagement_id: EngagementId | None
    authority_decision_id: AuthorityDecisionId | None
    warden_decision_id: WardenDecisionId | None
    required_evidence_levels: tuple[EvidenceLevel, ...]
    created_at: datetime
    revision: int
