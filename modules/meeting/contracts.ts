/**
 * SYN-MEETING-CONCIERGE-001 R0.5 — OFFLINE METADATA QUALIFICATION ONLY.
 * This module does not authenticate providers, obtain Warden permission, issue River
 * receipts, read meeting media, or create/update calendar events.
 */
export const MEETING_QUALIFICATION_REVISION = "R0.5" as const;
export const MEETING_QUALIFICATION_CAPABILITIES = {
  gmail: ["invitation.read"],
  calendar: ["event.read"],
  meet: ["conference.list", "recording.list", "transcript.list"],
  drive: ["file_metadata.list"],
} as const;

export type MeetingEvidenceProvider = keyof typeof MEETING_QUALIFICATION_CAPABILITIES;
export type MeetingEvidencePurpose = "schedule_evidence" | "media_metadata_discovery";
export type ProviderObservationStatus = "ok" | "forbidden" | "not_found" | "error" | "not_attempted";
export type MeetingQualificationState = "DENIED" | "UNRESOLVED" | "HOLD" | "LAB_METADATA_CANDIDATE";

export interface MeetingMetadataObservationR05 {
  provider: MeetingEvidenceProvider;
  capability: string;
  status: ProviderObservationStatus;
  meetingRef: string;
  sourceMeetingRef: string;
  sourceRef: string;
  observedAt: string;
  transport: "fixture_injected";
  paginationComplete: boolean;
  ownerScopeReviewed: boolean;
  metadata: {
    organizerDomain?: string;
    start?: string;
    end?: string;
    eventUid?: string;
    calendarEventRef?: string;
    calendarStatus?: string;
    conferenceRecordRef?: string;
    meetingCodeDigest?: string;
    artifactRef?: string;
    artifactState?: string;
    fileRef?: string;
    mimeType?: string;
  };
}

export interface MeetingQualificationRequestR05 {
  meetingRef: string;
  principalRef: string;
  purpose: MeetingEvidencePurpose;
  expectedEventUid?: string;
  expectedConferenceRecordRef?: string;
  expectedMeetingCodeDigest?: string;
  observation: MeetingMetadataObservationR05;
}

export interface MeetingQualificationResultR05 {
  revision: typeof MEETING_QUALIFICATION_REVISION;
  status: MeetingQualificationState;
  reasonCodes: string[];
  reviewRequirements: string[];
  meetingRef?: string;
  provider?: string;
  capability?: string;
  sourceRefDigest?: string;
  qualifyingEvidence: "synthetic_metadata_only" | "none";
  providerAuthenticated: false;
  wardenAuthorizationVerified: false;
  bookingVerified: false;
  mediaVerified: false;
  mediaRead: false;
  calendarWritten: false;
  riverReceiptIssued: false;
  runtimeActivated: false;
}
