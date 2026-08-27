from dataclasses import dataclass, replace

from arc.domain.enums import WorkPacketState
from arc.domain.errors import InvalidTransitionError
from arc.domain.work_packet import WorkPacket


@dataclass(frozen=True, slots=True)
class TransitionResult:
    previous: WorkPacket
    current: WorkPacket
    transition_name: str


def transition_packet(
    packet: WorkPacket,
    *,
    expected_state: WorkPacketState,
    target_state: WorkPacketState,
    transition_name: str,
) -> TransitionResult:
    if packet.state is not expected_state:
        raise InvalidTransitionError(f"expected {expected_state}, got {packet.state}")
    current = replace(packet, state=target_state, revision=packet.revision + 1)
    return TransitionResult(previous=packet, current=current, transition_name=transition_name)
