from datetime import UTC, datetime

from arc.application.evidence_policy import evaluate_evidence_policy
from arc.domain.enums import EvidenceLevel, EvidenceSourceType
from arc.domain.evidence import EvidenceItem
from arc.domain.ids import CompanyId, EvidenceId, MatterId


def evidence(level: EvidenceLevel, suffix: str = "1") -> EvidenceItem:
    return EvidenceItem(
        evidence_id=EvidenceId(f"E-{suffix}"),
        company_id=CompanyId("C"),
        matter_id=MatterId("M"),
        level=level,
        source_type=EvidenceSourceType.ARC,
        source_reference="src",
        content_hash="hash",
        observed_at=datetime(2026, 8, 28, tzinfo=UTC),
        effective_at=None,
        supersedes=None,
    )


def test_required_external_receipt_is_not_satisfied_by_e3_only() -> None:
    result = evaluate_evidence_policy(
        (EvidenceLevel.E3_PROFESSIONAL_VALIDATION, EvidenceLevel.E4_EXTERNAL_RECEIPT),
        [evidence(EvidenceLevel.E3_PROFESSIONAL_VALIDATION)],
    )
    assert result.satisfied is False
    assert result.missing_levels == (EvidenceLevel.E4_EXTERNAL_RECEIPT,)


def test_exact_level_policy() -> None:
    required = (EvidenceLevel.E4_EXTERNAL_RECEIPT,)
    assert not evaluate_evidence_policy(
        required, [evidence(EvidenceLevel.E6_EFFECT_VERIFIED)]
    ).satisfied
    assert evaluate_evidence_policy((), []).satisfied
    assert evaluate_evidence_policy(
        required,
        [
            evidence(EvidenceLevel.E4_EXTERNAL_RECEIPT),
            evidence(EvidenceLevel.E4_EXTERNAL_RECEIPT, "2"),
        ],
    ).satisfied
