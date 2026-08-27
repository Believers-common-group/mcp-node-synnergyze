from dataclasses import dataclass
from datetime import datetime

from arc.domain.ids import EvidenceId, RiverReceiptId, WorkPacketId


@dataclass(frozen=True, slots=True)
class RiverAppendReceipt:
    river_receipt_id: RiverReceiptId
    evidence_id: EvidenceId
    ledger_sequence: int
    recorded_hash: str
    recorded_at: datetime


@dataclass(frozen=True, slots=True)
class RiverTransitionReceipt:
    river_receipt_id: RiverReceiptId
    work_packet_id: WorkPacketId
    ledger_sequence: int
    transition_name: str
    recorded_hash: str
    recorded_at: datetime


@dataclass(frozen=True, slots=True)
class SaveReceipt:
    work_packet_id: WorkPacketId
    previous_revision: int
    new_revision: int
    persisted_hash: str
    saved_at: datetime
