import { sha256CanonicalV1 } from "./canonical.ts";
import type { NormalizedLegislativeEventV1 } from "./contracts.ts";
import {
  LIFECYCLE_NORMALIZER_VERSION_V1,
  normalizeLegislativeLifecycleV1,
} from "./lifecycle.ts";
import type { CanonicalCongressBillBundle } from "./adapters/congress-gov/types.ts";

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
