import { describe, expect, it } from "vitest";

import { runProgramEvent } from "../runtime/program-runner.js";
import type { ProgramExecutionGateway, RegistryResolutionBundle } from "../runtime/program-event-contract.js";
import { unresolvedGovernanceFields } from "./source-adapter-contract.js";
import {
  adaptReleaseTrainMilestone,
  applyReleaseTrainGovernanceOverlay,
  generateDateFromReleaseAnchor,
} from "./release-train-adapter.js";

const VERIFIED_SOURCE_SHA256 = "1bb907613dfbd185cf208df636c900f4f824420e0a3dc735084a67cdb61f6674";

function v49VettingSource() {
  return adaptReleaseTrainMilestone({
    locator: {
      fileName: "CLDR + ICU detailed schedule.xlsx",
      fileSha256: VERIFIED_SOURCE_SHA256,
      sheetName: "coordinated",
      cellAddress: "C269",
      sourceRow: 269,
      sourceColumn: "C",
    },
    stream: "CLDR",
    releaseVersion: "v49",
    sourceDate: "2026-06-17",
    milestoneText: "v49 Start Vetting",
    durationWeeks: 2.75,
    sourceRemainingWeeks: 20,
    anchor: {
      locator: {
        fileName: "CLDR + ICU detailed schedule.xlsx",
        fileSha256: VERIFIED_SOURCE_SHA256,
        sheetName: "coordinated",
        cellAddress: "C281",
        sourceRow: 281,
        sourceColumn: "C",
      },
      releaseVersion: "v49",
      releaseDate: "2026-10-21",
      rawValue: "v49 Release",
    },
  });
}

function governedV49Vetting() {
  return applyReleaseTrainGovernanceOverlay(v49VettingSource(), {
    ownerRoleRef: "role:sandbox:release-manager",
    authorityRefs: ["authority:sandbox:release-gate"],
    evidenceRequirementRefs: ["requirement:sandbox:vetting-evidence"],
    dependencyRefs: ["program-dependency:sandbox:submission-complete"],
    constraintRefs: ["constraint:sandbox:no-production-release"],
    targetStateRef: "state:sandbox:vetting-started",
    closureConditionRef: "closure:sandbox:vetting-gate-evidence-confirmed",
    r5CandidateRoute: "route:sandbox:start-vetting",
  });
}

function gatewayFor(item: ReturnType<typeof governedV49Vetting>) {
  const calls: string[] = [];
  const resolution: RegistryResolutionBundle = {
    requestRef: "registry-request:sandbox:v49-vetting",
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
      return { decisionRef: "warden:sandbox:v49-vetting", outcome: "AUTHORIZED" };
    },
    async reserveEvidence() {
      calls.push("reserve");
      return { reservationRef: "river-reservation:sandbox:v49-vetting", status: "RESERVED" };
    },
    async executeCapability() {
      calls.push("execute");
      return { receiptRef: "connector-receipt:sandbox:v49-vetting" };
    },
    async confirmResult() {
      calls.push("confirm");
      return { confirmationRef: "confirmation:sandbox:v49-vetting", matched: true };
    },
    async sealEvidence() {
      calls.push("seal");
      return { evidenceRef: "river-evidence:sandbox:v49-vetting" };
    },
    async recordEffect() {
      calls.push("effect");
      return { effectRef: "effect:sandbox:v49-vetting" };
    },
    async recordEconomicConsequence() {
      calls.push("economic");
      return null;
    },
  };

  return { gateway, calls };
}

describe("P4 release train / temporal engine adapter", () => {
  it("preserves the raw schedule milestone and derives -18 weeks from the release anchor", () => {
    const item = v49VettingSource();

    expect(item.source.locator.cellAddress).toBe("C269");
    expect(item.source.rawValue).toBe("v49 Start Vetting");
    expect(item.source.sourceAuthorityStatus).toBe("WORKING_CONTEXT");
    expect(item.program.programRef).toBe("program:release-train:cldr:v49");
    expect(item.relativeTemporal?.anchorDate).toBe("2026-10-21");
    expect(item.relativeTemporal?.sourceDate).toBe("2026-06-17");
    expect(item.relativeTemporal?.generatedDate).toBe("2026-06-17");
    expect(item.relativeTemporal?.offsetDaysFromAnchor).toBe(-126);
    expect(item.relativeTemporal?.offsetWeeksFromAnchor).toBe(-18);
    expect(item.relativeTemporal?.durationWeeks).toBe(2.75);
    expect(item.relativeTemporal?.sourceRemainingWeeks).toBe(20);
    expect(unresolvedGovernanceFields(item)).toHaveLength(7);
    expect(item.event.authorityRefs).toEqual([]);
  });

  it("generates the same milestone from a moved release anchor using the relative rule", () => {
    expect(generateDateFromReleaseAnchor("2026-10-21", -18)).toBe("2026-06-17");
    expect(generateDateFromReleaseAnchor("2026-10-28", -18)).toBe("2026-06-24");
  });

  it("keeps the source Remaining value separate from recomputed anchor-relative timing", () => {
    const item = v49VettingSource();

    expect(item.relativeTemporal?.sourceRemainingWeeks).toBe(20);
    expect(item.relativeTemporal?.offsetWeeksFromAnchor).toBe(-18);
    expect(item.relativeTemporal?.sourceRemainingWeeks).not.toBe(Math.abs(item.relativeTemporal!.offsetWeeksFromAnchor));
  });

  it("fails if a milestone is bound to the wrong release anchor version", () => {
    expect(() =>
      adaptReleaseTrainMilestone({
        locator: {
          fileName: "CLDR + ICU detailed schedule.xlsx",
          fileSha256: VERIFIED_SOURCE_SHA256,
          sheetName: "coordinated",
          cellAddress: "C269",
        },
        stream: "CLDR",
        releaseVersion: "v49",
        sourceDate: "2026-06-17",
        milestoneText: "v49 Start Vetting",
        anchor: {
          locator: {
            fileName: "CLDR + ICU detailed schedule.xlsx",
            fileSha256: VERIFIED_SOURCE_SHA256,
            sheetName: "coordinated",
            cellAddress: "C246",
          },
          releaseVersion: "v48",
          releaseDate: "2025-10-29",
          rawValue: "v48 Release",
        },
      }),
    ).toThrow("RELEASE_VERSION_ANCHOR_MISMATCH");
  });

  it("adds governance without promoting the schedule into authority", () => {
    const source = v49VettingSource();
    const governed = governedV49Vetting();

    expect(governed.source).toEqual(source.source);
    expect(unresolvedGovernanceFields(governed)).toEqual([]);
    expect(governed.event.actingCapacityRef).toBe("role:sandbox:release-manager");
    expect(governed.event.authorityRefs).toEqual(["authority:sandbox:release-gate"]);
    expect(governed.event.dependencyRefs).toEqual(["program-dependency:sandbox:submission-complete"]);
    expect(governed.source.rawValue).not.toBe(governed.event.authorityRefs[0]);
  });

  it("runs the governed release gate through Program/Event without creating economics", async () => {
    const item = governedV49Vetting();
    const { gateway, calls } = gatewayFor(item);

    const result = await runProgramEvent(
      {
        program: item.program,
        event: item.event,
        correlationId: "corr:sandbox:v49-vetting",
        idempotencyKey: "idem:sandbox:v49-vetting",
      },
      gateway,
    );

    expect(result.state).toBe("EFFECT_RECORDED");
    expect(result.evidenceRef).toBe("river-evidence:sandbox:v49-vetting");
    expect(result.effectRef).toBe("effect:sandbox:v49-vetting");
    expect(result.economicConsequenceRef).toBeUndefined();
    expect(calls).toEqual(["resolve", "authorize", "reserve", "execute", "confirm", "seal", "effect", "economic"]);
  });
});
