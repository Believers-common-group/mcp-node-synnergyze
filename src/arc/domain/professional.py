from dataclasses import dataclass
from datetime import datetime

from arc.domain.enums import ProfessionalConclusion
from arc.domain.ids import (
    CompanyId,
    EngagementId,
    EvidenceId,
    MatterId,
    PersonId,
    ProviderId,
    WorkPacketId,
)


@dataclass(frozen=True, slots=True)
class ProfessionalResult:
    work_packet_id: WorkPacketId
    matter_id: MatterId
    company_id: CompanyId
    provider_id: ProviderId
    engagement_id: EngagementId
    professional_person_id: PersonId
    conclusion: ProfessionalConclusion
    evidence_refs: tuple[EvidenceId, ...]
    qualification: str | None
    input_snapshot_hash: str
    reviewed_document_hashes: tuple[str, ...]
    submitted_at: datetime
    result_hash: str
