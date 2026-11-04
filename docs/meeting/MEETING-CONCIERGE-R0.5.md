# SYN-MEETING-CONCIERGE-001 R0.5

Status: DRAFT / OFFLINE ONLY / NO PROVIDER I/O / NOT DEPLOYED.

## Intended ownership

- Specification: Believers-common-group/SynergyzeGovernance, HQ branch, pending governance acceptance.
- Runtime candidate: Believers-common-group/mcp-node-synnergyze, genesis branch.
- Meeting schema lineage: Believers-common-group/memory_preservation_envelope/systems/ri-ai-bot-maker/schema.md (Client Meeting, Consent Record, Evidence Event, Entity).
- Meeting Module owns a placeholder and scheduling lifecycle; a placeholder does not prove an external booking.
- Warden owns real authorization. This tool cannot assert policy ALLOW; it has no Warden client.
- RiverOS owns actual evidence receipts. This tool only emits synthetic metadata classifications and never a River receipt.

## Safeguards

The single tool synnergyzeMeetingQualifyMetadataR05 is hidden unless both:
1. The sandbox runtime sets VSR_MEETING_MCP_OFFLINE_QUALIFICATION=1.
2. The user-supplied allow-tools list explicitly names synnergyzeMeetingQualifyMetadataR05.

All-tools is insufficient. The tool never contacts Gmail, Calendar, Meet, Drive or a third-party endpoint, and cannot create calendar events, read audio, start recording, download transcripts, access private media storage or persist any state.

Input format: one object property named input, containing a MeetingQualificationRequestR05 in modules/meeting/contracts.ts. The qualifier rejects unexpected fields and permits only bounded provider metadata and immutable synthetic references.

Possible classification: DENIED, UNRESOLVED, HOLD, LAB_METADATA_CANDIDATE. Provider authenticated, Warden permission, booking verification, media verification, media read, calendar write, River receipt and runtime activation ALWAYS remain false.

A forbidden, not-found, error or not-attempted provider status never implies global absence of a recording. Original 3 November Unthinkable invitation proves scheduling notice only, not attendance or recorded media. The subsequent Unthinkable booking remains to be evidenced. No real meeting links, tokens or participants are committed to this branch.

## D0-D9 admission gates — all HOLD

D0 responsible owner; D1 canonical meeting identity; D2 DigitalMe principal and acting capacity; D3 read-only provider delegated scope; D4 purpose-bound Warden grant and recording consent; D5 trusted provider source and event UID; D6 media rights/retention/deletion; D7 independent witness; D8 River custody and actual receipts; D9 independent real-provider production acceptance.

## Verification

Existing Warden, QEL, Program/Event, RiverOS, SILK and Algolia behavior must remain intact. Test the pure qualifier, MCP dual-opt-in registration, and in-memory full server assembly. Negative cases must deny cross-meeting, wrong event UID, write capabilities, direct transport, untrusted raw media, missing timezone, cross-conference artifacts and incomplete pagination.

Suggested commands after dependency installation:
- npx vitest run modules/meeting/qualifier.test.ts
- npx vitest run src/tools/registerMeetingEvidenceQualification.test.ts
- npx vitest run src/commands/start-server.meeting.test.ts

No real provider integration, approval, deployment or CI success is represented by this draft.
