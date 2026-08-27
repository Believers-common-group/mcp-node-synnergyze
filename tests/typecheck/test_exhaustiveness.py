from enum import StrEnum


class _Sentinel(StrEnum):
    A = "A"
    B = "B"


def _consume(value: _Sentinel) -> int:
    match value:
        case _Sentinel.A:
            return 1
        case _Sentinel.B:
            return 2


def test_exhaustive_sentinel() -> None:
    assert _consume(_Sentinel.A) == 1
    assert _consume(_Sentinel.B) == 2
