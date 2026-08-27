from dataclasses import replace
from datetime import UTC, datetime

import pytest

from arc.adapters.memory.river import InMemoryRiver
from arc.adapters.memory.work_packet_repository import InMemoryWorkPacketRepository
from arc.domain.enums import EvidenceLevel, EvidenceSourceType
from arc.domain.errors import ConcurrencyConflictError
from arc.domain.evidence import EvidenceItem
from arc.domain.ids import EvidenceId
from arc.domain.work_packet import WorkPacket


@pytest.mark.asyncio
async def test_stale_revision_is_rejected(packet_draft: WorkPacket) -> None:
    repo = InMemoryWorkPacketRepository()
    first = await repo.save(packet_draft, expected_revision=-1)
    updated = replace(packet_draft, revision=first.new_revision + 1)
    with pytest.raises(ConcurrencyConflictError):
        _ = await repo.save(updated, expected_revision=-1)


@pytest.mark.asyncio
async def test_exact_revision_save_and_read(packet_draft: WorkPacket) -> None:
    repo = InMemoryWorkPacketRepository()
    first = await repo.save(packet_draft, expected_revision=-1)
    updated = replace(packet_draft, revision=1)
    second = await repo.save(updated, expected_revision=first.new_revision)
    assert second.new_revision == 1
    assert await repo.get(packet_draft.work_packet_id) == updated


@pytest.mark.asyncio
async def test_river_returns_distinct_receipt_and_preserves_supersession(
    packet_draft: WorkPacket,
) -> None:
    river = InMemoryRiver()
    first = EvidenceItem(
        evidence_id=EvidenceId("E-A"),
        company_id=packet_draft.company_id,
        matter_id=packet_draft.matter_id,
        level=EvidenceLevel.E3_PROFESSIONAL_VALIDATION,
        source_type=EvidenceSourceType.PROFESSIONAL,
        source_reference="a",
        content_hash="ha",
        observed_at=datetime(2026, 8, 28, tzinfo=UTC),
        effective_at=None,
        supersedes=None,
    )
    second = replace(
        first,
        evidence_id=EvidenceId("E-B"),
        supersedes=first.evidence_id,
        content_hash="hb",
    )
    first_receipt = await river.append_evidence(first)
    second_receipt = await river.append_evidence(second)
    assert first_receipt.river_receipt_id != first.evidence_id
    assert (first_receipt.ledger_sequence, second_receipt.ledger_sequence) == (1, 2)
    assert river.evidence == [first, second]
