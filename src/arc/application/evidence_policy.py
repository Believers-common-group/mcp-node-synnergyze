from collections.abc import Sequence
from dataclasses import dataclass

from arc.domain.enums import EvidenceLevel
from arc.domain.evidence import EvidenceItem


@dataclass(frozen=True, slots=True)
class EvidencePolicyResult:
    satisfied: bool
    missing_levels: tuple[EvidenceLevel, ...]


def evaluate_evidence_policy(
    required_levels: tuple[EvidenceLevel, ...],
    evidence: Sequence[EvidenceItem],
) -> EvidencePolicyResult:
    available = {item.level for item in evidence}
    missing = tuple(level for level in required_levels if level not in available)
    return EvidencePolicyResult(satisfied=not missing, missing_levels=missing)
