import hashlib
from datetime import UTC, datetime

from arc.application.transitions import TransitionResult
from arc.domain.evidence import EvidenceItem
from arc.domain.ids import RiverReceiptId
from arc.domain.receipts import RiverAppendReceipt, RiverTransitionReceipt


class InMemoryRiver:
    def __init__(self) -> None:
        self._sequence = 0
        self.evidence: list[EvidenceItem] = []
        self.transitions: list[TransitionResult] = []

    def _next(self) -> int:
        self._sequence += 1
        return self._sequence

    async def append_evidence(self, evidence: EvidenceItem) -> RiverAppendReceipt:
        sequence = self._next()
        self.evidence.append(evidence)
        recorded_hash = hashlib.sha256(repr(evidence).encode()).hexdigest()
        return RiverAppendReceipt(
            river_receipt_id=RiverReceiptId(f"RIVER-{sequence}"),
            evidence_id=evidence.evidence_id,
            ledger_sequence=sequence,
            recorded_hash=recorded_hash,
            recorded_at=datetime.now(UTC),
        )

    async def append_transition(self, transition: TransitionResult) -> RiverTransitionReceipt:
        sequence = self._next()
        self.transitions.append(transition)
        recorded_hash = hashlib.sha256(repr(transition).encode()).hexdigest()
        return RiverTransitionReceipt(
            river_receipt_id=RiverReceiptId(f"RIVER-{sequence}"),
            work_packet_id=transition.current.work_packet_id,
            ledger_sequence=sequence,
            transition_name=transition.transition_name,
            recorded_hash=recorded_hash,
            recorded_at=datetime.now(UTC),
        )
