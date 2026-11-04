import { createHash } from "node:crypto";
import {
  MEETING_QUALIFICATION_CAPABILITIES,
  MEETING_QUALIFICATION_REVISION,
  type MeetingQualificationResultR05,
  type MeetingQualificationState,
  type MeetingEvidenceProvider,
} from "./contracts.ts";

const own = (value: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const ref = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:/-]{2,127}$/.test(value);
const hexDigest = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const awareTime = (value: unknown): number | undefined => {
  if (typeof value !== "string" || !/(Z|[+-]\d{2}:\d{2})$/.test(value)) return undefined;
  const n = Date.parse(value);
  return Number.isFinite(n) ? n : undefined;
};

const INPUT_FIELDS = [
  "meetingRef", "principalRef", "purpose", "expectedEventUid",
  "expectedConferenceRecordRef", "expectedMeetingCodeDigest", "observation",
];
const OBS_FIELDS = [
  "provider", "capability", "status", "meetingRef", "sourceMeetingRef", "sourceRef",
  "observedAt", "transport", "paginationComplete", "ownerScopeReviewed", "metadata",
];
const META_FIELDS = [
  "organizerDomain", "start", "end", "eventUid", "calendarEventRef", "calendarStatus",
  "conferenceRecordRef", "meetingCodeDigest", "artifactRef", "artifactState", "fileRef", "mimeType",
];
const statuses = ["ok", "forbidden", "not_found", "error", "not_attempted"];
const scheduleProviders = new Set(["calendar", "gmail"]);
const requiredMetadata: Record<string, readonly string[]> = {
  "gmail:invitation.read": ["eventUid", "organizerDomain", "start", "end"],
  "calendar:event.read": ["calendarEventRef", "eventUid", "organizerDomain", "start", "end", "calendarStatus"],
  "meet:conference.list": ["conferenceRecordRef", "meetingCodeDigest"],
  "meet:recording.list": ["conferenceRecordRef", "meetingCodeDigest", "artifactRef", "artifactState"],
  "meet:transcript.list": ["conferenceRecordRef", "meetingCodeDigest", "artifactRef", "artifactState"],
  "drive:file_metadata.list": ["fileRef", "conferenceRecordRef", "mimeType"],
};
const base = (): MeetingQualificationResultR05 => ({
  revision: MEETING_QUALIFICATION_REVISION,
  status: "DENIED", reasonCodes: [], reviewRequirements: [], qualifyingEvidence: "none",
  providerAuthenticated: false, wardenAuthorizationVerified: false, bookingVerified: false,
  mediaVerified: false, mediaRead: false, calendarWritten: false,
  riverReceiptIssued: false, runtimeActivated: false,
});

/** The caller's data cannot prove provider authentication or Warden authorization. */
export function qualifyMeetingMetadataR05(input: unknown): MeetingQualificationResultR05 {
  const out = base();
  const hard: string[] = [];
  const hold: string[] = [];
  if (!record(input)) return { ...out, reasonCodes: ["INVALID_REQUEST_OBJECT"] };
  if (Object.keys(input).some((k) => !INPUT_FIELDS.includes(k))) hard.push("UNEXPECTED_REQUEST_FIELD");
  if (!ref(input.meetingRef) || !ref(input.principalRef)) hard.push("INVALID_MEETING_OR_PRINCIPAL_REF");
  if (!record(input.observation)) return { ...out, reasonCodes: [...hard, "INVALID_OBSERVATION_OBJECT"] };
  const obs = input.observation;
  if (Object.keys(obs).some((k) => !OBS_FIELDS.includes(k))) hard.push("UNEXPECTED_OBSERVATION_FIELD");
  if (!record(obs.metadata)) return { ...out, reasonCodes: [...hard, "INVALID_METADATA_OBJECT"] };
  const meta = obs.metadata;
  if (Object.keys(meta).some((k) => !META_FIELDS.includes(k))) hard.push("UNEXPECTED_METADATA_FIELD");
  const provider = typeof obs.provider === "string" ? obs.provider : "";
  const capability = typeof obs.capability === "string" ? obs.capability : "";
  if (!own(MEETING_QUALIFICATION_CAPABILITIES as unknown as Record<string, unknown>, provider)) {
    hard.push("UNKNOWN_PROVIDER");
  } else if (!(MEETING_QUALIFICATION_CAPABILITIES[provider as MeetingEvidenceProvider] as readonly string[]).includes(capability)) {
    hard.push("WRITE_OR_UNSUPPORTED_CAPABILITY");
  }
  if (obs.meetingRef !== input.meetingRef || obs.sourceMeetingRef !== input.meetingRef) {
    hard.push("CROSS_MEETING_CORRELATION");
  }
  if (!ref(obs.sourceRef)) hold.push("SOURCE_REFERENCE_REQUIRED");
  if (obs.transport !== "fixture_injected") hard.push("LIVE_TRANSPORT_FORBIDDEN");
  if (obs.paginationComplete !== true) hold.push("PAGINATION_INCOMPLETE");
  if (obs.ownerScopeReviewed !== true) hold.push("OWNER_SCOPE_UNREVIEWED");
  if (!statuses.includes(String(obs.status))) hard.push("INVALID_PROVIDER_STATUS");
  if (awareTime(obs.observedAt) === undefined) hard.push("INVALID_OBSERVATION_TIME");
  if (input.purpose !== (scheduleProviders.has(provider) ? "schedule_evidence" : "media_metadata_discovery")) {
    hard.push("PURPOSE_CAPABILITY_MISMATCH");
  }
  // Only metadata primitives; raw links, transcript bodies, media and credentials are denied.
  for (const value of Object.values(meta)) {
    if (typeof value !== "string" || value.length > 256) hard.push("UNBOUNDED_METADATA_VALUE");
  }
  if (obs.status === "ok") {
    const required = requiredMetadata[provider + ":" + capability] ?? [];
    for (const field of required) if (!meta[field]) hold.push("MISSING_" + field.toUpperCase());
    if (scheduleProviders.has(provider)) {
      const start = awareTime(meta.start);
      const end = awareTime(meta.end);
      if (start === undefined || end === undefined || end <= start) hard.push("INVALID_EVENT_TIME_WINDOW");
      if (typeof meta.organizerDomain !== "string" || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(meta.organizerDomain)) {
        hold.push("ORGANIZER_DOMAIN_REVIEW_REQUIRED");
      }
      if (!input.expectedEventUid) hold.push("TRUSTED_EVENT_UID_BINDING_REQUIRED");
      else if (input.expectedEventUid !== meta.eventUid) hard.push("EVENT_UID_MISMATCH");
      if (provider === "calendar" && !["confirmed", "tentative"].includes(String(meta.calendarStatus))) {
        hold.push("CALENDAR_EVENT_NOT_SCHEDULED");
      }
    } else {
      if (!ref(meta.conferenceRecordRef)) hard.push("INVALID_CONFERENCE_REFERENCE");
      if (!input.expectedConferenceRecordRef) hold.push("TRUSTED_CONFERENCE_BINDING_REQUIRED");
      else if (meta.conferenceRecordRef !== input.expectedConferenceRecordRef) hard.push("CONFERENCE_MISMATCH");
      if (provider === "meet") {
        if (!hexDigest(meta.meetingCodeDigest) || !input.expectedMeetingCodeDigest) hold.push("CODE_DIGEST_BINDING_REQUIRED");
        else if (meta.meetingCodeDigest !== input.expectedMeetingCodeDigest) hard.push("MEETING_CODE_DIGEST_MISMATCH");
        if (capability !== "conference.list") {
          const segment = capability === "recording.list" ? "/recordings/" : "/transcripts/";
          if (typeof meta.artifactRef !== "string" || !meta.artifactRef.startsWith(String(meta.conferenceRecordRef) + segment)) {
            hard.push("CROSS_CONFERENCE_ARTIFACT");
          }
          if (meta.artifactState !== "FILE_GENERATED") hold.push("ARTIFACT_NOT_READY");
        }
      }
    }
  }
  let status: MeetingQualificationState = "DENIED";
  if (hard.length > 0) status = "DENIED";
  else if (obs.status !== "ok") status = "UNRESOLVED";
  else if (hold.length > 0) status = "HOLD";
  else status = "LAB_METADATA_CANDIDATE";
  const reasons = [...new Set([...hard, ...hold])].sort();
  if (status === "UNRESOLVED") reasons.push("PROVIDER_RESULT_NOT_PROOF_OF_ABSENCE");
  return {
    ...out, status, reasonCodes: reasons,
    meetingRef: ref(input.meetingRef) ? input.meetingRef : undefined,
    provider, capability,
    sourceRefDigest: typeof obs.sourceRef === "string"
      ? createHash("sha256").update(obs.sourceRef, "utf8").digest("hex") : undefined,
    qualifyingEvidence: status === "LAB_METADATA_CANDIDATE" ? "synthetic_metadata_only" : "none",
    reviewRequirements: ["AUTHENTICATED_PROVIDER_READ", "WARDEN_GRANT",
      "OWNER_CONSENT_AND_SCOPE", "INDEPENDENT_WITNESS", "RIVER_RECEIPT_POLICY"],
  };
}
