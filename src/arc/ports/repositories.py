from typing import Protocol

from arc.domain.ids import WorkPacketId
from arc.domain.receipts import SaveReceipt
from arc.domain.work_packet import WorkPacket


class WorkPacketRepository(Protocol):
    async def get(self, work_packet_id: WorkPacketId) -> WorkPacket | None: ...

    async def save(self, packet: WorkPacket, *, expected_revision: int) -> SaveReceipt: ...
