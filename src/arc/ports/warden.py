from typing import Protocol

from arc.domain.decision import WardenAdmissionRequest, WardenDecision


class WardenPort(Protocol):
    async def admit(self, request: WardenAdmissionRequest) -> WardenDecision: ...
