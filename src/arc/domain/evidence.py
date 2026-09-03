from dataclasses import dataclass
from datetime import datetime

from arc.domain.enums import EvidenceLevel, EvidenceSourceType
from arc.domain.ids import CompanyId, EvidenceId, MatterId


@dataclass(frozen=True, slots=True)
class EvidenceItem:
    evidence_id: EvidenceId
    company_id: CompanyId
    matter_id: MatterId
    level: EvidenceLevel
    source_type: EvidenceSourceType
    source_reference: str
    content_hash: str
    observed_at: datetime
    effective_at: datetime | None
    supersedes: EvidenceId | None
