class ArcDomainError(Exception):
    code: str


class LineageMismatchError(ArcDomainError):
    code = "LINEAGE_MISMATCH"


class InvalidTransitionError(ArcDomainError):
    code = "INVALID_TRANSITION"


class EvidencePolicyError(ArcDomainError):
    code = "EVIDENCE_POLICY_NOT_SATISFIED"


class AdmissionInvalidError(ArcDomainError):
    code = "ADMISSION_INVALID"


class ConcurrencyConflictError(ArcDomainError):
    code = "CONCURRENCY_CONFLICT"
