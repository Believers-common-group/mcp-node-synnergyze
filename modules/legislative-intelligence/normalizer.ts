import { sha256CanonicalV1 } from "./canonical.ts";
import type {
  NormalizedLegislativeEventV1,
  RelatedSourceBundleV1,
  SourceEnvelopeV1,
} from "./contracts.ts";
import {
  LIFECYCLE_NORMALIZER_VERSION_V1,
  normalizeLegislativeLifecycleV1,
} from "./lifecycle.ts";
import type {
  CanonicalCongressBillBundle,
  CongressActionsResponse,
  CongressBillDetailResponse,
  CongressCommitteesResponse,
  CongressLawState,
  CongressSubjectsResponse,
  CongressSummariesResponse,
} from "./adapters/congress-gov/types.ts";

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function sortedActions(
  actions: CanonicalCongressBillBundle["actions"],
): CanonicalCongressBillBundle["actions"] {
  return [...actions].sort((a, b) => {
    const byDate = (a.actionDate ?? "").localeCompare(b.actionDate ?? "");
    if (byDate !== 0) return byDate;
    return a.text.localeCompare(b.text);
  });
}

function actionRef(action: { actionDate?: string; text: string }): string {
  return `LEG-ACTION:${sha256CanonicalV1({
    actionDate: action.actionDate ?? null,
    text: action.text,
  })}`;
}

function introducedAt(actions: CanonicalCongressBillBundle["actions"]): string | undefined {
  return actions.find((action) => /introduced in (house|senate)/i.test(action.text))?.actionDate;
}

function latestActionAt(actions: CanonicalCongressBillBundle["actions"]): string | undefined {
  const dates = actions
    .map((action) => action.actionDate)
    .filter((date): date is string => typeof date === "string" && date.length > 0)
    .sort((a, b) => a.localeCompare(b));
  return dates.at(-1);
}

function bodies<T>(envelopes: readonly SourceEnvelopeV1[]): T[] {
  return envelopes.map((envelope) => envelope.body as T);
}

function lawState(bundle: RelatedSourceBundleV1): CongressLawState | undefined {
  if (!bundle.law || !bundle.law.body || typeof bundle.law.body !== "object") return undefined;
  const body = bundle.law.body as Record<string, unknown>;
  const nested = body.law && typeof body.law === "object" ? body.law as Record<string, unknown> : body;
  const lawNumber = typeof nested.lawNumber === "string" ? nested.lawNumber : undefined;
  const effectiveDate = typeof nested.effectiveDate === "string" ? nested.effectiveDate : undefined;
  const enforced = typeof nested.enforced === "boolean" ? nested.enforced : undefined;
  if (!lawNumber && !effectiveDate && enforced === undefined) return undefined;
  return { lawNumber, effectiveDate, enforced };
}

function mapSourceBundleV1(bundle: RelatedSourceBundleV1): CanonicalCongressBillBundle {
  const billPayload = bundle.bill.body as CongressBillDetailResponse;
  const bill = billPayload.bill;
  if (!bill) throw new Error("congress_bill_detail_missing");

  const actions = bodies<CongressActionsResponse>(bundle.actions)
    .flatMap((payload) => payload.actions ?? [])
    .filter((action): action is { actionDate?: string; text: string; type?: string } =>
      typeof action.text === "string" && action.text.length > 0,
    )
    .map((action) => ({ actionDate: action.actionDate, text: action.text }));

  const subjects = uniqueSorted(
    bodies<CongressSubjectsResponse>(bundle.subjects).flatMap((payload) => [
      ...(payload.subjects?.legislativeSubjects ?? [])
        .map((subject) => subject.name)
        .filter((name): name is string => typeof name === "string"),
      ...(payload.subjects?.policyArea?.name ? [payload.subjects.policyArea.name] : []),
    ]),
  );

  const committees = uniqueSorted(
    bodies<CongressCommitteesResponse>(bundle.committees).flatMap((payload) =>
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

  const summaries = bodies<CongressSummariesResponse>(bundle.summaries)
    .flatMap((payload) => payload.summaries ?? [])
    .map((summary) => summary.text)
    .filter((text): text is string => typeof text === "string" && text.length > 0);

  const envelopes = [
    bundle.bill,
    ...bundle.actions,
    ...bundle.subjects,
    ...bundle.committees,
    ...bundle.amendments,
    ...bundle.summaries,
    ...(bundle.law ? [bundle.law] : []),
  ];

  return {
    sourceRef: bundle.bill.sourceRef,
    jurisdiction: "US-FEDERAL",
    objectType: "bill",
    objectId: bundle.bill.sourceObjectId,
    title: bill.title,
    sourceUpdatedAt: bill.updateDate,
    originChamber: bill.originChamber,
    actions,
    subjects,
    committees,
    actors,
    summary: summaries[0],
    lawState: lawState(bundle),
    evidenceRefs: uniqueSorted(envelopes.map((envelope) => envelope.sourceRef)),
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

export function normalizeCongressBillEventV1(
  bundle: CanonicalCongressBillBundle,
  normalizedAt: string,
): NormalizedLegislativeEventV1 {
  const actions = sortedActions(bundle.actions);
  const introduced = actions.some((action) => /introduced in (house|senate)/i.test(action.text));
  const lifecycle = normalizeLegislativeLifecycleV1({
    introduced,
    actions: actions.map((action) => ({
      text: action.text,
      actionDate: action.actionDate,
    })),
    lawNumber: bundle.lawState?.lawNumber,
    effectiveDate: bundle.lawState?.effectiveDate,
    evaluatedAt: normalizedAt,
    enforcementEvidence: bundle.lawState?.enforced,
    enforced: bundle.lawState?.enforced,
  });

  const actionRefs = uniqueSorted(actions.map(actionRef));
  const sourceRefs = uniqueSorted([bundle.sourceRef, ...bundle.evidenceRefs]);
  const evidenceRefs = uniqueSorted(bundle.evidenceRefs);
  const subjects = uniqueSorted(bundle.subjects);
  const committees = uniqueSorted(bundle.committees);
  const actors = uniqueSorted(bundle.actors);

  const identity = {
    schemaVersion: "LEG-EVENT:R0.1" as const,
    jurisdiction: bundle.jurisdiction,
    objectType: bundle.objectType,
    objectId: bundle.objectId,
    lifecycle,
    title: bundle.title ?? null,
    summary: bundle.summary ?? null,
    introducedAt: introducedAt(actions) ?? null,
    latestActionAt: latestActionAt(actions) ?? null,
    effectiveDate: bundle.lawState?.effectiveDate ?? null,
    subjects,
    committees,
    actors,
    actionRefs,
    sourceRefs,
    evidenceRefs,
    normalizerVersion: LIFECYCLE_NORMALIZER_VERSION_V1,
  };

  return {
    schemaVersion: "LEG-EVENT:R0.1",
    eventRef: `LEG-EVENT:${sha256CanonicalV1(identity)}`,
    sourceRefs,
    jurisdiction: bundle.jurisdiction,
    objectType: bundle.objectType,
    objectId: bundle.objectId,
    lifecycle,
    title: bundle.title,
    summary: bundle.summary,
    introducedAt: introducedAt(actions),
    latestActionAt: latestActionAt(actions),
    effectiveDate: bundle.lawState?.effectiveDate,
    subjects,
    committees,
    actors,
    actionRefs,
    evidenceRefs,
    normalizedAt,
    normalizerVersion: LIFECYCLE_NORMALIZER_VERSION_V1,
  };
}

export function normalizeCongressGovBillV1(
  bundle: RelatedSourceBundleV1,
  normalizedAt: string,
): NormalizedLegislativeEventV1 {
  return normalizeCongressBillEventV1(mapSourceBundleV1(bundle), normalizedAt);
}
