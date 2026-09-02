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

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function lawState(bundle: RelatedSourceBundleV1): CongressLawState | undefined {
  if (!bundle.law) return undefined;
  const body = record(bundle.law.body);
  const nested = record(body?.law) ?? body;
  if (!nested) return undefined;

  const explicitLawNumber = typeof nested.lawNumber === "string" ? nested.lawNumber : undefined;
  const type = typeof nested.type === "string" ? nested.type.trim() : undefined;
  const number = typeof nested.number === "string" || typeof nested.number === "number" ? String(nested.number) : undefined;
  const lawNumber = explicitLawNumber ?? (type && number ? `${type} ${number}` : bundle.law.sourceObjectId);
  const effectiveDate = typeof nested.effectiveDate === "string" ? nested.effectiveDate : undefined;
  const enforced = typeof nested.enforced === "boolean" ? nested.enforced : undefined;
  return { lawNumber, effectiveDate, enforced };
}

function canonicalBillObjectId(
  bill: NonNullable<CongressBillDetailResponse["bill"]>,
  fallback: string,
): string {
  if (
    typeof bill.congress === "number" &&
    typeof bill.type === "string" &&
    typeof bill.number === "string" &&
    bill.type.length > 0 &&
    bill.number.length > 0
  ) {
    return `${bill.congress}-${bill.type.toLowerCase()}-${bill.number}`;
  }
  return fallback.replace(/:bill$/i, "");
}

function latestSummaryText(
  payloads: readonly CongressSummariesResponse[],
): string | undefined {
  const summaries = payloads
    .flatMap((payload) => payload.summaries ?? [])
    .filter(
      (summary): summary is NonNullable<CongressSummariesResponse["summaries"]>[number] & { text: string } =>
        typeof summary.text === "string" && summary.text.length > 0,
    )
    .sort((a, b) => {
      const byActionDate = (a.actionDate ?? "").localeCompare(b.actionDate ?? "");
      if (byActionDate !== 0) return byActionDate;
      const byUpdateDate = (a.updateDate ?? "").localeCompare(b.updateDate ?? "");
      if (byUpdateDate !== 0) return byUpdateDate;
      const byVersion = (a.versionCode ?? "").localeCompare(b.versionCode ?? "");
      if (byVersion !== 0) return byVersion;
      return a.text.localeCompare(b.text);
    });
  return summaries.at(-1)?.text;
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

  const summary = latestSummaryText(bodies<CongressSummariesResponse>(bundle.summaries));

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
    objectId: canonicalBillObjectId(bill, bundle.bill.sourceObjectId),
    title: bill.title,
    introducedDate:
      typeof bill.introducedDate === "string" && bill.introducedDate.length > 0
        ? bill.introducedDate
        : undefined,
    sourceUpdatedAt: bill.updateDate,
    originChamber: bill.originChamber,
    actions,
    subjects,
    committees,
    actors,
    summary,
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
  const authoritativeIntroducedAt = bundle.introducedDate ?? introducedAt(actions);
  const introduced = Boolean(authoritativeIntroducedAt);
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
    introducedAt: authoritativeIntroducedAt ?? null,
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
    introducedAt: authoritativeIntroducedAt,
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
