import hashlib
from datetime import UTC, datetime

from arc.domain.errors import ConcurrencyConflictError
from arc.domain.ids import WorkPacketId
from arc.domain.receipts import SaveReceipt
from arc.domain.work_packet import WorkPacket


class InMemoryWorkPacketRepository:
    def __init__(self) -> None:
        self._packets: dict[WorkPacketId, WorkPacket] = {}

    async def get(self, work_packet_id: WorkPacketId) -> WorkPacket | None:
        return self._packets.get(work_packet_id)

    async def save(self, packet: WorkPacket, *, expected_revision: int) -> SaveReceipt:
        current = self._packets.get(packet.work_packet_id)
        if current is None:
            if expected_revision != -1:
                raise ConcurrencyConflictError("new packet requires expected_revision=-1")
        elif current.revision != expected_revision:
            raise ConcurrencyConflictError("stale WorkPacket revision")
        self._packets[packet.work_packet_id] = packet
        fields = (
            packet.work_packet_id,
            packet.matter_id,
            packet.company_id,
            packet.packet_type,
            packet.objective,
            packet.state,
            packet.assigned_provider_id,
            packet.assigned_engagement_id,
            packet.authority_decision_id,
            packet.warden_decision_id,
            packet.required_evidence_levels,
            packet.created_at.isoformat(),
            packet.revision,
        )
        persisted_hash = hashlib.sha256(repr(fields).encode()).hexdigest()
        return SaveReceipt(
            work_packet_id=packet.work_packet_id,
            previous_revision=expected_revision,
            new_revision=packet.revision,
            persisted_hash=persisted_hash,
            saved_at=datetime.now(UTC),
        )
