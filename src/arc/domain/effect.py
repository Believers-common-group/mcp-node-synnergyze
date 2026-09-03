from dataclasses import dataclass
from datetime import datetime

from arc.domain.enums import EffectResult
from arc.domain.ids import CompanyId, EvidenceId, MatterId, WorkPacketId


@dataclass(frozen=True, slots=True)
class EffectVerification:
    work_packet_id: WorkPacketId
    matter_id: MatterId
    company_id: CompanyId
    expected_effect: str
    observed_effect: str
    result: EffectResult
    evidence_refs: tuple[EvidenceId, ...]
    verified_at: datetime
