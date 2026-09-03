from collections.abc import Sequence

from arc.domain.effect import EffectVerification
from arc.domain.errors import LineageMismatchError
from arc.domain.evidence import EvidenceItem
from arc.domain.professional import ProfessionalResult
from arc.domain.work_packet import WorkPacket


def validate_lineage(
    packet: WorkPacket,
    result: ProfessionalResult,
    verification: EffectVerification,
    evidence: Sequence[EvidenceItem],
) -> None:
    if result.company_id != packet.company_id:
        raise LineageMismatchError("professional result company mismatch")
    if result.matter_id != packet.matter_id:
        raise LineageMismatchError("professional result matter mismatch")
    if verification.company_id != packet.company_id:
        raise LineageMismatchError("effect verification company mismatch")
    if verification.matter_id != packet.matter_id:
        raise LineageMismatchError("effect verification matter mismatch")
    for item in evidence:
        if item.company_id != packet.company_id:
            raise LineageMismatchError("evidence company mismatch")
        if item.matter_id != packet.matter_id:
            raise LineageMismatchError("evidence matter mismatch")
