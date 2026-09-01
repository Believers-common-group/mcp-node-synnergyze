import type { RelatedSourceBundle, SourceEnvelope } from "../../contracts.ts";
import type {
  CanonicalCongressBillBundle,
  CongressActionsResponse,
  CongressBillDetailResponse,
  CongressCommitteesResponse,
  CongressSubjectsResponse,
  CongressSummariesResponse,
} from "./types.ts";

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set([...values].filter((value) => value.length > 0))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function payloads<T>(envelopes: readonly SourceEnvelope[]): T[] {
  return envelopes.map((envelope) => envelope.payload as T);
}

export function mapCongressBillBundle(bundle: RelatedSourceBundle): CanonicalCongressBillBundle {
  const billPayload = bundle.bill.payload as CongressBillDetailResponse;
  const bill = billPayload.bill;
  if (!bill) throw new Error("congress_bill_detail_missing");

  const objectId = bundle.bill.sourceRecord.sourceObjectId;
  const actions = payloads<CongressActionsResponse>(bundle.actions)
    .flatMap((payload) => payload.actions ?? [])
    .filter((action): action is { actionDate?: string; text: string; type?: string } =>
      typeof action.text === "string" && action.text.length > 0,
    )
    .map((action) => ({ actionDate: action.actionDate, text: action.text }));

  const subjectPayloads = payloads<CongressSubjectsResponse>(bundle.subjects);
  const subjects = uniqueSorted(
    subjectPayloads.flatMap((payload) => [
      ...(payload.subjects?.legislativeSubjects ?? [])
        .map((subject) => subject.name)
        .filter((name): name is string => typeof name === "string"),
      ...(payload.subjects?.policyArea?.name ? [payload.subjects.policyArea.name] : []),
    ]),
  );

  const committees = uniqueSorted(
    payloads<CongressCommitteesResponse>(bundle.committees).flatMap((payload) =>
      (payload.committees ?? [])
        .map((committee) => committee.name)
        .filter((name): name is string => typeof name === "string"),
    ),
  );

  const actors = uniqueSorted(
    (bill.sponsors ?? [])
      .map((sponsor) => sponsor.bioguideId)
      .filter((id): id is string => typeof id === "string" && id.length > 0)
      .map((id) => `BIOGUIDE:${id}`),
  );

  const summaries = payloads<CongressSummariesResponse>(bundle.summaries)
    .flatMap((payload) => payload.summaries ?? [])
    .map((summary) => summary.text)
    .filter((text): text is string => typeof text === "string" && text.length > 0);

  const allEnvelopes = [
    bundle.bill,
    ...bundle.actions,
    ...bundle.amendments,
    ...bundle.committees,
    ...bundle.subjects,
    ...bundle.summaries,
    ...(bundle.law ? [bundle.law] : []),
  ];

  return {
    sourceRef: bundle.bill.sourceRecord.sourceId,
    jurisdiction: "US-FEDERAL",
    objectType: "bill",
    objectId,
    title: bill.title,
    sourceUpdatedAt: bill.updateDate,
    originChamber: bill.originChamber,
    actions,
    subjects,
    committees,
    actors,
    summary: summaries[0],
    lawState: undefined,
    evidenceRefs: uniqueSorted(allEnvelopes.map((envelope) => envelope.sourceRecord.sourceId)),
    completeness: {
      bill: true,
      actions: bundle.actions.length > 0,
      amendments: bundle.amendments.length > 0,
      committees: bundle.committees.length > 0,
      subjects: bundle.subjects.length > 0,
      summaries: bundle.summaries.length > 0,
      law: Boolean(bundle.law),
    },
  };
}
