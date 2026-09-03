from arc.domain.ids import CompanyId, WorkPacketId


def test_strong_ids_preserve_runtime_string_value() -> None:
    assert CompanyId("COMP-1") == "COMP-1"
    assert WorkPacketId("WP-1") == "WP-1"
