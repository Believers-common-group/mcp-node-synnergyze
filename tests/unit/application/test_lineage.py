from dataclasses import replace

import pytest

from arc.application.lineage import validate_lineage
from arc.domain.effect import EffectVerification
from arc.domain.errors import LineageMismatchError
from arc.domain.ids import CompanyId, MatterId
from arc.domain.professional import ProfessionalResult
from arc.domain.work_packet import WorkPacket


def test_lineage_error_has_stable_code() -> None:
    assert LineageMismatchError("company mismatch").code == "LINEAGE_MISMATCH"


def test_professional_result_from_other_company_is_rejected(
    packet_effect_verification: WorkPacket,
    professional_result: ProfessionalResult,
    effect_match: EffectVerification,
) -> None:
    foreign = replace(professional_result, company_id=CompanyId("OTHER"))
    with pytest.raises(LineageMismatchError):
        validate_lineage(packet_effect_verification, foreign, effect_match, ())


def test_wrong_matter_is_rejected(
    packet_effect_verification: WorkPacket,
    professional_result: ProfessionalResult,
    effect_match: EffectVerification,
) -> None:
    foreign = replace(professional_result, matter_id=MatterId("OTHER"))
    with pytest.raises(LineageMismatchError):
        validate_lineage(packet_effect_verification, foreign, effect_match, ())
