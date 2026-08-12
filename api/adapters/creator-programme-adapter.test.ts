import { describe, expect, it } from "vitest";

import { runProgramEvent } from "../runtime/program-runner.js";
import type { ProgramExecutionGateway, RegistryResolutionBundle } from "../runtime/program-event-contract.js";
import { unresolvedGovernanceFields } from "./source-adapter-contract.js";
import {
  CREATOR_PROGRAMME_REF,
  adaptCreatorProgrammeEvent,
  applyCreatorProgrammeSandboxOverlay,
} from "./creator-programme-adapter.js";

const MASTER_SHA256 = "ae717423f1a2521c315cecaaf41685333474a8c8cbdedd75d1091f112598d400";
const IDEA_BANK_SHA256 = "25ae24a9fda43c29cc1a3b7c8a9b97c808847c0c1d6acbf372ebe27b1d92e7ff";

function eventOneSource() {
  return adaptCreatorProgrammeEvent({
    locator: {
      fileName: "VSR_Earthen_Empire_Creators_Programme_Master(1).xlsx",
      fileSha256: MASTER_SHA256,
      sheetName: "33 Event Programme",
      cellAddress: "A5:U5",
      sourceRow: 5,
      sourceSerial: 1,
    },
    sourceCalendar: {
      locator: {
        fileName: "tiktok_real_estate_content_calendar_33_days 2.xlsx",
        fileSha256: IDEA_BANK_SHA256,
        sheetName: "Content Calendar",
        cellAddress: "A2:F2",
        sourceRow: 2,
        sourceSerial: 1,
      },
      day: 1,
      contentTheme: "Listing of the Week",
      hook: "This house costs a fortune, and I still can’t believe this feature made the final cut.",
      caption: "$2M and this is the feature they’re leading with? #realestate #housetour #propertyreview",
      cta: "Would you pay for this?",
      status: "Idea",
    },
    eventId: "VSR-CC-PROP-EVT-001",
    day: 1,
    programmeAct: "ACT I - SEE THE PLACE",
    contentPillar: "PLACE & DESIGN",
    programmeRail: "MEDIA & PARTICIPATION RAIL",
    contentTheme: "Listing of the Week",
    openingHook: "This house costs a fortune, and I still can’t believe this feature made the final cut.",
    registryResolution: "R3 WHAT APPLIES - claim, licence and price context",
    sourceAssetId: "SRC-CAL-001-D01",
    evidenceRequirementText: "Registered place ID; permitted photos/video/plan; observation timestamp; material/condition source; factual boundary",
    rightsAuthorityGateText: "Contributor authority + source-media rights + property-claim scope + CCL acceptance + Warden authorization",
    creatorBrief: "Choose one registered property and explain one decisive feature. Separate observation, sourced fact and opinion.",
    ctaRequestRoute: "EXPLORE - open registered Property / Quantum Room",
    expectedEffectText: "Registered property or Quantum Room view opened",
    cclProfileRef: "CCL-PROP-STORY-001",
    wardenDecision: "PENDING",
    programmeState: "PLANNED",
  });
}

function governedEventOne() {
  return applyCreatorProgrammeSandboxOverlay(eventOneSource(), {
    creatorDigitalMeRef: "digitalme:sandbox:creator-001",
    actingCapacityRef: "role:sandbox:creator",
    placeRef: "place:sandbox:property-001",
    authorityRefs: ["authority:sandbox:creator-source-rights", "authority:sandbox:property-claim-scope"],
    evidenceRequirementRefs: [
      "requirement:sandbox:registered-place",
      "requirement:sandbox:permitted-source-media",
      "requirement:sandbox:factual-boundary-evidence",
    ],
    cclAcceptanceRef: "ccl-acceptance:sandbox:creator-001:event-001",
    ccreEnvelopeRef: "ccre:sandbox:creator-001:event-001",
    targetStateRef: "state:sandbox:property-room-view-opened",
    closureConditionRef: "closure:sandbox:verified-view-open-effect",
    r5CandidateRoute: "route:sandbox:open-property-quantum-room",
  });
}

function gatewayFor(item: ReturnType<typeof governedEventOne>) {
  const calls: string[] = [];
  const resolution: RegistryResolutionBundle = {
    requestRef: "registry-request:sandbox:creator-event-001",
    r1: "RESOLVED",
    r2: "RESOLVED",
    r3: "REQUIRES_AUTHORIZATION",
    r4: "RESOLVED",
    r5: "RESOLVED",
    candidateAction: item.r5CandidateRoute,
    unmetRequirementRefs: [],
    authorityRefs: item.event.authorityRefs,
    evidenceRequirementRefs: item.event.requirementRefs,
    expectedEffectRefs: [item.targetStateRef!],
    economicContextRefs: [],
  };

  const gateway: ProgramExecutionGateway = {
    async resolveR1ToR5() {
      calls.push("resolve");
      return resolution;
    },
    async authorize() {
      calls.push("authorize");
      return { decisionRef: "warden:sandbox:creator-event-001", outcome: "AUTHORIZED" };
    },
    async reserveEvidence() {
      calls.push("reserve");
      return { reservationRef: "river-reservation:sandbox:creator-event-001", status: "RESERVED" };
    },
    async executeCapability() {
      calls.push("execute");
      return { receiptRef: "connector-receipt:sandbox:creator-event-001" };
    },
    async confirmResult() {
      calls.push("confirm");
      return { confirmationRef: "confirmation:sandbox:creator-event-001", matched: true };
    },
    async sealEvidence() {
      calls.push("seal");
      return { evidenceRef: "river-evidence:sandbox:creator-event-001" };
    },
    async recordEffect() {
      calls.push("effect");
      return { effectRef: "effect:sandbox:creator-event-001" };
    },
    async recordEconomicConsequence() {
      calls.push("economic");
      return null;
    },
  };

  return { gateway, calls };
}

describe("P4 creator/property participation adapter", () => {
  it("preserves the primary master Event and the original 33-day source row separately", () => {
    const item = eventOneSource();

    expect(item.programmeRef).toBe(CREATOR_PROGRAMME_REF);
    expect(item.program.programRef).toBe(CREATOR_PROGRAMME_REF);
    expect(item.program.state).toBe("DRAFT");
    expect(item.event.eventDefinitionRef).toBe("VSR-CC-PROP-EVT-001");
    expect(item.source.locator.fileSha256).toBe(MASTER_SHA256);
    expect(item.source.locator.cellAddress).toBe("A5:U5");
    expect(item.sourceCalendar.locator.fileSha256).toBe(IDEA_BANK_SHA256);
    expect(item.sourceCalendar.locator.cellAddress).toBe("A2:F2");
    expect(item.source.sourceAuthorityStatus).toBe("WORKING_CONTEXT");
    expect(item.licenceEffectState).toBe("NOT_EFFECTIVE");
    expect(item.economicsState).toBe("NEEDS_POLICY");
    expect(unresolvedGovernanceFields(item)).toHaveLength(7);
  });

  it("keeps CTA content distinct from the governed R5 request route", () => {
    const item = eventOneSource();

    expect(item.ctaText).toBe("Would you pay for this?");
    expect(item.ctaRouteText).toBe("EXPLORE - open registered Property / Quantum Room");
    expect(item.r5CandidateRoute).toBe(item.ctaRouteText);
    expect(item.ctaText).not.toBe(item.r5CandidateRoute);
    expect(item.event.authorityRefs).toEqual([]);
    expect(item.program.economicRuleRefs).toEqual([]);
  });

  it("preserves the CCRE default denials for training, fine-tuning and distillation", () => {
    const item = eventOneSource();

    expect(item.computationPermissions.VIEW).toBe("ALLOW");
    expect(item.computationPermissions.RAG).toBe("CONDITIONAL");
    expect(item.computationPermissions.TRAIN).toBe("DENY");
    expect(item.computationPermissions.FINE_TUNE).toBe("DENY");
    expect(item.computationPermissions.DISTILL).toBe("DENY");
  });

  it("refuses a non-sandbox overlay so testing cannot imply real creator rights", () => {
    expect(() =>
      applyCreatorProgrammeSandboxOverlay(eventOneSource(), {
        creatorDigitalMeRef: "digitalme:creator-real",
        actingCapacityRef: "role:creator",
        placeRef: "place:property-real",
        authorityRefs: ["authority:creator-real"],
        evidenceRequirementRefs: ["requirement:evidence"],
        cclAcceptanceRef: "ccl-acceptance:real",
        ccreEnvelopeRef: "ccre:real",
        targetStateRef: "state:view-opened",
        closureConditionRef: "closure:verified",
        r5CandidateRoute: "route:open-property",
      }),
    ).toThrow("SANDBOX_DIGITALME_REQUIRED");
  });

  it("adds only synthetic rights/evidence refs without changing source evidence or TRAIN denial", () => {
    const source = eventOneSource();
    const governed = governedEventOne();

    expect(governed.source).toEqual(source.source);
    expect(governed.sourceCalendar).toEqual(source.sourceCalendar);
    expect(governed.licenceEffectState).toBe("EFFECTIVE_SANDBOX");
    expect(unresolvedGovernanceFields(governed)).toEqual([]);
    expect(governed.event.actorRef).toBe("digitalme:sandbox:creator-001");
    expect(governed.event.placeRef).toBe("place:sandbox:property-001");
    expect(governed.event.authorityRefs.every((ref) => ref.startsWith("authority:sandbox:"))).toBe(true);
    expect(governed.computationPermissions.TRAIN).toBe("DENY");
    expect(governed.economicsState).toBe("NEEDS_POLICY");
  });

  it("runs the sandbox participation request through Program/Event to evidence + Effect but no economics", async () => {
    const item = governedEventOne();
    const { gateway, calls } = gatewayFor(item);

    const result = await runProgramEvent(
      {
        program: item.program,
        event: item.event,
        correlationId: "corr:sandbox:creator-event-001",
        idempotencyKey: "idem:sandbox:creator-event-001",
      },
      gateway,
    );

    expect(result.state).toBe("EFFECT_RECORDED");
    expect(result.evidenceRef).toBe("river-evidence:sandbox:creator-event-001");
    expect(result.effectRef).toBe("effect:sandbox:creator-event-001");
    expect(result.economicConsequenceRef).toBeUndefined();
    expect(item.economicsState).toBe("NEEDS_POLICY");
    expect(calls).toEqual(["resolve", "authorize", "reserve", "execute", "confirm", "seal", "effect", "economic"]);
  });
});
