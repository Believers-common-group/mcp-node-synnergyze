import type { EfomFindingStatusV1 } from "../osiris/contracts.ts";
import type { CandidateClaimStateV1 } from "./contracts.ts";

export function projectEfomClaimStateV1(input: {
  kind: "OBSERVATION" | "FINDING" | "DISCREPANCY";
  sourceEvidenceRefs: readonly string[];
  findingStatus?: EfomFindingStatusV1;
  publicCorroboration?: boolean;
  authoritative?: boolean;
  superseded?: boolean;
}): CandidateClaimStateV1 {
  if (input.superseded || input.findingStatus === "SUPERSEDED") return "SUPERSEDED";
  if (input.findingStatus === "REJECTED") return "REJECTED";
  if (input.kind === "DISCREPANCY" || input.findingStatus === "CONFLICTED") {
    return "DISPUTED";
  }
  if (input.authoritative === true) return "AUTHORITATIVELY_VERIFIED";
  if (input.kind === "FINDING" && input.findingStatus === "HYPOTHESIS") return "INFERRED";
  if (
    input.kind === "FINDING" &&
    input.findingStatus === "CORROBORATED" &&
    input.publicCorroboration === true
  ) {
    return "CORROBORATED_PUBLIC";
  }
  if (input.sourceEvidenceRefs.length > 0) return "EVIDENCED";
  return "OBSERVED";
}
