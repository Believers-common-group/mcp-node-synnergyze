import { describe, expect, it } from "vitest";
import { qualifyMeetingMetadataR05 } from "./qualifier.ts";

function booking() {
  return {
    meetingRef: "SYN-LAB-FOLLOWUP-001", principalRef: "DIGITALME-LAB-001",
    purpose: "schedule_evidence", expectedEventUid: "uid-001",
    observation: {
      provider: "calendar", capability: "event.read", status: "ok",
      meetingRef: "SYN-LAB-FOLLOWUP-001", sourceMeetingRef: "SYN-LAB-FOLLOWUP-001",
      sourceRef: "TEST-CALENDAR:001", observedAt: "2026-11-04T09:48:00+05:30",
      transport: "fixture_injected", paginationComplete: true, ownerScopeReviewed: true,
      metadata: {
        eventUid: "uid-001", calendarEventRef: "evt-001", organizerDomain: "lab.example",
        start: "2026-11-05T10:00:00+05:30", end: "2026-11-05T11:00:00+05:30",
        calendarStatus: "confirmed",
      },
    },
  };
}
function media() {
  return {
    meetingRef: "SYN-LAB-CALL-001", principalRef: "DIGITALME-LAB-001",
    purpose: "media_metadata_discovery",
    expectedConferenceRecordRef: "conferenceRecords/lab001",
    expectedMeetingCodeDigest: "a".repeat(64),
    observation: {
      provider: "meet", capability: "recording.list", status: "ok",
      meetingRef: "SYN-LAB-CALL-001", sourceMeetingRef: "SYN-LAB-CALL-001",
      sourceRef: "TEST-MEET:001", observedAt: "2026-11-04T09:48:00+05:30",
      transport: "fixture_injected", paginationComplete: true, ownerScopeReviewed: true,
      metadata: {
        conferenceRecordRef: "conferenceRecords/lab001", meetingCodeDigest: "a".repeat(64),
        artifactRef: "conferenceRecords/lab001/recordings/rec001", artifactState: "FILE_GENERATED",
      },
    },
  };
}
describe("SYN-MEETING-CONCIERGE-001 R0.5 offline qualification", () => {
  it("keeps booking and Warden false for synthetic positive metadata", () => {
    const r = qualifyMeetingMetadataR05(booking());
    expect(r.status).toBe("LAB_METADATA_CANDIDATE");
    expect(r.bookingVerified).toBe(false);
    expect(r.wardenAuthorizationVerified).toBe(false);
    expect(r.providerAuthenticated).toBe(false);
    expect(r.riverReceiptIssued).toBe(false);
  });
  it("never treats synthetic recording metadata as audio access", () => {
    const r = qualifyMeetingMetadataR05(media());
    expect(r.status).toBe("LAB_METADATA_CANDIDATE");
    expect(r.mediaRead).toBe(false);
    expect(r.mediaVerified).toBe(false);
  });
  it.each(["forbidden", "not_found", "error", "not_attempted"])(
    "%s is unresolved, not evidence of absence",
    (status) => {
      const x = booking(); x.observation.status = status;
      const r = qualifyMeetingMetadataR05(x);
      expect(r.status).toBe("UNRESOLVED");
      expect(r.reasonCodes).toContain("PROVIDER_RESULT_NOT_PROOF_OF_ABSENCE");
    },
  );
  it("denies wrong meeting identity", () => {
    const x = booking(); x.observation.sourceMeetingRef = "OTHER-MEETING";
    expect(qualifyMeetingMetadataR05(x).reasonCodes).toContain("CROSS_MEETING_CORRELATION");
  });
  it("denies wrong event UID", () => {
    const x = booking(); x.expectedEventUid = "other-uid";
    expect(qualifyMeetingMetadataR05(x).reasonCodes).toContain("EVENT_UID_MISMATCH");
  });
  it("denies calendar write tools", () => {
    const x = booking(); x.observation.capability = "event.write";
    expect(qualifyMeetingMetadataR05(x).reasonCodes).toContain("WRITE_OR_UNSUPPORTED_CAPABILITY");
  });
  it("denies a live transport claim", () => {
    const x = booking(); x.observation.transport = "live";
    expect(qualifyMeetingMetadataR05(x).reasonCodes).toContain("LIVE_TRANSPORT_FORBIDDEN");
  });
  it("denies raw media and does not echo its contents", () => {
    const x = media();
    const withUntrustedMedia = {
      ...x,
      observation: {
        ...x.observation,
        metadata: { ...x.observation.metadata, audio: "PRIVATE_AUDIO_MATERIAL" },
      },
    };
    const result = qualifyMeetingMetadataR05(withUntrustedMedia);
    expect(result.reasonCodes).toContain("UNEXPECTED_METADATA_FIELD");
    expect(JSON.stringify(result)).not.toContain("PRIVATE_AUDIO_MATERIAL");
  });
  it("denies offset-free meeting times", () => {
    const x = booking(); x.observation.metadata.start = "2026-11-05T10:00:00";
    expect(qualifyMeetingMetadataR05(x).reasonCodes).toContain("INVALID_EVENT_TIME_WINDOW");
  });
  it("holds for incomplete pagination", () => {
    const x = booking(); x.observation.paginationComplete = false;
    expect(qualifyMeetingMetadataR05(x).status).toBe("HOLD");
  });
  it("denies artifacts from a different conference", () => {
    const x = media(); x.observation.metadata.artifactRef = "conferenceRecords/other/recordings/rec001";
    expect(qualifyMeetingMetadataR05(x).reasonCodes).toContain("CROSS_CONFERENCE_ARTIFACT");
  });
  it("denies a mismatched conference pin", () => {
    const x = media(); x.expectedConferenceRecordRef = "conferenceRecords/other";
    expect(qualifyMeetingMetadataR05(x).reasonCodes).toContain("CONFERENCE_MISMATCH");
  });
  it("holds for an incomplete recording", () => {
    const x = media(); x.observation.metadata.artifactState = "STARTED";
    expect(qualifyMeetingMetadataR05(x).reasonCodes).toContain("ARTIFACT_NOT_READY");
  });
  it("fails closed for absent input", () => {
    expect(qualifyMeetingMetadataR05(null).status).toBe("DENIED");
    expect(qualifyMeetingMetadataR05({}).status).toBe("DENIED");
  });
  it("does not echo provider metadata values", () => {
    const result = qualifyMeetingMetadataR05(booking());
    expect(JSON.stringify(result)).not.toContain("lab.example");
    expect(JSON.stringify(result)).not.toContain("TEST-CALENDAR:001");
    expect(result.sourceRefDigest).toMatch(/^[a-f0-9]{64}$/);
  });
  it("does not reflect untrusted provider or unsupported capability strings", () => {
    const probe = "SECRET_SENTINEL_NO_ECHO_001";
    const unknownProvider = booking();
    const rejectedProvider = qualifyMeetingMetadataR05({
      ...unknownProvider,
      observation: { ...unknownProvider.observation, provider: probe },
    });
    expect(rejectedProvider.status).toBe("DENIED");
    expect(rejectedProvider.reasonCodes).toContain("UNKNOWN_PROVIDER");
    expect(JSON.stringify(rejectedProvider)).not.toContain(probe);

    const rejectedCapability = qualifyMeetingMetadataR05({
      ...unknownProvider,
      observation: { ...unknownProvider.observation, capability: probe },
    });
    expect(rejectedCapability.status).toBe("DENIED");
    expect(rejectedCapability.reasonCodes).toContain("WRITE_OR_UNSUPPORTED_CAPABILITY");
    expect(JSON.stringify(rejectedCapability)).not.toContain(probe);
  });

  it("never hashes or reflects unbounded source references", () => {
    const source = "S".repeat(8192);
    const x = booking();
    const r = qualifyMeetingMetadataR05({
      ...x,
      observation: { ...x.observation, sourceRef: source },
    });
    expect(r.status).toBe("HOLD");
    expect(r.reasonCodes).toContain("SOURCE_REFERENCE_REQUIRED");
    expect(r.sourceRefDigest).toBeUndefined();
    expect(JSON.stringify(r)).not.toContain(source);
  });

});
