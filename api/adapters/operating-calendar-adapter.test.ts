import { describe, expect, it } from "vitest";

import { runProgramEvent } from "../runtime/program-runner.js";
import type { ProgramExecutionGateway, RegistryResolutionBundle } from "../runtime/program-event-contract.js";
import { unresolvedGovernanceFields } from "./source-adapter-contract.js";
import {
  adaptOperatingCalendarCell,
  applyOperatingCalendarGovernanceOverlay,
} from "./operating-calendar-adapter.js";

const VERIFIED_SOURCE_SHA256 = "aeb9591000158f8e078a7970d9476c945caf614b243f6acd2a3a76b1d19315a4";

function januaryRetailSource() {
  return adaptOperatingCalendarCell({
    locator: {
      fileName: "2023  Calendar - Main Sheet Planning.xlsx",
      fileSha256: VERIFIED_SOURCE_SHA256,
      sheetName: "Main Sheet",
      cellAddress: "C3",
      sourceRow: 3,
      sourceColumn: "C",
      sourceSerial: 1,
    },
    calendarYear: 2023,
    monthLabel: "January",
    serial: 1,
    workstreamHeader: "Retail Planning Task List",
    taskText: "Base stock Working ",
  });
}

function governedJanuaryRetail() {
  return applyOperatingCalendarGovernanceOverlay(januaryRetailSource(), {
    ownerRoleRef: "role:sandbox:retail-planning-owner",
    authorityRefs: ["authority:sandbox:calendar-work-item"],
    evidenceRequirementRefs: ["requirement:sandbox:completion-evidence"],
    dependencyRefs: [],
    constraintRefs: ["constraint:sandbox:non-production"],
    targetStateRef: "state:sandbox:base-stock-working-verified",
    closureConditionRef: "closure:sandbox:completion-confirmed-with-evidence",
    r5CandidateRoute: "route:sandbox:retail-planning-work-item",
  });
}

function sandboxGateway(item: ReturnType<typeof governedJanuaryRetail>) {
  const calls: string[] = [];
  const resolution: RegistryResolutionBundle = {
    requestRef: "registry-request:sandbox:calendar-001",
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
      return { decisionRef: "warden:sandbox:calendar-001", outcome: "AUTHORIZED" };
    },
    async reserveEvidence() {
      calls.push("reserve");
      return { reservationRef: "river-reservation:sandbox:calendar-001", status: "RESERVED" };
    },
    async executeCapability() {
      calls.push("execute");
      return { receiptRef: "connector-receipt:sandbox:calendar-001" };
    },
    async confirmResult() {
      calls.push("confirm");
      return { confirmationRef: "confirmation:sandbox:calendar-001", matched: true };
    },
    async sealEvidence() {
      calls.push("seal");
      return { evidenceRef: "river-evidence:sandbox:calendar-001" };
    },
    async recordEffect() {
      calls.push("effect");
      return { effectRef: "effect:sandbox:calendar-001" };
    },
    async recordEconomicConsequence() {
      calls.push("economic");
      return null;
    },
  };

  return { gateway, calls };
}

describe("P4 annual operating calendar adapter", () => {
  it("preserves the verified workbook cell as WORKING_CONTEXT with governance unresolved", () => {
    const item = januaryRetailSource();

    expect(item.source.locator.fileName).toBe("2023  Calendar - Main Sheet Planning.xlsx");
    expect(item.source.locator.fileSha256).toBe(VERIFIED_SOURCE_SHA256);
    expect(item.source.locator.sheetName).toBe("Main Sheet");
    expect(item.source.locator.cellAddress).toBe("C3");
    expect(item.source.rawValue).toBe("Base stock Working");
    expect(item.source.sourceAuthorityStatus).toBe("WORKING_CONTEXT");
    expect(item.program.programRef).toBe("program:annual-operating-calendar:2023");
    expect(item.event.eventDefinitionRef).toBe("event-def:annual-calendar:2023:01:1:retail-planning");
    expect(item.workstreamRef).toBe("workstream:retail-planning");
    expect(item.temporal?.cycleRef).toBe("program-cycle:2023:01");
    expect(unresolvedGovernanceFields(item)).toEqual([
      "owner_role_ref",
      "authority_refs",
      "dependency_refs",
      "evidence_requirement_refs",
      "target_state_ref",
      "closure_condition_ref",
      "r5_candidate_route",
    ]);
    expect(item.program.authorityRefs).toEqual([]);
    expect(item.event.authorityRefs).toEqual([]);
  });

  it("adds sandbox governance as an overlay without changing source evidence", () => {
    const source = januaryRetailSource();
    const governed = governedJanuaryRetail();

    expect(governed.source).toEqual(source.source);
    expect(governed.lifecycleState).toBe("READY_FOR_RUNTIME");
    expect(unresolvedGovernanceFields(governed)).toEqual([]);
    expect(governed.ownerRoleRef).toBe("role:sandbox:retail-planning-owner");
    expect(governed.event.actingCapacityRef).toBe("role:sandbox:retail-planning-owner");
    expect(governed.event.authorityRefs).toEqual(["authority:sandbox:calendar-work-item"]);
    expect(governed.event.requirementRefs).toEqual(["requirement:sandbox:completion-evidence"]);
    expect(governed.source.rawValue).not.toBe(governed.event.authorityRefs[0]);
  });

  it("fails governance overlay when authority is missing", () => {
    expect(() =>
      applyOperatingCalendarGovernanceOverlay(januaryRetailSource(), {
        ownerRoleRef: "role:sandbox:retail-planning-owner",
        authorityRefs: [],
        evidenceRequirementRefs: ["requirement:sandbox:completion-evidence"],
        targetStateRef: "state:sandbox:verified",
        closureConditionRef: "closure:sandbox:evidence-confirmed",
        r5CandidateRoute: "route:sandbox:retail-planning-work-item",
      }),
    ).toThrow("AUTHORITY_REQUIRED");
  });

  it("rejects blank spreadsheet cells instead of manufacturing Events", () => {
    expect(() =>
      adaptOperatingCalendarCell({
        locator: {
          fileName: "2023  Calendar - Main Sheet Planning.xlsx",
          fileSha256: VERIFIED_SOURCE_SHA256,
          sheetName: "Main Sheet",
          cellAddress: "K3",
        },
        calendarYear: 2023,
        monthLabel: "January",
        serial: 1,
        workstreamHeader: "Projects & Store design Task List",
        taskText: "  ",
      }),
    ).toThrow("EMPTY_CALENDAR_TASK");
  });

  it("exercises the verified source instance through the governed Program/Event runtime", async () => {
    const item = governedJanuaryRetail();
    const { gateway, calls } = sandboxGateway(item);

    const result = await runProgramEvent(
      {
        program: item.program,
        event: item.event,
        correlationId: "corr:sandbox:calendar-001",
        idempotencyKey: "idem:sandbox:calendar-001",
      },
      gateway,
    );

    expect(result.state).toBe("EFFECT_RECORDED");
    expect(result.eventState).toBe("EFFECT_RECORDED");
    expect(result.evidenceRef).toBe("river-evidence:sandbox:calendar-001");
    expect(result.effectRef).toBe("effect:sandbox:calendar-001");
    expect(result.economicConsequenceRef).toBeUndefined();
    expect(calls).toEqual(["resolve", "authorize", "reserve", "execute", "confirm", "seal", "effect", "economic"]);
  });
});
