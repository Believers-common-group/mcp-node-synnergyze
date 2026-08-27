import pytest

from arc.application.transitions import transition_packet
from arc.domain.enums import WorkPacketState
from arc.domain.errors import InvalidTransitionError
from arc.domain.work_packet import WorkPacket


def test_close_transition_cannot_start_from_draft(packet_draft: WorkPacket) -> None:
    with pytest.raises(InvalidTransitionError):
        transition_packet(
            packet_draft,
            expected_state=WorkPacketState.EFFECT_VERIFICATION,
            target_state=WorkPacketState.CLOSED,
            transition_name="close",
        )


def test_transition_is_immutable_and_increments_revision(
    packet_effect_verification: WorkPacket,
) -> None:
    result = transition_packet(
        packet_effect_verification,
        expected_state=WorkPacketState.EFFECT_VERIFICATION,
        target_state=WorkPacketState.CLOSED,
        transition_name="close",
    )
    assert result.current.state is WorkPacketState.CLOSED
    assert result.current.revision == packet_effect_verification.revision + 1
    assert packet_effect_verification.state is WorkPacketState.EFFECT_VERIFICATION
