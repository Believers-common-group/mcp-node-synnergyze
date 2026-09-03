from typing import Protocol

from arc.application.transitions import TransitionResult
from arc.domain.evidence import EvidenceItem
from arc.domain.receipts import RiverAppendReceipt, RiverTransitionReceipt


class RiverPort(Protocol):
    async def append_evidence(self, evidence: EvidenceItem) -> RiverAppendReceipt: ...

    async def append_transition(self, transition: TransitionResult) -> RiverTransitionReceipt: ...
